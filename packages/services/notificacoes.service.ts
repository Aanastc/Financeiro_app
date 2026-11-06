import { supabase } from "./supabase";

/**
 * Notificações do sino (topo do app).
 *
 * 1. Avisos gravados (tabela notificacoes — SQL seção 8): convite aceito, divisão
 *    nova, cobrança opcional respondida, "já paguei", Pix reconhecido no extrato.
 *    Avisos para OUTRA pessoa só nascem de funções do banco que conferem o vínculo.
 * 2. Lembretes de vencimento: calculados na hora (faturas, parcelas de dívida,
 *    cobranças a receber e contas a pagar). Não ficam no banco; "lido" vale só
 *    neste navegador.
 */

export interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  mensagem?: string | null;
  link?: string | null;
  lida: boolean;
  criado_em: string;
  /** Lembretes calculados (não gravados) */
  lembrete?: boolean;
  urgente?: boolean;
}

const DIAS_ANTES = 3;
const CHAVE_LEMBRETES_LIDOS = "finance_lembretes_lidos";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const somarDias = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return iso(d);
};
const dataBR = (s: string) => {
  const [a, m, d] = s.split("-");
  return `${d}/${m}${a !== String(new Date().getFullYear()) ? `/${a}` : ""}`;
};
const moeda = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const lerMeta = (obs?: string | null): any => {
  try {
    return obs && obs.trim().startsWith("{") ? JSON.parse(obs) : {};
  } catch {
    return {};
  }
};
const quando = (data: string, hoje: string) => {
  if (data < hoje) return `venceu em ${dataBR(data)}`;
  if (data === hoje) return "vence hoje";
  return `vence em ${dataBR(data)}`;
};

const lembretesLidos = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE_LEMBRETES_LIDOS) || "[]"));
  } catch {
    return new Set();
  }
};
const salvarLembretesLidos = (ids: Set<string>) => {
  try {
    // guarda só os mais recentes para não crescer sem limite
    localStorage.setItem(CHAVE_LEMBRETES_LIDOS, JSON.stringify([...ids].slice(-500)));
  } catch {
    /* sem armazenamento local */
  }
};

