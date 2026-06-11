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
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authService } from "../../../packages/services/auth.service";
import { financeService } from "../../../packages/services/finance.service";
import { ExportExcelButton } from "./components/ExportExcelButton";
import { motion } from "framer-motion";
import { GoogleGenerativeAI } from "@google/generative-ai";
import toast from "react-hot-toast";

export default function HomeWeb() {
	const navigate = useNavigate();
	const [stats, setStats] = useState({
		entradasMes: 0,
		gastosMes: 0,
		saldoTotal: 0,
	});
	const [nome, setNome] = useState("");
	const [rawEntradas, setRawEntradas] = useState<any[]>([]);
	const [rawGastos, setRawGastos] = useState<any[]>([]);
	const [rawFaturas, setRawFaturas] = useState<any[]>([]);
	const [rawInvestimentos, setRawInvestimentos] = useState<any[]>([]);
	const [rawDividas, setRawDividas] = useState<any[]>([]);

	// NOVOS ESTADOS
	const [rawFaturasNaoPagas, setRawFaturasNaoPagas] = useState<any[]>([]);
	const [devedores, setDevedores] = useState<any[]>([]);
	const [loadingFaturas, setLoadingFaturas] = useState(false);

	// IA INSIGHTS
	const [aiInsights, setAiInsights] = useState<any[]>([]);
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

		const [saldoAtual, resEntradas, resGastos, resFaturas, resInv, resDiv, resDevedores] = await Promise.all([
			financeService.getGlobalBalance(user.id),
			supabase.from("entradas").select("*").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear),
			supabase.from("gastos").select("*").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear),
			supabase.from("pagamentos_faturas").select("*").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear),
			supabase.from("investimentos").select("*").eq("usuario_id", user.id),
			supabase.from("dividas").select("*").eq("usuario_id", user.id).gte("vencimento_parcela", startOfYear).lte("vencimento_parcela", endOfYear),
			financeService.getDevedores(user.id)
		]);

		setStats(prev => ({ ...prev, saldoTotal: saldoAtual }));
		setRawEntradas(resEntradas.data || []);
		setRawGastos(resGastos.data || []);
		setRawFaturas(resFaturas.data || []);
		setRawInvestimentos(resInv.data || []);
		setRawDividas(resDiv.data || []);
		setDevedores(resDevedores || []);

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
		const cached = localStorage.getItem(`finance_ai_insights_${filterYear}`);
		if (cached) {
			try {
				setAiInsights(JSON.parse(cached));
			} catch (e) {
				console.error(e);
			}
		} else {
			setAiInsights([]);
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

			const prompt = `Você é um consultor financeiro de inteligência artificial extremamente prático e amigável. Analise o seguinte resumo das finanças do usuário para o ano ${filterYear}:
- Saldo Atual da Conta: R$ ${stats.saldoTotal}
- Entradas Totais do Ano: R$ ${rawEntradas.reduce((acc, cur) => acc + Number(cur.valor), 0)}
- Despesas Totais do Ano: R$ ${rawGastos.reduce((acc, cur) => acc + Number(cur.valor), 0)}
- Dívidas Ativas: R$ ${rawDividas.reduce((acc, cur) => acc + Number(cur.valor), 0)}
- Principais categorias de despesas: ${JSON.stringify(topCategories)}
- Faturas de cartão não pagas: ${rawFaturasNaoPagas.length} faturas abertas, totalizando R$ ${rawFaturasNaoPagas.reduce((acc, cur) => acc + Number(cur.pendente), 0)}
- Devedores pendentes (dinheiro a receber): ${devedores.length} pessoas devem ao usuário, totalizando R$ ${devedores.reduce((acc, cur) => acc + Number(cur.total_devido), 0)}

Com base nestes dados, gere exatamente 3 insights financeiros muito curtos, práticos e acionáveis em português brasileiro (com emoji correspondente na frente de cada título, máximo 2 frases por insight). 
Seja encorajador, identifique pontos de atenção, oportunidades de economia ou investimentos.
Retorne a resposta EXATAMENTE no seguinte formato JSON estrito, sem formatação markdown (sem \`\`\`json ou semelhantes), contendo apenas o objeto JSON estruturado:
{
  "insights": [
    { "titulo": "Título Curto 1", "texto": "Insight 1" },
    { "titulo": "Título Curto 2", "texto": "Insight 2" },
    { "titulo": "Título Curto 3", "texto": "Insight 3" }
  ]
}`;

			const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
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
					result = await callModelWithRetry(modelName);
					break;
				} catch (err) {
					console.warn(`Falha no modelo ${modelName} no Dashboard:`, err);
					lastError = err;
				}
			}

			if (!result) {
				throw lastError || new Error("Todos os modelos de IA falharam.");
			}
			const text = result.response.text();
			const cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
			const json = JSON.parse(cleanText);
			if (json.insights && Array.isArray(json.insights)) {
				setAiInsights(json.insights);
				localStorage.setItem(`finance_ai_insights_${filterYear}`, JSON.stringify(json.insights));
				toast.success("Insights gerados com IA!");
			}
		} catch (error) {
			console.error("Erro ao gerar insights com IA:", error);
			toast.error("Erro na leitura da IA. Usando regras locais.");
		} finally {
			setLoadingAI(false);
		}
	};

	// Fallback de Insights Locais
	const computedInsights = useMemo(() => {
		if (aiInsights && aiInsights.length > 0) {
			return aiInsights;
		}

		const list = [];
		const totalEntradas = rawEntradas.reduce((acc, cur) => acc + Number(cur.valor), 0);
		const totalGastos = rawGastos.reduce((acc, cur) => acc + Number(cur.valor), 0);
		const totalDividas = rawDividas.reduce((acc, cur) => acc + Number(cur.valor), 0);
		const totalFaturasPendente = rawFaturasNaoPagas.reduce((acc, cur) => acc + Number(cur.pendente), 0);
		const totalDevedores = devedores.reduce((acc, cur) => acc + Number(cur.total_devido), 0);

		const saldoPeriodo = totalEntradas - totalGastos;
		if (totalEntradas > 0) {
			const percentSavings = (saldoPeriodo / totalEntradas) * 100;
			if (percentSavings > 25) {
				list.push({
					titulo: "Excelente Economia! 💰",
					texto: `Você poupou ${percentSavings.toFixed(0)}% de suas entradas este ano. Que tal direcionar parte disso para novos investimentos?`
				});
			} else if (percentSavings > 0) {
				list.push({
					titulo: "Balanço Positivo 📈",
					texto: `Você poupou ${percentSavings.toFixed(0)}% da sua renda. Tente alcançar a meta de 20% para acelerar sua independência financeira.`
				});
			} else {
				list.push({
					titulo: "Atenção ao Balanço ⚠️",
					texto: `Suas despesas superaram suas receitas em R$ ${Math.abs(saldoPeriodo).toLocaleString("pt-BR")}. Revise seus gastos supérfluos.`
				});
			}
		} else {
			list.push({
				titulo: "Comece seu Planejamento 📋",
				texto: "Lance suas receitas recorrentes e crie um orçamento anual para acompanhar a saúde financeira do seu ano."
			});
		}

		const faturasAtrasadasList = rawFaturasNaoPagas.filter((f: any) => {
			const [ano, mes] = f.mesReferencia.split("-").map(Number);
			const vencimentoDia = f.cartao.vencimento_dia;
			const ultimoDiaMes = new Date(ano, mes, 0).getDate();
			const diaReal = Math.min(vencimentoDia, ultimoDiaMes);
			const dataVencimento = new Date(ano, mes - 1, diaReal, 23, 59, 59);
			return new Date() > dataVencimento;
		});

		const totalFaturasAtrasadas = faturasAtrasadasList.reduce((acc, cur) => acc + Number(cur.pendente), 0);
		const totalFaturasAbertas = rawFaturasNaoPagas
			.filter((f: any) => !faturasAtrasadasList.includes(f))
			.reduce((acc, cur) => acc + Number(cur.pendente), 0);

		if (totalFaturasAtrasadas > 0) {
			list.push({
				titulo: "Faturas em Atraso ⚠️",
				texto: `Você tem R$ ${totalFaturasAtrasadas.toLocaleString("pt-BR")} em faturas de cartão em atraso. Por favor, regularize o quanto antes.`
			});
		} else if (totalFaturasAbertas > 0) {
			list.push({
				titulo: "Faturas em Aberto 💳",
				texto: `Você tem R$ ${totalFaturasAbertas.toLocaleString("pt-BR")} pendente em faturas de cartão. Lembre-se de pagar até o vencimento.`
			});
		} else if (totalDividas > 0) {
			list.push({
				titulo: "Foco nas Dívidas 📉",
				texto: `Há R$ ${totalDividas.toLocaleString("pt-BR")} em dívidas cadastradas. Considere quitá-las antes de comprometer nova renda.`
			});
		} else {
			list.push({
				titulo: "Zero Dívidas 🎉",
				texto: "Parabéns! Você está livre de dívidas ativas. Uma ótima oportunidade para focar no acúmulo de patrimônio."
			});
		}

		if (totalDevedores > 0) {
			list.push({
				titulo: "Dinheiro a Receber 🤝",
				texto: `Você tem R$ ${totalDevedores.toLocaleString("pt-BR")} emprestados para terceiros. Lembre-se de usar a cobrança via WhatsApp.`
			});
		} else {
			list.push({
				titulo: "Reserva de Emergência 🛡️",
				texto: "Dica: Mantenha de 3 a 6 meses de seus custos mensais investidos em ativos de liquidez diária para proteção."
			});
		}

		return list;
	}, [aiInsights, rawEntradas, rawGastos, rawDividas, rawFaturasNaoPagas, devedores]);

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
			dividas: filteredDividas.reduce((acc, cur) => acc + Number(cur.valor), 0),
		};

		const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
		const dadosGrafico = [];

		for (let i = 0; i < 12; i++) {
			const prefix = `${filterYear}-${String(i + 1).padStart(2, "0")}`;
			const ent = rawEntradas.filter(e => e.data.startsWith(prefix)).reduce((a, c) => a + Number(c.valor), 0);
			const gas = rawGastos.filter(g => g.considerar_soma === true && g.data.startsWith(prefix)).reduce((a, c) => a + Number(c.valor), 0);
			const fat = rawFaturas.filter(e => e.data.startsWith(prefix)).reduce((a, c) => a + Number(c.valor), 0);
			const inv = rawInvestimentos.reduce((a, c) => a + Number(c.valor_investido), 0) / 12;
			const div = rawDividas.filter(e => (e.vencimento_parcela?.startsWith(prefix) || e.data?.startsWith(prefix))).reduce((a, c) => a + Number(c.valor), 0);

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

	const COLORS_ENTRADAS = ["#10B981", "#34D399", "#059669", "#6EE7B7", "#047857"];
	const COLORS_GASTOS = ["#F43F5E", "#FB7185", "#E11D48", "#FDA4AF", "#BE123C", "#F87171", "#EF4444"];

	useEffect(() => {
		loadDashboardData();
		authService.getCurrentUser().then((u) => u && setNome(u.nome.split(" ")[0]));

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

	const containerVariants = {
		hidden: { opacity: 0 },
		visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
	};

	const itemVariants = {
		hidden: { y: 20, opacity: 0 },
		visible: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 300, damping: 24 } }
	};

	return (
		<motion.div 
			className="max-w-7xl mx-auto space-y-8 pb-20 p-6 sm:p-10"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			{/* CABEÇALHO E FILTROS */}
			<motion.div variants={itemVariants} className="flex flex-col xl:flex-row xl:justify-between xl:items-end gap-6 bg-white p-6 rounded-[32px] shadow-sm border border-slate-100">
				<div className="space-y-1">
					<h2 className="text-3xl font-black text-slate-800 tracking-tight">Olá, {nome}! 👋</h2>
					<p className="text-slate-500 font-medium text-sm">Acompanhe seu fluxo em {filterYear}.</p>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<select
						value={filterYear}
						onChange={(e) => setFilterYear(Number(e.target.value))}
						className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 hover:bg-white transition-colors cursor-pointer"
					>
						{[hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1].map(y => (
							<option key={y} value={y}>{y}</option>
						))}
					</select>

					<select
						value={filterMonth}
						onChange={(e) => setFilterMonth(e.target.value === "all" ? "all" : Number(e.target.value))}
						className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 hover:bg-white transition-colors cursor-pointer"
					>
						<option value="all">Ano Todo</option>
						{["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"].map((m, i) => (
							<option key={i} value={i + 1}>{m}</option>
						))}
					</select>

					<select
						value={filterCategory}
						onChange={(e) => setFilterCategory(e.target.value)}
						className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 max-w-[180px] hover:bg-white transition-colors cursor-pointer truncate"
					>
						<option value="all">Visão Geral</option>
						<option value="entradas">Só Entradas</option>
						<option value="gastos">Só Gastos</option>
						<option value="cartoes">Só Cartões</option>
						<option value="investimentos">Só Investimentos</option>
						<option value="dividas">Só Dívidas</option>
					</select>

					<div className="h-8 w-px bg-slate-200 hidden sm:block mx-1"></div>
					<ExportExcelButton />
				</div>
			</motion.div>

			{/* BOTÕES RÁPIDOS */}
			<motion.div variants={itemVariants} className="flex justify-center sm:justify-start gap-4">
				<button 
					onClick={() => navigate("/gastos?add=true")}
					className="w-10 h-10 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center justify-center transition-all hover:scale-110 shadow-lg shadow-rose-200 cursor-pointer"
					title="Lançar Gasto"
				>
					<TrendingDown size={18} />
				</button>
				<button 
					onClick={() => navigate("/entradas?add=true")}
					className="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full flex items-center justify-center transition-all hover:scale-110 shadow-lg shadow-emerald-200 cursor-pointer"
					title="Lançar Entrada"
				>
					<TrendingUp size={18} />
				</button>
				<button 
					onClick={() => navigate("/dividas?add=true")}
					className="w-10 h-10 bg-purple-500 hover:bg-purple-600 text-white rounded-full flex items-center justify-center transition-all hover:scale-110 shadow-lg shadow-purple-200 cursor-pointer"
					title="Lançar Dívida"
				>
					<HandCoins size={18} />
				</button>
			</motion.div>

			{/* CARDS DE RESUMO */}
			<motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<motion.div 
					whileHover={{ y: -4, boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)" }}
					className="bg-gradient-to-br from-slate-800 to-slate-900 p-8 rounded-[32px] shadow-xl text-white relative overflow-hidden"
				>
					<div className="absolute top-0 right-0 p-6 opacity-10">
						<Wallet size={80} />
					</div>
					<p className="text-slate-300 font-semibold uppercase tracking-wider text-xs mb-2">Saldo Atual da Conta</p>
					<h3 className="text-4xl font-black mb-1">
						<span className="text-slate-400 text-2xl mr-1">R$</span>
						{stats.saldoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
					</h3>
				</motion.div>

				{(filterCategory === "all" || filterCategory === "entradas") && (
					<MetricCard title="Entradas (Mês)" value={dashboardData.totaisMes.entradas} icon={<TrendingUp size={20} className="text-emerald-600" />} bgClass="bg-emerald-100" hoverClass="hover:shadow-[0_10px_25px_-5px_rgba(16,185,129,0.1)]" />
				)}
				
				{(filterCategory === "all" || filterCategory === "gastos") && (
					<MetricCard title="Gastos (Mês)" value={dashboardData.totaisMes.gastos} icon={<TrendingDown size={20} className="text-rose-600" />} bgClass="bg-rose-100" hoverClass="hover:shadow-[0_10px_25px_-5px_rgba(244,63,94,0.1)]" />
				)}

				{filterCategory === "cartoes" && (
					<MetricCard title="Faturas (Mês)" value={dashboardData.totaisMes.faturas} icon={<TrendingDown size={20} className="text-purple-600" />} bgClass="bg-purple-100" hoverClass="hover:shadow-[0_10px_25px_-5px_rgba(168,85,247,0.1)]" />
				)}

				{filterCategory === "investimentos" && (
					<MetricCard title="Investimentos (Mês)" value={dashboardData.totaisMes.investimentos} icon={<TrendingUp size={20} className="text-blue-600" />} bgClass="bg-blue-100" hoverClass="hover:shadow-[0_10px_25px_-5px_rgba(59,130,246,0.1)]" />
				)}

				{filterCategory === "dividas" && (
					<MetricCard title="Dívidas (Mês)" value={dashboardData.totaisMes.dividas} icon={<TrendingDown size={20} className="text-orange-600" />} bgClass="bg-orange-100" hoverClass="hover:shadow-[0_10px_25px_-5px_rgba(249,115,22,0.1)]" />
				)}
			</motion.div>

			{/* GRÁFICO DINÂMICO & INSIGHTS DE IA */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
				{/* Gráfico */}
				<motion.div variants={itemVariants} className="lg:col-span-2 bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col justify-between">
					<div className="flex justify-between items-center mb-8">
						<h3 className="text-xl font-black text-slate-800 tracking-tight">Evolução de {filterYear}</h3>
					</div>
					<div className="h-80 w-full">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={dashboardData.dadosGrafico} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
								<XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontWeight: 600, fontSize: 13 }} dy={10} />
								<YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
								<Tooltip
									cursor={{ fill: "#f8fafc" }}
									contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 25px -5px rgb(0 0 0 / 0.1)", fontWeight: 600, padding: "12px 20px" }}
									formatter={(value: number) => [`R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, ""]}
								/>
								<Legend iconType="circle" wrapperStyle={{ paddingTop: "20px" }} />
								
								{(filterCategory === "all" || filterCategory === "entradas") && <Bar dataKey="entradas" name="Entradas" fill="#10b981" radius={[6, 6, 0, 0]} barSize={24} />}
								{(filterCategory === "all" || filterCategory === "gastos") && <Bar dataKey="gastos" name="Saídas/Gastos" fill="#f43f5e" radius={[6, 6, 0, 0]} barSize={24} />}
								{filterCategory === "cartoes" && <Bar dataKey="cartoes" name="Faturas" fill="#a855f7" radius={[6, 6, 0, 0]} barSize={24} />}
								{filterCategory === "investimentos" && <Bar dataKey="investimentos" name="Investimentos" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={24} />}
								{filterCategory === "dividas" && <Bar dataKey="dividas" name="Dívidas" fill="#f97316" radius={[6, 6, 0, 0]} barSize={24} />}
							</BarChart>
						</ResponsiveContainer>
					</div>
				</motion.div>

				{/* Insights */}
				<motion.div variants={itemVariants} className="lg:col-span-1 bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col justify-between">
					<div className="space-y-6">
						<div className="flex justify-between items-center">
							<h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
								<Sparkles className="text-pink-500" size={20} />
								Insights Finanças
							</h3>
							<button
								onClick={generateAIInsights}
								disabled={loadingAI}
								className="p-2 bg-pink-50 hover:bg-pink-100 text-pink-600 rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5 font-bold text-xs shadow-sm hover:shadow active:scale-95"
								title="Gerar insights com Inteligência Artificial"
							>
								{loadingAI ? (
									<div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-pink-600"></div>
								) : (
									<RefreshCw size={14} />
								)}
								IA ✨
							</button>
						</div>

						<div className="space-y-4">
							{computedInsights.map((insight, idx) => (
								<div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex gap-3 hover:bg-pink-50/20 hover:border-pink-100/50 transition-all">
									<div className="text-lg">💡</div>
									<div className="space-y-1">
										<h4 className="font-bold text-slate-800 text-sm">{insight.titulo}</h4>
										<p className="text-xs text-slate-500 font-medium leading-relaxed">{insight.texto}</p>
									</div>
								</div>
							))}
						</div>
					</div>

					<div className="mt-6 pt-4 border-t border-slate-100 text-center">
						<span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
							{aiInsights.length > 0 ? "Gerado por Gemini AI" : "Análise Baseada em Regras"}
						</span>
					</div>
				</motion.div>
			</div>

			{/* GRÁFICOS DE PIZZA DE CATEGORIAS */}
			<motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				{/* Entradas */}
				<div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col items-center">
					<h3 className="text-lg font-black text-slate-800 tracking-tight mb-4 self-start flex items-center gap-2">
						<TrendingUp className="text-emerald-500" size={20} /> Origem das Entradas
					</h3>
					<div className="h-64 w-full flex justify-center items-center">
						{entradaPieData.length > 0 ? (
							<ResponsiveContainer width="100%" height="100%">
								<PieChart>
									<Pie
										data={entradaPieData}
										innerRadius={60}
										outerRadius={80}
										paddingAngle={5}
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
						) : (
							<p className="text-slate-300 italic text-sm">Sem entradas cadastradas neste período</p>
						)}
					</div>
				</div>

				{/* Gastos */}
				<div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col items-center">
					<h3 className="text-lg font-black text-slate-800 tracking-tight mb-4 self-start flex items-center gap-2">
						<TrendingDown className="text-rose-500" size={20} /> Destino dos Gastos
					</h3>
					<div className="h-64 w-full flex justify-center items-center">
						{gastoPieData.length > 0 ? (
							<ResponsiveContainer width="100%" height="100%">
								<PieChart>
									<Pie
										data={gastoPieData}
										innerRadius={60}
										outerRadius={80}
										paddingAngle={5}
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
						) : (
							<p className="text-slate-300 italic text-sm">Sem gastos cadastrados neste período</p>
						)}
					</div>
				</div>
			</motion.div>

			{/* FATURAS PENDENTES E DEVEDORES ATIVOS */}
			<motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				{/* Faturas Pendentes */}
				<div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col h-full">
					<div className="flex justify-between items-center mb-6">
						<h3 className="font-black text-slate-800 text-xl tracking-tight flex items-center gap-2">
							<CreditCard className="text-pink-500" size={22} />
							Faturas Pendentes
						</h3>
						<button 
							onClick={() => navigate("/cartoes")} 
							className="text-xs font-bold text-indigo-500 hover:text-indigo-600 bg-indigo-50 hover:bg-indigo-100/60 px-3 py-1.5 rounded-full transition-all"
						>
							Ir para Cartões
						</button>
					</div>

					<div className="space-y-4 flex-1">
						{loadingFaturas ? (
							<div className="flex justify-center items-center h-48">
								<div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500"></div>
							</div>
						) : rawFaturasNaoPagas.length === 0 ? (
							<div className="flex flex-col items-center justify-center h-48 text-center text-slate-400 dark:text-slate-500">
								<AlertCircle size={32} className="text-emerald-400 mb-2" />
								<p className="font-bold text-sm">Tudo pago por aqui!</p>
								<p className="text-xs">Não há faturas pendentes nos últimos 3 meses.</p>
							</div>
						) : (
							rawFaturasNaoPagas.map((f: any) => {
								const [ano, mes] = f.mesReferencia.split("-").map(Number);
								const vencimentoDia = f.cartao.vencimento_dia;
								const ultimoDiaMes = new Date(ano, mes, 0).getDate();
								const diaReal = Math.min(vencimentoDia, ultimoDiaMes);
								const dataVencimento = new Date(ano, mes - 1, diaReal, 23, 59, 59);
								const isAtrasada = new Date() > dataVencimento;

								return (
									<div 
										key={`${f.cartao.id}-${f.mesReferencia}`}
										className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-850 hover:bg-pink-50/10 dark:hover:bg-pink-950/10 rounded-2xl border border-slate-100 dark:border-slate-800 transition-all"
									>
										<div className="flex items-center gap-3">
											<span 
												className="w-3.5 h-3.5 rounded-full border border-white dark:border-slate-900 shadow-sm" 
												style={{ backgroundColor: f.cartao.cor_hex || "#F472B6" }}
											/>
											<div>
												<div className="flex items-center gap-2">
													<p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{f.cartao.nome}</p>
													<span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${isAtrasada ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 animate-pulse' : 'bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400'}`}>
														{isAtrasada ? 'Atrasada' : 'Aberta'}
													</span>
												</div>
												<p className="text-xs text-slate-400 dark:text-slate-500 font-medium mt-0.5">
													Vence: Dia {f.cartao.vencimento_dia} • {formatMonthReference(f.mesReferencia)}
												</p>
											</div>
										</div>

										<div className="flex items-center gap-4">
											<div className="text-right">
												<p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">A pagar</p>
												<p className="font-black text-rose-500 dark:text-rose-455 text-sm">
													R$ {f.pendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
												</p>
											</div>
											<button 
												onClick={() => navigate(`/faturas/${f.cartao.id}`)}
												className="p-2 text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-xl transition-all"
												title="Visualizar Detalhes"
											>
												<ExternalLink size={16} />
											</button>
										</div>
									</div>
								);
							})
						)}
					</div>
				</div>

				{/* Devedores Ativos */}
				<div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col h-full">
					<div className="flex justify-between items-center mb-6">
						<h3 className="font-black text-slate-800 text-xl tracking-tight flex items-center gap-2">
							<Users className="text-pink-500" size={22} />
							Devedores Ativos
						</h3>
						<button 
							onClick={() => navigate("/devedores")} 
							className="text-xs font-bold text-indigo-500 hover:text-indigo-600 bg-indigo-50 hover:bg-indigo-100/60 px-3 py-1.5 rounded-full transition-all"
						>
							Ir para Devedores
						</button>
					</div>

					<div className="space-y-4 flex-1">
						{devedores.filter(d => d.total_devido > 0).length === 0 ? (
							<div className="flex flex-col items-center justify-center h-48 text-center text-slate-400">
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
										className="flex items-center justify-between p-4 bg-slate-50 hover:bg-pink-50/10 rounded-2xl border border-slate-100 hover:border-pink-100/30 transition-all"
									>
										<div className="flex items-center gap-3">
											<div className="w-9 h-9 bg-pink-100 rounded-full flex justify-center items-center">
												<span className="text-pink-600 font-black text-sm">
													{devedor.contato.nome.charAt(0).toUpperCase()}
												</span>
											</div>
											<div>
												<p className="font-bold text-slate-800 text-sm">{devedor.contato.nome}</p>
												<p className="text-xs text-slate-400 font-medium mt-0.5">
													{devedor.contato.telefone || "Sem Telefone"}
												</p>
											</div>
										</div>

										<div className="flex items-center gap-4">
											<div className="text-right">
												<p className="text-[10px] text-slate-400 font-bold uppercase">Total devido</p>
												<p className="font-black text-rose-500 text-sm">
													R$ {devedor.total_devido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
												</p>
											</div>
											<button 
												onClick={() => handleCobrarWhatsApp(devedor)}
												className="p-2 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl transition-all shadow-sm shadow-emerald-100"
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
					<RecentSection title="Últimas Entradas" items={dashboardData.recentes.entradas} colorClass="text-emerald-500" bgIconClass="bg-emerald-50 text-emerald-600" icon={<ArrowUpRight size={18} />} onMore={() => navigate("/entradas")} dateField="data" />
				)}
				{(filterCategory === "all" || filterCategory === "gastos") && (
					<RecentSection title="Últimos Gastos" items={dashboardData.recentes.gastos} colorClass="text-rose-500" bgIconClass="bg-rose-50 text-rose-600" icon={<ArrowDownRight size={18} />} onMore={() => navigate("/gastos")} dateField="data" />
				)}
				{filterCategory === "cartoes" && (
					<RecentSection title="Últimos Pagtos Fatura" items={dashboardData.recentes.cartoes} colorClass="text-purple-500" bgIconClass="bg-purple-50 text-purple-600" icon={<ArrowDownRight size={18} />} onMore={() => navigate("/cartoes")} dateField="data" />
				)}
				{filterCategory === "investimentos" && (
					<RecentSection title="Últimos Investimentos" items={dashboardData.recentes.investimentos} colorClass="text-blue-500" bgIconClass="bg-blue-50 text-blue-600" icon={<TrendingUp size={18} />} onMore={() => navigate("/investimentos")} titleField="titulo" dateField={null} />
				)}
				{filterCategory === "dividas" && (
					<RecentSection title="Últimas Dívidas" items={dashboardData.recentes.dividas} colorClass="text-orange-500" bgIconClass="bg-orange-50 text-orange-600" icon={<TrendingDown size={18} />} onMore={() => navigate("/dividas")} dateField="vencimento_parcela" />
				)}
			</motion.div>
		</motion.div>
	);
}

