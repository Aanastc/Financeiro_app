import { useState, useEffect } from "react";
import { authService } from "../../../../packages/services/auth.service";
import { financeService } from "../../../../packages/services/finance.service";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Phone, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";

export default function Devedores() {
	const [devedores, setDevedores] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const loadDevedores = async () => {
		setLoading(true);
		try {
			const user = await authService.getCurrentUser();
			if (!user) return;
			const data = await financeService.getDevedores(user.id);
			setDevedores(data);
		} catch (error) {
			console.error(error);
			toast.error("Erro ao carregar devedores");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadDevedores();
	}, []);

	const handleCobrarWhatsApp = (devedor: any) => {
		const telefone = devedor.contato.telefone?.replace(/\D/g, ""); // Remove tudo que não é número
		
		if (!telefone || telefone.length < 10) {
			toast.error("Telefone inválido ou não cadastrado.");
			return;
		}

		const itensPendentes = devedor.itens.filter((i: any) => !i.terceiro_pago);
		if (itensPendentes.length === 0) {
			toast.error("Não há itens pendentes para cobrar.");
			return;
		}

		const itensText = itensPendentes.map((i: any) => 
			`- ${i.descricao}: R$ ${Number(i.valor).toFixed(2)}`
		).join("%0A"); // %0A é quebra de linha em URL

		const total = Number(devedor.total_devido).toFixed(2);
		
		const mensagem = `Olá ${devedor.contato.nome}, tudo bem?%0A%0AEstou passando para lembrar dos seguintes valores pendentes que totalizam *R$ ${total}*:%0A%0A${itensText}%0A%0AQuando puder acertar, me avisa! Obrigado.`;

		// wa.me expects the number with country code. If it doesn't have country code (e.g. starts with 55), we could assume it's BR.
		// For safety, we use the number as is, assuming the user registered it with DDI as agreed.
		window.open(`https://wa.me/${telefone}?text=${mensagem}`, "_blank");
	};

	const handleMarcarPago = async (gastoId: string) => {
		try {
			await financeService.marcarTerceiroPago(gastoId, true);
			toast.success("Pagamento registrado com sucesso!");
			loadDevedores(); // Recarrega a lista
		} catch (error) {
			toast.error("Erro ao registrar pagamento");
		}
	};

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
			className="max-w-6xl mx-auto space-y-8 pb-20 p-6 sm:p-10"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			{/* HEADER */}
			<motion.div variants={itemVariants} className="flex justify-between items-end">
				<div>
					<h2 className="text-4xl font-black text-slate-800 tracking-tight flex items-center gap-3">
						<Users className="text-indigo-600" size={40} />
						Devedores
					</h2>
					<p className="text-slate-500 font-medium text-lg mt-1">
						Controle de compras e empréstimos para terceiros.
					</p>
				</div>
			</motion.div>

			{loading ? (
				<div className="flex justify-center py-20">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
				</div>
			) : devedores.length === 0 ? (
				<motion.div variants={itemVariants} className="bg-white p-10 rounded-3xl border border-slate-100 shadow-sm text-center">
					<AlertCircle size={48} className="mx-auto text-emerald-400 mb-4" />
					<h3 className="text-xl font-bold text-slate-700">Tudo limpo por aqui!</h3>
					<p className="text-slate-500 mt-2">Ninguém te deve dinheiro no momento.</p>
				</motion.div>
			) : (
				<motion.div variants={itemVariants} className="space-y-4">
					{devedores.map((devedor) => (
						<div key={devedor.contato.id} className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
							{/* CARD HEADER */}
							<div 
								className="p-6 cursor-pointer flex justify-between items-center bg-slate-50 hover:bg-slate-100 transition-colors"
								onClick={() => setExpandedId(expandedId === devedor.contato.id ? null : devedor.contato.id)}
							>
								<div className="flex items-center gap-4">
									<div className="w-12 h-12 bg-indigo-100 rounded-full flex justify-center items-center">
										<span className="text-indigo-600 font-black text-xl">
											{devedor.contato.nome.charAt(0).toUpperCase()}
										</span>
									</div>
									<div>
										<h3 className="font-bold text-lg text-slate-800">{devedor.contato.nome}</h3>
										<p className="text-sm text-slate-500 flex items-center gap-1">
											{devedor.contato.telefone || "Sem telefone"}
										</p>
									</div>
								</div>
								
								<div className="flex items-center gap-6">
									<div className="text-right">
										<p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Devido</p>
										<p className="text-xl font-black text-rose-500">
											R$ {Number(devedor.total_devido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
										</p>
									</div>
									<div className="text-slate-400">
										{expandedId === devedor.contato.id ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
									</div>
								</div>
							</div>

							{/* ACCORDION CONTENT */}
							<AnimatePresence>
								{expandedId === devedor.contato.id && (
									<motion.div 
										initial={{ height: 0, opacity: 0 }}
										animate={{ height: "auto", opacity: 1 }}
										exit={{ height: 0, opacity: 0 }}
										className="border-t border-slate-100"
									>
										<div className="p-6 space-y-4">
											<div className="flex justify-between items-center mb-4">
												<h4 className="font-bold text-slate-700">Itens Pendentes ({devedor.itens.length})</h4>
												<button
													onClick={() => handleCobrarWhatsApp(devedor)}
													className="flex items-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white px-4 py-2 rounded-xl font-bold transition-colors shadow-sm"
												>
													<Phone size={18} />
													Cobrar via WhatsApp
												</button>
											</div>

											<div className="space-y-3">
												{devedor.itens.map((item: any) => (
													<div key={item.id} className={`flex justify-between items-center p-4 rounded-2xl ${item.terceiro_pago ? 'bg-emerald-50/50' : 'bg-slate-50'}`}>
														<div>
															<div className="flex items-center gap-2">
																<p className={`font-bold ${item.terceiro_pago ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
																	{item.descricao}
																</p>
																{item.terceiro_pago && (
																	<span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">
																		Pago
																	</span>
																)}
															</div>
															<p className="text-xs text-slate-500 mt-1">
																Data: {new Date(item.data).toLocaleDateString("pt-BR")} 
																{item.cartao_id && " • No Cartão"} 
																{item.total_parcelas > 1 && ` • Parcela ${item.parcela_atual}/${item.total_parcelas}`}
															</p>
														</div>
														<div className="flex items-center gap-4">
															<p className={`font-black ${item.terceiro_pago ? 'text-slate-400' : 'text-slate-700'}`}>
																R$ {Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
															</p>
															{!item.terceiro_pago && (
																<button
																	onClick={() => handleMarcarPago(item.id)}
																	className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-colors tooltip-trigger"
																	title="Marcar como Pago"
																>
																	<CheckCircle2 size={24} />
																</button>
															)}
														</div>
													</div>
												))}
											</div>
										</div>
									</motion.div>
								)}
							</AnimatePresence>
						</div>
					))}
				</motion.div>
			)}
		</motion.div>
	);
}
