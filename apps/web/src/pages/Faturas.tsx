import { useState, useEffect, useMemo } from "react";
import { authService } from "../../../../packages/services/auth.service";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import { motion } from "framer-motion";
import { 
	CreditCard, 
	Calendar, 
	CheckCircle2, 
	CircleDashed, 
	ChevronLeft, 
	ChevronRight, 
	FileText, 
	X, 
	AlertTriangle,
	ExternalLink
} from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

export default function Faturas() {
	const { cartao_id } = useParams();
	const navigate = useNavigate();
	
	const [fatura, setFatura] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [filtroBusca, setFiltroBusca] = useState("");
	const [filtroAba, setFiltroAba] = useState<'Todas' | 'Minhas' | 'Terceiros' | 'Pagas' | 'Pendentes'>('Todas');
	const [contatos, setContatos] = useState<any[]>([]);
	
	// Modal de Pagamento
	const [isPayModalOpen, setIsPayModalOpen] = useState(false);
	const [payValor, setPayValor] = useState("");
	const [payTipo, setPayTipo] = useState<"Total" | "Mínimo" | "Parcial" | "Antecipado">("Total");
	const [payData, setPayData] = useState(() => new Date().toISOString().split("T")[0]);
	const [payObservacao, setPayObservacao] = useState("");

	// Default to current month
	const [mesSelecionado, setMesSelecionado] = useState(() => {
		const hoje = new Date();
		return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
	});

	const loadFatura = async (mes: string) => {
		setLoading(true);
		try {
			const user = await authService.getCurrentUser();
			if (!user || !cartao_id) return;
			const data = await financeService.getFaturaMensal(user.id, cartao_id, mes);
			setFatura(data);
		} catch (error) {
			console.error(error);
			toast.error("Erro ao carregar fatura");
		} finally {
			setLoading(false);
		}
	};

	const handleMarcarPagoTerceiro = async (itemId: string, pago: boolean, dataPagamento?: string) => {
		try {
			const obsObj = { data_pagamento: dataPagamento || new Date().toISOString().split('T')[0] };
			const observacaoStr = pago ? JSON.stringify(obsObj) : null;
			
			const { error } = await supabase
				.from("despesas")
				.update({ 
					terceiro_pago: pago,
					observacao: observacaoStr
				})
				.eq("id", itemId);

			if (error) throw error;
			toast.success(pago ? "Pagamento de terceiro registrado!" : "Pagamento de terceiro removido!");
			loadFatura(mesSelecionado);
		} catch (error: any) {
			toast.error("Erro ao atualizar pagamento: " + error.message);
		}
	};

	const handleAlterarDevedor = async (itemId: string, value: string) => {
		try {
			const isTerceiro = value !== "MEU_GASTO";
			const contatoId = isTerceiro ? value : null;

			const { error } = await supabase
				.from("despesas")
				.update({
					terceiro: isTerceiro,
					contato_id: contatoId,
					...(!isTerceiro ? { terceiro_pago: false, observacao: null } : {})
				})
				.eq("id", itemId);

			if (error) throw error;
			toast.success("Devedor atualizado com sucesso!");
			loadFatura(mesSelecionado);
		} catch (error: any) {
			toast.error("Erro ao atualizar devedor: " + error.message);
		}
	};

	useEffect(() => {
		const loadContatos = async () => {
			try {
				const user = await authService.getCurrentUser();
				if (user) {
					const data = await financeService.getContatos(user.id);
					setContatos(data || []);
				}
			} catch (e) {
				console.error(e);
			}
		};
		loadContatos();
	}, []);

	const handleAbrirModalPagamento = () => {
		if (!fatura) return;
		setPayValor(fatura.pendente.toFixed(2));
		setPayTipo("Total");
		setPayData(new Date().toISOString().split("T")[0]);
		setPayObservacao("");
		setIsPayModalOpen(true);
	};

	const handleConfirmarPagamento = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!fatura || !cartao_id) return;

		const valor = parseFloat(payValor.replace(",", "."));
		if (isNaN(valor) || valor <= 0) {
			toast.error("Valor inválido");
			return;
		}

		try {
			const user = await authService.getCurrentUser();
			if (!user) return;
			await financeService.pagarFatura(
				user.id,
				cartao_id,
				valor,
				mesSelecionado,
				payTipo,
				payData,
				payObservacao
			);
			toast.success("Pagamento da fatura registrado com sucesso!");
			setIsPayModalOpen(false);
			loadFatura(mesSelecionado);
		} catch (error: any) {
			toast.error("Erro ao registrar pagamento: " + error.message);
		}
	};

	useEffect(() => {
		if (cartao_id) {
			loadFatura(mesSelecionado);
		}
	}, [cartao_id, mesSelecionado]);

	const handleMudarMes = (direcao: number) => {
		const [ano, mes] = mesSelecionado.split("-").map(Number);
		const data = new Date(ano, mes - 1 + direcao, 1);
		const novoMes = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
		setMesSelecionado(novoMes);
	};

	const nomeMes = (mesStr: string) => {
		const [ano, mes] = mesStr.split("-").map(Number);
		const data = new Date(ano, mes - 1, 1);
		const nome = data.toLocaleString("pt-BR", { month: "long" });
		return `${nome.charAt(0).toUpperCase() + nome.slice(1)} ${ano}`;
	};

	const temTerceiros = useMemo(() => {
		return fatura?.itens?.some((i: any) => i.terceiro) || false;
	}, [fatura]);

	const itensFiltrados = useMemo(() => {
		if (!fatura || !fatura.itens) return [];
		
		let items = fatura.itens;

		if (filtroAba === 'Minhas') {
			items = items.filter((i: any) => !i.terceiro);
		} else if (filtroAba === 'Terceiros') {
			items = items.filter((i: any) => i.terceiro);
		} else if (filtroAba === 'Pagas') {
			items = items.filter((i: any) => i.terceiro && i.terceiro_pago);
		} else if (filtroAba === 'Pendentes') {
			items = items.filter((i: any) => i.terceiro && !i.terceiro_pago);
		}

		const query = filtroBusca.toLowerCase().trim();
		if (!query) return items;

		return items.filter((item: any) => {
			const descMatch = item.descricao?.toLowerCase().includes(query);
			const catMatch = item.categoria?.toLowerCase().includes(query);
			const contatoMatch = item.contatos?.nome?.toLowerCase().includes(query);
			return descMatch || catMatch || contatoMatch;
		});
	}, [fatura, filtroBusca, filtroAba]);

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

		return (
			<div className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-700 shadow-sm shrink-0">
				<CreditCard size={14} />
			</div>
		);
	};

	const containerVariants = {
		hidden: { opacity: 0 },
		visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
	};

	const itemVariants = {
		hidden: { y: 20, opacity: 0 },
		visible: { y: 0, opacity: 1 }
	};

	if (loading && !fatura) {
		return (
			<div className="flex justify-center items-center h-full min-h-screen bg-slate-50 dark:bg-slate-950">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
			</div>
		);
	}

	return (
		<motion.div 
			className="space-y-6 sm:space-y-8 pb-20 text-slate-800 dark:text-slate-100"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			{/* HEADER */}
			<motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div>
					<button onClick={() => navigate("/cartoes")} className="text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1 mb-2 hover:underline">
						<ChevronLeft size={16} /> Voltar para Cartões
					</button>
					<h2 className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-3">
						<FileText className="text-indigo-600 dark:text-indigo-400" size={40} />
						Fatura do Cartão
					</h2>
					<p className="text-slate-500 dark:text-slate-400 font-medium text-lg mt-1 flex items-center gap-2">
						<span 
							className="w-4 h-4 rounded-full inline-block shadow-sm" 
							style={{ backgroundColor: fatura?.cartao?.cor_hex || "#ccc" }} 
						/>
						{fatura?.cartao?.nome || "Carregando..."}
						
						{fatura && (() => {
							const [ano, mes] = mesSelecionado.split("-").map(Number);
							const vencimentoDia = fatura.cartao.vencimento_dia;
							const ultimoDiaMes = new Date(ano, mes, 0).getDate();
							const diaReal = Math.min(vencimentoDia, ultimoDiaMes);
							const dataVencimento = new Date(ano, mes - 1, diaReal, 23, 59, 59);
							const hoje = new Date();
							const isAtrasada = hoje > dataVencimento && fatura.pendente > 0.01;

							const statusText = fatura.totalFatura === 0
								? 'Sem Gastos'
								: fatura.pendente <= 0
									? 'Fatura Paga'
									: isAtrasada
										? 'Fatura em Atraso'
										: 'Fatura Aberta';

							const statusColor = fatura.totalFatura === 0
								? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
								: fatura.pendente <= 0
									? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
									: isAtrasada
										? 'bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-455'
										: 'bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-455';

							return (
								<span className={`ml-4 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${statusColor}`}>
									{statusText}
								</span>
							);
						})()}
					</p>
				</div>

				<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
					<div className="flex items-center gap-4 bg-white dark:bg-slate-900 px-6 py-3 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-sm justify-between transition-colors">
						<button onClick={() => handleMudarMes(-1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-650 dark:text-slate-400 transition-colors">
							<ChevronLeft size={24} />
						</button>
						<div className="flex items-center gap-2 font-bold text-lg text-slate-800 dark:text-slate-100 min-w-[150px] justify-center">
							<Calendar size={20} className="text-indigo-505 dark:text-indigo-400" />
							{nomeMes(mesSelecionado)}
						</div>
						<button onClick={() => handleMudarMes(1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-650 dark:text-slate-400 transition-colors">
							<ChevronRight size={24} />
						</button>
					</div>

					{fatura && fatura.pendente > 0 && (
						<button
							onClick={handleAbrirModalPagamento}
							className="px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm transition-all shadow-lg shadow-emerald-100/50 dark:shadow-none uppercase cursor-pointer"
						>
							Pagar Fatura
						</button>
					)}
				</div>
			</motion.div>

			{/* SUMMARY CARDS */}
			{fatura && (
				<motion.div 
					variants={itemVariants} 
					className={`grid grid-cols-1 ${temTerceiros ? 'md:grid-cols-3' : 'md:grid-cols-1 max-w-sm'} gap-6`}
				>
					<div className="bg-slate-800 dark:bg-slate-900 p-6 rounded-3xl shadow-md text-white border dark:border-slate-800 transition-colors">
						<p className="text-slate-400 dark:text-slate-400 font-bold uppercase tracking-widest text-xs mb-1">Total da Fatura</p>
						<p className="text-3xl font-black mb-4">R$ {fatura.totalFatura.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
						<div className="text-xs font-medium text-slate-300 dark:text-slate-400 flex items-center gap-2">
							<CreditCard size={14} /> Vencimento: Dia {fatura.cartao.vencimento_dia}
						</div>
					</div>

					{temTerceiros && (
						<>
							<div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
								<p className="text-slate-400 dark:text-slate-550 font-bold uppercase tracking-widest text-xs mb-1 flex items-center gap-1">
									<CheckCircle2 size={14} className="text-emerald-500" /> Total Pago (Terceiros)
								</p>
								<p className="text-3xl font-black text-emerald-500">R$ {fatura.totalPago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
							</div>
							<div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
								<p className="text-slate-400 dark:text-slate-555 font-bold uppercase tracking-widest text-xs mb-1 flex items-center gap-1">
									<CircleDashed size={14} className="text-rose-500" /> Pendente (Terceiros)
								</p>
								<p className="text-3xl font-black text-rose-500">R$ {fatura.pendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
							</div>
						</>
					)}
				</motion.div>
			)}

			{/* TRANSACTIONS LIST */}
			{fatura && (
				<motion.div variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800/80 shadow-sm overflow-hidden transition-colors">
					<div className="p-5 sm:p-8 border-b border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
						<div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
							<h3 className="font-black text-slate-800 dark:text-slate-100 text-xl tracking-tight shrink-0">Lançamentos da Fatura</h3>
							
							<div className="flex items-center gap-2">
								<span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Filtro:</span>
								<select
									value={filtroAba}
									onChange={(e: any) => setFiltroAba(e.target.value)}
									className="bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-600 dark:text-slate-305 cursor-pointer transition-colors shadow-inner"
								>
									<option value="Todas">Todos os lançamentos ({fatura.itens?.length || 0})</option>
									<option value="Minhas">Minhas compras</option>
									{temTerceiros && (
										<>
											<option value="Terceiros">Terceiros - Todos</option>
											<option value="Pendentes">Terceiros - Pendentes</option>
											<option value="Pagas">Terceiros - Pagos</option>
										</>
									)}
								</select>
							</div>
						</div>

						<input
							type="text"
							placeholder="Buscar por descrição, categoria..."
							className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold outline-none focus:border-indigo-500 w-full sm:w-80 shadow-inner bg-slate-50 dark:bg-slate-850 text-slate-750 dark:text-slate-200 transition-colors"
							value={filtroBusca}
							onChange={(e) => setFiltroBusca(e.target.value)}
						/>
					</div>

					<div className="p-4">
						{itensFiltrados.length === 0 ? (
							<div className="text-center py-10 text-slate-400 dark:text-slate-500 italic">
								{filtroBusca ? "Nenhum lançamento corresponde à busca." : "Nenhum lançamento encontrado para esta fatura."}
							</div>
						) : (
							<div className="space-y-2">
								{itensFiltrados.map((item: any) => {
									let dataPagamento = "";
									if (item.terceiro_pago && item.observacao) {
										try {
											const parsed = JSON.parse(item.observacao);
											if (parsed && parsed.data_pagamento) {
												dataPagamento = parsed.data_pagamento;
											}
										} catch (e) {}
									}

									return (
										<div key={item.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-2xl transition-colors border border-slate-50 dark:border-slate-850/40 gap-4">
											<div className="flex items-center gap-3 flex-1 min-w-0">
												{getGastoIcon(item.descricao, item.categoria)}
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2">
														<p className="font-bold text-slate-800 dark:text-slate-100 text-base truncate">{item.descricao}</p>
														<span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md uppercase shrink-0">
															{item.categoria}
														</span>
													</div>
													<div className="flex flex-wrap gap-2 text-xs font-medium text-slate-400 dark:text-slate-505 mt-1.5">
														<span>{new Date(item.data + "T12:00:00").toLocaleDateString("pt-BR")}</span>
														{item.total_parcelas > 1 && (
															<span className="text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full">
																Parcela {item.parcela_atual}/{item.total_parcelas}
															</span>
														)}
														<div className="flex items-center gap-1.5 shrink-0 bg-slate-50/50 dark:bg-slate-800/40 px-2 py-0.5 rounded-xl border border-slate-100/50 dark:border-slate-800/60">
															<span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wide">Devedor:</span>
															<select
																value={item.terceiro ? item.contato_id || "" : "MEU_GASTO"}
																onChange={(e) => handleAlterarDevedor(item.id, e.target.value)}
																className="bg-transparent text-slate-700 dark:text-slate-300 border-none rounded-xl py-0.5 font-bold text-[10px] outline-none cursor-pointer"
															>
																<option value="MEU_GASTO">👤 Meu Gasto</option>
																{contatos.map((c: any) => (
																	<option key={c.id} value={c.id}>👥 {c.nome}</option>
																))}
															</select>
															{item.terceiro && item.terceiro_pago && (
																<span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400">
																	Pago
																</span>
															)}
															{item.terceiro && !item.terceiro_pago && (
																<span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 animate-pulse">
																	Pendente
																</span>
															)}
														</div>
													</div>
												</div>
											</div>

											{/* Controles de Terceiros e Valor */}
											<div className="flex items-center gap-4 self-end sm:self-auto shrink-0">
												{item.terceiro && (
													<div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-850 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
														<label className="flex items-center gap-1 cursor-pointer text-xs font-bold text-slate-500 dark:text-slate-405">
															<input 
																type="checkbox"
																className="w-4 h-4 text-emerald-500 dark:bg-slate-850 rounded focus:ring-emerald-500 cursor-pointer"
																checked={item.terceiro_pago}
																onChange={(e) => handleMarcarPagoTerceiro(item.id, e.target.checked, dataPagamento)}
															/>
															Pago?
														</label>
														{item.terceiro_pago && (
															<input 
																type="date"
																className="bg-transparent border-none outline-none font-bold text-xs text-slate-600 dark:text-slate-300 cursor-pointer p-0 w-24"
																value={dataPagamento || new Date().toISOString().split('T')[0]}
																onChange={(e) => handleMarcarPagoTerceiro(item.id, true, e.target.value)}
															/>
														)}
													</div>
												)}
												<p className="font-black text-slate-700 dark:text-slate-205 text-base min-w-[90px] text-right">
													R$ {Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
												</p>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</motion.div>
			)}

			{/* PAY FATURA MODAL */}
			{isPayModalOpen && fatura && (
				<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
					<motion.div 
						initial={{ scale: 0.95, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 p-8 w-full max-w-md shadow-2xl relative space-y-6"
					>
						<button 
							onClick={() => setIsPayModalOpen(false)} 
							className="absolute top-6 right-6 p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all"
						>
							<X size={20} />
						</button>

						<div className="space-y-1">
							<h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
								<CreditCard className="text-indigo-505 dark:text-indigo-400" size={24} />
								Pagar Fatura
							</h3>
							<p className="text-slate-400 dark:text-slate-500 text-sm font-medium">Informe os detalhes do lançamento do pagamento.</p>
						</div>

						{fatura.itens.filter((item: any) => item.terceiro && !item.terceiro_pago).length > 0 && (
							<div className="bg-amber-50 dark:bg-amber-955/20 border border-amber-100 dark:border-amber-900/40 rounded-2xl p-4 flex items-start gap-3 text-amber-700 dark:text-amber-450 text-xs font-semibold">
								<AlertTriangle className="shrink-0 text-amber-500" size={16} />
								<div>
									Atenção: Existem compras de terceiros pendentes nesta fatura:{" "}
									<span className="font-black">
										{fatura.itens
											.filter((item: any) => item.terceiro && !item.terceiro_pago)
											.map((d: any) => d.contatos?.nome || "Terceiro")
											.join(", ")}
									</span>
								</div>
							</div>
						)}

						<form onSubmit={handleConfirmarPagamento} className="space-y-4">
							<div className="space-y-1.5">
								<label className="text-xs font-bold text-slate-500 dark:text-slate-405 uppercase tracking-wider">Valor Pago (R$)</label>
								<input 
									type="text"
									required
									value={payValor}
									onChange={(e) => setPayValor(e.target.value)}
									className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500 transition-colors shadow-inner"
									placeholder="0,00"
								/>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-1.5">
									<label className="text-xs font-bold text-slate-500 dark:text-slate-405 uppercase tracking-wider">Tipo</label>
									<select
										value={payTipo}
										onChange={(e: any) => setPayTipo(e.target.value)}
										className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-655 dark:text-slate-300 outline-none focus:border-indigo-500 transition-colors cursor-pointer"
									>
										<option value="Total">Total</option>
										<option value="Mínimo">Mínimo</option>
										<option value="Parcial">Parcial</option>
										<option value="Antecipado">Antecipado</option>
									</select>
								</div>

								<div className="space-y-1.5">
									<label className="text-xs font-bold text-slate-500 dark:text-slate-405 uppercase tracking-wider">Data</label>
									<input 
										type="date"
										required
										value={payData}
										onChange={(e) => setPayData(e.target.value)}
										className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500 transition-colors"
									/>
								</div>
							</div>

							<div className="space-y-1.5">
								<label className="text-xs font-bold text-slate-500 dark:text-slate-405 uppercase tracking-wider">Observações</label>
								<textarea
									value={payObservacao}
									onChange={(e) => setPayObservacao(e.target.value)}
									rows={2}
									className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium text-slate-750 dark:text-slate-300 outline-none focus:border-indigo-500 transition-colors shadow-inner resize-none text-sm"
									placeholder="Ex: Pagamento Nubank via Pix"
								/>
							</div>

							<div className="pt-2 flex gap-3">
								<button
									type="button"
									onClick={() => setIsPayModalOpen(false)}
									className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-505 dark:text-slate-400 rounded-xl font-black text-sm transition-all"
								>
									CANCELAR
								</button>
								<button
									type="submit"
									className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-sm transition-all shadow-lg shadow-emerald-100/50 dark:shadow-none uppercase cursor-pointer"
								>
									CONFIRMAR
								</button>
							</div>
						</form>
					</motion.div>
				</div>
			)}
		</motion.div>
	);
}
