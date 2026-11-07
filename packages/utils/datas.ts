/**
 * Datas no fuso de quem usa o app (não em UTC).
 * `new Date().toISOString()` devolve a data em UTC: depois das 21h no Brasil já é "amanhã".
 * Use estas funções sempre que precisar de "hoje" ou de uma data AAAA-MM-DD.
 */

const dois = (n: number) => String(n).padStart(2, "0");

/** Data local no formato AAAA-MM-DD. */
export function dataLocalISO(d: Date = new Date()): string {
	return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** Hoje (local) no formato AAAA-MM-DD. */
export const hojeISO = () => dataLocalISO();

/** Mês atual (local) no formato AAAA-MM. */
export const mesAtualISO = () => dataLocalISO().slice(0, 7);

/** Último dia do mês (ex.: fevereiro de 2026 → 28). Mês de 1 a 12. */
export const ultimoDiaDoMes = (ano: number, mes: number) => new Date(ano, mes, 0).getDate();

/**
 * Data AAAA-MM-DD de um dia dentro de um mês AAAA-MM, sem passar do fim do mês
 * (dia 30 em fevereiro vira o último dia de fevereiro).
 */
export function diaNoMes(mesRef: string, dia: number): string {
	const [ano, mes] = mesRef.split("-").map(Number);
	return `${mesRef}-${dois(Math.min(Math.max(1, dia), ultimoDiaDoMes(ano, mes)))}`;
}
