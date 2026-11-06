/**
 * Dados públicos usados nos impostos da empresa — buscados na fonte, não fixos no código:
 *  - feriados nacionais (BrasilAPI) → vencimento do DAS no próximo dia útil;
 *  - salário mínimo vigente (Banco Central, série SGS 1619) → DAS do MEI;
 *  - Selic acumulada no mês (Banco Central, série SGS 4390) → juros de imposto pago atrasado.
 * Tudo com cache de um dia no navegador e um valor de reserva se a fonte estiver fora do ar.
 */

/** Regra do DAS (Simples e MEI): vence no dia 20 do mês seguinte ao da competência.
 *  Se o dia 20 não for dia útil, vai para o próximo dia útil (LC 123/2006, art. 21; Res. CGSN 140/2018). */
export const DIA_VENCIMENTO_DAS = 20;

/** Reserva, se o Banco Central não responder (salário mínimo de 2025). */
export const SALARIO_MINIMO_RESERVA = 1518;

const UM_DIA = 24 * 60 * 60 * 1000;

async function comCache<T>(chave: string, buscar: () => Promise<T | null>, validadeMs = UM_DIA): Promise<T | null> {
  try {
    const salvo = typeof localStorage !== "undefined" ? localStorage.getItem(chave) : null;
    if (salvo) {
      const { em, valor } = JSON.parse(salvo);
      if (Date.now() - em < validadeMs) return valor as T;
    }
  } catch {
    /* sem cache */
  }
  try {
    const valor = await buscar();
    if (valor !== null && valor !== undefined) {
      try {
        localStorage.setItem(chave, JSON.stringify({ em: Date.now(), valor }));
      } catch {
        /* sem cache */
      }
    }
    return valor;
  } catch {
    return null;
  }
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Domingo de Páscoa (algoritmo de Meeus) — para a reserva de feriados móveis. */
function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function feriadosReserva(ano: number): string[] {
  const sextaSanta = pascoa(ano);
  sextaSanta.setDate(sextaSanta.getDate() - 2);
  return [`${ano}-01-01`, iso(sextaSanta), `${ano}-04-21`, `${ano}-05-01`, `${ano}-09-07`, `${ano}-10-12`, `${ano}-11-02`, `${ano}-11-15`, `${ano}-11-20`, `${ano}-12-25`];
}

/** Feriados nacionais do ano (BrasilAPI; reserva calculada se a API falhar). */
export async function feriadosNacionais(ano: number): Promise<Set<string>> {
  const lista = await comCache<string[]>(`feriados-br:${ano}`, async () => {
    const r = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
    if (!r.ok) return null;
    const dados = await r.json();
    return Array.isArray(dados) ? dados.map((f: any) => String(f.date).slice(0, 10)) : null;
  }, 7 * UM_DIA);
  return new Set(lista && lista.length ? lista : feriadosReserva(ano));
}

/** Próximo dia útil a partir da data (ela mesma, se já for útil). */
export function proximoDiaUtil(dataIso: string, feriados: Set<string>): string {
  const d = new Date(`${dataIso}T12:00:00`);
  while (d.getDay() === 0 || d.getDay() === 6 || feriados.has(iso(d))) d.setDate(d.getDate() + 1);
  return iso(d);
}

/** Calendário de vencimentos do DAS: devolve uma função competência ("2026-10") → vencimento real. */
export async function calendarioDas(anos: number[]): Promise<(competencia: string) => string> {
  const conjuntos = await Promise.all([...new Set(anos.flatMap((a) => [a, a + 1]))].map(feriadosNacionais));
  const feriados = new Set(conjuntos.flatMap((s) => [...s]));
  return (competencia: string) => {
    const [a, m] = competencia.split("-").map(Number);
    const base = new Date(a, m, DIA_VENCIMENTO_DAS); // mês seguinte
    return proximoDiaUtil(iso(base), feriados);
  };
}

/** Salário mínimo vigente (Banco Central, série 1619). */
export async function salarioMinimoVigente(): Promise<number> {
  const v = await comCache<number>("salario-minimo", async () => {
    const r = await fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs.1619/dados/ultimos/1?formato=json");
    if (!r.ok) return null;
    const [ultimo] = await r.json();
    const n = Number(String(ultimo?.valor || "").replace(",", "."));
    return n > 0 ? n : null;
  });
  return v || SALARIO_MINIMO_RESERVA;
}

/** Selic acumulada de cada mês (% no mês), Banco Central série 4390. */
async function selicMensal(deIso: string, ateIso: string): Promise<Record<string, number>> {
  const br = (d: string) => d.split("-").reverse().join("/");
  const v = await comCache<Record<string, number>>(`selic-mensal:${deIso.slice(0, 7)}:${ateIso.slice(0, 7)}`, async () => {
    const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.4390/dados?formato=json&dataInicial=${br(deIso)}&dataFinal=${br(ateIso)}`);
    if (!r.ok) return null;
    const lista = await r.json();
    const out: Record<string, number> = {};
    for (const x of lista || []) {
      const [, mm, aa] = String(x.data).split("/");
      out[`${aa}-${mm}`] = Number(String(x.valor).replace(",", "."));
    }
    return out;
  });
  return v || {};
}

export type Acrescimos = { diasAtraso: number; multa: number; juros: number; total: number; jurosPct: number; multaPct: number };

/**
 * Imposto federal pago depois do vencimento (Lei 9.430/96, art. 61):
 *  - multa de mora: 0,33% por dia de atraso, no máximo 20%;
 *  - juros: Selic acumulada dos meses entre o vencimento e o pagamento + 1% no mês do pagamento.
 * O valor exato sai no boleto gerado no PGDAS/PGMEI na data do pagamento.
 */
export async function acrescimosPorAtraso(valor: number, vencimentoIso: string, pagamentoIso: string): Promise<Acrescimos> {
  const venc = new Date(`${vencimentoIso}T12:00:00`);
  const pag = new Date(`${pagamentoIso}T12:00:00`);
  const diasAtraso = Math.max(0, Math.round((pag.getTime() - venc.getTime()) / UM_DIA));
  if (diasAtraso === 0) return { diasAtraso, multa: 0, juros: 0, total: valor, jurosPct: 0, multaPct: 0 };

  const multaPct = Math.min(20, diasAtraso * 0.33);
  let jurosPct = 0;
  const mesVenc = vencimentoIso.slice(0, 7);
  const mesPag = pagamentoIso.slice(0, 7);
  if (mesPag > mesVenc) {
    // meses cheios entre o mês seguinte ao vencimento e o mês anterior ao pagamento
    const ini = new Date(venc.getFullYear(), venc.getMonth() + 1, 1);
    const fim = new Date(pag.getFullYear(), pag.getMonth() - 1, 1);
    if (ini <= fim) {
      const selic = await selicMensal(iso(ini), iso(new Date(fim.getFullYear(), fim.getMonth() + 1, 0)));
      for (const d = new Date(ini); d <= fim; d.setMonth(d.getMonth() + 1)) {
        jurosPct += selic[iso(d).slice(0, 7)] ?? 1; // sem o dado do mês: estima 1%
      }
    }
    jurosPct += 1; // mês do pagamento
  }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const multa = r2((valor * multaPct) / 100);
  const juros = r2((valor * jurosPct) / 100);
  return { diasAtraso, multa, juros, total: r2(valor + multa + juros), jurosPct: r2(jurosPct), multaPct: r2(multaPct) };
}
