import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../packages/services/supabase";
import {
	BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";
import {
	ArrowUpRight, ArrowDownRight, Wallet, TrendingUp, TrendingDown, Sparkles, AlertCircle, Phone, CreditCard, ChevronDown, Calendar, Brain, HandCoins, Users, Bell, ArrowRight
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authService } from "../../../packages/services/auth.service";
import { financeService } from "../../../packages/services/finance.service";
import { ExportExcelButton } from "./components/ExportExcelButton";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import OnboardingContasModal from "./components/OnboardingContasModal";
import { getFaturaMesReferencia } from "../../../packages/utils/cartao.utils";

const NOME_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function HomeWeb() {
	const navigate = useNavigate();
	const [stats, setStats] = useState({ entradasMes: 0, gastosMes: 0, saldoTotal: 0 });
	const [nome, setNome] = useState("");
	const [userId, setUserId] = useState("");
	const [isClient, setIsClient] = useState(false);
	const [isFetchingData, setIsFetchingData] = useState(true);

	useEffect(() => { setIsClient(true); }, []);
	
	const [rawEntradas, setRawEntradas] = useState<any[]>([]);
	const [rawGastos, setRawGastos] = useState<any[]>([]);
	const [rawFaturas, setRawFaturas] = useState<any[]>([]);
	const [rawInvestimentos, setRawInvestimentos] = useState<any[]>([]);
	const [rawDividas, setRawDividas] = useState<any[]>([]);
	const [rawFaturasNaoPagas, setRawFaturasNaoPagas] = useState<any[]>([]);
	const [lastLaunchDate, setLastLaunchDate] = useState<string | null>(null);
	const [hasLaunchesThisMonth, setHasLaunchesThisMonth] = useState<boolean>(true);
	const [devedores, setDevedores] = useState<any[]>([]);
	const [cartoes, setCartoes] = useState<any[]>([]);
	
	const [contasBancarias, setContasBancarias] = useState<any[]>([]);
	const [showOnboarding, setShowOnboarding] = useState(false);
	const [showOrphanAlert, setShowOrphanAlert] = useState(false);

	const hoje = new Date();
	const [filterYear, setFilterYear] = useState(hoje.getFullYear());
	const [filterMonth, setFilterMonth] = useState<number | "all">(new Date().getMonth() + 1);
	const [filterCategory, setFilterCategory] = useState<string>("all");

	const loadDashboardData = useCallback(async () => {
		const { data: { user } } = await supabase.auth.getUser();
		if (!user) return;
		setUserId(user.id);

		const startOfYear = `${filterYear}-01-01`;
		const endOfYear = `${filterYear}-12-31`;
		const d = new Date();
		const currentMonthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
		const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

		try {
			const [
				saldoAtual, resEntradas, resGastos, resFaturas, resInv, resDiv, resDevedores, resCartoes, resLastEntrada, resLastGasto, resCountEntradas, resCountGastos, resContas
			] = await Promise.all([
				financeService.getGlobalBalance(user.id).catch(() => 0),
				supabase.from("receitas").select("*").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear),
				supabase.from("despesas").select("*").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear),
				supabase.from("pagamentos_faturas").select("*").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear),
				supabase.from("investimentos").select("*").eq("usuario_id", user.id),
				supabase.from("passivos").select("*").eq("usuario_id", user.id),
				financeService.getDevedores(user.id).catch(() => []),
				financeService.getCartoes(user.id).catch(() => []),
				supabase.from("receitas").select("data").eq("usuario_id", user.id).lte("data", todayStr).order("data", { ascending: false }).limit(1),
				supabase.from("despesas").select("data").eq("usuario_id", user.id).lte("data", todayStr).order("data", { ascending: false }).limit(1),
				supabase.from("receitas").select("id", { count: "exact", head: true }).eq("usuario_id", user.id).gte("data", currentMonthStart),
				supabase.from("despesas").select("id", { count: "exact", head: true }).eq("usuario_id", user.id).gte("data", currentMonthStart),
				financeService.getContasBancarias(user.id).catch(() => []),
			]);

			setStats(prev => ({ ...prev, saldoTotal: saldoAtual }));
			setRawEntradas(resEntradas?.data || []);
			setRawGastos(resGastos?.data || []);
			setRawFaturas(resFaturas?.data || []);
			setRawInvestimentos(resInv?.data || []);
			setRawDividas(resDiv?.data || []);
			setDevedores(resDevedores || []);
			setCartoes(resCartoes || []);
			
			const loadedContas = resContas || [];
			setContasBancarias(loadedContas);
			
			// Verificações para Modal
			if (loadedContas.length === 0) {
				setShowOnboarding(true);
			} else {
				// Verifica se tem lançamentos órfãos
				const hasOrphanEntradas = (resEntradas?.data || []).some(e => !e.conta_id);
				const hasOrphanGastos = (resGastos?.data || []).some(g => !g.conta_id && g.metodo_pagamento !== "Crédito");
				if (hasOrphanEntradas || hasOrphanGastos) {
					setShowOrphanAlert(true);
				}
			}

			const lastEntradaDate = resLastEntrada?.data?.[0]?.data;
			const lastGastoDate = resLastGasto?.data?.[0]?.data;
			let lastLaunch: string | null = null;
			if (lastEntradaDate && lastGastoDate) {
				lastLaunch = lastEntradaDate > lastGastoDate ? lastEntradaDate : lastGastoDate;
			} else {
				lastLaunch = lastEntradaDate || lastGastoDate || null;
			}
			setLastLaunchDate(lastLaunch);
			setHasLaunchesThisMonth(((resCountEntradas?.count || 0) + (resCountGastos?.count || 0)) > 0);

			if (resCartoes && resCartoes.length > 0) {
				const lastMonths = [];
				const dDate = new Date();
				for (let i = 0; i < 3; i++) {
					lastMonths.push(`${dDate.getFullYear()}-${String(dDate.getMonth() + 1).padStart(2, '0')}`);
					dDate.setMonth(dDate.getMonth() - 1);
				}

				const faturasPromises: Promise<any>[] = [];
				resCartoes.forEach((c: any) => {
					lastMonths.forEach((m) => {
						faturasPromises.push(financeService.getFaturaMensal(user.id, c.id, m).then(res => ({ ...res, mesReferencia: m })).catch(() => null));
					});
				});

				const faturasResult = await Promise.all(faturasPromises);
				setRawFaturasNaoPagas(faturasResult.filter((f: any) => f && f.totalFatura > 0 && f.pendente > 0.01));
			} else {
				setRawFaturasNaoPagas([]);
			}
		} catch (err) {
			console.error("Erro ao carregar dados do dashboard:", err);
		}
	}, [filterYear]);

	useEffect(() => {
		async function initData() {
			await loadDashboardData();
			const u = await authService.getCurrentUser();
			if (u) setNome(u.nome.split(" ")[0]);
			setIsFetchingData(false);
		}
		initData();

		let channelEntradas: any;
		let channelGastos: any;

		async function setupRealtime() {
			const { data: { user } } = await supabase.auth.getUser();
			if (user) {
				channelEntradas = financeService.subscribeToChanges("receitas", user.id, loadDashboardData);
				channelGastos = financeService.subscribeToChanges("despesas", user.id, loadDashboardData);
			}
		}
		setupRealtime();
		return () => {
			if (channelEntradas) supabase.removeChannel(channelEntradas);
			if (channelGastos) supabase.removeChannel(channelGastos);
		};
	}, [loadDashboardData]);

	const getGreeting = () => {
		const hour = hoje.getHours();
		if (hour < 12) return "Bom dia";
		if (hour < 18) return "Boa tarde";
		return "Boa noite";
	};

	const dashboardData = useMemo(() => {
		let filteredEntradas = rawEntradas;
		let filteredGastos = rawGastos.filter(g => g.considerar_soma === true);
		let filteredFaturas = rawFaturas;
		let filteredInvestimentos = rawInvestimentos;
		let filteredDividas = rawDividas;

		if (filterMonth !== "all") {
			const prefix = `${filterYear}-${String(filterMonth).padStart(2, '0')}`;
			filteredEntradas = filteredEntradas.filter(e => e.data.startsWith(prefix));
			filteredGastos = filteredGastos.filter(g => g.data.startsWith(prefix));
			filteredFaturas = filteredFaturas.filter(f => f.data.startsWith(prefix));
			filteredDividas = filteredDividas.filter(d => d.vencimento_parcela?.startsWith(prefix) || d.data?.startsWith(prefix));
		}

		const totaisMes = {
			entradas: filteredEntradas.reduce((acc, cur) => acc + Number(cur.valor), 0),
			gastos: filteredGastos.reduce((acc, cur) => acc + Number(cur.valor), 0) + filteredFaturas.reduce((acc, cur) => acc + Number(cur.valor), 0),
			faturas: filteredFaturas.reduce((acc, cur) => acc + Number(cur.valor), 0),
			investimentos: filteredInvestimentos.reduce((acc, cur) => acc + Number(cur.valor_investido), 0),
			dividas: filteredDividas.reduce((acc, cur) => acc + Number(cur.valor_total), 0),
		};

		const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
		const dadosGrafico = [];

		for (let i = 0; i < 12; i++) {
			const prefix = `${filterYear}-${String(i + 1).padStart(2, "0")}`;
			const ent = rawEntradas.filter(e => e.data.startsWith(prefix)).reduce((a, c) => a + Number(c.valor), 0);
			const gas = rawGastos.filter(g => g.considerar_soma === true && g.data.startsWith(prefix)).reduce((a, c) => a + Number(c.valor), 0);
			const fat = rawFaturas.filter(e => e.data.startsWith(prefix)).reduce((a, c) => a + Number(c.valor), 0);
			const inv = rawInvestimentos.reduce((a, c) => a + Number(c.valor_investido), 0) / 12;
			const div = rawDividas.filter(e => (e.vencimento_parcela?.startsWith(prefix) || e.data?.startsWith(prefix))).reduce((a, c) => a + Number(c.valor_total), 0);
			dadosGrafico.push({ mes: mesesNomes[i], entradas: ent, gastos: gas + fat, cartoes: fat, investimentos: inv, dividas: div });
		}

		const parseDate = (d: any) => new Date(d).getTime();
		return {
			totaisMes,
			dadosGrafico,
			recentes: {
				entradas: [...filteredEntradas].sort((a, b) => parseDate(b.data) - parseDate(a.data)).slice(0, 5),
				gastos: [...filteredGastos].sort((a, b) => parseDate(b.data) - parseDate(a.data)).slice(0, 5),
				cartoes: [...filteredFaturas].sort((a, b) => parseDate(b.data) - parseDate(a.data)).slice(0, 5),
				investimentos: [...filteredInvestimentos].slice(0, 5),
				dividas: [...filteredDividas].sort((a, b) => parseDate(b.vencimento_parcela) - parseDate(a.vencimento_parcela)).slice(0, 5)
			}
		};
	}, [rawEntradas, rawGastos, rawFaturas, rawInvestimentos, rawDividas, filterYear, filterMonth]);

	const cartoesResumo = useMemo(() => {
		if (cartoes.length === 0) return [];
		const activeMonthStr = filterMonth !== "all" ? `${filterYear}-${String(filterMonth).padStart(2, '0')}` : `${filterYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
		
		return cartoes.map((c: any) => {
			const fechamentoDia = c.fechamento_dia || 1;
			const vencimentoDia = c.vencimento_dia || 1;
			const gastosCartao = rawGastos.filter(g => g.cartao_id === c.id && (!g.data ? false : getFaturaMesReferencia(g.data, fechamentoDia, vencimentoDia) === activeMonthStr));
			const totalFatura = gastosCartao.reduce((sum, item) => sum + Number(item.valor), 0);
			const pagamentosFatura = rawFaturas.filter(p => p.cartao_id === c.id && p.mes_referencia === activeMonthStr);
			const totalPago = pagamentosFatura.reduce((sum, item) => sum + Number(item.valor), 0);
			const pendente = Math.max(0, totalFatura - totalPago);
			const limiteDisponivel = Math.max(0, Number(c.limite) - totalFatura);
			const percentualUso = Number(c.limite) > 0 ? (totalFatura / Number(c.limite)) * 100 : 0;
			return { cartao: c, totalFatura, totalPago, pendente, limiteDisponivel, percentualUso, mesStr: activeMonthStr };
		});
	}, [cartoes, rawGastos, rawFaturas, filterMonth, filterYear]);

	const entradaPieData = useMemo(() => {
		let filtered = rawEntradas;
		if (filterMonth !== "all") {
			const prefix = `${filterYear}-${String(filterMonth).padStart(2, '0')}`;
			filtered = filtered.filter(e => e.data.startsWith(prefix));
		}
		const grouped = filtered.reduce((acc: any, item: any) => {
			const cat = item.categoria || "Outros";
			acc[cat] = (acc[cat] || 0) + Number(item.valor);
			return acc;
		}, {});
		return Object.keys(grouped).map(name => ({ name, value: grouped[name] }));
	}, [rawEntradas, filterYear, filterMonth]);

	const gastoPieData = useMemo(() => {
		let filtered = rawGastos.filter(g => g.considerar_soma === true);
		if (filterMonth !== "all") {
			const prefix = `${filterYear}-${String(filterMonth).padStart(2, '0')}`;
			filtered = filtered.filter(g => g.data.startsWith(prefix));
		}
		const grouped = filtered.reduce((acc: any, item: any) => {
			const cat = item.categoria || "Outros";
			acc[cat] = (acc[cat] || 0) + Number(item.valor);
			return acc;
		}, {});
		return Object.keys(grouped).map(name => ({ name, value: grouped[name] }));
	}, [rawGastos, filterYear, filterMonth]);

	const totalEntradasPie = useMemo(() => entradaPieData.reduce((acc, cur) => acc + Number(cur.value), 0), [entradaPieData]);
	const totalGastosPie = useMemo(() => gastoPieData.reduce((acc, cur) => acc + Number(cur.value), 0), [gastoPieData]);
	const saldoFiltrado = useMemo(() => dashboardData.totaisMes.entradas - dashboardData.totaisMes.gastos, [dashboardData]);

	const previsaoGastoProximoMes = useMemo(() => {
		const h = new Date();
		const proxMes = new Date(h.getFullYear(), h.getMonth() + 1, 1);
		const proxMesPrefixo = `${proxMes.getFullYear()}-${String(proxMes.getMonth() + 1).padStart(2, "0")}`;
		const totalParcelasProxMes = rawGastos.filter(g => g.metodo_pagamento === "Crédito" && g.data.startsWith(proxMesPrefixo)).reduce((sum, g) => sum + Number(g.valor), 0);
		const totalDividasProxMes = rawDividas.filter(d => d.status !== "quitada" && d.vencimento_parcela?.startsWith(proxMesPrefixo)).reduce((sum, d) => sum + (Number(d.valor_total) / Number(d.parcelas)), 0);
		const gastosVariaveis = rawGastos.filter(g => g.metodo_pagamento !== "Crédito");
		const mensalVariavel: { [key: number]: number } = {};
		gastosVariaveis.forEach(g => {
			const m = new Date(g.data + "T12:00:00").getMonth();
			mensalVariavel[m] = (mensalVariavel[m] || 0) + Number(g.valor);
		});
		const values = Object.values(mensalVariavel);
		const mediaVariavel = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
		return {
			mesNome: NOME_MESES[proxMes.getMonth()],
			totalPrevisao: totalParcelasProxMes + totalDividasProxMes + mediaVariavel,
			totalParcelasProxMes,
			totalDividasProxMes,
			mediaVariavel
		};
	}, [rawGastos, rawDividas]);

	const upcomingPayments = useMemo(() => {
		const reminders: any[] = [];
		const today = new Date();
		const in7Days = new Date(today);
		in7Days.setDate(today.getDate() + 7);
		const todayStr = today.toISOString().split("T")[0];
		const limitStr = in7Days.toISOString().split("T")[0];

		rawDividas.filter(d => d.status !== "quitada" && d.vencimento_parcela >= todayStr && d.vencimento_parcela <= limitStr).forEach(d => {
			reminders.push({ type: "divida", title: `Dívida: ${d.descricao}`, date: d.vencimento_parcela, amount: Number(d.valor_total) / Number(d.parcelas) });
		});

		rawFaturasNaoPagas.forEach(f => {
			if (f.cartao) {
				const day = String(f.cartao.dia_vencimento).padStart(2, "0");
				const vDate = `${f.mesReferencia}-${day}`;
				if (vDate >= todayStr && vDate <= limitStr) {
					reminders.push({ type: "fatura", title: `Fatura: ${f.cartao.nome}`, date: vDate, amount: f.pendente });
				}
			}
		});
		return reminders.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
	}, [rawDividas, rawFaturasNaoPagas]);

	const handleCobrarWhatsApp = (devedor: any) => {
		const telefone = devedor.contato?.telefone?.replace(/\D/g, "");
		if (!telefone || telefone.length < 10) return toast.error("Telefone inválido.");
		const itensText = devedor.itens.filter((i: any) => !i.terceiro_pago).map((i: any) => `• ${i.descricao}: R$ ${Number(i.valor).toFixed(2)}`).join("%0A");
		const msg = `Olá, ${devedor.contato.nome}! Tudo bem?%0A%0ASegue o demonstrativo dos valores em aberto:%0A%0A${itensText}%0A%0A*Total:* R$ ${Number(devedor.total_devido).toFixed(2)}%0A%0AQuando puder realizar o acerto, me envie o comprovante. Muito obrigado!`;
		window.open(`https://wa.me/${telefone}?text=${msg}`, "_blank");
	};

	if (isFetchingData) {
		return (
			<div className="h-[80vh] flex flex-col items-center justify-center space-y-4">
				<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
				<p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Carregando painel...</p>
			</div>
		);
	}

	const devedoresAtivos = devedores.filter(d => d.total_devido > 0);
	const COLORS_ENTRADAS = ["#10B981", "#34D399", "#059669", "#6EE7B7", "#047857"];
	const COLORS_GASTOS = ["#F43F5E", "#FB7185", "#E11D48", "#FDA4AF", "#BE123C", "#F87171", "#EF4444"];

	return (
		<motion.div className="space-y-6 sm:space-y-8 pb-20" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { staggerChildren: 0.05 } }}>
			
			{/* 1. SAUDAÇÃO & BOTÕES */}
			<div className="flex flex-col gap-4">
				<h2 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
					<span>{getGreeting()}, {nome}!</span>
					<span className="animate-bounce">👋</span>
				</h2>
				<div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 w-full">
					<button onClick={() => navigate("/gastos?add=true")} className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-sm sm:text-xs shadow-sm transition-all cursor-pointer">
						<TrendingDown size={16} className="sm:w-3.5 sm:h-3.5" /> <span>Nova Despesa</span>
					</button>
					<button onClick={() => navigate("/entradas?add=true")} className="col-span-1 flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm sm:text-xs shadow-sm transition-all cursor-pointer">
						<TrendingUp size={16} className="sm:w-3.5 sm:h-3.5" /> <span>Nova Receita</span>
					</button>
					<button onClick={() => navigate("/dividas?add=true")} className="col-span-1 flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-bold text-sm sm:text-xs shadow-sm transition-all cursor-pointer">
						<HandCoins size={16} className="sm:w-3.5 sm:h-3.5" /> <span>Novo Passivo</span>
					</button>
				</div>
			</div>

			{/* 2 E 3. LEMBRETES E ÚLTIMO LANÇAMENTO (LADO A LADO) */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* 2. LEMBRETES DE PAGAMENTOS PRÓXIMOS */}
				{upcomingPayments.length > 0 ? (
					<motion.div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 p-5 rounded-xl shadow-sm flex flex-col gap-4 justify-center">
						<div className="flex items-center gap-3">
							<div className="p-3 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-xl">
								<Bell size={20} className="animate-pulse" />
							</div>
							<div>
								<h4 className="font-extrabold text-amber-900 dark:text-amber-300 text-sm">Lembretes de Vencimento</h4>
								<p className="text-amber-700/80 dark:text-amber-400/80 text-xs font-semibold">Você tem {upcomingPayments.length} pagamento(s) para os próximos 7 dias.</p>
							</div>
						</div>
						<div className="flex flex-col gap-2 w-full max-h-32 overflow-y-auto pr-1 custom-scrollbar">
							{upcomingPayments.map((pay, i) => (
								<div key={i} className="flex justify-between items-center bg-white dark:bg-slate-900 px-4 py-2 rounded-lg border border-amber-100 dark:border-slate-800 text-xs shadow-sm gap-4">
									<span className="font-bold text-slate-700 dark:text-slate-300 truncate max-w-[150px]">{pay.title}</span>
									<div className="text-right shrink-0">
										<span className="text-slate-500 dark:text-slate-400 mr-2">{pay.date.includes("undefined") ? pay.date.replace("undefined", "01").split("-").reverse().join("/") : pay.date.split("-").reverse().join("/")}</span>
										<span className="font-black text-rose-500 dark:text-rose-455">R$ {pay.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
									</div>
								</div>
							))}
						</div>
					</motion.div>
				) : (
					<motion.div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 p-5 rounded-xl shadow-sm flex items-center gap-4 justify-center">
						<div className="p-3 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
							<Bell size={20} />
						</div>
						<div>
							<h4 className="font-extrabold text-emerald-900 dark:text-emerald-300 text-sm">Tudo em dia!</h4>
							<p className="text-emerald-700/80 dark:text-emerald-400/80 text-xs font-semibold">Nenhum vencimento previsto para os próximos 7 dias.</p>
						</div>
					</motion.div>
				)}

				{/* 3. ÚLTIMO LANÇAMENTO REGISTRADO */}
				{(!hasLaunchesThisMonth && hoje.getDate() >= 20) ? (
					<motion.div className="flex flex-col items-start justify-center gap-4 p-5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 shadow-sm">
						<div className="flex items-center gap-3.5">
							<div className="p-3 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-xl"><AlertCircle size={20} className="animate-pulse" /></div>
							<div>
								<p className="font-extrabold text-amber-900 dark:text-amber-300 text-sm">Nenhum lançamento realizado neste mês!</p>
								<p className="text-amber-700/80 dark:text-amber-400/80 text-xs font-semibold mt-1">
									Seu último lançamento foi em <strong className="text-amber-900 dark:text-amber-200">{lastLaunchDate?.split("-").reverse().join("/") || "N/A"}</strong>.
								</p>
							</div>
						</div>
					</motion.div>
				) : (
					<motion.div className="flex items-center gap-3.5 p-5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100/60 dark:border-indigo-900/20 shadow-sm h-full">
						<div className="p-3 bg-indigo-100/60 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl"><Calendar size={20} /></div>
						<div>
							<p className="text-xs font-bold text-slate-400 dark:text-slate-500">{lastLaunchDate ? "Última atividade registrada" : "Status dos lançamentos"}</p>
							<p className="text-sm font-black text-slate-700 dark:text-slate-200 mt-1">
								{lastLaunchDate ? `Seu último lançamento foi em ${lastLaunchDate.split("-").reverse().join("/")}.` : "Nenhum lançamento cadastrado no sistema."}
							</p>
						</div>
					</motion.div>
				)}
			</div>

			{/* 4. FILTROS & RESUMO CONSOLIDADO */}
			<div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 w-full">
				<div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
					<Sparkles size={18} className="text-indigo-500" />
					<h3 className="text-sm font-black uppercase tracking-widest">Resumo Consolidado</h3>
				</div>
				
				<div className="flex flex-col sm:flex-row justify-end gap-3 w-full md:w-auto">
					<div className="relative w-full sm:w-auto">
						<select value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))} className="w-full pr-8 pl-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 cursor-pointer appearance-none outline-none focus:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm">
							{[hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
						</select>
						<ChevronDown size={12} className="absolute inset-y-0 right-3 my-auto text-slate-400 pointer-events-none" />
					</div>
					<div className="relative w-full sm:w-auto">
						<select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value === "all" ? "all" : Number(e.target.value))} className="w-full pr-8 pl-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 cursor-pointer appearance-none outline-none focus:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm">
							<option value="all">Ano Todo</option>
							{NOME_MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
						</select>
						<ChevronDown size={12} className="absolute inset-y-0 right-3 my-auto text-slate-400 pointer-events-none" />
					</div>
					<div className="relative w-full sm:w-auto">
						<select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="w-full pr-8 pl-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 cursor-pointer appearance-none outline-none focus:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm">
							<option value="all">Visão Geral</option>
							<option value="entradas">Só Entradas</option>
							<option value="gastos">Só Gastos</option>
							<option value="cartoes">Só Cartões</option>
							<option value="investimentos">Só Investimentos</option>
							<option value="dividas">Só Dívidas</option>
						</select>
						<ChevronDown size={12} className="absolute inset-y-0 right-3 my-auto text-slate-400 pointer-events-none" />
					</div>
					<ExportExcelButton />
				</div>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				<motion.div className={`bg-gradient-to-br ${saldoFiltrado >= 0 ? "from-indigo-900 via-slate-900 to-indigo-950" : "from-rose-950 via-slate-900 to-rose-900"} p-6 sm:p-8 rounded-xl shadow-xl text-white relative overflow-hidden flex flex-col justify-between md:col-span-2 lg:col-span-1`}>
					<Wallet size={120} className="absolute -top-4 -right-4 p-4 opacity-[0.03] pointer-events-none" />
					<div>
						<p className="text-indigo-300 dark:text-indigo-400 font-bold uppercase tracking-wider text-xs mb-3">{filterMonth === "all" ? "Saldo Anual Consolidado" : "Saldo do Período"}</p>
						<h3 className="text-4xl sm:text-5xl font-black mb-1 flex items-baseline"><span className="text-indigo-455 text-2xl font-bold mr-1.5 opacity-80">R$</span><span>{saldoFiltrado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></h3>
					</div>
				</motion.div>
				{(filterCategory === "all" || filterCategory === "entradas") && <MetricCard title="Entradas (Período)" value={dashboardData.totaisMes.entradas} icon={<TrendingUp size={24} className="text-emerald-600 dark:text-emerald-455" />} bgClass="bg-emerald-50 dark:bg-emerald-950/30" colorClass="text-emerald-600 dark:text-emerald-455" borderClass="bg-emerald-500" />}
				{(filterCategory === "all" || filterCategory === "gastos") && <MetricCard title="Gastos (Período)" value={dashboardData.totaisMes.gastos} icon={<TrendingDown size={24} className="text-rose-600 dark:text-rose-455" />} bgClass="bg-rose-50 dark:bg-rose-950/30" colorClass="text-rose-600 dark:text-rose-455" borderClass="bg-rose-500" />}
				{filterCategory === "cartoes" && <MetricCard title="Faturas (Período)" value={dashboardData.totaisMes.faturas} icon={<CreditCard size={24} className="text-purple-600 dark:text-purple-450" />} bgClass="bg-purple-50 dark:bg-purple-950/30" colorClass="text-purple-600 dark:text-purple-450" borderClass="bg-purple-500" />}
				{filterCategory === "investimentos" && <MetricCard title="Investimentos (Período)" value={dashboardData.totaisMes.investimentos} icon={<TrendingUp size={24} className="text-blue-600 dark:text-blue-450" />} bgClass="bg-blue-50 dark:bg-blue-950/30" colorClass="text-blue-600 dark:text-blue-450" borderClass="bg-blue-500" />}
				{filterCategory === "dividas" && <MetricCard title="Dívidas (Período)" value={dashboardData.totaisMes.dividas} icon={<HandCoins size={24} className="text-orange-600 dark:text-orange-450" />} bgClass="bg-orange-50 dark:bg-orange-950/30" colorClass="text-orange-600 dark:text-orange-450" borderClass="bg-orange-500" />}
			</div>

			{/* 5. PREVISÃO E EVOLUÇÃO ANUAL */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{(filterCategory === "all" || filterCategory === "gastos") && (
					<motion.div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm lg:col-span-1 flex flex-col justify-between">
						<div>
							<p className="text-purple-500 font-bold uppercase tracking-wider text-xs mb-3 flex items-center gap-1.5"><Brain size={16} className="animate-pulse" /> Previsão de Gastos ({previsaoGastoProximoMes.mesNome})</p>
							<h3 className="text-4xl font-black text-slate-800 dark:text-slate-100 flex items-baseline mb-6"><span className="text-purple-500 text-xl mr-1.5 opacity-80">R$</span><span>{previsaoGastoProximoMes.totalPrevisao.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></h3>
							<div className="space-y-3 text-sm text-slate-600 dark:text-slate-350">
								<div className="flex justify-between items-center"><span className="flex items-center gap-1.5"><CreditCard size={14} className="opacity-70" /> Faturas Previstas</span><span className="font-bold text-slate-800 dark:text-slate-100">R$ {previsaoGastoProximoMes.totalParcelasProxMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>
								<div className="flex justify-between items-center"><span className="flex items-center gap-1.5"><HandCoins size={14} className="opacity-70" /> Dívidas Previstas</span><span className="font-bold text-slate-800 dark:text-slate-100">R$ {previsaoGastoProximoMes.totalDividasProxMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>
								<div className="flex justify-between items-center"><span className="flex items-center gap-1.5"><TrendingDown size={14} className="opacity-70" /> Média Variável</span><span className="font-bold text-slate-800 dark:text-slate-100">R$ {previsaoGastoProximoMes.mediaVariavel.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>
							</div>
						</div>
					</motion.div>
				)}
				<motion.div className={`bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm ${filterCategory === "all" || filterCategory === "gastos" ? "lg:col-span-2" : "lg:col-span-3"}`}>
					<h3 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-6">Evolução Anual</h3>
					<div className="h-64 w-full">
						{isClient && (
							<ResponsiveContainer width="100%" height="100%">
								<BarChart data={dashboardData.dadosGrafico} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
									<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
									<XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} dy={5} />
									<YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} />
									<Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "12px", border: "none" }} formatter={(value: number) => [`R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, ""]} />
									<Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
									{(filterCategory === "all" || filterCategory === "entradas") && <Bar dataKey="entradas" name="Entradas" fill="#10B981" radius={[4, 4, 0, 0]} barSize={12} />}
									{(filterCategory === "all" || filterCategory === "gastos") && <Bar dataKey="gastos" name="Gastos/Faturas" fill="#F43F5E" radius={[4, 4, 0, 0]} barSize={12} />}
								</BarChart>
							</ResponsiveContainer>
						)}
					</div>
				</motion.div>
			</div>

			{/* 6. FATURAS & DEVEDORES */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
				{/* STATUS DOS CARTÕES */}
				{(filterCategory === "all" || filterCategory === "cartoes") && (
					<div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col h-full">
						<div className="flex items-center gap-2 mb-6">
							<CreditCard size={20} className="text-purple-500" />
							<h3 className="font-black text-slate-800 dark:text-slate-100 text-lg sm:text-xl">Status dos Cartões</h3>
						</div>
						<div className="space-y-4 flex-1">
							{cartoesResumo.length === 0 ? (
								<div className="text-center text-slate-400 dark:text-slate-500 py-10"><p className="font-bold text-sm">Nenhum cartão cadastrado</p></div>
							) : (
								cartoesResumo.map((res: any) => {
									return (
										<div key={res.cartao.id} className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-850/40 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col gap-3 transition-colors hover:border-slate-200 dark:hover:border-slate-700">
											<div className="flex justify-between items-center">
												<div className="flex flex-col">
													<p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm sm:text-base">{res.cartao.nome}</p>
													<p className="text-xs text-rose-500 dark:text-rose-450 font-bold mt-0.5">
														Fatura: R$ {res.totalFatura.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
													</p>
												</div>
												<button onClick={() => navigate(`/faturas/${res.cartao.id}`)} className="p-2 text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-lg transition-colors shadow-sm" title="Acessar Fatura">
													<ArrowRight size={16} />
												</button>
											</div>
											{res.cartao.limite > 0 && (
												<div className="mt-1">
													<div className="flex justify-between text-[11px] sm:text-xs mb-1.5">
														<span className="font-bold text-slate-500 dark:text-slate-400">
															L. Disp: <span className="text-emerald-600 dark:text-emerald-450">R$ {res.limiteDisponivel.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
														</span>
														<span className="font-bold text-slate-400">{Math.round(res.percentualUso)}% Usado</span>
													</div>
													<div className="h-1.5 sm:h-2 w-full bg-slate-200 dark:bg-slate-700/50 rounded-full overflow-hidden">
														<div className={`h-full transition-all duration-500 ${res.percentualUso > 90 ? 'bg-rose-500' : res.percentualUso > 75 ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, Math.max(0, res.percentualUso))}%` }} />
													</div>
												</div>
											)}
										</div>
									);
								})
							)}
						</div>
					</div>
				)}

				{devedoresAtivos.length > 0 && (
					<div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col">
						<div className="flex justify-between items-center mb-6">
							<h3 className="font-black text-slate-800 dark:text-slate-100 text-lg flex items-center gap-2"><Users className="text-pink-500" size={20} /> Devedores Ativos</h3>
							<button onClick={() => navigate("/devedores")} className="text-xs font-bold text-indigo-500 hover:underline">Ir para Devedores</button>
						</div>
						<div className="space-y-4 flex-1">
							{devedoresAtivos.map((devedor: any) => (
								<div key={devedor.contato.id} className="flex justify-between items-center p-4 sm:p-5 bg-slate-50 dark:bg-slate-850/40 rounded-xl border border-slate-100 dark:border-slate-800">
									<div>
										<p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm sm:text-base">{devedor.contato.nome}</p>
										<p className="text-xs font-medium text-slate-500 dark:text-slate-450">{devedor.contato.telefone || "Sem Telefone"}</p>
									</div>
									<div className="flex items-center gap-4">
										<div className="text-right">
											<p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Total</p>
											<p className="font-black text-rose-500 text-sm">R$ {devedor.total_devido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
										</div>
										<button onClick={() => handleCobrarWhatsApp(devedor)} className="p-2 sm:p-2.5 bg-[#25D366] hover:bg-[#20BD5A] transition-colors text-white rounded-xl shadow-sm"><Phone size={16} /></button>
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</div>

			{/* 7. GRÁFICOS DE PIZZA (ORIGENS E DESTINOS) */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center">
					<h3 className="text-md font-black text-slate-800 dark:text-slate-100 mb-4 self-start flex items-center gap-2"><TrendingUp className="text-emerald-500" size={18} /> Origem das Entradas</h3>
					<div className="h-64 w-full relative flex items-center justify-center">
						{entradaPieData.length > 0 ? (
							<>
								<ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={entradaPieData} innerRadius={65} outerRadius={90} paddingAngle={2} dataKey="value" stroke="none">{entradaPieData.map((_, i) => <Cell key={i} fill={COLORS_ENTRADAS[i % COLORS_ENTRADAS.length]} />)}</Pie><Tooltip formatter={(val: number) => `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} /><Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 13, paddingTop: 10 }} /></PieChart></ResponsiveContainer>
								<div className="absolute pb-10 flex flex-col items-center pointer-events-none"><span className="text-xs text-slate-400 dark:text-slate-500 font-bold">TOTAL</span><span className="text-xl font-black text-slate-800 dark:text-slate-100">R$ {totalEntradasPie.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span></div>
							</>
						) : <p className="text-slate-400 italic text-sm">Sem dados.</p>}
					</div>
				</div>
				<div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center">
					<h3 className="text-md font-black text-slate-800 dark:text-slate-100 mb-4 self-start flex items-center gap-2"><TrendingDown className="text-rose-500" size={18} /> Destino dos Gastos</h3>
					<div className="h-64 w-full relative flex items-center justify-center">
						{gastoPieData.length > 0 ? (
							<>
								<ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={gastoPieData} innerRadius={65} outerRadius={90} paddingAngle={2} dataKey="value" stroke="none">{gastoPieData.map((_, i) => <Cell key={i} fill={COLORS_GASTOS[i % COLORS_GASTOS.length]} />)}</Pie><Tooltip formatter={(val: number) => `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} /><Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 13, paddingTop: 10 }} /></PieChart></ResponsiveContainer>
								<div className="absolute pb-10 flex flex-col items-center pointer-events-none"><span className="text-xs text-slate-400 dark:text-slate-500 font-bold">TOTAL</span><span className="text-xl font-black text-slate-800 dark:text-slate-100">R$ {totalGastosPie.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span></div>
							</>
						) : <p className="text-slate-400 italic text-sm">Sem dados.</p>}
					</div>
				</div>
			</div>

			{/* 8. ÚLTIMOS LANÇAMENTOS */}
			<div className={`grid grid-cols-1 ${filterCategory === "all" ? "lg:grid-cols-2" : "lg:grid-cols-1"} gap-6`}>
				{(filterCategory === "all" || filterCategory === "entradas") && <RecentSection title="Últimas Entradas" items={dashboardData.recentes.entradas} colorClass="text-emerald-500 dark:text-emerald-455" bgIconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400" icon={<ArrowUpRight size={16} />} onMore={() => navigate("/entradas")} dateField="data" />}
				{(filterCategory === "all" || filterCategory === "gastos") && <RecentSection title="Últimos Gastos" items={dashboardData.recentes.gastos} colorClass="text-rose-500 dark:text-rose-455" bgIconClass="bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-450" icon={<ArrowDownRight size={16} />} onMore={() => navigate("/gastos")} dateField="data" />}
				{filterCategory === "cartoes" && <RecentSection title="Últimos Pagtos Fatura" items={dashboardData.recentes.cartoes} colorClass="text-purple-500 dark:text-purple-450" bgIconClass="bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400" icon={<ArrowDownRight size={16} />} onMore={() => navigate("/cartoes")} dateField="data" />}
				{filterCategory === "investimentos" && <RecentSection title="Últimos Investimentos" items={dashboardData.recentes.investimentos} colorClass="text-blue-500 dark:text-blue-450" bgIconClass="bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400" icon={<TrendingUp size={16} />} onMore={() => navigate("/investimentos")} titleField="titulo" dateField={null} />}
				{filterCategory === "dividas" && <RecentSection title="Últimas Dívidas" items={dashboardData.recentes.dividas} colorClass="text-orange-500 dark:text-orange-450" bgIconClass="bg-orange-50 text-orange-600 dark:bg-orange-950/20 dark:text-orange-400" icon={<TrendingDown size={16} />} onMore={() => navigate("/dividas")} dateField="vencimento_parcela" />}
			</div>

			{/* MODALS */}
			<OnboardingContasModal 
				isOpen={showOnboarding} 
				userId={userId} 
				onComplete={() => {
					setShowOnboarding(false);
					loadDashboardData();
				}} 
			/>

			<AnimatePresence>
				{showOrphanAlert && !showOnboarding && (
					<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
						<motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-rose-100 dark:border-rose-900/30 text-center relative overflow-hidden">
							<div className="absolute top-0 left-0 w-full h-1 bg-rose-500"></div>
							<div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-5">
								<AlertCircle size={32} />
							</div>
							<h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-3">Lançamentos Sem Conta</h3>
							<p className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-relaxed">
								Detectamos que existem lançamentos antigos que não estão vinculados a nenhuma conta bancária. Para que o seu saldo funcione corretamente, por favor, edite esses lançamentos adicionando a conta de origem/destino.
							</p>
							<button onClick={() => setShowOrphanAlert(false)} className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md">
								Entendi
							</button>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>

		</motion.div>
	);
}

function MetricCard({ title, value, icon, bgClass, colorClass, borderClass }: any) {
	return (
		<motion.div whileHover={{ y: -2 }} className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
			<div>
				<div className="flex items-center gap-3 mb-4"><div className={`p-3 rounded-xl ${bgClass} ${colorClass}`}>{icon}</div><p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-xs">{title}</p></div>
				<h3 className="text-3xl sm:text-4xl font-black text-slate-800 dark:text-slate-100 flex items-baseline"><span className="text-slate-400 dark:text-slate-655 text-xl font-bold mr-1.5 opacity-80">R$</span><span>{value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></h3>
			</div>
			<div className="h-1.5 w-full bg-slate-50 dark:bg-slate-850 rounded-full mt-6 overflow-hidden"><div className={`h-full ${borderClass} rounded-full`} style={{ width: "40%" }} /></div>
		</motion.div>
	);
}

function RecentSection({ title, items, colorClass, bgIconClass, icon, onMore, titleField = "descricao", dateField = "data" }: any) {
	return (
		<div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col h-full">
			<div className="flex justify-between items-center mb-6">
				<h3 className="font-black text-slate-800 dark:text-slate-100 text-lg sm:text-xl">{title}</h3>
				<button onClick={onMore} className="text-indigo-500 hover:underline text-xs sm:text-sm font-bold">Ver mais</button>
			</div>
			<div className="space-y-4 flex-1">
				{items.length === 0 ? (
					<div className="text-slate-400 dark:text-slate-500 italic text-sm text-center py-6 font-medium">Nenhum registro.</div>
				) : (
					items.map((item: any, i: number) => (
						<div key={i} className="flex justify-between items-center gap-4">
							<div className="flex items-center gap-4 flex-1 min-w-0">
								<div className={`p-3 rounded-xl shrink-0 ${bgIconClass}`}>{icon}</div>
								<div className="min-w-0 flex-1">
									<p className="font-extrabold text-slate-700 dark:text-slate-300 text-sm truncate">{item[titleField] || item.descricao}</p>
									{dateField && item[dateField] && <p className="text-xs text-slate-500 dark:text-slate-450 font-semibold mt-0.5">{new Date(item[dateField] + "T12:00:00").toLocaleDateString("pt-BR")}</p>}
								</div>
							</div>
							<p className={`font-black text-sm sm:text-base shrink-0 ${colorClass}`}>R$ {Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
						</div>
					))
				)}
			</div>
		</div>
	);
}
