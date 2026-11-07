/**
 * Empresa (CNPJ): MEI, Simples Nacional ou Lucro Presumido.
 *
 * - As contas com `empresa_id` são da empresa: o painel da empresa lê o que entrou e saiu
 *   delas; as telas pessoais deixam esses lançamentos de fora.
 * - Pix da conta da empresa para uma conta sua é RETIRADA (pró-labore ou distribuição
 *   de lucros): sai da empresa e vira ENTRADA pessoal (categoria Pró-labore/Lucros).
 * - Impostos são ESTIMATIVAS para planejamento (o valor oficial é o do PGDAS/contador).
 *
 * Sem a seção 14 do SQL, tudo aqui devolve "sem empresa" e o app segue como antes.
 */
import { sincronizarCaixinhas } from "./caixinhas.service";
import { taxaAnualAtual } from "./rendimento.service";
import { calendarioDas, salarioMinimoVigente, SALARIO_MINIMO_RESERVA } from "./dados-publicos.service";
import { supabase } from "./supabase";
import { buscarTodasPaginas } from "./paginacao";
import { ehResgateInvestimento } from "../utils/investimentos";

export type Regime = "MEI" | "SIMPLES" | "PRESUMIDO";
export type Anexo = "I" | "II" | "III" | "IV" | "V" | "FATOR_R";
export type TipoRetirada = "PRO_LABORE" | "LUCROS";

export interface Empresa {
  id: string;
  nome: string;
  cnpj?: string | null;
  regime: Regime;
  anexo?: Anexo | null;
  atividade?: "SERVICOS" | "COMERCIO" | "INDUSTRIA" | "COMERCIO_SERVICOS" | null;
  das_mei_valor?: number | null;
  iss_aliquota?: number | null;
  rbt12_manual?: number | null;
  retirada_padrao: TipoRetirada;
  pro_labore_valor?: number | null;
  inicio_atividade?: string | null;
}

// ------------------------------------------------------------------------------
// Tabelas e regras (valores de 2026; o contador confirma o oficial)
// ------------------------------------------------------------------------------
export const LIMITE_MEI_ANO = 81000;
export const LIMITE_SIMPLES_ANO = 4800000;
export const SUBLIMITE_SIMPLES = 3600000;
/** Salário mínimo de reserva para o DAS do MEI; o vigente vem do Banco Central (dados-publicos.service). */
export const SALARIO_MINIMO = SALARIO_MINIMO_RESERVA;

/** Simples Nacional (LC 123/2006, anexos atualizados pela LC 155/2016): [teto RBT12, alíquota nominal %, parcela a deduzir]. */
export const ANEXOS_SIMPLES: Record<Exclude<Anexo, "FATOR_R">, [number, number, number][]> = {
  I: [[180000, 4, 0], [360000, 7.3, 5940], [720000, 9.5, 13860], [1800000, 10.7, 22500], [3600000, 14.3, 87300], [4800000, 19, 378000]],
  II: [[180000, 4.5, 0], [360000, 7.8, 5940], [720000, 10, 13860], [1800000, 11.2, 22500], [3600000, 14.7, 85500], [4800000, 30, 720000]],
  III: [[180000, 6, 0], [360000, 11.2, 9360], [720000, 13.5, 17640], [1800000, 16, 35640], [3600000, 21, 125640], [4800000, 33, 648000]],
  IV: [[180000, 4.5, 0], [360000, 9, 8100], [720000, 10.2, 12420], [1800000, 14, 39780], [3600000, 22, 183780], [4800000, 33, 828000]],
  V: [[180000, 15.5, 0], [360000, 18, 4500], [720000, 19.5, 9900], [1800000, 20.5, 17100], [3600000, 23, 62100], [4800000, 30.5, 540000]],
};

/** DAS do MEI sugerido pela atividade (o boleto do mês é o que vale). */
export function dasMeiSugerido(atividade?: string | null, salarioMinimo: number = SALARIO_MINIMO): number {
  const inss = Math.round(salarioMinimo * 0.05 * 100) / 100;
  const extra = atividade === "COMERCIO" || atividade === "INDUSTRIA" ? 1 : atividade === "COMERCIO_SERVICOS" ? 6 : 5;
  return Math.round((inss + extra) * 100) / 100;
}

