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

/**
 * Situação de pagamento de um lançamento, incluindo o que foi pago/abatido na
 * Divisão de contas (fica guardado na observação: valor_pago e pagamentos).
 * - quitado: pago por inteiro (ou marcado como pago)
 * - pago: quanto já foi pago/abatido · falta: quanto ainda está em aberto
 * - abatido: parte quitada descontando de um empréstimo/adiantamento (estilo Splitwise)
 */
export function situacaoPagamento(t: any): { quitado: boolean; pago: number; falta: number; abatido: boolean; parcial: boolean } {
	const valor = Number(t?.valor || 0);
	const meta = lerMeta(t?.observacao);
	// Só a sua parte de uma conta que OUTRA pessoa pagou: o que vale é quanto você já devolveu a ela
	const daDivisao = Boolean(meta?.parceria_credor_id);
	if (!daDivisao) {
		const quitado = !t?.status || t.status === "confirmada";
		return { quitado, pago: quitado ? valor : 0, falta: quitado ? 0 : valor, abatido: false, parcial: false };
	}
	const pago = Math.min(valor, Number(meta?.valor_pago) || 0);
	const quitado = Boolean(t?.terceiro_pago) || pago >= valor - 0.009;
	const abatido = Array.isArray(meta?.pagamentos) && meta!.pagamentos.some((p: any) => p?.tipo === "compensacao");
	const falta = quitado ? 0 : Math.round((valor - pago) * 100) / 100;
	return { quitado, pago: quitado ? valor : pago, falta, abatido, parcial: !quitado && pago > 0.009 };
}
