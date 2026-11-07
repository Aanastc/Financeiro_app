import { inserirMovimentacoes } from "./finance.service";
import { supabase } from "./supabase";
import { buscarTodasPaginas } from "./paginacao";
import { dataLocalISO } from "../utils/datas";

/**
 * Recebimentos de despesas divididas ("a Julia me pagou R$ 89,79 por Pix").
 *
 * Um recebimento é UMA transação RECEITA na conta onde o dinheiro caiu
 * (conta como entrada) + a movimentação de entrada,
 * e é distribuído nos itens em aberto da pessoa, dos mais antigos para os mais
 * novos. Cada item guarda no JSON de observação qual recebimento o pagou.
 *
 * Na importação do extrato, conciliarPixRecebido evita lançamento em dobro:
 *   - recebimento já registrado à mão (mesma conta, valor, ±5 dias) → só reconhece;
 *   - não registrado e a pessoa tem itens em aberto → registra e abate.
 */

const MARCA = "acerto_divisao";
const DIAS_TOLERANCIA = 5;

const lerMeta = (obs?: string | null): Record<string, any> => {
  const t = (obs || "").trim();
  if (!t.startsWith("{")) return t ? { observacao_original: t } : {};
  try {
    return JSON.parse(t);
  } catch {
    return { observacao_original: t };
  }
};

const centavos = (v: number) => Math.round(v * 100) / 100;

const normalizar = (t?: string | null) =>
  (t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return dataLocalISO(d);
};

const PALAVRAS_IGNORADAS = new Set(["de", "da", "do", "das", "dos", "e"]);

/**
 * Contato citado na descrição do extrato. Exige nome e sobrenome (ou o nome
 * inteiro quando ele tem uma palavra só e é único) para não confundir pessoas.
 */
export function contatoNaDescricao<T extends { id: string; nome: string }>(descricao: string, contatos: T[]): T | null {
  const desc = ` ${normalizar(descricao)} `;
  const candidatos = contatos
    .map((c) => {
      const partes = normalizar(c.nome).split(" ").filter((p) => p && !PALAVRAS_IGNORADAS.has(p));
      if (partes.length === 0) return null;
      const bate = partes.filter((p) => desc.includes(` ${p} `)).length;
      const ok = partes.length === 1 ? bate === 1 : bate >= 2 && desc.includes(` ${partes[0]} `);
      return ok ? { c, bate } : null;
    })
    .filter(Boolean) as { c: T; bate: number }[];
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => b.bate - a.bate);
  if (candidatos.length > 1 && candidatos[0].bate === candidatos[1].bate) return null; // ambíguo
  return candidatos[0].c;
}

export interface ResultadoRecebimento {
  transacaoId: string;
  aplicado: number;
  sobra: number;
  itensAtualizados: number;
}

