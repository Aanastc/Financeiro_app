import { useState, useEffect } from "react";
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

	useEffect(() => {
		async function loadDashboardData() {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return;

			// 1. BUSCA TOTAL (Sem filtro de data para o saldo real)
			const [resEntradas, resGastos] = await Promise.all([
				supabase.from("entradas").select("*").eq("usuario_id", user.id),
				supabase.from("gastos").select("*").eq("usuario_id", user.id),
			]);

			const todasEntradas = resEntradas.data || [];
			const todosGastos = resGastos.data || [];

			// 2. CÁLCULO DO VALOR ATUAL (Diferença total entre Entrada e Saída)
			const totalEntradasHistorico = todasEntradas.reduce(
				(acc, cur) => acc + Number(cur.valor),
				0,
			);
			const totalGastosHistorico = todosGastos.reduce(
				(acc, cur) => acc + Number(cur.valor),
				0,
			);
			const saldoAtual = totalEntradasHistorico - totalGastosHistorico;

			// 3. STATS DO MÊS ATUAL
			const hoje = new Date();
			const mesAtualPrefix = hoje.toISOString().substring(0, 7); // "YYYY-MM"

			const entMes = todasEntradas
				.filter((e) => e.data.startsWith(mesAtualPrefix))
				.reduce((acc, cur) => acc + Number(cur.valor), 0);

			const gasMes = todosGastos
				.filter((g) => g.data.startsWith(mesAtualPrefix))
				.reduce((acc, cur) => acc + Number(cur.valor), 0);

			setStats({
				entradasMes: entMes,
				gastosMes: gasMes,
				saldoTotal: saldoAtual,
			});

			// 4. DADOS DO GRÁFICO (Últimos 6 meses)
			const mesesNomes = [
				"Jan",
				"Fev",
				"Mar",
				"Abr",
				"Mai",
				"Jun",
				"Jul",
				"Ago",
				"Set",
				"Out",
				"Nov",
				"Dez",
			];
			const dadosGrafico = [];
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
				entradas: todasEntradas.slice(0, 5),
				gastos: todosGastos.slice(0, 5),
			});
		}

		loadDashboardData();
		authService.getCurrentUser().then((u) => u && setNome(u.nome));
	}, []);

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
