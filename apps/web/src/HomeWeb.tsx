import LancamentosSemContaModal from "./components/LancamentosSemContaModal";
import CompartilhadoComigo from "./components/CompartilhadoComigo";
import { ehLancamentoSemConta, lancamentosSemContaService } from "../../../packages/services/lancamentos-sem-conta.service";
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../packages/services/supabase";
import {
	BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
	ArrowUpRight, ArrowDownRight, Wallet, TrendingUp, TrendingDown, Sparkles, AlertCircle, Phone, CreditCard, ChevronDown, Calendar, Brain, HandCoins, Users, Bell, ArrowRight,
	Briefcase,     CheckCircle2,    UserCheck, Plus,   ArrowDownLeft
} from "lucide-react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { authService } from "../../../packages/services/auth.service";
import { financeService } from "../../../packages/services/finance.service";
import { ExportExcelButton } from "./components/ExportExcelButton";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import OnboardingContasModal from "./components/OnboardingContasModal";
import MeiOnboardingModal from "./components/MeiOnboardingModal";
import AddSplitDespesaModal from "./components/AddSplitDespesaModal";
import ConviteAmigoModal from "./components/ConviteAmigoModal";
import AddContatoWeb from "./components/AddContatoWeb";
import ChatAcordosIaModal from "./components/ChatAcordosIaModal";
import CriarGrupoModal from "./components/CriarGrupoModal";
import { despesasCompartilhadasService } from "../../../packages/services/despesas-compartilhadas.service";
import type { Grupo } from "../../../packages/services/despesas-compartilhadas.service";
import EmBreveView from "./components/EmBreveView";
import { getFaturaMesReferencia } from "../../../packages/utils/cartao.utils";
import CategoryBreakdown from "./components/CategoryBreakdown";