/** Alíquota efetiva do Simples: (RBT12 × nominal − dedução) / RBT12. */
export function aliquotaSimples(rbt12: number, anexo: Exclude<Anexo, "FATOR_R">): { efetiva: number; nominal: number; faixa: number } {
  const tabela = ANEXOS_SIMPLES[anexo];
  const base = Math.max(0, rbt12);
  // Acima do teto da última faixa (4,8 mi) fica na última faixa, nunca na primeira
  const achada = tabela.findIndex(([teto]) => base <= teto);
  const i = achada === -1 ? tabela.length - 1 : achada;
  const [, nominal, deducao] = tabela[i];
  const efetiva = base > 0 ? Math.max(0, (base * (nominal / 100) - deducao) / base) * 100 : nominal;
  return { efetiva, nominal, faixa: i + 1 };
}

// ------------------------------------------------------------------------------
// CRUD
// ------------------------------------------------------------------------------
export async function minhasEmpresas(usuario_id: string): Promise<Empresa[]> {
  const { data, error } = await supabase.from("empresas").select("*").eq("usuario_id", usuario_id).order("criado_em");
  if (error) return []; // seção 14 ainda não rodou
  return (data || []) as Empresa[];
}

export async function salvarEmpresa(usuario_id: string, dados: Partial<Empresa> & { id?: string }): Promise<Empresa> {
  const { id, ...resto } = dados;
  const q = id
    ? supabase.from("empresas").update(resto).eq("id", id).eq("usuario_id", usuario_id).select().single()
    : supabase.from("empresas").insert([{ ...resto, usuario_id }]).select().single();
  const { data, error } = await q;
  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message || "")) {
      throw new Error("Rode a seção 14 do supabase/migrations/ajustes_supabase.sql para habilitar a empresa.");
    }
    throw error;
  }
  return data as Empresa;
}

/** Marca quais contas são da empresa (as demais deixam de ser). */
export async function definirContasDaEmpresa(usuario_id: string, empresa_id: string, contaIds: string[]) {
  const { data: atuais } = await supabase.from("contas_bancarias").select("id, empresa_id").eq("usuario_id", usuario_id);
  for (const c of atuais || []) {
    const deve = contaIds.includes(c.id);
    if (deve && c.empresa_id !== empresa_id) {
      await supabase.from("contas_bancarias").update({ empresa_id }).eq("id", c.id).eq("usuario_id", usuario_id);
    } else if (!deve && c.empresa_id === empresa_id) {
      await supabase.from("contas_bancarias").update({ empresa_id: null }).eq("id", c.id).eq("usuario_id", usuario_id);
    }
  }
}

/** Contas e cartões que são de empresa (para tirar das telas pessoais). */
export async function idsDaEmpresa(usuario_id: string): Promise<{ contas: Set<string>; cartoes: Set<string> }> {
  const { data: contas, error } = await supabase.from("contas_bancarias").select("id, empresa_id").eq("usuario_id", usuario_id);
  if (error) return { contas: new Set(), cartoes: new Set() };
  const contasPJ = new Set((contas || []).filter((c: any) => c.empresa_id).map((c: any) => c.id as string));
  if (contasPJ.size === 0) return { contas: contasPJ, cartoes: new Set() };
  const { data: cartoes } = await supabase.from("cartoes").select("id, conta_id").eq("usuario_id", usuario_id);
  return { contas: contasPJ, cartoes: new Set((cartoes || []).filter((c: any) => c.conta_id && contasPJ.has(c.conta_id)).map((c: any) => c.id as string)) };
}

/** Lançamento é da empresa? (conta ou cartão da empresa) — usado para separar das telas pessoais. */
export const ehDaEmpresa = (t: any, ids: { contas: Set<string>; cartoes: Set<string> }) =>
  Boolean((t?.conta_id && ids.contas.has(t.conta_id)) || (t?.cartao_id && ids.cartoes.has(t.cartao_id)));

// ------------------------------------------------------------------------------
// Retiradas (pró-labore / distribuição de lucros)
// ------------------------------------------------------------------------------
const lerMeta = (obs?: string | null): Record<string, any> => {
  const t = (obs || "").trim();
  if (!t.startsWith("{")) return {};
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
};

