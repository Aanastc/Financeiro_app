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
	AlertTriangle,
	Filter,
	ArrowDownCircle,
	Home,
	Utensils,
	Car,
	Activity,
	Heart,
	Sparkles,
	Gift,
	Palette,
	Coffee,
	HelpCircle,
	Zap,
} from "lucide-react";
import { AddGastoWeb } from "../components/AddGastoWeb";
import { EditGastoWeb } from "../components/EditGastoWeb";
import { financeService } from "../../../../packages/services/finance.service";

const CATEGORIA_ICONS: Record<string, any> = {
	"Moradia": <Home size={14} />,
	"Alimentação": <Utensils size={14} />,
	"Transporte": <Car size={14} />,
	"Saúde": <Activity size={14} />,
	"Lazer": <Sparkles size={14} />,
	"Educação": <Zap size={14} />,
	"Assinaturas": <Coffee size={14} />,
	"Presente": <Gift size={14} />,
	"Beleza": <Palette size={14} />,
	"Outros": <HelpCircle size={14} />,
};

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

		// REALTIME SUBSCRIPTION
		let channel: any;
		async function setupRealtime() {
			const { data: { user } } = await supabase.auth.getUser();
			if (user) {
				channel = financeService.subscribeToChanges("gastos", user.id, loadData);
			}
		}
		setupRealtime();

		return () => {
			if (channel) supabase.removeChannel(channel);
		};
	}, [loadData]);

	const descricoesExistentes = useMemo(() => {
		return Array.from(new Set(data.map((item) => item.descricao)))
			.filter((d) => d && d.trim() !== "")
			.sort();
	}, [data]);

	const matrixData = useMemo(() => {
		const matrix: any = {};
		data.forEach((item) => {
			const mesIdx = new Date(item.data + "T12:00:00").getUTCMonth();
			if (!matrix[item.descricao]) {
				matrix[item.descricao] = {
					valores: Array(12).fill(0),
					parcelas: Array(12).fill(null),
					observacoes: Array(12).fill(null).map(() => [] as string[]),
					categoria: item.categoria || "Outros"
				};
			}
			matrix[item.descricao].valores[mesIdx] += Number(item.valor);
			
			if (item.observacao) {
				matrix[item.descricao].observacoes[mesIdx].push(item.observacao);
			}

			// Se for parcelado, guarda a info da parcela
			if (item.total_parcelas > 1) {
				matrix[item.descricao].parcelas[mesIdx] = {
					atual: item.parcela_atual,
					total: item.total_parcelas
				};
			}
		});
		return Object.keys(matrix).map((desc) => {
			const row = matrix[desc];
			const total = row.valores.reduce((a: number, b: number) => a + b, 0);
			return { 
				descricao: desc, 
				valores: row.valores, 
				parcelas: row.parcelas,
				observacoes: row.observacoes,
				categoria: row.categoria,
				total, 
				media: total / 12 
			};
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
		<div className="p-8 space-y-8 bg-[#FDFBFB] min-h-screen animate-in fade-in duration-500">
			{/* HEADER E AÇÕES */}
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
				<div className="space-y-1">
					<div className="flex items-center gap-3">
						<div className="bg-pink-100 p-2 rounded-xl text-pink-600">
							<TrendingDown size={24} />
						</div>
						<h1 className="text-3xl font-black text-[#3D3030]">
							Controle de Gastos
						</h1>
					</div>
					<p className="text-gray-400 font-medium text-sm ml-12">
						Gestão inteligente de despesas para {year}
					</p>
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<div className="flex items-center bg-gray-50 rounded-2xl p-1 border border-gray-100">
						<button
							onClick={() => setYear(year - 1)}
							className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all">
							<ChevronLeft size={20} />
						</button>
						<span className="px-4 font-black text-[#3D3030]">{year}</span>
						<button
							onClick={() => setYear(year + 1)}
							className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all">
							<ChevronRight size={20} />
						</button>
					</div>

					<button
						onClick={() => setIsEditOpen(true)}
						className="px-6 py-3 bg-white border border-gray-200 text-[#3D3030] rounded-2xl font-bold flex items-center gap-2 hover:bg-gray-50 transition-all text-sm">
						<Edit3 size={16} /> Editar
					</button>

					<button
						onClick={() => setIsAddOpen(true)}
						className="px-6 py-3 bg-pink-500 text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-pink-600 transition-all shadow-lg shadow-pink-100 text-sm">
						<Plus size={20} /> Novo Gasto
					</button>
				</div>
			</div>

			{/* KPI CARDS - GASTOS */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
					<p className="text-xs font-bold text-gray-400 uppercase mb-2">
						Gasto no Período
					</p>
					<h3 className="text-2xl font-black text-pink-600">
						R$ {totalPeriodo.toLocaleString()}
					</h3>
				</div>
				<div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
					<p className="text-xs font-bold text-gray-400 uppercase mb-2">
						Média p/ Despesa
					</p>
					<h3 className="text-2xl font-black text-[#3D3030]">
						R${" "}
						{(totalPeriodo / (data.length || 1)).toLocaleString(undefined, {
							maximumFractionDigits: 0,
						})}
					</h3>
				</div>
				<div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
					<p className="text-xs font-bold text-gray-400 uppercase mb-2">
						Despesa Mais Alta
					</p>
					<h3 className="text-2xl font-black text-orange-500">
						R${" "}
						{Math.max(...data.map((d) => Number(d.valor)), 0).toLocaleString()}
					</h3>
				</div>
				<div className="bg-[#3D3030] p-6 rounded-[32px] shadow-lg text-white">
					<p className="text-xs font-bold text-gray-400 uppercase mb-2">
						Itens Registrados
					</p>
					<div className="flex items-center gap-2">
						<ArrowDownCircle size={24} className="text-pink-400" />
						<h3 className="text-2xl font-black">{data.length} Transações</h3>
					</div>
				</div>
			</div>

			{/* CHARTS E FILTROS */}
			<div className="space-y-4">
				<div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
					<Filter size={16} className="text-gray-400 ml-2 mr-2" />
					{["all", ...Array.from({ length: 12 }, (_, i) => i)].map((m) => (
						<button
							key={m}
							onClick={() => setMonthFilter(m as any)}
							className={`px-6 py-2.5 rounded-full font-bold text-xs transition-all whitespace-nowrap border ${
								monthFilter === m
									? "bg-pink-500 text-white border-pink-500 shadow-md"
									: "bg-white text-gray-400 border-gray-200 hover:border-pink-200"
							}`}>
							{m === "all" ? "VISÃO ANUAL" : MESES[m as number].toUpperCase()}
						</button>
					))}
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<div className="lg:col-span-2 bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 h-[400px]">
						<h3 className="font-black text-[#3D3030] flex items-center gap-2 mb-8">
							<TrendingDown size={18} className="text-pink-500" /> Fluxo de
							Saída por Mês
						</h3>
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
									cursor={{ fill: "#fff1f2" }}
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
													? "#ec4899"
													: "#e2e8f0"
											}
										/>
									))}
								</Bar>
							</BarChart>
						</ResponsiveContainer>
					</div>

					{/* CARD 50-30-20 EVOLUÍDO */}
					<div className="bg-[#3D3030] p-8 rounded-[40px] shadow-xl text-white flex flex-col relative overflow-hidden">
						<div className="z-10">
							<p className="text-pink-400 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
								<PieIcon size={14} /> Distribuição Sugerida
							</p>
							<h2 className="text-4xl font-black mt-2 mb-8">
								R$ {totalPeriodo.toLocaleString()}
							</h2>
						</div>

						<div className="z-10 space-y-8">
							{[
								{ label: "Necessidades (50%)", val: 0.5, color: "bg-pink-500" },
								{ label: "Desejos/Lazer (30%)", val: 0.3, color: "bg-white" },
								{
									label: "Invest/Dívidas (20%)",
									val: 0.2,
									color: "bg-pink-300",
								},
							].map((item, idx) => (
								<div key={idx} className="space-y-2">
									<div className="flex justify-between text-xs font-bold uppercase">
										<span className="opacity-60">{item.label}</span>
										<span>
											R${" "}
											{(totalPeriodo * item.val).toLocaleString(undefined, {
												maximumFractionDigits: 0,
											})}
										</span>
									</div>
									<div className="h-2 bg-white/10 rounded-full overflow-hidden">
										<div
											className={`h-full ${item.color} rounded-full`}
											style={{ width: `${item.val * 100}%` }}
										/>
									</div>
								</div>
							))}
						</div>

						<div className="mt-auto pt-6 z-10">
							<div className="bg-white/5 p-4 rounded-2xl flex items-start gap-3">
								<AlertTriangle size={18} className="text-pink-400 shrink-0" />
								<p className="text-[10px] leading-relaxed text-gray-300 font-medium uppercase tracking-tight">
									Esta é uma base teórica. Ajuste conforme sua realidade
									financeira atual.
								</p>
							</div>
						</div>

						<div className="absolute -right-10 -bottom-10 text-white/5 rotate-12">
							<ShoppingBag size={200} />
						</div>
					</div>
				</div>
			</div>

			{/* MATRIZ DE GASTOS */}
			<div className="bg-white rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.02)] border border-gray-100 overflow-hidden">
				<div className="p-8 border-b border-gray-50 flex justify-between items-center bg-white">
					<div className="space-y-1">
						<h3 className="font-black text-[#3D3030] flex items-center gap-2">
							<LayoutGrid size={18} className="text-pink-500" /> Matriz de Fluxo Mensal
						</h3>
						<p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest ml-7">Consolidado por descrição</p>
					</div>
				</div>
				<div className="overflow-x-auto custom-scrollbar">
					<table className="w-full text-left border-collapse">
						<thead>
							<tr className="bg-gray-50/50">
								<th className="p-6 font-black text-[#3D3030] sticky left-0 bg-white z-20 border-r w-72 text-[11px] uppercase tracking-wider">
									Descrição do Gasto
								</th>
								{MESES.map((m, i) => {
									const isCurrentMonth = new Date().getMonth() === i && new Date().getFullYear() === year;
									return (
										<th
											key={m}
											className={`p-4 text-center text-[10px] font-black uppercase transition-all ${
												monthFilter === i || isCurrentMonth 
													? "text-pink-600 bg-pink-50/50" 
													: "text-gray-400"
											}`}>
											{m}
											{isCurrentMonth && (
												<div className="h-1 w-1 bg-pink-500 rounded-full mx-auto mt-1 animate-pulse" />
											)}
										</th>
									);
								})}
								<th className="p-6 text-right font-black text-pink-700 bg-pink-50 text-[11px] uppercase tracking-wider">
									Total
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-50">
							{loading ? (
								<tr>
									<td colSpan={14} className="p-20 text-center">
										<div className="flex flex-col items-center gap-4 animate-pulse">
											<div className="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center">
												<TrendingDown className="text-pink-500" />
											</div>
											<p className="font-black text-gray-300 tracking-widest uppercase text-xs">Organizando Finanças...</p>
										</div>
									</td>
								</tr>
							) : (
								matrixData.map((row, i) => {
									// Pega todas as observações únicas da linha para o hover da descrição
									const todasObs = Array.from(new Set(row.observacoes.flat())).filter(Boolean);
									const resumoObs = todasObs.length > 0 ? `📋 RESUMO DE DETALHES:\n${todasObs.join('\n---\n')}` : "";

									return (
										<tr key={i} className="hover:bg-[#FDFCFB] transition-colors group">
											<td 
												title={resumoObs}
												className="p-6 sticky left-0 bg-white group-hover:bg-[#FDFCFB] z-10 border-r transition-colors cursor-help">
												<div className="flex items-center gap-3">
													<div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-pink-50 group-hover:text-pink-500 transition-all shadow-sm">
														{CATEGORIA_ICONS[row.categoria] || <HelpCircle size={14} />}
													</div>
													<div>
														<p className="font-black text-[#3D3030] text-sm group-hover:text-pink-600 transition-colors">{row.descricao}</p>
														<p className="text-[9px] font-bold text-gray-300 uppercase">{row.categoria}</p>
													</div>
												</div>
											</td>
											{row.valores.map((v, idx) => {
												const isCurrentMonth = new Date().getMonth() === idx && new Date().getFullYear() === year;
												const temObs = row.observacoes[idx] && row.observacoes[idx].length > 0;
												const obsText = temObs ? `📝 DETALHES (${MESES[idx]}):\n${row.observacoes[idx].join("\n---\n")}` : "";
												
												return (
													<td
														key={idx}
														title={obsText}
														className={`p-4 text-center text-sm relative transition-all group/cell ${
															temObs ? "cursor-help" : ""
														} ${monthFilter === idx ? "bg-pink-50/20" : ""} ${isCurrentMonth ? "bg-pink-50/10" : ""}`}>
														<div className="flex flex-col items-center">
															<span className={`font-bold transition-colors ${
																v > 0 ? "text-[#3D3030]" : "text-gray-200"
															} ${temObs ? "group-hover/cell:text-pink-600" : ""}`}>
																{v > 0
																	? v.toLocaleString(undefined, { minimumFractionDigits: 0 })
																	: "—"}
															</span>
															{row.parcelas[idx] && (
																<span className="text-[9px] font-black px-1.5 py-0.5 bg-pink-100 text-pink-600 rounded-md mt-1 scale-90">
																	{row.parcelas[idx].atual}/{row.parcelas[idx].total}
																</span>
															)}
															{temObs && (
																<div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-pink-400 rounded-full opacity-40 group-hover/cell:opacity-100 animate-pulse" />
															)}
														</div>
													</td>
												);
											})}
											<td className="p-6 text-right font-black text-pink-600 bg-pink-50/20 border-l border-pink-50">
												R$ {row.total.toLocaleString()}
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>
			</div>

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
