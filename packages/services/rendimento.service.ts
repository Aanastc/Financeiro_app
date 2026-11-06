/**
 * Rendimento estimado de renda fixa com as taxas REAIS de cada dia (Banco Central, API SGS).
 *
 * O usuário informa o tipo (CDI, Selic, prefixado, IPCA, poupança) e a taxa (ex.: 100% do CDI);
 * o sistema aplica o CDI/Selic de cada dia útil desde cada aplicação. O resultado deve bater
 * com o banco (diferenças pequenas vêm de IR/IOF e da regra de cada banco); quando não bate,
 * o usuário informa o valor do banco uma vez e o cálculo continua a partir dali.
 */

export type Fluxo = { data: string; valor: number }; // + aplicação, − resgate (data ISO)

const SERIES = { CDI: 12, SELIC: 11, IPCA: 433 } as const;
const memoria = new Map<string, { data: string; valor: number }[]>();

const isoParaBr = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};
const brParaIso = (br: string) => {
  const [d, m, a] = br.split("/");
  return `${a}-${m}-${d}`;
};
export const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Série diária/mensal do Banco Central entre duas datas (cache do dia em memória e no navegador). */
async function serie(codigo: number, de: string, ate: string): Promise<{ data: string; valor: number }[] | null> {
  const chave = `bcb:${codigo}:${de}:${ate}`;
  if (memoria.has(chave)) return memoria.get(chave)!;
  try {
    const salvo = typeof localStorage !== "undefined" ? localStorage.getItem(chave) : null;
    if (salvo) {
      const lista = JSON.parse(salvo);
      memoria.set(chave, lista);
      return lista;
    }
  } catch {
    /* sem cache */
  }
  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados?formato=json&dataInicial=${isoParaBr(de)}&dataFinal=${isoParaBr(ate)}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const bruto: { data: string; valor: string }[] = await resp.json();
    const lista = (Array.isArray(bruto) ? bruto : []).map((x) => ({ data: brParaIso(x.data), valor: Number(x.valor) || 0 }));
    memoria.set(chave, lista);
    try {
      localStorage.setItem(chave, JSON.stringify(lista));
    } catch {
      /* sem cache */
    }
    return lista;
  } catch {
    return null;
  }
}

export const INDEXADORES_CALCULAVEIS = ["CDI", "SELIC", "PREFIXADO", "IPCA", "POUPANCA"];

/**
 * Saldo estimado hoje a partir das aplicações/resgates.
 * Cada aplicação rende a partir do dia útil seguinte (regra dos bancos).
 * Valores brutos (antes de IR/IOF), como a maioria dos apps de banco mostra.
 * Retorna null se o tipo não é calculável ou a taxa do Banco Central não está disponível.
 */
export async function estimarSaldo(params: {
  indexador?: string | null;
  taxa?: number | null;
  fluxos: Fluxo[];
  ate?: string;
}): Promise<{ saldo: number; aplicado: number; rendimento: number } | null> {
  const indexador = String(params.indexador || "").toUpperCase();
  if (!INDEXADORES_CALCULAVEIS.includes(indexador)) return null;
  const fluxos = [...params.fluxos].filter((f) => f.data && Number.isFinite(f.valor)).sort((a, b) => a.data.localeCompare(b.data));
  if (fluxos.length === 0) return { saldo: 0, aplicado: 0, rendimento: 0 };
  const ate = params.ate || hojeIso();
  const inicio = fluxos[0].data;
  const taxa = params.taxa != null && Number.isFinite(Number(params.taxa)) ? Number(params.taxa) : null;

  // Dias úteis: a própria série do CDI (um registro por dia útil)
  const dias = await serie(SERIES.CDI, inicio, ate);
  if (!dias) return null;
  let selic: Map<string, number> | null = null;
  let ipca: Map<string, number> | null = null;
  if (indexador === "SELIC") {
    const s = await serie(SERIES.SELIC, inicio, ate);
    if (!s) return null;
    selic = new Map(s.map((x) => [x.data, x.valor]));
  }
  if (indexador === "IPCA") {
    const s = await serie(SERIES.IPCA, `${inicio.slice(0, 7)}-01`, ate);
    if (!s) return null;
    ipca = new Map(s.map((x) => [x.data.slice(0, 7), x.valor]));
  }
  const anual = (t: number) => Math.pow(1 + t / 100, 1 / 252);
  let ultimoIpca = 0;
  const fator = (d: { data: string; valor: number }) => {
    switch (indexador) {
      case "CDI":
        return 1 + (d.valor / 100) * ((taxa ?? 100) / 100);
      case "SELIC":
        return (1 + (selic!.get(d.data) ?? d.valor) / 100) * anual(taxa ?? 0);
      case "PREFIXADO":
        return anual(taxa ?? 0);
      case "IPCA": {
        const mes = ipca!.get(d.data.slice(0, 7));
        if (mes !== undefined) ultimoIpca = mes; // mês ainda sem IPCA divulgado: usa o último
        return Math.pow(1 + ultimoIpca / 100, 1 / 21) * anual(taxa ?? 0);
      }
      case "POUPANCA":
        return Math.pow(1.005, 1 / 21); // 0,5% ao mês (TR desconsiderada)
      default:
        return 1;
    }
  };

  let saldo = 0;
  let i = 0;
  for (const d of dias) {
    while (i < fluxos.length && fluxos[i].data < d.data) {
      saldo = Math.max(0, saldo + fluxos[i].valor);
      i++;
    }
    if (saldo > 0) saldo *= fator(d);
  }
  while (i < fluxos.length && fluxos[i].data <= ate) {
    saldo = Math.max(0, saldo + fluxos[i].valor);
    i++;
  }
  const aplicado = fluxos.reduce((s, f) => s + f.valor, 0);
  const centavos = (v: number) => Math.round(v * 100) / 100;
  return { saldo: centavos(saldo), aplicado: centavos(aplicado), rendimento: centavos(saldo - aplicado) };
}
