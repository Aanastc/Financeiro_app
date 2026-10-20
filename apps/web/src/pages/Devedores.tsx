import { useState, useEffect, useMemo } from "react";
import { authService } from "../../../../packages/services/auth.service";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { 
	Users, 
	Phone, 
	CheckCircle2, 
	AlertCircle, 
	ChevronDown, 
	ChevronUp, 
	RotateCcw, 
	X, 
	DollarSign, 
	Plus, 
	Split, 
	Sparkles, 
	Mail, 
	Share2, 
	Search, 
	UserCheck, 
	MessageSquare,
	ArrowUpRight,
	ArrowDownLeft
} from "lucide-react";
import toast from "react-hot-toast";
import AddContatoWeb from "../components/AddContatoWeb";
import AddSplitDespesaModal from "../components/AddSplitDespesaModal";
import ConviteAmigoModal from "../components/ConviteAmigoModal";
import ChatAcordosIaModal from "../components/ChatAcordosIaModal";

import EmBreveView from "../components/EmBreveView";

export default function Devedores() {
	return <EmBreveView modulo="SPLITWISE" />;
}

function _DevedoresLegacy() {
	const [userId, setUserId] = useState<string>("");
	const [userName, setUserName] = useState<string>("");
	const [devedores, setDevedores] = useState<any[]>([]);
	const [credores, setCredores] = useState<any[]>([]);
	const [contatos, setContatos] = useState<any[]>([]);
	const [usuariosComConta, setUsuariosComConta] = useState<Set<string>>(new Set());
	const [activeTab, setActiveTab] = useState<"devedores" | "credores" | "contatos">("devedores");
	const [loading, setLoading] = useState(true);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [termoBusca, setTermoBusca] = useState("");

	// Modais
	const [isAddSplitOpen, setIsAddSplitOpen] = useState(false);
	const [isAddContatoOpen, setIsAddContatoOpen] = useState(false);
	const [isChatIaOpen, setIsChatIaOpen] = useState(false);
	const [contatoParaConvite, setContatoParaConvite] = useState<any>(null);

	// States for payment registration modal
	const [paymentModalOpen, setPaymentModalOpen] = useState(false);
	const [selectedItemForPayment, setSelectedItemForPayment] = useState<any>(null);
	const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split("T")[0]);
	const [paymentType, setPaymentType] = useState<"total" | "parcial">("total");
	const [partialAmount, setPartialAmount] = useState("");

	const loadAllData = async () => {
		setLoading(true);
		try {
			const user = await authService.getCurrentUser();
			if (!user) return;
			setUserId(user.id);
			setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário");

			const [devedoresData, contatosRes, transacoesCredoresRes] = await Promise.all([
				financeService.getDevedores(user.id),
				supabase.from("contatos").select("*").eq("usuario_id", user.id).order("nome"),
				supabase.from("transacoes")
					.select("id, descricao, data, valor, terceiro_pago, observacao")
					.eq("usuario_id", user.id)
					.or("observacao.ilike.%parceria_credor_id%,descricao.ilike.%claudney%,descricao.ilike.%claudiney%")
			]);

			setDevedores(devedoresData || []);
			const contatosList = contatosRes.data || [];
			setContatos(contatosList);

			// Mapeia e-mails que possuem conta no sistema de forma segura e escalável (somente os contatos do usuário)
			const emailsDosContatos = Array.from(new Set(
				contatosList
					.map((c: any) => (c.email || "").toLowerCase().trim())
					.filter(Boolean)
			));

			const usuariosEmails = new Set<string>();
			if (emailsDosContatos.length > 0) {
				const { data: usersFound } = await supabase
					.from("usuarios")
					.select("id, email")
					.in("email", emailsDosContatos);

				(usersFound || []).forEach((u: any) => {
					if (u.email) usuariosEmails.add(u.email.toLowerCase().trim());
				});
			}
			setUsuariosComConta(usuariosEmails);

			// Processamento dos credores
			const txs = transacoesCredoresRes.data || [];
			const credoresMap = new Map();

			txs.forEach((g: any) => {
				let contatoEncontrado = null;
				let isCredorItem = false;
				let valorParcela = Number(g.valor || 0);
				let valorOriginal = valorParcela;

				// Verifica se é item de parceria / split onde o usuário deve
				if (g.observacao) {
					try {
						if (g.observacao.trim().startsWith("{")) {
							const meta = JSON.parse(g.observacao);
							if (meta.parceria_credor_id) {
								contatoEncontrado = contatosList.find((c: any) => c.id === meta.parceria_credor_id);
								isCredorItem = true;
								valorOriginal = meta.valor_total || valorParcela;
							}
						}
					} catch (e) {}
				}

				// Fallback histórico para descrições de parcerias antigas ("claudiney")
				if (!isCredorItem) {
					const descLower = (g.descricao || "").toLowerCase();
					if (descLower.includes("claudney") || descLower.includes("claudiney")) {
						contatoEncontrado = contatosList.find((c: any) => 
							(c.nome && descLower.includes(c.nome.toLowerCase()))
						) || { id: "claudiney-fallback", nome: "Claudiney", telefone: "" };
						isCredorItem = true;
						valorOriginal = valorParcela * 2;
					}
				}

				if (isCredorItem && contatoEncontrado) {
					const cId = contatoEncontrado.id;
					if (!credoresMap.has(cId)) {
						credoresMap.set(cId, {
							contato: contatoEncontrado,
							total_devido: 0,
							itens: []
						});
					}

					const credor = credoresMap.get(cId);
					credor.itens.push({
						id: g.id,
						descricao: g.descricao,
						data: g.data,
						valor_parcela_usuario: valorParcela,
						valor_original: valorOriginal,
						quitado: g.terceiro_pago || false,
						observacao: g.observacao
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
		} catch (error) {
			console.error(error);
			toast.error("Erro ao carregar devedores e credores");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		let isMounted = true;
		let channelTxs: any = null;
		let channelContatos: any = null;

		loadAllData();

		// Supabase Realtime: escuta alterações nas tabelas 'transacoes' e 'contatos' para sincronização dinâmica
		async function setupRealtime() {
			const { data: { user } } = await supabase.auth.getUser();
			if (user && isMounted) {
				channelTxs = financeService.subscribeToChanges("transacoes", user.id, () => {
					if (isMounted) loadAllData();
				});
				channelContatos = financeService.subscribeToChanges("contatos", user.id, () => {
					if (isMounted) loadAllData();
				});
			}
		}

		setupRealtime();

		return () => {
			isMounted = false;
			if (channelTxs) supabase.removeChannel(channelTxs);
			if (channelContatos) supabase.removeChannel(channelContatos);
		};
	}, []);

	const getPaymentInfo = (observacao: string) => {
		if (!observacao) return null;
		try {
			if (observacao.trim().startsWith("{")) {
				return JSON.parse(observacao);
			}
		} catch (e) {}
		return null;
	};

	const handleCobrarWhatsApp = (devedor: any) => {
		const telefone = devedor.contato.telefone?.replace(/\D/g, "");
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
		}).join("%0A");

		const total = Number(devedor.total_devido).toFixed(2);
		const mensagem = `Olá, ${devedor.contato.nome}! Tudo bem?%0A%0ASegue o demonstrativo das despesas divididas e em aberto:%0A%0A${itensText}%0A%0A*Total pendente:* R$ ${total}%0A%0AQuando puder realizar o acerto via Pix, por favor me envie o comprovante. Muito obrigado!`;

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
		const valorOriginal = Number(selectedItemForPayment.valor || selectedItemForPayment.valor_parcela_usuario || 0);
		let valorPago = valorOriginal;
		let isTotal = paymentType === "total";

		if (!isTotal) {
			const parsedPartial = parseFloat(partialAmount);
			if (isNaN(parsedPartial) || parsedPartial <= 0 || parsedPartial >= valorOriginal) {
				toast.error(`Informe um valor maior que zero e menor que R$ ${valorOriginal.toFixed(2)}`);
				return;
			}
			valorPago = parsedPartial;
		}

		try {
			const currentObservacao = selectedItemForPayment.observacao ? getPaymentInfo(selectedItemForPayment.observacao) || {} : {};
			const metadata = {
				...currentObservacao,
				valor_pago: valorPago,
				data_pagamento: paymentDate,
				total: isTotal
			};

			const { error } = await supabase
				.from("transacoes")
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
			loadAllData();
		} catch (error) {
			console.error(error);
			toast.error("Erro ao registrar pagamento");
		}
	};

	const handleDesfazerPagamento = async (gastoId: string) => {
		if (!confirm("Deseja realmente desfazer este pagamento?")) return;
		try {
			const { error } = await supabase
				.from("transacoes")
				.update({
					terceiro_pago: false
				})
				.eq("id", gastoId);

			if (error) throw error;

			toast.success("Pagamento desfeito com sucesso!");
			loadAllData();
		} catch (error) {
			console.error(error);
			toast.error("Erro ao desfazer pagamento");
		}
	};

	// Totais KPIs
	const totalAReceber = devedores.reduce((sum, d) => sum + Number(d.total_devido || 0), 0);
	const totalAPagar = credores.reduce((sum, c) => sum + Number(c.total_devido || 0), 0);
	const saldoLiquido = totalAReceber - totalAPagar;

	// Filtros de busca
	const devedoresFiltrados = useMemo(() => {
		if (!termoBusca.trim()) return devedores;
		const query = termoBusca.toLowerCase();
		return devedores.filter(d => 
			(d.contato?.nome || "").toLowerCase().includes(query) ||
			d.itens.some((i: any) => (i.descricao || "").toLowerCase().includes(query))
		);
	}, [devedores, termoBusca]);

	const credoresFiltrados = useMemo(() => {
		if (!termoBusca.trim()) return credores;
		const query = termoBusca.toLowerCase();
		return credores.filter(c => 
			(c.contato?.nome || "").toLowerCase().includes(query) ||
			c.itens.some((i: any) => (i.descricao || "").toLowerCase().includes(query))
		);
	}, [credores, termoBusca]);

	const contatosFiltrados = useMemo(() => {
		if (!termoBusca.trim()) return contatos;
		const query = termoBusca.toLowerCase();
		return contatos.filter(c => 
			(c.nome || "").toLowerCase().includes(query) ||
			(c.email || "").toLowerCase().includes(query) ||
			(c.telefone || "").includes(query)
		);
	}, [contatos, termoBusca]);

	return (
		<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 sm:space-y-8 pb-20">
			{/* CABEÇALHO */}
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl sm:rounded-[36px] shadow-sm border border-slate-100 dark:border-slate-800">
				<div>
					<div className="flex items-center gap-3">
						<div className="bg-emerald-100 dark:bg-emerald-950/40 p-2.5 rounded-2xl text-emerald-600 dark:text-emerald-400">
							<Split size={28} />
						</div>
						<div>
							<h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">
								Devedores & Divisão de Contas
							</h1>
							<p className="text-slate-400 dark:text-slate-500 font-medium text-sm mt-0.5">
								Divisão inteligente de despesas estilo Splitwise com sincronização dinâmica entre contas.
							</p>
						</div>
					</div>
				</div>

				<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
					<button
						onClick={() => setIsChatIaOpen(true)}
						className="px-5 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-purple-200 dark:shadow-none transition-all cursor-pointer text-sm whitespace-nowrap"
					>
						<Sparkles size={18} /> ASSISTENTE IA DE ACORDOS
					</button>

					<button
						onClick={() => setIsAddContatoOpen(true)}
						className="px-5 py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all cursor-pointer text-sm whitespace-nowrap"
					>
						<Users size={18} /> Novo Contato
					</button>

					<button
						onClick={() => setIsAddSplitOpen(true)}
						className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 dark:shadow-none transition-all cursor-pointer text-sm whitespace-nowrap"
					>
						<Split size={18} /> DIVIDIR GASTO (SPLIT)
					</button>
				</div>
			</div>

			{/* KPIS GERAIS */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				<div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
					<p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
						<ArrowDownLeft size={14} /> Total a Receber
					</p>
					<h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
						R$ {totalAReceber.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
					</h3>
					<span className="text-xs text-slate-400 mt-1 block font-medium">Devedores pendentes</span>
				</div>

				<div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
					<p className="text-[10px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1">
						<ArrowUpRight size={14} /> Total a Pagar
					</p>
					<h3 className="text-2xl font-black text-rose-500 mt-1">
						R$ {totalAPagar.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
					</h3>
					<span className="text-xs text-slate-400 mt-1 block font-medium">Sua parte em contas conjuntas</span>
				</div>

				<div className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white p-5 rounded-3xl shadow-md">
					<p className="text-[10px] font-black uppercase tracking-wider text-indigo-200">Saldo Líquido Geral</p>
					<h3 className="text-2xl font-black mt-1">
						{saldoLiquido >= 0 ? "+" : "-"}R$ {Math.abs(saldoLiquido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
					</h3>
					<span className="text-xs text-indigo-100 mt-1 block font-medium">
						{saldoLiquido >= 0 ? "Você tem saldo a receber" : "Você tem saldo a acertar"}
					</span>
				</div>

				<div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
					<p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Contatos & Parcerias</p>
					<h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">
						{contatos.length} contatos
					</h3>
					<span className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 block font-bold">
						{contatos.filter(c => c.email && usuariosComConta.has(c.email.toLowerCase())).length} com conta no app
					</span>
				</div>
			</div>

			{/* FILTROS E ABAS */}
			<div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
				<div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
					<button
						onClick={() => setActiveTab("devedores")}
						className={`px-5 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
							activeTab === "devedores"
								? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
								: "text-slate-600 dark:text-slate-400 hover:text-slate-900"
						}`}
					>
						A Receber ({devedores.length})
					</button>

					<button
						onClick={() => setActiveTab("credores")}
						className={`px-5 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
							activeTab === "credores"
								? "bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm"
								: "text-slate-600 dark:text-slate-400 hover:text-slate-900"
						}`}
					>
						A Pagar ({credores.length})
					</button>

					<button
						onClick={() => setActiveTab("contatos")}
						className={`px-5 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
							activeTab === "contatos"
								? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
								: "text-slate-600 dark:text-slate-400 hover:text-slate-900"
						}`}
					>
						Amigos & Convites ({contatos.length})
					</button>
				</div>

				<div className="relative min-w-[280px]">
					<Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
					<input
						type="text"
						value={termoBusca}
						onChange={e => setTermoBusca(e.target.value)}
						placeholder="Buscar por amigo ou despesa..."
						className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
					/>
				</div>
			</div>

			{/* CONTEÚDO PRINCIPAL */}
			{loading ? (
				<div className="flex justify-center py-20">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
				</div>
			) : activeTab === "devedores" ? (
				devedoresFiltrados.length === 0 ? (
					<div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
						<CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-3" />
						<h3 className="text-xl font-black text-slate-700 dark:text-slate-200">Tudo limpo por aqui!</h3>
						<p className="text-slate-400 text-sm max-w-sm mx-auto mt-1">
							Ninguém te deve dinheiro no momento. Clique em "+ Dividir Gasto" para partilhar uma conta.
						</p>
					</div>
				) : (
					<div className="space-y-4">
						{devedoresFiltrados.map((devedor) => {
							const temConta = devedor.contato?.email && usuariosComConta.has(devedor.contato.email.toLowerCase());
							const isExpanded = expandedId === devedor.contato?.id;

							return (
								<div key={devedor.contato?.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-all">
									<div 
										className="p-5 sm:p-6 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100/70 transition-colors"
										onClick={() => setExpandedId(isExpanded ? null : devedor.contato?.id)}
									>
										<div className="flex items-center gap-4">
											<div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/60 rounded-2xl flex justify-center items-center text-emerald-700 dark:text-emerald-400 font-black text-xl shrink-0">
												{devedor.contato?.nome?.charAt(0).toUpperCase() || "?"}
											</div>
											<div>
												<div className="flex items-center gap-2 flex-wrap">
													<h3 className="font-black text-lg text-slate-800 dark:text-slate-100">
														{devedor.contato?.nome}
													</h3>
													{temConta ? (
														<span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1">
															<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
															Usuário Conectado
														</span>
													) : (
														<button
															onClick={(e) => {
																e.stopPropagation();
																setContatoParaConvite(devedor.contato);
															}}
															className="bg-slate-200 hover:bg-indigo-100 text-slate-600 hover:text-indigo-600 dark:bg-slate-800 dark:hover:bg-indigo-950/40 dark:text-slate-400 text-[10px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1 transition-colors cursor-pointer"
															title="Convidar amigo para ter conta no app"
														>
															<Mail size={10} /> Convidar para o App
														</button>
													)}
												</div>
												<p className="text-xs text-slate-400 mt-0.5">
													{devedor.contato?.telefone || "Sem telefone"} {devedor.contato?.email ? `• ${devedor.contato.email}` : ""}
												</p>
											</div>
										</div>

										<div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 dark:border-slate-800">
											<div className="text-left sm:text-right">
												<p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-wider">Te Deve</p>
												<p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
													R$ {Number(devedor.total_devido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
												</p>
											</div>
											<div className="text-slate-400">
												{isExpanded ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
											</div>
										</div>
									</div>

									{/* ITENS DIVIDIDOS */}
									<AnimatePresence>
										{isExpanded && (
											<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
												<div className="p-5 sm:p-6 space-y-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
													<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
														<h4 className="font-bold text-slate-700 dark:text-slate-300 text-sm">
															Lançamentos e Divisões ({devedor.itens.length})
														</h4>
														<div className="flex items-center gap-2">
															<button
																onClick={() => handleCobrarWhatsApp(devedor)}
																className="flex items-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white px-4 py-2 rounded-xl font-bold transition-all shadow-xs cursor-pointer text-xs"
															>
																<MessageSquare size={15} /> Cobrar no WhatsApp
															</button>
															{!temConta && (
																<button
																	onClick={() => setContatoParaConvite(devedor.contato)}
																	className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer text-xs"
																>
																	<Share2 size={14} /> Convidar Amigo
																</button>
															)}
														</div>
													</div>

													<div className="space-y-3">
														{devedor.itens.map((item: any) => {
															const payInfo = getPaymentInfo(item.observacao);
															const isPartial = !item.terceiro_pago && payInfo && typeof payInfo.valor_pago === "number";
															const restante = isPartial ? Number(item.valor) - payInfo.valor_pago : 0;
															const isSplitMeta = payInfo?.is_split;

															return (
																<div key={item.id} className={`p-4 rounded-2xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border ${item.terceiro_pago ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30' : isPartial ? 'bg-amber-50/40 dark:bg-amber-955/10 border-amber-200 dark:border-amber-900/40' : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800'}`}>
																	<div>
																		<div className="flex items-center flex-wrap gap-2">
																			<p className={`font-bold ${item.terceiro_pago ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}`}>
																				{item.descricao}
																			</p>
																			{isSplitMeta && (
																				<span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 text-[10px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1">
																					<Split size={10} /> Splitwise
																				</span>
																			)}
																			{item.terceiro_pago && (
																				<span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">
																					Quitado
																				</span>
																			)}
																			{isPartial && (
																				<span className="text-[10px] font-black uppercase bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
																					Parcial (Falta R$ {restante.toFixed(2)})
																				</span>
																			)}
																		</div>
																		<p className="text-xs text-slate-400 mt-1">
																			Data: {new Date(item.data + "T12:00:00").toLocaleDateString("pt-BR")}
																			{isSplitMeta && payInfo.valor_total && ` • Total da despesa: R$ ${Number(payInfo.valor_total).toFixed(2)}`}
																		</p>
																	</div>

																	<div className="flex items-center justify-between sm:justify-end gap-4">
																		<p className="font-black text-slate-800 dark:text-slate-100 text-base">
																			R$ {Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
																		</p>
																		<div className="flex gap-2">
																			{(item.terceiro_pago || isPartial) && (
																				<button
																					onClick={() => handleDesfazerPagamento(item.id)}
																					className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-955/20 rounded-xl transition-colors cursor-pointer"
																					title="Desfazer Pagamento"
																				>
																					<RotateCcw size={18} />
																				</button>
																			)}
																			{!item.terceiro_pago && (
																				<button
																					onClick={() => handleOpenPaymentModal(item)}
																					className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-xl transition-colors cursor-pointer"
																					title="Registrar Pagamento / Quitar"
																				>
																					<CheckCircle2 size={20} />
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
							);
						})}
					</div>
				)
			) : activeTab === "credores" ? (
				credoresFiltrados.length === 0 ? (
					<div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
						<CheckCircle2 size={48} className="mx-auto text-indigo-400 mb-3" />
						<h3 className="text-xl font-black text-slate-700 dark:text-slate-200">Nenhum valor a pagar!</h3>
						<p className="text-slate-400 text-sm max-w-sm mx-auto mt-1">
							Você não possui contas em aberto com seus amigos no momento.
						</p>
					</div>
				) : (
					<div className="space-y-4">
						{credoresFiltrados.map((credor) => {
							const isExpanded = expandedId === credor.contato?.id;

							return (
								<div key={credor.contato?.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-all">
									<div 
										className="p-5 sm:p-6 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100/70 transition-colors"
										onClick={() => setExpandedId(isExpanded ? null : credor.contato?.id)}
									>
										<div className="flex items-center gap-4">
											<div className="w-12 h-12 bg-rose-100 dark:bg-rose-950/60 rounded-2xl flex justify-center items-center text-rose-700 dark:text-rose-400 font-black text-xl shrink-0">
												{credor.contato?.nome?.charAt(0).toUpperCase() || "?"}
											</div>
											<div>
												<h3 className="font-black text-lg text-slate-800 dark:text-slate-100">
													{credor.contato?.nome}
												</h3>
												<p className="text-xs text-rose-500 font-bold uppercase tracking-wider">
													Você deve a este amigo
												</p>
											</div>
										</div>

										<div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 dark:border-slate-800">
											<div className="text-left sm:text-right">
												<p className="text-[10px] text-rose-500 font-black uppercase tracking-wider">A Pagar</p>
												<p className="text-2xl font-black text-rose-500">
													R$ {Number(credor.total_devido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
												</p>
											</div>
											<div className="text-slate-400">
												{isExpanded ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
											</div>
										</div>
									</div>

									<AnimatePresence>
										{isExpanded && (
											<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
												<div className="p-5 sm:p-6 space-y-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
													<h4 className="font-bold text-slate-700 dark:text-slate-300 text-sm">
														Despesas Compartilhadas a Pagar ({credor.itens.length})
													</h4>
													<div className="space-y-3">
														{credor.itens.map((item: any) => (
															<div key={item.id} className="p-4 rounded-2xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800">
																<div>
																	<p className="font-bold text-slate-800 dark:text-slate-100">{item.descricao}</p>
																	<p className="text-xs text-slate-400 mt-1">
																		Data: {new Date(item.data + "T12:00:00").toLocaleDateString("pt-BR")} • Total original: R$ {item.valor_original?.toFixed(2)}
																	</p>
																</div>
																<div className="flex items-center gap-4">
																	<p className="font-black text-rose-500 text-base">
																		R$ {Number(item.valor_parcela_usuario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
																	</p>
																	<button
																		onClick={() => handleOpenPaymentModal(item)}
																		className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-xl transition-colors cursor-pointer"
																		title="Marcar como Pago ao Amigo"
																	>
																		<CheckCircle2 size={20} />
																	</button>
																</div>
															</div>
														))}
													</div>
												</div>
											</motion.div>
										)}
									</AnimatePresence>
								</div>
							);
						})}
					</div>
				)
			) : (
				/* ABA DE CONTATOS & CONVITES */
				<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
					<div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800">
						<div>
							<h3 className="font-black text-lg text-slate-800 dark:text-slate-100">Amigos Cadastrados</h3>
							<p className="text-xs text-slate-400">Convide amigos para atualizações dinâmicas e automáticas de divisões.</p>
						</div>
						<button
							onClick={() => setIsAddContatoOpen(true)}
							className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer"
						>
							<Plus size={16} /> Novo Amigo
						</button>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{contatosFiltrados.map(contato => {
							const temConta = contato.email && usuariosComConta.has(contato.email.toLowerCase());

							return (
								<div key={contato.id} className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between space-y-3">
									<div>
										<div className="flex items-center justify-between">
											<h4 className="font-black text-base text-slate-800 dark:text-slate-100">{contato.nome}</h4>
											{temConta ? (
												<span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
													No App
												</span>
											) : (
												<span className="bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
													Offline
												</span>
											)}
										</div>
										<p className="text-xs text-slate-400 mt-1">{contato.email || "Sem e-mail cadastrado"}</p>
										<p className="text-xs text-slate-400">{contato.telefone || "Sem telefone cadastrado"}</p>
									</div>

									<div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
										<button
											onClick={() => setContatoParaConvite(contato)}
											className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
										>
											<Share2 size={13} /> Convidar / Link
										</button>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* MODAL REGISTRAR PAGAMENTO */}
			{paymentModalOpen && selectedItemForPayment && (
				<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
					<div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800">
						<div className="p-6 bg-emerald-600 text-white relative">
							<h3 className="text-2xl font-black flex items-center gap-2">
								<DollarSign size={24} /> Registrar Acerto
							</h3>
							<p className="text-emerald-100 text-xs font-semibold mt-1">
								{selectedItemForPayment.descricao} (Valor: R$ {Number(selectedItemForPayment.valor || selectedItemForPayment.valor_parcela_usuario || 0).toFixed(2)})
							</p>
							<button 
								onClick={() => {
									setPaymentModalOpen(false);
									setSelectedItemForPayment(null);
								}}
								className="absolute top-5 right-5 p-2 rounded-full hover:bg-white/20 transition-colors text-white cursor-pointer"
							>
								<X size={20} />
							</button>
						</div>

						<div className="p-6 space-y-5">
							<div className="space-y-1.5">
								<label className="text-[10px] font-black uppercase text-slate-400 ml-1">Data do Acerto</label>
								<input
									type="date"
									className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
									value={paymentDate}
									onChange={(e) => setPaymentDate(e.target.value)}
								/>
							</div>

							<div className="space-y-1.5">
								<label className="text-[10px] font-black uppercase text-slate-400 ml-1">Tipo de Pagamento</label>
								<div className="grid grid-cols-2 gap-2">
									<button
										type="button"
										onClick={() => setPaymentType("total")}
										className={`py-3 px-4 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
											paymentType === "total"
												? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300"
												: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"
										}`}
									>
										Valor Total (Quitar)
									</button>
									<button
										type="button"
										onClick={() => setPaymentType("parcial")}
										className={`py-3 px-4 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
											paymentType === "parcial"
												? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300"
												: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"
										}`}
									>
										Valor Parcial
									</button>
								</div>
							</div>

							{paymentType === "parcial" && (
								<div className="space-y-1.5">
									<label className="text-[10px] font-black uppercase text-slate-400 ml-1">Valor Pago (R$)</label>
									<input
										type="number"
										step="0.01"
										placeholder="0,00"
										className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl font-black text-emerald-600 dark:text-emerald-400 text-lg outline-none"
										value={partialAmount}
										onChange={(e) => setPartialAmount(e.target.value)}
									/>
								</div>
							)}

							<button
								onClick={handleConfirmarPagamento}
								className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black transition-colors flex items-center justify-center gap-2 cursor-pointer uppercase text-sm"
							>
								Confirmar Acerto
							</button>
						</div>
					</div>
				</div>
			)}

			{/* MODAL NOVO CONTATO */}
			{isAddContatoOpen && (
				<AddContatoWeb
					onClose={() => setIsAddContatoOpen(false)}
					onSuccess={() => {
						loadAllData();
					}}
				/>
			)}

			{/* MODAL SPLITWISE (NOVA DIVISÃO) */}
			{isAddSplitOpen && (
				<AddSplitDespesaModal
					isOpen={isAddSplitOpen}
					onClose={() => setIsAddSplitOpen(false)}
					onSuccess={() => {
						loadAllData();
					}}
					onOpenAddContato={() => setIsAddContatoOpen(true)}
				/>
			)}

			{/* MODAL DE CONVITE */}
			{contatoParaConvite && (
				<ConviteAmigoModal
					isOpen={!!contatoParaConvite}
					onClose={() => setContatoParaConvite(null)}
					contato={contatoParaConvite}
					userName={userName}
				/>
			)}

			{/* MODAL CHAT DE ACORDOS IA */}
			{isChatIaOpen && (
				<ChatAcordosIaModal
					isOpen={isChatIaOpen}
					onClose={() => setIsChatIaOpen(false)}
					onSuccess={() => {
						loadAllData();
					}}
					userId={userId}
					contatosDisponiveis={contatos}
				/>
			)}
		</motion.div>
	);
}
