import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import { buscarTodasPaginas } from "../../../../packages/services/paginacao";
import { idsDaEmpresa, ehDaEmpresa } from "../../../../packages/services/empresa.service";
import { dataLocalISO } from "../../../../packages/utils/datas";
import { contaNoTotal, ehParteDeOutraPessoa } from "./lancamentos";

/**
 * Retrato financeiro do usuário para o Consultor (educador financeiro).
 *
 * Usa as MESMAS regras das telas de Gastos e Entradas, para os números baterem:
 *   - gasto = DESPESA − ESTORNO, sem a parte de outras pessoas, sem "não soma" e sem a empresa;
 *   - renda = RECEITA da pessoa física; reembolsos da divisão de contas ficam à parte.
 * Médias mensais usam os últimos 3 meses FECHADOS (o mês corrente ainda está incompleto).
 * Nenhum nome de pessoa (Pix/transferência) vai para a IA.
 */

export type Fase = "organizar" | "sair_das_dividas" | "construir_reserva" | "investir_e_metas";

export interface ContextoFinanceiro {
	ano: number;
	hoje: string;
	mesesBase: string[];
	rendaMediaMensal: number;
	gastoMedioMensal: number;
	sobraMediaMensal: number;
	taxaPoupancaMedia: number; // %
	totaisAno: { renda: number; gastos: number; saldo: number; taxaPoupanca: number; reembolsos: number };
	mensal: { mes: string; renda: number; gastos: number }[];
	categorias: { nome: string; total: number; mediaMensal: number; pct: number }[];
	fixoVariavel: { fixo: number; variavel: number; semClassificacao: number };
	recorrentes: { descricao: string; valorMedio: number; meses: number }[];
	saldoContas: number;
	investimentos: { total: number; liquidezDiaria: number; porTipo: { tipo: string; valor: number }[] };
	reserva: { disponivel: number; mesesCobertos: number };
	cartoes: { nome: string; limite: number; proximaFatura: number; vencimento: string | null; parcelasFuturas: number; usoLimitePct: number }[];
	dividas: { descricao: string; instituicao: string; restante: number; parcelaMensal: number; parcelasRestantes: number; parcelasPagas: number }[];
	totalDividas: number;
	parcelasDividasMes: number;
	comprometimentoDividasPct: number; // parcelas de dívida / renda média
	metas: { titulo: string; alvo: number; acumulado: number; pct: number; prazo: string | null; mesesRestantes: number | null; aporteMensalNecessario: number | null }[];
	aReceberDivisao: number;
	fase: Fase;
}

