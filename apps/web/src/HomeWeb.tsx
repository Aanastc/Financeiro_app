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
	const [stats, setStats] = useState({ entradas: 0, gastos: 0 });
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

			// 1. DEFINIÇÃO DE DATAS PARA O GRÁFICO (Últimos 6 meses)
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
			const hoje = new Date();
			const seisMesesAtras = new Date(
				hoje.getFullYear(),
				hoje.getMonth() - 5,
				1,
			);
			const dataInicioBusca = seisMesesAtras.toISOString().split("T")[0];

			// 2. BUSCA DE DADOS FILTRADOS POR USUÁRIO
			const [resEntradas, resGastos] = await Promise.all([
				supabase
					.from("entradas")
					.select("*")
					.eq("usuario_id", user.id)
					.gte("data", dataInicioBusca)
					.order("data", { ascending: false }),
				supabase
					.from("gastos")
					.select("*")
					.eq("usuario_id", user.id)
					.gte("data", dataInicioBusca)
					.order("data", { ascending: false }),
			]);

			const todasEntradas = resEntradas.data || [];
			const todosGastos = resGastos.data || [];

			// 3. PROCESSAMENTO DOS DADOS PARA O GRÁFICO
			const dadosProcessados = [];
			for (let i = 5; i >= 0; i--) {
				const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
				const mesIndex = d.getMonth();
				const mesNome = mesesNomes[mesIndex];
				const anoMesPrefix = `${d.getFullYear()}-${String(mesIndex + 1).padStart(2, "0")}`;

				const totalEnt = todasEntradas
					.filter((e) => e.data.startsWith(anoMesPrefix))
					.reduce((acc, cur) => acc + Number(cur.valor), 0);

				const totalGas = todosGastos
					.filter((g) => g.data.startsWith(anoMesPrefix))
					.reduce((acc, cur) => acc + Number(cur.valor), 0);

				dadosProcessados.push({
					mes: mesNome,
					entradas: totalEnt,
					gastos: totalGas,
				});
			}

			setChartData(dadosProcessados);

			// 4. ATUALIZAR STATUS DO MÊS ATUAL (Cards do topo)
			const mesAtualPrefix = hoje.toISOString().split("T")[0].substring(0, 7); // "YYYY-MM"
			const entMes = todasEntradas
				.filter((e) => e.data.startsWith(mesAtualPrefix))
				.reduce((acc, cur) => acc + Number(cur.valor), 0);
			const gasMes = todosGastos
				.filter((g) => g.data.startsWith(mesAtualPrefix))
				.reduce((acc, cur) => acc + Number(cur.valor), 0);

			setStats({ entradas: entMes, gastos: gasMes });

			// 5. ÚLTIMOS LANÇAMENTOS (Pega os 5 primeiros dos arrays já ordenados)
			setRecentes({
				entradas: todasEntradas.slice(0, 5),
				gastos: todosGastos.slice(0, 5),
			});
		}

		loadDashboardData();

		// Buscar nome do usuário
		authService.getCurrentUser().then((user) => {
			if (user) setNome(user.nome);
		});
	}, []);

	return (
		<div className="max-w-7xl mx-auto space-y-10 pb-20 p-6">
			{/* Header */}
			<div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
				<div>
					<h2 className="text-4xl font-black text-[#5D4037]">Dashboard</h2>
					<p className="text-[#5D4037]/50 font-medium">
						Olá, {nome}. Veja como estão suas finanças.
					</p>
				</div>
				<div className="flex gap-4 w-full md:w-auto">
					<CardMini
						label="Entradas (Mês)"
						value={stats.entradas}
						color="#4CAF50"
					/>
					<CardMini label="Gastos (Mês)" value={stats.gastos} color="#E91E63" />
				</div>
			</div>

			{/* Gráfico Comparativo Real */}
			<div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm">
				<h3 className="text-xl font-black text-[#5D4037] mb-8">
					Evolução Mensal (Últimos 6 Meses)
				</h3>
				<div className="h-80 w-full">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart
							data={chartData}
							margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
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
							/>
							<Legend iconType="circle" />
							<Bar
								dataKey="entradas"
								name="Entradas"
								fill="#4CAF50"
								radius={[10, 10, 0, 0]}
								barSize={35}
							/>
							<Bar
								dataKey="gastos"
								name="Gastos"
								fill="#E91E63"
								radius={[10, 10, 0, 0]}
								barSize={35}
							/>
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>

			{/* Listas de Transações Recentes */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				{/* Entradas */}
				<div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm">
					<div className="flex justify-between items-center mb-6">
						<h3 className="font-black text-[#5D4037] text-xl flex items-center gap-2">
							<ArrowUpRight className="text-[#4CAF50]" /> Últimas Entradas
						</h3>
						<button
							onClick={() => navigate("/entradas")}
							className="text-[#5D4037]/40 hover:text-[#4CAF50] flex items-center text-sm font-bold transition-colors">
							Ver mais <ChevronRight size={16} />
						</button>
					</div>
					<div className="space-y-4">
						{recentes.entradas.length > 0 ? (
							recentes.entradas.map((item, i) => (
								<RecentItem
									key={i}
									label={item.descricao}
									value={item.valor}
									date={item.data}
									color="#4CAF50"
								/>
							))
						) : (
							<p className="text-gray-400 text-sm italic">
								Nenhuma entrada recente.
							</p>
						)}
					</div>
				</div>

				{/* Gastos */}
				<div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm">
					<div className="flex justify-between items-center mb-6">
						<h3 className="font-black text-[#5D4037] text-xl flex items-center gap-2">
							<ArrowDownLeft className="text-[#E91E63]" /> Últimos Gastos
						</h3>
						<button
							onClick={() => navigate("/gastos")}
							className="text-[#5D4037]/40 hover:text-[#E91E63] flex items-center text-sm font-bold transition-colors">
							Ver mais <ChevronRight size={16} />
						</button>
					</div>
					<div className="space-y-4">
						{recentes.gastos.length > 0 ? (
							recentes.gastos.map((item, i) => (
								<RecentItem
									key={i}
									label={item.descricao}
									value={item.valor}
									date={item.data}
									color="#E91E63"
								/>
							))
						) : (
							<p className="text-gray-400 text-sm italic">
								Nenhum gasto recente.
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

// Subcomponentes
function CardMini({
	label,
	value,
	color,
}: {
	label: string;
	value: number;
	color: string;
}) {
	return (
		<div className="bg-white px-6 py-4 rounded-3xl border border-gray-50 text-right shadow-sm min-w-[160px] flex-1 md:flex-none">
			<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
				{label}
			</p>
			<p className="text-lg font-black" style={{ color }}>
				R$ {value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
			</p>
		</div>
	);
}

function RecentItem({
	label,
	value,
	date,
	color,
}: {
	label: string;
	value: number;
	date: string;
	color: string;
}) {
	return (
		<div className="flex justify-between items-center p-4 bg-[#FCF8F8] rounded-2xl group hover:bg-white border border-transparent hover:border-gray-100 transition-all">
			<div>
				<p className="font-bold text-[#5D4037] capitalize">{label}</p>
				<p className="text-[10px] text-gray-400 font-medium">
					{new Date(date).toLocaleDateString("pt-BR")}
				</p>
			</div>
			<p className="font-black" style={{ color }}>
				R$ {value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
			</p>
		</div>
	);
}
