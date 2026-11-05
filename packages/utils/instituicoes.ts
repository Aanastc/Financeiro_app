/**
 * Identificação genérica de instituições financeiras.
 *
 * Em vez de regras fixas por banco espalhadas pelo código, toda comparação
 * ("este arquivo é de qual banco?", "esta dívida é do mesmo banco deste cartão?")
 * passa por aqui. Para suportar um banco novo basta acrescentar uma linha em
 * INSTITUICOES.
 */

export interface Instituicao {
  /** Identificador estável (minúsculo, sem acento) */
  id: string;
  /** Nome para exibição */
  nome: string;
  /** Termos que identificam a instituição em textos/nomes de arquivo (normalizados) */
  aliases: string[];
  /** Cor de marca sugerida */
  cor: string;
}

export const INSTITUICOES: Instituicao[] = [
  { id: "nubank", nome: "Nubank", aliases: ["nubank", "nu pagamentos", "nu financeira"], cor: "#8A05BE" },
  { id: "santander", nome: "Santander", aliases: ["santander"], cor: "#EC0000" },
  { id: "itau", nome: "Itaú", aliases: ["itau", "itaucard", "personnalite"], cor: "#EC7000" },
  { id: "bradesco", nome: "Bradesco", aliases: ["bradesco", "bradescard"], cor: "#CC092F" },
  { id: "bb", nome: "Banco do Brasil", aliases: ["banco do brasil", "bb ", "ourocard"], cor: "#FCFD01" },
  { id: "caixa", nome: "Caixa", aliases: ["caixa economica", "caixa econômica", "cef "], cor: "#005CA9" },
  { id: "inter", nome: "Inter", aliases: ["banco inter", "inter "], cor: "#FF7A00" },
  { id: "c6", nome: "C6 Bank", aliases: ["c6 bank", "c6bank", "c6 "], cor: "#242424" },
  { id: "picpay", nome: "PicPay", aliases: ["picpay"], cor: "#21C25E" },
  { id: "mercadopago", nome: "Mercado Pago", aliases: ["mercado pago", "mercadopago"], cor: "#00B1EA" },
  { id: "pagbank", nome: "PagBank", aliases: ["pagbank", "pagseguro"], cor: "#1BB99A" },
  { id: "neon", nome: "Neon", aliases: ["neon"], cor: "#00E5FF" },
  { id: "next", nome: "Next", aliases: ["banco next"], cor: "#00FF5F" },
  { id: "wise", nome: "Wise", aliases: ["wise"], cor: "#00B9FF" },
  { id: "xp", nome: "XP", aliases: ["xp investimentos", "banco xp"], cor: "#000000" },
  { id: "btg", nome: "BTG Pactual", aliases: ["btg"], cor: "#0B2A4A" },
  { id: "sicredi", nome: "Sicredi", aliases: ["sicredi"], cor: "#33A02C" },
  { id: "sicoob", nome: "Sicoob", aliases: ["sicoob"], cor: "#003641" },
];

export function normalizarTexto(texto: string): string {
  return (texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\-./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detecta a instituição citada em um texto (nome de arquivo, descrição, nome de conta...).
 * Também reconhece o padrão de exportação do Nubank ("NU_123456_01JAN2026...").
 */
export function detectarInstituicao(texto: string | null | undefined): Instituicao | null {
  if (!texto) return null;
  const bruto = String(texto);
  // ` ${...} ` permite aliases com espaço nas bordas (ex.: "inter ") sem casar "interno"
  const alvo = ` ${normalizarTexto(bruto)} `;
  for (const inst of INSTITUICOES) {
    if (inst.aliases.some(a => alvo.includes(` ${a.trim()} `) || (!a.trim().includes(" ") && a.trim().length >= 6 && alvo.includes(a.trim())))) {
      return inst;
    }
  }
  if (/^nu_\d+/i.test(bruto.trim())) {
    return INSTITUICOES.find(i => i.id === "nubank") || null;
  }
  return null;
}

/** As duas strings se referem à mesma instituição? */
export function mesmaInstituicao(a: string | null | undefined, b: string | null | undefined): boolean {
  const ia = detectarInstituicao(a);
  return Boolean(ia && ia.id === detectarInstituicao(b)?.id);
}

/**
 * Encontra o item (conta, cartão...) da mesma instituição citada no texto.
 * Considera os campos `nome` e `instituicao` do item.
 */
export function encontrarPorInstituicao<T extends { nome?: string | null; instituicao?: string | null }>(
  itens: T[],
  texto: string | null | undefined
): T | undefined {
  const inst = detectarInstituicao(texto);
  if (!inst) return undefined;
  return itens.find(item => {
    const doItem = detectarInstituicao(`${item.instituicao || ""} ${item.nome || ""}`);
    return doItem?.id === inst.id;
  });
}

/** O nome do arquivo indica extrato de conta (e não fatura de cartão)? */
export function nomeArquivoIndicaExtrato(nomeArquivo: string): boolean {
  const n = normalizarTexto(nomeArquivo);
  return /\b(extrato|conta corrente|statement)\b/.test(n) && !/\bfatura\b/.test(n);
}
