/** Regras comuns para listar lançamentos em Gastos e Entradas. */

const lerMeta = (obs?: string | null): Record<string, any> | null => {
	const t = (obs || "").trim();
	if (!t.startsWith("{")) return null;
	try {
		return JSON.parse(t);
	} catch {
		return null;
	}
};

/**
 * Entra nos totais, gráficos e categorias?
 * Receita sempre entra (inclusive reembolso da divisão de contas: é dinheiro que
 * entrou na conta). Despesa marcada como "não soma" (parcela de renegociação etc.) não entra.
 */
export const contaNoTotal = (t: any) => String(t?.tipo || "").toUpperCase() === "RECEITA" || t?.considerar_soma !== false;

/**
 * Parte de outra pessoa que já está no seu extrato/fatura: é dinheiro a receber,
 * não gasto seu. Fica só na Divisão de contas.
 */
export const ehParteDeOutraPessoa = (t: any) => Boolean(t?.terceiro) && t?.considerar_soma === false;

/** Observação legível (nunca o JSON interno). */
export function textoObservacao(obs?: string | null): string {
	const meta = lerMeta(obs);
	if (!meta) return String(obs || "").trim();
	if (meta.observacao_original) return String(meta.observacao_original);
	if (meta.acerto_divisao) return `Recebido de ${meta.contato_nome || "contato"} · divisão de contas`;
	if (meta.parceria_credor_id) return `Sua parte · ${meta.parceria_credor_nome || meta.contato_nome || "outra pessoa"} pagou`;
	if (meta.terceiro || meta.is_split || meta.split_tipo) {
		const quem = meta.contato_nome || meta.grupo_nome;
		return quem ? `Divisão de contas · ${quem}` : "Divisão de contas";
	}
	if (typeof meta.observacao === "string") return meta.observacao;
	return "";
}