export const NOME_RETIRADA: Record<TipoRetirada, string> = { PRO_LABORE: "Pró-labore", LUCROS: "Distribuição de lucros" };
/** Categoria da ENTRADA na sua conta pessoal: pró-labore é o seu salário; lucros ficam à parte (isentos de IR). */
export const CATEGORIA_RETIRADA: Record<TipoRetirada, string> = { PRO_LABORE: "Salário", LUCROS: "Distribuição de lucros" };

async function categoriaReceita(usuario_id: string, nome: string): Promise<string | null> {
  const { data: cat } = await supabase.from("categorias").select("id").eq("usuario_id", usuario_id).eq("tipo", "RECEITA").ilike("nome", nome).limit(1).maybeSingle();
  if (cat) return cat.id;
  const { data: nova } = await supabase.from("categorias").insert([{ usuario_id, nome, tipo: "RECEITA", ativa: true }]).select("id").single();
  return nova?.id || null;
}

/**
 * Registra uma retirada: 1 transação RECEITA (pessoal) com as duas pernas —
 * SAÍDA na conta da empresa e ENTRADA na sua conta pessoal.
 */
export async function registrarRetirada(
  usuario_id: string,
  p: { contaEmpresa: string; contaPessoal: string; valor: number; data: string; tipo: TipoRetirada; descricao?: string; documento_importado_id?: string | null },
) {
  const categoria_id = await categoriaReceita(usuario_id, CATEGORIA_RETIRADA[p.tipo]);
  const { data: tx, error } = await supabase
    .from("transacoes")
    .insert([{
      usuario_id,
      tipo: "RECEITA",
      descricao: p.descricao || NOME_RETIRADA[p.tipo],
      valor: p.valor,
      data: p.data,
      conta_id: p.contaPessoal,
      categoria_id,
      status: "confirmada",
      considerar_soma: true,
      documento_importado_id: p.documento_importado_id || null,
      observacao: JSON.stringify({ retirada_pj: p.tipo, conta_empresa_id: p.contaEmpresa }),
    }])
    .select()
    .single();
  if (error) throw error;
  const { error: errMov } = await supabase.from("movimentacoes").insert([
    { usuario_id, transacao_id: tx.id, conta_id: p.contaEmpresa, tipo: "SAIDA", valor: p.valor, data: p.data },
    { usuario_id, transacao_id: tx.id, conta_id: p.contaPessoal, tipo: "ENTRADA", valor: p.valor, data: p.data },
  ]);
  if (errMov) throw errMov;
  return tx;
}

/**
 * Transferência já lançada entre a empresa e você (ex.: importada antes) vira retirada.
 * Só muda tipo/categoria/descrição; as movimentações (o dinheiro) continuam iguais.
 */
export async function classificarComoRetirada(usuario_id: string, transacao_id: string, tipo: TipoRetirada, contaPessoal: string, contaEmpresa: string) {
  const categoria_id = await categoriaReceita(usuario_id, CATEGORIA_RETIRADA[tipo]);
  const { error } = await supabase
    .from("transacoes")
    .update({
      tipo: "RECEITA",
      categoria_id,
      descricao: `${NOME_RETIRADA[tipo]} (empresa)`,
      conta_id: contaPessoal,
      considerar_soma: true,
      observacao: JSON.stringify({ retirada_pj: tipo, conta_empresa_id: contaEmpresa }),
    })
    .eq("id", transacao_id)
    .eq("usuario_id", usuario_id);
  if (error) throw error;
}

// ------------------------------------------------------------------------------
// Painel: faturamento, despesas, retiradas e impostos por mês
// ------------------------------------------------------------------------------
export interface LinhaEmpresa {
  transacao_id: string;
  data: string;
  descricao: string;
  valor: number;
  categoria?: string | null;
  conta_id: string;
}

export interface MesEmpresa {
  mes: string; // YYYY-MM
  faturamento: number;
  despesas: number;
  impostosPagos: number;
  proLabore: number;
  lucrosDistribuidos: number;
  imposto: { valor: number; aliquota: number; detalhe: string; vencimento: string };
  lucro: number; // faturamento − despesas − imposto estimado
}