const NOME_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function HomeWeb() {
	const navigate = useNavigate();
	const { userProfile } = useOutletContext<any>() || {};
	const [stats, setStats] = useState({ entradasMes: 0, gastosMes: 0, saldoTotal: 0 });
	const [nome, setNome] = useState("");
	const [userId, setUserId] = useState("");
	const [, setAcompanhaMei] = useState<boolean | null>(null);
	const [isClient, setIsClient] = useState(false);
	const [isFetchingData, setIsFetchingData] = useState(true);

	// 3 CAMINHOS DA HOME: PESSOAL | COMPARTILHADO | PJ
	const [searchParams, setSearchParams] = useSearchParams();
	const tabParam = searchParams.get("tab")?.toUpperCase();
	const initialCaminho: "PESSOAL" | "COMPARTILHADO" | "PJ" = 
		["COMPARTILHADO", "COMPARTILHADO", "DEVEDORES"].includes(tabParam || "") ? "COMPARTILHADO" :
		tabParam === "PJ" || tabParam === "MEI" ? "PJ" : "PESSOAL";

	const [caminhoAtivo, setCaminhoAtivo] = useState<"PESSOAL" | "COMPARTILHADO" | "PJ">(initialCaminho);

	useEffect(() => {
		if (["COMPARTILHADO", "COMPARTILHADO", "DEVEDORES"].includes(tabParam || "")) setCaminhoAtivo("COMPARTILHADO");
		else if (tabParam === "PJ" || tabParam === "MEI") setCaminhoAtivo("PJ");
		else if (tabParam === "PESSOAL" || tabParam === "PF") setCaminhoAtivo("PESSOAL");
	}, [tabParam]);

	const handleMudarCaminho = (novo: "PESSOAL" | "COMPARTILHADO" | "PJ") => {
		setCaminhoAtivo(novo);
		setSearchParams({ tab: novo.toLowerCase() });
	};

	// Modais e dados de despesas compartilhadas na Home
	const [isAddSplitOpen, setIsAddSplitOpen] = useState(false);
	const [isAddContatoOpen, setIsAddContatoOpen] = useState(false);
	const [isChatIaOpen, setIsChatIaOpen] = useState(false);
	const [isCriarGrupoOpen, setIsCriarGrupoOpen] = useState(false);
	const [contatoParaConvite, setContatoParaConvite] = useState<any>(null);
	const [contatos, setContatos] = useState<any[]>([]);
	const [credores, setCredores] = useState<any[]>([]);
	const [grupos, setGrupos] = useState<Grupo[]>([]);

	useEffect(() => { setIsClient(true); }, []);
	
	useEffect(() => {
		if (userProfile && userProfile.acompanha_mei !== undefined) {
			setAcompanhaMei(userProfile.acompanha_mei);
		}
	}, [userProfile]);
	
	const [rawEntradas, setRawEntradas] = useState<any[]>([]);
	const [rawGastos, setRawGastos] = useState<any[]>([]);
	const [rawEstornos, setRawEstornos] = useState<any[]>([]);
	const [rawFaturas, setRawFaturas] = useState<any[]>([]);
	const [rawInvestimentos, setRawInvestimentos] = useState<any[]>([]);
	const [rawDividas, setRawDividas] = useState<any[]>([]);
	const [rawFaturasNaoPagas, setRawFaturasNaoPagas] = useState<any[]>([]);
	const [lastLaunchDate, setLastLaunchDate] = useState<string | null>(null);
	const [hasLaunchesThisMonth, setHasLaunchesThisMonth] = useState<boolean>(true);
	const [devedores, setDevedores] = useState<any[]>([]);
	const [cartoes, setCartoes] = useState<any[]>([]);
	
	const [contasBancarias, setContasBancarias] = useState<any[]>([]);
	const [showOnboarding, setShowOnboarding] = useState(false);
	const [showMeiModal, setShowMeiModal] = useState(false);
	const [showOrphanAlert, setShowOrphanAlert] = useState(false);
	const [qtdSemConta, setQtdSemConta] = useState(0);
	const [listaSemContaAberta, setListaSemContaAberta] = useState(false);
	const adiarAvisoSemConta = () => {
		setShowOrphanAlert(false);
		try {
			sessionStorage.setItem("finance_aviso_sem_conta", "1");
		} catch {
			/* sem armazenamento */
		}
	};
	const [mostrarItensPrevistos, setMostrarItensPrevistos] = useState(false);

	const hoje = new Date();
	const [filterYear, setFilterYear] = useState(hoje.getFullYear());
	const [filterMonth, setFilterMonth] = useState<number | "all">("all");
	const [filterCategory, setFilterCategory] = useState<string>("all");

	const isSameMonthYear = (dateStr: any, year: number, month: number | "all") => {
		if (!dateStr) return false;
		const str = String(dateStr).trim();
		if (month === "all") {
			if (str.startsWith(String(year))) return true;
			if (str.includes(String(year))) return true;
			const d = new Date(str.includes("T") ? str : `${str}T12:00:00`);
			return !isNaN(d.getTime()) && d.getFullYear() === year;
		}
		const mStr = String(month).padStart(2, "0");
		if (str.startsWith(`${year}-${mStr}`)) return true;
		if (str.startsWith(`${year}-${month}-`)) return true;
		if (str.includes(`/${mStr}/${year}`) || str.includes(`/${month}/${year}`)) return true;
		if (str.includes(`-${mStr}-${year}`) || str.includes(`-${month}-${year}`)) return true;
		const d = new Date(str.includes("T") ? str : `${str}T12:00:00`);
		if (!isNaN(d.getTime())) {
			return d.getFullYear() === year && (d.getMonth() + 1) === month;
		}
		return false;
	};

	const loadDashboardData = useCallback(async () => {
		const { data: { user } } = await supabase.auth.getUser();
		if (!user) return;
		setUserId(user.id);

		const startOfYear = `${filterYear}-01-01`;
		const endOfYear = `${filterYear}-12-31T23:59:59.999Z`;
		const d = new Date();
		const currentMonthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
		const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

		try {
			const [
				saldoAtual, resTransacoes, resInv, resDiv, resDevedores, resCartoes, resLastTransacao, resCountTransacoes, resContas, resContatos, resTransacoesCredores, resGrupos
			] = await Promise.all([
				financeService.getGlobalBalance(user.id).catch(() => 0),
				supabase.from("transacoes").select("*, categorias(nome), contas_bancarias(nome, tipo)").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear),
				supabase.from("investimentos").select("*").eq("usuario_id", user.id),
				financeService.getDividas(user.id).catch(() => []),
				financeService.getDevedores(user.id).catch(() => []),
				financeService.getCartoes(user.id).catch(() => []),
				supabase.from("transacoes").select("data").eq("usuario_id", user.id).lte("data", todayStr).order("data", { ascending: false }).limit(1),
				supabase.from("transacoes").select("id", { count: "exact", head: true }).eq("usuario_id", user.id).gte("data", currentMonthStart),
				financeService.getContasBancarias(user.id).catch(() => []),
				supabase.from("contatos").select("*").eq("usuario_id", user.id).order("nome"),
				supabase.from("transacoes")
					.select("id, descricao, data, valor, terceiro_pago, observacao, cartao_id, conta_id, cartoes(nome), contas_bancarias(nome)")
					.eq("usuario_id", user.id)
					.ilike("observacao", "%parceria_credor_id%"),
				despesasCompartilhadasService.getGrupos(user.id).catch(() => [])
			]);

			const contatosRaw = resContatos?.data || [];
			const contatosList = contatosRaw.map((c: any) => {
				const isFake = c.email && (c.email.toLowerCase().includes("@example.com") || c.email.toLowerCase().includes("@exemplo.com"));
				return isFake ? { ...c, email: null } : c;
			});

			const idsFakeHome = contatosRaw
				.filter((c: any) => c.email && (c.email.toLowerCase().includes("@example.com") || c.email.toLowerCase().includes("@exemplo.com")))
				.map((c: any) => c.id);

			if (idsFakeHome.length > 0) {
				supabase.from("contatos").update({ email: null }).in("id", idsFakeHome).then(() => {});
			}

			setContatos(contatosList);
			setGrupos(resGrupos || []);

			// Processamento de Credores (quem o usuário deve em despesas divididas)
			const txsCredores = resTransacoesCredores?.data || [];
			const credoresMap = new Map();
			txsCredores.forEach((g: any) => {
				let contatoEncontrado = null;
				let isCredorItem = false;
				let valorParcela = Number(g.valor || 0);
				let valorOriginal = valorParcela;

				if (g.observacao && g.observacao.trim().startsWith("{")) {
					try {
						const meta = JSON.parse(g.observacao);
						if (meta.parceria_credor_id) {
							contatoEncontrado = contatosList.find((c: any) => c.id === meta.parceria_credor_id);
							isCredorItem = true;
							valorOriginal = meta.valor_total || valorParcela;
						}
					} catch (e) {}
				}

				if (isCredorItem && contatoEncontrado) {
					const cId = contatoEncontrado.id;
					if (!credoresMap.has(cId)) {
						credoresMap.set(cId, { contato: contatoEncontrado, total_devido: 0, itens: [] });
					}
					const credor = credoresMap.get(cId);
					const cartaoNome = g.cartoes?.nome || null;
					const contaNome = g.contas_bancarias?.nome || null;
					const formaPagamento = g.cartao_id
						? (cartaoNome ? `Crédito (${cartaoNome})` : "Crédito")
						: g.conta_id
						? (contaNome ? `Débito (${contaNome})` : "Débito")
						: "Débito / Pix";

					credor.itens.push({
						id: g.id,
						descricao: g.descricao,
						data: g.data,
						valor_parcela_usuario: valorParcela,
						valor_original: valorOriginal,
						quitado: g.terceiro_pago || false,
						cartao_nome: cartaoNome,
						conta_nome: contaNome,
						forma_pagamento: formaPagamento,
						is_credito: Boolean(g.cartao_id),
					});
				}
			});

			const credoresList = Array.from(credoresMap.values()).map(c => {
				const total_devido = c.itens
					.filter((i: any) => !i.quitado)
					.reduce((sum: number, i: any) => sum + Number(i.valor_parcela_usuario), 0);
				return { ...c, total_devido };
			});
			setCredores(credoresList);

			const txList = (resTransacoes?.data || []).map((t: any) => ({
				...t,
				categoria: t.categorias?.nome || t.categoria || "Outros",
				considerar_soma: t.considerar_soma !== false
			}));
			const isEntrada = (t: any) => {
				const tp = (t.tipo || "").toUpperCase();
				return tp === "RECEITA" || tp === "ENTRADA" || tp === "PROVENTOS" || tp === "SALARIO";
			};
			const isGasto = (t: any) => {
				const tp = (t.tipo || "").toUpperCase();
				return tp === "DESPESA" || tp === "GASTO" || tp === "SAIDA";
			};
			const isFatura = (t: any) => {
				const tp = (t.tipo || "").toUpperCase();
				return tp === "PAGAMENTO_FATURA" || tp === "FATURA";
			};
			const isEstorno = (t: any) => {
				const tp = (t.tipo || "").toUpperCase();
				return tp === "ESTORNO";
			};

			const entradas = txList.filter(isEntrada);
			const gastos = txList.filter(isGasto);
			const faturas = txList.filter(isFatura);
			const estornos = txList.filter(isEstorno);

			setStats(prev => ({ ...prev, saldoTotal: saldoAtual }));
			setRawEntradas(entradas);
			setRawGastos(gastos);
			setRawEstornos(estornos);
			setRawFaturas(faturas);
			setRawInvestimentos(resInv?.data || []);

			const mappedDividas = (resDiv || []).map((d: any) => {
				const proximaParcela = (d.parcelas_divida || []).find((p: any) => p.status !== 'paga');
				const valorParcela = proximaParcela ? Number(proximaParcela.valor) : (Number(d.valor_atual || d.valor_original || 0) / (d.quantidade_parcelas || 1));
				return {
					...d,
					valor_total: Number(d.valor_atual || d.valor_original || 0),
					parcelas: d.quantidade_parcelas || 1,
					vencimento_parcela: proximaParcela?.data_vencimento || d.criado_em?.split('T')[0] || "",
					valor_parcela: valorParcela
				};
			});
			setRawDividas(mappedDividas);
			setDevedores(resDevedores || []);
			setCartoes(resCartoes || []);
			
			const loadedContas = resContas || [];
			setContasBancarias(loadedContas);
			
			// Verificações para Modal
			if (loadedContas.length === 0) {
				setShowOnboarding(true);
			} else {
				// Verifica se tem lançamentos órfãos
				// Só o que deveria estar numa conta (divisão de contas, acordos e parcelas futuras ficam de fora)
				const orfaos = [...entradas, ...gastos].filter((t: any) => ehLancamentoSemConta(t));
				setQtdSemConta(orfaos.length);
				// Conta de todos os anos (a lista também mostra todos)
				lancamentosSemContaService.listar(user.id).then((l) => setQtdSemConta(l.length)).catch(() => {});
				let jaAvisou = false;
				try {
					jaAvisou = sessionStorage.getItem("finance_aviso_sem_conta") === "1";
				} catch {
					/* sem armazenamento */
				}
				if (orfaos.length > 0 && !jaAvisou) {
					setShowOrphanAlert(true);
				}
			}

			const lastLaunch = resLastTransacao?.data?.[0]?.data || null;
			setLastLaunchDate(lastLaunch);
			setHasLaunchesThisMonth((resCountTransacoes?.count || 0) > 0);

			if (resCartoes && resCartoes.length > 0) {
				const lastMonths: string[] = [];
				const dDate = new Date();
				for (let i = 0; i < 3; i++) {
					lastMonths.push(`${dDate.getFullYear()}-${String(dDate.getMonth() + 1).padStart(2, '0')}`);
					dDate.setMonth(dDate.getMonth() - 1);
				}

				const faturasPromises: Promise<any>[] = [];
				resCartoes.forEach((c: any) => {
					lastMonths.forEach((m) => {
						faturasPromises.push(financeService.getFaturaMensal(user.id, c.id, m).then(res => ({ ...res, mesReferencia: m })).catch(() => null));
					});
				});

				const faturasResult = await Promise.all(faturasPromises);
				setRawFaturasNaoPagas(faturasResult.filter((f: any) => f && f.totalFatura > 0 && f.pendente > 0.01));
			} else {
				setRawFaturasNaoPagas([]);
			}
		} catch (err) {
			console.error("Erro ao carregar dados do dashboard:", err);
		}
	}, [filterYear]);

	useEffect(() => {
		async function initData() {
			await loadDashboardData();
			const u = await authService.getCurrentUser();
			if (u) {
				setNome(u.nome.split(" ")[0]);
				setAcompanhaMei(u.acompanha_mei ?? null);
				if (u.acompanha_mei === null) {
					setShowMeiModal(true);
				}
			}
			setIsFetchingData(false);
		}
		initData();

		let channelTx: any;
		let channelDividas: any;

		async function setupRealtime() {
			const { data: { user } } = await supabase.auth.getUser();
			if (user) {
				channelTx = financeService.subscribeToChanges("transacoes", user.id, loadDashboardData);
				channelDividas = financeService.subscribeToChanges("dividas", user.id, loadDashboardData);
			}
		}
		setupRealtime();
		return () => {
			if (channelTx) supabase.removeChannel(channelTx);
			if (channelDividas) supabase.removeChannel(channelDividas);
		};
	}, [loadDashboardData]);

	const getGreeting = () => {
		const hour = hoje.getHours();
		if (hour < 12) return "Bom dia";
		if (hour < 18) return "Boa tarde";
		return "Boa noite";
	};

	const dashboardData = useMemo(() => {
		// Helper para calcular gastos diretos, faturas de cartão e parcelas de dívidas para qualquer mês
		const getCompromissosMes = (y: number, m: number) => {
			const mStr = String(m).padStart(2, "0");
			const mesAnoStr = `${y}-${mStr}`;

			// 1. Gastos operacionais à vista / débito / Pix (excluindo crédito para evitar dupla contagem)
			const gastosAVista = rawGastos
				.filter(g => g.considerar_soma !== false && g.metodo_pagamento !== "Crédito" && isSameMonthYear(g.data, y, m))
				.reduce((acc, cur) => acc + Number(cur.valor || 0), 0);
			const estornosMes = rawEstornos
				.filter(e => isSameMonthYear(e.data, y, m))
				.reduce((acc, cur) => acc + Number(cur.valor || 0), 0);
			const debitoLiquido = Math.max(0, gastosAVista - estornosMes);

			// 2. Faturas de Cartão (compras do mês no crédito + parcelas de acordos projetadas)
			let totalFaturas = 0;
			const dividasCartaoIds = new Set<string>();

			cartoes.forEach((c: any) => {
				const fechamentoDia = c.fechamento_dia || 1;
				const vencimentoDia = c.vencimento_dia || 10;
				const cNome = (c.nome || "").toLowerCase();

				// Gastos de compras com o cartão
				const comprasCartao = rawGastos
					.filter(g => g.cartao_id === c.id && (!g.data ? false : getFaturaMesReferencia(g.data, fechamentoDia, vencimentoDia) === mesAnoStr))
					.reduce((acc, cur) => acc + Number(cur.valor || 0), 0);
				const estornosCartao = rawEstornos
					.filter(e => e.cartao_id === c.id && (!e.data ? false : getFaturaMesReferencia(e.data, fechamentoDia, vencimentoDia) === mesAnoStr))
					.reduce((acc, cur) => acc + Number(cur.valor || 0), 0);
				const comprasLiquidas = Math.max(0, comprasCartao - estornosCartao);

				// Parcela de acordo / renegociação associada a este cartão
				let parcelaAcordo = 0;
				rawDividas.forEach((d: any) => {
					const dDesc = (d.descricao || "").toLowerCase();
					const dInst = (d.instituicao || "").toLowerCase();
					const isCardAgreement = d.cartao_id === c.id ||
						(cNome.includes("8282") && (dDesc.includes("8282") || dDesc.includes("renegocia"))) ||
						(cNome.includes("santander") && dDesc.includes("renegocia") && (dInst.includes("santander") || dDesc.includes("santander")));

					if (isCardAgreement) {
						dividasCartaoIds.add(d.id);
						(d.parcelas_divida || []).forEach((p: any) => {
							if (isSameMonthYear(p.data_vencimento, y, m)) {
								parcelaAcordo += Number(p.valor_esperado || p.valor || 0);
							}
						});
					}
				});

				// Histórico de pagamento de fatura se já realizado em meses passados
				const pagtoHist = rawFaturas
					.filter(p => p.cartao_id === c.id && p.mes_referencia === mesAnoStr)
					.reduce((acc, cur) => acc + Number(cur.valor || 0), 0);

				totalFaturas += Math.max(pagtoHist, comprasLiquidas + parcelaAcordo);
			});

			// Gastos no crédito sem cartao_id
			const comprasCreditoAvulsas = rawGastos
				.filter(g => !g.cartao_id && g.metodo_pagamento === "Crédito" && isSameMonthYear(g.data, y, m))
				.reduce((acc, cur) => acc + Number(cur.valor || 0), 0);
			totalFaturas += comprasCreditoAvulsas;

			// 3. Parcelas de Empréstimos e Financiamentos (que não sejam acordos de cartão já computados)
			let totalEmprestimos = 0;
			rawDividas.forEach((d: any) => {
				if (dividasCartaoIds.has(d.id)) return;
				const dDesc = (d.descricao || "").toLowerCase();
				if (dDesc.includes("renegocia") && dDesc.includes("cart")) return;

				(d.parcelas_divida || []).forEach((p: any) => {
					if (isSameMonthYear(p.data_vencimento, y, m)) {
						totalEmprestimos += Number(p.valor_esperado || p.valor || 0);
					}
				});
			});

			return {
				debitoLiquido,
				totalFaturas,
				totalEmprestimos,
				totalGeral: debitoLiquido + totalFaturas + totalEmprestimos
			};
		};

		let filteredEntradas = rawEntradas;
		let filteredInvestimentos = rawInvestimentos;

		if (filterMonth !== "all") {
			filteredEntradas = filteredEntradas.filter(e => isSameMonthYear(e.data, filterYear, filterMonth));
		}

		let totalGastosConsolidado = 0;
		let totalFaturasConsolidado = 0;
		let totalDividasConsolidado = 0;

		if (filterMonth === "all") {
			for (let i = 1; i <= 12; i++) {
				const c = getCompromissosMes(filterYear, i);
				totalGastosConsolidado += c.totalGeral;
				totalFaturasConsolidado += c.totalFaturas;
				totalDividasConsolidado += c.totalEmprestimos;
			}
		} else {
			const c = getCompromissosMes(filterYear, filterMonth);
			totalGastosConsolidado = c.totalGeral;
			totalFaturasConsolidado = c.totalFaturas;
			totalDividasConsolidado = c.totalEmprestimos;
		}

		const totaisMes = {
			entradas: filteredEntradas.reduce((acc, cur) => acc + Number(cur.valor || 0), 0),
			gastos: totalGastosConsolidado,
			faturas: totalFaturasConsolidado,
			investimentos: filteredInvestimentos.reduce((acc, cur) => acc + Number(cur.valor_investido || 0), 0),
			dividas: totalDividasConsolidado,
		};

		const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
		const dadosGrafico = [];

		for (let i = 0; i < 12; i++) {
			const mNum = i + 1;
			const ent = rawEntradas.filter(e => isSameMonthYear(e.data, filterYear, mNum)).reduce((a, c) => a + Number(c.valor || 0), 0);
			const comp = getCompromissosMes(filterYear, mNum);
			const inv = rawInvestimentos.reduce((a, c) => a + Number(c.valor_investido || 0), 0) / 12;

			dadosGrafico.push({
				mes: mesesNomes[i],
				entradas: ent,
				gastos: comp.totalGeral,
				cartoes: comp.totalFaturas,
				dividas: comp.totalEmprestimos,
				investimentos: inv
			});
		}

		const parseDate = (d: any) => new Date(d || 0).getTime();
		const gastosRecentesBase = rawGastos.filter(g => g.considerar_soma !== false);

		return {
			totaisMes,
			dadosGrafico,
			recentes: {
				entradas: (filteredEntradas.length > 0 ? filteredEntradas : rawEntradas).slice().sort((a, b) => parseDate(b.data) - parseDate(a.data)).slice(0, 5),
				gastos: gastosRecentesBase.slice().sort((a, b) => parseDate(b.data) - parseDate(a.data)).slice(0, 5),
				cartoes: rawFaturas.slice().sort((a, b) => parseDate(b.data) - parseDate(a.data)).slice(0, 5),
				investimentos: [...filteredInvestimentos].slice(0, 5),
				dividas: [...rawDividas].sort((a, b) => parseDate(b.vencimento_parcela) - parseDate(a.vencimento_parcela)).slice(0, 5)
			}
		};
	}, [rawEntradas, rawGastos, rawEstornos, rawFaturas, rawInvestimentos, rawDividas, cartoes, filterYear, filterMonth]);

	const cartoesResumo = useMemo(() => {
		if (cartoes.length === 0) return [];
		const activeMonthStr = filterMonth !== "all" ? `${filterYear}-${String(filterMonth).padStart(2, '0')}` : `${filterYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
		const activeMonthNum = filterMonth !== "all" ? Number(filterMonth) : new Date().getMonth() + 1;
		
		return cartoes.map((c: any) => {
			const fechamentoDia = c.fechamento_dia || 1;
			const vencimentoDia = c.vencimento_dia || 1;
			const cNome = (c.nome || "").toLowerCase();
			const gastosCartao = rawGastos.filter(g => g.cartao_id === c.id && (!g.data ? false : getFaturaMesReferencia(g.data, fechamentoDia, vencimentoDia) === activeMonthStr));
			const estornosCartao = rawEstornos.filter(e => e.cartao_id === c.id && (!e.data ? false : getFaturaMesReferencia(e.data, fechamentoDia, vencimentoDia) === activeMonthStr));
			const totalDespesasCartao = gastosCartao.reduce((sum, item) => sum + Number(item.valor || 0), 0);
			const totalEstornosCartao = estornosCartao.reduce((sum, item) => sum + Number(item.valor || 0), 0);
			let totalFatura = Math.max(0, totalDespesasCartao - totalEstornosCartao);

			// Projeção de renegociação vinculada ao cartão
			rawDividas.forEach((d: any) => {
				const dDesc = (d.descricao || "").toLowerCase();
				const isCardAgreement = d.cartao_id === c.id ||
					(cNome.includes("8282") && (dDesc.includes("8282") || dDesc.includes("renegocia"))) ||
					(cNome.includes("santander") && dDesc.includes("renegocia"));

				if (isCardAgreement) {
					(d.parcelas_divida || []).forEach((p: any) => {
						if (isSameMonthYear(p.data_vencimento, filterYear, activeMonthNum)) {
							totalFatura += Number(p.valor_esperado || p.valor || 0);
						}
					});
				}
			});

			const pagamentosFatura = rawFaturas.filter(p => p.cartao_id === c.id && p.mes_referencia === activeMonthStr);
			const totalPago = pagamentosFatura.reduce((sum, item) => sum + Number(item.valor || 0), 0);
			const pendente = Math.max(0, totalFatura - totalPago);
			const limiteDisponivel = Math.max(0, Number(c.limite || 0) - totalFatura);
			const percentualUso = Number(c.limite || 0) > 0 ? (totalFatura / Number(c.limite)) * 100 : 0;
			return { cartao: c, totalFatura, totalPago, pendente, limiteDisponivel, percentualUso, mesStr: activeMonthStr };
		});
	}, [cartoes, rawGastos, rawEstornos, rawFaturas, rawDividas, filterMonth, filterYear]);

	const entradaPieData = useMemo(() => {
		let filtered = rawEntradas;
		if (filterMonth !== "all") {
			filtered = filtered.filter(e => isSameMonthYear(e.data, filterYear, filterMonth));
		}
		const grouped = filtered.reduce((acc: any, item: any) => {
			const cat = item.categoria || "Outros";
			acc[cat] = (acc[cat] || 0) + Number(item.valor || 0);
			return acc;
		}, {});
		return Object.keys(grouped).map(name => ({ name, value: grouped[name] }));
	}, [rawEntradas, filterYear, filterMonth]);

	const gastoPieData = useMemo(() => {
		let filtered = rawGastos.filter(g => g.considerar_soma !== false);
		if (filterMonth !== "all") {
			filtered = filtered.filter(g => isSameMonthYear(g.data, filterYear, filterMonth));
		}
		const grouped = filtered.reduce((acc: any, item: any) => {
			const cat = item.categoria || "Outros";
			acc[cat] = (acc[cat] || 0) + Number(item.valor || 0);
			return acc;
		}, {});
		return Object.keys(grouped).map(name => ({ name, value: grouped[name] }));
	}, [rawGastos, filterYear, filterMonth]);

	const saldoFiltrado = useMemo(() => dashboardData.totaisMes.entradas - dashboardData.totaisMes.gastos, [dashboardData]);

	const previsaoGastoProximoMes = useMemo(() => {
		const h = new Date();
		let targetYear = filterYear;
		let targetMonth = h.getMonth() + 2; // Próximo mês (1-12)
		if (targetMonth > 12) {
			targetMonth = 1;
			targetYear += 1;
		}
		if (filterMonth !== "all") {
			targetMonth = Number(filterMonth);
			targetYear = filterYear;
		}

		const mesAnoStr = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
		const itensPrevistos: any[] = [];
		const dividasCartaoIds = new Set<string>();

		// 1. FATURAS DE CARTÃO
		let totalFaturas = 0;
		cartoes.forEach((c: any) => {
			const fechamentoDia = c.fechamento_dia || 12;
			const vencimentoDia = c.vencimento_dia || 19;
			const cNome = (c.nome || "").toLowerCase();

			// Compras no crédito deste ciclo
			const comprasCartao = rawGastos
				.filter(g => g.cartao_id === c.id && (!g.data ? false : getFaturaMesReferencia(g.data, fechamentoDia, vencimentoDia) === mesAnoStr));
			const totalCompras = comprasCartao.reduce((acc, cur) => acc + Number(cur.valor || 0), 0);

			// Estornos deste ciclo
			const estornosCartao = rawEstornos
				.filter(e => e.cartao_id === c.id && (!e.data ? false : getFaturaMesReferencia(e.data, fechamentoDia, vencimentoDia) === mesAnoStr));
			const totalEstornos = estornosCartao.reduce((acc, cur) => acc + Number(cur.valor || 0), 0);
			const comprasLiquidas = Math.max(0, totalCompras - totalEstornos);

			// Acordos/Renegociações vinculados ao cartão
			let totalAcordo = 0;
			const acordosList: string[] = [];
			rawDividas.forEach((d: any) => {
				const dDesc = (d.descricao || "").toLowerCase();
				const dInst = (d.instituicao || "").toLowerCase();
				const isCardAgreement = d.cartao_id === c.id ||
					(cNome.includes("8282") && (dDesc.includes("8282") || dDesc.includes("renegocia"))) ||
					(cNome.includes("santander") && dDesc.includes("renegocia") && (dInst.includes("santander") || dDesc.includes("santander")));

				if (isCardAgreement) {
					dividasCartaoIds.add(d.id);
					(d.parcelas_divida || []).forEach((p: any) => {
						if (isSameMonthYear(p.data_vencimento, targetYear, targetMonth)) {
							const val = Number(p.valor_esperado || p.valor || 0);
							totalAcordo += val;
							acordosList.push(`${d.descricao} (${p.numero_parcela || 1}/${(d.parcelas_divida || []).length}): R$ ${val.toFixed(2)}`);
						}
					});
				}
			});

			const totalCartao = comprasLiquidas + totalAcordo;
			if (totalCartao > 0) {
				totalFaturas += totalCartao;
				const diaVenc = String(vencimentoDia).padStart(2, "0");
				const subTextParts: string[] = [];
				if (comprasCartao.length > 0) subTextParts.push(`${comprasCartao.length} compras (R$ ${comprasLiquidas.toFixed(2)})`);
				if (totalAcordo > 0) subTextParts.push(`Acordo: R$ ${totalAcordo.toFixed(2)}`);

				itensPrevistos.push({
					id: `fatura-${c.id}`,
					tipo: "fatura",
					titulo: `Fatura ${c.nome || "Cartão"}`,
					subtitulo: subTextParts.join(" • ") || "Fatura de cartão de crédito",
					dataVencimento: `${targetYear}-${String(targetMonth).padStart(2, '0')}-${diaVenc}`,
					valor: totalCartao,
					cor: c.cor_hex || "#8B5CF6"
				});
			}
		});

		// 2. DÍVIDAS / EMPRÉSTIMOS PREVISTOS
		let totalDividas = 0;
		rawDividas.forEach((d: any) => {
			if (dividasCartaoIds.has(d.id)) return;
			const dDesc = (d.descricao || "").toLowerCase();
			if (dDesc.includes("renegocia") && dDesc.includes("cart")) return;

			(d.parcelas_divida || []).forEach((p: any) => {
				if (isSameMonthYear(p.data_vencimento, targetYear, targetMonth) && p.status !== "paga") {
					const val = Number(p.valor_esperado || p.valor || 0);
					totalDividas += val;
					itensPrevistos.push({
						id: `divida-${d.id}-${p.numero_parcela}`,
						tipo: "divida",
						titulo: d.descricao || "Empréstimo / Dívida",
						subtitulo: `Parcela ${p.numero_parcela || 1}/${d.quantidade_parcelas || (d.parcelas_divida || []).length || 1} • ${d.instituicao || "Instituição"}`,
						dataVencimento: p.data_vencimento,
						valor: val,
						cor: "#F97316"
					});
				}
			});
		});

		// 3. MÉDIA VARIÁVEL HISTÓRICA
		const gastosVariaveis = rawGastos.filter(g => g.metodo_pagamento !== "Crédito" && g.considerar_soma !== false);
		const mensalVariavel: { [key: number]: number } = {};
		gastosVariaveis.forEach(g => {
			const m = new Date(g.data + "T12:00:00").getMonth();
			mensalVariavel[m] = (mensalVariavel[m] || 0) + Number(g.valor || 0);
		});
		const values = Object.values(mensalVariavel);
		const mediaVariavelRaw = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
		const mediaVariavel = Math.round(mediaVariavelRaw * 100) / 100;

		const totalPrevisao = Math.round((totalFaturas + totalDividas + mediaVariavel) * 100) / 100;

		// Ordena os itens previstos pela data de vencimento
		itensPrevistos.sort((a, b) => (a.dataVencimento || "").localeCompare(b.dataVencimento || ""));

		return {
			mesNome: NOME_MESES[targetMonth - 1],
			totalPrevisao,
			totalParcelasProxMes: Math.round(totalFaturas * 100) / 100,
			totalDividasProxMes: Math.round(totalDividas * 100) / 100,
			mediaVariavel,
			itensPrevistos
		};
	}, [rawGastos, rawEstornos, rawDividas, cartoes, filterYear, filterMonth]);

	const upcomingPayments = useMemo(() => {
		const reminders: any[] = [];
		const today = new Date();
		const in7Days = new Date(today);
		in7Days.setDate(today.getDate() + 7);
		const todayStr = today.toISOString().split("T")[0];
		const limitStr = in7Days.toISOString().split("T")[0];

		rawDividas.filter(d => d.status !== "quitada" && d.vencimento_parcela >= todayStr && d.vencimento_parcela <= limitStr).forEach(d => {
			reminders.push({ type: "divida", title: `Dívida: ${d.descricao}`, date: d.vencimento_parcela, amount: Number(d.valor_total) / Number(d.parcelas) });
		});

		rawFaturasNaoPagas.forEach(f => {
			if (f.cartao) {
				const day = String(f.cartao.dia_vencimento).padStart(2, "0");
				const vDate = `${f.mesReferencia}-${day}`;
				if (vDate >= todayStr && vDate <= limitStr) {
					reminders.push({ type: "fatura", title: `Fatura: ${f.cartao.nome}`, date: vDate, amount: f.pendente });
				}
			}
		});
		return reminders.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
	}, [rawDividas, rawFaturasNaoPagas]);

	const handleCobrarWhatsApp = (devedor: any) => {
		const telefone = devedor.contato?.telefone?.replace(/\D/g, "");
		if (!telefone || telefone.length < 10) return toast.error("Telefone inválido.");
		const itensText = devedor.itens.filter((i: any) => !i.terceiro_pago).map((i: any) => `• ${i.descricao}: R$ ${Number(i.valor).toFixed(2)}`).join("%0A");
		const msg = `Olá, ${devedor.contato.nome}! Tudo bem?%0A%0ASegue o demonstrativo dos valores em aberto:%0A%0A${itensText}%0A%0A*Total:* R$ ${Number(devedor.total_devido).toFixed(2)}%0A%0AQuando puder realizar o acerto, me envie o comprovante. Muito obrigado!`;
		window.open(`https://wa.me/${telefone}?text=${msg}`, "_blank");
	};

	const isPjEntrada = (e: any) => {
		const cat = (e.categoria || "").toLowerCase();
		const desc = (e.descricao || "").toLowerCase();
		const conta = (e.contas_bancarias?.nome || "").toLowerCase();
		const contaTipo = (e.contas_bancarias?.tipo || "").toLowerCase();
		return (
			contaTipo.includes("pj") || contaTipo.includes("juridica") || conta.includes("pj") || conta.includes("mei") || conta.includes("empresa") ||
			cat.includes("pj") || cat.includes("mei") || cat.includes("serviço") || cat.includes("venda") || cat.includes("faturamento") || cat.includes("empresa") ||
			desc.includes("nota fiscal") || desc.includes("nf-e") || desc.includes("cliente") || desc.includes("prestação")
		);
	};

	const isPjGasto = (g: any) => {
		const cat = (g.categoria || "").toLowerCase();
		const desc = (g.descricao || "").toLowerCase();
		const conta = (g.contas_bancarias?.nome || "").toLowerCase();
		const contaTipo = (g.contas_bancarias?.tipo || "").toLowerCase();
		return (
			contaTipo.includes("pj") || contaTipo.includes("juridica") || conta.includes("pj") || conta.includes("mei") || conta.includes("empresa") ||
			cat.includes("das") || cat.includes("imposto") || cat.includes("tributo") || cat.includes("fornecedor") || cat.includes("empresa") || cat.includes("pj") ||
			desc.includes("das-mei") || desc.includes("das ") || desc.includes("simples nacional") || desc.includes("contador") || desc.includes("contabilidade")
		);
	};

	const totalAReceberSplit = useMemo(() => {
		return devedores.reduce((acc, d) => acc + (Number(d.total_devido) > 0 ? Number(d.total_devido) : 0), 0);
	}, [devedores]);

	const totalAPagarSplit = useMemo(() => {
		return credores.reduce((acc, c) => acc + (Number(c.total_devido) > 0 ? Number(c.total_devido) : 0), 0);
	}, [credores]);

	const saldoLiquidoSplit = totalAReceberSplit - totalAPagarSplit;

	const dadosPJ = useMemo(() => {
		const LIMITE_MEI_ANUAL = 81000;
		const TETO_MENSAL_MEI = 6750;

		const entradasAnoPJ = rawEntradas.filter(e => isPjEntrada(e));
		const totalFaturadoAno = entradasAnoPJ.reduce((acc, e) => acc + Number(e.valor || 0), 0);
		const percentualUsoMei = Math.min(100, (totalFaturadoAno / LIMITE_MEI_ANUAL) * 100);
		const margemDisponivelMei = Math.max(0, LIMITE_MEI_ANUAL - totalFaturadoAno);

		const mesAtualNum = new Date().getMonth() + 1;
		const mesRef = filterMonth !== "all" ? String(filterMonth).padStart(2, '0') : String(mesAtualNum).padStart(2, '0');
		const prefixMes = `${filterYear}-${mesRef}`;

		const entradasMesPJ = rawEntradas.filter(e => isPjEntrada(e) && e.data?.startsWith(prefixMes));
		const gastosMesPJ = rawGastos.filter(g => isPjGasto(g) && g.data?.startsWith(prefixMes));

		const totalReceitasMesPJ = entradasMesPJ.reduce((acc, e) => acc + Number(e.valor || 0), 0);
		const totalDespesasMesPJ = gastosMesPJ.reduce((acc, g) => acc + Number(g.valor || 0), 0);
		const lucroLiquidoMesPJ = totalReceitasMesPJ - totalDespesasMesPJ;

		const dasPagoNoMes = rawGastos.some(g => {
			if (!g.data?.startsWith(prefixMes)) return false;
			const cat = (g.categoria || "").toLowerCase();
			const desc = (g.descricao || "").toLowerCase();
			return cat.includes("das") || cat.includes("simples") || desc.includes("das-mei") || desc.includes("das ") || desc.includes("simples nacional");
		});

		const contasPJ = contasBancarias.filter(c => {
			const cNome = (c.nome || "").toLowerCase();
			const cTipo = (c.tipo || "").toLowerCase();
			const cInst = (c.instituicao || "").toLowerCase();
			return cNome.includes("pj") || cNome.includes("empresa") || cNome.includes("mei") || cTipo.includes("pj") || cTipo.includes("juridica") || cInst.includes("pj");
		});

		const saldoContasPJ = contasPJ.reduce((acc, c) => acc + Number(c.saldo_inicial || 0), 0);

		return {
			LIMITE_MEI_ANUAL,
			TETO_MENSAL_MEI,
			totalFaturadoAno,
			percentualUsoMei,
			margemDisponivelMei,
			mediaMensalFaturada: totalFaturadoAno / (mesAtualNum || 1),
			totalReceitasMesPJ,
			totalDespesasMesPJ,
			lucroLiquidoMesPJ,
			dasPagoNoMes,
			contasPJ,
			saldoContasPJ,
			mesNome: NOME_MESES[parseInt(mesRef, 10) - 1],
			lancamentosPJ: [...entradasMesPJ, ...gastosMesPJ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
		};
	}, [rawEntradas, rawGastos, contasBancarias, filterYear, filterMonth]);

	if (isFetchingData) {
		return (
			<div className="h-[80vh] flex flex-col items-center justify-center space-y-4">
				<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
				<p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Carregando painel...</p>
			</div>
		);
	}

	const devedoresAtivos = devedores.filter(d => d.total_devido > 0);

	return (
		<motion.div className="space-y-6 sm:space-y-8 pb-20" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { staggerChildren: 0.05 } }}>
			{qtdSemConta > 0 && (
				<button
					onClick={() => setListaSemContaAberta(true)}
					className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 text-left cursor-pointer hover:bg-amber-100/70 dark:hover:bg-amber-950/50 transition-colors">
					<span className="flex items-center gap-2.5 text-sm font-bold text-amber-900 dark:text-amber-200">
						<AlertCircle size={17} className="shrink-0" />
						{qtdSemConta} {qtdSemConta === 1 ? "lançamento está" : "lançamentos estão"} sem conta — o saldo pode estar diferente do banco.
					</span>
					<span className="text-xs font-black text-amber-800 dark:text-amber-300 whitespace-nowrap">Corrigir →</span>
				</button>
			)}

			{/* 1. SAUDAÇÃO */}
			<div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
				<h2 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
					<span>{getGreeting()}, {nome}!</span>
					<span className="animate-bounce">👋</span>
				</h2>
			</div>

			{/* 3 CAMINHOS DA HOME: MINHAS FINANÇAS | FINANÇAS ENTRE PESSOAS (COMPARTILHADAS) | FINANÇAS PJ */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
				{/* CAMINHO 1: MINHAS FINANÇAS (PESSOAL) */}
				<button
					type="button"
					onClick={() => handleMudarCaminho("PESSOAL")}
					className={`group text-left p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
						caminhoAtivo === "PESSOAL"
							? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-500/20 border-indigo-500 ring-2 ring-indigo-400/40"
							: "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-800 text-slate-800 dark:text-slate-100 shadow-2xs"
					}`}
				>
					<div className="flex items-center justify-between mb-3">
						<div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${
							caminhoAtivo === "PESSOAL"
								? "bg-white/20 text-white"
								: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
						}`}>
							<Wallet size={22} />
						</div>
						<span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
							caminhoAtivo === "PESSOAL"
								? "bg-white/25 text-white"
								: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
						}`}>
							Pessoa Física
						</span>
					</div>
					<h3 className={`text-base sm:text-lg font-black tracking-tight ${caminhoAtivo === "PESSOAL" ? "text-white" : "text-slate-800 dark:text-slate-100"}`}>
						Minhas Finanças
					</h3>
					<p className={`text-xs mt-0.5 ${caminhoAtivo === "PESSOAL" ? "text-indigo-100" : "text-slate-400 dark:text-slate-500"}`}>
						Fluxo pessoal, cartões e patrimônio
					</p>
					<div className={`mt-3.5 pt-3 border-t flex items-center justify-between ${caminhoAtivo === "PESSOAL" ? "border-white/15" : "border-slate-100 dark:border-slate-800"}`}>
						<span className={`text-[11px] font-bold ${caminhoAtivo === "PESSOAL" ? "text-indigo-100" : "text-slate-400"}`}>
							Saldo Consolidado
						</span>
						<span className={`text-xs font-black ${caminhoAtivo === "PESSOAL" ? "text-white" : "text-indigo-600 dark:text-indigo-400"}`}>
							{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.saldoTotal)}
						</span>
					</div>
				</button>

				{/* CAMINHO 2: FINANÇAS ENTRE PESSOAS (COMPARTILHADAS) */}
				<button
					type="button"
					onClick={() => handleMudarCaminho("COMPARTILHADO")}
					className={`group text-left p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
						caminhoAtivo === "COMPARTILHADO"
							? "bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-lg shadow-purple-500/20 border-purple-500 ring-2 ring-purple-400/40"
							: "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-800 text-slate-800 dark:text-slate-100 shadow-2xs"
					}`}
				>
					<div className="flex items-center justify-between mb-3">
						<div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${
							caminhoAtivo === "COMPARTILHADO"
								? "bg-white/20 text-white"
								: "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400"
						}`}>
							<Users size={22} />
						</div>
						<div className="flex items-center gap-1.5">
							
							<span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
								caminhoAtivo === "COMPARTILHADO"
									? "bg-white/25 text-white"
									: "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400"
							}`}>
								Contas Compartilhadas
							</span>
						</div>
					</div>
					<h3 className={`text-base sm:text-lg font-black tracking-tight ${caminhoAtivo === "COMPARTILHADO" ? "text-white" : "text-slate-800 dark:text-slate-100"}`}>
						Finanças entre Pessoas
					</h3>
					<p className={`text-xs mt-0.5 ${caminhoAtivo === "COMPARTILHADO" ? "text-purple-100" : "text-slate-400 dark:text-slate-500"}`}>
						Divisão de contas, amigos e devedores
					</p>
					<div className={`mt-3.5 pt-3 border-t flex items-center justify-between ${caminhoAtivo === "COMPARTILHADO" ? "border-white/15" : "border-slate-100 dark:border-slate-800"}`}>
						<span className={`text-[11px] font-bold ${caminhoAtivo === "COMPARTILHADO" ? "text-purple-100" : "text-slate-400"}`}>
							{saldoLiquidoSplit >= 0 ? "Saldo a Receber" : "Saldo a Pagar"}
						</span>
						<span className={`text-xs font-black ${
							caminhoAtivo === "COMPARTILHADO"
								? "text-white"
								: saldoLiquidoSplit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
						}`}>
							{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(saldoLiquidoSplit))}
						</span>
					</div>
				</button>

				{/* CAMINHO 3: FINANÇAS DO PJ (MEI & NEGÓCIO) */}
				<button
					type="button"
					onClick={() => handleMudarCaminho("PJ")}
					className={`group text-left p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
						caminhoAtivo === "PJ"
							? "bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-500/20 border-emerald-500 ring-2 ring-emerald-400/40"
							: "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-800 text-slate-800 dark:text-slate-100 shadow-2xs"
					}`}
				>
					<div className="flex items-center justify-between mb-3">
						<div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${
							caminhoAtivo === "PJ"
								? "bg-white/20 text-white"
								: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
						}`}>
							<Briefcase size={22} />
						</div>
						<div className="flex items-center gap-1.5">
							
							<span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
								caminhoAtivo === "PJ"
									? "bg-white/25 text-white"
									: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
							}`}>
								Pessoa Jurídica
							</span>
						</div>
					</div>
					<h3 className={`text-base sm:text-lg font-black tracking-tight ${caminhoAtivo === "PJ" ? "text-white" : "text-slate-800 dark:text-slate-100"}`}>
						Finanças do PJ & MEI
					</h3>
					<p className={`text-xs mt-0.5 ${caminhoAtivo === "PJ" ? "text-emerald-100" : "text-slate-400 dark:text-slate-500"}`}>
						Faturamento, teto fiscal e DAS-MEI
					</p>
					<div className={`mt-3.5 pt-3 border-t flex items-center justify-between ${caminhoAtivo === "PJ" ? "border-white/15" : "border-slate-100 dark:border-slate-800"}`}>
						<span className={`text-[11px] font-bold ${caminhoAtivo === "PJ" ? "text-emerald-100" : "text-slate-400"}`}>
							Limite Anual MEI
						</span>
						<span className={`text-xs font-black ${caminhoAtivo === "PJ" ? "text-white" : "text-emerald-600 dark:text-emerald-400"}`}>
							{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dadosPJ.LIMITE_MEI_ANUAL)}
						</span>
					</div>
				</button>
			</div>
			
			{caminhoAtivo === "PESSOAL" ? (
				<>
					<div className="flex flex-col gap-4">
				<div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 w-full">
					<button onClick={() => navigate("/gastos?add=true")} className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-sm sm:text-xs shadow-sm transition-all cursor-pointer">
						<TrendingDown size={16} className="sm:w-3.5 sm:h-3.5" /> <span>Nova Despesa</span>
					</button>
					<button onClick={() => navigate("/entradas?add=true")} className="col-span-1 flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm sm:text-xs shadow-sm transition-all cursor-pointer">
						<TrendingUp size={16} className="sm:w-3.5 sm:h-3.5" /> <span>Nova Receita</span>
					</button>
					<button onClick={() => navigate("/dividas?add=true")} className="col-span-1 flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-bold text-sm sm:text-xs shadow-sm transition-all cursor-pointer">
						<HandCoins size={16} className="sm:w-3.5 sm:h-3.5" /> <span>Novo Passivo</span>
					</button>
				</div>
			</div>

			{/* 2 E 3. LEMBRETES E ÚLTIMO LANÇAMENTO (LADO A LADO) */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* 2. LEMBRETES DE PAGAMENTOS PRÓXIMOS */}
				{upcomingPayments.length > 0 ? (
					<motion.div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 p-5 rounded-xl shadow-sm flex flex-col gap-4 justify-center">
						<div className="flex items-center gap-3">
							<div className="p-3 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-xl">
								<Bell size={20} className="animate-pulse" />
							</div>
							<div>
								<h4 className="font-extrabold text-amber-900 dark:text-amber-300 text-sm">Lembretes de Vencimento</h4>
								<p className="text-amber-700/80 dark:text-amber-400/80 text-xs font-semibold">Você tem {upcomingPayments.length} pagamento(s) para os próximos 7 dias.</p>
							</div>
						</div>
						<div className="flex flex-col gap-2 w-full max-h-32 overflow-y-auto pr-1 custom-scrollbar">
							{upcomingPayments.map((pay, i) => (
								<div key={i} className="flex justify-between items-center bg-white dark:bg-slate-900 px-4 py-2 rounded-lg border border-amber-100 dark:border-slate-800 text-xs shadow-sm gap-4">
									<span className="font-bold text-slate-700 dark:text-slate-300 truncate max-w-[150px]">{pay.title}</span>
									<div className="text-right shrink-0">
										<span className="text-slate-500 dark:text-slate-400 mr-2">{pay.date.includes("undefined") ? pay.date.replace("undefined", "01").split("-").reverse().join("/") : pay.date.split("-").reverse().join("/")}</span>
										<span className="font-black text-rose-500 dark:text-rose-400">R$ {pay.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
									</div>
								</div>
							))}
						</div>
					</motion.div>
				) : (
					<motion.div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 p-5 rounded-xl shadow-sm flex items-center gap-4 justify-center">
						<div className="p-3 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
							<Bell size={20} />
						</div>
						<div>
							<h4 className="font-extrabold text-emerald-900 dark:text-emerald-300 text-sm">Tudo em dia!</h4>
							<p className="text-emerald-700/80 dark:text-emerald-400/80 text-xs font-semibold">Nenhum vencimento previsto para os próximos 7 dias.</p>
						</div>
					</motion.div>
				)}

				{/* 3. ÚLTIMO LANÇAMENTO REGISTRADO */}
				{(!hasLaunchesThisMonth && hoje.getDate() >= 20) ? (
					<motion.div className="flex flex-col items-start justify-center gap-4 p-5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 shadow-sm">
						<div className="flex items-center gap-3.5">
							<div className="p-3 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-xl"><AlertCircle size={20} className="animate-pulse" /></div>
							<div>
								<p className="font-extrabold text-amber-900 dark:text-amber-300 text-sm">Nenhum lançamento realizado neste mês!</p>
								<p className="text-amber-700/80 dark:text-amber-400/80 text-xs font-semibold mt-1">
									Seu último lançamento foi em <strong className="text-amber-900 dark:text-amber-200">{lastLaunchDate?.split("-").reverse().join("/") || "N/A"}</strong>.
								</p>
							</div>
						</div>
					</motion.div>
				) : (
					<motion.div className="flex items-center gap-3.5 p-5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100/60 dark:border-indigo-900/20 shadow-sm h-full">
						<div className="p-3 bg-indigo-100/60 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl"><Calendar size={20} /></div>
						<div>
							<p className="text-xs font-bold text-slate-400 dark:text-slate-500">{lastLaunchDate ? "Última atividade registrada" : "Status dos lançamentos"}</p>
							<p className="text-sm font-black text-slate-700 dark:text-slate-200 mt-1">
								{lastLaunchDate ? `Seu último lançamento foi em ${lastLaunchDate.split("-").reverse().join("/")}.` : "Nenhum lançamento cadastrado no sistema."}
							</p>
						</div>
					</motion.div>
				)}
			</div>

			{/* 4. FILTROS & RESUMO CONSOLIDADO */}
			<div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 w-full">
				<div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
					<Sparkles size={18} className="text-indigo-500" />
					<h3 className="text-sm font-black uppercase tracking-widest">Resumo Consolidado</h3>
				</div>
				
				<div className="flex flex-col sm:flex-row justify-end gap-3 w-full md:w-auto">
					<div className="relative w-full sm:w-auto">
						<select value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))} className="w-full pr-8 pl-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer appearance-none outline-none focus:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm">
							{[hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
						</select>
						<ChevronDown size={12} className="absolute inset-y-0 right-3 my-auto text-slate-400 pointer-events-none" />
					</div>
					<div className="relative w-full sm:w-auto">
						<select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value === "all" ? "all" : Number(e.target.value))} className="w-full pr-8 pl-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer appearance-none outline-none focus:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm">
							<option value="all">Ano Todo</option>
							{NOME_MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
						</select>
						<ChevronDown size={12} className="absolute inset-y-0 right-3 my-auto text-slate-400 pointer-events-none" />
					</div>
					<div className="relative w-full sm:w-auto">
						<select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="w-full pr-8 pl-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer appearance-none outline-none focus:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm">
							<option value="all">Visão Geral</option>
							<option value="entradas">Só Entradas</option>
							<option value="gastos">Só Gastos</option>
							<option value="cartoes">Só Cartões</option>
							<option value="investimentos">Só Investimentos</option>
							<option value="dividas">Só Dívidas</option>
						</select>
						<ChevronDown size={12} className="absolute inset-y-0 right-3 my-auto text-slate-400 pointer-events-none" />
					</div>
					<ExportExcelButton />
				</div>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				<motion.div className={`bg-gradient-to-br ${saldoFiltrado >= 0 ? "from-indigo-900 via-slate-900 to-indigo-950" : "from-rose-950 via-slate-900 to-rose-900"} p-6 sm:p-8 rounded-xl shadow-xl text-white relative overflow-hidden flex flex-col justify-between md:col-span-2 lg:col-span-1`}>
					<Wallet size={120} className="absolute -top-4 -right-4 p-4 opacity-[0.03] pointer-events-none" />
					<div>
						<p className="text-indigo-300 dark:text-indigo-400 font-bold uppercase tracking-wider text-xs mb-3">{filterMonth === "all" ? "Saldo Anual Consolidado" : "Saldo do Período"}</p>
						<h3 className="text-4xl sm:text-5xl font-black mb-1 flex items-baseline"><span className="text-indigo-500 text-2xl font-bold mr-1.5 opacity-80">R$</span><span>{saldoFiltrado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></h3>
					</div>
				</motion.div>
				{(filterCategory === "all" || filterCategory === "entradas") && <MetricCard title="Entradas (Período)" value={dashboardData.totaisMes.entradas} icon={<TrendingUp size={24} className="text-emerald-600 dark:text-emerald-400" />} bgClass="bg-emerald-50 dark:bg-emerald-950/30" colorClass="text-emerald-600 dark:text-emerald-400" borderClass="bg-emerald-500" />}
				{(filterCategory === "all" || filterCategory === "gastos") && <MetricCard title="Gastos (Período)" value={dashboardData.totaisMes.gastos} icon={<TrendingDown size={24} className="text-rose-600 dark:text-rose-400" />} bgClass="bg-rose-50 dark:bg-rose-950/30" colorClass="text-rose-600 dark:text-rose-400" borderClass="bg-rose-500" />}
				{filterCategory === "cartoes" && <MetricCard title="Faturas (Período)" value={dashboardData.totaisMes.faturas} icon={<CreditCard size={24} className="text-purple-600 dark:text-purple-400" />} bgClass="bg-purple-50 dark:bg-purple-950/30" colorClass="text-purple-600 dark:text-purple-400" borderClass="bg-purple-500" />}
				{filterCategory === "investimentos" && <MetricCard title="Investimentos (Período)" value={dashboardData.totaisMes.investimentos} icon={<TrendingUp size={24} className="text-blue-600 dark:text-blue-400" />} bgClass="bg-blue-50 dark:bg-blue-950/30" colorClass="text-blue-600 dark:text-blue-400" borderClass="bg-blue-500" />}
				{filterCategory === "dividas" && <MetricCard title="Dívidas (Período)" value={dashboardData.totaisMes.dividas} icon={<HandCoins size={24} className="text-orange-600 dark:text-orange-400" />} bgClass="bg-orange-50 dark:bg-orange-950/30" colorClass="text-orange-600 dark:text-orange-400" borderClass="bg-orange-500" />}
			</div>

			{/* 5. PREVISÃO E EVOLUÇÃO ANUAL */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<motion.div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm lg:col-span-1 flex flex-col justify-between">
						<div>
							<div className="flex justify-between items-center mb-3">
								<p className="text-purple-500 font-bold uppercase tracking-wider text-xs flex items-center gap-1.5">
									<Brain size={16} className="animate-pulse" /> Previsão de Gastos ({previsaoGastoProximoMes.mesNome})
								</p>
								{previsaoGastoProximoMes.itensPrevistos.length > 0 && (
									<button 
										type="button"
										onClick={() => setMostrarItensPrevistos(!mostrarItensPrevistos)}
										className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
									>
										{mostrarItensPrevistos ? "Ocultar" : `Ver itens (${previsaoGastoProximoMes.itensPrevistos.length})`}
										<ChevronDown size={14} className={`transition-transform duration-200 ${mostrarItensPrevistos ? "rotate-180" : ""}`} />
									</button>
								)}
							</div>

							<h3 className="text-3xl sm:text-4xl font-black text-slate-800 dark:text-slate-100 flex items-baseline mb-6">
								<span className="text-purple-500 text-xl mr-1.5 opacity-80">R$</span>
								<span>{previsaoGastoProximoMes.totalPrevisao.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
							</h3>

							<div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
								<div className="flex justify-between items-center">
									<span className="flex items-center gap-1.5"><CreditCard size={14} className="opacity-70 text-purple-500" /> Faturas Previstas</span>
									<span className="font-bold text-slate-800 dark:text-slate-100">R$ {previsaoGastoProximoMes.totalParcelasProxMes.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="flex items-center gap-1.5"><HandCoins size={14} className="opacity-70 text-orange-500" /> Dívidas Previstas</span>
									<span className="font-bold text-slate-800 dark:text-slate-100">R$ {previsaoGastoProximoMes.totalDividasProxMes.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="flex items-center gap-1.5"><TrendingDown size={14} className="opacity-70 text-rose-500" /> Média Variável</span>
									<span className="font-bold text-slate-800 dark:text-slate-100">R$ {previsaoGastoProximoMes.mediaVariavel.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
								</div>
							</div>

							{/* LISTA EXPANSÍVEL DOS ITENS PREVISTOS */}
							<AnimatePresence>
								{mostrarItensPrevistos && (
									<motion.div 
										initial={{ opacity: 0, height: 0 }}
										animate={{ opacity: 1, height: "auto" }}
										exit={{ opacity: 0, height: 0 }}
										className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5 overflow-hidden"
									>
										<p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Compromissos Previstos</p>
										<div className="max-h-56 overflow-y-auto space-y-2 custom-scrollbar pr-1">
											{previsaoGastoProximoMes.itensPrevistos.map((item: any) => (
												<div key={item.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
													<div className="flex items-center gap-2 min-w-0 pr-2">
														<div className={`p-1.5 rounded-lg shrink-0 ${item.tipo === "fatura" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"}`}>
															{item.tipo === "fatura" ? <CreditCard size={13} /> : <HandCoins size={13} />}
														</div>
														<div className="min-w-0 truncate">
															<p className="font-black text-slate-800 dark:text-slate-200 truncate">{item.titulo}</p>
															<p className="text-[10px] text-slate-400 truncate font-medium">
																{item.subtitulo} • Venc. {item.dataVencimento ? new Date(item.dataVencimento + "T12:00:00").toLocaleDateString("pt-BR") : "--"}
															</p>
														</div>
													</div>
													<span className="font-black text-slate-800 dark:text-slate-100 whitespace-nowrap shrink-0">
														R$ {item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
													</span>
												</div>
											))}
										</div>
									</motion.div>
								)}
							</AnimatePresence>
						</div>
					</motion.div>
				<motion.div className={`bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm ${filterCategory === "all" || filterCategory === "gastos" ? "lg:col-span-2" : "lg:col-span-3"}`}>
					<h3 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-6">Evolução Anual</h3>
					<div className="h-64 w-full">
						{isClient && (
							<ResponsiveContainer width="100%" height="100%">
								<BarChart data={dashboardData.dadosGrafico} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
									<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
									<XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} dy={5} />
									<YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} />
									<Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "12px", border: "none" }} formatter={(value: number) => [`R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, ""]} />
									<Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
									{(filterCategory === "all" || filterCategory === "entradas") && <Bar dataKey="entradas" name="Entradas" fill="#10B981" radius={[4, 4, 0, 0]} barSize={12} />}
									{(filterCategory === "all" || filterCategory === "gastos") && <Bar dataKey="gastos" name="Gastos/Faturas" fill="#F43F5E" radius={[4, 4, 0, 0]} barSize={12} />}
								</BarChart>
							</ResponsiveContainer>
						)}
					</div>
				</motion.div>
			</div>

			{/* 6. FATURAS & DEVEDORES */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
				{/* STATUS DOS CARTÕES */}
				{(filterCategory === "all" || filterCategory === "cartoes") && (
					<div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col h-full">
						<div className="flex items-center gap-2 mb-6">
							<CreditCard size={20} className="text-purple-500" />
							<h3 className="font-black text-slate-800 dark:text-slate-100 text-lg sm:text-xl">Status dos Cartões</h3>
						</div>
						<div className="space-y-4 flex-1">
							{cartoesResumo.length === 0 ? (
								<div className="text-center text-slate-400 dark:text-slate-500 py-10"><p className="font-bold text-sm">Nenhum cartão cadastrado</p></div>
							) : (
								cartoesResumo.map((res: any) => {
									return (
										<div key={res.cartao.id} className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col gap-3 transition-colors hover:border-slate-200 dark:hover:border-slate-700">
											<div className="flex justify-between items-center">
												<div className="flex flex-col">
													<p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm sm:text-base">{res.cartao.nome}</p>
													<p className="text-xs text-rose-500 dark:text-rose-400 font-bold mt-0.5">
														Fatura: R$ {res.totalFatura.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
													</p>
												</div>
												<button onClick={() => navigate(`/faturas/${res.cartao.id}`)} className="p-2 text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-lg transition-colors shadow-sm" title="Acessar Fatura">
													<ArrowRight size={16} />
												</button>
											</div>
											{res.cartao.limite > 0 && (
												<div className="mt-1">
													<div className="flex justify-between text-[11px] sm:text-xs mb-1.5">
														<span className="font-bold text-slate-500 dark:text-slate-400">
															L. Disp: <span className="text-emerald-600 dark:text-emerald-400">R$ {res.limiteDisponivel.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
														</span>
														<span className="font-bold text-slate-400">{Math.round(res.percentualUso)}% Usado</span>
													</div>
													<div className="h-1.5 sm:h-2 w-full bg-slate-200 dark:bg-slate-700/50 rounded-full overflow-hidden">
														<div className={`h-full transition-all duration-500 ${res.percentualUso > 90 ? 'bg-rose-500' : res.percentualUso > 75 ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, Math.max(0, res.percentualUso))}%` }} />
													</div>
												</div>
											)}
										</div>
									);
								})
							)}
						</div>
					</div>
				)}

				{devedoresAtivos.length > 0 && (
					<div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col">
						<div className="flex justify-between items-center mb-6">
							<h3 className="font-black text-slate-800 dark:text-slate-100 text-lg flex items-center gap-2"><Users className="text-pink-500" size={20} /> Devedores Ativos</h3>
							<button onClick={() => navigate("/devedores")} className="text-xs font-bold text-indigo-500 hover:underline">Ir para Devedores</button>
						</div>
						<div className="space-y-4 flex-1">
							{devedoresAtivos.map((devedor: any) => (
								<div key={devedor.contato.id} className="flex justify-between items-center p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
									<div>
										<p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm sm:text-base">{devedor.contato.nome}</p>
										<p className="text-xs font-medium text-slate-500 dark:text-slate-400">{devedor.contato.telefone || "Sem Telefone"}</p>
									</div>
									<div className="flex items-center gap-4">
										<div className="text-right">
											<p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Total</p>
											<p className="font-black text-rose-500 text-sm">R$ {devedor.total_devido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
										</div>
										<button onClick={() => handleCobrarWhatsApp(devedor)} className="p-2 sm:p-2.5 bg-[#25D366] hover:bg-[#20BD5A] transition-colors text-white rounded-xl shadow-sm"><Phone size={16} /></button>
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</div>

			{/* 7. DISTRIBUIÇÃO POR CATEGORIA (ORIGENS E DESTINOS) */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<CategoryBreakdown
					title="Origem das Entradas"
					icon={<TrendingUp className="text-emerald-500" size={18} />}
					data={entradaPieData}
					barClassName="bg-emerald-500"
				/>
				<CategoryBreakdown
					title="Destino dos Gastos"
					icon={<TrendingDown className="text-rose-500" size={18} />}
					data={gastoPieData}
					barClassName="bg-rose-500"
				/>
			</div>

			{/* 8. ÚLTIMOS LANÇAMENTOS */}
			<div className={`grid grid-cols-1 ${filterCategory === "all" ? "lg:grid-cols-2" : "lg:grid-cols-1"} gap-6`}>
				{(filterCategory === "all" || filterCategory === "entradas") && <RecentSection title="Últimas Entradas" items={dashboardData.recentes.entradas} colorClass="text-emerald-500 dark:text-emerald-400" bgIconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400" icon={<ArrowUpRight size={16} />} onMore={() => navigate("/entradas")} dateField="data" />}
				{(filterCategory === "all" || filterCategory === "gastos") && <RecentSection title="Últimos Gastos" items={dashboardData.recentes.gastos} colorClass="text-rose-500 dark:text-rose-400" bgIconClass="bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400" icon={<ArrowDownRight size={16} />} onMore={() => navigate("/gastos")} dateField="data" />}
				{filterCategory === "cartoes" && <RecentSection title="Últimos Pagtos Fatura" items={dashboardData.recentes.cartoes} colorClass="text-purple-500 dark:text-purple-400" bgIconClass="bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400" icon={<ArrowDownRight size={16} />} onMore={() => navigate("/cartoes")} dateField="data" />}
				{filterCategory === "investimentos" && <RecentSection title="Últimos Investimentos" items={dashboardData.recentes.investimentos} colorClass="text-blue-500 dark:text-blue-400" bgIconClass="bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400" icon={<TrendingUp size={16} />} onMore={() => navigate("/investimentos")} titleField="titulo" dateField={null} />}
				{filterCategory === "dividas" && <RecentSection title="Últimas Dívidas" items={dashboardData.recentes.dividas} colorClass="text-orange-500 dark:text-orange-400" bgIconClass="bg-orange-50 text-orange-600 dark:bg-orange-950/20 dark:text-orange-400" icon={<TrendingDown size={16} />} onMore={() => navigate("/dividas")} dateField="vencimento_parcela" />}
				</div>
				</>
			) : caminhoAtivo === "COMPARTILHADO" ? (
				/* ========================================================
				   CAMINHO 2: FINANÇAS ENTRE PESSOAS (DESPESAS COMPARTILHADAS)
				   ======================================================== */
				<motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 sm:space-y-8">
					{/* BANNER DESPESAS COMPARTILHADAS */}
					<div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-700 rounded-3xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
						<div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
							<div>
								<div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider mb-3">
									<Users size={14} /> Despesas Compartilhadas
								</div>
								<h2 className="text-2xl sm:text-3xl font-black tracking-tight">
									Finanças entre Amigos e Grupos
								</h2>
								<p className="text-purple-100 text-sm max-w-xl mt-1">
									Divida despesas de viagens, casa, casal e rolês. Rateio inteligente por partes iguais, valores exatos ou cotas com sincronização em tempo real.
								</p>
							</div>

							<div className="flex flex-wrap items-center gap-3">
								<button
									onClick={() => setIsAddSplitOpen(true)}
									className="flex items-center gap-2 bg-white text-purple-700 hover:bg-purple-50 px-5 py-3 rounded-2xl font-black text-sm shadow-md transition-all cursor-pointer whitespace-nowrap"
								>
									<Plus size={18} /> Dividir Nova Despesa
								</button>
								<button
									onClick={() => setIsCriarGrupoOpen(true)}
									className="flex items-center gap-2 bg-purple-500/30 hover:bg-purple-500/50 text-white border border-white/20 px-4 py-3 rounded-2xl font-bold text-sm backdrop-blur-md transition-all cursor-pointer whitespace-nowrap"
								>
									<Users size={18} /> Novo Grupo
								</button>
								<button
									onClick={() => setIsChatIaOpen(true)}
									className="flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-slate-900 px-4 py-3 rounded-2xl font-black text-sm shadow-md transition-all cursor-pointer whitespace-nowrap"
								>
									<Sparkles size={18} className="text-amber-700 animate-pulse" /> Assistente IA
								</button>
								<button
									onClick={() => navigate("/devedores")}
									className="flex items-center gap-2 bg-purple-900/40 hover:bg-purple-900/60 text-white px-4 py-3 rounded-2xl font-bold text-sm border border-white/20 transition-all cursor-pointer whitespace-nowrap"
								>
									Painel Completo <ArrowRight size={16} />
								</button>
							</div>
						</div>
					</div>

					{/* O que outras pessoas dividiram com você (some sozinho se não houver nada) */}
					<CompartilhadoComigo />

					{/* KPIS COMPARTILHADAS */}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
						<div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs flex items-center gap-4">
							<div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-500 shrink-0">
								<ArrowDownLeft size={24} />
							</div>
							<div className="min-w-0">
								<p className="text-slate-400 dark:text-slate-500 font-bold text-[10px] uppercase tracking-wider">
									Total a Receber
								</p>
								<h3 className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
									{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAReceberSplit)}
								</h3>
								<span className="text-[10px] text-slate-400 block mt-0.5">
									{devedores.filter(d => d.total_devido > 0).length} amigo(s) com valor pendente
								</span>
							</div>
						</div>

						<div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs flex items-center gap-4">
							<div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center text-rose-500 shrink-0">
								<ArrowUpRight size={24} />
							</div>
							<div className="min-w-0">
								<p className="text-slate-400 dark:text-slate-500 font-bold text-[10px] uppercase tracking-wider">
									Total a Pagar
								</p>
								<h3 className="text-xl sm:text-2xl font-black text-rose-500 mt-0.5 truncate">
									{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAPagarSplit)}
								</h3>
								<span className="text-[10px] text-slate-400 block mt-0.5">
									{credores.filter(c => c.total_devido > 0).length} amigo(s) a quem você deve
								</span>
							</div>
						</div>

						<div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs flex items-center gap-4">
							<div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
								<Users size={24} />
							</div>
							<div className="min-w-0">
								<p className="text-slate-400 dark:text-slate-500 font-bold text-[10px] uppercase tracking-wider">
									Saldo Líquido Geral
								</p>
								<h3 className={`text-xl sm:text-2xl font-black mt-0.5 truncate ${
									(totalAReceberSplit - totalAPagarSplit) >= 0 ? "text-purple-600 dark:text-purple-400" : "text-rose-500"
								}`}>
									{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAReceberSplit - totalAPagarSplit)}
								</h3>
								<span className="text-[10px] text-slate-400 block mt-0.5">
									{grupos.length} grupos cadastrados
								</span>
							</div>
						</div>
					</div>

					{/* GRUPOS ATIVOS & DEVEDORES (SPLIIT STYLE) */}
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						{/* SEÇÃO 1: SEUS GRUPOS (SPLIIT / TRICOUNT) */}
						<div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
							<div>
								<div className="flex justify-between items-center mb-6">
									<div>
										<h3 className="font-black text-slate-800 dark:text-slate-100 text-lg">
											Seus Grupos de Rateio
										</h3>
										<p className="text-xs text-slate-400">Viagens, república, eventos e compras conjuntas</p>
									</div>
									<button
										onClick={() => setIsCriarGrupoOpen(true)}
										className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
									>
										<Plus size={14} /> Novo Grupo
									</button>
								</div>

								{grupos.length === 0 ? (
									<div className="text-center py-10 px-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 space-y-3">
										<Users size={32} className="mx-auto text-purple-400" />
										<p className="text-xs font-bold text-slate-600 dark:text-slate-300">Nenhum grupo criado ainda.</p>
										<p className="text-[11px] text-slate-400 max-w-xs mx-auto">Crie um grupo para dividir as despesas de viagens, moradia ou churrasco!</p>
										<button
											onClick={() => setIsCriarGrupoOpen(true)}
											className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-colors cursor-pointer"
										>
											+ Criar Primeiro Grupo
										</button>
									</div>
								) : (
									<div className="space-y-3">
										{grupos.slice(0, 4).map(grupo => (
											<div
												key={grupo.id}
												onClick={() => navigate(`/devedores?grupo=${grupo.id}`)}
												className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:border-purple-300 transition-all cursor-pointer"
											>
												<div className="flex items-center gap-3">
													<div 
														className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black shrink-0"
														style={{ backgroundColor: grupo.cor_hex || "#8b5cf6" }}
													>
														<Users size={18} />
													</div>
													<div className="min-w-0">
														<h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">{grupo.nome}</h4>
														<p className="text-[10px] text-slate-400 truncate">
															{grupo.membros?.map(m => m.nome).join(", ") || "Sem membros"}
														</p>
													</div>
												</div>

												<span className="text-xs font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1">
													Abrir <ArrowRight size={12} />
												</span>
											</div>
										))}
									</div>
								)}
							</div>

							<div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
								<span className="text-xs text-slate-400 font-medium">Total de {grupos.length} grupo(s) ativos</span>
								<button
									onClick={() => navigate("/devedores")}
									className="text-xs font-bold text-purple-600 hover:underline cursor-pointer"
								>
									Ver todos os grupos →
								</button>
							</div>
						</div>

						{/* SEÇÃO 2: QUEM TE DEVE & ACERTOS PENDENTES */}
						<div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
							<div>
								<div className="flex justify-between items-center mb-6">
									<div>
										<h3 className="font-black text-slate-800 dark:text-slate-100 text-lg">
											Amigos com Acertos Pendentes
										</h3>
										<p className="text-xs text-slate-400">Cobrança rápida via WhatsApp e quitações</p>
									</div>
									<button
										onClick={() => navigate("/devedores")}
										className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
									>
										Ver todos
									</button>
								</div>

								{(devedores.length === 0 && credores.filter((c: any) => c.total_devido > 0).length === 0) ? (
									<div className="text-center py-10 px-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 space-y-2">
										<CheckCircle2 size={32} className="mx-auto text-emerald-500" />
										<p className="text-xs font-bold text-slate-700 dark:text-slate-300">Tudo em dia!</p>
										<p className="text-[11px] text-slate-400">Nenhum amigo possui saldo pendente ou a pagar no momento.</p>
									</div>
								) : (
									<div className="space-y-3">
										{/* Quem você deve (Credores / Acertos de compras conjuntas) */}
										{credores.filter((c: any) => c.total_devido > 0).slice(0, 3).map((c: any) => (
											<div
												key={c.contato.id}
												className="flex items-center justify-between p-3.5 rounded-2xl border border-rose-100 dark:border-rose-950/50 bg-rose-50/40 dark:bg-rose-950/20"
											>
												<div>
													<div className="flex items-center gap-2">
														<h4 className="font-bold text-xs text-slate-800 dark:text-slate-100">{c.contato.nome}</h4>
														<span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
															Você deve
														</span>
													</div>
													<p className="text-[10px] text-slate-400">{c.itens?.length || 1} despesa(s) em aberto</p>
												</div>

												<div className="flex items-center gap-3">
													<div className="text-right">
														<span className="text-[9px] font-bold uppercase text-slate-400 block">A Pagar</span>
														<span className="font-black text-xs text-rose-600 dark:text-rose-400">
															R$ {Number(c.total_devido).toFixed(2)}
														</span>
													</div>
													<button
														onClick={() => navigate("/devedores?tab=amigos")}
														className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[11px] font-bold shadow-xs transition-colors cursor-pointer"
														title="Ver detalhes e quitar"
													>
														Quitar
													</button>
												</div>
											</div>
										))}

										{/* Quem te deve (Devedores) */}
										{devedores.slice(0, 3).map((d: any) => (
											<div
												key={d.contato.id}
												className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
											>
												<div>
													<div className="flex items-center gap-2">
														<h4 className="font-bold text-xs text-slate-800 dark:text-slate-100">{d.contato.nome}</h4>
														<span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
															Te deve
														</span>
													</div>
													<p className="text-[10px] text-slate-400">{d.contato.telefone || "Sem telefone"}</p>
												</div>

												<div className="flex items-center gap-3">
													<div className="text-right">
														<span className="text-[9px] font-bold uppercase text-slate-400 block">Pendente</span>
														<span className="font-black text-xs text-emerald-600 dark:text-emerald-400">
															R$ {Number(d.total_devido).toFixed(2)}
														</span>
													</div>
													<button
														onClick={() => handleCobrarWhatsApp(d)}
														className="p-2 bg-[#25D366] hover:bg-[#20BD5A] text-white rounded-xl shadow-xs transition-colors cursor-pointer"
														title="Cobrar no WhatsApp"
													>
														<Phone size={14} />
													</button>
												</div>
											</div>
										))}
									</div>
								)}
							</div>

							<div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
								<button
									onClick={() => setIsAddContatoOpen(true)}
									className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
								>
									<UserCheck size={14} /> Convidar novo amigo
								</button>
								<button
									onClick={() => navigate("/devedores")}
									className="text-xs font-bold text-purple-600 hover:underline cursor-pointer"
								>
									Painel de Acertos →
								</button>
							</div>
						</div>
					</div>
				</motion.div>
			) : (
				<EmBreveView modulo="PJ" onVoltarPessoal={() => handleMudarCaminho("PESSOAL")} />
			)}

			{/* MODAL DE DIVIDIR DESPESA */}
			<AddSplitDespesaModal 
				isOpen={isAddSplitOpen}
				onClose={() => setIsAddSplitOpen(false)}
				onSuccess={() => {
					setIsAddSplitOpen(false);
					loadDashboardData();
					toast.success("Despesa dividida com sucesso!");
				}}
				onOpenAddContato={() => {
					setIsAddSplitOpen(false);
					setIsAddContatoOpen(true);
				}}
				onOpenCriarGrupo={() => {
					setIsAddSplitOpen(false);
					setIsCriarGrupoOpen(true);
				}}
			/>

			{/* MODAL DE ADICIONAR CONTATO */}
			{isAddContatoOpen && (
				<AddContatoWeb 
					onClose={() => setIsAddContatoOpen(false)}
					onSuccess={() => {
						setIsAddContatoOpen(false);
						loadDashboardData();
						setIsAddSplitOpen(true);
					}}
				/>
			)}

			{/* MODAL DE CONVITE DE AMIGO */}
			<ConviteAmigoModal 
				isOpen={Boolean(contatoParaConvite)}
				onClose={() => setContatoParaConvite(null)}
				contato={contatoParaConvite}
				userName={nome}
			/>

			{/* MODAL DE CHAT IA DE ACORDOS  */}
			<ChatAcordosIaModal 
				isOpen={isChatIaOpen}
				onClose={() => setIsChatIaOpen(false)}
				onSuccess={() => {
					setIsChatIaOpen(false);
					loadDashboardData();
				}}
				userId={userId}
				contatosDisponiveis={contatos}
				grupos={grupos}
			/>

			{/* MODAL DE CRIAR GRUPO */}
			<CriarGrupoModal
				isOpen={isCriarGrupoOpen}
				onClose={() => setIsCriarGrupoOpen(false)}
				onSuccess={() => {
					setIsCriarGrupoOpen(false);
					loadDashboardData();
				}}
				userId={userId}
				userName={nome}
				contatosDisponiveis={contatos}
			/>

			{/* MODALS */}
			<OnboardingContasModal 
				isOpen={showOnboarding} 
				userId={userId} 
				onComplete={() => {
					setShowOnboarding(false);
					loadDashboardData();
				}} 
			/>

			<MeiOnboardingModal 
				isOpen={showMeiModal}
				userId={userId}
				onClose={() => setShowMeiModal(false)}
				onComplete={(escolha) => {
					setAcompanhaMei(escolha);
					setShowMeiModal(false);
				}}
			/>

			<AnimatePresence>
				{showOrphanAlert && !showOnboarding && (
					<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
						<motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-rose-100 dark:border-rose-900/30 text-center relative overflow-hidden">
							<div className="absolute top-0 left-0 w-full h-1 bg-rose-500"></div>
							<div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-5">
								<AlertCircle size={32} />
							</div>
							<h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-3">
								{qtdSemConta} {qtdSemConta === 1 ? "lançamento sem conta" : "lançamentos sem conta"}
							</h3>
							<p className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-relaxed">
								Para o saldo das suas contas ficar certo, diga de qual conta saiu (ou em qual entrou) cada um desses valores. Leva poucos cliques.
							</p>
							<button
								onClick={() => {
									adiarAvisoSemConta();
									setListaSemContaAberta(true);
								}}
								className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer">
								Ver e corrigir agora
							</button>
							<button onClick={adiarAvisoSemConta} className="w-full mt-2 py-2.5 px-4 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 rounded-xl font-bold text-sm cursor-pointer">
								Depois
							</button>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>

			<LancamentosSemContaModal
				isOpen={listaSemContaAberta}
				userId={userId}
				onClose={() => setListaSemContaAberta(false)}
				onAlterado={() => loadDashboardData()}
			/>
		</motion.div>
	);
}

function MetricCard({ title, value, icon, bgClass, colorClass, borderClass }: any) {
	return (
		<motion.div whileHover={{ y: -2 }} className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
			<div>
				<div className="flex items-center gap-3 mb-4"><div className={`p-3 rounded-xl ${bgClass} ${colorClass}`}>{icon}</div><p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-xs">{title}</p></div>
				<h3 className="text-3xl sm:text-4xl font-black text-slate-800 dark:text-slate-100 flex items-baseline"><span className="text-slate-400 dark:text-slate-600 text-xl font-bold mr-1.5 opacity-80">R$</span><span>{value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></h3>
			</div>
			<div className="h-1.5 w-full bg-slate-50 dark:bg-slate-800 rounded-full mt-6 overflow-hidden"><div className={`h-full ${borderClass} rounded-full`} style={{ width: "40%" }} /></div>
		</motion.div>
	);
}

function RecentSection({ title, items, colorClass, bgIconClass, icon, onMore, titleField = "descricao", dateField = "data" }: any) {
	return (
		<div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col h-full">
			<div className="flex justify-between items-center mb-6">
				<h3 className="font-black text-slate-800 dark:text-slate-100 text-lg sm:text-xl">{title}</h3>
				<button onClick={onMore} className="text-indigo-500 hover:underline text-xs sm:text-sm font-bold">Ver mais</button>
			</div>
			<div className="space-y-4 flex-1">
				{items.length === 0 ? (
					<div className="text-slate-400 dark:text-slate-500 italic text-sm text-center py-6 font-medium">Nenhum registro.</div>
				) : (
					items.map((item: any, i: number) => (
						<div key={i} className="flex justify-between items-center gap-4">
							<div className="flex items-center gap-4 flex-1 min-w-0">
								<div className={`p-3 rounded-xl shrink-0 ${bgIconClass}`}>{icon}</div>
								<div className="min-w-0 flex-1">
									<p className="font-extrabold text-slate-700 dark:text-slate-300 text-sm truncate">{item[titleField] || item.descricao}</p>
									{dateField && item[dateField] && <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">{new Date(item[dateField] + "T12:00:00").toLocaleDateString("pt-BR")}</p>}
								</div>
							</div>
							<p className={`font-black text-sm sm:text-base shrink-0 ${colorClass}`}>R$ {Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
						</div>
					))
				)}
			</div>
		</div>
	);
}
