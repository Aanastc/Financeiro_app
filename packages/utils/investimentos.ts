/**
 * Regras genéricas de investimentos (qualquer banco/produto).
 *
 * - Identifica aplicações e resgates pela descrição (CDB, RDB, LCI, LCA, Tesouro,
 *   poupança, caixinha, cofrinho, fundos...), sem depender de um banco específico.
 * - Centraliza o vínculo Investimento ↔ Meta, hoje gravado no campo `corretora`
 *   no formato "[Meta: <id>] Instituição".
 */

const PRODUTOS: { rotulo: string; padrao: RegExp }[] = [
  { rotulo: "CDB", padrao: /\bcdb\b/ },
  { rotulo: "RDB", padrao: /\brdb\b/ },
  { rotulo: "LCI", padrao: /\blci\b/ },
  { rotulo: "LCA", padrao: /\blca\b/ },
  { rotulo: "LC", padrao: /\blc\b/ },
  { rotulo: "CRI", padrao: /\bcri\b/ },
  { rotulo: "CRA", padrao: /\bcra\b/ },
  { rotulo: "Debênture", padrao: /\bdebentures?\b/ },
  { rotulo: "Tesouro Direto", padrao: /\btesouro\s*(direto|selic|ipca|prefixado|renda|educa)?\b/ },
  { rotulo: "Poupança", padrao: /\bpoupanca\b/ },
  { rotulo: "Caixinha", padrao: /\b(caixinhas?|cofrinho|porquinho|guardar dinheiro|guardado|meu porquinho)\b/ },
  { rotulo: "Fundo de Investimento", padrao: /\b(fundos? de investimento|fundo di|fic fi|fi renda fixa|fundos?\s+(rf|multimercado|renda fixa))\b/ },
  { rotulo: "Renda Fixa", padrao: /\b(renda fixa|invest facil|investimento automatico)\b/ },
];

const normalizar = (texto: string) =>
  (texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Produto citado na descrição (ex.: "APLICACAO CDB DI" → "CDB"), ou null. */
export function detectarProdutoInvestimento(descricao: string): string | null {
  const t = normalizar(descricao);
  return PRODUTOS.find(p => p.padrao.test(t))?.rotulo ?? null;
}

/** Rendimentos, impostos e tarifas de investimento NÃO são aplicação nem resgate. */
const NAO_E_MOVIMENTO = /\b(rendimentos?|juros|iof|ir\b|imposto|tarifa|taxa de administracao)\b/;
const VERBO_RESGATE = /\b(resgates?|resg\.?|retirada|retirado|vencimento|liquidacao)\b/;
const VERBO_APLICACAO = /\b(aplicacao|aplic\.?|aplicado|investimento|investido|aporte|deposito em|guardar dinheiro|guardado)\b/;

/** É resgate de investimento (dinheiro voltando para a conta)? */
export function ehResgateInvestimento(descricao: string): boolean {
  const t = normalizar(descricao);
  if (NAO_E_MOVIMENTO.test(t)) return false;
  return VERBO_RESGATE.test(t) && (detectarProdutoInvestimento(t) !== null || /\baplica/.test(t));
}

/** É aplicação em investimento (dinheiro saindo da conta para um produto)? */
export function ehAplicacaoInvestimento(descricao: string): boolean {
  const t = normalizar(descricao);
  if (NAO_E_MOVIMENTO.test(t) || ehResgateInvestimento(t)) return false;
  const produto = detectarProdutoInvestimento(t);
  if (produto === "Caixinha") return true; // "Caixinha", "Guardar dinheiro" já indicam a ação
  // Transferência recebida/enviada que só cita um produto não é aplicação sem um verbo explícito
  if (!VERBO_APLICACAO.test(t) && /\b(recebid[ao]|pix|ted|doc|transferencia)\b/.test(t)) return false;
  return produto !== null && (VERBO_APLICACAO.test(t) || !VERBO_RESGATE.test(t));
}

// ------------------------------------------------------------------------------
// Vínculo Investimento ↔ Meta (campo `corretora`: "[Meta: <id>] Instituição")
// ------------------------------------------------------------------------------
const TAG_META = /\[Meta:\s*([^\]]+)\]/;

export function metaIdDoInvestimento(corretora?: string | null): string | null {
  return (corretora || "").match(TAG_META)?.[1]?.trim() || null;
}

export function instituicaoDoInvestimento(corretora?: string | null): string {
  return (corretora || "").replace(TAG_META, "").trim();
}

/** Monta o campo `corretora` com (ou sem) o vínculo à meta, preservando a instituição. */
export function corretoraComMeta(corretora: string | null | undefined, metaId: string | null): string | null {
  const instituicao = instituicaoDoInvestimento(corretora);
  const valor = metaId ? `[Meta: ${metaId}] ${instituicao}`.trim() : instituicao;
  return valor || null;
}

/** Meta de "reserva de emergência" / caixinha, usada como destino padrão. */
export const REGEX_META_RESERVA = /reserva(\s+de)?\s+emerg[eê]ncia|caixinha/i;

// ------------------------------------------------------------------------------
// Rentabilidade definida pelo usuário (colunas indexador/taxa — migration 007)
// ------------------------------------------------------------------------------
export type Indexador = "CDI" | "PREFIXADO" | "IPCA" | "SELIC" | "POUPANCA" | "OUTRO";

export const INDEXADORES: { valor: Indexador; rotulo: string; sufixoTaxa: string; pedeTaxa: boolean }[] = [
  { valor: "CDI", rotulo: "% do CDI", sufixoTaxa: "% do CDI", pedeTaxa: true },
  { valor: "PREFIXADO", rotulo: "Prefixado (% ao ano)", sufixoTaxa: "% a.a.", pedeTaxa: true },
  { valor: "IPCA", rotulo: "IPCA + % ao ano", sufixoTaxa: "% a.a. + IPCA", pedeTaxa: true },
  { valor: "SELIC", rotulo: "Selic + % ao ano", sufixoTaxa: "% a.a. + Selic", pedeTaxa: true },
  { valor: "POUPANCA", rotulo: "Rendimento da poupança", sufixoTaxa: "", pedeTaxa: false },
  { valor: "OUTRO", rotulo: "Outro / variável", sufixoTaxa: "", pedeTaxa: false },
];

/** Texto curto da rentabilidade (ex.: "102% do CDI", "IPCA + 6% a.a."). */
export function descreverRentabilidade(indexador?: string | null, taxa?: number | string | null): string | null {
  if (!indexador) return null;
  const n = taxa === null || taxa === undefined || taxa === "" ? null : Number(taxa);
  const num = n !== null && Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : null;
  switch (indexador) {
    case "CDI": return num ? `${num}% do CDI` : "CDI";
    case "PREFIXADO": return num ? `${num}% a.a. prefixado` : "Prefixado";
    case "IPCA": return num ? `IPCA + ${num}% a.a.` : "IPCA";
    case "SELIC": return num ? `Selic + ${num}% a.a.` : "Selic";
    case "POUPANCA": return "Poupança";
    default: return num ? `${num}%` : "Variável";
  }
}

export const PRODUTOS_INVESTIMENTO = [
  "CDB", "RDB", "LCI", "LCA", "Tesouro Direto", "Poupança", "Caixinha / Conta remunerada",
  "Fundo de Investimento", "Debênture", "CRI / CRA", "Ações", "FIIs", "Criptomoedas", "Outro",
];
