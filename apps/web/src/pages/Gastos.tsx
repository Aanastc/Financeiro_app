import { buscarTodasPaginas } from "../../../../packages/services/paginacao";
import { contaNoTotal, ehParteDeOutraPessoa, textoObservacao, situacaoPagamento } from "../lib/lancamentos";
import CategoryBreakdown from "../components/CategoryBreakdown";
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	Cell,
	CartesianGrid
} from "recharts";
import {
	TrendingDown,
	CheckCircle2,
	Clock,
	Calendar,
	ArrowDownCircle,
	Tag,
	CreditCard,
	Building,
	Filter,
	Search,
	RotateCcw,
	Layers,
	ChevronLeft,
	ChevronRight
} from "lucide-react";

const MESES = [
	"Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
	"Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

const MESES_COMPLETOS = [
	"Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
	"Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export default function GastosWeb() {
	const [data, setData] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [year, setYear] = useState(new Date().getFullYear());
	const [selectedMonth, setSelectedMonth] = useState<string>(""); // "" para todos, "01" a "12"
	const [selectedDay, setSelectedDay] = useState<string>("");     // "" para todos, "01" a "31"
	const [selectedCategory, setSelectedCategory] = useState<string>("");
	const [searchQuery, setSearchQuery] = useState<string>("");
	const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'PAGOS' | 'PENDENTES'>('TODOS');

	const loadData = useCallback(async () => {
		setLoading(true);
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
			// Todas as páginas do ano (o Supabase devolve no máximo 1000 por consulta)
			const list = await buscarTodasPaginas<any>((de, ate) =>
				supabase
					.from("transacoes")
					.select("*, categorias(nome, cor_hex), contas_bancarias(nome), cartoes(nome, cor_hex)")
					.eq("usuario_id", user.id)
					.in("tipo", ["DESPESA", "ESTORNO"])
					.gte("data", `${year}-01-01`)
					.lte("data", `${year}-12-31`)
					.order("data", { ascending: false })
					.order("id")
					.range(de, ate),
			).catch(() => [] as any[]);
			// Parte de outra pessoa já no seu extrato não é lançamento seu (fica na Divisão de contas)
			setData(list.filter((t: any) => !ehParteDeOutraPessoa(t)));
		}
		setLoading(false);
	}, [year]);

	useEffect(() => {
		loadData();

		let channel: any;
		async function setupRealtime() {
			const { data: { user } } = await supabase.auth.getUser();
			if (user) {
				channel = financeService.subscribeToChanges("transacoes", user.id, loadData);
			}
		}
		setupRealtime();

		return () => {
			if (channel) supabase.removeChannel(channel);
		};
	}, [loadData]);

	// Lista de categorias únicas para o filtro
	const uniqueCategorias = useMemo(() => {
		const cats = new Set<string>();
		data.forEach(item => {
			const nomeCat = item.categorias?.nome || (item.tipo === "ESTORNO" ? "Estorno / Crédito" : item.categoria || "Outros");
			if (nomeCat) cats.add(nomeCat);
		});
		return Array.from(cats).sort((a, b) => a.localeCompare(b));
	}, [data]);

	// Filtragem combinada: Ano + Mês + Dia + Categoria + Status + Busca
	const filtrados = useMemo(() => {
		return data.filter(item => {
			if (!item.data) return false;
			const dateStr = String(item.data).split('T')[0];
			const parts = dateStr.split('-');
			const itemMonth = parts[1]; // "01" a "12"
			const itemDay = parts[2];   // "01" a "31"

			// Filtro por Mês
			if (selectedMonth && itemMonth !== selectedMonth) return false;

			// Filtro por Dia
			if (selectedDay && itemDay !== selectedDay) return false;

			// Filtro por Categoria
			const nomeCat = item.categorias?.nome || (item.tipo === "ESTORNO" ? "Estorno / Crédito" : item.categoria || "Outros");
			if (selectedCategory && nomeCat !== selectedCategory) return false;

			// Filtro por Status
			if (filtroStatus === 'PAGOS') {
				if (!situacaoPagamento(item).quitado) return false;
			} else if (filtroStatus === 'PENDENTES') {
				if (situacaoPagamento(item).quitado) return false;
			}

			// Filtro por Busca de Texto (insensível a acentos e maiúsculas)
			if (searchQuery.trim()) {
				const normalize = (str: string) => 
					(str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

				const query = normalize(searchQuery);
				const desc = normalize(item.descricao);
				const obs = normalize(item.observacao);
				const cat = normalize(nomeCat);
				const banco = normalize(item.contas_bancarias?.nome || item.cartoes?.nome);
				if (!desc.includes(query) && !obs.includes(query) && !cat.includes(query) && !banco.includes(query)) {
					return false;
				}
			}

			return true;
		});
	}, [data, selectedMonth, selectedDay, selectedCategory, filtroStatus, searchQuery]);

	// Paginação para evitar scroll infinito e permitir visualização direta
	const [paginaAtual, setPaginaAtual] = useState(1);
	const [itensPorPagina, setItensPorPagina] = useState(25);

	useEffect(() => {
		setPaginaAtual(1);
	}, [selectedMonth, selectedDay, selectedCategory, filtroStatus, searchQuery, year]);

	const totalPaginas = Math.max(1, Math.ceil(filtrados.length / (itensPorPagina === -1 ? filtrados.length || 1 : itensPorPagina)));

	const itensExibidos = useMemo(() => {
		if (itensPorPagina === -1) return filtrados;
		const inicio = (paginaAtual - 1) * itensPorPagina;
		return filtrados.slice(inicio, inicio + itensPorPagina);
	}, [filtrados, paginaAtual, itensPorPagina]);

	// Totais calculados com base nos filtros atuais
	const totalPago = useMemo(() => {
		return filtrados
			.filter(d => (d.status === 'confirmada' || !d.status) && contaNoTotal(d))
			.reduce((acc, curr) => {
				const val = Number(curr.valor || 0);
				return curr.tipo === "ESTORNO" ? acc - val : acc + val;
			}, 0);
	}, [filtrados]);

	const totalPendente = useMemo(() => {
		return filtrados
			.filter(d => !situacaoPagamento(d).quitado && contaNoTotal(d))
			.reduce((acc, curr) => {
				// Só o que falta (o que já foi pago/abatido na divisão de contas não está pendente)
				const val = situacaoPagamento(curr).falta;
				return curr.tipo === "ESTORNO" ? acc - val : acc + val;
			}, 0);
	}, [filtrados]);

	// Soma por categoria do que está filtrado na tela
	const porCategoria = useMemo(() => {
		const mapa = new Map<string, number>();
		for (const item of filtrados.filter(contaNoTotal)) {
			const nome = item.categorias?.nome || (item.tipo === "ESTORNO" ? "Estorno / Crédito" : item.categoria || "Outros");
			const valor = Number(item.valor || 0) * (item.tipo === "ESTORNO" ? -1 : 1);
			mapa.set(nome, (mapa.get(nome) || 0) + valor);
		}
		return [...mapa.entries()].filter(([, v]) => v > 0.009).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
	}, [filtrados]);

	// Gráfico mensal baseado nos dados do ano carregado
	const chartData = useMemo(() => {
		return MESES.map((nome, idx) => {
			const mesStr = String(idx + 1).padStart(2, '0');
			const itensDoMes = data.filter(d => {
				if (!d.data || !contaNoTotal(d)) return false;
				const parts = String(d.data).split('T')[0].split('-');
				return parts[1] === mesStr;
			});
			const sumMes = itensDoMes.reduce((acc, curr) => {
				const val = Number(curr.valor || 0);
				return curr.tipo === "ESTORNO" ? acc - val : acc + val;
			}, 0);
			return {
				name: nome,
				mesIndex: mesStr,
				mesCompleto: MESES_COMPLETOS[idx],
				total: Math.max(0, sumMes),
				count: itensDoMes.length
			};
		});
	}, [data]);

	const statsAno = useMemo(() => {
		const totalAno = chartData.reduce((acc, curr) => acc + curr.total, 0);
		const mesesComDados = chartData.filter(m => m.total > 0);
		const mediaMensal = mesesComDados.length > 0 ? totalAno / mesesComDados.length : 0;
		const maiorMes = chartData.reduce((max, curr) => (curr.total > max.total ? curr : max), { name: '', mesIndex: '', mesCompleto: '', total: 0, count: 0 });
		return { totalAno, mediaMensal, maiorMes, qtdMesesAtivos: mesesComDados.length };
	}, [chartData]);

	const hasActiveFilters = Boolean(selectedMonth || selectedDay || selectedCategory || searchQuery.trim() || filtroStatus !== 'TODOS');

	const resetFilters = () => {
		setSelectedMonth("");
		setSelectedDay("");
		setSelectedCategory("");
		setSearchQuery("");
		setFiltroStatus("TODOS");
	};

	return (
		<div className="space-y-6 sm:space-y-8 pb-20 animate-in fade-in duration-500">
			{/* SECTION: HEADER */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-xs border border-slate-100 dark:border-slate-800 transition-colors">
				<div className="flex items-center gap-3">
					<div className="bg-rose-100 dark:bg-rose-950/50 p-2.5 rounded-xl text-rose-600 dark:text-rose-400 shrink-0">
						<TrendingDown size={22} />
					</div>
					<div>
						<h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
							Gastos & Despesas
						</h1>
						<p className="text-slate-400 dark:text-slate-500 font-medium text-xs">
							Visão analítica de despesas, compras no débito/crédito e contas a pagar.
						</p>
					</div>
				</div>
			</div>

			{/* SECTION: KPI CARDS COMPACTOS */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
				<div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
					<div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center text-rose-500 shrink-0">
						<CheckCircle2 size={22} />
					</div>
					<div className="min-w-0">
						<p className="text-slate-400 dark:text-slate-500 font-bold text-[10px] uppercase tracking-wider truncate">
							{selectedMonth 
								? `Pago (${MESES_COMPLETOS[parseInt(selectedMonth, 10) - 1]}/${year})`
								: `Pago no Ano (${year})`}
						</p>
						<h2 className="text-xl font-black text-rose-600 dark:text-rose-400 mt-0.5 truncate">
							{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPago)}
						</h2>
					</div>
				</div>

				<div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
					<div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-amber-500 shrink-0">
						<Clock size={22} />
					</div>
					<div className="min-w-0">
						<p className="text-slate-400 dark:text-slate-500 font-bold text-[10px] uppercase tracking-wider truncate">
							A Pagar / Pendente
						</p>
						<h2 className="text-xl font-black text-slate-800 dark:text-slate-100 mt-0.5 truncate">
							{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPendente)}
						</h2>
					</div>
				</div>

				<div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
					<div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-500 shrink-0">
						<Layers size={22} />
					</div>
					<div className="min-w-0">
						<p className="text-slate-400 dark:text-slate-500 font-bold text-[10px] uppercase tracking-wider truncate">
							Lançamentos Filtrados
						</p>
						<h2 className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-0.5 truncate">
							{filtrados.length} <span className="text-xs font-bold text-slate-400">itens</span>
						</h2>
					</div>
				</div>
			</div>

			{/* SECTION: BARRA DE FILTROS INTEGRADA E ENXUTA */}
			<div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs space-y-3">
				<div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
					<div className="flex items-center gap-2">
						<Filter size={16} className="text-rose-500" />
						<span className="font-black text-slate-700 dark:text-slate-200 text-xs uppercase tracking-wider">
							Filtros
						</span>
					</div>

					<div className="flex items-center gap-3">
						{hasActiveFilters && (
							<button
								onClick={resetFilters}
								className="text-xs font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1.5 transition-colors cursor-pointer"
							>
								<RotateCcw size={13} /> Limpar Filtros
							</button>
						)}

						{/* FILTRO DE STATUS RÁPIDO */}
						<div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
							<button 
								onClick={() => setFiltroStatus('TODOS')}
								className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${filtroStatus === 'TODOS' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500'}`}
							>
								Todos
							</button>
							<button 
								onClick={() => setFiltroStatus('PAGOS')}
								className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${filtroStatus === 'PAGOS' ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm' : 'text-slate-500'}`}
							>
								Pagos
							</button>
							<button 
								onClick={() => setFiltroStatus('PENDENTES')}
								className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${filtroStatus === 'PENDENTES' ? 'bg-white dark:bg-slate-700 text-rose-600 shadow-sm' : 'text-slate-500'}`}
							>
								Pendentes
							</button>
						</div>
					</div>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
					{/* FILTRO POR ANO */}
					<div>
						<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 block mb-1">
							Ano
						</label>
						<select
							value={year}
							onChange={(e) => setYear(Number(e.target.value))}
							className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-rose-500"
						>
							{[year - 3, year - 2, year - 1, year, year + 1, year + 2].map(y => (
								<option key={y} value={y}>{y}</option>
							))}
						</select>
					</div>

					{/* FILTRO POR MÊS */}
					<div>
						<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 block mb-1">
							Mês
						</label>
						<select
							value={selectedMonth}
							onChange={(e) => {
								setSelectedMonth(e.target.value);
							}}
							className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-rose-500"
						>
							<option value="">Todos os Meses</option>
							{MESES_COMPLETOS.map((nome, idx) => {
								const val = String(idx + 1).padStart(2, '0');
								return <option key={val} value={val}>{nome}</option>;
							})}
						</select>
					</div>

					{/* FILTRO POR DIA */}
					<div>
						<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 block mb-1">
							Dia
						</label>
						<select
							value={selectedDay}
							onChange={(e) => setSelectedDay(e.target.value)}
							className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-rose-500"
						>
							<option value="">Todos os Dias</option>
							{Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map(d => (
								<option key={d} value={d}>Dia {d}</option>
							))}
						</select>
					</div>

					{/* FILTRO POR CATEGORIA */}
					<div>
						<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 block mb-1">
							Categoria
						</label>
						<select
							value={selectedCategory}
							onChange={(e) => setSelectedCategory(e.target.value)}
							className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-rose-500"
						>
							<option value="">Todas as Categorias</option>
							{uniqueCategorias.map(cat => (
								<option key={cat} value={cat}>{cat}</option>
							))}
						</select>
					</div>

					{/* BUSCA POR TEXTO / DESCRIÇÃO */}
					<div>
						<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 block mb-1">
							Pesquisa
						</label>
						<div className="relative">
							<Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
							<input
								type="text"
								placeholder="Buscar descrição..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-rose-500"
							/>
						</div>
					</div>
				</div>
			</div>

			{/* SECTION: TABELA DETALHADA DE GASTOS */}
			<div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs overflow-hidden">
				<div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-4">
					<div>
						<h3 className="font-black text-slate-800 dark:text-slate-100 text-lg">
							Tabela de Gastos
						</h3>
						<p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
							{filtrados.length} {filtrados.length === 1 ? 'registro exibido' : 'registros exibidos'} de acordo com os filtros selecionados
						</p>
					</div>
				</div>

				{loading ? (
					<div className="flex justify-center py-20">
						<div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rose-600"></div>
					</div>
				) : filtrados.length === 0 ? (
					<div className="p-16 text-center">
						<ArrowDownCircle size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-4" />
						<h3 className="font-black text-xl text-slate-800 dark:text-slate-200">Nenhum gasto encontrado</h3>
						<p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">
							Tente ajustar os filtros de ano, mês, dia ou categoria acima.
						</p>
					</div>
				) : (
					<div>
						<div className="overflow-auto max-h-[580px]">
							<table className="w-full text-left border-collapse min-w-[760px]">
								<thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 shadow-2xs">
									<tr className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
										<th className="px-4 py-3.5 w-28">Data</th>
										<th className="px-4 py-3.5 min-w-[200px]">Descrição</th>
										<th className="px-4 py-3.5 w-36">Categoria</th>
										<th className="px-4 py-3.5 w-44">Origem (Conta / Cartão)</th>
										<th className="px-4 py-3.5 w-32">Status</th>
										<th className="px-4 py-3.5 text-right w-36">Valor</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
									{itensExibidos.map((item) => {
										const isEstorno = item.tipo === "ESTORNO";
										const situacao = situacaoPagamento(item);
										const isPago = situacao.quitado;
										const nomeCat = item.categorias?.nome || (isEstorno ? "Estorno / Crédito" : item.categoria || "Outros");
										const corCat = item.categorias?.cor_hex || (isEstorno ? "#0284c7" : "#64748b");
										const formattedDate = item.data ? item.data.split('T')[0].split('-').reverse().join('/') : '-';

										return (
											<tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
												{/* DATA */}
												<td className="px-4 py-3.5 font-bold text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
													<div className="flex items-center gap-1.5">
														<Calendar size={13} className="text-slate-400" />
														<span>{formattedDate}</span>
													</div>
												</td>

												{/* DESCRIÇÃO */}
												<td className="px-4 py-3.5">
													<div className="flex flex-col gap-0.5">
														<div className="flex items-center gap-2 flex-wrap">
															<span className="font-bold text-xs text-slate-800 dark:text-slate-100">
																{item.descricao}
															</span>
															{isEstorno && (
																<span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
																	Estorno
																</span>
															)}
															{item.total_parcelas > 1 && (
																<span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
																	{item.parcela_atual || 1}/{item.total_parcelas}x
																</span>
															)}
														</div>
														{textoObservacao(item.observacao) && (
															<span className="text-[10px] text-slate-400 truncate max-w-xs">
																{textoObservacao(item.observacao)}
																{!contaNoTotal(item) && (
																	<span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 text-[9px] font-black uppercase">
																		não soma
																	</span>
																)}
															</span>
														)}
													</div>
												</td>

												{/* CATEGORIA */}
												<td className="px-4 py-3.5 whitespace-nowrap">
													<span
														className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg text-white shadow-2xs whitespace-nowrap"
														style={{ backgroundColor: corCat }}
													>
														<Tag size={11} />
														{nomeCat}
													</span>
												</td>

												{/* CONTA / CARTÃO */}
												<td className="px-4 py-3.5 text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
													<div className="flex items-center gap-1.5 whitespace-nowrap">
														{item.cartao_id ? (
															<>
																<CreditCard size={14} className="text-purple-500 shrink-0" />
																<span>{item.cartoes?.nome || 'Cartão de Crédito'}</span>
															</>
														) : (
															<>
																<Building size={14} className="text-indigo-500 shrink-0" />
																<span className={item.contas_bancarias?.nome ? "" : "text-slate-400 dark:text-slate-500"}>{item.contas_bancarias?.nome || 'Sem conta'}</span>
															</>
														)}
													</div>
												</td>

												{/* STATUS */}
												<td className="px-4 py-3.5 whitespace-nowrap">
													<span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black uppercase ${
														isPago 
															? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40' 
															: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40'
													}`}>
														{isPago ? (situacao.abatido ? '✓ Abatido' : '✓ Pago') : situacao.parcial ? '◐ Parcial' : '⏳ Pendente'}
													</span>
													{situacao.parcial && (
														<span className="block mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
															{situacao.abatido ? 'abatido' : 'pago'} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(situacao.pago)} · falta {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(situacao.falta)}
														</span>
													)}
												</td>

												{/* VALOR */}
												<td className="px-4 py-3.5 text-right whitespace-nowrap font-black">
													<span className={`text-sm ${isEstorno ? 'text-sky-600 dark:text-sky-400' : 'text-rose-600 dark:text-rose-400'}`}>
														{isEstorno ? "+ " : "- "}
														{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor)}
													</span>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>

						{/* BARRA DE PAGINAÇÃO INTEGRADA */}
						<div className="p-3.5 sm:p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
							<div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
								<span>
									Exibindo <strong className="text-slate-700 dark:text-slate-200">{filtrados.length === 0 ? 0 : (paginaAtual - 1) * (itensPorPagina === -1 ? filtrados.length : itensPorPagina) + 1}</strong> a <strong className="text-slate-700 dark:text-slate-200">{itensPorPagina === -1 ? filtrados.length : Math.min(paginaAtual * itensPorPagina, filtrados.length)}</strong> de <strong className="text-slate-700 dark:text-slate-200">{filtrados.length}</strong>
								</span>
								<span className="hidden sm:inline text-slate-300 dark:text-slate-700">•</span>
								<div className="flex items-center gap-1.5">
									<span className="hidden sm:inline">Por página:</span>
									<select
										value={itensPorPagina}
										onChange={(e) => {
											setItensPorPagina(Number(e.target.value));
											setPaginaAtual(1);
										}}
										className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
									>
										<option value={15}>15</option>
										<option value={25}>25</option>
										<option value={50}>50</option>
										<option value={100}>100</option>
										<option value={-1}>Todos</option>
									</select>
								</div>
							</div>

							{itensPorPagina !== -1 && totalPaginas > 1 && (
								<div className="flex items-center gap-2">
									<button
										onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
										disabled={paginaAtual <= 1}
										className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-2xs"
									>
										<ChevronLeft size={14} /> Anterior
									</button>
									<span className="text-xs font-bold px-2 text-slate-600 dark:text-slate-400">
										{paginaAtual} / {totalPaginas}
									</span>
									<button
										onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
										disabled={paginaAtual >= totalPaginas}
										className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-2xs"
									>
										Próximo <ChevronRight size={14} />
									</button>
								</div>
							)}
						</div>
					</div>
				)}
			</div>

			{/* SECTION: GRÁFICO RESUMO DE VOLUME MENSAL */}
			<div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl sm:rounded-[35px] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
				<div className="flex items-center justify-between flex-wrap gap-2">
					<div>
						<h3 className="font-black text-slate-800 dark:text-slate-100 text-lg">
							Volume Mensal de Gastos
						</h3>
						<p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
							Distribuição acumulada de despesas por mês em {year}
						</p>
					</div>
					<div className="flex items-center gap-4 text-xs font-bold">
						<span className="text-slate-500 dark:text-slate-400">
							Média Mensal: <strong className="text-slate-800 dark:text-slate-100">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(statsAno.mediaMensal)}</strong>
						</span>
					</div>
				</div>

				<div className="h-64 w-full">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
							<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" strokeOpacity={0.15} />
							<XAxis
								dataKey="name"
								axisLine={false}
								tickLine={false}
								tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }}
							/>
							<YAxis
								axisLine={false}
								tickLine={false}
								tick={{ fill: "#94a3b8", fontSize: 10 }}
								tickFormatter={(val) => {
									if (val === 0) return "0";
									if (val >= 1000) return `R$ ${(val / 1000).toFixed(0)}k`;
									return `R$ ${val}`;
								}}
							/>
							<Tooltip
								cursor={{ fill: "rgba(148, 163, 184, 0.08)", radius: 8 }}
								content={({ active, payload }) => {
									if (active && payload && payload.length) {
										const item = payload[0].payload;
										return (
											<div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-2xl shadow-xl">
												<p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
													{item.mesCompleto} • {year}
												</p>
												<p className="text-base font-black text-rose-600 dark:text-rose-400">
													{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total)}
												</p>
												<p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1">
													{item.count} {item.count === 1 ? 'despesa registrada' : 'despesas registradas'}
												</p>
											</div>
										);
									}
									return null;
								}}
							/>
							<Bar dataKey="total" radius={[8, 8, 0, 0]} maxBarSize={36}>
								{chartData.map((entry, index) => {
									const isSelected = selectedMonth && entry.mesIndex === selectedMonth;
									const isMax = statsAno.maiorMes.total > 0 && entry.total === statsAno.maiorMes.total;
									return (
										<Cell
											key={`cell-${index}`}
											fill={isSelected ? "#be123c" : isMax ? "#e11d48" : entry.total > 0 ? "#f43f5e" : "transparent"}
											className="cursor-pointer transition-all hover:opacity-80"
											onClick={() => setSelectedMonth(entry.mesIndex === selectedMonth ? "" : entry.mesIndex)}
										/>
									);
								})}
							</Bar>
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>

			{/* RELATÓRIO POR CATEGORIA (segue os filtros de mês, categoria e busca) */}
			<CategoryBreakdown
				title={`Gastos por categoria · ${selectedMonth ? `${MESES_COMPLETOS[Number(selectedMonth) - 1]} de ${year}` : year}`}
				icon={<Tag className="text-rose-500" size={18} />}
				data={porCategoria}
				barClassName="bg-rose-500"
				maxVisiveis={8}
				emptyText="Nenhum lançamento com esses filtros."
			/>
		</div>
	);
}
