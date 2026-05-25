import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../../packages/services/supabase";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	LineChart,
	Line,
	Cell,
} from "recharts";
import {
	Plus,
	ChevronLeft,
	ChevronRight,
	TrendingUp,
	LayoutGrid,
	DollarSign,
	Edit3,
	Calendar,
	ArrowUpCircle,
	Target,
} from "lucide-react";
import { AddEntradaWeb } from "../components/AddEntradaWeb";
import { EditEntradaWeb } from "../components/EditEntradaWeb";

const MESES = [
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

export default function EntradasWeb() {
	const [data, setData] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [year, setYear] = useState(new Date().getFullYear());
	const [monthFilter, setMonthFilter] = useState<number | "all">("all");
	const [isAddOpen, setIsAddOpen] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);

	const loadData = useCallback(async () => {
		setLoading(true);
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (user) {
			const { data: list } = await supabase
				.from("entradas")
				.select("*")
				.eq("usuario_id", user.id)
				.gte("data", `${year}-01-01`)
				.lte("data", `${year}-12-31`)
				.order("data", { ascending: true });
			setData(list || []);
		}
		setLoading(false);
	}, [year]);

	useEffect(() => {
		loadData();

		// REALTIME SUBSCRIPTION
		let channel: any;
		async function setupRealtime() {
			const { data: { user } } = await supabase.auth.getUser();
			if (user) {
				channel = financeService.subscribeToChanges("entradas", user.id, loadData);
			}
		}
		setupRealtime();

		return () => {
			if (channel) supabase.removeChannel(channel);
		};
	}, [loadData]);

	const categoriasExistentes = useMemo(
		() => Array.from(new Set(data.map((i) => i.descricao))).sort(),
		[data],
	);

	const matrixData = useMemo(() => {
		const matrix: any = {};
		data.forEach((item) => {
			const mesIdx = new Date(item.data + "T12:00:00").getUTCMonth();
			if (!matrix[item.descricao]) matrix[item.descricao] = Array(12).fill(0);
			matrix[item.descricao][mesIdx] += Number(item.valor);
		});
		return Object.keys(matrix).map((desc) => {
			const valores = matrix[desc];
			const total = valores.reduce((a: number, b: number) => a + b, 0);
			const mesesComValor = valores.filter((v) => v > 0).length;
			return {
				descricao: desc,
				valores,
				total,
				media: total / (mesesComValor || 1),
			};
		});
	}, [data]);

	const chartData = MESES.map((nome, idx) => ({
		name: nome,
		total: matrixData.reduce((acc, row) => acc + row.valores[idx], 0),
	}));

	const totalPeriodo = useMemo(() => {
		if (monthFilter === "all")
			return matrixData.reduce((a, b) => a + b.total, 0);
		return matrixData.reduce((a, b) => a + b.valores[monthFilter as number], 0);
	}, [matrixData, monthFilter]);

	const ultimosLancamentos = useMemo(() => {
		return [...data]
			.sort(
				(a, b) =>
					new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
			)
			.slice(0, 4);
	}, [data]);

	return (
		<div className="p-8 space-y-8 bg-[#FDFCFB] min-h-screen animate-in fade-in duration-500">
			{/* SECTION: HEADER & ACTIONS */}
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
				<div className="space-y-1">
					<div className="flex items-center gap-3">
						<div className="bg-green-100 p-2 rounded-xl text-green-600">
							<TrendingUp size={24} />
						</div>
						<h1 className="text-3xl font-black text-[#2D2424]">
							Fluxo de Entradas
						</h1>
					</div>
					<p className="text-gray-400 font-medium text-sm ml-12">
						Monitore o crescimento da sua receita em {year}
					</p>
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<div className="flex items-center bg-gray-50 rounded-2xl p-1 border border-gray-100">
						<button
							onClick={() => setYear(year - 1)}
							className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all">
							<ChevronLeft size={20} />
						</button>
						<span className="px-4 font-black text-[#2D2424]">{year}</span>
						<button
							onClick={() => setYear(year + 1)}
							className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all">
							<ChevronRight size={20} />
						</button>
					</div>

					<button
						onClick={() => setIsEditOpen(true)}
						className="px-6 py-3 bg-white border border-gray-200 text-[#2D2424] rounded-2xl font-bold flex items-center gap-2 hover:bg-gray-50 transition-all text-sm">
						<Edit3 size={16} /> Gerenciar
					</button>

					<button
						onClick={() => setIsAddOpen(true)}
						className="px-6 py-3 bg-green-500 text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-green-600 transition-all shadow-lg shadow-green-100 text-sm">
						<Plus size={20} /> Novo Lançamento
					</button>
				</div>
			</div>

			{/* SECTION: KPI CARDS */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
					<p className="text-xs font-bold text-gray-400 uppercase mb-2">
						Total no Período
					</p>
					<h3 className="text-2xl font-black text-green-600">
						R$ {totalPeriodo.toLocaleString()}
					</h3>
				</div>
				<div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
					<p className="text-xs font-bold text-gray-400 uppercase mb-2">
						Média por Lançamento
					</p>
					<h3 className="text-2xl font-black text-[#2D2424]">
						R${" "}
						{(totalPeriodo / (data.length || 1)).toLocaleString(undefined, {
							maximumFractionDigits: 0,
						})}
					</h3>
				</div>
				<div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
					<p className="text-xs font-bold text-gray-400 uppercase mb-2">
						Maior Receita
					</p>
					<h3 className="text-2xl font-black text-[#2D2424]">
						R${" "}
						{Math.max(...data.map((d) => Number(d.valor)), 0).toLocaleString()}
					</h3>
				</div>
				<div className="bg-green-600 p-6 rounded-[32px] shadow-lg text-white">
					<p className="text-xs font-bold text-green-200 uppercase mb-2">
						Status Anual
					</p>
					<div className="flex items-center gap-2">
						<ArrowUpCircle size={24} />
						<h3 className="text-2xl font-black">Em Alta</h3>
					</div>
				</div>
			</div>

			{/* SECTION: CHARTS & SELECTORS */}
			<div className="space-y-4">
				<div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
					{["all", ...Array.from({ length: 12 }, (_, i) => i)].map((m) => (
						<button
							key={m}
							onClick={() => setMonthFilter(m as any)}
							className={`px-6 py-2.5 rounded-full font-bold text-xs transition-all whitespace-nowrap border ${
								monthFilter === m
									? "bg-[#2D2424] text-white border-[#2D2424]"
									: "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
							}`}>
							{m === "all" ? "ANO COMPLETO" : MESES[m as number].toUpperCase()}
						</button>
					))}
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<div className="lg:col-span-2 bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 h-[400px]">
						<div className="flex justify-between items-center mb-8">
							<h3 className="font-black text-[#2D2424] flex items-center gap-2">
								<Calendar size={18} className="text-green-500" /> Sazonalidade
								Mensal
							</h3>
						</div>
						<ResponsiveContainer width="100%" height="80%">
							<BarChart data={chartData}>
								<CartesianGrid
									strokeDasharray="3 3"
									vertical={false}
									stroke="#f0f0f0"
								/>
								<XAxis
									dataKey="name"
									axisLine={false}
									tickLine={false}
									tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 600 }}
								/>
								<YAxis
									axisLine={false}
									tickLine={false}
									tick={{ fill: "#94a3b8", fontSize: 11 }}
								/>
								<Tooltip
									cursor={{ fill: "#f8fafc" }}
									contentStyle={{
										borderRadius: "16px",
										border: "none",
										boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
									}}
								/>
								<Bar dataKey="total" radius={[8, 8, 0, 0]} barSize={40}>
									{chartData.map((entry, index) => (
										<Cell
											key={index}
											fill={
												monthFilter === index || monthFilter === "all"
													? "#22c55e"
													: "#e2e8f0"
											}
										/>
									))}
								</Bar>
							</BarChart>
						</ResponsiveContainer>
					</div>

					<div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 flex flex-col">
						<h3 className="font-black text-[#2D2424] mb-6 flex items-center gap-2">
							<Target size={18} className="text-green-500" /> Últimos
							Lançamentos
						</h3>
						<div className="space-y-4 flex-1">
							{ultimosLancamentos.map((item) => (
								<div
									key={item.id}
									className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-green-50 transition-colors group">
									<div className="min-w-0">
										<p className="font-bold text-[#2D2424] truncate text-sm">
											{item.descricao}
										</p>
										<p className="text-[10px] text-gray-400 font-bold uppercase">
											{new Date(item.data).toLocaleDateString("pt-BR")}
										</p>
									</div>
									<p className="font-black text-green-600 text-sm">
										R$ {Number(item.valor).toLocaleString()}
									</p>
								</div>
							))}
							{data.length === 0 && (
								<div className="h-full flex items-center justify-center text-gray-300 text-sm font-medium italic">
									Nenhum registro encontrado.
								</div>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* SECTION: MATRIX TABLE */}
			<div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
				<div className="p-8 border-b border-gray-50 flex justify-between items-center">
					<h3 className="font-black text-[#2D2424] flex items-center gap-2">
						<LayoutGrid size={18} className="text-green-500" /> Matriz de
						Receitas Recorrentes
					</h3>
					<span className="text-[10px] bg-green-100 text-green-700 px-3 py-1 rounded-full font-black">
						ANUAL {year}
					</span>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full text-left border-collapse">
						<thead>
							<tr className="bg-gray-50/50">
								<th className="p-6 font-black text-[#2D2424] sticky left-0 bg-white z-20 border-r w-64">
									Descrição
								</th>
								{MESES.map((m, i) => (
									<th
										key={m}
										className={`p-4 text-center text-[10px] font-black uppercase transition-all ${monthFilter === i ? "text-green-600 bg-green-50/50" : "text-gray-400"}`}>
										{m}
									</th>
								))}
								<th className="p-6 text-right font-black text-green-700 bg-green-50">
									Total
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-50">
							{loading ? (
								<tr>
									<td
										colSpan={14}
										className="p-20 text-center animate-pulse font-black text-gray-300">
										CARREGANDO DADOS...
									</td>
								</tr>
							) : (
								matrixData.map((row, i) => (
									<tr
										key={i}
										className="hover:bg-gray-50 transition-colors group">
										<td className="p-6 font-bold text-gray-700 sticky left-0 bg-white group-hover:bg-gray-50 z-10 border-r">
											{row.descricao}
										</td>
										{row.valores.map((v, idx) => (
											<td
												key={idx}
												className={`p-4 text-center text-sm ${monthFilter === idx ? "bg-green-50/30 font-black text-green-600" : v > 0 ? "font-bold text-gray-600" : "text-gray-200"}`}>
												{v > 0
													? v.toLocaleString(undefined, {
															minimumFractionDigits: 0,
														})
													: "—"}
											</td>
										))}
										<td className="p-6 text-right font-black text-green-600 bg-green-50/40">
											R$ {row.total.toLocaleString()}
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>

			{/* MODALS */}
			<AddEntradaWeb
				isOpen={isAddOpen}
				onClose={() => setIsAddOpen(false)}
				onSuccess={loadData}
				categorias={categoriasExistentes}
			/>
			<EditEntradaWeb
				isOpen={isEditOpen}
				onClose={() => setIsEditOpen(false)}
				onSuccess={loadData}
				dataSnapshot={data}
				categorias={categoriasExistentes}
			/>
		</div>
	);
}
