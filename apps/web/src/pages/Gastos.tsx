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
	CheckCircle2,
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

const NOME_MESES_COMPLETO = [
	"Janeiro",
	"Fevereiro",
	"Março",
	"Abril",
	"Maio",
	"Junho",
	"Julho",
	"Agosto",
	"Setembro",
	"Outubro",
	"Novembro",
	"Dezembro",
];

export default function GastosWeb() {
	const [data, setData] = useState<any[]>([]);
	const [entradasData, setEntradasData] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [year, setYear] = useState(new Date().getFullYear());
	const [monthFilter, setMonthFilter] = useState<number | "all">("all");
	const [isAddOpen, setIsAddOpen] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [editSearchTerm, setEditSearchTerm] = useState("");

	const handleEditRow = (descricao: string) => {
		setEditSearchTerm(descricao);
		setIsEditOpen(true);
	};

	const loadData = useCallback(async () => {
		setLoading(true);
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (user) {
			const [gastosRes, entradasRes] = await Promise.all([
				supabase
					.from("despesas")
					.select("*")
					.eq("usuario_id", user.id)
					.gte("data", `${year}-01-01`)
					.lte("data", `${year}-12-31`)
					.order("data", { ascending: true }),
				supabase
					.from("receitas")
					.select("*")
					.eq("usuario_id", user.id)
					.gte("data", `${year}-01-01`)
					.lte("data", `${year}-12-31`)
					.order("data", { ascending: true })
			]);
			setData(gastosRes.data || []);
			setEntradasData(entradasRes.data || []);
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
				channel = financeService.subscribeToChanges("despesas", user.id, loadData);
			}
		}
		setupRealtime();

		return () => {
			if (channel) supabase.removeChannel(channel);
		};
	}, [loadData]);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get("add") === "true") {
			setIsAddOpen(true);
		}
	}, []);

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

	const fluxoMensalConsolidado = useMemo(() => {
		const receitas = Array(12).fill(0);
		const despesas = Array(12).fill(0);
		const saldos = Array(12).fill(0);

		entradasData.forEach((item) => {
			const mesIdx = new Date(item.data + "T12:00:00").getUTCMonth();
			receitas[mesIdx] += Number(item.valor);
		});

		data.forEach((item) => {
			const mesIdx = new Date(item.data + "T12:00:00").getUTCMonth();
			despesas[mesIdx] += Number(item.valor);
		});

		for (let i = 0; i < 12; i++) {
			saldos[i] = receitas[i] - despesas[i];
		}

		const totalReceitas = receitas.reduce((a, b) => a + b, 0);
		const totalDespesas = despesas.reduce((a, b) => a + b, 0);
		const totalSaldo = totalReceitas - totalDespesas;

		return { receitas, despesas, saldos, totalReceitas, totalDespesas, totalSaldo };
	}, [entradasData, data]);

	const totalPeriodo = useMemo(() => {
		if (monthFilter === "all")
			return matrixData.reduce((a, b) => a + b.total, 0);
		return matrixData.reduce((a, b) => a + b.valores[monthFilter as number], 0);
	}, [matrixData, monthFilter]);

	// Período Formatado Explicito
	const labelPeriodo = useMemo(() => {
		if (monthFilter === "all") return `Ano de ${year}`;
		return `${NOME_MESES_COMPLETO[monthFilter as number]} de ${year}`;
	}, [monthFilter, year]);

	// Despesa Mais Alta do período selecionado
	const despesaMaisAltaInfo = useMemo(() => {
		const items = data.filter((item) => {
			if (monthFilter === "all") return true;
			const mesIdx = new Date(item.data + "T12:00:00").getUTCMonth();
			return mesIdx === monthFilter;
		});
		if (items.length === 0) return null;
		const maxItem = items.reduce((max, item) => Number(item.valor) > Number(max.valor) ? item : max, items[0]);
		return maxItem;
	}, [data, monthFilter]);

	// Distribuição 50-30-20 Real
	const distribuicaoReal = useMemo(() => {
		let necessidades = 0;
		let desejos = 0;
		let investDividas = 0;

		const items = data.filter((item) => {
			if (monthFilter === "all") return true;
			const mesIdx = new Date(item.data + "T12:00:00").getUTCMonth();
			return mesIdx === monthFilter;
		});

		items.forEach((item) => {
			const valor = Number(item.valor);
			if (item.tipo === "Renda fixa (essencial)") {
				necessidades += valor;
			} else if (item.tipo === "Lazer") {
				desejos += valor;
			} else if (item.tipo === "Renda variável") {
				investDividas += valor;
			} else {
				// Fallback por categoria
				const cat = item.categoria;
				if (["Moradia", "Alimentação", "Transporte", "Saúde", "Educação"].includes(cat)) {
					necessidades += valor;
				} else if (["Lazer", "Assinaturas", "Presente", "Estetica e Comercio"].includes(cat)) {
					desejos += valor;
				} else {
					if (cat === "Emprestimo") {
						investDividas += valor;
					} else {
						desejos += valor;
					}
				}
			}
		});

		const total = necessidades + desejos + investDividas;
		
		return {
			necessidades,
			desejos,
			investDividas,
			total,
			pctNecessidades: total > 0 ? (necessidades / total) * 100 : 0,
			pctDesejos: total > 0 ? (desejos / total) * 100 : 0,
			pctInvest: total > 0 ? (investDividas / total) * 100 : 0,
		};
	}, [data, monthFilter]);

	// Limites Ultrapassados & Insights
	const limitesUltrapassados = useMemo(() => {
		const list = [];
		if (distribuicaoReal.total > 0) {
			if (distribuicaoReal.pctNecessidades > 50) {
				list.push({
					categoria: "Necessidades (50% Sugerido)",
					atual: distribuicaoReal.pctNecessidades.toFixed(0),
					sugerido: "50%",
					diferenca: (distribuicaoReal.pctNecessidades - 50).toFixed(0),
					insight: "Seus gastos essenciais estão consumindo mais de 50% do total. Tente renegociar contratos (aluguel, internet) ou enxugar compras recorrentes.",
				});
			}
			if (distribuicaoReal.pctDesejos > 30) {
				list.push({
					categoria: "Desejos/Lazer (30% Sugerido)",
					atual: distribuicaoReal.pctDesejos.toFixed(0),
					sugerido: "30%",
					diferenca: (distribuicaoReal.pctDesejos - 30).toFixed(0),
					insight: "Você ultrapassou os 30% recomendados para estilo de vida. Considere pausar assinaturas não utilizadas ou definir verbas semanais para saídas.",
				});
			}
			if (distribuicaoReal.pctInvest < 20) {
				list.push({
					categoria: "Invest/Dívidas (20% Sugerido)",
					atual: distribuicaoReal.pctInvest.toFixed(0),
					sugerido: "20%",
					diferenca: (20 - distribuicaoReal.pctInvest).toFixed(0),
					insight: "Seu percentual de economia ou pagamento de dívidas está abaixo de 20%. Reduza pequenos gastos supérfluos para poupar com consistência.",
				});
			}
		}
		return list;
	}, [distribuicaoReal]);

	// Brand icons based on description
	const getGastoIcon = (descricao: string, categoria: string) => {
		const desc = (descricao || "").toLowerCase();
		
		if (desc.includes("uber")) {
			return (
				<div className="w-8 h-8 rounded-xl bg-black text-white flex items-center justify-center font-black text-[9px] select-none border border-slate-800 shadow-sm shrink-0" title="Uber">
					UBER
				</div>
			);
		}
		if (desc.includes("netflix")) {
			return (
				<div className="w-8 h-8 rounded-xl bg-[#E50914] text-white flex items-center justify-center font-black text-[8px] select-none shadow-sm shrink-0" title="Netflix">
					NETF
				</div>
			);
		}
		if (desc.includes("spotify")) {
			return (
				<div className="w-8 h-8 rounded-xl bg-[#1DB954] text-black flex items-center justify-center font-black text-[9px] select-none shadow-sm shrink-0" title="Spotify">
					SPOT
				</div>
			);
		}
		if (desc.includes("ifood")) {
			return (
				<div className="w-8 h-8 rounded-xl bg-[#EA1D2C] text-white flex items-center justify-center font-black text-[9px] select-none shadow-sm shrink-0" title="iFood">
					iFD
				</div>
			);
		}
		if (desc.includes("amazon")) {
			return (
				<div className="w-8 h-8 rounded-xl bg-[#FF9900] text-black flex items-center justify-center font-black text-[8px] select-none shadow-sm shrink-0" title="Amazon">
					AMZN
				</div>
			);
		}
		if (desc.includes("mercado livre") || desc.includes("mercadolivre")) {
			return (
				<div className="w-8 h-8 rounded-xl bg-[#FFE600] text-blue-900 flex items-center justify-center font-black text-[9px] select-none shadow-sm shrink-0" title="Mercado Livre">
					MELI
				</div>
			);
		}

		const icon = CATEGORIA_ICONS[categoria] || <HelpCircle size={14} />;
		return (
			<div className="w-8 h-8 rounded-xl bg-gray-50 dark:bg-slate-800 flex items-center justify-center text-gray-400 dark:text-slate-405 group-hover:bg-pink-50 dark:group-hover:bg-pink-950/40 group-hover:text-pink-500 dark:group-hover:text-pink-400 transition-all shadow-sm shrink-0">
				{icon}
			</div>
		);
	};

	const chartData = MESES.map((nome, idx) => ({
		name: nome,
		total: matrixData.reduce((acc, row) => acc + row.valores[idx], 0),
	}));

	return (
		<div className="space-y-6 sm:space-y-8 pb-20 text-slate-800 dark:text-slate-100 transition-colors duration-250">
			{/* HEADER E AÇÕES */}
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
				<div className="space-y-1">
					<div className="flex items-center gap-3">
						<div className="bg-pink-100 dark:bg-pink-950 p-2 rounded-xl text-pink-600 dark:text-pink-400">
							<TrendingDown size={24} />
						</div>
						<h1 className="text-3xl font-black text-[#3D3030] dark:text-slate-100">
							Controle de Gastos
						</h1>
					</div>
					<p className="text-gray-400 dark:text-slate-400 font-medium text-sm ml-12">
						Gestão inteligente de despesas para {year}
					</p>
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<div className="flex items-center bg-gray-50 dark:bg-slate-800 rounded-2xl p-1 border border-gray-100 dark:border-slate-700 transition-colors">
						<button
							onClick={() => setYear(year - 1)}
							className="p-2 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-xl transition-all text-slate-600 dark:text-slate-300">
							<ChevronLeft size={20} />
						</button>
						<span className="px-4 font-black text-[#3D3030] dark:text-slate-100">{year}</span>
						<button
							onClick={() => setYear(year + 1)}
							className="p-2 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-xl transition-all text-slate-600 dark:text-slate-300">
							<ChevronRight size={20} />
						</button>
					</div>

					<button
						onClick={() => setIsEditOpen(true)}
						className="px-6 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-[#3D3030] dark:text-slate-200 rounded-2xl font-bold flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all text-sm cursor-pointer">
						<Edit3 size={16} /> Editar
					</button>

					<button
						onClick={() => setIsAddOpen(true)}
						className="px-6 py-3 bg-pink-500 text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-pink-600 transition-all shadow-lg shadow-pink-100 dark:shadow-none text-sm cursor-pointer">
						<Plus size={20} /> Novo Gasto
					</button>
				</div>
			</div>

			{/* KPI CARDS - GASTOS */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
				{/* Gasto no Período */}
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl sm:rounded-[32px] border border-gray-100 dark:border-slate-800 shadow-sm transition-colors flex flex-col justify-between">
					<div>
						<p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-2">
							Gasto no Período
						</p>
						<h3 className="text-2xl font-black text-pink-600 dark:text-pink-400">
							R$ {totalPeriodo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
						</h3>
					</div>
					<p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-3">
						Referência: {labelPeriodo}
					</p>
				</div>

				{/* Média p/ Despesa */}
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl sm:rounded-[32px] border border-gray-100 dark:border-slate-800 shadow-sm transition-colors flex flex-col justify-between">
					<div>
						<p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-2">
							Média p/ Despesa
						</p>
						<h3 className="text-2xl font-black text-[#3D3030] dark:text-slate-100">
							R$ {((monthFilter === "all" ? totalPeriodo : totalPeriodo) / (data.filter(item => {
								if (monthFilter === "all") return true;
								const mesIdx = new Date(item.data + "T12:00:00").getUTCMonth();
								return mesIdx === monthFilter;
							}).length || 1)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
						</h3>
					</div>
					<p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-3">
						Total de {data.filter(item => {
							if (monthFilter === "all") return true;
							const mesIdx = new Date(item.data + "T12:00:00").getUTCMonth();
							return mesIdx === monthFilter;
						}).length} despesas no período
					</p>
				</div>

				{/* Despesa Mais Alta */}
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl sm:rounded-[32px] border border-gray-100 dark:border-slate-800 shadow-sm transition-colors flex flex-col justify-between">
					<div>
						<p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-2">
							Despesa Mais Alta
						</p>
						{despesaMaisAltaInfo ? (
							<div>
								<h3 className="text-2xl font-black text-orange-500 dark:text-orange-400">
									R$ {Number(despesaMaisAltaInfo.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
								</h3>
								<p className="text-xs text-slate-500 dark:text-slate-400 font-black truncate mt-1.5" title={despesaMaisAltaInfo.descricao}>
									{despesaMaisAltaInfo.descricao}
								</p>
								<p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 font-bold uppercase">
									{despesaMaisAltaInfo.categoria} • {new Date(despesaMaisAltaInfo.data + "T12:00:00").toLocaleDateString("pt-BR")}
								</p>
							</div>
						) : (
							<h3 className="text-2xl font-black text-slate-300 dark:text-slate-700">R$ 0,00</h3>
						)}
					</div>
				</div>
			</div>

			{/* CHARTS E FILTROS */}
			<div className="space-y-4">
				<div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
					<Filter size={16} className="text-gray-400 dark:text-slate-500 ml-2 mr-2" />
					{["all", ...Array.from({ length: 12 }, (_, i) => i)].map((m) => (
						<button
							key={m}
							onClick={() => setMonthFilter(m as any)}
							className={`px-6 py-2.5 rounded-full font-bold text-xs transition-all whitespace-nowrap border cursor-pointer ${
								monthFilter === m
									? "bg-pink-500 text-white border-pink-500 shadow-md"
									: "bg-white dark:bg-slate-900 text-gray-400 dark:text-slate-400 border-gray-200 dark:border-slate-800 hover:border-pink-300 dark:hover:border-pink-900"
							}`}>
							{m === "all" ? "VISÃO ANUAL" : MESES[m as number].toUpperCase()}
						</button>
					))}
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<div className="lg:col-span-2 bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] shadow-sm border border-gray-100 dark:border-slate-800 h-[400px] transition-colors">
						<h3 className="font-black text-[#3D3030] dark:text-slate-100 flex items-center gap-2 mb-8">
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

					{/* DYNAMIC CARD 50-30-20 */}
					<div className="bg-[#3D3030] dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] shadow-xl dark:border dark:border-slate-800 text-white flex flex-col relative overflow-hidden transition-colors">
						<div className="z-10">
							<p className="text-pink-400 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
								<PieIcon size={14} /> Distribuição Sugerida
							</p>
							<h2 className="text-4xl font-black mt-2 mb-6">
								R$ {totalPeriodo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
							</h2>
						</div>

						{/* Progress Bars for Real Distribution */}
						<div className="z-10 space-y-5 flex-1">
							{/* Necessidades (50%) */}
							<div className="space-y-1.5">
								<div className="flex justify-between text-xs font-bold uppercase">
									<span className="opacity-70">Necessidades (50%)</span>
									<span className={distribuicaoReal.pctNecessidades > 50 ? "text-rose-400" : "text-emerald-400"}>
										R$ {distribuicaoReal.necessidades.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({distribuicaoReal.pctNecessidades.toFixed(0)}%)
									</span>
								</div>
								<div className="h-2 bg-white/10 rounded-full overflow-hidden">
									<div
										className={`h-full rounded-full transition-all duration-300 ${distribuicaoReal.pctNecessidades > 50 ? 'bg-rose-500' : 'bg-emerald-500'}`}
										style={{ width: `${Math.min(100, distribuicaoReal.pctNecessidades)}%` }}
									/>
								</div>
								<div className="flex justify-between text-[9px] opacity-40 font-semibold">
									<span>Meta: R$ {(totalPeriodo * 0.5).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
								</div>
							</div>

							{/* Desejos (30%) */}
							<div className="space-y-1.5">
								<div className="flex justify-between text-xs font-bold uppercase">
									<span className="opacity-70">Desejos/Lazer (30%)</span>
									<span className={distribuicaoReal.pctDesejos > 30 ? "text-rose-400" : "text-emerald-400"}>
										R$ {distribuicaoReal.desejos.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({distribuicaoReal.pctDesejos.toFixed(0)}%)
									</span>
								</div>
								<div className="h-2 bg-white/10 rounded-full overflow-hidden">
									<div
										className={`h-full rounded-full transition-all duration-300 ${distribuicaoReal.pctDesejos > 30 ? 'bg-rose-500' : 'bg-emerald-500'}`}
										style={{ width: `${Math.min(100, distribuicaoReal.pctDesejos)}%` }}
									/>
								</div>
								<div className="flex justify-between text-[9px] opacity-40 font-semibold">
									<span>Meta: R$ {(totalPeriodo * 0.3).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
								</div>
							</div>

							{/* Invest/Dívidas (20%) */}
							<div className="space-y-1.5">
								<div className="flex justify-between text-xs font-bold uppercase">
									<span className="opacity-70">Invest/Dívidas (20%)</span>
									<span className={distribuicaoReal.pctInvest < 20 ? "text-amber-400" : "text-emerald-400"}>
										R$ {distribuicaoReal.investDividas.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({distribuicaoReal.pctInvest.toFixed(0)}%)
									</span>
								</div>
								<div className="h-2 bg-white/10 rounded-full overflow-hidden">
									<div
										className={`h-full rounded-full transition-all duration-300 ${distribuicaoReal.pctInvest < 20 ? 'bg-amber-500' : 'bg-emerald-500'}`}
										style={{ width: `${Math.min(100, distribuicaoReal.pctInvest)}%` }}
									/>
								</div>
								<div className="flex justify-between text-[9px] opacity-40 font-semibold">
									<span>Meta: R$ {(totalPeriodo * 0.2).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
								</div>
							</div>
						</div>

						{/* Alert & Insights Panel */}
						<div className="mt-6 pt-6 border-t border-white/10 z-10 space-y-4">
							<h4 className="text-xs font-black uppercase text-pink-400 tracking-wider">Alertas e Insights</h4>
							{limitesUltrapassados.length === 0 ? (
								<div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex items-start gap-3 text-xs text-emerald-300">
									<CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
									<p>Seus gastos estão em ótimo equilíbrio seguindo a regra 50-30-20!</p>
								</div>
							) : (
								<div className="space-y-3 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
									{limitesUltrapassados.map((lim, i) => (
										<div key={i} className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl space-y-1 text-xs">
											<div className="flex justify-between font-bold text-rose-300">
												<span>Atenção: {lim.categoria}</span>
												<span>{lim.sugerido === "20%" ? `Falta ${lim.diferenca}%` : `+${lim.diferenca}%`}</span>
											</div>
											<p className="text-[10px] text-gray-300 leading-relaxed font-medium">{lim.insight}</p>
										</div>
									))}
								</div>
							)}
						</div>

						<div className="absolute -right-10 -bottom-10 text-white/5 rotate-12 pointer-events-none">
							<ShoppingBag size={200} />
						</div>
					</div>
				</div>
			</div>

			{/* MATRIZ DE GASTOS */}
			<div className="bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.02)] border border-gray-100 dark:border-slate-800 overflow-hidden transition-colors">
				<div className="p-5 sm:p-8 border-b border-gray-50 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900">
					<div className="space-y-1">
						<h3 className="font-black text-[#3D3030] dark:text-slate-100 flex items-center gap-2">
							<LayoutGrid size={18} className="text-pink-500" /> Matriz de Fluxo Mensal
						</h3>
						<p className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase tracking-widest ml-7">Consolidado por descrição</p>
					</div>
				</div>
				
				<div className="overflow-x-auto custom-scrollbar">
					<table className="w-full text-left border-collapse min-w-[1000px]">
						<thead>
							<tr className="bg-gray-50/50 dark:bg-slate-950">
								<th className="p-4 font-black text-[#3D3030] dark:text-slate-200 sticky left-0 bg-white dark:bg-slate-900 z-20 border-r border-slate-100 dark:border-slate-800 w-64 text-[10px] uppercase tracking-wider">
									Descrição do Gasto
								</th>
								{MESES.map((m, i) => {
									const isCurrentMonth = new Date().getMonth() === i && new Date().getFullYear() === year;
									return (
										<th
											key={m}
											className={`p-3 text-center text-[10px] font-black uppercase transition-all ${
												monthFilter === i || isCurrentMonth 
													? "text-pink-600 bg-pink-50/50 dark:bg-pink-950/20" 
													: "text-gray-400 dark:text-slate-500"
											}`}>
											{m}
											{isCurrentMonth && (
												<div className="h-1 w-1 bg-pink-500 rounded-full mx-auto mt-1 animate-pulse" />
											)}
										</th>
									);
								})}
								<th className="p-4 text-right font-black text-pink-700 dark:text-pink-405 bg-pink-50 dark:bg-pink-950/20 text-[10px] uppercase tracking-wider">
									Total
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-50 dark:divide-slate-850">
							{loading ? (
								<tr>
									<td colSpan={14} className="p-20 text-center">
										<div className="flex flex-col items-center gap-4 animate-pulse">
											<div className="w-12 h-12 bg-pink-100 dark:bg-pink-950/40 rounded-full flex items-center justify-center">
												<TrendingDown className="text-pink-500" />
											</div>
											<p className="font-black text-gray-300 dark:text-slate-600 tracking-widest uppercase text-xs">Organizando Finanças...</p>
										</div>
									</td>
								</tr>
							) : (
								matrixData.map((row, i) => {
									const todasObs = Array.from(new Set(row.observacoes.flat())).filter(Boolean);
									const resumoObs = todasObs.length > 0 ? `📋 RESUMO DE DETALHES:\n${todasObs.join('\n---\n')}` : "";

									return (
										<tr key={i} className="hover:bg-[#FDFCFB] dark:hover:bg-slate-850/50 transition-colors group">
											<td 
												title={resumoObs}
												onClick={() => handleEditRow(row.descricao)}
												className={`p-4 sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-[#FDFCFB] dark:group-hover:bg-slate-850/50 z-10 border-r border-slate-100 dark:border-slate-800 transition-colors cursor-pointer`}>
												<div className="flex items-center justify-between w-full pr-2">
													<div className="flex items-center gap-3">
														{getGastoIcon(row.descricao, row.categoria)}
														<div>
															<p className="font-black text-[#3D3030] dark:text-slate-200 text-sm group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">{row.descricao}</p>
															<p className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase">{row.categoria}</p>
														</div>
													</div>
													<button
														onClick={(e) => {
															e.stopPropagation();
															handleEditRow(row.descricao);
														}}
														className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-pink-50 dark:hover:bg-slate-800 text-slate-400 hover:text-pink-600 rounded-full transition-all cursor-pointer"
														title="Editar lançamentos"
													>
														<Edit3 size={14} />
													</button>
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
														onClick={() => handleEditRow(row.descricao)}
														className={`p-3 text-center text-sm relative transition-all group/cell ${
															temObs ? "cursor-pointer" : "cursor-default"
														} ${monthFilter === idx ? "bg-pink-50/20 dark:bg-pink-950/10" : ""} ${isCurrentMonth ? "bg-pink-50/10 dark:bg-pink-950/5" : ""}`}>
														<div className="flex flex-col items-center">
															<span className={`font-bold transition-colors ${
																v > 0 ? "text-[#3D3030] dark:text-slate-200" : "text-gray-250 dark:text-slate-750"
															} ${temObs ? "group-hover/cell:text-pink-600 dark:group-hover/cell:text-pink-400" : ""}`}>
																{v > 0
																	? v.toLocaleString(undefined, { minimumFractionDigits: 0 })
																	: "—"}
															</span>
															{row.parcelas[idx] && (
																<span className="text-[9px] font-black px-1.5 py-0.5 bg-pink-100 dark:bg-pink-950 text-pink-600 dark:text-pink-400 rounded-md mt-1 scale-90">
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
											<td className="p-4 text-right font-black text-pink-600 dark:text-pink-400 bg-pink-50/20 dark:bg-pink-950/10 border-l border-pink-50 dark:border-pink-950/20">
												R$ {row.total.toLocaleString()}
											</td>
										</tr>
									);
								})
							)}
							{/* SUMMARIZED FLOW ROWS (RECEITAS, DESPESAS, SALDO) */}
							{!loading && matrixData.length > 0 && (
								<>
									{/* Receitas Row */}
									<tr className="bg-emerald-50/10 dark:bg-emerald-950/10 font-bold border-t-2 border-slate-200 dark:border-slate-800">
										<td className="p-4 font-black text-emerald-600 dark:text-emerald-400 sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-105 dark:border-slate-800">
											TOTAL RECEITAS (+)
										</td>
										{fluxoMensalConsolidado.receitas.map((val, idx) => (
											<td key={idx} className="p-3 text-center text-emerald-600 dark:text-emerald-400 font-bold">
												{val > 0 ? val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "—"}
											</td>
										))}
										<td className="p-4 text-right font-black text-emerald-700 dark:text-emerald-350 bg-emerald-50/20 dark:bg-emerald-950/20 border-l border-slate-105 dark:border-slate-800">
											R$ {fluxoMensalConsolidado.totalReceitas.toLocaleString()}
										</td>
									</tr>

									{/* Despesas Row */}
									<tr className="bg-rose-50/10 dark:bg-rose-955/10 font-bold">
										<td className="p-4 font-black text-rose-600 dark:text-rose-455 sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-105 dark:border-slate-800">
											TOTAL DESPESAS (-)
										</td>
										{fluxoMensalConsolidado.despesas.map((val, idx) => (
											<td key={idx} className="p-3 text-center text-rose-600 dark:text-rose-455 font-bold">
												{val > 0 ? val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "—"}
											</td>
										))}
										<td className="p-4 text-right font-black text-rose-700 dark:text-rose-350 bg-rose-50/20 dark:bg-rose-955/20 border-l border-slate-105 dark:border-slate-800">
											R$ {fluxoMensalConsolidado.totalDespesas.toLocaleString()}
										</td>
									</tr>

									{/* Saldo Líquido Row */}
									<tr className="bg-slate-100/50 dark:bg-slate-950 font-black border-t border-slate-200 dark:border-slate-800">
										<td className="p-4 font-black text-slate-800 dark:text-slate-200 sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-105 dark:border-slate-800">
											SALDO LÍQUIDO (=)
										</td>
										{fluxoMensalConsolidado.saldos.map((val, idx) => (
											<td key={idx} className={`p-3 text-center font-black ${val >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-455"}`}>
												{val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
											</td>
										))}
										<td className={`p-4 text-right font-black border-l border-slate-105 dark:border-slate-800 ${fluxoMensalConsolidado.totalSaldo >= 0 ? "text-emerald-700 dark:text-emerald-350 bg-emerald-50/20 dark:bg-emerald-950/20" : "text-rose-700 dark:text-rose-350 bg-rose-50/20 dark:bg-rose-955/20"}`}>
											R$ {fluxoMensalConsolidado.totalSaldo.toLocaleString()}
										</td>
									</tr>
								</>
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
				onClose={() => {
					setIsEditOpen(false);
					setEditSearchTerm("");
				}}
				onSuccess={loadData}
				dataSnapshot={data}
				initialSearchTerm={editSearchTerm}
			/>
		</div>
	);
}