export const notificacoesService = {
  async listar(usuarioId: string, limite = 30): Promise<Notificacao[]> {
    const { data, error } = await supabase
      .from("notificacoes")
      .select("id, tipo, titulo, mensagem, link, lida, criado_em")
      .eq("usuario_id", usuarioId)
      .order("criado_em", { ascending: false })
      .limit(limite);
    if (error) return []; // seção 8 do SQL ainda não aplicada: sino só com lembretes
    return (data || []) as Notificacao[];
  },

  /** Lembretes de vencimento dos próximos dias (e do que já venceu e segue em aberto). */
  async lembretes(usuarioId: string): Promise<Notificacao[]> {
    const hoje = iso(new Date());
    const ate = somarDias(DIAS_ANTES);
    const desde = somarDias(-45);
    const lidos = lembretesLidos();
    const saida: Notificacao[] = [];
    const add = (n: Omit<Notificacao, "lida" | "lembrete" | "criado_em"> & { data: string }) =>
      saida.push({ ...n, lida: lidos.has(n.id), lembrete: true, criado_em: `${n.data}T08:00:00`, urgente: n.data <= hoje });

    const [faturas, parcelas, transacoes] = await Promise.all([
      supabase
        .from("faturas")
        .select("id, data_vencimento, valor_total, valor_pago, status, cartoes(nome)")
        .eq("usuario_id", usuarioId)
        .neq("status", "paga")
        .gte("data_vencimento", desde)
        .lte("data_vencimento", ate),
      supabase
        .from("parcelas_divida")
        .select("id, numero_parcela, valor_esperado, data_vencimento, status, dividas(descricao, status)")
        .eq("usuario_id", usuarioId)
        .neq("status", "paga")
        .gte("data_vencimento", desde)
        .lte("data_vencimento", ate),
      supabase
        .from("transacoes")
        .select("id, data, valor, terceiro, terceiro_pago, observacao, contato_id, contatos(nome)")
        .eq("usuario_id", usuarioId)
        .eq("terceiro_pago", false)
        .or("terceiro.eq.true,observacao.ilike.%parceria_credor_id%")
        .gte("data", desde)
        .lte("data", ate)
        .limit(1000),
    ]);

    for (const f of (faturas.data || []) as any[]) {
      const falta = Number(f.valor_total || 0) - Number(f.valor_pago || 0);
      if (falta <= 0.009) continue;
      add({
        id: `venc:fatura:${f.id}`,
        tipo: "vencimento_fatura",
        titulo: `Fatura ${f.cartoes?.nome || "do cartão"} ${quando(f.data_vencimento, hoje)}`,
        mensagem: `Falta pagar ${moeda(falta)}`,
        link: "/faturas",
        data: f.data_vencimento,
      });
    }

    for (const p of (parcelas.data || []) as any[]) {
      if (p.dividas?.status === "quitada") continue;
      add({
        id: `venc:divida:${p.id}`,
        tipo: "vencimento_divida",
        titulo: `Parcela ${p.numero_parcela} de ${p.dividas?.descricao || "dívida"} ${quando(p.data_vencimento, hoje)}`,
        mensagem: moeda(Number(p.valor_esperado)),
        link: "/dividas",
        data: p.data_vencimento,
      });
    }

    // Divisão de contas: agrupa por pessoa e data (uma compra de 30 itens = 1 aviso)
    const grupos = new Map<string, { nome: string; data: string; total: number; receber: boolean }>();
    for (const t of (transacoes.data || []) as any[]) {
      const meta = lerMeta(t.observacao);
      if (meta.resposta_cobranca === "recusada") continue;
      const aberto = Number(t.valor) - (Number(meta.valor_pago) || 0);
      if (aberto <= 0.009) continue;
      const receber = Boolean(t.terceiro);
      const nome = receber ? t.contatos?.nome || meta.contato_nome : meta.parceria_credor_nome || meta.contato_nome;
      const chave = `${receber ? "r" : "p"}:${receber ? t.contato_id : meta.parceria_credor_id}:${t.data}`;
      const g = grupos.get(chave) || { nome: nome || "contato", data: t.data, total: 0, receber };
      g.total += aberto;
      grupos.set(chave, g);
    }
    for (const [chave, g] of grupos) {
      const primeiro = g.nome.split(" ")[0];
      add({
        id: `venc:divisao:${chave}`,
        tipo: g.receber ? "vencimento_receber" : "vencimento_pagar",
        titulo: g.receber
          ? `${primeiro} te paga ${moeda(g.total)} — ${quando(g.data, hoje)}`
          : `Você paga ${moeda(g.total)} para ${primeiro} — ${quando(g.data, hoje)}`,
        mensagem: g.receber ? "Divisão de contas a receber" : "Divisão de contas a pagar",
        link: "/devedores",
        data: g.data,
      });
    }

    return saida.sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  },

  async marcarLidas(usuarioId: string, itens: Notificacao[]) {
    const lidos = lembretesLidos();
    itens.filter((n) => n.lembrete).forEach((n) => lidos.add(n.id));
    salvarLembretesLidos(lidos);
    const ids = itens.filter((n) => !n.lembrete && !n.lida).map((n) => n.id);
    if (ids.length) await supabase.from("notificacoes").update({ lida: true }).eq("usuario_id", usuarioId).in("id", ids);
  },

  /** Aviso para o próprio usuário (ex.: Pix reconhecido no extrato). */
  async criarParaMim(n: { tipo: string; titulo: string; mensagem?: string; link?: string; dados?: Record<string, unknown> }) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from("notificacoes").insert([{ usuario_id: data.user.id, ...n, dados: n.dados || {} }]);
  },

  /** Depois de lançar uma divisão: avisa no app quem já aceitou o convite. */
  async avisarDivisaoVinculados(transacaoIds: string[]) {
    const ids = transacaoIds.filter(Boolean);
    if (ids.length === 0) return;
    const { error } = await supabase.rpc("avisar_divisao_vinculados", { p_transacao_ids: ids });
    if (error) console.warn("Aviso no app não enviado:", error.message);
  },

  /** "Já paguei": quem deve avisa quem cobrou. */
  async informarPagamento(transacaoId: string, valor: number): Promise<{ ok: boolean; motivo?: string; repetido?: boolean }> {
    const { data, error } = await supabase.rpc("informar_pagamento", { p_transacao_id: transacaoId, p_valor: valor });
    if (error) return { ok: false, motivo: error.message };
    return (data as any) || { ok: false };
  },

  /** Avisa em tempo real quando chega notificação nova. Devolve a função para parar. */
  ouvir(usuarioId: string, aoChegar: (n: Notificacao) => void) {
    const canal = supabase
      .channel(`notificacoes-${usuarioId}`)
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "notificacoes", filter: `usuario_id=eq.${usuarioId}` },
        (payload: any) => aoChegar(payload.new as Notificacao),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  },
};
