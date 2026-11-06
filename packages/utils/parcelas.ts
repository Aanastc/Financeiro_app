/**
 * Leitura de "parcela n/N" na descrição — num lugar só.
 *
 * "dd/mm" parece parcela e não é: "Juros ... (Período: 03/09 a 02/10/26)" virava
 * "parcela 3/9" e geraria as parcelas 4..9. Por isso, antes de procurar:
 *  - tudo depois de "Período" sai;
 *  - intervalos "03/09 a 02/10", datas completas "02/10/26" e "04/11 08:23" saem.
 * Com a palavra "parcela/parc" vale em qualquer lugar; o "n/N" solto só no fim do texto
 * (padrão de fatura: "LOJA X 02/06") e nunca quando `exigirPalavra` (extrato de conta,
 * onde "10/10 supermercado" é a data da compra no débito).
 */

export type ParcelaLida = { atual: number; total: number; trecho: string };

export function semDatas(texto: string): string {
	return String(texto || "")
		.replace(/per[ií]odo\b[\s\S]*$/i, " ")
		.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*(?:a|at[eé]|-|–)\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/gi, " ")
		.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, " ")
		.replace(/\b\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}\b/g, " ");
}

export function lerParcelaDaDescricao(texto: string | null | undefined, opts: { exigirPalavra?: boolean } = {}): ParcelaLida | null {
	const t = semDatas(String(texto || ""));
	let m = t.match(/[-–—]?\s*(?:parcela|parc\.?)\s*\(?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\)?/i);
	if (!m && !opts.exigirPalavra) {
		m = t.match(/[-–—]?\s*\(?(\d{1,2})\s*\/\s*(\d{1,2})\)?\s*$/) || t.match(/[-–—]?\s*\b(\d{1,2})\s+de\s+(\d{1,2})\s*$/i);
	}
	if (!m) return null;
	const atual = Number(m[1]);
	const total = Number(m[2]);
	if (!(total >= 2 && atual >= 1 && atual <= total)) return null;
	return { atual, total, trecho: m[0] };
}

/** Descrição sem o pedaço "- Parcela n/N" (só se for parcela de verdade). */
export function descricaoSemParcela(texto: string | null | undefined): string {
	const s = String(texto || "");
	const p = lerParcelaDaDescricao(s);
	if (!p) return s.trim();
	return s.replace(p.trecho, " ").replace(/\s+/g, " ").replace(/\s*[-–—]\s*$/, "").trim();
}
