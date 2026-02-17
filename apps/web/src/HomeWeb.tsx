import { useState, useEffect } from "react";
import { financeService } from "../../../packages/services/finance.service";
import { supabase } from "../../../packages/services/supabase";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	Cell,
	Legend,
} from "recharts";
import { ArrowUpRight, ArrowDownLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authService } from "../../../packages/services/auth.service";

export default function HomeWeb() {
	const navigate = useNavigate();
	const [stats, setStats] = useState({ entradas: 0, gastos: 0 });
	const [nome, setNome] = useState("");
	const [recentes, setRecentes] = useState<{ entradas: any[]; gastos: any[] }>({
		entradas: [],
		gastos: [],
	});

	// Dados fictícios para o gráfico mensal (Simulando o que viria do banco)
	const dataMensal = [
		{ mes: "Set", entradas: 4500, gastos: 3200 },
		{ mes: "Out", entradas: 5200, gastos: 4100 },
		{ mes: "Nov", entradas: 4800, gastos: 4900 },
		{ mes: "Dez", entradas: 7000, gastos: 5500 },
		{ mes: "Jan", entradas: 5900, gastos: 3800 },
		{ mes: "Fev", entradas: stats.entradas, gastos: stats.gastos },
	];

	useEffect(() => {
		async function loadData() {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return;

			// Buscar Totais
			const result = await financeService.getMonthlyStats(
				user.id,
				"2026-02-01",
				"2026-02-28",
			);
			setStats({ entradas: result.totalEntradas, gastos: result.totalGastos });

			// Buscar as 5 últimas entradas
			const { data: ent } = await supabase
				.from("entradas")
				.select("*")
				.limit(5)
				.order("data", { ascending: false });
			// Buscar os 5 últimos gastos
			const { data: gas } = await supabase
				.from("gastos")
				.select("*")
				.limit(5)
				.order("data", { ascending: false });

			setRecentes({ entradas: ent || [], gastos: gas || [] });
		}
		loadData();
	}, [stats.entradas]);

	useEffect(() => {
		async function getUserName() {
			const user = await authService.getCurrentUser();
			if (user) setNome(user.nome);
		}
		getUserName();
	}, []);

	return (
		<div className="max-w-7xl mx-auto space-y-10 pb-20">
			{/* Header e Boas-vindas */}
			<div className="flex justify-between items-end">
				<div>
					<h2 className="text-4xl font-black text-[#5D4037]">Dashboard</h2>
					<p className="text-[#5D4037]/50 font-medium">
						Seu fluxo financeiro atualizado {nome}.
					</p>
				</div>
				<div className="flex gap-4">
					<CardMini label="Entradas" value={stats.entradas} color="#4CAF50" />
					<CardMini label="Gastos" value={stats.gastos} color="#E91E63" />
				</div>
			</div>

			{/* Gráfico Comparativo Mensal */}
			<div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm">
				<h3 className="text-xl font-black text-[#5D4037] mb-8">
					Evolução Mensal
				</h3>
				<div className="h-80 w-full">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart
							data={dataMensal}
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
								contentStyle={{ borderRadius: "15px", border: "none" }}
							/>
							<Legend iconType="circle" />
							<Bar
								dataKey="entradas"
								fill="#4CAF50"
								radius={[10, 10, 0, 0]}
								barSize={35}
							/>
							<Bar
								dataKey="gastos"
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
				{/* Lado: Entradas */}
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
						{recentes.entradas.map((item, i) => (
							<RecentItem
								key={i}
								label={item.descricao}
								value={item.valor}
								date={item.data}
								color="#4CAF50"
							/>
						))}
					</div>
				</div>

				{/* Lado: Gastos */}
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
						{recentes.gastos.map((item, i) => (
							<RecentItem
								key={i}
								label={item.descricao}
								value={item.valor}
								date={item.data}
								color="#E91E63"
							/>
						))}
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
		<div className="bg-white px-6 py-4 rounded-3xl border border-gray-50 text-right shadow-sm min-w-[150px]">
			<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
				{label}
			</p>
			<p className="text-lg font-black" style={{ color }}>
				R$ {value.toLocaleString()}
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
					{new Date(date).toLocaleDateString()}
				</p>
			</div>
			<p className="font-black" style={{ color }}>
				R$ {value.toLocaleString()}
			</p>
		</div>
	);
}