export interface PainelEmpresa {
  meses: MesEmpresa[];
  receitas: LinhaEmpresa[];
  despesas: LinhaEmpresa[];
  retiradas: (LinhaEmpresa & { tipo: TipoRetirada })[];
  /** Pix da empresa para conta sua ainda como "transferência": falta dizer se é pró-labore ou lucro */
  aClassificar: (LinhaEmpresa & { conta_pessoal_id: string })[];
  faturamentoAno: number;
  rbt12: number;
  limite: { valor: number; usado: number; nome: string };
  fatorR: number | null;
  anexoEfetivo: string | null;
  /** Caixinhas/investimentos das contas da empresa (dinheiro guardado pela empresa) */
  investimentos: InvestimentoEmpresa[];
}

/**
 * Pagamento de imposto (DAS, DARF, ISS, Receita Federal, prefeitura…), pela descrição ou categoria.
 * "das" sozinho só vale como sigla (início/fim do texto, "DAS-MEI", "pagamento do DAS"):
 * "Loja das Tintas" não é imposto.
 */
export const ehImposto = (desc: string, cat?: string | null) => {
  const texto = `${desc || ""} ${cat || ""}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return (
    /\b(pgdas|simples nacional|darf|inss|iss|irpj|csll|pis|cofins|gps|receita federal|prefeitura|impostos?|tributos?)\b/.test(texto) ||
    /^das\b|\bdas$|\bdas[\s-]*(mei|simples)\b|\b(pagamento|pgto|pag|guia)\s+(do\s+|de\s+)?das\b|\(das\)/.test(texto)
  );
};
const somaMes = (lista: { data: string; valor: number }[], ym: string) => lista.filter((l) => l.data.startsWith(ym)).reduce((s, l) => s + l.valor, 0);
const ymAnterior = (ym: string, n: number) => {
  const [a, m] = ym.split("-").map(Number);
  const d = new Date(a, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Impostos estimados de uma competência (mês) — ver regras de cada regime. */
export function impostoDoMes(
  empresa: Empresa,
  ym: string,
  faturamentoMes: number,
  historico: { faturamento: (ym: string) => number; folha: (ym: string) => number; mesesComDados: number },
  publicos?: { salarioMinimo?: number; vencimento?: (competencia: string) => string },
): { valor: number; aliquota: number; detalhe: string; vencimento: string; rbt12: number; fatorR: number | null; anexo: string | null } {
  const [a, m] = ym.split("-").map(Number);
  const venc = new Date(a, m, 20); // dia 20 do mês seguinte (sem ajuste de dia útil)
  const vencimento = publicos?.vencimento?.(ym) || `${venc.getFullYear()}-${String(venc.getMonth() + 1).padStart(2, "0")}-20`;

  if (empresa.regime === "MEI") {
    const valor = Number(empresa.das_mei_valor) || dasMeiSugerido(empresa.atividade, publicos?.salarioMinimo);
    return { valor, aliquota: faturamentoMes > 0 ? (valor / faturamentoMes) * 100 : 0, detalhe: "DAS fixo do MEI", vencimento, rbt12: 0, fatorR: null, anexo: null };
  }

  if (empresa.regime === "PRESUMIDO") {
    // Serviços: presunção de 32% → IRPJ 15% e CSLL 9% sobre a base (4,8% + 2,88%), PIS 0,65%, COFINS 3% e ISS
    const iss = Number(empresa.iss_aliquota ?? 5);
    const aliquota = 4.8 + 2.88 + 0.65 + 3 + iss;
    return {
      valor: r2((faturamentoMes * aliquota) / 100),
      aliquota,
      detalhe: `IRPJ 4,8% + CSLL 2,88% (trimestrais) + PIS 0,65% + COFINS 3% + ISS ${iss}%`,
      vencimento,
      rbt12: 0,
      fatorR: null,
      anexo: null,
    };
  }

  // Simples Nacional: RBT12 = faturamento dos 12 meses ANTERIORES à competência
  let rbt12 = 0;
  let folha12 = 0;
  for (let i = 1; i <= 12; i++) {
    rbt12 += historico.faturamento(ymAnterior(ym, i));
    folha12 += historico.folha(ymAnterior(ym, i));
  }
  if (historico.mesesComDados < 12) {
    if (Number(empresa.rbt12_manual) > 0) rbt12 = Math.max(rbt12, Number(empresa.rbt12_manual));
    else if (historico.mesesComDados > 0) rbt12 = (rbt12 / Math.min(12, historico.mesesComDados)) * 12; // início de atividade: proporcional
    else rbt12 = faturamentoMes * 12;
  }
  let anexo = (empresa.anexo || "FATOR_R") as Anexo;
  let fatorR: number | null = null;
  if (anexo === "FATOR_R") {
    fatorR = rbt12 > 0 ? folha12 / rbt12 : 0;
    anexo = fatorR >= 0.28 ? "III" : "V";
  }
  const { efetiva, faixa } = aliquotaSimples(rbt12, anexo as Exclude<Anexo, "FATOR_R">);
  return {
    valor: r2((faturamentoMes * efetiva) / 100),
    aliquota: efetiva,
    detalhe: `Anexo ${anexo} · faixa ${faixa}${fatorR !== null ? ` · fator R ${(fatorR * 100).toFixed(1)}%` : ""}`,
    vencimento,
    rbt12,
    fatorR,
    anexo,
  };
}

export type InvestimentoEmpresa = {
  id: string;
  titulo: string;
  /** valor hoje, já com o rendimento (calculado pelas taxas do Banco Central) */
  valor: number;
  /** quanto foi aplicado (aplicações − resgates) */
  aplicado: number;
  /** quanto já rendeu de juros */
  rendimento: number;
  indexador: string | null;
  taxa: number | null;
  /** % ao ano pelas taxas atuais (ex.: 100% do CDI ≈ 14,9%); null se o tipo não foi informado */
  taxaAnual: number | null;
  /** quanto rende por mês no ritmo de hoje */
  rendeMes: number | null;
};

/** Caixinhas e investimentos ligados às contas da empresa (coluna conta_id — SQL seção 12). */
async function investimentosDaEmpresa(usuario_id: string, contasPJ: Set<string>): Promise<InvestimentoEmpresa[]> {
  // atualiza o rendimento das caixinhas antes de mostrar (aplicações do extrato + taxa do BC)
  await sincronizarCaixinhas(usuario_id).catch(() => {});
  const { data, error } = await supabase.from("investimentos").select("*").eq("usuario_id", usuario_id);
  if (error) return [];
  const lista = (data || []).filter((i: any) => i.conta_id && contasPJ.has(i.conta_id));
  return Promise.all(
    lista.map(async (i: any) => {
      const valor = Number(i.valor_atual || 0);
      const aplicado = Number(i.valor_investido || 0);
      const taxaAnual = i.indexador ? await taxaAnualAtual(i.indexador, i.taxa).catch(() => null) : null;
      return {
        id: i.id,
        titulo: i.titulo,
        valor,
        aplicado,
        rendimento: aplicado > 0 ? r2(Math.max(0, valor - aplicado)) : 0,
        indexador: i.indexador || null,
        taxa: i.taxa != null ? Number(i.taxa) : null,
        taxaAnual,
        rendeMes: taxaAnual != null ? r2(valor * (Math.pow(1 + taxaAnual / 100, 1 / 12) - 1)) : null,
      };
    }),
  );
}

export async function painelEmpresa(usuario_id: string, empresa: Empresa, ano: number): Promise<PainelEmpresa> {
  // Vencimento real do DAS (dia útil) e salário mínimo vigente: dados públicos atualizados
  const [vencimentoDas, salarioMinimo] = await Promise.all([
    calendarioDas([ano - 1, ano]).catch(() => undefined),
    salarioMinimoVigente().catch(() => SALARIO_MINIMO_RESERVA),
  ]);
  const publicos = { vencimento: vencimentoDas, salarioMinimo };
  const { data: contas } = await supabase.from("contas_bancarias").select("id, nome, empresa_id").eq("usuario_id", usuario_id);
  const contasPJ = new Set((contas || []).filter((c: any) => c.empresa_id === empresa.id).map((c: any) => c.id));
  const contasPF = new Set((contas || []).filter((c: any) => !c.empresa_id).map((c: any) => c.id));
  const { data: cartoes } = await supabase.from("cartoes").select("id, conta_id").eq("usuario_id", usuario_id);
  const cartoesPJ = new Set((cartoes || []).filter((c: any) => c.conta_id && contasPJ.has(c.conta_id)).map((c: any) => c.id));

  // 13 meses antes de janeiro (para o RBT12 de janeiro) até dezembro
  const de = `${ano - 1}-01-01`;
  const ate = `${ano}-12-31`;
  const vazio: PainelEmpresa = {
    meses: [], receitas: [], despesas: [], retiradas: [], aClassificar: [], faturamentoAno: 0, rbt12: 0,
    limite: { valor: empresa.regime === "MEI" ? LIMITE_MEI_ANO : LIMITE_SIMPLES_ANO, usado: 0, nome: empresa.regime === "MEI" ? "Limite do MEI" : "Limite do Simples" },
    fatorR: null, anexoEfetivo: null, investimentos: [],
  };
  if (contasPJ.size === 0) return vazio;

  const movs = await buscarTodasPaginas<any>((i, f) =>
    supabase
      .from("movimentacoes")
      .select("id, conta_id, tipo, valor, data, transacao_id, transacoes!movimentacoes_transacao_fkey(id, tipo, descricao, observacao, categorias(nome))")
      .eq("usuario_id", usuario_id)
      .in("conta_id", [...contasPJ])
      .gte("data", de)
      .lte("data", ate)
      .order("id")
      .range(i, f),
  );
  const compras = cartoesPJ.size
    ? await buscarTodasPaginas<any>((i, f) =>
        supabase
          .from("transacoes")
          .select("id, descricao, valor, data, tipo, cartao_id, categorias(nome)")
          .eq("usuario_id", usuario_id)
          .in("cartao_id", [...cartoesPJ])
          .in("tipo", ["DESPESA"])
          .gte("data", de)
          .lte("data", ate)
          .order("id")
          .range(i, f),
      )
    : [];

  // Outras pernas das transferências (para saber se foram para uma conta sua)
  const idsTransf = [...new Set(movs.filter((m) => (Array.isArray(m.transacoes) ? m.transacoes[0] : m.transacoes)?.tipo === "TRANSFERENCIA").map((m) => m.transacao_id))];
  const outrasPernas = new Map<string, any[]>();
  for (let i = 0; i < idsTransf.length; i += 200) {
    const { data } = await supabase.from("movimentacoes").select("transacao_id, conta_id, tipo").in("transacao_id", idsTransf.slice(i, i + 200));
    for (const p of data || []) outrasPernas.set(p.transacao_id, [...(outrasPernas.get(p.transacao_id) || []), p]);
  }

  const receitas: LinhaEmpresa[] = [];
  const despesas: LinhaEmpresa[] = [];
  const retiradas: (LinhaEmpresa & { tipo: TipoRetirada })[] = [];
  const aClassificar: (LinhaEmpresa & { conta_pessoal_id: string })[] = [];
  for (const m of movs) {
    const t = Array.isArray(m.transacoes) ? m.transacoes[0] : m.transacoes;
    if (!t) continue;
    const cat = (Array.isArray(t.categorias) ? t.categorias[0] : t.categorias)?.nome || null;
    const linha: LinhaEmpresa = { transacao_id: t.id, data: String(m.data).slice(0, 10), descricao: t.descricao, valor: Number(m.valor) || 0, categoria: cat, conta_id: m.conta_id };
    const meta = lerMeta(t.observacao);
    if (meta.retirada_pj && m.tipo === "SAIDA") {
      retiradas.push({ ...linha, tipo: meta.retirada_pj === "LUCROS" ? "LUCROS" : "PRO_LABORE" });
    } else if (t.tipo === "TRANSFERENCIA") {
      // Saída para conta pessoal sua = retirada ainda sem classificação
      const pessoal = (outrasPernas.get(t.id) || []).find((p) => p.conta_id !== m.conta_id && contasPF.has(p.conta_id));
      if (m.tipo === "SAIDA" && pessoal) aClassificar.push({ ...linha, conta_pessoal_id: pessoal.conta_id });
    } else if (m.tipo === "ENTRADA" && t.tipo === "RECEITA" && !ehResgateInvestimento(t.descricao || "")) {
      receitas.push(linha);
    } else if (m.tipo === "SAIDA" && (t.tipo === "DESPESA" || t.tipo === "PAGAMENTO_DIVIDA")) {
      despesas.push(linha);
    }
  }
  for (const c of compras) {
    const cat = (Array.isArray(c.categorias) ? c.categorias[0] : c.categorias)?.nome || null;
    despesas.push({ transacao_id: c.id, data: String(c.data).slice(0, 10), descricao: c.descricao, valor: Number(c.valor) || 0, categoria: cat, conta_id: "" });
  }

  const fat = (ym: string) => somaMes(receitas, ym);
  const folha = (ym: string) => somaMes(retiradas.filter((r) => r.tipo === "PRO_LABORE"), ym);
  const mesesComDados = new Set(receitas.map((r) => r.data.slice(0, 7))).size;

  const meses: MesEmpresa[] = [];
  let ultimo: ReturnType<typeof impostoDoMes> | null = null;
  const hoje = new Date();
  const ymHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  for (let m = 1; m <= 12; m++) {
    const ym = `${ano}-${String(m).padStart(2, "0")}`;
    if (ym > ymHoje) break;
    const faturamento = r2(fat(ym));
    const despesasMes = despesas.filter((d) => d.data.startsWith(ym));
    const impostosPagos = r2(despesasMes.filter((d) => ehImposto(d.descricao, d.categoria)).reduce((s, d) => s + d.valor, 0));
    const despesasSemImposto = r2(despesasMes.reduce((s, d) => s + d.valor, 0) - impostosPagos);
    const imp = impostoDoMes(empresa, ym, faturamento, { faturamento: fat, folha, mesesComDados }, publicos);
    if (empresa.regime === "MEI" && faturamento === 0 && !receitas.some((r) => r.data < `${ym}-32`)) {
      // MEI paga o DAS mesmo sem faturar; só não conta antes de existir algum dado
    }
    ultimo = imp;
    meses.push({
      mes: ym,
      faturamento,
      despesas: despesasSemImposto,
      impostosPagos,
      proLabore: r2(somaMes(retiradas.filter((r) => r.tipo === "PRO_LABORE"), ym)),
      lucrosDistribuidos: r2(somaMes(retiradas.filter((r) => r.tipo === "LUCROS"), ym)),
      imposto: { valor: imp.valor, aliquota: imp.aliquota, detalhe: imp.detalhe, vencimento: imp.vencimento },
      lucro: r2(faturamento - despesasSemImposto - imp.valor),
    });
  }

  const faturamentoAno = r2(receitas.filter((r) => r.data.startsWith(String(ano))).reduce((s, r) => s + r.valor, 0));
  // Limite proporcional no ano em que a empresa abriu
  let limiteValor = empresa.regime === "MEI" ? LIMITE_MEI_ANO : LIMITE_SIMPLES_ANO;
  if (empresa.inicio_atividade && empresa.inicio_atividade.startsWith(String(ano))) {
    const mesesAtivos = 12 - Number(empresa.inicio_atividade.slice(5, 7)) + 1;
    limiteValor = r2((limiteValor / 12) * mesesAtivos);
  }
  return {
    meses,
    receitas,
    despesas,
    retiradas,
    aClassificar,
    faturamentoAno,
    rbt12: ultimo?.rbt12 || 0,
    limite: { valor: limiteValor, usado: faturamentoAno, nome: empresa.regime === "MEI" ? "Limite do MEI" : empresa.regime === "SIMPLES" ? "Limite do Simples" : "Faturamento no ano" },
    fatorR: ultimo?.fatorR ?? null,
    anexoEfetivo: ultimo?.anexo ?? null,
    investimentos: await investimentosDaEmpresa(usuario_id, contasPJ),
  };
}

export const empresaService = {
  minhasEmpresas,
  salvarEmpresa,
  definirContasDaEmpresa,
  idsDaEmpresa,
  ehDaEmpresa,
  registrarRetirada,
  classificarComoRetirada,
  painelEmpresa,
  impostoDoMes,
  aliquotaSimples,
  dasMeiSugerido,
};
