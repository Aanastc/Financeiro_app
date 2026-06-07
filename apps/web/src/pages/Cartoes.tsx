import { useState, useEffect } from "react";
import { authService } from "../../../../packages/services/auth.service";
import { financeService } from "../../../../packages/services/finance.service";
import { motion } from "framer-motion";
import { CreditCard as CreditCardIcon, Plus, Eye, ChevronRight, ShoppingBag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import AddCartaoModal from "../components/AddCartaoModal";
import { AddGastoWeb } from "../components/AddGastoWeb";

export default function Cartoes() {
	const navigate = useNavigate();
	const [cartoes, setCartoes] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [cartaoParaGasto, setCartaoParaGasto] = useState<string | null>(null);
	
	const loadCartoes = async () => {
		setLoading(true);
		try {
			const user = await authService.getCurrentUser();
			if (!user) return;
			const data = await financeService.getCartoes(user.id);
			setCartoes(data);
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
			className="max-w-7xl mx-auto space-y-8 pb-20 p-6 sm:p-10"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			<motion.div variants={itemVariants} className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
				<div>
					<h2 className="text-4xl font-black text-slate-800 tracking-tight flex items-center gap-3">
						<CreditCardIcon className="text-indigo-600" size={40} />
						Meus Cartões
					</h2>
					<p className="text-slate-500 font-medium text-lg mt-1">
					Gerencie seus limites e visualize suas faturas.
					</p>
				</div>
				<button 
					onClick={() => setIsModalOpen(true)}
					className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3.5 rounded-2xl font-bold transition-all shadow-md shadow-indigo-200"
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
					{cartoes.map((cartao) => (
						<div key={cartao.id} className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6 relative overflow-hidden flex flex-col h-full">
							{/* Card header / appearance */}
							<div 
								className="h-40 rounded-2xl p-5 text-white flex flex-col justify-between mb-6 shadow-md"
								style={{ backgroundColor: cartao.cor_hex || "#ec4899" }}
							>
								<div className="flex justify-between items-start">
									<p className="font-black tracking-widest text-lg uppercase opacity-90">{cartao.nome}</p>
									<CreditCardIcon opacity={0.5} size={28} />
								</div>
								<div className="flex justify-between items-end">
									<div>
										<p className="text-[10px] uppercase font-bold tracking-widest opacity-70 mb-0.5">Limite</p>
										<p className="font-black text-xl">
											R$ {Number(cartao.limite).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
										</p>
									</div>
									<div className="text-right">
										<p className="text-[10px] uppercase font-bold tracking-widest opacity-70 mb-0.5">Vence dia</p>
										<p className="font-bold text-lg">{cartao.vencimento_dia}</p>
									</div>
								</div>
							</div>

							{/* Actions */}
							<div className="mt-auto space-y-3">
								<button 
									onClick={() => setCartaoParaGasto(cartao.id)}
									className="w-full flex items-center justify-between bg-pink-50 hover:bg-pink-100 text-pink-700 p-4 rounded-2xl font-bold transition-colors group"
								>
									<div className="flex items-center gap-3">
										<ShoppingBag size={20} className="text-pink-400 group-hover:text-pink-600" />
										Lançar Gasto no Cartão
									</div>
									<Plus size={18} className="text-pink-300 group-hover:text-pink-600" />
								</button>
								<button 
									onClick={() => navigate(`/faturas/${cartao.id}`)}
									className="w-full flex items-center justify-between bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 p-4 rounded-2xl font-bold transition-colors group"
								>
									<div className="flex items-center gap-3">
										<Eye size={20} className="text-slate-400 group-hover:text-indigo-500" />
										Ver Faturas
									</div>
									<ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-500" />
								</button>
							</div>
						</div>
					))}
				</motion.div>
			)}

			<AddCartaoModal 
				isOpen={isModalOpen} 
				onClose={() => setIsModalOpen(false)} 
				onSuccess={loadCartoes} 
			/>

			<AddGastoWeb
				isOpen={!!cartaoParaGasto}
				onClose={() => setCartaoParaGasto(null)}
				onSuccess={() => {
					setCartaoParaGasto(null);
					toast.success("Gasto lançado na fatura do cartão!");
				}}
				initialCartaoId={cartaoParaGasto}
			/>
		</motion.div>
	);
}
