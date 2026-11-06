/**
 * Caixinhas por banco + rendimento calculado.
 *
 * - Uma caixinha por conta ("Caixinha Inter", "Caixinha Nubank"), montada a partir das
 *   aplicações e resgates que já existem nas transações — funciona para quem já tem dados.
 * - O saldo de cada caixinha (e de todo investimento com tipo/taxa informados) é calculado
 *   com as taxas reais do Banco Central (rendimento.service).
 * - Quando o usuário informa o valor que o banco mostra, ele vira o ponto de partida
 *   (ajuste_valor/ajuste_data) e o cálculo continua dali.
 *
 * Tudo é aditivo: nada é apagado. Sem a seção 12 do SQL (colunas conta_id/ajuste_*),
 * a caixinha é achada pelo nome e investimentos com valor editado à mão não são recalculados.
 */
import { supabase } from "./supabase";
import { buscarTodasPaginas } from "./paginacao";
import { estimarSaldo, hojeIso, type Fluxo } from "./rendimento.service";
import {
  ehAplicacaoInvestimento,
  ehResgateInvestimento,
  instituicaoDoInvestimento,
  metaIdDoInvestimento,
  corretoraComMeta,
  REGEX_META_RESERVA,
} from "../utils/investimentos";
import { detectarInstituicao, mesmaInstituicao } from "../utils/instituicoes";

const centavos = (v: number) => Math.round(v * 100) / 100;
const norm = (s: string) => (s || "").trim().toLowerCase();

/** Nome do banco da conta ("Inter", "Nubank"...). */
export function bancoDaConta(conta: { nome?: string | null; instituicao?: string | null }): string {
  return detectarInstituicao(`${conta.instituicao || ""} ${conta.nome || ""}`)?.nome || conta.instituicao || conta.nome || "Banco";
}

/** "Caixinha Inter" (pessoal) ou "Caixinha Inter (empresa)" para conta do CNPJ. */
export const tituloCaixinha = (conta: { nome?: string | null; instituicao?: string | null; empresa_id?: string | null }) =>
  `Caixinha ${bancoDaConta(conta)}${conta.empresa_id ? " (empresa)" : ""}`;

/** Produto de renda fixa antigo (criado pelo importador) que já representa a caixinha deste banco. */
const pareceCaixinhaAntiga = (inv: any) => /caixinha|porquinho|cofrinho|reserva|rdb|cdb|poupan/i.test(inv.titulo || "");
const ehAgregadoAntigo = (inv: any) => /^reserva\s*\(rdb\s*\/\s*caixinha\)$/i.test((inv.titulo || "").trim());

// ------------------------------------------------------------------------------
// Caixinha apagada pelo usuário não volta: marca a conta (SQL seção 12) e, como reserva,
// guarda no navegador (funciona antes do SQL rodar).
// ------------------------------------------------------------------------------
const CHAVE_OCULTAS = "caixinhas-apagadas";
const ocultasLocais = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_OCULTAS) || "[]");
  } catch {
    return [];
  }
};

/** Não recriar a caixinha desta conta (o usuário apagou). */
export async function ocultarCaixinha(usuario_id: string, conta_id: string) {
  try {
    localStorage.setItem(CHAVE_OCULTAS, JSON.stringify([...new Set([...ocultasLocais(), conta_id])]));
  } catch {
    /* sem armazenamento local */
  }
  await supabase.from("contas_bancarias").update({ sem_caixinha: true }).eq("id", conta_id).eq("usuario_id", usuario_id);
}

/** Conta dona de um investimento-caixinha (pela coluna ou pelo nome "Caixinha <Banco>"). */
export async function contaDaCaixinha(usuario_id: string, inv: any): Promise<string | null> {
  if (inv?.conta_id) return inv.conta_id;
  if (!/^caixinha\s+\S/i.test((inv?.titulo || "").trim())) return null;
  const { data } = await supabase.from("contas_bancarias").select("id, nome, instituicao").eq("usuario_id", usuario_id);
  return (data || []).find((c: any) => norm(tituloCaixinha(c)) === norm(inv.titulo))?.id || null;
}

let emAndamento: Promise<void> | null = null;

export async function sincronizarCaixinhas(usuario_id: string): Promise<void> {
  // Várias telas chamam ao mesmo tempo: roda uma vez só
  if (emAndamento) return emAndamento;
  emAndamento = executar(usuario_id).finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}

