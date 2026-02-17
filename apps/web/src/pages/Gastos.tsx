import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../../packages/services/supabase";
import {
	BarChart,
	Bar,
	XAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	Cell,
} from "recharts";
import {
	Plus,
	ChevronLeft,
	ChevronRight,
	TrendingDown,
	LayoutGrid,
	ShoppingBag,
	Edit3,
	PieChart as PieIcon,
} from "lucide-react";
import { AddGastoWeb } from "../components/AddGastoWeb";
import { EditGastoWeb } from "../components/EditGastoWeb";

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

export default function GastosWeb() {
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
				.from("gastos")
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
	}, [loadData]);

	// AQUI: Extraindo as descrições únicas que já existem no banco
	const descricoesExistentes = useMemo(() => {
		const descricoes = data.map((item) => item.descricao);
		return Array.from(new Set(descricoes))
			.filter((d) => d && d.trim() !== "")
			.sort();
	}, [data]);

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
			return { descricao: desc, valores, total, media: total / 12 };
		});
	}, [data]);

	const totalPeriodo = useMemo(() => {
		if (monthFilter === "all")
			return matrixData.reduce((a, b) => a + b.total, 0);
		return matrixData.reduce((a, b) => a + b.valores[monthFilter as number], 0);
	}, [matrixData, monthFilter]);

	const chartData = MESES.map((nome, idx) => ({
		name: nome,
		total: matrixData.reduce((acc, row) => acc + row.valores[idx], 0),
	}));

	return (
		<div className="p-8 space-y-6 bg-[#FCF8F8] min-h-screen animate-in fade-in duration-700">
			{/* HEADER */}
			<div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
				<div>
					<h1 className="text-4xl font-black text-[#5D4037] flex items-center gap-3">
						<LayoutGrid className="text-pink-400" size={32} /> Gastos
					</h1>
					<p className="text-[#5D4037]/50 font-bold uppercase text-[10px] tracking-widest mt-1">
						Controle de Despesas Anual {year}
					</p>
				</div>

				<div className="flex items-center gap-4 bg-white p-2 rounded-3xl shadow-sm border border-gray-100">
					<button
						onClick={() => setYear(year - 1)}
						className="p-2 hover:bg-gray-50 rounded-2xl transition-all">
						<ChevronLeft />
					</button>
					<span className="text-xl font-black text-[#5D4037] px-4">{year}</span>
					<button
						onClick={() => setYear(year + 1)}
						className="p-2 hover:bg-gray-50 rounded-2xl transition-all">
						<ChevronRight />
					</button>

					<div className="flex gap-2 ml-4">
						<button
							onClick={() => setIsEditOpen(true)}
							className="bg-white border-2 border-gray-50 text-[#5D4037] px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-gray-50 transition-all">
							<Edit3 size={18} /> EDITAR
						</button>
						<button
							onClick={() => setIsAddOpen(true)}
							className="bg-pink-400 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:scale-105 transition-all shadow-lg shadow-pink-100">
							<Plus size={20} /> ADICIONAR
						</button>
					</div>
				</div>
			</div>

			{/* SELETOR DE MÊS */}
			<div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
				<button
					onClick={() => setMonthFilter("all")}
					className={`px-6 py-3 rounded-2xl font-black text-xs transition-all whitespace-nowrap ${monthFilter === "all" ? "bg-[#5D4037] text-white shadow-lg shadow-brown-200" : "bg-white text-gray-400 hover:bg-gray-100"}`}>
					ANO COMPLETO
				</button>
				{MESES.map((nome, idx) => (
					<button
						key={nome}
						onClick={() => setMonthFilter(idx)}
						className={`px-6 py-3 rounded-2xl font-black text-xs transition-all whitespace-nowrap ${monthFilter === idx ? "bg-pink-400 text-white shadow-lg shadow-pink-200" : "bg-white text-gray-400 hover:bg-gray-100"}`}>
						{nome.toUpperCase()}
					</button>
				))}
			</div>

			{/* DASHBOARDS */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2 bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 h-80">
					<h3 className="font-black text-[#5D4037] flex items-center gap-2 mb-6">
						<TrendingDown size={18} className="text-pink-400" /> Sazonalidade de
						Gastos
					</h3>
					<ResponsiveContainer width="100%" height="100%" minHeight={0}>
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
								tick={{ fill: "#BBB", fontSize: 10, fontWeight: "bold" }}
							/>
							<Tooltip
								cursor={{ fill: "#FFF5F8" }}
								contentStyle={{
									borderRadius: "20px",
									border: "none",
									boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
								}}
							/>
							<Bar
								dataKey="total"
								fill="#FF80AB"
								radius={[10, 10, 0, 0]}
								barSize={35}>
								{chartData.map((entry, index) => (
									<Cell
										key={`cell-${index}`}
										fill={
											monthFilter === index || monthFilter === "all"
												? "#FF80AB"
												: "#E0E0E0"
										}
									/>
								))}
							</Bar>
						</BarChart>
					</ResponsiveContainer>
				</div>

				<div className="bg-[#5D4037] p-8 rounded-[40px] shadow-xl text-white flex flex-col justify-between relative overflow-hidden">
					<div className="z-10">
						<p className="text-pink-300 font-black uppercase text-[10px] tracking-[0.2em] flex items-center gap-2">
							<PieIcon size={12} /> Sugestão 50-30-20
						</p>
						<h2 className="text-4xl font-black mt-2">
							R$ {totalPeriodo.toLocaleString()}
						</h2>
					</div>

					<div className="z-10 space-y-3">
						<div className="space-y-1">
							<div className="flex justify-between text-[10px] font-bold text-white/50">
								<span>ESSENCIAL (50%)</span>
								<span>R$ {(totalPeriodo * 0.5).toFixed(0)}</span>
							</div>
							<div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
								<div className="h-full bg-pink-400" style={{ width: "50%" }} />
							</div>
						</div>
						<div className="space-y-1">
							<div className="flex justify-between text-[10px] font-bold text-white/50">
								<span>LAZER (30%)</span>
								<span>R$ {(totalPeriodo * 0.3).toFixed(0)}</span>
							</div>
							<div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
								<div className="h-full bg-white" style={{ width: "30%" }} />
							</div>
						</div>
					</div>
					<div className="absolute -right-10 -bottom-10 text-white/5 rotate-12">
						<ShoppingBag size={200} />
					</div>
				</div>
			</div>

			{/* TABELA MATRIZ */}
			<div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full text-left border-collapse">
						<thead>
							<tr className="bg-gray-50/50">
								<th className="p-6 font-black text-[#5D4037] sticky left-0 bg-[#FCF8F8] z-20 border-r w-64 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
									Descrição
								</th>
								{MESES.map((m, i) => (
									<th
										key={m}
										className={`p-4 text-center text-[10px] font-black uppercase transition-all ${monthFilter === i ? "text-pink-400 bg-pink-50/50" : "text-gray-400"}`}>
										{m}
									</th>
								))}
								<th className="p-6 text-right font-black text-white bg-pink-400 rounded-tr-[40px]">
									Total Anual
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-50">
							{loading ? (
								<tr>
									<td
										colSpan={14}
										className="p-20 text-center animate-pulse font-black text-gray-300">
										CARREGANDO GASTOS...
									</td>
								</tr>
							) : (
								matrixData.map((row, i) => (
									<tr
										key={i}
										className="hover:bg-gray-50/50 transition-colors group">
										<td className="p-6 font-bold text-[#5D4037] sticky left-0 bg-white group-hover:bg-gray-50 z-10 border-r shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
											{row.descricao}
										</td>
										{row.valores.map((v, idx) => (
											<td
												key={idx}
												className={`p-4 text-center text-sm ${monthFilter === idx ? "bg-pink-50/30 font-black text-pink-400" : v > 0 ? "font-bold text-[#5D4037]" : "text-gray-200"}`}>
												{v > 0 ? v.toLocaleString() : "—"}
											</td>
										))}
										<td className="p-6 text-right font-black text-pink-400 bg-pink-50/20 text-lg">
											R$ {row.total.toLocaleString()}
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>

			{/* MODAIS COM A PROP DE SUGESTÕES CORRIGIDA */}
			<AddGastoWeb
				isOpen={isAddOpen}
				onClose={() => setIsAddOpen(false)}
				onSuccess={loadData}
				sugestoes={descricoesExistentes}
			/>

			<EditGastoWeb
				isOpen={isEditOpen}
				onClose={() => setIsEditOpen(false)}
				onSuccess={loadData}
				dataSnapshot={data}
				sugestoes={descricoesExistentes}
			/>
		</div>
	);
}
