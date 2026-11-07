import { useState, useEffect } from "react";
import { authService } from "../../../../../packages/services/auth.service";
import { financeService } from "../../../../../packages/services/finance.service";
import { getFaturaMesReferencia, getVencimentoDiaDoMes } from "../../../../../packages/utils/cartao.utils";
import { diaNoMes } from "../../../../../packages/utils/datas";
import { motion } from "framer-motion";
import { CreditCard as CreditCardIcon, Plus, Eye, ChevronRight, ShoppingBag, Edit3, AlertTriangle, Sparkles, Clock, Wifi } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import AddCartaoModal from "../../components/AddCartaoModal";
import EditCartaoModal from "../../components/EditCartaoModal";
import { AddGastoWeb } from "../../components/AddGastoWeb";
import { cartaoDaDivida } from "../../../../../packages/utils/dividas";
import { hojeISO } from "../../../../../packages/utils/datas";

const getCardBranding = (name: string) => {
	const lower = name.toLowerCase();
	if (lower.includes("nubank")) {
		return {
			color: "linear-gradient(135deg, #820ad1 0%, #5c089b 100%)",
			logo: (
				<span className="font-black text-xl tracking-tighter text-white select-none">
					nu<span className="text-pink-300">bank</span>
				</span>
			),
			accentColor: "#a78bfa"
		};
	}
	if (lower.includes("inter")) {
		return {
			color: "linear-gradient(135deg, #ff7a00 0%, #cc6200 100%)",
			logo: (
				<span className="font-extrabold text-xl tracking-wide text-white select-none">
					inter
				</span>
			),
			accentColor: "#fdba74"
		};
	}
	if (lower.includes("itau") || lower.includes("itaú")) {
		return {
			color: "linear-gradient(135deg, #ec7000 0%, #d56000 100%)",
			logo: (
				<span className="bg-[#003399] px-2 py-0.5 rounded font-black text-sm text-white select-none border border-white">
					Itaú
				</span>
			),
			accentColor: "#93c5fd"
		};
	}
	if (lower.includes("bradesco")) {
		return {
			color: "linear-gradient(135deg, #cc092f 0%, #99001a 100%)",
			logo: (
				<span className="font-black text-lg text-white tracking-tight select-none">
					bradesco
				</span>
			),
			accentColor: "#fca5a5"
		};
	}
	if (lower.includes("c6")) {
		return {
			color: "linear-gradient(135deg, #1e1e1e 0%, #000000 100%)",
			logo: (
				<span className="font-black text-xl tracking-tight text-white select-none">
					C<span className="text-amber-500">6</span> Bank
				</span>
			),
			accentColor: "#f59e0b"
		};
	}
	if (lower.includes("santander")) {
		return {
			color: "linear-gradient(135deg, #cc092f 0%, #a30018 100%)",
			logo: (
				<span className="font-black text-lg text-white tracking-tight select-none">
					Santander
				</span>
			),
			accentColor: "#fca5a5"
		};
	}
	if (lower.includes("brasil") || lower.includes("bb")) {
		return {
			color: "linear-gradient(135deg, #005ca9 0%, #003663 100%)",
			logo: (
				<span className="font-black text-lg text-white tracking-tight select-none">
					BB <span className="text-yellow-400">Ourocard</span>
				</span>
			),
			accentColor: "#fde047"
		};
	}
	if (lower.includes("caixa")) {
		return {
			color: "linear-gradient(135deg, #005ca9 0%, #00457c 100%)",
			logo: (
				<span className="font-black text-lg text-white tracking-tight select-none">
					<span className="text-orange-500 font-extrabold">X</span> CAIXA
				</span>
			),
			accentColor: "#f97316"
		};
	}
	return {
		color: "linear-gradient(135deg, #4f46e5 0%, #312e81 100%)",
		logo: (
			<span className="font-black text-lg text-white tracking-tight select-none">
				CARTÃO
			</span>
		),
		accentColor: "#818cf8"
	};
};

