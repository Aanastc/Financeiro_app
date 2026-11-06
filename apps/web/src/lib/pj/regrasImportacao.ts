/**
 * Regras do importador para extrato da conta da EMPRESA (CNPJ).
 * O motor do importador (ler o arquivo, achar a conta, tirar repetidos, saldo, transferências)
 * é o mesmo da pessoa física; o que muda é COMO cada linha é classificada — e isso fica aqui.
 * Usado em contexts/ImportarContext.tsx quando a conta do extrato é de uma empresa.
 */

type TipoLinha = "Gasto" | "Entrada" | "Meta" | "PagamentoFatura" | "Transferencia" | "Fatura" | "Resgate";

const semAcento = (s: string) =>
	(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Linha do extrato da conta da EMPRESA (CNPJ). A lógica é outra que a pessoal:
 *  - dinheiro que entra de terceiros = faturamento (cliente pagando);
 *  - Receita Federal / DAS / Simples / DARF = imposto federal;
 *  - prefeitura / ISS / convênio municipal = imposto municipal;
 *  - contador / "soluções empresariais" / honorários = contabilidade;
 *  - tarifas do banco = tarifa bancária.
 * Pix para você mesma e aplicações são tratados antes (retirada e caixinha da empresa).
 */
export function regraDaEmpresa(
	descricao: string,
	_valor: number,
	tipoAtual: TipoLinha,
): { categoria: string; tipo_transacao: TipoLinha } | null {
	const d = semAcento(descricao || "");
	if (/receita federal|simples nacional|\bdas\b|pgdas|darf|\binss\b|\birpj\b|\bcsll\b|\bpis\b|\bcofins\b/.test(d)) {
		return { categoria: "Impostos federais (DAS)", tipo_transacao: "Gasto" };
	}
	if (/prefeitura|municipal|\biss\b|\biptu\b|alvara/.test(d)) {
		return { categoria: "Impostos municipais (ISS)", tipo_transacao: "Gasto" };
	}
	if (/contab|contador|solucoes empresariais|escritorio|honorario/.test(d)) {
		return { categoria: "Contabilidade", tipo_transacao: "Gasto" };
	}
	if (/tarifa|pacote de servicos|manutencao de conta/.test(d)) {
		return { categoria: "Tarifas Bancárias", tipo_transacao: "Gasto" };
	}
	if (tipoAtual === "Entrada") return { categoria: "Faturamento", tipo_transacao: "Entrada" };
	return null;
}
