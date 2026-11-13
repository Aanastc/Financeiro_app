import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import { diaNoMes, hojeISO } from "../../../../packages/utils/datas";

/**
 * Edição EM LOTE de lançamentos da divisão de contas (ex.: as compras de um vencimento).
 *
 * Segurança dos dados (o app está em produção):
 *   - nada é apagado: parcelar = o lançamento vira a parcela 1 e as outras são CRIADAS;
 *   - as parcelas novas são gravadas ANTES de mexer no original — se der erro, o original fica intacto;
 *   - ficam de fora (e são listados) itens já pagos/abatidos, já parcelados, de cartão ou que
 *     já movimentaram saldo de conta: mudar valor/data deles desalinharia saldo ou fatura.
 */

export interface ResultadoLote {
	alterados: number;
	ignorados: { descricao: string; motivo: string }[];
}

const lerMeta = (obs?: string | null): Record<string, any> => {
	const t = (obs || "").trim();
	if (!t.startsWith("{")) return t ? { observacao_original: t } : {};
	try {
		return JSON.parse(t);
	} catch {
		return { observacao_original: t };
	}
};
const centavos = (v: number) => Math.round(v * 100) / 100;
const nomeDe = (t: any) => String(lerMeta(t.observacao).descricao_original || t.descricao || "Lançamento");

/** Divide um valor em N partes que somam exatamente o total (a última leva os centavos que sobram). */
export function dividirEmParcelas(valor: number, n: number): number[] {
	const base = Math.floor((valor / n) * 100) / 100;
	const partes = Array.from({ length: n }, () => base);
	partes[n - 1] = centavos(valor - base * (n - 1));
	return partes;
}

/** Mesma data, N meses depois (dia 31 vira o último dia de meses mais curtos). */
export function somarMeses(dataISO: string, meses: number): string {
	const [a, m, d] = dataISO.split("-").map(Number);
	const alvo = new Date(a, m - 1 + meses, 1);
	return diaNoMes(`${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}`, d);
}

/** Motivo para NÃO alterar valor/data do item, ou null se pode. */
async function bloqueio(t: any, meta: Record<string, any>, exigirSemParcelas: boolean): Promise<string | null> {
	if (t.terceiro_pago || Number(meta.valor_pago) > 0) return "já tem pagamento registrado";
	if (meta.resposta_cobranca === "recusada") return "a cobrança foi recusada";
	if (t.cartao_id) return "é compra de cartão (a data define a fatura)";
	if (exigirSemParcelas && Number(meta.total_parcelas) > 1) return "já é parcelado";
	const { count } = await supabase.from("movimentacoes").select("id", { count: "exact", head: true }).eq("transacao_id", t.id);
	if ((count || 0) > 0) return "já movimentou o saldo de uma conta";
	return null;
}

/** Busca as linhas completas e atuais (as da tela podem ter dados de outras tabelas junto). */
async function linhasAtuais(ids: string[]) {
	const { data, error } = await supabase.from("transacoes").select("*").in("id", ids);
	if (error) throw error;
	return (data || []) as any[];
}

const descricaoDaParcela = (descricao: string, k: number, n: number) => {
	const limpa = String(descricao || "").replace(/\s*\(\d+\/\d+\)/, "");
	const parte = limpa.match(/\s*\(Parte [^)]*\)\s*$/i);
	return parte ? `${limpa.slice(0, parte.index)} (${k}/${n})${parte[0]}` : `${limpa} (${k}/${n})`;
};

/**
 * Parcela cada item em N vezes, com a 1ª parcela na data informada e as demais nos meses seguintes.
 * A data em que o item estava vira a "data da compra" (meta.data_compra), se ainda não houver.
 */