const c2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const ym = (iso: string) => String(iso).slice(0, 7);
const mesesAtras = (n: number, base = new Date()) => {
	const d = new Date(base.getFullYear(), base.getMonth() - n, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const lerMeta = (obs?: string | null): Record<string, any> => {
	try {
		return obs && obs.trim().startsWith("{") ? JSON.parse(obs) : {};
	} catch {
		return {};
	}
};
const norm = (t: string) =>
	(t || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/\s*-?\s*parcela\s*\d+\s*\/\s*\d+/g, "")
		.replace(/\(\d+\/\d+\)/g, "")
		.replace(/[\d*#]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 40);

/** Transferências e Pix carregam nomes de pessoas: nunca viram "recorrente" para a IA. */
const PESSOAL = /pix|transfer|\bted\b|\bdoc\b|saque|pagamento de fatura|pagamento recebido/i;

export function definirFase(c: Pick<ContextoFinanceiro, "sobraMediaMensal" | "rendaMediaMensal" | "totalDividas" | "comprometimentoDividasPct" | "reserva">): Fase {
	if (c.rendaMediaMensal > 0 && c.sobraMediaMensal < 0) return "organizar";
	if (c.totalDividas > 0 && (c.comprometimentoDividasPct >= 10 || c.reserva.mesesCobertos >= 1)) return "sair_das_dividas";
	if (c.reserva.mesesCobertos < 6) return "construir_reserva";
	return "investir_e_metas";
}

/** Nota de 5 a 98, explicável: cada critério soma ou tira pontos. */
export function calcularNota(c: ContextoFinanceiro) {
	const criterios: { rotulo: string; pontos: number }[] = [];
	const t = c.taxaPoupancaMedia;
	criterios.push({ rotulo: "Sobra do mês", pontos: c.rendaMediaMensal <= 0 ? 0 : t >= 20 ? 20 : t >= 10 ? 12 : t > 0 ? 5 : -20 });
	const r = c.reserva.mesesCobertos;
	criterios.push({ rotulo: "Reserva de emergência", pontos: r >= 6 ? 15 : r >= 3 ? 8 : r >= 1 ? 2 : -5 });
	const d = c.comprometimentoDividasPct;
	criterios.push({ rotulo: "Peso das dívidas", pontos: c.totalDividas <= 0 ? 15 : d < 15 ? 8 : d < 30 ? 0 : -15 });
	const usoAlto = c.cartoes.some((k) => k.limite > 0 && k.usoLimitePct > 80);
	if (usoAlto) criterios.push({ rotulo: "Limite do cartão quase todo usado", pontos: -5 });
	const nota = Math.max(5, Math.min(98, 50 + criterios.reduce((s, k) => s + k.pontos, 0)));
	return { nota, criterios };
}

export async function montarContextoFinanceiro(usuarioId: string, ano: number): Promise<ContextoFinanceiro> {
	const hoje = dataLocalISO();
	const mesAtual = ym(hoje);
	const mesesBase = [mesesAtras(3), mesesAtras(2), mesesAtras(1)];
	const inicioBusca = [`${ano}-01-01`, `${mesesAtras(6)}-01`].sort()[0];
	const fimBusca = `${Math.max(ano, Number(hoje.slice(0, 4)))}-12-31`;

	const [empresa, transacoes, contas, cartoes, faturas, futurasCartao, dividas, investimentos, metas, devedores] = await Promise.all([
		idsDaEmpresa(usuarioId),
		buscarTodasPaginas<any>((de, ate) =>
			supabase
				.from("transacoes")
				.select("id, data, valor, tipo, descricao, observacao, considerar_soma, terceiro, cartao_id, conta_id, categorias(nome)")
				.eq("usuario_id", usuarioId)
				.in("tipo", ["RECEITA", "DESPESA", "ESTORNO"])
				.gte("data", inicioBusca)
				.lte("data", fimBusca)
				.order("id")
				.range(de, ate),
		).catch(() => [] as any[]),
		financeService.getContasBancarias(usuarioId).catch(() => [] as any[]),
		financeService.getCartoes(usuarioId).catch(() => [] as any[]),
		supabase
			.from("faturas")
			.select("cartao_id, data_vencimento, valor_total, valor_pago, status")
			.eq("usuario_id", usuarioId)
			.neq("status", "paga")
			.gte("data_vencimento", hoje)
			.order("data_vencimento")
			.then((r) => r.data || []),
		supabase
			.from("transacoes")
			.select("cartao_id, valor, tipo")
			.eq("usuario_id", usuarioId)
			.not("cartao_id", "is", null)
			.eq("tipo", "DESPESA")
			.gt("data", hoje)
			.limit(5000)
			.then((r) => r.data || []),
		financeService.getDividas(usuarioId).catch(() => [] as any[]),
		financeService.getInvestimentos(usuarioId).catch(() => [] as any[]),
		supabase
			.from("metas")
			.select("*, metas_depositos(valor)")
			.eq("usuario_id", usuarioId)
			.then((r) => r.data || []),
		financeService.getDevedores(usuarioId).catch(() => [] as any[]),
	]);

	// --- Lançamentos pessoais, com as regras das telas
	const pessoais = (transacoes as any[]).filter((t) => !ehDaEmpresa(t, empresa));
	const valorGasto = (t: any) => {
		if (t.tipo !== "DESPESA" && t.tipo !== "ESTORNO") return 0;
		if (ehParteDeOutraPessoa(t) || !contaNoTotal(t)) return 0;
		return (t.tipo === "ESTORNO" ? -1 : 1) * Number(t.valor || 0);
	};
	const ehReembolso = (t: any) => t.tipo === "RECEITA" && Boolean(lerMeta(t.observacao).acerto_divisao);
	const valorRenda = (t: any) => (t.tipo === "RECEITA" && !ehReembolso(t) ? Number(t.valor || 0) : 0);

	const porMes = new Map<string, { renda: number; gastos: number }>();
	for (const t of pessoais) {
		const m = ym(t.data);
		const o = porMes.get(m) || { renda: 0, gastos: 0 };
		o.renda += valorRenda(t);
		o.gastos += valorGasto(t);
		porMes.set(m, o);
	}

	// Base das médias: 3 meses fechados com movimento (usuário novo: o que houver, inclusive o mês atual)
	let base = mesesBase.filter((m) => porMes.has(m));
	if (base.length === 0) base = porMes.has(mesAtual) ? [mesAtual] : [];
	const media = (f: (o: { renda: number; gastos: number }) => number) =>
		base.length ? c2(base.reduce((s, m) => s + f(porMes.get(m)!), 0) / base.length) : 0;
	const rendaMediaMensal = media((o) => o.renda);
	const gastoMedioMensal = Math.max(0, media((o) => o.gastos));
	const sobraMediaMensal = c2(rendaMediaMensal - gastoMedioMensal);
	const taxaPoupancaMedia = rendaMediaMensal > 0 ? Math.round((sobraMediaMensal / rendaMediaMensal) * 100) : 0;

	// --- Ano selecionado
	const doAno = pessoais.filter((t) => String(t.data).startsWith(String(ano)));
	const rendaAno = c2(doAno.reduce((s, t) => s + valorRenda(t), 0));
	const gastosAno = c2(Math.max(0, doAno.reduce((s, t) => s + valorGasto(t), 0)));
	const reembolsosAno = c2(doAno.filter(ehReembolso).reduce((s, t) => s + Number(t.valor || 0), 0));
	const ultimoMes = ano === Number(hoje.slice(0, 4)) ? Number(hoje.slice(5, 7)) : 12;
	const mensal = Array.from({ length: ultimoMes }, (_, i) => {
		const m = `${ano}-${String(i + 1).padStart(2, "0")}`;
		const o = porMes.get(m) || { renda: 0, gastos: 0 };
		return { mes: m, renda: c2(o.renda), gastos: c2(Math.max(0, o.gastos)) };
	});

	// --- Categorias do ano
	const catMap = new Map<string, number>();
	for (const t of doAno) {
		const v = valorGasto(t);
		if (!v) continue;
		const nome = t.categorias?.nome || (t.tipo === "ESTORNO" ? "Estornos" : "Sem categoria");
		catMap.set(nome, (catMap.get(nome) || 0) + v);
	}
	const mesesNoAno = Math.max(1, mensal.filter((m) => m.gastos > 0 || m.renda > 0).length);
	const categorias = [...catMap.entries()]
		.filter(([, v]) => v > 0)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 8)
		.map(([nome, total]) => ({ nome, total: c2(total), mediaMensal: c2(total / mesesNoAno), pct: gastosAno > 0 ? Math.round((total / gastosAno) * 100) : 0 }));

	// --- Fixo x variável (média dos meses-base, pela classificação gravada no lançamento)
	const fv = { fixo: 0, variavel: 0, semClassificacao: 0 };
	for (const t of pessoais) {
		if (!base.includes(ym(t.data))) continue;
		const v = valorGasto(t);
		if (v <= 0) continue;
		const m = String(t.observacao || "").match(/Classifica[cç][aã]o:\s*(Fix|Vari)/i);
		if (!m) fv.semClassificacao += v;
		else if (/fix/i.test(m[1])) fv.fixo += v;
		else fv.variavel += v;
	}
	const div = Math.max(1, base.length);
	const fixoVariavel = { fixo: c2(fv.fixo / div), variavel: c2(fv.variavel / div), semClassificacao: c2(fv.semClassificacao / div) };

	// --- Gastos recorrentes (assinaturas, contas do mês): mesma descrição em 3+ dos últimos 6 meses
	const ult6 = new Set(Array.from({ length: 6 }, (_, i) => mesesAtras(i + 1)));
	const rec = new Map<string, { descricao: string; meses: Set<string>; total: number; n: number }>();
	for (const t of pessoais) {
		if (t.tipo !== "DESPESA" || !ult6.has(ym(t.data)) || valorGasto(t) <= 0) continue;
		const desc = String(t.descricao || "");
		if (PESSOAL.test(desc) || /parcela\s*\d+\s*\/\s*\d+/i.test(desc)) continue;
		const k = norm(desc);
		if (k.length < 3) continue;
		const o = rec.get(k) || { descricao: desc.replace(/\s+/g, " ").slice(0, 40), meses: new Set<string>(), total: 0, n: 0 };
		o.meses.add(ym(t.data));
		o.total += Number(t.valor || 0);
		o.n++;
		rec.set(k, o);
	}
	const recorrentes = [...rec.values()]
		.filter((o) => o.meses.size >= 3)
		.map((o) => ({ descricao: o.descricao, valorMedio: c2(o.total / o.meses.size), meses: o.meses.size }))
		.sort((a, b) => b.valorMedio - a.valorMedio)
		.slice(0, 10);

	// --- Dinheiro guardado
	const contasPF = (contas as any[]).filter((k) => !k.empresa_id && k.ativa !== false);
	const saldoContas = c2(contasPF.reduce((s, k) => s + Number(k.saldo_reais ?? (!k.moeda || k.moeda === "BRL" ? k.saldo_atual : 0) ?? 0), 0));
	const valorInv = (i: any) => Number(i.valor_atual ?? i.valor_investido ?? 0) || 0;
	const invTotal = c2((investimentos as any[]).reduce((s, i) => s + valorInv(i), 0));
	const invLiquidez = c2((investimentos as any[]).filter((i) => i.liquidez_diaria).reduce((s, i) => s + valorInv(i), 0));
	const tipoMap = new Map<string, number>();
	for (const i of investimentos as any[]) tipoMap.set(i.tipo || "Outros", (tipoMap.get(i.tipo || "Outros") || 0) + valorInv(i));
	const reservaDisponivel = c2(Math.max(0, saldoContas) + invLiquidez);
	const mesesCobertos = gastoMedioMensal > 0 ? Math.round((reservaDisponivel / gastoMedioMensal) * 10) / 10 : 0;

	// --- Cartões
	const cartoesPF = (cartoes as any[]).filter((k) => !empresa.cartoes.has(k.id));
	const cartoesCtx = cartoesPF.map((k) => {
		const prox = (faturas as any[]).find((f) => f.cartao_id === k.id);
		const proximaFatura = prox ? c2(Math.max(0, Number(prox.valor_total || 0) - Number(prox.valor_pago || 0))) : 0;
		const parcelasFuturas = c2((futurasCartao as any[]).filter((f) => f.cartao_id === k.id).reduce((s, f) => s + Number(f.valor || 0), 0));
		const limite = Number(k.limite || 0);
		return {
			nome: k.nome,
			limite,
			proximaFatura,
			vencimento: prox?.data_vencimento || null,
			parcelasFuturas,
			usoLimitePct: limite > 0 ? Math.round(((proximaFatura + parcelasFuturas) / limite) * 100) : 0,
		};
	});

	// --- Dívidas
	const dividasCtx = (dividas as any[])
		.filter((d) => d.status !== "quitada")
		.map((d) => {
			const parcelas = d.parcelas_divida || [];
			const pendentes = parcelas.filter((p: any) => p.status !== "paga").sort((a: any, b: any) => String(a.data_vencimento).localeCompare(String(b.data_vencimento)));
			const restante = pendentes.length ? pendentes.reduce((s: number, p: any) => s + Number(p.valor_esperado || 0), 0) : Number(d.valor_atual || d.valor_original || 0);
			return {
				descricao: d.descricao || "Dívida",
				instituicao: d.instituicao || "",
				restante: c2(restante),
				parcelaMensal: c2(Number(pendentes[0]?.valor_esperado || 0)),
				parcelasRestantes: pendentes.length,
				parcelasPagas: parcelas.length - pendentes.length,
			};
		});
	const totalDividas = c2(dividasCtx.reduce((s, d) => s + d.restante, 0));
	const parcelasDividasMes = c2(dividasCtx.reduce((s, d) => s + d.parcelaMensal, 0));
	const comprometimentoDividasPct = rendaMediaMensal > 0 ? Math.round((parcelasDividasMes / rendaMediaMensal) * 100) : 0;

	// --- Metas (depósitos + investimentos ligados à meta)
	const metaDoInv = (corretora?: string) => corretora?.match(/\[Meta:\s*([^\]]+)\]/)?.[1] || null;
	const metasCtx = (metas as any[]).map((m) => {
		const depositos = (m.metas_depositos || []).reduce((s: number, d: any) => s + Number(d.valor || 0), 0);
		const ligados = (investimentos as any[]).filter((i) => metaDoInv(i.corretora) === m.id).reduce((s, i) => s + valorInv(i), 0);
		const alvo = Number(m.valor || 0);
		const acumulado = c2(depositos + ligados);
		const prazo = m.prazo ? String(m.prazo).slice(0, 10) : null;
		let mesesRestantes: number | null = null;
		if (prazo) {
			const [a, mm] = prazo.split("-").map(Number);
			const [ha, hm] = hoje.split("-").map(Number);
			mesesRestantes = Math.max(0, (a - ha) * 12 + (mm - hm));
		}
		const falta = Math.max(0, alvo - acumulado);
		return {
			titulo: m.titulo,
			alvo: c2(alvo),
			acumulado,
			pct: alvo > 0 ? Math.min(100, Math.round((acumulado / alvo) * 100)) : 0,
			prazo,
			mesesRestantes,
			aporteMensalNecessario: mesesRestantes && mesesRestantes > 0 ? c2(falta / mesesRestantes) : falta > 0 ? c2(falta) : 0,
		};
	});

	const aReceberDivisao = c2((devedores as any[]).reduce((s, d) => s + Number(d.total_devido || 0), 0));

	const ctx: ContextoFinanceiro = {
		ano,
		hoje,
		mesesBase: base,
		rendaMediaMensal,
		gastoMedioMensal,
		sobraMediaMensal,
		taxaPoupancaMedia,
		totaisAno: { renda: rendaAno, gastos: gastosAno, saldo: c2(rendaAno - gastosAno), taxaPoupanca: rendaAno > 0 ? Math.round(((rendaAno - gastosAno) / rendaAno) * 100) : 0, reembolsos: reembolsosAno },
		mensal,
		categorias,
		fixoVariavel,
		recorrentes,
		saldoContas,
		investimentos: { total: invTotal, liquidezDiaria: invLiquidez, porTipo: [...tipoMap.entries()].map(([tipo, valor]) => ({ tipo, valor: c2(valor) })) },
		reserva: { disponivel: reservaDisponivel, mesesCobertos },
		cartoes: cartoesCtx,
		dividas: dividasCtx,
		totalDividas,
		parcelasDividasMes,
		comprometimentoDividasPct,
		metas: metasCtx,
		aReceberDivisao,
		fase: "organizar",
	};
	ctx.fase = definirFase(ctx);
	return ctx;
}

/** Versão compacta para o prompt (sem campos vazios, valores em reais). */
export function contextoParaPrompt(c: ContextoFinanceiro): string {
	return JSON.stringify(
		{
			data_de_hoje: c.hoje,
			ano_analisado: c.ano,
			medias_mensais_ultimos_meses_fechados: {
				meses: c.mesesBase,
				renda: c.rendaMediaMensal,
				gastos: c.gastoMedioMensal,
				sobra: c.sobraMediaMensal,
				taxa_de_poupanca_pct: c.taxaPoupancaMedia,
				gastos_fixos: c.fixoVariavel.fixo,
				gastos_variaveis: c.fixoVariavel.variavel,
				gastos_sem_classificacao: c.fixoVariavel.semClassificacao,
			},
			totais_do_ano: c.totaisAno,
			mes_a_mes: c.mensal,
			maiores_categorias_de_gasto_no_ano: c.categorias,
			gastos_recorrentes_provaveis: c.recorrentes,
			saldo_em_contas: c.saldoContas,
			investimentos: c.investimentos,
			reserva_de_emergencia: { disponivel_com_liquidez: c.reserva.disponivel, meses_de_gastos_cobertos: c.reserva.mesesCobertos },
			cartoes_de_credito: c.cartoes,
			dividas: c.dividas,
			total_em_dividas: c.totalDividas,
			parcelas_de_dividas_por_mes: c.parcelasDividasMes,
			parcelas_de_dividas_pct_da_renda: c.comprometimentoDividasPct,
			metas: c.metas,
			valores_a_receber_de_outras_pessoas: c.aReceberDivisao,
			etapa_da_jornada: c.fase,
		},
		null,
		0,
	);
}