function MetricCard({ title, value, icon, bgClass, hoverClass }: any) {
	return (
		<motion.div 
			whileHover={{ y: -4 }}
			className={`bg-white dark:bg-slate-900 p-8 rounded-[32px] shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col justify-center ${hoverClass} transition-all`}
		>
			<div className="flex items-center gap-3 mb-3">
				<div className={`${bgClass} p-2.5 rounded-full dark:bg-opacity-20`}>
					{icon}
				</div>
				<p className="text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-xs">{title}</p>
			</div>
			<h3 className="text-3xl font-black text-slate-800 dark:text-slate-100">
				<span className="text-slate-400 dark:text-slate-550 text-xl mr-1">R$</span>
				{value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
			</h3>
		</motion.div>
	);
}

function RecentSection({ title, items, colorClass, bgIconClass, icon, onMore, titleField = "descricao", dateField = "data" }: any) {
	return (
		<div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col h-full transition-colors">
			<div className="flex justify-between items-center mb-6">
				<h3 className="font-black text-slate-800 dark:text-slate-100 text-xl tracking-tight">{title}</h3>
				<button
					onClick={onMore}
					className="text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-305 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 px-3 py-1.5 rounded-full transition-colors flex items-center text-sm font-bold"
				>
					Ver mais <ChevronRight size={16} className="ml-1" />
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
								<div className={`p-3 rounded-2xl ${bgIconClass} dark:bg-opacity-20`}>
									{icon}
								</div>
								<div>
									<p className="font-bold text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors">{item[titleField] || item.descricao}</p>
									{dateField && item[dateField] && (
										<p className="text-xs text-slate-400 dark:text-slate-550 font-medium mt-0.5">
											{new Date(item[dateField] + "T12:00:00").toLocaleDateString("pt-BR")}
										</p>
									)}
								</div>
							</div>
							<p className={`font-black tracking-tight ${colorClass}`}>
								<span className="text-[10px] mr-1 opacity-70">R$</span>
								{Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
							</p>
						</motion.div>
					))
				)}
			</div>
		</div>
	);
}