async function executar(usuario_id: string) {
  const [contasRes, invsRes, metasRes, txs] = await Promise.all([
    supabase.from("contas_bancarias").select("*").eq("usuario_id", usuario_id),
    supabase.from("investimentos").select("*").eq("usuario_id", usuario_id),
    supabase.from("metas").select("id, titulo").eq("usuario_id", usuario_id),
    buscarTodasPaginas<any>((de, ate) =>
      supabase
        .from("transacoes")
        .select("id, tipo, descricao, valor, data, conta_id")
        .eq("usuario_id", usuario_id)
        .not("conta_id", "is", null)
        .or(
          "tipo.in.(APORTE,RESGATE),descricao.ilike.%aplica%,descricao.ilike.%resgate%,descricao.ilike.%caixinha%,descricao.ilike.%porquinho%,descricao.ilike.%cofrinho%,descricao.ilike.%guardar%,descricao.ilike.%guardado%,descricao.ilike.%poupan%",
        )
        .order("id")
        .range(de, ate),
    ).catch(() => [] as any[]),
  ]);
  if (contasRes.error || invsRes.error) return;
  const contas = contasRes.data || [];
  let invs: any[] = invsRes.data || [];
  const reserva = (metasRes.data || []).find((m: any) => REGEX_META_RESERVA.test(m.titulo || ""));
  // Seção 12 aplicada? (select * só traz as colunas que existem)
  let temColunas: boolean | null = invs.length > 0 ? "conta_id" in invs[0] : null;

  // Aplicações (+) e resgates (−) por conta
  const fluxosPorConta = new Map<string, Fluxo[]>();
  for (const t of txs || []) {
    const desc = t.descricao || "";
    let sinal = 0;
    if (t.tipo === "APORTE") sinal = 1;
    else if (t.tipo === "RESGATE") sinal = -1;
    else if (t.tipo === "TRANSFERENCIA" || t.tipo === "DESPESA" || t.tipo === "RECEITA") {
      if (ehResgateInvestimento(desc)) sinal = -1;
      else if (ehAplicacaoInvestimento(desc)) sinal = 1;
    }
    if (!sinal || !t.data) continue;
    const lista = fluxosPorConta.get(t.conta_id) || [];
    lista.push({ data: String(t.data).slice(0, 10), valor: sinal * Math.abs(Number(t.valor) || 0) });
    fluxosPorConta.set(t.conta_id, lista);
  }

  const atualizar = async (inv: any, dados: any) => {
    const { error } = await supabase.from("investimentos").update(dados).eq("id", inv.id).eq("usuario_id", usuario_id);
    if (!error) Object.assign(inv, dados);
    return !error;
  };

  const usados = new Set<string>();
  const apagadas = new Set(ocultasLocais());
  for (const conta of contas) {
    const fluxos = fluxosPorConta.get(conta.id);
    if (conta.sem_caixinha === true || apagadas.has(conta.id)) continue;
    if (!fluxos || fluxos.length === 0) continue;
    const banco = bancoDaConta(conta);
    const titulo = tituloCaixinha(conta);
    const aplicado = centavos(fluxos.reduce((s, f) => s + f.valor, 0));

    let inv =
      invs.find((i) => i.conta_id === conta.id) ||
      invs.find((i) => !i.conta_id && !usados.has(i.id) && norm(i.titulo) === norm(titulo)) ||
      invs.find(
        (i) =>
          !i.conta_id &&
          !usados.has(i.id) &&
          !ehAgregadoAntigo(i) &&
          pareceCaixinhaAntiga(i) &&
          mesmaInstituicao(instituicaoDoInvestimento(i.corretora), banco),
      );

    if (!inv) {
      if (aplicado <= 0.005) continue;
      const novo: any = {
        usuario_id,
        titulo,
        tipo: "Caixinha",
        valor_investido: aplicado,
        valor_atual: aplicado,
        data_inicio: [...fluxos].sort((a, b) => a.data.localeCompare(b.data))[0].data,
        // Caixinha da empresa não entra na sua reserva pessoal
        corretora: corretoraComMeta(banco, conta.empresa_id ? null : reserva?.id || null),
        liquidez_diaria: true,
      };
      let res = await supabase.from("investimentos").insert([{ ...novo, conta_id: conta.id }]).select().single();
      if (res.error) {
        temColunas = false;
        const { liquidez_diaria: _l, ...semExtras } = novo;
        res = await supabase.from("investimentos").insert([semExtras]).select().single();
      } else temColunas = true;
      if (res.error || !res.data) continue;
      inv = res.data;
      invs = [...invs, inv];
      // O importador antigo somava todas as aplicações num investimento único: tira daqui o que virou caixinha
      const agregado = invs.find(ehAgregadoAntigo);
      if (agregado) {
        await atualizar(agregado, {
          valor_atual: centavos(Math.max(0, Number(agregado.valor_atual || 0) - aplicado)),
          valor_investido: centavos(Math.max(0, Number(agregado.valor_investido || 0) - aplicado)),
        });
      }
    } else if (temColunas && !inv.conta_id) {
      await atualizar(inv, { conta_id: conta.id });
    }
    // Conta passou a ser da empresa: a caixinha vira "(empresa)" e sai da reserva pessoal
    if (conta.empresa_id) {
      const dados: any = {};
      if (/^caixinha\s/i.test(inv.titulo || "") && !/\(empresa\)/i.test(inv.titulo || "")) dados.titulo = titulo;
      if (reserva && metaIdDoInvestimento(inv.corretora) === reserva.id) dados.corretora = corretoraComMeta(inv.corretora, null);
      if (Object.keys(dados).length) await atualizar(inv, dados);
    }
    usados.add(inv.id);
    await recalcular(inv, fluxos, temColunas === true, atualizar);
  }

  // Demais investimentos com tipo/taxa informados: rendimento a partir do valor informado
  if (temColunas) {
    for (const inv of invs) {
      if (usados.has(inv.id) || !inv.indexador || !inv.data_inicio) continue;
      await recalcular(inv, [{ data: inv.data_inicio, valor: Number(inv.valor_investido || 0) }], true, atualizar, false);
    }
  }
}

