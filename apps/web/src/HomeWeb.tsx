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
} from "recharts";
import { ArrowUpRight, ArrowDownRight, ChevronRight, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authService } from "../../../packages/services/auth.service";
import { financeService } from "../../../packages/services/finance.service";
import { ExportExcelButton } from "./components/ExportExcelButton";
import { motion } from "framer-motion";

export default function HomeWeb() {
	const navigate = useNavigate();
	const [stats, setStats] = useState({
		entradasMes: 0,
		gastosMes: 0,
		saldoTotal: 0,
	});
	const [nome, setNome] = useState("");
	const [chartData, setChartData] = useState<any[]>([]);
	const [recentes, setRecentes] = useState<{ entradas: any[]; gastos: any[] }>({
		entradas: [],
		gastos: [],
	});

	// FILTROS
	const hoje = new Date();
	const [filterYear, setFilterYear] = useState(hoje.getFullYear());
	const [filterMonth, setFilterMonth] = useState<number | "all">("all");
	const [filterCategory, setFilterCategory] = useState<string>("all");
	
	const [rawEntradas, setRawEntradas] = useState<any[]>([]);
	const [rawGastos, setRawGastos] = useState<any[]>([]);
	const [rawFaturas, setRawFaturas] = useState<any[]>([]);
	const [rawInvestimentos, setRawInvestimentos] = useState<any[]>([]);
	const [rawDividas, setRawDividas] = useState<any[]>([]);

	const loadDashboardData = useCallback(async () => {
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (!user) return;

		const startOfYear = `${filterYear}-01-01`;
		const endOfYear = `${filterYear}-12-31`;

		const [saldoAtual, resEntradas, resGastos, resFaturas, resInv, resDiv] = await Promise.all([
			financeService.getGlobalBalance(user.id),
			supabase.from("entradas").select("*").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear),
			supabase.from("gastos").select("*").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear),
			supabase.from("pagamentos_faturas").select("*").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear),
			supabase.from("investimentos").select("*").eq("usuario_id", user.id),
			supabase.from("dividas").select("*").eq("usuario_id", user.id).gte("vencimento_parcela", startOfYear).lte("vencimento_parcela", endOfYear),
		]);

		setStats(prev => ({ ...prev, saldoTotal: saldoAtual }));
		setRawEntradas(resEntradas.data || []);
		setRawGastos(resGastos.data || []);
		setRawFaturas(resFaturas.data || []);
		setRawInvestimentos(resInv.data || []);
		setRawDividas(resDiv.data || []);
	}, [filterYear]);

	const dashboardData = useMemo(() => {
		let filteredEntradas = rawEntradas;
		let filteredGastos = rawGastos.filter(g => g.considerar_soma === true); // Débito/Dinheiro
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

		// Calculate Stats for the cards (respecting Month filter, but we handle Category filter in the UI render logic)
		const totaisMes = {
			entradas: filteredEntradas.reduce((acc, cur) => acc + Number(cur.valor), 0),
			gastos: filteredGastos.reduce((acc, cur) => acc + Number(cur.valor), 0) + filteredFaturas.reduce((acc, cur) => acc + Number(cur.valor), 0),
			faturas: filteredFaturas.reduce((acc, cur) => acc + Number(cur.valor), 0),
			investimentos: filteredInvestimentos.reduce((acc, cur) => acc + Number(cur.valor_investido), 0),
			dividas: filteredDividas.reduce((acc, cur) => acc + Number(cur.valor), 0),
		};

		// Chart Data (12 months, NO month filter, but respecting what lines are drawn in UI)
		const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
		const dadosGrafico = [];

		for (let i = 0; i < 12; i++) {
			const prefix = `${filterYear}-${String(i + 1).padStart(2, "0")}`;
			const ent = rawEntradas.filter(e => e.data.startsWith(prefix)).reduce((a, c) => a + Number(c.valor), 0);
			const gas = rawGastos.filter(g => g.considerar_soma === true && g.data.startsWith(prefix)).reduce((a, c) => a + Number(c.valor), 0);
			const fat = rawFaturas.filter(e => e.data.startsWith(prefix)).reduce((a, c) => a + Number(c.valor), 0);
			const inv = rawInvestimentos.reduce((a, c) => a + Number(c.valor_investido), 0) / 12; // Apenas distribuindo o total visualmente, já que não temos data
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

		// Recent Transactions Lists
		const parseDate = (d: any) => new Date(d).getTime();
		
		const recentesEntradas = [...filteredEntradas].sort((a, b) => parseDate(b.data) - parseDate(a.data)).slice(0, 5);
		const recentesGastos = [...filteredGastos].sort((a, b) => parseDate(b.data) - parseDate(a.data)).slice(0, 5);
		const recentesCartoes = [...filteredFaturas].sort((a, b) => parseDate(b.data) - parseDate(a.data)).slice(0, 5);
		const recentesInvestimentos = [...filteredInvestimentos].slice(0, 5); // Sem campo de data para ordenar
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

	// Framer Motion variants for staggered animations
	const containerVariants = {
		hidden: { opacity: 0 },
		visible: {
			opacity: 1,
			transition: {
				staggerChildren: 0.1
			}
		}
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

			{/* CARDS DE RESUMO */}
			<motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
				{/* Saldo Total sempre visível */}
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

				{/* Cards Dinâmicos */}
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

			{/* GRÁFICO DINÂMICO */}
			<motion.div variants={itemVariants} className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
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
			className={`bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 flex flex-col justify-center ${hoverClass} transition-shadow`}
		>
			<div className="flex items-center gap-3 mb-3">
				<div className={`${bgClass} p-2.5 rounded-full`}>
					{icon}
				</div>
				<p className="text-slate-500 font-semibold uppercase tracking-wider text-xs">{title}</p>
			</div>
			<h3 className="text-3xl font-black text-slate-800">
				<span className="text-slate-400 text-xl mr-1">R$</span>
				{value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
			</h3>
		</motion.div>
	);
}

function RecentSection({ title, items, colorClass, bgIconClass, icon, onMore, titleField = "descricao", dateField = "data" }: any) {
	return (
		<div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col h-full">
			<div className="flex justify-between items-center mb-6">
				<h3 className="font-black text-slate-800 text-xl tracking-tight">{title}</h3>
				<button
					onClick={onMore}
					className="text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-full transition-colors flex items-center text-sm font-bold"
				>
					Ver mais <ChevronRight size={16} className="ml-1" />
				</button>
			</div>
			
			<div className="space-y-5 flex-1">
				{items.length === 0 ? (
					<div className="flex items-center justify-center h-full text-slate-400 italic text-sm">
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
									<p className="font-bold text-slate-700 group-hover:text-slate-900 transition-colors">{item[titleField] || item.descricao}</p>
									{dateField && item[dateField] && (
										<p className="text-xs text-slate-400 font-medium mt-0.5">
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
