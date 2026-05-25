import { useState, useEffect, useCallback } from "react";
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
import { ArrowUpRight, ArrowDownLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authService } from "../../../packages/services/auth.service";
import { financeService } from "../../../packages/services/finance.service";
import { ExportExcelButton } from "./components/ExportExcelButton";

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

	const loadDashboardData = useCallback(async () => {
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (!user) return;

		// 1. BUSCA SALDO GLOBAL E STATS DO MÊS VIA SERVICE
		const hoje = new Date();
		const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split("T")[0];
		const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split("T")[0];

		const [saldoAtual, statsMes, transacoesRecentes] = await Promise.all([
			financeService.getGlobalBalance(user.id),
			financeService.getMonthlyStats(user.id, primeiroDiaMes, ultimoDiaMes),
			financeService.getRecentTransactions(user.id, 5),
		]);

		setStats({
			entradasMes: statsMes.totalEntradas,
			gastosMes: statsMes.totalGastos,
			saldoTotal: saldoAtual,
		});

		// 2. DADOS DO GRÁFICO (Últimos 6 meses) - Mantemos lógica local por enquanto ou movemos para o service futuramente
		const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
		const dadosGrafico = [];

		// Busca dados históricos para o gráfico
		const [resEntradas, resGastos] = await Promise.all([
			supabase.from("entradas").select("*").eq("usuario_id", user.id).gte("data", new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1).toISOString().split("T")[0]),
			supabase.from("gastos").select("*").eq("usuario_id", user.id).gte("data", new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1).toISOString().split("T")[0]),
		]);

		const todasEntradas = resEntradas.data || [];
		const todosGastos = resGastos.data || [];

		for (let i = 5; i >= 0; i--) {
			const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
			const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

			dadosGrafico.push({
				mes: mesesNomes[d.getMonth()],
				entradas: todasEntradas
					.filter((e) => e.data.startsWith(prefix))
					.reduce((acc, cur) => acc + Number(cur.valor), 0),
				gastos: todosGastos
					.filter((g) => g.data.startsWith(prefix))
					.reduce((acc, cur) => acc + Number(cur.valor), 0),
			});
		}
		
		setChartData(dadosGrafico);
		setRecentes({
			entradas: transacoesRecentes.filter(t => t.tipo === 'entrada'),
			gastos: transacoesRecentes.filter(t => t.tipo === 'gasto'),
		});
	}, []);

	useEffect(() => {
		loadDashboardData();
		authService.getCurrentUser().then((u) => u && setNome(u.nome));

		// REALTIME SUBSCRIPTION
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

	return (
		<div className="max-w-7xl mx-auto space-y-10 pb-20 p-6">
			{/* CABEÇALHO SOLICITADO */}
			<div className="space-y-2">
				<h2 className="text-4xl font-black text-[#5D4037]">Olá, {nome}!</h2>
				<p className="text-lg font-bold text-[#5D4037]/60">
					Seu saldo atual é:{" "}
					<span className="text-[#5D4037] font-black ml-2">
						R${" "}
						{stats.saldoTotal.toLocaleString("pt-BR", {
							minimumFractionDigits: 2,
						})}
					</span>
				</p>
			</div>

			<ExportExcelButton />

			{/* ENTRADA E SAÍDA DO MÊS ATUAL */}
			<div className="flex flex-wrap gap-4">
				<div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex-1 min-w-[200px]">
					<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
						Entrada do mês
					</p>
					<p className="text-2xl font-black text-[#4CAF50]">
						R${" "}
						{stats.entradasMes.toLocaleString("pt-BR", {
							minimumFractionDigits: 2,
						})}
					</p>
				</div>
				<div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex-1 min-w-[200px]">
					<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
						Saída do mês
					</p>
					<p className="text-2xl font-black text-[#E91E63]">
						R${" "}
						{stats.gastosMes.toLocaleString("pt-BR", {
							minimumFractionDigits: 2,
						})}
					</p>
				</div>
			</div>

			{/* GRÁFICO (Mantido com correção do hover) */}
			<div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm">
				<h3 className="text-xl font-black text-[#5D4037] mb-8">
					Evolução Mensal
				</h3>
				<div className="h-80 w-full">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart data={chartData}>
							<CartesianGrid
								strokeDasharray="3 3"
								vertical={false}
								stroke="#F0F0F0"
							/>
							<XAxis
								dataKey="mes"
								axisLine={false}
								tickLine={false}
								tick={{ fill: "#5D4037", fontWeight: "bold" }}
							/>
							<YAxis
								axisLine={false}
								tickLine={false}
								tick={{ fill: "#5D4037", fontSize: 12 }}
							/>
							<Tooltip
								cursor={{ fill: "#FCF8F8" }}
								contentStyle={{
									borderRadius: "15px",
									border: "none",
									boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
								}}
								formatter={(value: number) => [
									`R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
									"",
								]}
							/>
							<Legend iconType="circle" />
							<Bar
								dataKey="entradas"
								name="Entradas"
								fill="#4CAF50"
								radius={[8, 8, 0, 0]}
								barSize={35}
							/>
							<Bar
								dataKey="gastos"
								name="Saídas"
								fill="#E91E63"
								radius={[8, 8, 0, 0]}
								barSize={35}
							/>
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>

			{/* ÚLTIMOS LANÇAMENTOS */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				<RecentSection
					title="Últimas Entradas"
					items={recentes.entradas}
					color="#4CAF50"
					onMore={() => navigate("/entradas")}
				/>
				<RecentSection
					title="Últimos Gastos"
					items={recentes.gastos}
					color="#E91E63"
					onMore={() => navigate("/gastos")}
				/>
			</div>
		</div>
	);
}

function RecentSection({ title, items, color, onMore }: any) {
	return (
		<div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm">
			<div className="flex justify-between items-center mb-6">
				<h3 className="font-black text-[#5D4037] text-xl">{title}</h3>
				<button
					onClick={onMore}
					className="text-[#5D4037]/30 hover:text-[#5D4037] flex items-center text-sm font-bold">
					Ver mais <ChevronRight size={16} />
				</button>
			</div>
			<div className="space-y-4">
				{items.map((item: any, i: number) => (
					<div key={i} className="flex justify-between items-center">
						<div>
							<p className="font-bold text-[#5D4037]">{item.descricao}</p>
							<p className="text-xs text-gray-400">
								{new Date(item.data).toLocaleDateString("pt-BR")}
							</p>
						</div>
						<p className="font-black" style={{ color }}>
							R${" "}
							{Number(item.valor).toLocaleString("pt-BR", {
								minimumFractionDigits: 2,
							})}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}
