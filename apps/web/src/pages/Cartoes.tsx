import { useState, useEffect } from "react";
import { authService } from "../../../../packages/services/auth.service";
import { financeService } from "../../../../packages/services/finance.service";
import { motion } from "framer-motion";
import { CreditCard as CreditCardIcon, Plus, Eye, ChevronRight, ShoppingBag, Edit3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import AddCartaoModal from "../components/AddCartaoModal";
import EditCartaoModal from "../components/EditCartaoModal";
import { AddGastoWeb } from "../components/AddGastoWeb";

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

export default function Cartoes() {
	const navigate = useNavigate();
	const [cartoes, setCartoes] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [cartaoParaGasto, setCartaoParaGasto] = useState<string | null>(null);
	const [cartaoParaEditar, setCartaoParaEditar] = useState<any>(null);
	
	const loadCartoes = async () => {
		setLoading(true);
		try {
			const user = await authService.getCurrentUser();
			if (!user) return;
			
			const [cardsData, faturasData, gastosCredito, pagamentosFaturas] = await Promise.all([
				financeService.getCartoes(user.id),
				financeService.getAllFaturas(user.id).catch(() => []),
				financeService.getAllGastosCredito(user.id),
				financeService.getPagamentosFaturas(user.id)
			]);

			const enrichedCards = (cardsData || []).map((c: any) => {
				const cardGastos = gastosCredito?.filter((g: any) => g.cartao_id === c.id) || [];
				const totalGastos = cardGastos.reduce((sum: number, g: any) => sum + Number(g.valor), 0);

				const cardPagamentos = pagamentosFaturas?.filter((p: any) => p.cartao_id === c.id) || [];
				const totalPagamentos = cardPagamentos.reduce((sum: number, p: any) => sum + Number(p.valor), 0);

				const cardFaturas = (faturasData || []).filter((f: any) => f.cartao_id === c.id);
				let saldoGasto = 0;

				if (cardFaturas.length > 0) {
					// Soma apenas o saldo restante das faturas não quitadas (abertas, fechadas, atrasadas)
					const saldoFaturas = cardFaturas.reduce((sum: number, f: any) => {
						return sum + Math.max(0, Number(f.valor_total || 0) - Number(f.valor_pago || 0));
					}, 0);
					// Mais compras do ciclo que ainda não foram atreladas a nenhuma fatura
					const comprasSemFatura = cardGastos.filter((g: any) => !g.fatura_id);
					const totalSemFatura = comprasSemFatura.reduce((sum: number, g: any) => sum + Number(g.valor), 0);
					saldoGasto = Math.max(0, saldoFaturas + totalSemFatura);
				} else {
					// Fallback: Total gasto menos total pago no cartão
					saldoGasto = Math.max(0, totalGastos - totalPagamentos);
				}

				const disponivel = Math.max(0, Number(c.limite) - saldoGasto);

				const todayStr = new Date().toISOString().split("T")[0];
				const parcelasEmAberto = cardGastos.filter((g: any) => g.total_parcelas > 1 && g.data >= todayStr).length;

				return {
					...c,
					saldoGasto,
					disponivel,
					parcelasEmAberto
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
						Gerencie seus limites e visualize suas faturas.
					</p>
				</div>
				<button 
					onClick={() => setIsModalOpen(true)}
					className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3.5 rounded-2xl font-bold transition-all shadow-md shadow-indigo-200 dark:shadow-none w-full sm:w-auto cursor-pointer"
				>
					<Plus size={20} />
					Novo Cartão
				</button>
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
						const cardAccent = branding ? branding.accentColor : "#f472b6";
						const melhorDia = cartao.fechamento_dia;

						return (
							<div key={cartao.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm p-4 sm:p-6 relative overflow-hidden flex flex-col h-full hover:shadow-md transition-shadow duration-300 min-w-0">
								{/* Card appearance */}
								<div 
									className="min-h-[190px] rounded-2xl p-4 sm:p-5 text-white flex flex-col justify-between mb-5 sm:mb-6 shadow-md transition-all duration-300 relative overflow-hidden select-none"
									style={{ background: cardBg }}
								>
									<div className="absolute right-0 bottom-0 p-8 opacity-10 pointer-events-none scale-125">
										<CreditCardIcon size={120} />
									</div>
									<div className="flex items-center justify-between gap-2 z-10 w-full mb-3">
										<div className="flex items-center gap-1.5 min-w-0 flex-1">
											<p className="font-black tracking-wider text-sm sm:text-base uppercase opacity-95 truncate" title={cartao.nome}>
												{cartao.nome}
											</p>
											<button 
												onClick={() => setCartaoParaEditar(cartao)} 
												className="p-1 opacity-70 hover:opacity-100 hover:bg-white/20 rounded-lg transition-all cursor-pointer shrink-0"
												title="Editar Cartão"
											>
												<Edit3 size={14} />
											</button>
										</div>
										<div className="shrink-0 flex items-center justify-end pl-2">
											{cardLogo}
										</div>
									</div>
									<div className="z-10 w-full my-auto py-2">
										<div className="flex items-baseline justify-between gap-2 mb-1.5">
											<span className="text-[10px] uppercase font-bold tracking-wider opacity-85 truncate">Saldo Utilizado</span>
											<span className="font-black text-lg sm:text-xl whitespace-nowrap">
												R$ {Number(cartao.saldoGasto || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
											</span>
										</div>
										<div className="w-full bg-white/25 h-2 rounded-full overflow-hidden p-0.5">
											<div 
												className="bg-white h-full rounded-full transition-all duration-500 shadow-sm" 
												style={{ width: `${Math.min(100, ((cartao.saldoGasto || 0) / (cartao.limite || 1)) * 100)}%` }} 
											/>
										</div>
									</div>
									<div className="flex justify-between items-end gap-2 z-10 border-t border-white/20 pt-2.5 mt-2">
										<div className="min-w-0">
											<p className="text-[9px] uppercase font-bold tracking-wider opacity-80 mb-0.5">Limite Total</p>
											<p className="font-bold text-sm whitespace-nowrap">
												R$ {Number(cartao.limite).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
											</p>
										</div>
										<div className="text-right shrink-0">
											<p className="text-[9px] uppercase font-bold tracking-wider opacity-80 mb-0.5">Vence dia</p>
											<p className="font-black text-sm">{cartao.vencimento_dia}</p>
										</div>
									</div>
								</div>

								{/* Limites e Ciclo */}
								<div className="space-y-3 sm:space-y-4 mb-5 sm:mb-6 px-1">
									<div className="flex justify-between items-center text-sm gap-2">
										<span className="font-medium text-slate-500 dark:text-slate-400 truncate">Limite Disponível</span>
										<span className="font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
											R$ {Number(cartao.disponivel || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
										</span>
									</div>
									<div className="flex justify-between items-center text-sm gap-2">
										<span className="font-medium text-slate-500 dark:text-slate-400 truncate">Parcelas em Aberto</span>
										<span className="font-black text-indigo-600 dark:text-indigo-400 whitespace-nowrap" style={{ color: cardAccent }}>
											{cartao.parcelasEmAberto} {cartao.parcelasEmAberto === 1 ? 'parcela ativa' : 'parcelas ativas'}
										</span>
									</div>
									
									<div className="bg-slate-50 dark:bg-slate-800/70 p-3.5 sm:p-4 rounded-2xl space-y-2 text-xs text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-800/80 transition-colors">
										<div className="flex justify-between font-bold">
											<span>Fechamento da Fatura:</span>
											<span className="text-slate-800 dark:text-slate-200">Dia {cartao.fechamento_dia}</span>
										</div>
										<div className="flex justify-between">
											<span>Melhor dia para compra:</span>
											<span className="font-black text-emerald-600 dark:text-emerald-400">Dia {melhorDia}</span>
										</div>
									</div>
								</div>

								{/* Actions */}
								<div className="mt-auto space-y-2.5 sm:space-y-3">
									<button 
										onClick={() => setCartaoParaGasto(cartao.id)}
										className="w-full flex items-center justify-between bg-pink-50 dark:bg-pink-950/20 hover:bg-pink-100 dark:hover:bg-pink-900/30 text-pink-700 dark:text-pink-400 p-3.5 sm:p-4 rounded-2xl font-bold text-sm sm:text-base transition-colors group cursor-pointer"
									>
										<div className="flex items-center gap-2.5 sm:gap-3 truncate">
											<ShoppingBag size={18} className="text-pink-400 dark:text-pink-500 group-hover:text-pink-600 shrink-0" />
											<span className="truncate">Lançar Gasto no Cartão</span>
										</div>
										<Plus size={18} className="text-pink-300 dark:text-pink-600 group-hover:text-pink-600 shrink-0 ml-1" />
									</button>
									<button 
										onClick={() => navigate(`/faturas/${cartao.id}`)}
										className="w-full flex items-center justify-between bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-400 p-3.5 sm:p-4 rounded-2xl font-bold text-sm sm:text-base transition-colors group cursor-pointer"
									>
										<div className="flex items-center gap-2.5 sm:gap-3 truncate">
											<Eye size={18} className="text-slate-400 dark:text-slate-500 group-hover:text-indigo-500 shrink-0" />
											<span className="truncate">Ver Faturas</span>
										</div>
										<ChevronRight size={18} className="text-slate-300 dark:text-slate-500 group-hover:text-indigo-500 shrink-0 ml-1" />
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
