import { useState, useEffect, useMemo } from "react";
import { authService } from "../../../../packages/services/auth.service";
import { financeService } from "../../../../packages/services/finance.service";
import { getFaturaMesReferencia } from "../../../../packages/utils/cartao.utils";
import { motion, AnimatePresence } from "framer-motion";
import { 
	CreditCard, 
	Calendar, 
	CheckCircle2, 
	ChevronLeft, 
	ChevronRight, 
	FileText, 
	AlertTriangle,
	Eye,
	TrendingUp,
	Filter,
	Search,
	RotateCcw,
	Table as TableIcon,
	LayoutGrid } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import FaturaLancamentosModal from "../components/FaturaLancamentosModal";
import { mesmaInstituicao } from "../../../../packages/utils/instituicoes";

const NOMES_MESES = [
	"Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
	"Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export default function Faturas() {
	const { cartao_id: paramCartaoId } = useParams();
	const navigate = useNavigate();
	
	const [userId, setUserId] = useState<string>("");
	const [cartoes, setCartoes] = useState<any[]>([]);
	const [faturas, setFaturas] = useState<any[]>([]);
	const [transacoesCredito, setTransacoesCredito] = useState<any[]>([]);
	const [dividasRenegociacao, setDividasRenegociacao] = useState<any[]>([]);
	const [categorias, setCategorias] = useState<string[]>([]);
	const [loading, setLoading] = useState(true);
	
	// Filtros
	const [filtroCartaoId, setFiltroCartaoId] = useState<string>(paramCartaoId || "TODOS");
	const [filtroAno, setFiltroAno] = useState<string>(new Date().getFullYear().toString());
	const [filtroMes, setFiltroMes] = useState<string>(String(new Date().getMonth() + 1).padStart(2, "0"));
	const [filtroDia, setFiltroDia] = useState<string>("TODOS");
	const [filtroCategoria, setFiltroCategoria] = useState<string>("TODAS");
	const [filtroStatus, setFiltroStatus] = useState<string>("TODAS");
	const [termoBusca, setTermoBusca] = useState<string>("");
	
	// Modo de Visualização: 'tabela' (Visão Mensal com Tabela) ou 'cards' (Cards de Faturas)
	const [modoVisualizacao, setModoVisualizacao] = useState<'tabela' | 'cards'>('tabela');
	const [faturaAbertaModal, setFaturaAbertaModal] = useState<any>(null);

	const loadData = async () => {
		setLoading(true);
		try {
			const user = await authService.getCurrentUser();
			if (!user) return navigate("/login");
			setUserId(user.id);
			
			const [cardsData, faturasData, gastosCredito, dividasData] = await Promise.all([
				financeService.getCartoes(user.id).catch(() => []),
				financeService.getAllFaturas(user.id).catch(() => []),
				financeService.getAllGastosCredito(user.id).catch(() => []),
				financeService.getDividas(user.id).catch(() => [])
			]);

			setCartoes(cardsData || []);
			setFaturas(faturasData || []);
			setTransacoesCredito(gastosCredito || []);

			// Filtrar renegociações de cartão ativas
			const renegociacoes = (dividasData || []).filter((d: any) => {
				const dDesc = (d.descricao || "").toLowerCase();
				const tipo = (d.tipo || "").toLowerCase();
				// Ignora consignado e pessoal
				if (tipo === "consignado" || tipo === "emprestimo" || dDesc.includes("consignado") || dDesc.includes("empréstimo") || dDesc.includes("emprestimo")) {
					return false;
				}
				return tipo === "renegociacao_cartao" || d.cartao_id || d.fatura_origem_id || dDesc.includes("renegocia") || dDesc.includes("acordo");
			});
			setDividasRenegociacao(renegociacoes);

			// Extrair lista de categorias únicas
			const cats = Array.from(new Set((gastosCredito || []).map((g: any) => g.categoria || g.categorias?.nome || "Outros").filter(Boolean))) as string[];
			setCategorias(cats.sort());

			if (paramCartaoId) {
				setFiltroCartaoId(paramCartaoId);
			}
		} catch (error) {
			console.error(error);
			toast.error("Erro ao carregar dados das faturas");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadData();
	}, []);

	// Navegação rápida de mês
	const navegarMes = (direcao: number) => {
		let mesNum = parseInt(filtroMes, 10);
		let anoNum = parseInt(filtroAno, 10);
		
		mesNum += direcao;
		if (mesNum > 12) {
			mesNum = 1;
			anoNum += 1;
		} else if (mesNum < 1) {
			mesNum = 12;
			anoNum -= 1;
		}

		setFiltroMes(String(mesNum).padStart(2, "0"));
		setFiltroAno(anoNum.toString());
	};

	// Lista de anos disponíveis nas faturas e transações
	const anosDisponiveis = useMemo(() => {
		const anosSet = new Set<string>();
		anosSet.add(new Date().getFullYear().toString());
		faturas.forEach(f => {
			if (f.data_vencimento) anosSet.add(f.data_vencimento.substring(0, 4));
			if (f.data_fechamento) anosSet.add(f.data_fechamento.substring(0, 4));
		});
		transacoesCredito.forEach(t => {
			if (t.data) anosSet.add(t.data.substring(0, 4));
		});
		return Array.from(anosSet).sort().reverse();
	}, [faturas, transacoesCredito]);

	// Faturas filtradas (geral para cards)
	const faturasFiltradas = useMemo(() => {
		return faturas.filter(f => {
			if (filtroCartaoId !== "TODOS" && f.cartao_id !== filtroCartaoId) return false;
			if (filtroStatus !== "TODAS" && f.status !== filtroStatus) return false;
			if (filtroAno !== "TODOS") {
				const fAno = (f.data_vencimento || f.data_fechamento || "").substring(0, 4);
				if (fAno && fAno !== filtroAno) return false;
			}
			if (filtroMes !== "TODOS") {
				const fMes = (f.data_vencimento || f.data_fechamento || "").substring(5, 7);
				if (fMes && fMes !== filtroMes) return false;
			}
			return true;
		});
	}, [faturas, filtroCartaoId, filtroStatus, filtroAno, filtroMes]);

	// Fatura do mês selecionado
	const mesRefAnoMes = `${filtroAno}-${filtroMes}`;
	const faturasDoMes = useMemo(() => {
		return faturas.filter(f => {
			if (filtroCartaoId !== "TODOS" && f.cartao_id !== filtroCartaoId) return false;
			const fVenc = (f.data_vencimento || "").substring(0, 7);
			const fFech = (f.data_fechamento || "").substring(0, 7);
			return fVenc === mesRefAnoMes || fFech === mesRefAnoMes;
		});
	}, [faturas, filtroCartaoId, mesRefAnoMes]);

	// Renegociações correspondentes ao filtro de cartão
	const renegociacoesVisiveis = useMemo(() => {
		if (filtroCartaoId === "TODOS") return dividasRenegociacao;
		const cartaoSel = cartoes.find(c => c.id === filtroCartaoId);
		return dividasRenegociacao.filter(d => {
			if (d.cartao_id === filtroCartaoId) return true;
			return mesmaInstituicao(`${d.instituicao || ""} ${d.descricao || ""}`, cartaoSel?.nome);
		});
	}, [dividasRenegociacao, filtroCartaoId, cartoes]);

	// Lançamentos de cartão no mês selecionado (incluindo parcelas de acordos/renegociações)
	const lancamentosDoMes = useMemo(() => {
		const baseItens = transacoesCredito.filter(t => {
			if (!t.data) return false;

			// Filtro de cartão
			if (filtroCartaoId !== "TODOS" && t.cartao_id !== filtroCartaoId) return false;

			// Mês de referência da fatura em que a transação incide
			const cartaoAssociado = cartoes.find(c => c.id === t.cartao_id);
			const fechamentoDia = cartaoAssociado?.fechamento_dia || 12;
			const vencimentoDia = cartaoAssociado?.vencimento_dia || 19;

			// O mês da fatura é estritamente derivado pelo ciclo do cartão (compras pós-fechamento caem no mês seguinte)
			const mesRefTransacao = getFaturaMesReferencia(t.data, fechamentoDia, vencimentoDia);
			
			// Filtro de Ano e Mês da FATURA
			if (filtroAno !== "TODOS" && mesRefTransacao.substring(0, 4) !== filtroAno) return false;
			if (filtroMes !== "TODOS" && mesRefTransacao.substring(5, 7) !== filtroMes) return false;
			
			// Filtro de Dia da compra
			if (filtroDia !== "TODOS") {
				const diaStr = t.data.substring(8, 10);
				if (diaStr !== filtroDia.padStart(2, "0")) return false;
			}

			// Filtro de Categoria
			if (filtroCategoria !== "TODAS") {
				const catNome = t.categoria || t.categorias?.nome || "Outros";
				if (catNome !== filtroCategoria) return false;
			}

			// Filtro de Busca (insensível a acentos)
			if (termoBusca.trim()) {
				const normalize = (str: string) => 
					(str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
				const query = normalize(termoBusca);
				const desc = normalize(t.descricao);
				const cat = normalize(t.categoria || t.categorias?.nome || "");
				if (!desc.includes(query) && !cat.includes(query)) return false;
			}

			return true;
		});

		// Projeta parcelas de renegociação de cartão com vencimento neste mês
		const mesAlvo = `${filtroAno}-${filtroMes}`;
		const parcelasRenegDoMes: any[] = [];
		renegociacoesVisiveis.forEach(reneg => {
			const textoReneg = `${reneg.instituicao || ""} ${reneg.descricao || ""}`;
			const cartaoAssociado = cartoes.find(c =>
				c.id === reneg.cartao_id ||
				(c.nome && textoReneg.toLowerCase().includes(c.nome.toLowerCase())) ||
				mesmaInstituicao(textoReneg, c.nome)
			);

			if (filtroCartaoId !== "TODOS" && cartaoAssociado && cartaoAssociado.id !== filtroCartaoId) {
				return;
			}

			(reneg.parcelas_divida || []).forEach((p: any) => {
				const pMes = (p.data_vencimento || "").substring(0, 7);
				if (pMes === mesAlvo) {
					// Evita duplicar se essa parcela já tiver sido importada na base de transações
					const jaExisteNaBase = baseItens.some(t => 
						(t.descricao || "").toLowerCase().includes("renegocia") &&
						Math.abs(Number(t.valor) - Number(p.valor_esperado)) <= 5.0
					);

					if (!jaExisteNaBase) {
						parcelasRenegDoMes.push({
							id: `reneg-${reneg.id}-${p.numero_parcela}`,
							data: p.data_vencimento,
							descricao: `${reneg.descricao || "Renegociação de Cartão"}`,
							valor: Number(p.valor_esperado || 1054.45),
							categoria: "Renegociação de Cartão",
							cartao_id: cartaoAssociado?.id || reneg.cartao_id || (cartoes[0]?.id || null),
							parcela_atual: p.numero_parcela,
							total_parcelas: (reneg.parcelas_divida || []).length || 12,
							status: p.status === "paga" ? "confirmada" : "pendente",
							isRenegociacao: true,
							status_parcela: p.status
						});
					}
				}
			});
		});

		return [...baseItens, ...parcelasRenegDoMes].sort((a, b) => b.data.localeCompare(a.data));
	}, [transacoesCredito, renegociacoesVisiveis, cartoes, filtroCartaoId, filtroAno, filtroMes, filtroDia, filtroCategoria, termoBusca]);

	// KPIs do mês selecionado
	const totalLancamentosValor = lancamentosDoMes.reduce((acc, t) => acc + Number(t.valor || 0), 0);
	const kpiTotalFaturado = faturasDoMes.length > 0 
		? Math.max(faturasDoMes.reduce((acc, f) => acc + Number(f.valor_total || 0), 0), totalLancamentosValor)
		: totalLancamentosValor;

	const kpiTotalPago = faturasDoMes.reduce((acc, f) => acc + Number(f.valor_pago || 0), 0);
	const kpiSaldoRestante = Math.max(0, kpiTotalFaturado - kpiTotalPago);

	const limparFiltros = () => {
		setFiltroCartaoId("TODOS");
		setFiltroAno(new Date().getFullYear().toString());
		setFiltroMes(String(new Date().getMonth() + 1).padStart(2, "0"));
		setFiltroDia("TODOS");
		setFiltroCategoria("TODAS");
		setFiltroStatus("TODAS");
		setTermoBusca("");
	};

	const getStatusColor = (status: string) => {
		switch(status) {
			case 'paga': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800';
			case 'aberta': return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-800';
			case 'fechada': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-300 dark:border-amber-800';
			case 'atrasada': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border border-rose-300 dark:border-rose-800';
			case 'renegociada': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-300 dark:border-purple-800';
			default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400';
		}
	};

	return (
		<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 sm:space-y-8 pb-20">
			{/* CABEÇALHO */}
			<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
				<div>
					{filtroCartaoId !== "TODOS" && (
						<button onClick={() => setFiltroCartaoId("TODOS")} className="flex items-center text-sm font-bold text-slate-500 hover:text-indigo-600 dark:text-slate-400 mb-2 transition-colors cursor-pointer">
							<ChevronLeft size={16} /> Ver Todos os Cartões
						</button>
					)}
					<h1 className="text-3xl sm:text-4xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
						<FileText className="text-indigo-600 dark:text-indigo-400" size={36} />
						Faturas dos Cartões
					</h1>
					<p className="text-slate-500 dark:text-slate-400 mt-1 font-medium text-base">
						Visualização mensal detalhada, controle de compras, renegociações e histórico.
					</p>
				</div>
				<div className="flex items-center gap-3">
					<div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
						<button
							onClick={() => setModoVisualizacao('tabela')}
							className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
								modoVisualizacao === 'tabela' 
									? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' 
									: 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
							}`}
						>
							<TableIcon size={16} /> Visão Mensal (Tabela)
						</button>
						<button
							onClick={() => setModoVisualizacao('cards')}
							className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
								modoVisualizacao === 'cards' 
									? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' 
									: 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
							}`}
						>
							<LayoutGrid size={16} /> Todas as Faturas (Cards)
						</button>
					</div>

					<button
						onClick={async () => {
							try {
								setLoading(true);
								await financeService.syncCardFaturas(userId);
								await loadData();
								toast.success("Faturas recalculadas e sincronizadas!");
							} catch (e) {
								toast.error("Erro ao sincronizar faturas");
							} finally {
								setLoading(false);
							}
						}}
						className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl font-bold text-sm shadow-md transition-all cursor-pointer whitespace-nowrap"
					>
						<TrendingUp size={18} />
						Sincronizar
					</button>
				</div>
			</div>

			{/* TOOLBAR DE FILTROS MULTIDIMENSIONAIS (Cartão, Ano, Mês, Dia, Categoria, Status, Busca) */}
			<div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
				<div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
					<div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-black text-sm">
						<Filter size={18} className="text-indigo-600 dark:text-indigo-400" />
						<span>Filtros da Fatura</span>
					</div>
					<button
						onClick={limparFiltros}
						className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
					>
						<RotateCcw size={14} /> Redefinir Filtros
					</button>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
					{/* Cartão */}
					<div className="space-y-1">
						<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Cartão</label>
						<select
							value={filtroCartaoId}
							onChange={(e) => setFiltroCartaoId(e.target.value)}
							className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
						>
							<option value="TODOS">Todos os Cartões</option>
							{cartoes.map(c => (
								<option key={c.id} value={c.id}>{c.nome}</option>
							))}
						</select>
					</div>

					{/* Ano */}
					<div className="space-y-1">
						<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Ano</label>
						<select
							value={filtroAno}
							onChange={(e) => setFiltroAno(e.target.value)}
							className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
						>
							<option value="TODOS">Todos os Anos</option>
							{anosDisponiveis.map(ano => (
								<option key={ano} value={ano}>{ano}</option>
							))}
						</select>
					</div>

					{/* Mês */}
					<div className="space-y-1">
						<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Mês</label>
						<select
							value={filtroMes}
							onChange={(e) => setFiltroMes(e.target.value)}
							className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
						>
							<option value="TODOS">Todos os Meses</option>
							{NOMES_MESES.map((nome, i) => {
								const val = String(i + 1).padStart(2, "0");
								return <option key={val} value={val}>{nome}</option>;
							})}
						</select>
					</div>

					{/* Dia */}
					<div className="space-y-1">
						<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Dia</label>
						<select
							value={filtroDia}
							onChange={(e) => setFiltroDia(e.target.value)}
							className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
						>
							<option value="TODOS">Todos os Dias</option>
							{Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map(dia => (
								<option key={dia} value={dia}>Dia {dia}</option>
							))}
						</select>
					</div>

					{/* Categoria */}
					<div className="space-y-1">
						<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Categoria</label>
						<select
							value={filtroCategoria}
							onChange={(e) => setFiltroCategoria(e.target.value)}
							className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
						>
							<option value="TODAS">Todas Categorias</option>
							{categorias.map(cat => (
								<option key={cat} value={cat}>{cat}</option>
							))}
						</select>
					</div>

					{/* Status da Fatura */}
					<div className="space-y-1">
						<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Status</label>
						<select
							value={filtroStatus}
							onChange={(e) => setFiltroStatus(e.target.value)}
							className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
						>
							<option value="TODAS">Todos os Status</option>
							<option value="aberta">Aberta</option>
							<option value="fechada">Fechada</option>
							<option value="atrasada">Atrasada</option>
							<option value="paga">Paga</option>
							<option value="renegociada">Renegociada</option>
						</select>
					</div>
				</div>

				{/* Busca por texto */}
				<div className="relative">
					<Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
					<input
						type="text"
						value={termoBusca}
						onChange={(e) => setTermoBusca(e.target.value)}
						placeholder="Buscar compra ou estabelecimento na fatura..."
						className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
					/>
				</div>
			</div>

			{/* RENEGOCIAÇÕES VINCULADAS AO CARTÃO (Exibição Obrigatória e Clara) */}
			{renegociacoesVisiveis.length > 0 && (
				<div className="space-y-3">
					<h3 className="text-sm font-black uppercase tracking-wider text-rose-500 dark:text-rose-400 flex items-center gap-2">
						<AlertTriangle size={18} /> Renegociações e Acordos de Cartão
					</h3>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{renegociacoesVisiveis.map(reneg => {
							const parcelas = reneg.parcelas_divida || [];
							const pagas = parcelas.filter((p: any) => p.status === 'paga').length;
							const pendentes = parcelas.filter((p: any) => p.status === 'pendente');
							const saldoDevedor = pendentes.reduce((sum: number, p: any) => sum + Number(p.valor_esperado || 0), 0) || Number(reneg.valor_atual || reneg.valor_original || 0);

							return (
								<div 
									key={reneg.id} 
									className="bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/60 p-5 rounded-3xl flex flex-col justify-between"
								>
									<div className="flex justify-between items-start mb-3">
										<div>
											<span className="bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">
												Acordo de Cartão
											</span>
											<h4 className="font-black text-base text-slate-800 dark:text-slate-100 mt-1">
												{reneg.descricao}
											</h4>
											<p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
												Instituição: {reneg.instituicao || "Cartão de Crédito"}
											</p>
										</div>
										<div className="text-right">
											<p className="text-[10px] font-black text-slate-400 uppercase">Saldo Devedor</p>
											<p className="font-black text-lg text-purple-700 dark:text-purple-400">
												R$ {saldoDevedor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
											</p>
										</div>
									</div>

									<div className="flex items-center justify-between text-xs font-bold pt-3 border-t border-purple-100 dark:border-purple-900/40">
										<span className="text-slate-600 dark:text-slate-400">
											Parcelas: {pagas} de {parcelas.length || reneg.parcelas_totais || 1} pagas
										</span>
										<button
											onClick={() => navigate("/dividas")}
											className="text-purple-700 dark:text-purple-300 hover:underline flex items-center gap-1 cursor-pointer"
										>
											Ver Detalhes em Dívidas <ChevronRight size={14} />
										</button>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* VISÃO MENSAL DETALHADA COM TABELA */}
			{modoVisualizacao === 'tabela' ? (
				<div className="space-y-6">
					{/* NAVEGADOR DE MÊS / ANO & KPIS DA FATURA */}
					<div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
						<div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
							<div className="flex items-center gap-3">
								<button
									onClick={() => navegarMes(-1)}
									className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
									title="Mês Anterior"
								>
									<ChevronLeft size={20} />
								</button>
								<div>
									<h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">
										Fatura de {NOMES_MESES[parseInt(filtroMes, 10) - 1] || "Mês"} / {filtroAno}
									</h2>
									<p className="text-xs font-bold text-slate-400 mt-0.5">
										{filtroCartaoId === "TODOS" ? "Consolidado de todos os cartões" : (cartoes.find(c => c.id === filtroCartaoId)?.nome || "Cartão Selecionado")}
									</p>
								</div>
								<button
									onClick={() => navegarMes(1)}
									className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
									title="Próximo Mês"
								>
									<ChevronRight size={20} />
								</button>
							</div>

							<div className="flex items-center gap-2">
								{faturasDoMes.map(f => (
									<span key={f.id} className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider ${getStatusColor(f.status)}`}>
										{f.status}
									</span>
								))}
							</div>
						</div>

						{/* KPIS DA FATURA DO MÊS */}
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6">
							<div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
								<p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total da Fatura (Mês)</p>
								<h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">
									R$ {kpiTotalFaturado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
								</h3>
								<span className="text-xs text-slate-400 mt-1 block">{lancamentosDoMes.length} lançamentos neste mês</span>
							</div>

							<div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/40">
								<p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Total Pago</p>
								<h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
									R$ {kpiTotalPago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
								</h3>
								<span className="text-xs text-slate-400 mt-1 block">Pagamentos compensados</span>
							</div>

							<div className="bg-rose-50/50 dark:bg-rose-950/20 p-4 rounded-2xl border border-rose-100 dark:border-rose-900/40">
								<p className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">Saldo a Pagar</p>
								<h3 className={`text-2xl font-black mt-1 ${kpiSaldoRestante > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
									R$ {kpiSaldoRestante.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
								</h3>
								<span className="text-xs text-slate-400 mt-1 block">{kpiSaldoRestante === 0 ? "Fatura quitada!" : "Pendente de pagamento"}</span>
							</div>
						</div>
					</div>

					{/* TABELA DE LANÇAMENTOS DA FATURA DO MÊS */}
					<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
						<div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
							<h3 className="font-black text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
								<FileText size={20} className="text-indigo-600" />
								Lançamentos da Fatura ({lancamentosDoMes.length})
							</h3>
							<span className="text-xs font-bold text-slate-400">
								Mostrando compras faturadas em {NOMES_MESES[parseInt(filtroMes, 10) - 1]}/{filtroAno}
							</span>
						</div>

						{loading ? (
							<div className="flex justify-center p-16">
								<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
							</div>
						) : lancamentosDoMes.length === 0 ? (
							<div className="text-center py-16 px-4">
								<CheckCircle2 size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
								<h4 className="text-lg font-black text-slate-800 dark:text-slate-200">Nenhum lançamento encontrado nesta fatura</h4>
								<p className="text-slate-400 text-sm max-w-md mx-auto mt-1 font-medium">
									Não há compras registradas com os filtros selecionados para este mês.
								</p>
							</div>
						) : (
							<div className="overflow-auto max-h-[600px]">
								<table className="w-full text-left border-collapse min-w-[700px]">
									<thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shadow-2xs">
										<tr className="text-[11px] font-black uppercase text-slate-400">
											<th className="py-3 px-4">Data</th>
											<th className="py-3 px-4">Estabelecimento / Descrição</th>
											<th className="py-3 px-4">Categoria</th>
											<th className="py-3 px-4">Cartão</th>
											<th className="py-3 px-4">Parcela</th>
											<th className="py-3 px-4 text-right">Valor</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
										{lancamentosDoMes.map((t) => {
											const cartaoAssociado = cartoes.find(c => c.id === t.cartao_id);
											const matchParc = (t.descricao || "").match(/(?:parcela\s*|parc\.?\s*)?(\d{1,2})\s*[/]\s*(\d{1,2})|\b(\d{1,2})\s+de\s+(\d{1,2})\b/i);
											const parcAtual = t.parcela_atual || (matchParc ? (matchParc[1] || matchParc[3]) : null);
											const parcTotal = t.total_parcelas || (matchParc ? (matchParc[2] || matchParc[4]) : null);
											const parcelaInfo = parcTotal && Number(parcTotal) > 1 
												? `${parcAtual || 1}/${parcTotal}` 
												: (t.total_parcelas > 1 ? `${t.parcela_atual || 1}/${t.total_parcelas}` : "À vista");
											const catNome = t.categoria || t.categorias?.nome || "Outros";

											return (
												<tr key={t.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
													<td className="py-3.5 px-4 font-bold text-slate-500 whitespace-nowrap">
														{t.data ? new Date(t.data + "T12:00:00").toLocaleDateString("pt-BR") : "--"}
													</td>
													<td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 flex-wrap">
														<span>{t.descricao}</span>
														{t.isRenegociacao && (
															<span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 tracking-wider">
																Acordo de Cartão
															</span>
														)}
													</td>
													<td className="py-3.5 px-4 whitespace-nowrap">
														<span className={`${t.isRenegociacao ? 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'} px-2.5 py-1 rounded-xl text-xs font-bold border`}>
															{catNome}
														</span>
													</td>
													<td className="py-3.5 px-4 whitespace-nowrap">
														<span 
															className="px-2.5 py-1 rounded-xl text-xs font-black text-white shadow-xs inline-flex items-center gap-1"
															style={{ backgroundColor: cartaoAssociado?.cor_hex || "#6366f1" }}
														>
															<CreditCard size={12} /> {cartaoAssociado?.nome || "Cartão"}
														</span>
													</td>
													<td className="py-3.5 px-4 font-bold text-slate-500 text-xs whitespace-nowrap">
														{parcelaInfo}
													</td>
													<td className="py-3.5 px-4 text-right font-black text-slate-800 dark:text-slate-100 whitespace-nowrap">
														R$ {Number(t.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
													</td>
												</tr>
											);
										})}
									</tbody>
									<tfoot>
										<tr className="bg-slate-50 dark:bg-slate-800 font-black text-sm border-t border-slate-200 dark:border-slate-700">
											<td colSpan={5} className="py-4 px-4 text-slate-600 dark:text-slate-300">
												Total dos lançamentos filtrados ({lancamentosDoMes.length} compras)
											</td>
											<td className="py-4 px-4 text-right text-indigo-600 dark:text-indigo-400 text-base">
												R$ {lancamentosDoMes.reduce((acc, t) => acc + Number(t.valor || 0), 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
											</td>
										</tr>
									</tfoot>
								</table>
							</div>
						)}
					</div>
				</div>
			) : (
				/* VISÃO EM CARDS DE TODAS AS FATURAS */
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{faturasFiltradas.length === 0 ? (
						<div className="col-span-full py-16 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 border-dashed">
							<CheckCircle2 size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-4" />
							<h3 className="text-xl font-black text-slate-800 dark:text-slate-200">Nenhuma fatura encontrada</h3>
							<p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-2 font-medium">
								Não há faturas que atendam aos filtros selecionados.
							</p>
						</div>
					) : (
						faturasFiltradas.map((fatura) => (
							<motion.div 
								key={fatura.id} 
								whileHover={{ y: -4 }}
								className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-full overflow-hidden group"
							>
								<div className="h-10 w-full opacity-40" style={{ backgroundColor: fatura.cartoes?.cor_hex || "#6366f1" }} />
								
								<div className="p-6 pt-2 flex-1 flex flex-col">
									<div className="flex justify-between items-start mb-4">
										<div className="flex-1">
											<p className="text-xs font-black text-slate-400 uppercase tracking-widest">{fatura.cartoes?.nome || "Cartão"}</p>
											<div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${getStatusColor(fatura.status)}`}>
												{fatura.status}
											</div>
										</div>
										<CreditCard size={28} className="text-slate-300 dark:text-slate-700" />
									</div>

									<div className="mt-2 mb-4">
										<p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Valor da Fatura</p>
										<h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1">
											{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(fatura.valor_total || 0)}
										</h3>
										
										<div className="mt-3 flex items-center justify-between text-xs font-bold pt-2 border-t border-slate-100 dark:border-slate-800">
											<span className="text-slate-500 dark:text-slate-400">
												Pago: <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(fatura.valor_pago || 0)}</span>
											</span>
											<span className="text-slate-600 dark:text-slate-300">
												Saldo: <span className={Math.max(0, Number(fatura.valor_total || 0) - Number(fatura.valor_pago || 0)) > 0 ? "text-rose-500 font-extrabold" : "text-emerald-500 font-extrabold"}>
													{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, Number(fatura.valor_total || 0) - Number(fatura.valor_pago || 0)))}
												</span>
											</span>
										</div>
									</div>

									<div className="space-y-3 mt-auto bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl text-sm font-medium border border-slate-100 dark:border-slate-800">
										<div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
											<span className="flex items-center gap-2"><Calendar size={16} /> Fechamento</span>
											<span className="font-bold">{fatura.data_fechamento ? new Date(fatura.data_fechamento).toLocaleDateString('pt-BR') : '--'}</span>
										</div>
										<div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
											<span className="flex items-center gap-2"><Calendar size={16} className="text-rose-400" /> Vencimento</span>
											<span className="font-bold text-rose-500 dark:text-rose-400">{fatura.data_vencimento ? new Date(fatura.data_vencimento).toLocaleDateString('pt-BR') : '--'}</span>
										</div>
									</div>

									<button 
										className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3.5 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-2xl font-bold transition-colors cursor-pointer"
										onClick={(e) => {
											e.preventDefault();
											setFaturaAbertaModal(fatura);
										}}
									>
										<Eye size={18} />
										Ver Lançamentos
									</button>
								</div>
							</motion.div>
						))
					)}
				</div>
			)}
			
			<AnimatePresence>
				{faturaAbertaModal && (
					<FaturaLancamentosModal 
						isOpen={!!faturaAbertaModal} 
						onClose={() => setFaturaAbertaModal(null)} 
						fatura={faturaAbertaModal} 
					/>
				)}
			</AnimatePresence>
		</motion.div>
	);
}