function EmvChip() {
	return (
		<div className="flex items-center gap-2">
			{/* Micro Chip EMV Dourado Metálico */}
			<div className="w-8 h-6 rounded bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 p-[1px] shadow-sm relative overflow-hidden shrink-0">
				<div className="w-full h-full rounded-[3px] bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500 border border-amber-600/30 relative flex items-center justify-center">
					<div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-amber-700/40" />
					<div className="absolute inset-y-0 left-1/3 w-[1px] bg-amber-700/40" />
					<div className="absolute inset-y-0 right-1/3 w-[1px] bg-amber-700/40" />
					<div className="w-2.5 h-1.5 rounded-[2px] border border-amber-700/40" />
				</div>
			</div>
			{/* Ícone Contactless / Aproximação */}
			<Wifi size={15} className="rotate-90 text-white/70 shrink-0" />
		</div>
	);
}

export default function Cartoes() {
	const navigate = useNavigate();
	const [cartoes, setCartoes] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [cartaoParaGasto, setCartaoParaGasto] = useState<string | null>(null);
	const [cartaoParaEditar, setCartaoParaEditar] = useState<any>(null);
	
	const marcarAntigasComoPagas = async (cartao: any) => {
		const ids: string[] = cartao.faturasAnterioresIds || [];
		if (ids.length === 0) return;
		const total = Number(cartao.saldoFaturasAnteriores || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
		if (!window.confirm(`Marcar ${ids.length} fatura(s) antiga(s) do ${cartao.nome} como pagas (R$ ${total})?`)) return;
		try {
			const user = await authService.getCurrentUser();
			if (!user) return;
			const n = await financeService.marcarFaturasComoPagas(user.id, ids);
			toast.success(`${n} fatura(s) marcada(s) como paga(s).`);
			await loadCartoes();
		} catch (e: any) {
			toast.error(e?.message || "Não foi possível marcar as faturas.");
		}
	};

	const loadCartoes = async () => {
		setLoading(true);
		try {
			const user = await authService.getCurrentUser();
			if (!user) return;
			
			// getPagamentosFaturas também sincroniza pagamentos de cartão (efeito colateral necessário)
			const [cardsData, faturasData, gastosCredito, , dividasData] = await Promise.all([
				financeService.getCartoes(user.id),
				financeService.getAllFaturas(user.id).catch(() => []),
				financeService.getAllGastosCredito(user.id),
				financeService.getPagamentosFaturas(user.id),
				financeService.getDividas(user.id).catch(() => [])
			]);

			const enrichedCards = (cardsData || []).map((c: any) => {

				const cardGastos = gastosCredito?.filter((g: any) => g.cartao_id === c.id) || [];
				const cardFaturas = (faturasData || []).filter((f: any) => f.cartao_id === c.id);

				// 1. Procura EXCLUSIVAMENTE renegociação de cartão (NUNCA empréstimo consignado ou pessoal!)
				const matchingDivida = (dividasData || []).find(
					(d: any) => d.status !== "quitada" && cartaoDaDivida(d, cardsData || [], faturasData || []) === c.id,
				);

				const todayStr = hojeISO();
				const fechamentoDia = Number(c.fechamento_dia || 1);
				const vencimentoDia = Number(c.vencimento_dia || 1);
				const currentMesRef = getFaturaMesReferencia(todayStr, fechamentoDia, vencimentoDia, c);

				// Fatura atual: a do ciclo de hoje. Só se ela não existir, a aberta mais próxima
				// (as faturas futuras de parcelas também estão "aberta" e vêm primeiro na lista).
				// No mesmo mês pode haver faturas ZERADAS pela sincronização (repetidas de um bug
				// antigo ou do ciclo anterior a uma troca de vencimento): elas mostravam R$ 0,00.
				// Por isso vale primeiro a do vencimento exato do ciclo, depois uma não zerada.
				const vencDe = (f: any) => String(f.data_vencimento || "").substring(0, 7);
				const vencimentoAtual = diaNoMes(currentMesRef, getVencimentoDiaDoMes(currentMesRef, fechamentoDia, vencimentoDia, c));
				const zerada = (f: any) => f.status === "paga" && Number(f.valor_total || 0) <= 0.004;
				const doMesAtual = cardFaturas.filter((f: any) => vencDe(f) === currentMesRef);
				const faturaAbertaAtual =
					doMesAtual.find((f: any) => String(f.data_vencimento).slice(0, 10) === vencimentoAtual && !zerada(f)) ||
					doMesAtual.find((f: any) => !zerada(f)) ||
					doMesAtual[0] ||
					cardFaturas
						.filter((f: any) => f.status === "aberta" && vencDe(f) >= currentMesRef)
						.sort((a: any, b: any) => vencDe(a).localeCompare(vencDe(b)))[0];

				// Compras da fatura do mês atual
				const comprasMesAtual = cardGastos.filter((g: any) => {
					if (!g.data) return false;
					const gMesRef = getFaturaMesReferencia(g.data, fechamentoDia, vencimentoDia, c);
					return gMesRef === currentMesRef;
				});
				const valorComprasMesAtual = comprasMesAtual.reduce((sum: number, g: any) => sum + Number(g.valor || 0), 0);

				// Compras totais comprometendo o limite (ciclo atual + futuras)
				const comprasComprometidas = cardGastos.filter((g: any) => {
					if (!g.data) return false;
					const gMesRef = getFaturaMesReferencia(g.data, fechamentoDia, vencimentoDia, c);
					return gMesRef >= currentMesRef;
				});
				const totalComprasComprometidas = comprasComprometidas.reduce((sum: number, g: any) => sum + Number(g.valor || 0), 0);

				// Faturas anteriores que porventura ainda estejam pendentes (não pagas)
				const faturasAnterioresPendentes = cardFaturas.filter((f: any) => {
					const fVenc = f.data_vencimento ? f.data_vencimento.substring(0, 7) : "";
					return fVenc < currentMesRef && f.status !== "paga";
				});
				const saldoFaturasAnteriores = faturasAnterioresPendentes.reduce((sum: number, f: any) => {
					const total = Number(f.valor_total || 0);
					const pago = Number(f.valor_pago || 0);
					return sum + Math.max(0, total - pago);
				}, 0);

				const limiteTotal = Number(c.limite || 0);
				// Fatura atual = TOTAL da fatura (como na página Faturas: o maior entre o registro e a
				// soma das compras do ciclo). Antes mostrava o saldo (total − pago): qualquer pagamento
				// atribuído à fatura aberta (ex.: sobra de um pagamento ou pagamento contado duas vezes)
				// fazia uma fatura de mais de mil aparecer como R$ 65. O pago aparece separado no card.
				const faturaAtualValor = Math.round(Math.max(Number(faturaAbertaAtual?.valor_total || 0), valorComprasMesAtual) * 100) / 100;
				const faturaAtualPago = Math.round(Math.min(faturaAtualValor, Number(faturaAbertaAtual?.valor_pago || 0)) * 100) / 100;
				const faturaAtualSaldo = Math.round(Math.max(0, faturaAtualValor - faturaAtualPago) * 100) / 100;
				const totalComprometido = Math.round((totalComprasComprometidas + saldoFaturasAnteriores) * 100) / 100;
				const disponivel = Math.round((limiteTotal - totalComprometido) * 100) / 100;

				const parcelasFuturas = cardGastos.filter((g: any) => {
					if (!g.data) return false;
					const gMesRef = getFaturaMesReferencia(g.data, fechamentoDia, vencimentoDia, c);
					return gMesRef > currentMesRef;
				}).length;

				if (matchingDivida) {
					const parcelas = matchingDivida.parcelas_divida || [];
					const pendentes = parcelas.filter((p: any) => p.status === 'pendente');
					const pagas = parcelas.filter((p: any) => p.status === 'paga');
					const saldoDevedor = pendentes.length > 0
						? pendentes.reduce((sum: number, p: any) => sum + Number(p.valor_esperado || 0), 0)
						: Number(matchingDivida.valor_atual || matchingDivida.valor_original || 0);

					return {
						...c,
						isRenegociado: true,
						limiteTotal,
						faturaAtualValor,
						faturaAtualPago,
						faturaAtualSaldo,
						totalComprasComprometidas,
						saldoFaturasAnteriores,
						faturasAnterioresIds: faturasAnterioresPendentes.map((f: any) => f.id),
						totalComprometido,
						disponivel,
						parcelasFuturas,
						saldoGasto: faturaAtualValor,
						dividaDetalhes: {
							id: matchingDivida.id,
							descricao: matchingDivida.descricao || "Renegociação de Cartão",
							parcelasPagas: pagas.length,
							totalParcelas: parcelas.length || matchingDivida.parcelas_totais || 1,
							saldoDevedor
						}
					};
				}

				return {
					...c,
					isRenegociado: false,
					limiteTotal,
					faturaAtualValor,
					faturaAtualPago,
					faturaAtualSaldo,
					totalComprasComprometidas,
					saldoFaturasAnteriores,
					faturasAnterioresIds: faturasAnterioresPendentes.map((f: any) => f.id),
					totalComprometido,
					saldoGasto: faturaAtualValor,
					disponivel,
					parcelasFuturas
				};
			});

			setCartoes(enrichedCards);
		} catch (error) {
			console.error(error);
			toast.error("Erro ao carregar cartões");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadCartoes();
	}, []);

	const containerVariants = {
		hidden: { opacity: 0 },
		visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
	};

	const itemVariants = {
		hidden: { y: 20, opacity: 0 },
		visible: { y: 0, opacity: 1 }
	};

	const totalLimiteGeral = cartoes.reduce((sum, c) => sum + Number(c.limiteTotal || c.limite || 0), 0);
	const totalFaturasGeral = cartoes.reduce((sum, c) => sum + Number(c.faturaAtualValor || 0), 0);
	const totalDisponivelGeral = cartoes.reduce((sum, c) => sum + Number(c.disponivel || 0), 0);
	const totalComprometidoGeral = cartoes.reduce((sum, c) => sum + Number(c.totalComprometido || 0), 0);

	return (
		<motion.div 
			className="space-y-6 sm:space-y-8 pb-20 text-slate-800 dark:text-slate-100"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			<motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div>
					<h2 className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-3">
						<CreditCardIcon className="text-indigo-600 dark:text-indigo-400" size={40} />
						Meus Cartões
					</h2>
					<p className="text-slate-500 dark:text-slate-400 font-medium text-lg mt-1">
						Visão real dos seus limites, faturas abertas e compras comprometidas.
					</p>
				</div>
				<div className="flex items-center gap-3">
					<button 
						onClick={() => navigate("/faturas")}
						className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-5 py-3.5 rounded-2xl font-bold transition-all cursor-pointer"
					>
						<Eye size={18} />
						Ver Todas as Faturas
					</button>
					<button 
						onClick={() => setIsModalOpen(true)}
						className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3.5 rounded-2xl font-bold transition-all shadow-md shadow-indigo-200 dark:shadow-none w-full sm:w-auto cursor-pointer"
					>
						<Plus size={20} />
						Novo Cartão
					</button>
				</div>
			</motion.div>

			{/* KPI METRICS BAR */}
			<motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				<div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
					<p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Limite Total Concedido</p>
					<h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">
						R$ {totalLimiteGeral.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
					</h3>
					<span className="text-xs text-slate-400 mt-1 block font-medium">{cartoes.length} {cartoes.length === 1 ? 'cartão ativo' : 'cartões ativos'}</span>
				</div>
				<div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
					<p className="text-[10px] font-black uppercase tracking-wider text-indigo-500 dark:text-indigo-400">Fatura Aberta Atual</p>
					<h3 className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
						R$ {totalFaturasGeral.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
					</h3>
					<span className="text-xs text-slate-400 mt-1 block font-medium">Ciclo mensal vigente</span>
				</div>
				<div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
					<p className="text-[10px] font-black uppercase tracking-wider text-emerald-500 dark:text-emerald-400">Limite Disponível Geral</p>
					<h3 className={`text-2xl font-black mt-1 ${totalDisponivelGeral < 0 ? "text-rose-600" : "text-emerald-600 dark:text-emerald-400"}`}>
						R$ {totalDisponivelGeral.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
					</h3>
					<span className="text-xs text-slate-400 mt-1 block font-medium">Livre para novas compras</span>
				</div>
				<div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
					<p className="text-[10px] font-black uppercase tracking-wider text-amber-500 dark:text-amber-400">Total Comprometido</p>
					<h3 className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
						R$ {totalComprometidoGeral.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
					</h3>
					<span className="text-xs text-slate-400 mt-1 block font-medium">Fatura atual + parcelas futuras</span>
				</div>
			</motion.div>

			{loading ? (
				<div className="flex justify-center py-20">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
				</div>
			) : (
				<motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
					{cartoes.map((cartao) => {
						const branding = getCardBranding(cartao.nome);
						const cardBg = branding ? branding.color : (cartao.cor_hex || "#ec4899");
						const cardLogo = branding ? branding.logo : <CreditCardIcon opacity={0.5} size={28} />;
						const melhorDia = cartao.fechamento_dia;

						const limiteVal = Number(cartao.limiteTotal || cartao.limite || 0);
						const compVal = Number(cartao.totalComprometido || 0);
						const percentComprometido = limiteVal > 0 ? Math.min(100, Math.max(0, (compVal / limiteVal) * 100)) : 0;

						return (
							<div key={cartao.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all duration-300 p-4 sm:p-5 relative overflow-hidden flex flex-col h-full min-w-0 group">
								{/* Cartão Físico com efeito Metal / Glassmorphism */}
								<div 
									className="min-h-[210px] rounded-2xl p-4 sm:p-5 text-white flex flex-col justify-between mb-4 sm:mb-5 shadow-lg shadow-black/10 transition-all duration-300 relative overflow-hidden select-none"
									style={{ background: cardBg }}
								>
									{/* Efeito de brilho diagonal simulando plástico / metal fosco */}
									<div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-transparent pointer-events-none" />
									<div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none" />
									<div className="absolute right-0 bottom-0 p-8 opacity-10 pointer-events-none scale-125">
										<CreditCardIcon size={120} />
									</div>

									{/* Topo do Cartão: Chip EMV + Contactless à esquerda e Logo da Instituição à direita */}
									<div className="flex items-center justify-between gap-2 z-10 w-full">
										<EmvChip />
										<div className="shrink-0 flex items-center justify-end">
											{cardLogo}
										</div>
									</div>

									{/* Nome do Cartão + Badge de Renegociação */}
									<div className="flex items-center justify-between gap-2 z-10 w-full mt-2">
										<div className="flex items-center gap-1.5 min-w-0 flex-1">
											<span className="font-extrabold tracking-wider text-xs sm:text-sm uppercase opacity-90 truncate drop-shadow-sm" title={cartao.nome}>
												{cartao.nome}
											</span>
											<button 
												onClick={() => setCartaoParaEditar(cartao)} 
												className="p-1 opacity-70 hover:opacity-100 hover:bg-white/20 rounded-lg transition-all cursor-pointer shrink-0"
												title="Editar / Calibrar Cartão"
											>
												<Edit3 size={13} />
											</button>
										</div>
										{cartao.isRenegociado && (
											<span className="bg-rose-500/90 backdrop-blur-sm border border-rose-300/30 text-[9px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider shrink-0 shadow-sm flex items-center gap-1">
												<span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Acordo Ativo
											</span>
										)}
									</div>

									{/* Centro: Fatura Atual e Barra de Uso do Limite */}
									<div className="z-10 w-full my-auto py-1">
										<div className="flex items-baseline justify-between gap-2 mb-1.5">
											<div className="flex items-center gap-1.5">
												<span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
												<span className="text-[10px] uppercase font-bold tracking-wider text-white/80">
													Fatura Atual
												</span>
											</div>
											<span className="font-black text-xl sm:text-2xl tracking-tight text-white drop-shadow-sm whitespace-nowrap">
												R$ {Number(cartao.faturaAtualValor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
											</span>
										</div>
										{Number(cartao.faturaAtualPago || 0) > 0.009 && (
											<p className="text-[10px] font-bold text-white/80 text-right -mt-1 mb-1.5">
												pago R$ {Number(cartao.faturaAtualPago).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · falta R${" "}
												{Number(cartao.faturaAtualSaldo || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
											</p>
										)}

										{/* Barra de Progresso com Glassmorphism e gradiente de alerta */}
										<div className="w-full bg-black/25 backdrop-blur-sm h-2 rounded-full overflow-hidden p-[2px] border border-white/10">
											<div 
												className={`h-full rounded-full transition-all duration-500 shadow-sm ${
													percentComprometido > 85 ? "bg-gradient-to-r from-amber-300 to-rose-400" :
													percentComprometido > 50 ? "bg-gradient-to-r from-sky-300 to-amber-300" :
													"bg-gradient-to-r from-emerald-300 to-teal-200"
												}`}
												style={{ width: `${percentComprometido}%` }} 
											/>
										</div>

										<div className="flex justify-between items-center text-[10px] font-bold text-white/75 mt-1">
											<span>Uso do Limite: {percentComprometido.toFixed(0)}%</span>
											<span>Comprometido: R$ {compVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
										</div>
									</div>

									{/* Rodapé do Cartão Físico: Limite Total e Dia de Vencimento */}
									<div className="flex justify-between items-end gap-2 z-10 border-t border-white/15 pt-2.5 mt-1">
										<div className="min-w-0">
											<p className="text-[9px] uppercase font-bold tracking-wider text-white/70 mb-0.5">Limite Total</p>
											<p className="font-extrabold text-sm text-white whitespace-nowrap">
												R$ {limiteVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
											</p>
										</div>
										<div className="text-right shrink-0">
											<p className="text-[9px] uppercase font-bold tracking-wider text-white/70 mb-0.5">Vencimento</p>
											<p className="font-black text-sm text-white flex items-center justify-end gap-1">
												<Clock size={12} className="opacity-75" /> Dia {cartao.vencimento_dia}
											</p>
										</div>
									</div>
								</div>

								{/* Informações Complementares e Ciclo */}
								<div className="space-y-3 mb-4 sm:mb-5 px-0.5">
									{/* Tile de Limite Disponível */}
									<div className="flex items-center justify-between p-3 sm:p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 transition-all">
										<div className="flex items-center gap-2.5">
											<div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cartao.disponivel < 0 ? "bg-rose-100 dark:bg-rose-950/50 text-rose-600" : "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400"}`}>
												<CreditCardIcon size={16} />
											</div>
											<div>
												<span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
													Limite Disponível
												</span>
												<span className={`text-sm sm:text-base font-black ${cartao.disponivel < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
													{cartao.disponivel < 0 ? "-" : ""}R$ {Math.abs(Number(cartao.disponivel || 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
												</span>
											</div>
										</div>
										<span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${cartao.disponivel < 0 ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-200/50 dark:border-rose-800/50" : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/50"}`}>
											{cartao.disponivel < 0 ? "Esgotado" : "Liberado"}
										</span>
									</div>

									{/* De onde vem o "comprometido": compras x faturas antigas sem pagamento registrado */}
									{Number(cartao.saldoFaturasAnteriores || 0) > 0.009 && (
										<div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3.5 rounded-2xl text-xs space-y-2">
											<p className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-300">
												<AlertTriangle size={14} /> O limite está descontando faturas antigas
											</p>
											<div className="space-y-0.5 text-slate-600 dark:text-slate-300">
												<div className="flex justify-between gap-2">
													<span>Compras desta fatura e das próximas</span>
													<span className="font-bold whitespace-nowrap">R$ {Number(cartao.totalComprasComprometidas || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
												</div>
												<div className="flex justify-between gap-2">
													<span>{cartao.faturasAnterioresIds?.length || 0} fatura(s) antiga(s) sem pagamento registrado</span>
													<span className="font-bold whitespace-nowrap">R$ {Number(cartao.saldoFaturasAnteriores || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
												</div>
											</div>
											<p className="text-slate-500 dark:text-slate-400 leading-tight">
												Se você já pagou essas faturas no banco, marque como pagas e o limite disponível volta ao normal.
											</p>
											<div className="flex flex-wrap gap-2">
												<button
													onClick={() => marcarAntigasComoPagas(cartao)}
													className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black cursor-pointer"
												>
													Já paguei, marcar como pagas
												</button>
												<button
													onClick={() => navigate(`/faturas?cartao=${cartao.id}`)}
													className="px-3 py-1.5 rounded-xl text-amber-700 dark:text-amber-300 font-bold hover:underline cursor-pointer"
												>
													Ver faturas
												</button>
											</div>
										</div>
									)}

									{cartao.isRenegociado && (
										<div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 p-3.5 rounded-2xl text-xs space-y-1.5">
											<div className="flex items-center justify-between text-rose-700 dark:text-rose-300 font-bold">
												<span className="flex items-center gap-1.5">
													<AlertTriangle size={14} className="text-rose-600 dark:text-rose-400" /> Renegociação Ativa
												</span>
												<span>{cartao.dividaDetalhes?.parcelasPagas}/{cartao.dividaDetalhes?.totalParcelas} pagas</span>
											</div>
											<p className="text-slate-600 dark:text-slate-400 leading-tight">
												{cartao.dividaDetalhes?.descricao}: saldo restante de R$ {Number(cartao.dividaDetalhes?.saldoDevedor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.
											</p>
											<button
												onClick={() => navigate("/dividas")}
												className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1 pt-0.5 cursor-pointer"
											>
												Ver acordo na aba de Dívidas <ChevronRight size={12} />
											</button>
										</div>
									)}

									{/* Grid 2 Colunas: Fechamento e Melhor Dia de Compra */}
									<div className="grid grid-cols-2 gap-2">
										<div className="p-2.5 sm:p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
											<span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wider mb-0.5">
												Fechamento
											</span>
											<span className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200">
												Dia {cartao.fechamento_dia}
											</span>
										</div>
										<div className="p-2.5 sm:p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/40">
											<span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 block uppercase tracking-wider mb-0.5 flex items-center gap-1">
												<Sparkles size={11} /> Melhor Compra
											</span>
											<span className="text-xs sm:text-sm font-black text-emerald-700 dark:text-emerald-300">
												Dia {melhorDia}
											</span>
										</div>
									</div>

									{/* Linha de Parcelas Futuras */}
									<div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
										<span className="flex items-center gap-1.5 font-medium">
											<ShoppingBag size={13} className="text-slate-400 shrink-0" /> Parcelas futuras a faturar:
										</span>
										<span className="font-bold text-slate-700 dark:text-slate-200">
											{cartao.parcelasFuturas || 0} compras
										</span>
									</div>
								</div>

								{/* Ações Rápidas */}
								<div className="mt-auto space-y-2 pt-1">
									<button 
										onClick={() => setCartaoParaGasto(cartao.id)}
										className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white p-3 rounded-2xl font-bold text-sm transition-all shadow-sm hover:shadow shadow-pink-500/20 active:scale-[0.98] cursor-pointer"
									>
										<Plus size={16} />
										<span>Lançar Gasto no Cartão</span>
									</button>
									<button 
										onClick={() => navigate(`/faturas/${cartao.id}`)}
										className="w-full flex items-center justify-between bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 px-4 py-3 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] cursor-pointer group/btn"
									>
										<div className="flex items-center gap-2">
											<Eye size={16} className="text-slate-400 group-hover/btn:text-indigo-500 transition-colors" />
											<span>Ver Faturas Mensais</span>
										</div>
										<ChevronRight size={15} className="text-slate-400 group-hover/btn:translate-x-0.5 transition-transform" />
									</button>
								</div>
							</div>
						);
					})}
				</motion.div>
			)}

			<AddCartaoModal 
				isOpen={isModalOpen} 
				onClose={() => setIsModalOpen(false)} 
				onSuccess={loadCartoes} 
			/>

			<EditCartaoModal 
				isOpen={!!cartaoParaEditar} 
				onClose={() => setCartaoParaEditar(null)} 
				onSuccess={() => {
					setCartaoParaEditar(null);
					loadCartoes();
				}} 
				cartao={cartaoParaEditar}
			/>

			<AddGastoWeb
				isOpen={!!cartaoParaGasto}
				onClose={() => setCartaoParaGasto(null)}
				onSuccess={() => {
					setCartaoParaGasto(null);
					toast.success("Gasto lançado na fatura do cartão!");
					loadCartoes();
				}}
				initialCartaoId={cartaoParaGasto}
			/>
		</motion.div>
	);
}
