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
			color: "#820ad1",
			logo: (
				<span className="font-black text-xl tracking-tighter text-white select-none">
					nu<span className="text-pink-300">bank</span>
				</span>
			)
		};
	}
	if (lower.includes("inter")) {
		return {
			color: "#ff7a00",
			logo: (
				<span className="font-extrabold text-xl tracking-wide text-white select-none">
					inter
				</span>
			)
		};
	}
	if (lower.includes("itau") || lower.includes("itaú")) {
		return {
			color: "#ec7000",
			logo: (
				<span className="bg-[#003399] px-2 py-0.5 rounded font-black text-sm text-white select-none border border-white">
					Itaú
				</span>
			)
		};
	}
	if (lower.includes("bradesco")) {
		return {
			color: "#cc092f",
			logo: (
				<span className="font-black text-lg text-white tracking-tight select-none">
					bradesco
				</span>
			)
		};
	}
	if (lower.includes("c6")) {
		return {
			color: "#1e1e1e",
			logo: (
				<span className="font-black text-xl tracking-tight text-white select-none">
					C<span className="text-amber-500">6</span> Bank
				</span>
			)
		};
	}
	return null;
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
			
			const [cardsData, gastosCredito, pagamentosFaturas] = await Promise.all([
				financeService.getCartoes(user.id),
				financeService.getAllGastosCredito(user.id),
				financeService.getPagamentosFaturas(user.id)
			]);

			const enrichedCards = (cardsData || []).map((c: any) => {
				const cardGastos = gastosCredito?.filter((g: any) => g.cartao_id === c.id) || [];
				const totalGastos = cardGastos.reduce((sum: number, g: any) => sum + Number(g.valor), 0);

				const cardPagamentos = pagamentosFaturas?.filter((p: any) => p.cartao_id === c.id) || [];
				const totalPagamentos = cardPagamentos.reduce((sum: number, p: any) => sum + Number(p.valor), 0);

				const saldoGasto = Math.max(0, totalGastos - totalPagamentos);
				const disponivel = Math.max(0, Number(c.limite) - saldoGasto);

				return {
					...c,
					saldoGasto,
					disponivel
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
				<motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{cartoes.map((cartao) => {
						const branding = getCardBranding(cartao.nome);
						const cardBgColor = branding ? branding.color : (cartao.cor_hex || "#ec4899");
						const cardLogo = branding ? branding.logo : <CreditCardIcon opacity={0.5} size={28} />;
						const melhorDia = cartao.fechamento_dia === 31 ? 1 : cartao.fechamento_dia + 1;

						return (
							<div key={cartao.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 sm:p-6 relative overflow-hidden flex flex-col h-full hover:shadow-md transition-shadow duration-300">
								{/* Card appearance */}
								<div 
									className="h-40 rounded-2xl p-5 text-white flex flex-col justify-between mb-6 shadow-md transition-all duration-300"
									style={{ backgroundColor: cardBgColor }}
								>
									<div className="flex justify-between items-center">
										<div className="flex items-center gap-2">
											<p className="font-black tracking-widest text-base uppercase opacity-90 truncate max-w-[130px]">{cartao.nome}</p>
											<button 
												onClick={() => setCartaoParaEditar(cartao)} 
												className="p-1 opacity-50 hover:opacity-100 hover:bg-white/20 rounded-full transition-all cursor-pointer"
												title="Editar Cartão"
											>
												<Edit3 size={14} />
											</button>
										</div>
										{cardLogo}
									</div>
									<div className="flex justify-between items-end">
										<div>
											<p className="text-[10px] uppercase font-bold tracking-widest opacity-75 mb-0.5">Limite Total</p>
											<p className="font-black text-xl">
												R$ {Number(cartao.limite).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
											</p>
										</div>
										<div className="text-right">
											<p className="text-[10px] uppercase font-bold tracking-widest opacity-75 mb-0.5">Vence dia</p>
											<p className="font-bold text-lg">{cartao.vencimento_dia}</p>
										</div>
									</div>
								</div>

								{/* Limites e Ciclo */}
								<div className="space-y-4 mb-6 px-1">
									<div className="flex justify-between items-center text-sm">
										<span className="font-medium text-slate-500 dark:text-slate-400">Saldo Gasto</span>
										<span className="font-black text-slate-800 dark:text-slate-100">
											R$ {Number(cartao.saldoGasto || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
										</span>
									</div>
									<div className="flex justify-between items-center text-sm">
										<span className="font-medium text-slate-500 dark:text-slate-400">Limite Disponível</span>
										<span className="font-black text-emerald-600 dark:text-emerald-400">
											R$ {Number(cartao.disponivel || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
										</span>
									</div>
									
									<div className="bg-slate-50 dark:bg-slate-850 p-4 rounded-2xl space-y-1.5 text-xs text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-800/80 transition-colors">
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
								<div className="mt-auto space-y-3">
									<button 
										onClick={() => setCartaoParaGasto(cartao.id)}
										className="w-full flex items-center justify-between bg-pink-50 dark:bg-pink-950/20 hover:bg-pink-100 dark:hover:bg-pink-900/30 text-pink-700 dark:text-pink-400 p-4 rounded-2xl font-bold transition-colors group cursor-pointer"
									>
										<div className="flex items-center gap-3">
											<ShoppingBag size={20} className="text-pink-400 dark:text-pink-500 group-hover:text-pink-600" />
											Lançar Gasto no Cartão
										</div>
										<Plus size={18} className="text-pink-300 dark:text-pink-600 group-hover:text-pink-600" />
									</button>
									<button 
										onClick={() => navigate(`/faturas/${cartao.id}`)}
										className="w-full flex items-center justify-between bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-400 p-4 rounded-2xl font-bold transition-colors group cursor-pointer"
									>
										<div className="flex items-center gap-3">
											<Eye size={20} className="text-slate-400 dark:text-slate-500 group-hover:text-indigo-500" />
											Ver Faturas
										</div>
										<ChevronRight size={18} className="text-slate-300 dark:text-indigo-550 group-hover:text-indigo-500" />
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
