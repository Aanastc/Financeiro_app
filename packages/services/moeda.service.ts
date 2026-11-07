import { hojeISO } from "../utils/datas";
/**
 * Moedas e cotações.
 *
 * - Contas podem ter moeda própria (contas_bancarias.moeda; padrão BRL).
 * - Cotação = quantos REAIS vale 1 unidade da moeda, na data do lançamento.
 *   Fonte: Frankfurter (Banco Central Europeu, com histórico) e, se falhar,
 *   AwesomeAPI. Fica em cache no navegador por data.
 */

export const MOEDAS: { codigo: string; nome: string; local: string }[] = [
  { codigo: "BRL", nome: "Real", local: "pt-BR" },
  { codigo: "USD", nome: "Dólar americano", local: "en-US" },
  { codigo: "CAD", nome: "Dólar canadense", local: "en-CA" },
  { codigo: "EUR", nome: "Euro", local: "de-DE" },
  { codigo: "GBP", nome: "Libra esterlina", local: "en-GB" },
  { codigo: "AUD", nome: "Dólar australiano", local: "en-AU" },
  { codigo: "CHF", nome: "Franco suíço", local: "de-CH" },
  { codigo: "JPY", nome: "Iene", local: "ja-JP" },
  { codigo: "ARS", nome: "Peso argentino", local: "es-AR" },
  { codigo: "MXN", nome: "Peso mexicano", local: "es-MX" },
];

export const ehReal = (moeda?: string | null) => !moeda || moeda.toUpperCase() === "BRL";

const SIMBOLOS: Record<string, string> = {
  BRL: "R$",
  USD: "US$",
  CAD: "CA$",
  EUR: "€",
  GBP: "£",
  AUD: "A$",
  CHF: "CHF",
  JPY: "¥",
  ARS: "AR$",
  MXN: "MX$",
};

export const simboloMoeda = (moeda?: string | null) => SIMBOLOS[(moeda || "BRL").toUpperCase()] || (moeda || "BRL").toUpperCase();

/** "CA$ 500,00" / "R$ 1.234,56" — sempre com separadores brasileiros. */
export function formatarMoeda(valor: number, moeda = "BRL"): string {
  const n = Number(valor || 0);
  const numero = Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}${simboloMoeda(moeda)} ${numero}`;
}

const CHAVE_CACHE = "finance_cotacoes_v1";

const lerCache = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CACHE) || "{}");
  } catch {
    return {};
  }
};
const gravarCache = (chave: string, valor: number) => {
  try {
    const c = lerCache();
    c[chave] = valor;
    // guarda só as 300 mais recentes
    const entradas = Object.entries(c).slice(-300);
    localStorage.setItem(CHAVE_CACHE, JSON.stringify(Object.fromEntries(entradas)));
  } catch {
    /* sem armazenamento */
  }
};

async function buscarFrankfurter(moeda: string, data: string): Promise<number | null> {
  const res = await fetch(`https://api.frankfurter.dev/v1/${data}?base=${moeda}&symbols=BRL`);
  if (!res.ok) return null;
  const j = await res.json();
  const v = Number(j?.rates?.BRL);
  return Number.isFinite(v) && v > 0 ? v : null;
}

async function buscarAwesome(moeda: string, data: string): Promise<number | null> {
  const d = data.replace(/-/g, "");
  const url =
    data === hojeISO()
      ? `https://economia.awesomeapi.com.br/json/last/${moeda}-BRL`
      : `https://economia.awesomeapi.com.br/json/daily/${moeda}-BRL/?start_date=${d}&end_date=${d}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = await res.json();
  const item = Array.isArray(j) ? j[0] : j?.[`${moeda}BRL`];
  const v = Number(item?.bid);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export const moedaService = {
  /**
   * Quantos reais vale 1 unidade de `moeda` na `data` (AAAA-MM-DD).
   * Datas futuras usam a cotação de hoje. Devolve null se não conseguir.
   */
  async cotacao(moeda: string, data = hojeISO()): Promise<number | null> {
    const m = (moeda || "BRL").toUpperCase();
    if (m === "BRL") return 1;
    const dia = data > hojeISO() ? hojeISO() : data;
    const chave = `${m}:${dia}`;
    const cache = lerCache()[chave];
    if (cache) return cache;
    for (const fonte of [buscarFrankfurter, buscarAwesome]) {
      try {
        const v = await fonte(m, dia);
        if (v) {
          gravarCache(chave, v);
          return v;
        }
      } catch {
        /* tenta a próxima fonte */
      }
    }
    return null;
  },

  /** Converte `valor` de `moeda` para reais. Sem cotação disponível, devolve null. */
  async paraReais(valor: number, moeda: string, data?: string, cotacaoManual?: number | null): Promise<{ reais: number; cotacao: number } | null> {
    if (ehReal(moeda)) return { reais: valor, cotacao: 1 };
    const cot = cotacaoManual && cotacaoManual > 0 ? cotacaoManual : await this.cotacao(moeda, data);
    if (!cot) return null;
    return { reais: Math.round(valor * cot * 100) / 100, cotacao: cot };
  },
};
