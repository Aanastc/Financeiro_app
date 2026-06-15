import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../packages/services/supabase";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	Legend,
	PieChart,
	Pie,
	Cell,
} from "recharts";
import {
	ArrowUpRight,
	ArrowDownRight,
	ChevronRight,
	Wallet,
	TrendingUp,
	TrendingDown,
	Sparkles,
	AlertCircle,
	Phone,
	CreditCard,
	ExternalLink,
	RefreshCw,
	Users,
	HandCoins,
	ChevronDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authService } from "../../../packages/services/auth.service";
import { financeService } from "../../../packages/services/finance.service";
import { ExportExcelButton } from "./components/ExportExcelButton";
import { motion } from "framer-motion";
import { GoogleGenerativeAI } from "@google/generative-ai";
import toast from "react-hot-toast";

const NOME_MESES = [
	"Janeiro",
	"Fevereiro",
	"Março",
	"Abril",
	"Maio",
	"Junho",
	"Julho",
	"Agosto",
	"Setembro",
	"Outubro",
	"Novembro",
	"Dezembro",
];

export default function HomeWeb() {
	const navigate = useNavigate();
	const [stats, setStats] = useState({
		entradasMes: 0,
		gastosMes: 0,
		saldoTotal: 0,
	});
	const [nome, setNome] = useState("");
	const [isClient, setIsClient] = useState(false);
	const [isFetchingData, setIsFetchingData] = useState(true);

	useEffect(() => {
		setIsClient(true);
	}, []);
	const [rawEntradas, setRawEntradas] = useState<any[]>([]);
	const [rawGastos, setRawGastos] = useState<any[]>([]);
	const [rawFaturas, setRawFaturas] = useState<any[]>([]);
	const [rawInvestimentos, setRawInvestimentos] = useState<any[]>([]);
	const [rawDividas, setRawDividas] = useState<any[]>([]);

	// NOVOS ESTADOS
	const [rawFaturasNaoPagas, setRawFaturasNaoPagas] = useState<any[]>([]);
	const [devedores, setDevedores] = useState<any[]>([]);
	const [cartoes, setCartoes] = useState<any[]>([]);
	const [loadingFaturas, setLoadingFaturas] = useState(false);

	// IA REPORT
	const [aiReport, setAiReport] = useState<string>("");
	const [loadingAI, setLoadingAI] = useState(false);

	// FILTROS
	const hoje = new Date();
	const [filterYear, setFilterYear] = useState(hoje.getFullYear());
	const [filterMonth, setFilterMonth] = useState<number | "all">("all");
	const [filterCategory, setFilterCategory] = useState<string>("all");

	const loadDashboardData = useCallback(async () => {
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (!user) return;

		const startOfYear = `${filterYear}-01-01`;
		const endOfYear = `${filterYear}-12-31`;

		const [saldoAtual, resEntradas, resGastos, resFaturas, resInv, resDiv, resDevedores, resCartoes] = await Promise.all([
			financeService.getGlobalBalance(user.id),
			supabase.from("entradas").select("*").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear),
			supabase.from("gastos").select("*").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear),
			supabase.from("pagamentos_faturas").select("*").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear),
			supabase.from("investimentos").select("*").eq("usuario_id", user.id),
			supabase.from("dividas").select("*").eq("usuario_id", user.id).gte("vencimento_parcela", startOfYear).lte("vencimento_parcela", endOfYear),
			financeService.getDevedores(user.id),
			financeService.getCartoes(user.id)
		]);

		setStats(prev => ({ ...prev, saldoTotal: saldoAtual }));
		setRawEntradas(resEntradas.data || []);
		setRawGastos(resGastos.data || []);
		setRawFaturas(resFaturas.data || []);
		setRawInvestimentos(resInv.data || []);
		setRawDividas(resDiv.data || []);
		setDevedores(resDevedores || []);
		setCartoes(resCartoes || []);

		// Buscar faturas não pagas dos últimos 3 meses
		setLoadingFaturas(true);
		try {
			const cartoesData = await financeService.getCartoes(user.id);
			if (cartoesData && cartoesData.length > 0) {
				const lastMonths = [];
				const d = new Date();
				for (let i = 0; i < 3; i++) {
					const year = d.getFullYear();
					const month = d.getMonth() + 1;
					lastMonths.push(`${year}-${String(month).padStart(2, '0')}`);
					d.setMonth(d.getMonth() - 1);
				}

				const faturasPromises: Promise<any>[] = [];
				cartoesData.forEach((c: any) => {
					lastMonths.forEach((m) => {
						faturasPromises.push(
							financeService.getFaturaMensal(user.id, c.id, m)
								.then(res => ({ ...res, mesReferencia: m }))
								.catch(() => null)
						);
					});
				});

				const faturasResult = await Promise.all(faturasPromises);
				const faturasNaoPagas = faturasResult.filter((f: any) => f && f.totalFatura > 0 && f.pendente > 0.01);
				setRawFaturasNaoPagas(faturasNaoPagas);
			} else {
				setRawFaturasNaoPagas([]);
			}
		} catch (err) {
			console.error("Erro ao carregar faturas pendentes:", err);
		} finally {
			setLoadingFaturas(false);
		}
	}, [filterYear]);

	// Carregar cache de insights de IA
	useEffect(() => {
		const cached = localStorage.getItem(`finance_ai_report_${filterYear}`);
		if (cached) {
			setAiReport(cached);
		} else {
			setAiReport("");
		}
	}, [filterYear]);

	const generateAIInsights = async () => {
		setLoadingAI(true);
		try {
			const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
			if (!apiKey) {
				toast.error("Chave da API do Gemini não configurada!");
				setLoadingAI(false);
				return;
			}

			// Maiores categorias
			const categoriasGastos: { [key: string]: number } = {};
			rawGastos.forEach(g => {
				const cat = g.categoria || "Outros";
				categoriasGastos[cat] = (categoriasGastos[cat] || 0) + Number(g.valor);
			});

			const topCategories = Object.entries(categoriasGastos)
				.map(([nome, valor]) => ({ nome, valor }))
				.sort((a, b) => b.valor - a.valor)
				.slice(0, 3);

			const genAI = new GoogleGenerativeAI(apiKey);

			const prompt = `Você é um consultor financeiro pessoal especialista em finanças pessoais e investimentos.
Analise os seguintes dados financeiros do usuário para o ano ${filterYear}:
- Saldo Global Consolidado Atual: R$ ${stats.saldoTotal}
- Entradas Totais do Ano: R$ ${rawEntradas.reduce((acc, cur) => acc + Number(cur.valor), 0)}
- Despesas Totais do Ano (incluindo faturas pagas): R$ ${rawGastos.reduce((acc, cur) => acc + Number(cur.valor), 0) + rawFaturas.reduce((acc, cur) => acc + Number(cur.valor), 0)}
- Dívidas Ativas: R$ ${rawDividas.reduce((acc, cur) => acc + Number(cur.valor_total), 0)}
- Distribuição de Gastos por Categoria: ${JSON.stringify(topCategories)}
- Faturas Pendentes nos últimos 3 meses: ${rawFaturasNaoPagas.length} faturas, somando R$ ${rawFaturasNaoPagas.reduce((acc, cur) => acc + Number(cur.pendente), 0)} em aberto
- Devedores ativos (dinheiro que o usuário emprestou e tem a receber): R$ ${devedores.reduce((acc, cur) => acc + Number(cur.total_devido), 0)}

Com base nesses dados completos, elabore um relatório consultivo estruturado em português do Brasil:
1. Resumo Geral da Situação Atual: Faça um diagnóstico sincero e direto sobre a relação entre receitas, gastos e o saldo atual.
2. Dicas e Recomendações: Forneça pelo menos 3 dicas práticas de economia, amortização de dívidas ou direcionamento de investimentos adequados para esse cenário.

Escreva o texto final formatado com títulos em negrito, tópicos claros com emojis e parágrafos curtos. Não use markdown de bloco (como \`\`\`), apenas negritos e quebras de linha para a leitura ficar muito agradável.`;

			const modelsToTry = [
				"gemini-2.5-flash", 
				"gemini-2.0-flash", 
				"gemini-1.5-flash",
				"gemini-1.5-flash-latest",
				"gemini-1.5-pro"
			];
			let result;
			let lastError;

			const callModelWithRetry = async (modelName: string, retries = 1, delay = 1500): Promise<any> => {
				const modelInstance = genAI.getGenerativeModel({ model: modelName });
				try {
					return await modelInstance.generateContent(prompt);
				} catch (error: any) {
					const errorMessage = error?.message || "";
					const isTransient = errorMessage.includes("503") || errorMessage.includes("experiencing high demand") || errorMessage.includes("429");
					if (retries > 0 && isTransient) {
						await new Promise(resolve => setTimeout(resolve, delay));
						return callModelWithRetry(modelName, retries - 1, delay * 2);
					}
					throw error;
				}
			};

			for (const modelName of modelsToTry) {
				try {
					if (modelsToTry.indexOf(modelName) > 0) console.log(`Tentando modelo backup: ${modelName}`);
					result = await callModelWithRetry(modelName);
					break;
				} catch (err: any) {
					console.warn(`Falha no modelo ${modelName}:`, err);
					lastError = err;
				}
			}

			if (!result) {
				const errorMessage = lastError?.message || "";
				if (errorMessage.includes("404")) {
					throw new Error("Sua chave da API do Google não tem acesso aos modelos Gemini (Erro 404). Verifique no Google AI Studio se a chave está correta.");
				}
				throw lastError || new Error("Não foi possível conectar a Inteligência Artificial.");
			}
			const text = result.response.text().trim();
			setAiReport(text);
			localStorage.setItem(`finance_ai_report_${filterYear}`, text);
			toast.success("Análise de IA concluída!");
		} catch (error) {
			console.error("Erro ao gerar insights com IA:", error);
			toast.error("Erro na leitura da IA.");
		} finally {
			setLoadingAI(false);
		}
	};

	const handleCobrarWhatsApp = (devedor: any) => {
		const telefone = devedor.contato?.telefone?.replace(/\D/g, "");
		if (!telefone || telefone.length < 10) {
			toast.error("Telefone inválido ou não cadastrado.");
			return;
		}

		const getPaymentInfo = (observacao: string) => {
			if (!observacao) return null;
			try {
				if (observacao.trim().startsWith("{")) {
					return JSON.parse(observacao);
				}
			} catch (e) {
				// Ignore
			}
			return null;
		};

		const itensPendentes = devedor.itens.filter((i: any) => !i.terceiro_pago);
		if (itensPendentes.length === 0) {
			toast.error("Não há itens pendentes para cobrar.");
			return;
		}

		const itensText = itensPendentes.map((i: any) => {
			const dataFormatada = new Date(i.data).toLocaleDateString("pt-BR");
			const payInfo = getPaymentInfo(i.observacao);
			if (payInfo && typeof payInfo.valor_pago === "number") {
				const restante = Math.max(0, Number(i.valor) - payInfo.valor_pago);
				return `• ${i.descricao} (${dataFormatada}): R$ ${Number(i.valor).toFixed(2)} (Falta pagar: R$ ${restante.toFixed(2)})`;
			}
			return `• ${i.descricao} (${dataFormatada}): R$ ${Number(i.valor).toFixed(2)}`;
		}).join("%0A");

		const total = Number(devedor.total_devido).toFixed(2);
		const mensagem = `Olá, ${devedor.contato.nome}! Tudo bem?%0A%0ASegue o demonstrativo detalhado dos valores em aberto:%0A%0A${itensText}%0A%0A*Total pendente:* R$ ${total}%0A%0AQuando puder realizar o acerto, por favor me envie o comprovante. Muito obrigado!`;

		window.open(`https://wa.me/${telefone}?text=${mensagem}`, "_blank");
	};

	const formatMonthReference = (mesStr: string) => {
		const [ano, mes] = mesStr.split("-").map(Number);
		const data = new Date(ano, mes - 1, 1);
		const nome = data.toLocaleString("pt-BR", { month: "long" });
		return `${nome.charAt(0).toUpperCase() + nome.slice(1)} ${ano}`;
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

			dadosGrafico.push({
				mes: mesesNomes[i],
				entradas: ent,
				gastos: gas + fat,
				cartoes: fat,
				investimentos: inv,
				dividas: div,
			});
		}

		const parseDate = (d: any) => new Date(d).getTime();
		const recentesEntradas = [...filteredEntradas].sort((a, b) => parseDate(b.data) - parseDate(a.data)).slice(0, 5);
		const recentesGastos = [...filteredGastos].sort((a, b) => parseDate(b.data) - parseDate(a.data)).slice(0, 5);
		const recentesCartoes = [...filteredFaturas].sort((a, b) => parseDate(b.data) - parseDate(a.data)).slice(0, 5);
		const recentesInvestimentos = [...filteredInvestimentos].slice(0, 5);
		const recentesDividas = [...filteredDividas].sort((a, b) => parseDate(b.vencimento_parcela) - parseDate(a.vencimento_parcela)).slice(0, 5);

		return {
			totaisMes,
			dadosGrafico,
			recentes: {
				entradas: recentesEntradas,
				gastos: recentesGastos,
				cartoes: recentesCartoes,
				investimentos: recentesInvestimentos,
				dividas: recentesDividas
			}
		};
	}, [rawEntradas, rawGastos, rawFaturas, rawInvestimentos, rawDividas, filterYear, filterMonth]);

	const cartoesResumo = useMemo(() => {
		if (cartoes.length === 0) return [];

		const activeMonthStr = filterMonth !== "all"
			? `${filterYear}-${String(filterMonth).padStart(2, '0')}`
			: `${filterYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

		return cartoes.map((c: any) => {
			const gastosCartao = rawGastos.filter(g =>
				g.cartao_id === c.id &&
				g.data.startsWith(activeMonthStr)
			);
			const totalFatura = gastosCartao.reduce((sum, item) => sum + Number(item.valor), 0);

			const pagamentosFatura = rawFaturas.filter(p =>
				p.cartao_id === c.id &&
				p.mes_referencia === activeMonthStr
			);
			const totalPago = pagamentosFatura.reduce((sum, item) => sum + Number(item.valor), 0);

			const pendente = Math.max(0, totalFatura - totalPago);
			const limiteDisponivel = Math.max(0, Number(c.limite) - totalFatura);
			const percentualUso = Number(c.limite) > 0 ? (totalFatura / Number(c.limite)) * 100 : 0;

			return {
				cartao: c,
				totalFatura,
				totalPago,
				pendente,
				limiteDisponivel,
				percentualUso,
				mesStr: activeMonthStr
			};
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

	const totalEntradasPie = useMemo(() => {
		return entradaPieData.reduce((acc, cur) => acc + Number(cur.value), 0);
	}, [entradaPieData]);

	const totalGastosPie = useMemo(() => {
		return gastoPieData.reduce((acc, cur) => acc + Number(cur.value), 0);
	}, [gastoPieData]);

	const saldoFiltrado = useMemo(() => {
		return dashboardData.totaisMes.entradas - dashboardData.totaisMes.gastos;
	}, [dashboardData]);

	const COLORS_ENTRADAS = ["#10B981", "#34D399", "#059669", "#6EE7B7", "#047857"];
	const COLORS_GASTOS = ["#F43F5E", "#FB7185", "#E11D48", "#FDA4AF", "#BE123C", "#F87171", "#EF4444"];

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
				channelEntradas = financeService.subscribeToChanges("entradas", user.id, loadDashboardData);
				channelGastos = financeService.subscribeToChanges("gastos", user.id, loadDashboardData);
			}
		}

		setupRealtime();

		return () => {
			if (channelEntradas) supabase.removeChannel(channelEntradas);
			if (channelGastos) supabase.removeChannel(channelGastos);
		};
	}, [loadDashboardData]);

	if (isFetchingData) {
		return (
			<div className="h-[80vh] flex flex-col items-center justify-center space-y-4">
				<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
				<p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Carregando painel...</p>
			</div>
		);
	}

	const containerVariants = {
		hidden: { opacity: 0 },
		visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
	};

	const itemVariants = {
		hidden: { y: 15, opacity: 0 },
		visible: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 260, damping: 22 } }
	};

	return (
		<motion.div
			className="space-y-6 sm:space-y-8 pb-20"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			{/* 1. GREETING HEADER & QUICK ACTIONS */}
			<motion.div
				variants={itemVariants}
				className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[36px] border border-slate-100 dark:border-slate-800 shadow-sm transition-colors"
			>
				<div className="space-y-1">
					<h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
						<span>
							<span>Olá, </span>
							<span className="inline-block">{nome}</span>
							<span>!</span>
						</span>
						<span className="animate-bounce">👋</span>
					</h2>
					<p className="text-slate-400 dark:text-slate-500 font-bold text-xs uppercase tracking-wider">Painel de controle financeiro pessoal</p>
				</div>

				<div className="flex flex-wrap gap-3">
					<button
						onClick={() => navigate("/gastos?add=true")}
						className="flex items-center gap-2 px-5 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-bold text-xs shadow-md shadow-rose-100 dark:shadow-none transition-all active:scale-95 cursor-pointer"
					>
						<TrendingDown size={14} /> <span>Novo Gasto</span>
					</button>
					<button
						onClick={() => navigate("/entradas?add=true")}
						className="flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-xs shadow-md shadow-emerald-100 dark:shadow-none transition-all active:scale-95 cursor-pointer"
					>
						<TrendingUp size={14} /> <span>Nova Entrada</span>
					</button>
					<button
						onClick={() => navigate("/dividas?add=true")}
						className="flex items-center gap-2 px-5 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-2xl font-bold text-xs shadow-md shadow-purple-100 dark:shadow-none transition-all active:scale-95 cursor-pointer"
					>
						<HandCoins size={14} /> <span>Nova Dívida</span>
					</button>
				</div>
			</motion.div>

			{/* 3. FILTROS (ABAIXO DE AÇÕES RÁPIDAS) */}
			<motion.div
				variants={itemVariants}
				className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl sm:rounded-[28px] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:justify-between md:items-center gap-4 transition-colors"
			>
				<div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
					<Sparkles size={16} className="text-indigo-500" />
					<p className="text-xs font-black uppercase tracking-widest">Filtrar Período</p>
				</div>

				<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
					{/* Select: Ano */}
					<div className="relative w-full sm:w-auto">
						<select
							value={filterYear}
							onChange={(e) => setFilterYear(Number(e.target.value))}
							className="appearance-none w-full pr-8 pl-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 outline-none focus:border-indigo-500 hover:bg-white dark:hover:bg-slate-750 transition-all cursor-pointer"
						>
							{[hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1].map(y => (
								<option key={y} value={y}>{y}</option>
							))}
						</select>
						<div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400">
							<ChevronDown size={12} />
						</div>
					</div>

					{/* Select: Mês */}
					<div className="relative w-full sm:w-auto">
						<select
							value={filterMonth}
							onChange={(e) => setFilterMonth(e.target.value === "all" ? "all" : Number(e.target.value))}
							className="appearance-none w-full pr-8 pl-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 outline-none focus:border-indigo-500 hover:bg-white dark:hover:bg-slate-750 transition-all cursor-pointer"
						>
							<option value="all">Ano Todo</option>
							{NOME_MESES.map((m, i) => (
								<option key={i} value={i + 1}>{m}</option>
							))}
						</select>
						<div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400">
							<ChevronDown size={12} />
						</div>
					</div>

					{/* Select: Categoria */}
					<div className="relative w-full sm:w-auto">
						<select
							value={filterCategory}
							onChange={(e) => setFilterCategory(e.target.value)}
							className="appearance-none w-full pr-8 pl-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 outline-none focus:border-indigo-500 hover:bg-white dark:hover:bg-slate-750 transition-all cursor-pointer truncate"
						>
							<option value="all">Visão Geral</option>
							<option value="entradas">Só Entradas</option>
							<option value="gastos">Só Gastos</option>
							<option value="cartoes">Só Cartões</option>
							<option value="investimentos">Só Investimentos</option>
							<option value="dividas">Só Dívidas</option>
						</select>
						<div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400">
							<ChevronDown size={12} />
						</div>
					</div>

					<div className="h-8 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block mx-1"></div>
					<ExportExcelButton />
				</div>
			</motion.div>

			{/* CARDS DE RESUMO */}
			<motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{/* 4. CARD SALDO CONSOLIDADO FILTRADO */}
				<motion.div
					whileHover={{ y: -4, boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)" }}
					className={`bg-gradient-to-br ${saldoFiltrado >= 0
							? "from-indigo-900 via-slate-900 to-indigo-950"
							: "from-rose-950 via-slate-900 to-rose-900"
						} p-5 sm:p-8 rounded-3xl sm:rounded-[32px] shadow-xl text-white relative overflow-hidden flex flex-col justify-between transition-all duration-300 md:col-span-2 lg:col-span-1`}
				>
					<div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
						<Wallet size={120} />
					</div>
					<div className="absolute -left-10 -bottom-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

					<div>
						<p className="text-indigo-300 dark:text-indigo-400 font-bold uppercase tracking-wider text-[10px] mb-2">
							{filterMonth === "all" ? "Saldo Anual Consolidado" : "Saldo do Período"}
						</p>
						<h3 className="text-4xl font-black mb-1 flex items-baseline">
							<span className="text-indigo-455 text-xl font-bold mr-1">R$</span>
							<span>{saldoFiltrado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
						</h3>
					</div>

					<div className="mt-4 pt-4 border-t border-indigo-850/40 flex justify-between items-center text-[10px] text-indigo-300 font-semibold">
						<span>
							<span>Filtro: </span>
							<span>{filterMonth === "all" ? `${filterYear}` : `${NOME_MESES[filterMonth - 1]} / ${filterYear}`}</span>
						</span>
						<span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${saldoFiltrado >= 0 ? "bg-emerald-500/20 text-emerald-350" : "bg-rose-500/20 text-rose-350"
							}`}>
							{saldoFiltrado >= 0 ? "Positivo" : "Negativo"}
						</span>
					</div>
				</motion.div>

				{(filterCategory === "all" || filterCategory === "entradas") && (
					<MetricCard
						title="Entradas (Mês)"
						value={dashboardData.totaisMes.entradas}
						icon={<TrendingUp size={20} className="text-emerald-600 dark:text-emerald-400" />}
						bgClass="bg-emerald-50 dark:bg-emerald-950/30"
						colorClass="text-emerald-600 dark:text-emerald-455"
						borderClass="bg-emerald-500"
					/>
				)}

				{(filterCategory === "all" || filterCategory === "gastos") && (
					<MetricCard
						title="Gastos (Mês)"
						value={dashboardData.totaisMes.gastos}
						icon={<TrendingDown size={20} className="text-rose-600 dark:text-rose-400" />}
						bgClass="bg-rose-50 dark:bg-rose-950/30"
						colorClass="text-rose-600 dark:text-rose-455"
						borderClass="bg-rose-500"
					/>
				)}

				{filterCategory === "cartoes" && (
					<MetricCard
						title="Faturas (Mês)"
						value={dashboardData.totaisMes.faturas}
						icon={<CreditCard size={20} className="text-purple-600 dark:text-purple-400" />}
						bgClass="bg-purple-50 dark:bg-purple-950/30"
						colorClass="text-purple-600 dark:text-purple-450"
						borderClass="bg-purple-500"
					/>
				)}

				{filterCategory === "investimentos" && (
					<MetricCard
						title="Investimentos (Mês)"
						value={dashboardData.totaisMes.investimentos}
						icon={<TrendingUp size={20} className="text-blue-600 dark:text-blue-400" />}
						bgClass="bg-blue-50 dark:bg-blue-950/30"
						colorClass="text-blue-600 dark:text-blue-450"
						borderClass="bg-blue-500"
					/>
				)}

				{filterCategory === "dividas" && (
					<MetricCard
						title="Dívidas (Mês)"
						value={dashboardData.totaisMes.dividas}
						icon={<HandCoins size={20} className="text-orange-600 dark:text-orange-400" />}
						bgClass="bg-orange-50 dark:bg-orange-950/30"
						colorClass="text-orange-600 dark:text-orange-450"
						borderClass="bg-orange-500"
					/>
				)}
			</motion.div>

			{/* GRÁFICO DINÂMICO & INSIGHTS DE IA */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
				{/* Gráfico */}
				<motion.div variants={itemVariants} className="lg:col-span-2 bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-colors">
					<div className="flex justify-between items-center mb-8">
						<h3 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Evolução Anual</h3>
					</div>
					<div className="h-80 w-full">
						{isClient && (
							<ResponsiveContainer width="100%" height="100%">
								<BarChart data={dashboardData.dadosGrafico} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
									<defs>
										<linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="#10B981" stopOpacity={0.85} />
											<stop offset="95%" stopColor="#10B981" stopOpacity={0.15} />
										</linearGradient>
										<linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="#F43F5E" stopOpacity={0.85} />
											<stop offset="95%" stopColor="#F43F5E" stopOpacity={0.15} />
										</linearGradient>
										<linearGradient id="colorCartoes" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="#A855F7" stopOpacity={0.85} />
											<stop offset="95%" stopColor="#A855F7" stopOpacity={0.15} />
										</linearGradient>
										<linearGradient id="colorInvestimentos" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="#3B82F6" stopOpacity={0.85} />
											<stop offset="95%" stopColor="#3B82F6" stopOpacity={0.15} />
										</linearGradient>
										<linearGradient id="colorDividas" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="#F97316" stopOpacity={0.85} />
											<stop offset="95%" stopColor="#F97316" stopOpacity={0.15} />
										</linearGradient>
									</defs>
									<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
									<XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontWeight: 600, fontSize: 12 }} dy={10} />
									<YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
									<Tooltip
										cursor={{ fill: "#f8fafc" }}
										contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 25px -5px rgb(0 0 0 / 0.1)", fontWeight: 600, padding: "12px 20px" }}
										formatter={(value: number) => [`R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, ""]}
									/>
									<Legend iconType="circle" wrapperStyle={{ paddingTop: "20px" }} />

									{(filterCategory === "all" || filterCategory === "entradas") && <Bar dataKey="entradas" name="Entradas" fill="url(#colorEntradas)" radius={[6, 6, 0, 0]} barSize={20} />}
									{(filterCategory === "all" || filterCategory === "gastos") && <Bar dataKey="gastos" name="Saídas/Gastos" fill="url(#colorGastos)" radius={[6, 6, 0, 0]} barSize={20} />}
									{filterCategory === "cartoes" && <Bar dataKey="cartoes" name="Faturas" fill="url(#colorCartoes)" radius={[6, 6, 0, 0]} barSize={20} />}
									{filterCategory === "investimentos" && <Bar dataKey="investimentos" name="Investimentos" fill="url(#colorInvestimentos)" radius={[6, 6, 0, 0]} barSize={20} />}
									{filterCategory === "dividas" && <Bar dataKey="dividas" name="Dívidas" fill="url(#colorDividas)" radius={[6, 6, 0, 0]} barSize={20} />}
								</BarChart>
							</ResponsiveContainer>
						)}
					</div>
				</motion.div>

				{/* Insights */}
				<motion.div
					variants={itemVariants}
					className="lg:col-span-1 bg-gradient-to-tr from-pink-500/5 via-white to-indigo-500/5 dark:from-pink-950/10 dark:via-slate-900 dark:to-indigo-950/10 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] border border-pink-100/40 dark:border-pink-950/20 shadow-sm flex flex-col justify-between transition-colors"
				>
					<div className="space-y-6 flex-1 flex flex-col">
						<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
							<h3 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
								<Sparkles className="text-pink-500 animate-pulse" size={20} />
								<span>Insights de IA</span>
							</h3>
							<button
								onClick={generateAIInsights}
								disabled={loadingAI}
								className="px-3.5 py-1.5 bg-pink-50 hover:bg-pink-100/80 dark:bg-pink-950/30 dark:hover:bg-pink-900/40 text-pink-600 dark:text-pink-400 rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5 font-black text-[10px] uppercase shadow-sm cursor-pointer active:scale-95 shrink-0"
								title="Gerar análise completa com IA"
							>
								{loadingAI ? (
									<div className="animate-spin rounded-full h-3 w-3 border-b-2 border-pink-600"></div>
								) : (
									<RefreshCw size={12} />
								)}
								<span>Analisar</span>
							</button>
						</div>

						<div className="mt-4 flex-1 overflow-y-auto no-scrollbar scroll-smooth max-h-[300px]">
							{aiReport ? (
								<div className="text-[11px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed whitespace-pre-line bg-white/40 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-inner">
									{aiReport}
								</div>
							) : (
								<div className="p-5 bg-white/70 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-800/85 text-center space-y-3">
									<div className="text-2xl select-none">✨</div>
									<h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs">Análise de IA Pendente</h4>
									<p className="text-[11px] text-slate-450 dark:text-slate-500 font-medium leading-relaxed">
										Clique no botão **Analisar** acima para que o consultor financeiro de Inteligência Artificial elabore um diagnóstico detalhado da sua saúde financeira atual e monte recomendações personalizadas.
									</p>
								</div>
							)}
						</div>
					</div>

					<div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center shrink-0">
						<span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
							{aiReport ? "Gerado por Gemini AI" : "Resumo Geral"}
						</span>
					</div>
				</motion.div>
			</div>

			{/* GRÁFICOS DE PIZZA DE CATEGORIAS */}
			<motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				{/* Entradas */}
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center relative transition-colors">
					<h3 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight mb-4 self-start flex items-center gap-2">
						<TrendingUp className="text-emerald-500" size={20} /> <span>Origem das Entradas</span>
					</h3>
					<div className="relative h-64 w-full flex justify-center items-center">
						{entradaPieData.length > 0 && isClient ? (
							<div className="w-full h-full relative flex items-center justify-center">
								<ResponsiveContainer width="100%" height="100%">
									<PieChart>
										<Pie
											data={entradaPieData}
											innerRadius={70}
											outerRadius={90}
											paddingAngle={4}
											dataKey="value"
											stroke="none"
										>
											{entradaPieData.map((_, index) => (
												<Cell key={`cell-${index}`} fill={COLORS_ENTRADAS[index % COLORS_ENTRADAS.length]} />
											))}
										</Pie>
										<Tooltip formatter={(value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
										<Legend verticalAlign="bottom" height={36} iconType="circle" />
									</PieChart>
								</ResponsiveContainer>
								<div className="absolute flex flex-col items-center justify-center pointer-events-none pb-9">
									<span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</span>
									<span className="text-lg font-black text-slate-800 dark:text-slate-100">
										R$ {totalEntradasPie.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
									</span>
								</div>
							</div>
						) : entradaPieData.length > 0 ? (
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
						) : (
							<p className="text-slate-300 dark:text-slate-700 italic text-sm">Sem entradas cadastradas neste período</p>
						)}
					</div>
				</div>

				{/* Gastos */}
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center relative transition-colors">
					<h3 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight mb-4 self-start flex items-center gap-2">
						<TrendingDown className="text-rose-500" size={20} /> <span>Destino dos Gastos</span>
					</h3>
					<div className="relative h-64 w-full flex justify-center items-center">
						{gastoPieData.length > 0 && isClient ? (
							<div className="w-full h-full relative flex items-center justify-center">
								<ResponsiveContainer width="100%" height="100%">
									<PieChart>
										<Pie
											data={gastoPieData}
											innerRadius={70}
											outerRadius={90}
											paddingAngle={4}
											dataKey="value"
											stroke="none"
										>
											{gastoPieData.map((_, index) => (
												<Cell key={`cell-${index}`} fill={COLORS_GASTOS[index % COLORS_GASTOS.length]} />
											))}
										</Pie>
										<Tooltip formatter={(value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
										<Legend verticalAlign="bottom" height={36} iconType="circle" />
									</PieChart>
								</ResponsiveContainer>
								<div className="absolute flex flex-col items-center justify-center pointer-events-none pb-9">
									<span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</span>
									<span className="text-lg font-black text-slate-800 dark:text-slate-100">
										R$ {totalGastosPie.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
									</span>
								</div>
							</div>
						) : gastoPieData.length > 0 ? (
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
						) : (
							<p className="text-slate-300 dark:text-slate-700 italic text-sm">Sem gastos cadastrados neste período</p>
						)}
					</div>
				</div>
			</motion.div>

			{/* FATURAS PENDENTES E DEVEDORES ATIVOS */}
			<motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				{/* Resumo de Faturas por Período */}
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col h-full transition-colors">
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
						<h3 className="font-black text-slate-800 dark:text-slate-100 text-xl tracking-tight flex items-center gap-2">
							<CreditCard className="text-pink-500" size={22} />
							<span>Faturas dos Cartões</span>
						</h3>
						<button
							onClick={() => navigate("/cartoes")}
							className="text-xs font-bold text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 bg-indigo-50 hover:bg-indigo-100/60 dark:bg-indigo-950/20 dark:hover:bg-indigo-900/30 px-3.5 py-1.5 rounded-full transition-all cursor-pointer w-full sm:w-auto text-center"
						>
							Ver Todos
						</button>
					</div>

					<div className="space-y-4 flex-1">
						{cartoesResumo.length === 0 ? (
							<div className="flex flex-col items-center justify-center h-48 text-center text-slate-400 dark:text-slate-500">
								<AlertCircle size={32} className="text-slate-300 mb-2" />
								<p className="font-bold text-sm">Nenhum cartão cadastrado</p>
								<p className="text-xs">Cadastre seus cartões na tela de Cartões.</p>
							</div>
						) : (
							cartoesResumo.map((res: any) => {
								return (
									<div
										key={res.cartao.id}
										className="flex flex-col p-4 bg-slate-50 dark:bg-slate-850/40 rounded-2xl border border-slate-100 dark:border-slate-800 transition-all space-y-3"
									>
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2.5">
												<span
													className="w-3.5 h-3.5 rounded-full border border-white dark:border-slate-900 shadow-sm"
													style={{ backgroundColor: res.cartao.cor_hex || "#6366f1" }}
												/>
												<p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{res.cartao.nome}</p>
											</div>
											<button
												onClick={() => navigate(`/faturas/${res.cartao.id}`)}
												className="text-xs font-black text-indigo-500 hover:text-indigo-600 dark:text-indigo-455 hover:underline cursor-pointer"
											>
												Detalhes
											</button>
										</div>

										<div className="grid grid-cols-3 gap-2 text-left pt-1">
											<div>
												<span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Fatura</span>
												<p className="font-black text-slate-700 dark:text-slate-200 text-xs">
													R$ {res.totalFatura.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
												</p>
											</div>
											<div>
												<span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Pago</span>
												<p className="font-black text-emerald-600 dark:text-emerald-400 text-xs">
													R$ {res.totalPago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
												</p>
											</div>
											<div>
												<span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Pendente</span>
												<p className="font-black text-rose-500 dark:text-rose-455 text-xs">
													R$ {res.pendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
												</p>
											</div>
										</div>

										{Number(res.cartao.limite) > 0 && (
											<div className="space-y-1.5 pt-1">
												<div className="flex justify-between items-center text-[9px] text-slate-400 dark:text-slate-550 font-black uppercase tracking-wider">
													<span>Uso: {res.percentualUso.toFixed(0)}%</span>
													<span>Disp: R$ {res.limiteDisponivel.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} / R$ {Number(res.cartao.limite).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span>
												</div>
												<div className="w-full bg-slate-150 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
													<div
														className="h-full rounded-full transition-all duration-500"
														style={{
															width: `${Math.min(res.percentualUso, 100)}%`,
															backgroundColor: res.cartao.cor_hex || "#6366f1"
														}}
													/>
												</div>
											</div>
										)}
									</div>
								);
							})
						)}
					</div>
				</div>

				{/* Devedores Ativos */}
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col h-full transition-colors">
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
						<h3 className="font-black text-slate-800 dark:text-slate-100 text-xl tracking-tight flex items-center gap-2">
							<Users className="text-pink-500" size={22} />
							<span>Devedores Ativos</span>
						</h3>
						<button
							onClick={() => navigate("/devedores")}
							className="text-xs font-bold text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 bg-indigo-50 hover:bg-indigo-100/60 dark:bg-indigo-950/20 dark:hover:bg-indigo-900/30 px-3.5 py-1.5 rounded-full transition-all cursor-pointer w-full sm:w-auto text-center"
						>
							Ir para Devedores
						</button>
					</div>

					<div className="space-y-4 flex-1">
						{devedores.filter(d => d.total_devido > 0).length === 0 ? (
							<div className="flex flex-col items-center justify-center h-48 text-center text-slate-400 dark:text-slate-500">
								<AlertCircle size={32} className="text-emerald-400 mb-2" />
								<p className="font-bold text-sm">Ninguém deve nada!</p>
								<p className="text-xs">Não há valores a receber de terceiros pendentes.</p>
							</div>
						) : (
							devedores
								.filter((d: any) => d.total_devido > 0)
								.map((devedor: any) => (
									<div
										key={devedor.contato.id}
										className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-850/40 hover:bg-pink-50/10 dark:hover:bg-pink-950/10 rounded-2xl border border-slate-100 dark:border-slate-800 transition-all"
									>
										<div className="flex items-center gap-3">
											<div className="w-9 h-9 bg-pink-100 dark:bg-pink-950/60 rounded-full flex justify-center items-center">
												<span className="text-pink-600 dark:text-pink-400 font-black text-sm">
													{devedor.contato.nome.charAt(0).toUpperCase()}
												</span>
											</div>
											<div>
												<p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{devedor.contato.nome}</p>
												<p className="text-xs text-slate-400 dark:text-slate-500 font-medium mt-0.5">
													{devedor.contato.telefone || "Sem Telefone"}
												</p>
											</div>
										</div>

										<div className="flex items-center gap-4">
											<div className="text-right">
												<p className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase">Total devido</p>
												<p className="font-black text-rose-500 dark:text-rose-455 text-sm">
													R$ {devedor.total_devido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
												</p>
											</div>
											<button
												onClick={() => handleCobrarWhatsApp(devedor)}
												className="p-2 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl transition-all shadow-sm shadow-emerald-100 dark:shadow-none cursor-pointer"
												title="Cobrar via WhatsApp"
											>
												<Phone size={16} />
											</button>
										</div>
									</div>
								))
						)}
					</div>
				</div>
			</motion.div>

			{/* ÚLTIMOS LANÇAMENTOS DINÂMICOS */}
			<motion.div variants={itemVariants} className={`grid grid-cols-1 ${filterCategory === "all" ? "lg:grid-cols-2" : "lg:grid-cols-1"} gap-8`}>
				{(filterCategory === "all" || filterCategory === "entradas") && (
					<RecentSection title="Últimas Entradas" items={dashboardData.recentes.entradas} colorClass="text-emerald-500" bgIconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400" icon={<ArrowUpRight size={18} />} onMore={() => navigate("/entradas")} dateField="data" />
				)}
				{(filterCategory === "all" || filterCategory === "gastos") && (
					<RecentSection title="Últimos Gastos" items={dashboardData.recentes.gastos} colorClass="text-rose-500" bgIconClass="bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-450" icon={<ArrowDownRight size={18} />} onMore={() => navigate("/gastos")} dateField="data" />
				)}
				{filterCategory === "cartoes" && (
					<RecentSection title="Últimos Pagtos Fatura" items={dashboardData.recentes.cartoes} colorClass="text-purple-500" bgIconClass="bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400" icon={<ArrowDownRight size={18} />} onMore={() => navigate("/cartoes")} dateField="data" />
				)}
				{filterCategory === "investimentos" && (
					<RecentSection title="Últimos Investimentos" items={dashboardData.recentes.investimentos} colorClass="text-blue-500" bgIconClass="bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400" icon={<TrendingUp size={18} />} onMore={() => navigate("/investimentos")} titleField="titulo" dateField={null} />
				)}
				{filterCategory === "dividas" && (
					<RecentSection title="Últimas Dívidas" items={dashboardData.recentes.dividas} colorClass="text-orange-500" bgIconClass="bg-orange-50 text-orange-600 dark:bg-orange-950/20 dark:text-orange-400" icon={<TrendingDown size={18} />} onMore={() => navigate("/dividas")} dateField="vencimento_parcela" />
				)}
			</motion.div>
		</motion.div>
	);
}

function MetricCard({ title, value, icon, bgClass, colorClass, borderClass }: any) {
	return (
		<motion.div
			whileHover={{ y: -4 }}
			className="bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[32px] shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col justify-between transition-all hover:border-slate-200 dark:hover:border-slate-700/80"
		>
			<div>
				<div className="flex items-center gap-3 mb-4">
					<div className={`p-2.5 rounded-2xl ${bgClass} ${colorClass}`}>
						{icon}
					</div>
					<p className="text-slate-450 dark:text-slate-500 font-bold uppercase tracking-wider text-[10px]">{title}</p>
				</div>
				<h3 className="text-3xl font-black text-slate-855 dark:text-slate-100 flex items-baseline">
					<span className="text-slate-400 dark:text-slate-655 text-xl font-bold mr-1">R$</span>
					<span>{value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
				</h3>
			</div>

			<div className="h-1.5 w-full bg-slate-50 dark:bg-slate-850 rounded-full mt-5 overflow-hidden">
				<div className={`h-full ${borderClass} rounded-full`} style={{ width: "40%" }} />
			</div>
		</motion.div>
	);
}

function RecentSection({ title, items, colorClass, bgIconClass, icon, onMore, titleField = "descricao", dateField = "data" }: any) {
	return (
		<div className="bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col h-full transition-colors">
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
				<h3 className="font-black text-slate-800 dark:text-slate-100 text-xl tracking-tight">{title}</h3>
				<button
					onClick={onMore}
					className="text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-305 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 px-3.5 py-1.5 rounded-full transition-colors flex items-center justify-center text-xs font-bold cursor-pointer w-full sm:w-auto"
				>
					<span>Ver mais</span> <ChevronRight size={14} className="ml-1" />
				</button>
			</div>

			<div className="space-y-5 flex-1">
				{items.length === 0 ? (
					<div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500 italic text-sm">
						Nenhum registro encontrado.
					</div>
				) : (
					items.map((item: any, i: number) => (
						<motion.div
							key={i}
							whileHover={{ x: 4 }}
							className="flex justify-between items-center group cursor-default"
						>
							<div className="flex items-center gap-4">
								<div className={`p-3 rounded-2xl ${bgIconClass}`}>
									{icon}
								</div>
								<div>
									<p className="font-bold text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors text-sm">{item[titleField] || item.descricao}</p>
									{dateField && item[dateField] && (
										<p className="text-[11px] text-slate-400 dark:text-slate-550 font-semibold mt-0.5">
											{new Date(item[dateField] + "T12:00:00").toLocaleDateString("pt-BR")}
										</p>
									)}
								</div>
							</div>
							<p className={`font-black tracking-tight text-sm ${colorClass}`}>
								<span className="text-[10px] mr-1 opacity-70">R$</span>
								<span>{Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
							</p>
						</motion.div>
					))
				)}
			</div>
		</div>
	);
}
