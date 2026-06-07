import { useState, useEffect } from "react";
import { authService } from "../../../../packages/services/auth.service";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Phone, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, RotateCcw, X, DollarSign } from "lucide-react";
import toast from "react-hot-toast";

export default function Devedores() {
	const [devedores, setDevedores] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [expandedId, setExpandedId] = useState<string | null>(null);

	// States for payment registration modal
	const [paymentModalOpen, setPaymentModalOpen] = useState(false);
	const [selectedItemForPayment, setSelectedItemForPayment] = useState<any>(null);
	const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split("T")[0]);
	const [paymentType, setPaymentType] = useState<"total" | "parcial">("total");
	const [partialAmount, setPartialAmount] = useState("");

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

	const getPaymentInfo = (observacao: string) => {
		if (!observacao) return null;
		try {
			if (observacao.trim().startsWith("{")) {
				return JSON.parse(observacao);
			}
		} catch (e) {
			// Plain text observation, ignore
		}
		return null;
	};

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

		const itensText = itensPendentes.map((i: any) => {
			const dataFormatada = new Date(i.data).toLocaleDateString("pt-BR");
			const payInfo = getPaymentInfo(i.observacao);
			if (payInfo && typeof payInfo.valor_pago === "number") {
				const restante = Math.max(0, Number(i.valor) - payInfo.valor_pago);
				return `• ${i.descricao} (${dataFormatada}): R$ ${Number(i.valor).toFixed(2)} (Falta pagar: R$ ${restante.toFixed(2)})`;
			}
			return `• ${i.descricao} (${dataFormatada}): R$ ${Number(i.valor).toFixed(2)}`;
		}).join("%0A"); // %0A é quebra de linha em URL

		const total = Number(devedor.total_devido).toFixed(2);
		
		const mensagem = `Olá, ${devedor.contato.nome}! Tudo bem?%0A%0ASegue o demonstrativo detalhado dos valores em aberto:%0A%0A${itensText}%0A%0A*Total pendente:* R$ ${total}%0A%0AQuando puder realizar o acerto, por favor me envie o comprovante. Muito obrigado!`;

		window.open(`https://wa.me/${telefone}?text=${mensagem}`, "_blank");
	};

	const handleOpenPaymentModal = (item: any) => {
		setSelectedItemForPayment(item);
		setPaymentDate(new Date().toISOString().split("T")[0]);
		setPaymentType("total");
		setPartialAmount("");
		setPaymentModalOpen(true);
	};

	const handleConfirmarPagamento = async () => {
		if (!selectedItemForPayment) return;
		const valorOriginal = Number(selectedItemForPayment.valor);
		let valorPago = valorOriginal;
		let isTotal = paymentType === "total";

		if (!isTotal) {
			const parsedPartial = parseFloat(partialAmount);
			if (isNaN(parsedPartial) || parsedPartial <= 0 || parsedPartial >= valorOriginal) {
				toast.error(`Para pagamento parcial, informe um valor maior que 0 e menor que R$ ${valorOriginal.toFixed(2)}`);
				return;
			}
			valorPago = parsedPartial;
		}

		try {
			const metadata = {
				valor_pago: valorPago,
				data_pagamento: paymentDate,
				total: isTotal
			};

			const { error } = await supabase
				.from("gastos")
				.update({
					terceiro_pago: isTotal,
					observacao: JSON.stringify(metadata)
				})
				.eq("id", selectedItemForPayment.id);

			if (error) throw error;

			toast.success("Pagamento registrado com sucesso!");
			setPaymentModalOpen(false);
			setSelectedItemForPayment(null);
			setPartialAmount("");
			setPaymentType("total");
			loadDevedores();
		} catch (error) {
			console.error(error);
			toast.error("Erro ao registrar pagamento");
		}
	};

	const handleDesfazerPagamento = async (gastoId: string) => {
		if (!confirm("Deseja realmente desfazer o pagamento deste item?")) return;
		try {
			const { error } = await supabase
				.from("gastos")
				.update({
					terceiro_pago: false,
					observacao: null
				})
				.eq("id", gastoId);

			if (error) throw error;

			toast.success("Pagamento desfeito com sucesso!");
			loadDevedores();
		} catch (error) {
			console.error(error);
			toast.error("Erro ao desfazer pagamento");
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
												{devedor.itens.map((item: any) => {
													const payInfo = getPaymentInfo(item.observacao);
													const isPartial = !item.terceiro_pago && payInfo && typeof payInfo.valor_pago === "number";
													const restante = isPartial ? Number(item.valor) - payInfo.valor_pago : 0;

													return (
														<div key={item.id} className={`flex justify-between items-center p-4 rounded-2xl ${item.terceiro_pago ? 'bg-emerald-50/50' : isPartial ? 'bg-amber-50/50 border border-amber-100' : 'bg-slate-50'}`}>
															<div>
																<div className="flex items-center flex-wrap gap-2">
																	<p className={`font-bold ${item.terceiro_pago ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
																		{item.descricao}
																	</p>
																	{item.terceiro_pago && (
																		<span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">
																			Pago
																		</span>
																	)}
																	{isPartial && (
																		<span className="text-[10px] font-black uppercase bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full animate-pulse">
																			Parcialmente Pago
																		</span>
																	)}
																	{isPartial && (
																		<span className="text-xs font-black text-rose-500 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-100">
																			Ainda falta R$ {restante.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}!
																		</span>
																	)}
																</div>
																<p className="text-xs text-slate-500 mt-1">
																	Data do Gasto: {new Date(item.data).toLocaleDateString("pt-BR")} 
																	{item.cartao_id && " • No Cartão"} 
																	{item.total_parcelas > 1 && ` • Parcela ${item.parcela_atual}/${item.total_parcelas}`}
																</p>
																{payInfo && (
																	<p className="text-xs text-indigo-600 font-semibold mt-1">
																		{item.terceiro_pago 
																			? `Pago totalmente em ${new Date(payInfo.data_pagamento + "T12:00:00").toLocaleDateString("pt-BR")}` 
																			: `Pago R$ ${payInfo.valor_pago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em ${new Date(payInfo.data_pagamento + "T12:00:00").toLocaleDateString("pt-BR")}`
																		}
																	</p>
																)}
															</div>
															<div className="flex items-center gap-4">
																<p className={`font-black ${item.terceiro_pago ? 'text-slate-400' : 'text-slate-700'}`}>
																	R$ {Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
																</p>
																<div className="flex gap-2">
																	{(item.terceiro_pago || isPartial) && (
																		<button
																			onClick={() => handleDesfazerPagamento(item.id)}
																			className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
																			title="Desfazer Pagamento"
																		>
																			<RotateCcw size={20} />
																		</button>
																	)}
																	{!item.terceiro_pago && (
																		<button
																			onClick={() => handleOpenPaymentModal(item)}
																			className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-colors tooltip-trigger"
																			title={isPartial ? "Registrar pagamento do restante" : "Registrar Pagamento"}
																		>
																			<CheckCircle2 size={24} />
																		</button>
																	)}
																</div>
															</div>
														</div>
													);
												})}
											</div>
										</div>
									</motion.div>
								)}
							</AnimatePresence>
						</div>
					))}
				</motion.div>
			)}

			{/* PAYMENT REGISTRATION MODAL */}
			{paymentModalOpen && selectedItemForPayment && (
				<div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[110] flex items-center justify-center p-4">
					<div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in duration-300 border border-slate-100">
						<div className="p-8 bg-indigo-600 text-white relative">
							<h3 className="text-2xl font-black flex items-center gap-2">
								<DollarSign size={24} /> Registrar Pagamento
							</h3>
							<p className="text-indigo-100 text-sm font-semibold mt-1">
								{selectedItemForPayment.descricao} (Total: R$ {Number(selectedItemForPayment.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})
							</p>
							<button 
								onClick={() => {
									setPaymentModalOpen(false);
									setSelectedItemForPayment(null);
								}}
								className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/20 transition-colors text-white"
							>
								<X size={20} />
							</button>
						</div>

						<div className="p-8 space-y-6">
							{/* Data do Pagamento */}
							<div className="space-y-2">
								<label className="text-[10px] font-black uppercase text-slate-400 ml-1">
									Data do Pagamento
								</label>
								<input
									type="date"
									className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-500 transition-colors"
									value={paymentDate}
									onChange={(e) => setPaymentDate(e.target.value)}
								/>
							</div>

							{/* Tipo de Pagamento */}
							<div className="space-y-2">
								<label className="text-[10px] font-black uppercase text-slate-400 ml-1">
									Tipo de Pagamento
								</label>
								<div className="grid grid-cols-2 gap-2">
									<button
										type="button"
										onClick={() => setPaymentType("total")}
										className={`py-3 px-4 rounded-xl font-bold text-sm transition-all border ${
											paymentType === "total"
												? "bg-indigo-50 border-indigo-200 text-indigo-700"
												: "bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100"
										}`}
									>
										Valor Total
									</button>
									<button
										type="button"
										onClick={() => {
											setPaymentType("parcial");
											// Pre-fill with remaining amount if already partially paid
											const payInfo = getPaymentInfo(selectedItemForPayment.observacao);
											if (payInfo && typeof payInfo.valor_pago === "number") {
												setPartialAmount((Number(selectedItemForPayment.valor) - payInfo.valor_pago).toString());
											}
										}}
										className={`py-3 px-4 rounded-xl font-bold text-sm transition-all border ${
											paymentType === "parcial"
												? "bg-indigo-50 border-indigo-200 text-indigo-700"
												: "bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100"
										}`}
									>
										Valor Parcial
									</button>
								</div>
							</div>

							{/* Valor Parcial Input */}
							{paymentType === "parcial" && (
								<div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
									<label className="text-[10px] font-black uppercase text-slate-400 ml-1">
										Valor Pago (R$)
									</label>
									<input
										type="number"
										step="0.01"
										min="0.01"
										max={selectedItemForPayment.valor - 0.01}
										placeholder="0,00"
										className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-indigo-600 text-xl outline-none focus:border-indigo-500 transition-colors"
										value={partialAmount}
										onChange={(e) => setPartialAmount(e.target.value)}
									/>
									<span className="text-[9px] font-bold text-slate-400 ml-1 block">
										Deve ser menor que R$ {Number(selectedItemForPayment.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
									</span>
								</div>
							)}

							<button
								onClick={handleConfirmarPagamento}
								className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
							>
								Confirmar Pagamento
							</button>
						</div>
					</div>
				</div>
			)}
		</motion.div>
	);
}
