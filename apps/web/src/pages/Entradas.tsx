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
} from "recharts";
import {
	Plus,
	Search,
	Calendar,
	ChevronLeft,
	ChevronRight,
	TrendingUp,
	X,
	Filter,
	DollarSign,
	LayoutGrid,
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

export default function EntradasWeb() {
	// Estados de Dados e UI
	const [data, setData] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [isModalOpen, setIsModalOpen] = useState(false);

	// Estados de Filtro
	const [year, setYear] = useState(new Date().getFullYear());
	const [monthFilter, setMonthFilter] = useState<number | "all">("all");

	// Estados do Modal
	const [descricao, setDescricao] = useState("");
	const [valor, setValor] = useState("");
	const [dataInput, setDataInput] = useState(
		new Date().toISOString().split("T")[0],
	);
	const [novaCategoria, setNovaCategoria] = useState("");

	// 1. Carregar Dados do Supabase (Filtrado por Ano)
	const loadData = useCallback(async () => {
		setLoading(true);
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (user) {
			const { data: list, error } = await supabase
				.from("entradas")
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

	// 2. Processar Categorias Únicas para o Modal
	const categoriasExistentes = useMemo(() => {
		return Array.from(new Set(data.map((i) => i.descricao)));
	}, [data]);

	// 3. Montar Matriz Anual (Planilha)
	const matrixData = useMemo(() => {
		const matrix: any = {};
		data.forEach((item) => {
			const mesIdx = new Date(item.data + "T12:00:00").getMonth();
			if (!matrix[item.descricao]) matrix[item.descricao] = Array(12).fill(0);
			matrix[item.descricao][mesIdx] += Number(item.valor);
		});

		return Object.keys(matrix).map((desc) => {
			const valores = matrix[desc];
			const total = valores.reduce((a: number, b: number) => a + b, 0);
			return { descricao: desc, valores, total, media: total / 12 };
		});
	}, [data]);

	// 4. Dados para os Gráficos
	const chartData = MESES.map((nome, idx) => ({
		name: nome,
		total: matrixData.reduce((acc, row) => acc + row.valores[idx], 0),
	}));

	const totalPeriodo = useMemo(() => {
		if (monthFilter === "all")
			return matrixData.reduce((a, b) => a + b.total, 0);
		return matrixData.reduce((a, b) => a + b.valores[monthFilter as number], 0);
	}, [matrixData, monthFilter]);

	// 5. Salvar Novo Registro
	const handleSave = async () => {
		const {
			data: { user },
		} = await supabase.auth.getUser();
		const finalDesc = novaCategoria || descricao;
		if (!user || !finalDesc || !valor) return;

		const { error } = await supabase.from("entradas").insert([
			{
				usuario_id: user.id,
				descricao: finalDesc,
				valor: parseFloat(valor),
				data: dataInput,
			},
		]);

		if (!error) {
			setIsModalOpen(false);
			setDescricao("");
			setValor("");
			setNovaCategoria("");
			loadData();
		}
	};

	return (
		<div className="p-4 md:p-8 space-y-6 bg-[#FCF8F8] min-h-screen animate-in fade-in duration-700">
			{/* HEADER E FILTRO DE ANO */}
			<div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
				<div>
					<h1 className="text-4xl font-black text-[#5D4037] flex items-center gap-3">
						<LayoutGrid className="text-[#4CAF50]" size={32} /> Entradas
					</h1>
					<p className="text-[#5D4037]/50 font-bold">
						Gestão anual e fluxo de caixa
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
						className="ml-4 bg-[#4CAF50] text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:scale-105 transition-all">
						<Plus size={20} /> ADICIONAR
					</button>
				</div>
			</div>

			{/* SELETOR DE MÊS */}
			<div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
				<button
					onClick={() => setMonthFilter("all")}
					className={`px-6 py-3 rounded-2xl font-black text-xs transition-all whitespace-nowrap ${monthFilter === "all" ? "bg-[#5D4037] text-white" : "bg-white text-gray-400 hover:bg-gray-100"}`}>
					ANO COMPLETO
				</button>
				{MESES.map((nome, idx) => (
					<button
						key={nome}
						onClick={() => setMonthFilter(idx)}
						className={`px-6 py-3 rounded-2xl font-black text-xs transition-all whitespace-nowrap ${monthFilter === idx ? "bg-[#4CAF50] text-white" : "bg-white text-gray-400 hover:bg-gray-100"}`}>
						{nome.toUpperCase()}
					</button>
				))}
			</div>

			{/* DASHBOARDS */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2 bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 h-80">
					<div className="flex justify-between items-center mb-6">
						<h3 className="font-black text-[#5D4037] flex items-center gap-2">
							<TrendingUp size={18} className="text-[#4CAF50]" /> Sazonalidade
						</h3>
						<span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">
							Receita Mensal
						</span>
					</div>
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
								cursor={{ fill: "#F1F8F1" }}
								contentStyle={{
									borderRadius: "20px",
									border: "none",
									boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
								}}
							/>
							<Bar
								dataKey="total"
								fill="#4CAF50"
								radius={[10, 10, 0, 0]}
								barSize={35}>
								{chartData.map((entry, index) => (
									<Cell
										key={`cell-${index}`}
										fill={
											monthFilter === index || monthFilter === "all"
												? "#4CAF50"
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
						<p className="text-green-400 font-black uppercase text-[10px] tracking-[0.2em]">
							Resumo do Período
						</p>
						<h2 className="text-5xl font-black mt-2">
							R$ {totalPeriodo.toLocaleString()}
						</h2>
						<p className="text-white/40 text-sm mt-1 font-bold">
							{monthFilter === "all"
								? "Total acumulado no ano"
								: `Total em ${MESES[monthFilter as number]}`}
						</p>
					</div>
					<div className="h-24 z-10">
						<ResponsiveContainer width="100%" height="100%">
							<LineChart data={chartData}>
								<Line
									type="monotone"
									dataKey="total"
									stroke="#4CAF50"
									strokeWidth={5}
									dot={false}
								/>
							</LineChart>
						</ResponsiveContainer>
					</div>
					<div className="absolute -right-10 -bottom-10 text-white/5 rotate-12">
						<DollarSign size={200} />
					</div>
				</div>
			</div>

			{/* TABELA PLANILHA */}
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
										className={`p-4 text-center text-[10px] font-black uppercase transition-all ${monthFilter === i ? "text-[#4CAF50] bg-green-50/50" : "text-gray-400"}`}>
										{m}
									</th>
								))}
								<th className="p-4 text-right font-black text-gray-400 uppercase text-[10px]">
									Média
								</th>
								<th className="p-6 text-right font-black text-white bg-[#4CAF50] rounded-tr-[40px]">
									Total
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-50">
							{loading ? (
								<tr>
									<td colSpan={15} className="p-20 text-center">
										<span className="animate-pulse font-black text-gray-300">
											CARREGANDO DADOS...
										</span>
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
												className={`p-4 text-center text-sm transition-all ${monthFilter === idx ? "bg-green-50/30 font-black text-[#4CAF50]" : v > 0 ? "font-bold text-[#5D4037]" : "text-gray-200"}`}>
												{v > 0 ? v.toLocaleString() : "—"}
											</td>
										))}
										<td className="p-4 text-right font-bold text-gray-300 text-xs italic">
											R$ {row.media.toFixed(2)}
										</td>
										<td className="p-6 text-right font-black text-[#4CAF50] bg-green-50/20 text-lg">
											R$ {row.total.toLocaleString()}
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>

			{/* MODAL DE INSERÇÃO */}
			{isModalOpen && (
				<div className="fixed inset-0 bg-[#5D4037]/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
					<div className="bg-white w-full max-w-md rounded-[50px] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
						<div className="p-10 bg-[#4CAF50] text-white relative">
							<h3 className="text-3xl font-black">Nova Entrada</h3>
							<p className="font-bold opacity-80">
								Adicione um novo ganho ao seu fluxo
							</p>
							<button
								onClick={() => setIsModalOpen(false)}
								className="absolute top-8 right-8 bg-white/20 p-2 rounded-full hover:bg-white/40 transition-all">
								<X size={20} />
							</button>
						</div>

						<div className="p-10 space-y-6">
							<div className="space-y-2">
								<label className="text-[10px] font-black uppercase text-gray-400 ml-2">
									Categoria / Fonte
								</label>
								<select
									className="w-full p-5 bg-[#FCF8F8] rounded-3xl border-none outline-none font-bold text-[#5D4037] appearance-none cursor-pointer"
									value={descricao}
									onChange={(e) => setDescricao(e.target.value)}>
									<option value="">Selecione uma categoria...</option>
									{categoriasExistentes.map((c) => (
										<option key={c} value={c as string}>
											{c as string}
										</option>
									))}
								</select>
								<input
									placeholder="Ou digite uma nova fonte..."
									className="w-full p-5 bg-[#FCF8F8] rounded-3xl border-none outline-none font-medium italic text-[#5D4037] focus:ring-2 focus:ring-[#4CAF50]"
									value={novaCategoria}
									onChange={(e) => setNovaCategoria(e.target.value)}
								/>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<label className="text-[10px] font-black uppercase text-gray-400 ml-2">
										Valor
									</label>
									<input
										type="number"
										className="w-full p-5 bg-[#FCF8F8] rounded-3xl font-black text-[#4CAF50] text-2xl outline-none"
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
								className="w-full bg-[#5D4037] text-white p-6 rounded-[30px] font-black text-xl hover:bg-[#4a332c] transition-all shadow-xl shadow-brown-100">
								SALVAR REGISTRO
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