export async function parcelarEmLote(ids: string[], n: number, primeiraData: string): Promise<ResultadoLote> {
	const resultado: ResultadoLote = { alterados: 0, ignorados: [] };
	if (!(n >= 2 && n <= 48)) throw new Error("Número de parcelas inválido.");
	const hoje = hojeISO();

	for (const t of await linhasAtuais(ids)) {
		const meta = lerMeta(t.observacao);
		const motivo = await bloqueio(t, meta, true);
		if (motivo) {
			resultado.ignorados.push({ descricao: nomeDe(t), motivo });
			continue;
		}
		const valor = Number(t.valor) || 0;
		if (valor <= 0) {
			resultado.ignorados.push({ descricao: nomeDe(t), motivo: "valor zerado" });
			continue;
		}
		const partes = dividirEmParcelas(valor, n);
		const escala = (v: any, k: number) => (typeof v === "number" || (typeof v === "string" && v !== "" && !isNaN(Number(v))) ? centavos((Number(v) * partes[k]) / valor) : v);
		const metaDa = (k: number) => {
			const m: Record<string, any> = {
				...meta,
				parcela: k + 1,
				total_parcelas: n,
				data_compra: meta.data_compra || String(t.data).slice(0, 10),
				descricao_original: meta.descricao_original || String(t.descricao || "").replace(/\s*\(Parte [^)]*\)\s*$/i, "").replace(/\s*\(\d+\/\d+\)/, ""),
				parcelado_em_lote_em: new Date().toISOString(),
			};
			if (m.valor_total !== undefined) m.valor_total = escala(m.valor_total, k);
			if (Array.isArray(m.participantes)) m.participantes = m.participantes.map((p: any) => ({ ...p, valor_devido: escala(p.valor_devido, k) }));
			if (m.valor_compra === undefined) m.valor_compra = meta.valor_total !== undefined ? Number(meta.valor_total) : valor;
			return m;
		};
		const linhaDa = (k: number) => {
			const data = somarMeses(primeiraData, k);
			return { valor: partes[k], data, descricao: descricaoDaParcela(t.descricao, k + 1, n), observacao: JSON.stringify(metaDa(k)), status: data <= hoje ? "confirmada" : "pendente" };
		};

		// 1) cria as parcelas 2..N (cópia do original, sem id nem vínculos de fatura)
		const { id, created_at, criado_em, updated_at, atualizado_em, fatura_id, ...base } = t;
		void id; void created_at; void criado_em; void updated_at; void atualizado_em; void fatura_id;
		const novas = Array.from({ length: n - 1 }, (_, i) => ({ ...base, ...linhaDa(i + 1) }));
		const { error: errNovas } = await supabase.from("transacoes").insert(novas);
		if (errNovas) {
			console.error("Parcelar em lote — inserir parcelas:", errNovas);
			resultado.ignorados.push({ descricao: nomeDe(t), motivo: "não foi possível criar as parcelas (nada foi alterado)" });
			continue;
		}
		// 2) o original vira a parcela 1
		const { error: errOrig } = await supabase.from("transacoes").update(linhaDa(0)).eq("id", t.id);
		if (errOrig) {
			console.error("Parcelar em lote — atualizar original:", errOrig);
			resultado.ignorados.push({ descricao: nomeDe(t), motivo: "as parcelas foram criadas, mas o lançamento original não foi atualizado — confira e edite-o" });
			continue;
		}
		resultado.alterados++;
	}
	return resultado;
}

/** Muda o vencimento de todos os itens para a mesma data. */
export async function mudarVencimentoEmLote(ids: string[], novaData: string): Promise<ResultadoLote> {
	const resultado: ResultadoLote = { alterados: 0, ignorados: [] };
	const hoje = hojeISO();
	for (const t of await linhasAtuais(ids)) {
		const meta = lerMeta(t.observacao);
		const motivo = await bloqueio(t, meta, false);
		if (motivo) {
			resultado.ignorados.push({ descricao: nomeDe(t), motivo });
			continue;
		}
		const novaMeta = { ...meta, data_compra: meta.data_compra || String(t.data).slice(0, 10) };
		const { error } = await supabase
			.from("transacoes")
			.update({ data: novaData, status: novaData <= hoje ? "confirmada" : "pendente", observacao: JSON.stringify(novaMeta) })
			.eq("id", t.id);
		if (error) resultado.ignorados.push({ descricao: nomeDe(t), motivo: "erro ao salvar" });
		else resultado.alterados++;
	}
	return resultado;
}

/** Torna todos opcionais (a pessoa pode recusar) ou obrigatórios. Itens pagos ficam como estão. */
export async function definirOpcionalEmLote(ids: string[], opcional: boolean): Promise<ResultadoLote> {
	const resultado: ResultadoLote = { alterados: 0, ignorados: [] };
	for (const t of await linhasAtuais(ids)) {
		if (t.terceiro_pago) {
			resultado.ignorados.push({ descricao: nomeDe(t), motivo: "já está quitado" });
			continue;
		}
		if (!t.terceiro) {
			resultado.ignorados.push({ descricao: nomeDe(t), motivo: "é um valor que você deve (só cobranças podem ser opcionais)" });
			continue;
		}
		try {
			await financeService.definirCobrancaOpcional(t, opcional);
			resultado.alterados++;
		} catch {
			resultado.ignorados.push({ descricao: nomeDe(t), motivo: "erro ao salvar" });
		}
	}
	return resultado;
}
