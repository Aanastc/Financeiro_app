import React, { useState, useEffect, useCallback, useMemo } from "react";
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
	PieChart,
	Pie,
} from "recharts";
import {
	Plus,
	Search,
	Calendar,
	ChevronLeft,
	ChevronRight,
	CreditCard,
	X,
	Filter,
	Receipt,
	Tag,
	ArrowDownCircle,
} from "lucide-react";

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
	const [isModalOpen, setIsModalOpen] = useState(false);

	const [year, setYear] = useState(new Date().getFullYear());
	const [monthFilter, setMonthFilter] = useState<number | "all">("all");

	// Estados do Modal
	const [descricao, setDescricao] = useState("");
	const [valor, setValor] = useState("");
	const [classificacao, setClassificacao] = useState("");
	const [dataInput, setDataInput] = useState(
		new Date().toISOString().split("T")[0],
	);
	const [novaCategoria, setNovaCategoria] = useState("");

	const loadData = useCallback(async () => {
		setLoading(true);
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (user) {
			const { data: list, error } = await supabase
				.from("gastos")
				.select("*")
				.eq("usuario_id", user.id)
				.gte("data", `${year}-01-01`)
				.lte("data", `${year}-12-31`)
				.order("data", { ascending: true });

			if (!error) setData(list || []);
		}
		setLoading(false);
	}, [year]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	const categoriasExistentes = useMemo(() => {
		return Array.from(new Set(data.map((i) => i.descricao)));
	}, [data]);

	const matrixData = useMemo(() => {
		const matrix: any = {};
		data.forEach((item) => {
			const mesIdx = new Date(item.data + "T12:00:00").getMonth();
			if (!matrix[item.descricao]) {
				matrix[item.descricao] = {
					valores: Array(12).fill(0),
					classificacao: item.classificacao,
				};
			}
			matrix[item.descricao].valores[mesIdx] += Number(item.valor);
		});

		return Object.keys(matrix).map((desc) => {
			const valores = matrix[desc].valores;
			const total = valores.reduce((a: number, b: number) => a + b, 0);
			return {
				descricao: desc,
				classificacao: matrix[desc].classificacao,
				valores,
				total,
				media: total / 12,
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

	const handleSave = async () => {
		const {
			data: { user },
		} = await supabase.auth.getUser();
		const finalDesc = novaCategoria || descricao;
		if (!user || !finalDesc || !valor) return;

		const { error } = await supabase.from("gastos").insert([
			{
				usuario_id: user.id,
				descricao: finalDesc,
				valor: parseFloat(valor),
				classificacao: classificacao || "Outros",
				data: dataInput,
			},
		]);

		if (!error) {
			setIsModalOpen(false);
			setDescricao("");
			setValor("");
			setNovaCategoria("");
			setClassificacao("");
			loadData();
		}
	};

	return (
		<div className="p-4 md:p-8 space-y-6 bg-[#FCF8F8] min-h-screen animate-in fade-in duration-700">
			{/* HEADER */}
			<div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
				<div>
					<h1 className="text-4xl font-black text-[#5D4037] flex items-center gap-3">
						<ArrowDownCircle className="text-[#E91E63]" size={32} /> Gastos
					</h1>
					<p className="text-[#5D4037]/50 font-bold">
						Monitoramento de saídas e despesas
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
					<button
						onClick={() => setIsModalOpen(true)}
						className="ml-4 bg-[#E91E63] text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:scale-105 transition-all shadow-lg shadow-pink-100">
						<Plus size={20} /> ADICIONAR
					</button>
				</div>
			</div>

			{/* SELETOR DE MÊS */}
			<div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
				{["ANO TODO", ...MESES].map((nome, idx) => {
					const isAll = nome === "ANO TODO";
					const currentIdx = isAll ? "all" : idx - 1;
					return (
						<button
							key={nome}
							onClick={() => setMonthFilter(currentIdx as any)}
							className={`px-6 py-3 rounded-2xl font-black text-xs transition-all whitespace-nowrap ${monthFilter === currentIdx ? "bg-[#5D4037] text-white" : "bg-white text-gray-400 hover:bg-gray-100"}`}>
							{nome}
						</button>
					);
				})}
			</div>

			{/* DASHBOARDS */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2 bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 h-80">
					<h3 className="font-black text-[#5D4037] flex items-center gap-2 mb-6">
						<Receipt size={18} className="text-[#E91E63]" /> Histórico de
						Despesas
					</h3>
					<ResponsiveContainer width="100%" height="100%">
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
								contentStyle={{ borderRadius: "20px", border: "none" }}
							/>
							<Bar dataKey="total" radius={[10, 10, 0, 0]} barSize={35}>
								{chartData.map((entry, index) => (
									<Cell
										key={`cell-${index}`}
										fill={
											monthFilter === index || monthFilter === "all"
												? "#E91E63"
												: "#F8D7E3"
										}
									/>
								))}
							</Bar>
						</BarChart>
					</ResponsiveContainer>
				</div>

				<div className="bg-[#5D4037] p-8 rounded-[40px] shadow-xl text-white flex flex-col justify-between relative overflow-hidden">
					<div className="z-10">
						<p className="text-pink-400 font-black uppercase text-[10px] tracking-[0.2em]">
							Total Saídas
						</p>
						<h2 className="text-5xl font-black mt-2">
							R$ {totalPeriodo.toLocaleString()}
						</h2>
						<p className="text-white/40 text-sm mt-1 font-bold">
							{monthFilter === "all"
								? "Total gasto no ano"
								: `Despesas de ${MESES[monthFilter as number]}`}
						</p>
					</div>
					<div className="h-24 z-10">
						<ResponsiveContainer width="100%" height="100%">
							<LineChart data={chartData}>
								<Line
									type="monotone"
									dataKey="total"
									stroke="#E91E63"
									strokeWidth={5}
									dot={false}
								/>
							</LineChart>
						</ResponsiveContainer>
					</div>
				</div>
			</div>

			{/* TABELA MATRIZ */}
			<div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full text-left border-collapse">
						<thead>
							<tr className="bg-gray-50/50">
								<th className="p-6 font-black text-[#5D4037] sticky left-0 bg-[#FCF8F8] z-20 border-r w-64">
									Descrição
								</th>
								<th className="p-4 text-center text-[10px] font-black text-gray-400 uppercase">
									Cat.
								</th>
								{MESES.map((m, i) => (
									<th
										key={m}
										className={`p-4 text-center text-[10px] font-black uppercase transition-all ${monthFilter === i ? "text-[#E91E63] bg-pink-50/50" : "text-gray-400"}`}>
										{m}
									</th>
								))}
								<th className="p-6 text-right font-black text-white bg-[#E91E63] rounded-tr-[40px]">
									Total
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-50">
							{matrixData.map((row, i) => (
								<tr
									key={i}
									className="hover:bg-gray-50/50 transition-colors group">
									<td className="p-6 font-bold text-[#5D4037] sticky left-0 bg-white group-hover:bg-gray-50 z-10 border-r">
										{row.descricao}
									</td>
									<td className="p-4 text-center">
										<span className="bg-gray-100 text-[9px] px-2 py-1 rounded-full font-black text-gray-400 uppercase tracking-tighter">
											{row.classificacao}
										</span>
									</td>
									{row.valores.map((v, idx) => (
										<td
											key={idx}
											className={`p-4 text-center text-sm transition-all ${monthFilter === idx ? "bg-pink-50/30 font-black text-[#E91E63]" : v > 0 ? "font-bold text-[#5D4037]" : "text-gray-200"}`}>
											{v > 0 ? v.toLocaleString() : "—"}
										</td>
									))}
									<td className="p-6 text-right font-black text-[#E91E63] bg-pink-50/20 text-lg">
										R$ {row.total.toLocaleString()}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			{/* MODAL GASTOS */}
			{isModalOpen && (
				<div className="fixed inset-0 bg-[#5D4037]/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
					<div className="bg-white w-full max-w-md rounded-[50px] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
						<div className="p-10 bg-[#E91E63] text-white">
							<h3 className="text-3xl font-black">Novo Gasto</h3>
							<p className="font-bold opacity-80 text-sm">
								Registre uma saída financeira
							</p>
						</div>

						<div className="p-10 space-y-6">
							<div className="space-y-2">
								<label className="text-[10px] font-black uppercase text-gray-400 ml-2">
									O que você pagou?
								</label>
								<select
									className="w-full p-5 bg-[#FCF8F8] rounded-3xl border-none outline-none font-bold text-[#5D4037]"
									value={descricao}
									onChange={(e) => setDescricao(e.target.value)}>
									<option value="">Selecione...</option>
									{categoriasExistentes.map((c) => (
										<option key={c} value={c}>
											{c}
										</option>
									))}
								</select>
								<input
									placeholder="Ou digite um novo nome..."
									className="w-full p-5 bg-[#FCF8F8] rounded-3xl border-none outline-none font-medium italic"
									value={novaCategoria}
									onChange={(e) => setNovaCategoria(e.target.value)}
								/>
							</div>

							<div className="space-y-2">
								<label className="text-[10px] font-black uppercase text-gray-400 ml-2">
									Classificação (Tag)
								</label>
								<input
									placeholder="Ex: Alimentação, Lazer..."
									className="w-full p-5 bg-[#FCF8F8] rounded-3xl border-none outline-none font-bold"
									value={classificacao}
									onChange={(e) => setClassificacao(e.target.value)}
								/>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<label className="text-[10px] font-black uppercase text-gray-400 ml-2">
										Valor
									</label>
									<input
										type="number"
										className="w-full p-5 bg-[#FCF8F8] rounded-3xl font-black text-[#E91E63] text-2xl outline-none"
										value={valor}
										onChange={(e) => setValor(e.target.value)}
									/>
								</div>
								<div className="space-y-2">
									<label className="text-[10px] font-black uppercase text-gray-400 ml-2">
										Data
									</label>
									<input
										type="date"
										className="w-full p-5 bg-[#FCF8F8] rounded-3xl font-bold text-gray-400 outline-none"
										value={dataInput}
										onChange={(e) => setDataInput(e.target.value)}
									/>
								</div>
							</div>

							<button
								onClick={handleSave}
								className="w-full bg-[#5D4037] text-white p-6 rounded-[30px] font-black text-xl hover:bg-[#4a332c] transition-all">
								SALVAR GASTO
							</button>
							<button
								onClick={() => setIsModalOpen(false)}
								className="w-full text-gray-300 font-bold text-sm uppercase">
								Cancelar
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