export const recebimentosDivisaoService = {
  /** Itens que a pessoa ainda deve (lançados como "terceiro"), mais antigos primeiro. */
  async itensEmAberto(usuarioId: string, contatoId: string, idsPermitidos?: string[]) {
    const linhas = await buscarTodasPaginas<any>((de, ate) =>
      supabase
        .from("transacoes")
        .select("id, data, valor, observacao, terceiro_pago")
        .eq("usuario_id", usuarioId)
        .eq("contato_id", contatoId)
        .eq("terceiro", true)
        .eq("terceiro_pago", false)
        .order("data", { ascending: true })
        .order("id")
        .range(de, ate),
    );
    return linhas
      .filter((t) => !idsPermitidos || idsPermitidos.includes(t.id))
      .map((t) => {
        const meta = lerMeta(t.observacao);
        const pago = Number(meta.valor_pago) || 0;
        return { ...t, meta, aberto: centavos(Math.max(0, Number(t.valor) - pago)) };
      })
      .filter((t) => t.aberto > 0 && t.meta.resposta_cobranca !== "recusada");
  },

  /** Recebimento parecido já lançado (ex.: veio do extrato), para avisar antes de registrar de novo. */
  async recebimentoParecido(usuarioId: string, p: { contatoId: string; contaId: string; valor: number; data: string }) {
    const { data } = await supabase
      .from("transacoes")
      .select("id, data, valor, descricao")
      .eq("usuario_id", usuarioId)
      .eq("tipo", "RECEITA")
      .eq("conta_id", p.contaId)
      .eq("contato_id", p.contatoId)
      .eq("valor", centavos(p.valor))
      .gte("data", somarDias(p.data, -DIAS_TOLERANCIA))
      .lte("data", somarDias(p.data, DIAS_TOLERANCIA))
      .ilike("observacao", `%${MARCA}%`)
      .limit(1);
    return (data || [])[0] || null;
  },

  /** Total vencido até a data (para sugerir "o que já venceu"). */
  async totaisEmAberto(usuarioId: string, contatoId: string, ate: string) {
    const itens = await this.itensEmAberto(usuarioId, contatoId);
    return {
      total: centavos(itens.reduce((s, i) => s + i.aberto, 0)),
      vencido: centavos(itens.filter((i) => i.data <= ate).reduce((s, i) => s + i.aberto, 0)),
      proximo: itens.find((i) => i.data > ate)?.data || null,
    };
  },

  async totalEmAberto(usuarioId: string, contatoId: string) {
    const itens = await this.itensEmAberto(usuarioId, contatoId);
    return centavos(itens.reduce((s, i) => s + i.aberto, 0));
  },

  /**
   * Registra o dinheiro recebido na conta e abate dos itens em aberto.
   * `itemIds` restringe a quais itens o valor vai (ex.: pagamento de um item só).
   */
  async registrarRecebimento(
    usuarioId: string,
    p: {
      contatoId: string;
      contatoNome: string;
      valor: number;
      data: string;
      contaId: string;
      origem: "manual" | "extrato";
      descricao?: string;
      documentoImportadoId?: string | null;
      itemIds?: string[];
    },
  ): Promise<ResultadoRecebimento> {
    const valor = centavos(p.valor);
    if (!(valor > 0)) throw new Error("Valor do recebimento inválido.");
    if (!p.contaId) throw new Error("Informe a conta em que o dinheiro entrou.");

    const { data: tx, error } = await supabase
      .from("transacoes")
      .insert([
        {
          usuario_id: usuarioId,
          tipo: "RECEITA",
          descricao: p.descricao || `Recebido de ${p.contatoNome} (divisão de contas)`,
          valor,
          data: p.data,
          conta_id: p.contaId,
          contato_id: p.contatoId,
          considerar_soma: true, // dinheiro que entrou na conta: conta como entrada
          status: "confirmada",
          documento_importado_id: p.documentoImportadoId || null,
          observacao: JSON.stringify({ [MARCA]: true, origem: p.origem, contato_id: p.contatoId, contato_nome: p.contatoNome }),
        },
      ])
      .select("id")
      .single();
    if (error) throw error;

    const { error: errMov } = await inserirMovimentacoes([
      { usuario_id: usuarioId, transacao_id: tx.id, conta_id: p.contaId, tipo: "ENTRADA", valor, data: p.data },
    ]);
    if (errMov) throw errMov;

    const distribuicao = await this.distribuir(usuarioId, tx.id, p.contatoId, valor, p.data, p.contaId, p.itemIds);
    return { transacaoId: tx.id, ...distribuicao };
  },

  /** Abate `valor` dos itens em aberto (mais antigos primeiro). */
  async distribuir(
    usuarioId: string,
    recebimentoId: string,
    contatoId: string,
    valor: number,
    data: string,
    contaId: string,
    itemIds?: string[],
  ) {
    const itens = await this.itensEmAberto(usuarioId, contatoId, itemIds);
    let resta = centavos(valor);
    let itensAtualizados = 0;
    for (const item of itens) {
      if (resta <= 0) break;
      const usar = centavos(Math.min(resta, item.aberto));
      const pagoAntes = Number(item.meta.valor_pago) || 0;
      const valorPago = centavos(pagoAntes + usar);
      const quitado = valorPago >= Number(item.valor) - 0.005;
      const meta = {
        ...item.meta,
        pagamentos: [
          ...(Array.isArray(item.meta.pagamentos) ? item.meta.pagamentos : []),
          { valor: usar, data, conta_id: contaId, recebimento_id: recebimentoId },
        ],
        valor_pago: valorPago,
        data_pagamento: data,
        total: quitado,
      };
      const { error } = await supabase
        .from("transacoes")
        .update({ terceiro_pago: quitado, observacao: JSON.stringify(meta) })
        .eq("id", item.id)
        .eq("usuario_id", usuarioId);
      if (error) throw error;
      resta = centavos(resta - usar);
      itensAtualizados++;
    }
    return { aplicado: centavos(valor - resta), sobra: resta, itensAtualizados };
  },

  /**
   * Cruza os saldos com a mesma pessoa (como o Splitwise): o que ela te deve
   * abate o que você deve a ela, dos vencimentos mais antigos para os mais novos.
   * Nenhum dinheiro passa por conta: os dois lados recebem um pagamento do tipo
   * "compensacao" com o mesmo compensacao_id (para poder desfazer junto).
   * Ficam de fora: cobranças opcionais ainda sem resposta e itens em que a
   * pessoa desfez um abatimento (sem_compensacao).
   */
  async compensarSaldos(usuarioId: string, contatoId: string, data: string): Promise<{ valor: number; itens: number }> {
    const podeCompensar = (meta: Record<string, any>) =>
      !meta.sem_compensacao && meta.resposta_cobranca !== "recusada" && !(meta.opcional && meta.resposta_cobranca !== "aceita");

    const teDeve = (await this.itensEmAberto(usuarioId, contatoId)).filter((i) => podeCompensar(i.meta));
    if (teDeve.length === 0) return { valor: 0, itens: 0 };

    const linhasDevo = await buscarTodasPaginas<any>((de, ate) =>
      supabase
        .from("transacoes")
        .select("id, data, valor, observacao, terceiro_pago")
        .eq("usuario_id", usuarioId)
        .eq("terceiro", false)
        .eq("terceiro_pago", false)
        .ilike("observacao", `%${contatoId}%`)
        .order("data", { ascending: true })
        .order("id")
        .range(de, ate),
    );
    const devo = linhasDevo
      .map((t) => {
        const meta = lerMeta(t.observacao);
        return { ...t, meta, aberto: centavos(Math.max(0, Number(t.valor) - (Number(meta.valor_pago) || 0))) };
      })
      .filter((t) => t.meta.parceria_credor_id === contatoId && t.aberto > 0 && podeCompensar(t.meta));
    if (devo.length === 0) return { valor: 0, itens: 0 };

    const compensacaoId =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `comp_${Date.now()}`;
    const alterados = new Map<string, { t: any; usado: number; com: string[] }>();
    const marcar = (t: any, usar: number, outro: string) => {
      const a = alterados.get(t.id) || { t, usado: 0, com: [] };
      a.usado = centavos(a.usado + usar);
      a.com.push(outro);
      alterados.set(t.id, a);
    };

    let i = 0;
    let j = 0;
    let total = 0;
    while (i < teDeve.length && j < devo.length) {
      const a = teDeve[i];
      const b = devo[j];
      const usar = centavos(Math.min(a.aberto, b.aberto));
      if (usar > 0) {
        marcar(a, usar, b.id);
        marcar(b, usar, a.id);
        a.aberto = centavos(a.aberto - usar);
        b.aberto = centavos(b.aberto - usar);
        total = centavos(total + usar);
      }
      if (a.aberto <= 0) i++;
      if (b.aberto <= 0) j++;
    }

    for (const { t, usado, com } of alterados.values()) {
      const pagoAntes = Number(t.meta.valor_pago) || 0;
      const valorPago = centavos(pagoAntes + usado);
      const quitado = valorPago >= Number(t.valor) - 0.005;
      const meta = {
        ...t.meta,
        pagamentos: [
          ...(Array.isArray(t.meta.pagamentos) ? t.meta.pagamentos : []),
          { valor: usado, data, tipo: "compensacao", descricao: "Abatido do saldo com a mesma pessoa", compensacao_id: compensacaoId, com },
        ],
        valor_pago: valorPago,
        data_pagamento: data,
        total: quitado,
      };
      const { error } = await supabase
        .from("transacoes")
        .update({ terceiro_pago: quitado, observacao: JSON.stringify(meta) })
        .eq("id", t.id)
        .eq("usuario_id", usuarioId);
      if (error) throw error;
    }
    return { valor: total, itens: alterados.size };
  },

  /**
   * Desfaz um abatimento nos dois lados e marca os itens para não serem
   * abatidos de novo automaticamente.
   */
  async desfazerCompensacao(usuarioId: string, compensacaoId: string) {
    const { data } = await supabase
      .from("transacoes")
      .select("id, valor, observacao")
      .eq("usuario_id", usuarioId)
      .ilike("observacao", `%${compensacaoId}%`);
    for (const t of data || []) {
      const meta = lerMeta(t.observacao);
      const pagamentos = (Array.isArray(meta.pagamentos) ? meta.pagamentos : []).filter((p: any) => p.compensacao_id !== compensacaoId);
      const valorPago = centavos(pagamentos.reduce((s: number, p: any) => s + (Number(p.valor) || 0), 0));
      const quitado = valorPago >= Number(t.valor) - 0.005 && valorPago > 0;
      const novo: Record<string, any> = { ...meta, pagamentos, valor_pago: valorPago, total: quitado, sem_compensacao: true };
      if (pagamentos.length === 0) {
        delete novo.pagamentos;
        delete novo.valor_pago;
        delete novo.data_pagamento;
        delete novo.total;
      }
      await supabase
        .from("transacoes")
        .update({ terceiro_pago: quitado, observacao: JSON.stringify(novo) })
        .eq("id", t.id)
        .eq("usuario_id", usuarioId);
    }
  },

  /**
   * Linha "Pix recebido" do extrato. Devolve:
   *   "reconhecido" → já havia recebimento registrado à mão (não lança de novo);
   *   "abatido"     → lançado e abatido da dívida da pessoa;
   *   null          → não é de ninguém que te deve (segue a importação normal).
   */
  async conciliarPixRecebido(
    usuarioId: string,
    t: { descricao: string; valor: number; data: string; contaId: string; documentoImportadoId?: string | null },
    cache?: { contatos?: { id: string; nome: string }[] },
  ): Promise<{ resultado: "reconhecido" | "abatido"; contatoNome: string } | null> {
    const contatos =
      cache?.contatos ||
      ((await supabase.from("contatos").select("id, nome").eq("usuario_id", usuarioId)).data as any[]) ||
      [];
    const contato = contatoNaDescricao(t.descricao || "", contatos);
    if (!contato) return null;
    const valor = centavos(Number(t.valor));

    // 1) Já registrado à mão? (mesma conta e valor, data próxima, ainda não conciliado)
    const { data: candidatos } = await supabase
      .from("transacoes")
      .select("id, observacao")
      .eq("usuario_id", usuarioId)
      .eq("tipo", "RECEITA")
      .eq("conta_id", t.contaId)
      .eq("contato_id", contato.id)
      .eq("valor", valor)
      .gte("data", somarDias(t.data, -DIAS_TOLERANCIA))
      .lte("data", somarDias(t.data, DIAS_TOLERANCIA))
      .ilike("observacao", `%${MARCA}%`);
    const manual = (candidatos || []).find((c: any) => {
      const m = lerMeta(c.observacao);
      return m.origem === "manual" && !m.conciliado_extrato;
    });
    if (manual) {
      const m = lerMeta(manual.observacao);
      await supabase
        .from("transacoes")
        .update({
          observacao: JSON.stringify({ ...m, conciliado_extrato: true, documento_extrato_id: t.documentoImportadoId || null }),
        })
        .eq("id", manual.id)
        .eq("usuario_id", usuarioId);
      return { resultado: "reconhecido", contatoNome: contato.nome };
    }

    // 2) A pessoa te deve algo? Lança e abate.
    const aberto = await this.totalEmAberto(usuarioId, contato.id);
    if (aberto <= 0) return null;
    await this.registrarRecebimento(usuarioId, {
      contatoId: contato.id,
      contatoNome: contato.nome,
      valor,
      data: t.data,
      contaId: t.contaId,
      origem: "extrato",
      descricao: t.descricao,
      documentoImportadoId: t.documentoImportadoId,
    });
    return { resultado: "abatido", contatoNome: contato.nome };
  },
};