/**
 * Recalcula o saldo de um investimento.
 * - Com ponto de partida (valor que o banco mostrou): parte dele e soma as movimentações depois.
 * - Sem ponto de partida e com valor editado à mão: grava o valor atual como ponto de partida
 *   (nunca descarta o que o usuário informou).
 */
async function recalcular(
  inv: any,
  fluxos: Fluxo[],
  temColunas: boolean,
  atualizar: (inv: any, dados: any) => Promise<boolean>,
  atualizarInvestido = true,
) {
  const hoje = hojeIso();
  const aplicado = centavos(fluxos.reduce((s, f) => s + f.valor, 0));
  const valorAtual = Number(inv.valor_atual || 0);
  const temAncora = temColunas && inv.ajuste_data && inv.ajuste_valor !== null && inv.ajuste_valor !== undefined;

  if (!temAncora && Math.abs(valorAtual - Number(inv.valor_investido || 0)) > 0.01) {
    // Já tem rendimento/valor informado: esse valor vira o ponto de partida (nunca é descartado).
    // Sem a seção 12 do SQL não há onde guardar o ponto de partida: só atualiza o total aplicado.
    const dados: any = temColunas ? { ajuste_valor: valorAtual, ajuste_data: hoje } : {};
    if (atualizarInvestido && Math.abs(Math.max(0, aplicado) - Number(inv.valor_investido || 0)) > 0.005) dados.valor_investido = Math.max(0, aplicado);
    if (Object.keys(dados).length) await atualizar(inv, dados);
    return;
  }

  const base: Fluxo[] = temAncora
    ? [{ data: String(inv.ajuste_data).slice(0, 10), valor: Number(inv.ajuste_valor) }, ...fluxos.filter((f) => f.data > String(inv.ajuste_data).slice(0, 10))]
    : fluxos;

  const estimado = inv.indexador ? await estimarSaldo({ indexador: inv.indexador, taxa: inv.taxa, fluxos: base, ate: hoje }) : null;
  // Sem tipo/taxa (ou sem cotação do Banco Central): só soma aplicações e resgates
  const saldo = estimado ? estimado.saldo : centavos(Math.max(0, base.reduce((s, f) => s + f.valor, 0)));

  const dados: any = {};
  if (Math.abs(saldo - valorAtual) > 0.005) dados.valor_atual = saldo;
  if (atualizarInvestido && Math.abs(Math.max(0, aplicado) - Number(inv.valor_investido || 0)) > 0.005) dados.valor_investido = Math.max(0, aplicado);
  if (Object.keys(dados).length) await atualizar(inv, dados);
}

export const caixinhasService = { sincronizarCaixinhas, bancoDaConta, tituloCaixinha, ocultarCaixinha, contaDaCaixinha };
export { metaIdDoInvestimento };
