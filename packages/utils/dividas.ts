/**
 * A qual cartão pertence uma dívida (renegociação/acordo de fatura)? Um lugar só.
 *
 * Regra:
 *  1. Dívida ligada a um cartão (cartao_id) → esse cartão.
 *  2. Dívida nascida de uma fatura (fatura_origem_id) → o cartão daquela fatura.
 *  3. Senão, só se for renegociação de cartão: o cartão do mesmo banco (instituição ou
 *     descrição da dívida × nome do cartão). Com dois cartões do mesmo banco, fica com o
 *     primeiro — assim a parcela nunca é contada duas vezes.
 * Empréstimo e consignado nunca são do cartão.
 */
import { mesmaInstituicao } from "./instituicoes";

type Cartao = { id: string; nome?: string | null };
type Divida = {
	cartao_id?: string | null;
	fatura_origem_id?: string | null;
	tipo?: string | null;
	descricao?: string | null;
	instituicao?: string | null;
};

const minusculo = (s?: string | null) => String(s || "").toLowerCase();

/** É uma renegociação/acordo de fatura de cartão (e não empréstimo/consignado)? */
export function ehRenegociacaoDeCartao(d: Divida): boolean {
	const tipo = minusculo(d.tipo);
	const desc = minusculo(d.descricao);
	if (tipo === "consignado" || tipo === "emprestimo" || /consignado|empr[eé]stimo/.test(desc)) return false;
	if (tipo === "renegociacao_cartao") return true;
	return /renegocia|acordo/.test(desc) && /cart[aã]o|fatura/.test(desc);
}

/**
 * Id do cartão a que a dívida pertence, ou null.
 * `faturas` (opcional) liga a dívida ao cartão pela fatura de origem.
 */
export function cartaoDaDivida(d: Divida, cartoes: Cartao[], faturas: { id: string; cartao_id: string }[] = []): string | null {
	if (d.cartao_id) return cartoes.some((c) => c.id === d.cartao_id) ? d.cartao_id : null;
	if (d.fatura_origem_id) {
		const fatura = faturas.find((f) => f.id === d.fatura_origem_id);
		if (fatura) return fatura.cartao_id;
	}
	if (!ehRenegociacaoDeCartao(d)) return null;
	const texto = `${d.instituicao || ""} ${d.descricao || ""}`;
	return cartoes.find((c) => mesmaInstituicao(texto, c.nome))?.id ?? null;
}
