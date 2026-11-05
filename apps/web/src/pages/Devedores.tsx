import { useState, useEffect, useMemo } from "react";
import { authService } from "../../../../packages/services/auth.service";
import { financeService } from "../../../../packages/services/finance.service";
import { despesasCompartilhadasService } from "../../../../packages/services/despesas-compartilhadas.service";
import type { Grupo } from "../../../../packages/services/despesas-compartilhadas.service";
import { supabase } from "../../../../packages/services/supabase";
import { motion } from "framer-motion";
import {
	Download,
	Users,
	CheckCircle2,
	X,
	Plus,
	Split,
	Sparkles,
	Search,
	UserCheck,
	MessageSquare,
	ArrowUpRight,
	ArrowDownLeft,
	Layers,
	ArrowRight,
	Send,
	Check,
	Trash2,
	Receipt } from "lucide-react";
import toast from "react-hot-toast";
import AddContatoWeb from "../components/AddContatoWeb";
import AddSplitDespesaModal from "../components/AddSplitDespesaModal";
import ConviteAmigoModal from "../components/ConviteAmigoModal";
import CompartilhadoComigo from "../components/CompartilhadoComigo";
import ChatAcordosIaModal from "../components/ChatAcordosIaModal";
import CriarGrupoModal from "../components/CriarGrupoModal";
import { telefoneWhatsApp } from "../../../../packages/services/convite.service";
import { exportarExcelGrupo, exportarExcelPessoa } from "../lib/relatorioDivisao";

export default function Devedores() {
	const [userId, setUserId] = useState<string>("");
	const [userName, setUserName] = useState<string>("Você");
	const [loading, setLoading] = useState(true);

	// DADOS
	const [devedores, setDevedores] = useState<any[]>([]);
	const [credores, setCredores] = useState<any[]>([]);
	const [contatos, setContatos] = useState<any[]>([]);
	const [grupos, setGrupos] = useState<Grupo[]>([]);
	const [todasDespesasSplit, setTodasDespesasSplit] = useState<any[]>([]);
	const [usuariosComConta, setUsuariosComConta] = useState<Set<string>>(
		new Set(),
	);

	// NAVEGAÇÃO ENTRE ABAS
	const [activeTab, setActiveTab] = useState<
		"grupos" | "amigos" | "atividades" | "convites"
	>("grupos");
	const [termoBusca, setTermoBusca] = useState("");

	// VISÃO DETALHADA DE UM GRUPO SELECIONADO
	const [grupoSelecionado, setGrupoSelecionado] = useState<Grupo | null>(null);

	// MODAIS
	const [isAddSplitOpen, setIsAddSplitOpen] = useState(false);
	const [isAddContatoOpen, setIsAddContatoOpen] = useState(false);
	const [isCriarGrupoOpen, setIsCriarGrupoOpen] = useState(false);
	const [isChatIaOpen, setIsChatIaOpen] = useState(false);
	const [contatoParaConvite, setContatoParaConvite] = useState<any>(null);
	const [initialGrupoIdForSplit, setInitialGrupoIdForSplit] = useState<
		string | null
	>(null);

	// LIQUIDAÇÃO / SETTLE UP
	const [paymentModalOpen, setPaymentModalOpen] = useState(false);
	const [selectedItemForPayment, setSelectedItemForPayment] =
		useState<any>(null);
	const [paymentDate, setPaymentDate] = useState(
		() => new Date().toISOString().split("T")[0],
	);
	const [paymentType, setPaymentType] = useState<"total" | "parcial">("total");
	const [partialAmount, setPartialAmount] = useState("");

	const loadAllData = async () => {
		setLoading(true);
		try {
			const user = await authService.getCurrentUser();
			if (!user) return;
			setUserId(user.id);
			setUserName(
				user.nome || user.email?.split("@")[0] || "Você",
			);

			const [devedoresData, contatosRes, transacoesRes, gruposRes] =
				await Promise.all([
					financeService.getDevedores(user.id),
					supabase
						.from("contatos")
						.select("*")
						.eq("usuario_id", user.id)
						.order("nome"),
					supabase
						.from("transacoes")
						.select("*, cartoes(id, nome, cor_hex), contas_bancarias(id, nome, banco)")
						.eq("usuario_id", user.id)
						.or(
							"terceiro.eq.true,observacao.ilike.%is_split%,observacao.ilike.%parceria_credor_id%",
						)
						.order("data", { ascending: false }),
					despesasCompartilhadasService.getGrupos(user.id),
				]);

			setDevedores(devedoresData || []);
			
			// Remove e-mails dummy @example.com e @exemplo.com dos contatos
			const contatosRaw = contatosRes.data || [];
			const contatosList = contatosRaw.map((c: any) => {
				const isFake = c.email && (c.email.toLowerCase().includes("@example.com") || c.email.toLowerCase().includes("@exemplo.com"));
				return isFake ? { ...c, email: null } : c;
			});

			const idsFake = contatosRaw
				.filter((c: any) => c.email && (c.email.toLowerCase().includes("@example.com") || c.email.toLowerCase().includes("@exemplo.com")))
				.map((c: any) => c.id);

			if (idsFake.length > 0) {
				supabase.from("contatos").update({ email: null }).in("id", idsFake).then(() => {});
			}

			setContatos(contatosList);
			setGrupos(gruposRes || []);

			const txs = transacoesRes.data || [];
			setTodasDespesasSplit(txs);

			// Mapeia e-mails que possuem conta no sistema
			const emailsDosContatos = Array.from(
				new Set(
					contatosList
						.map((c: any) => (c.email || "").toLowerCase().trim())
						.filter(Boolean),
				),
			);

			setUsuariosComConta(await authService.emailsComConta(emailsDosContatos as string[]));

			// Processamento de Credores (onde o usuário deve para alguém)
			const credoresMap = new Map();

			txs.forEach((g: any) => {
				let contatoEncontrado = null;
				let isCredorItem = false;
				let valorParcela = Number(g.valor || 0);
				let valorOriginal = valorParcela;

				if (g.observacao) {
					try {
						if (
							typeof g.observacao === "string" &&
							g.observacao.trim().startsWith("{")
						) {
							const meta = JSON.parse(g.observacao);
							if (meta.parceria_credor_id) {
								contatoEncontrado = contatosList.find(
									(c: any) => c.id === meta.parceria_credor_id,
								);
								isCredorItem = true;
								valorOriginal = meta.valor_total || valorParcela;
							}
						}
					} catch (e) {}
				}

				if (isCredorItem && contatoEncontrado) {
					const cId = contatoEncontrado.id;
					if (!credoresMap.has(cId)) {
						credoresMap.set(cId, {
							contato: contatoEncontrado,
							total_devido: 0,
							itens: [],
						});
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
						observacao: g.observacao,
						cartao_nome: cartaoNome,
						conta_nome: contaNome,
						forma_pagamento: formaPagamento,
						is_credito: Boolean(g.cartao_id),
					});
				}
			});

			const credoresList = Array.from(credoresMap.values()).map((c) => {
				const total_devido = c.itens
					.filter((i: any) => !i.quitado)
					.reduce(
						(sum: number, i: any) => sum + Number(i.valor_parcela_usuario),
						0,
					);
				return { ...c, total_devido };
			});

			setCredores(credoresList);

			// Se havia um grupo selecionado, atualiza-o com dados frescos
			if (grupoSelecionado) {
				const atualizado = gruposRes.find((g) => g.id === grupoSelecionado.id);
				if (atualizado) setGrupoSelecionado(atualizado);
			}
		} catch (error) {
			console.error(error);
			toast.error("Erro ao carregar despesas compartilhadas");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		let isMounted = true;
		let channelTxs: any = null;
		let channelContatos: any = null;

		loadAllData();

		async function setupRealtime() {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (user && isMounted) {
				channelTxs = financeService.subscribeToChanges(
					"transacoes",
					user.id,
					() => {
						if (isMounted) loadAllData();
					},
				);
				channelContatos = financeService.subscribeToChanges(
					"contatos",
					user.id,
					() => {
						if (isMounted) loadAllData();
					},
				);
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
			if (typeof observacao === "string" && observacao.trim().startsWith("{")) {
				return JSON.parse(observacao);
			}
		} catch (e) {}
		return null;
	};

	// COBRAR VIA WHATSAPP COM RELATÓRIO COMPARTILHADAS
	const handleCobrarWhatsApp = (devedor: any) => {
		const telefone = telefoneWhatsApp(devedor.contato?.telefone);

		const itensPendentes = (devedor.itens || []).filter(
			(i: any) => !i.terceiro_pago,
		);
		if (itensPendentes.length === 0) {
			toast.error("Não há despesas pendentes para este contato.");
			return;
		}

		const itensText = itensPendentes
			.map((i: any) => {
				const dataFormatada = new Date(i.data + "T12:00:00").toLocaleDateString(
					"pt-BR",
				);
				const payInfo = getPaymentInfo(i.observacao);
				if (payInfo && typeof payInfo.valor_pago === "number") {
					const restante = Math.max(0, Number(i.valor) - payInfo.valor_pago);
					return `• ${i.descricao} (${dataFormatada}): R$ ${Number(i.valor).toFixed(2)} (Resta: R$ ${restante.toFixed(2)})`;
				}
				return `• ${i.descricao} (${dataFormatada}): R$ ${Number(i.valor).toFixed(2)}`;
			})
			.join("\n");

		const total = Number(devedor.total_devido).toFixed(2);
		const mensagem = `Olá, ${devedor.contato.nome}! Tudo bem?\n\nSegue o demonstrativo das despesas que dividimos:\n\n${itensText}\n\n*Total em aberto:* R$ ${total}\n\nPor favor, me envie o comprovante quando realizar o Pix. Valeu!`;

		// Sem telefone válido, o WhatsApp abre para escolher o contato manualmente
		const destino = telefone ? `https://wa.me/${telefone}` : "https://wa.me/";
		window.open(`${destino}?text=${encodeURIComponent(mensagem)}`, "_blank", "noopener");
	};

	const handleDeleteContato = async (contatoId: string, nomeContato: string) => {
		if (!window.confirm(`Deseja realmente excluir o amigo/contato "${nomeContato}"?`)) return;
		try {
			const { error } = await supabase.from("contatos").delete().eq("id", contatoId);
			if (error) throw error;
			toast.success(`Contato "${nomeContato}" excluído.`);
			loadAllData();
		} catch (e: any) {
			toast.error(
				e?.code === "23503"
					? `"${nomeContato}" tem despesas ou grupos vinculados. Remova os vínculos antes de excluir.`
					: "Erro ao excluir contato.",
			);
		}
	};

	// LIQUIDAÇÃO (SETTLE UP)
	const handleOpenPaymentModal = (item: any) => {
		setSelectedItemForPayment(item);
		setPaymentDate(new Date().toISOString().split("T")[0]);
		setPaymentType("total");
		setPartialAmount("");
		setPaymentModalOpen(true);
	};

	const handleConfirmarPagamento = async () => {
		if (!selectedItemForPayment) return;
		const valorOriginal = Number(
			selectedItemForPayment.valor ||
				selectedItemForPayment.valor_parcela_usuario ||
				0,
		);
		const infoAnterior = getPaymentInfo(selectedItemForPayment.observacao) || {};
		const jaPago = Number(infoAnterior.valor_pago) || 0;
		const restante = Math.max(0, Math.round((valorOriginal - jaPago) * 100) / 100);
		let valorPago = restante;
		let isTotal = paymentType === "total";

		if (!isTotal) {
			const parsedPartial = parseFloat(
				partialAmount.replace(/\./g, "").replace(",", "."),
			);
			if (
				isNaN(parsedPartial) ||
				parsedPartial <= 0 ||
				parsedPartial > restante
			) {
				toast.error(
					`Informe um valor maior que zero e até R$ ${restante.toFixed(2)} (restante)`,
				);
				return;
			}
			valorPago = parsedPartial;
			// Parcial que quita o restante vira pagamento total
			if (Math.abs(parsedPartial - restante) < 0.005) isTotal = true;
		}

		try {
			const obsTexto = selectedItemForPayment.observacao;
			// Observação em texto (ex.: "Categoria: Lazer") é preservada, não sobrescrita
			const base = getPaymentInfo(obsTexto) || (obsTexto ? { observacao_original: obsTexto } : {});
			const pagamentos = [...(Array.isArray(base.pagamentos) ? base.pagamentos : []), { valor: valorPago, data: paymentDate }];
			const metadata = {
				...base,
				pagamentos,
				valor_pago: Math.round((jaPago + valorPago) * 100) / 100,
				data_pagamento: paymentDate,
				total: isTotal,
			};

			const { error } = await supabase
				.from("transacoes")
				.update({
					terceiro_pago: isTotal,
					observacao: JSON.stringify(metadata),
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

	/** Remove os dados de pagamento da observação, devolvendo o texto original quando existir. */
	const observacaoSemPagamento = (obs?: string | null): string | null => {
		const info = getPaymentInfo(obs || "");
		if (!info) return obs ?? null;
		const { valor_pago, data_pagamento, total, pagamentos, observacao_original, ...resto } = info;
		if (Object.keys(resto).length === 0) return observacao_original ?? null;
		return JSON.stringify(observacao_original ? { ...resto, observacao_original } : resto);
	};

	const handleDesfazerPagamento = async (gastoId: string) => {
		if (
			!confirm("Deseja realmente reabrir esta despesa e desfazer o pagamento?")
		)
			return;
		try {
			const { error } = await supabase
				.from("transacoes")
				.update({
					terceiro_pago: false,
					observacao: observacaoSemPagamento(todasDespesasSplit.find((t: any) => t.id === gastoId)?.observacao),
				})
				.eq("id", gastoId);

			if (error) throw error;

			toast.success("Despesa reaberta com sucesso!");
			loadAllData();
		} catch (error) {
			console.error(error);
			toast.error("Erro ao desfazer pagamento");
		}
	};

	const handleExcluirGrupo = async (grupo: Grupo) => {
		if (
			!confirm(
				`Deseja realmente excluir o grupo "${grupo.nome}"? As despesas existentes permanecerão no histórico.`,
			)
		)
			return;
		try {
			await despesasCompartilhadasService.excluirGrupo(userId, grupo.id);
			toast.success(`Grupo "${grupo.nome}" excluído`);
			if (grupoSelecionado?.id === grupo.id) {
				setGrupoSelecionado(null);
			}
			loadAllData();
		} catch (e) {
			toast.error("Erro ao excluir grupo");
		}
	};

	// CÁLCULOS TOTAIS
	const totalAReceber = devedores.reduce(
		(sum, d) => sum + Number(d.total_devido || 0),
		0,
	);
	const totalAPagar = credores.reduce(
		(sum, c) => sum + Number(c.total_devido || 0),
		0,
	);
	const saldoLiquidoGeral = totalAReceber - totalAPagar;

	// FILTROS DE BUSCA
	const gruposFiltrados = useMemo(() => {
		if (!termoBusca.trim()) return grupos;
		const q = termoBusca.toLowerCase();
		return grupos.filter(
			(g) =>
				g.nome.toLowerCase().includes(q) ||
				g.membros?.some((m) => m.nome.toLowerCase().includes(q)),
		);
	}, [grupos, termoBusca]);

	const devedoresFiltrados = useMemo(() => {
		if (!termoBusca.trim()) return devedores;
		const query = termoBusca.toLowerCase();
		return devedores.filter(
			(d) =>
				(d.contato?.nome || "").toLowerCase().includes(query) ||
				(d.itens || []).some((i: any) =>
					(i.descricao || "").toLowerCase().includes(query),
				),
		);
	}, [devedores, termoBusca]);

	// DESPESAS DO GRUPO SELECIONADO
	const despesasDoGrupoSelecionado = useMemo(() => {
		if (!grupoSelecionado) return [];
		return todasDespesasSplit.filter((d) => {
			const meta = getPaymentInfo(d.observacao);
			return meta?.grupo_id === grupoSelecionado.id;
		});
	}, [grupoSelecionado, todasDespesasSplit]);

	// BALANÇO E SIMPLIFICAÇÃO DO GRUPO SELECIONADO
	const analiseDoGrupo = useMemo(() => {
		if (!grupoSelecionado || !grupoSelecionado.membros) return null;
		return despesasCompartilhadasService.calcularBalancoGrupo(
			grupoSelecionado.membros,
			despesasDoGrupoSelecionado,
		);
	}, [grupoSelecionado, despesasDoGrupoSelecionado]);

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			className="space-y-6 sm:space-y-8 pb-20">
			<CompartilhadoComigo />
			{/* ========================================================
          CABEÇALHO COM IDENTIDADE COMPARTILHADAS
         ======================================================== */}
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl sm:rounded-[36px] shadow-sm border border-slate-100 dark:border-slate-800">
				<div>
					<div className="flex items-center gap-3">
						<div className="bg-gradient-to-tr from-emerald-500 to-teal-600 p-3 rounded-2xl text-white shadow-md shadow-emerald-500/20">
							<Split size={28} />
						</div>
						<div>
							<div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 mb-1">
								Despesas Compartilhadas
							</div>
							<h1 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
								Devedores & Divisão de Contas
							</h1>
							<p className="text-slate-400 dark:text-slate-500 font-medium text-xs sm:text-sm mt-0.5">
								Crie grupos, convide amigos e divida despesas com rateio
								inteligente em partes iguais, exatas ou porcentagens.
							</p>
						</div>
					</div>
				</div>

				{/* BOTÕES DE AÇÃO RÁPIDA */}
				<div className="flex flex-wrap items-center gap-2.5">
					<button
						onClick={() => setIsChatIaOpen(true)}
						className="px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-md shadow-purple-500/20 transition-all cursor-pointer text-xs whitespace-nowrap">
						<Sparkles size={16} className="text-amber-300 animate-pulse" />{" "}
						Assistente IA
					</button>

					<button
						onClick={() => setIsCriarGrupoOpen(true)}
						className="px-4 py-3 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/30 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-2xl font-bold flex items-center justify-center gap-2 border border-purple-200 dark:border-purple-800/40 transition-all cursor-pointer text-xs whitespace-nowrap">
						<Layers size={16} /> Criar Grupo
					</button>

					<button
						onClick={() => setIsAddContatoOpen(true)}
						className="px-4 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all cursor-pointer text-xs whitespace-nowrap">
						<UserCheck size={16} /> Novo Amigo
					</button>

					<button
						onClick={() => {
							setInitialGrupoIdForSplit(null);
							setIsAddSplitOpen(true);
						}}
						className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer text-xs whitespace-nowrap">
						<Split size={16} /> Dividir Gasto (Split)
					</button>
				</div>
			</div>

			{/* ========================================================
          KPIS GERAIS COMPARTILHADAS
         ======================================================== */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				{/* Total a Receber */}
				<div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
					<p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
						<ArrowDownLeft size={14} /> Total que te devem
					</p>
					<h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
						R${" "}
						{totalAReceber.toLocaleString("pt-BR", {
							minimumFractionDigits: 2,
						})}
					</h3>
					<span className="text-xs text-slate-400 mt-1 block font-medium">
						{devedores.filter((d) => d.total_devido > 0).length} amigo(s) com
						valor pendente
					</span>
				</div>

				{/* Total a Pagar */}
				<div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
					<p className="text-[10px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1">
						<ArrowUpRight size={14} /> Total que você deve
					</p>
					<h3 className="text-2xl font-black text-rose-500 mt-1">
						R${" "}
						{totalAPagar.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
					</h3>
					<span className="text-xs text-slate-400 mt-1 block font-medium">
						{credores.filter((c) => c.total_devido > 0).length} amigo(s) a quem
						você deve
					</span>
				</div>

				{/* Saldo Líquido Geral */}
				<div
					className={`p-5 rounded-3xl shadow-md text-white ${
						saldoLiquidoGeral >= 0
							? "bg-gradient-to-br from-indigo-600 to-purple-600 shadow-indigo-500/20"
							: "bg-gradient-to-br from-rose-600 to-red-700 shadow-rose-500/20"
					}`}>
					<p className="text-[10px] font-black uppercase tracking-wider text-white/80">
						Saldo Líquido Geral
					</p>
					<h3 className="text-2xl font-black mt-1">
						{saldoLiquidoGeral >= 0 ? "+" : "-"}R${" "}
						{Math.abs(saldoLiquidoGeral).toLocaleString("pt-BR", {
							minimumFractionDigits: 2,
						})}
					</h3>
					<span className="text-xs text-white/80 mt-1 block font-medium">
						{saldoLiquidoGeral >= 0
							? "Você está positivo no geral"
							: "Você tem acertos a fazer"}
					</span>
				</div>

				{/* Grupos e Conexões */}
				<div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
					<p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
						Grupos & Conexões
					</p>
					<h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">
						{grupos.length} grupos • {contatos.length} amigos
					</h3>
					<span className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 block font-bold">
						{
							contatos.filter(
								(c) => c.email && usuariosComConta.has(c.email.toLowerCase()),
							).length
						}{" "}
						com conta ativa no app
					</span>
				</div>
			</div>

			{/* ========================================================
          ABAS DE NAVEGAÇÃO 
         ======================================================== */}
			{!grupoSelecionado && (
				<div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
					<div className="flex flex-wrap bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 gap-1">
						<button
							onClick={() => setActiveTab("grupos")}
							className={`px-4 sm:px-5 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center gap-2 ${
								activeTab === "grupos"
									? "bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-sm"
									: "text-slate-600 dark:text-slate-400 hover:text-slate-900"
							}`}>
							<Layers size={15} /> Grupos ({grupos.length})
						</button>

						<button
							onClick={() => setActiveTab("amigos")}
							className={`px-4 sm:px-5 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center gap-2 ${
								activeTab === "amigos"
									? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
									: "text-slate-600 dark:text-slate-400 hover:text-slate-900"
							}`}>
							<Users size={15} /> Amigos & Saldos (
							{devedores.length + credores.length})
						</button>

						<button
							onClick={() => setActiveTab("atividades")}
							className={`px-4 sm:px-5 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center gap-2 ${
								activeTab === "atividades"
									? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
									: "text-slate-600 dark:text-slate-400 hover:text-slate-900"
							}`}>
							<Split size={15} /> Atividades & Lançamentos (
							{todasDespesasSplit.length})
						</button>

						<button
							onClick={() => setActiveTab("convites")}
							className={`px-4 sm:px-5 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center gap-2 ${
								activeTab === "convites"
									? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
									: "text-slate-600 dark:text-slate-400 hover:text-slate-900"
							}`}>
							<Send size={15} /> Convidar Amigos ({contatos.length})
						</button>
					</div>

					<div className="relative min-w-[260px]">
						<Search
							size={16}
							className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
						/>
						<input
							type="text"
							value={termoBusca}
							onChange={(e) => setTermoBusca(e.target.value)}
							placeholder="Buscar grupo, amigo ou despesa..."
							className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
						/>
					</div>
				</div>
			)}

			{/* ========================================================
          CONTEÚDO PRINCIPAL
         ======================================================== */}
			{loading ? (
				<div className="flex flex-col items-center justify-center py-20 gap-3">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
					<p className="text-xs text-slate-400 font-semibold">
						Carregando despesas compartilhadas...
					</p>
				</div>
			) : grupoSelecionado ? (
				/* ========================================================
           VISÃO DETALHADA DO GRUPO SELECIONADO
           ======================================================== */
				<div className="space-y-6 animate-in fade-in duration-200">
					{/* BARRA SUPERIOR DO GRUPO */}
					<div
						className="p-6 sm:p-8 rounded-3xl text-white shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6"
						style={{ backgroundColor: grupoSelecionado.cor_hex || "#8b5cf6" }}>
						<div>
							<button
								onClick={() => setGrupoSelecionado(null)}
								className="inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-white mb-3 transition-colors cursor-pointer">
								← Voltar para todos os grupos
							</button>
							<h2 className="text-2xl sm:text-3xl font-black">
								{grupoSelecionado.nome}
							</h2>
							<p className="text-white/80 text-xs sm:text-sm mt-1 max-w-xl">
								{grupoSelecionado.descricao ||
									"Grupo de despesas compartilhadas."}{" "}
								• {grupoSelecionado.membros?.length || 0} membros
							</p>
						</div>

						<div className="flex flex-wrap items-center gap-3">
							<button
								onClick={() => {
									setInitialGrupoIdForSplit(grupoSelecionado.id);
									setIsAddSplitOpen(true);
								}}
								className="px-5 py-3 bg-white text-slate-900 rounded-2xl font-black text-xs shadow-md hover:bg-slate-50 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap">
								<Plus size={16} /> Adicionar Despesa ao Grupo
							</button>
							<button
								onClick={() =>
									exportarExcelGrupo({
										grupo: grupoSelecionado,
										despesas: despesasDoGrupoSelecionado,
										balancos: analiseDoGrupo?.balancos,
										acertos: analiseDoGrupo?.simplificacao,
									}).catch(() => toast.error("Não foi possível gerar a planilha."))
								}
								className="px-4 py-3 bg-white/20 hover:bg-white/30 text-white rounded-2xl font-black text-xs transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap"
								title="Baixar planilha do grupo">
								<Download size={16} /> Excel
							</button>
							<button
								onClick={() => handleExcluirGrupo(grupoSelecionado)}
								className="p-3 bg-white/20 hover:bg-rose-600/80 text-white rounded-2xl transition-colors cursor-pointer"
								title="Excluir Grupo">
								<Trash2 size={16} />
							</button>
						</div>
					</div>

					{/* BALANÇOS E SIMPLIFICAÇÃO DO GRUPO */}
					{analiseDoGrupo && (
						<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
							{/* QUEM DEVE A QUEM (SIMPLIFICAÇÃO DE DÍVIDAS) */}
							<div className="lg:col-span-1 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
								<div className="flex items-center justify-between">
									<h3 className="font-black text-base text-slate-800 dark:text-slate-100 flex items-center gap-2">
										<Sparkles size={18} className="text-amber-500" /> Como
										Liquidar (Settle Up)
									</h3>
									<span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
										Menos pagamentos
									</span>
								</div>

								{analiseDoGrupo.simplificacao.length === 0 ? (
									<div className="p-6 text-center text-slate-400 text-xs font-semibold bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
										<CheckCircle2
											size={32}
											className="mx-auto text-emerald-500 mb-2"
										/>
										Tudo quitado neste grupo! Não há saldos pendentes.
									</div>
								) : (
									<div className="space-y-2.5">
										{analiseDoGrupo.simplificacao.map((s, idx) => (
											<div
												key={idx}
												className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs gap-3">
												<div className="min-w-0">
													<span className="font-black text-slate-800 dark:text-slate-100">
														{s.devedorNome}
													</span>
													<span className="text-slate-400 mx-1">paga para</span>
													<span className="font-black text-purple-600 dark:text-purple-400">
														{s.credorNome}
													</span>
												</div>
												<span className="font-black text-emerald-600 dark:text-emerald-400 text-sm whitespace-nowrap">
													R${" "}
													{s.valor.toLocaleString("pt-BR", {
														minimumFractionDigits: 2,
													})}
												</span>
											</div>
										))}
									</div>
								)}
							</div>

							{/* SALDO DE CADA MEMBRO */}
							<div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
								<div className="flex items-center justify-between">
									<h3 className="font-black text-base text-slate-800 dark:text-slate-100">
										Balanço dos Membros do Grupo
									</h3>
									<span className="text-xs font-bold text-slate-400">
										Total gasto no grupo:{" "}
										<strong className="text-slate-800 dark:text-slate-100">
											R${" "}
											{analiseDoGrupo.totalGastoGrupo.toLocaleString("pt-BR", {
												minimumFractionDigits: 2,
											})}
										</strong>
									</span>
								</div>

								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
									{analiseDoGrupo.balancos.map((b) => (
										<div
											key={b.membroId}
											className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-3">
											<div>
												<h4 className="font-black text-xs text-slate-800 dark:text-slate-100">
													{b.nome}
												</h4>
												<p className="text-[10px] text-slate-400 mt-0.5">
													Pagou: R$ {b.totalPago.toFixed(2)} • Consumiu: R${" "}
													{b.totalDevido.toFixed(2)}
												</p>
											</div>

											<div className="text-right shrink-0">
												{b.saldoLiquido > 0.01 ? (
													<span className="inline-block px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
														+R$ {b.saldoLiquido.toFixed(2)}
													</span>
												) : b.saldoLiquido < -0.01 ? (
													<span className="inline-block px-2.5 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
														-R$ {Math.abs(b.saldoLiquido).toFixed(2)}
													</span>
												) : (
													<span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
														Quitado
													</span>
												)}
											</div>
										</div>
									))}
								</div>
							</div>
						</div>
					)}

					{/* HISTÓRICO DE DESPESAS DO GRUPO */}
					<div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
						<h3 className="font-black text-base text-slate-800 dark:text-slate-100">
							Despesas Divididas neste Grupo (
							{despesasDoGrupoSelecionado.length})
						</h3>

						{despesasDoGrupoSelecionado.length === 0 ? (
							<div className="p-8 text-center text-slate-400 text-xs font-medium bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
								Nenhuma despesa dividida neste grupo ainda. Clique em "Adicionar
								Despesa ao Grupo" para começar!
							</div>
						) : (
							<div className="space-y-3">
								{despesasDoGrupoSelecionado.map((d) => {
									const meta = getPaymentInfo(d.observacao);
									return (
										<div
											key={d.id}
											className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
											<div className="flex items-center gap-3">
												<div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black shrink-0">
													<Split size={18} />
												</div>
												<div>
													<h4 className="font-black text-xs text-slate-800 dark:text-slate-100">
														{d.descricao}
													</h4>
													<p className="text-[10px] text-slate-400 mt-0.5">
														Pago por{" "}
														<strong className="text-slate-600 dark:text-slate-300">
															{meta?.pago_por_nome || "Participante"}
														</strong>{" "}
														em{" "}
														{new Date(d.data + "T12:00:00").toLocaleDateString(
															"pt-BR",
														)}
														{meta?.metodo_divisao &&
															` • Método: ${meta.metodo_divisao}`}
													</p>
												</div>
											</div>

											<div className="flex items-center justify-between sm:justify-end gap-3">
												<span className="font-black text-sm text-slate-900 dark:text-slate-100">
													R${" "}
													{Number(meta?.valor_total || d.valor).toLocaleString(
														"pt-BR",
														{ minimumFractionDigits: 2 },
													)}
												</span>
												{d.terceiro_pago ? (
													<span className="flex items-center gap-2">
														<span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
														Quitado
													</span>
														<button
															onClick={() => handleDesfazerPagamento(d.id)}
															title="Reabrir esta despesa"
															className="text-[10px] font-bold text-slate-400 hover:text-rose-600 underline cursor-pointer">
															Desfazer
														</button>
													</span>
												) : (
													<button
														onClick={() => handleOpenPaymentModal(d)}
														className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer">
														Quitar / Settle
													</button>
												)}
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</div>
			) : activeTab === "grupos" ? (
				/* ========================================================
           ABA 1: LISTAGEM DE GRUPOS COMPARTILHADAS
           ======================================================== */
				<div className="space-y-4">
					<div className="flex justify-between items-center">
						<div>
							<h2 className="text-xl font-black text-slate-800 dark:text-slate-100">
								Seus Grupos de Divisão
							</h2>
							<p className="text-xs text-slate-400 font-medium">
								Crie grupos para viagens, república, casal ou rolês e mantenha
								as contas organizadas.
							</p>
						</div>
						<button
							onClick={() => setIsCriarGrupoOpen(true)}
							className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5">
							<Plus size={14} /> Novo Grupo
						</button>
					</div>

					{gruposFiltrados.length === 0 ? (
						<div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-4">
							<div className="w-16 h-16 rounded-3xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center mx-auto">
								<Layers size={32} />
							</div>
							<div>
								<h3 className="font-black text-base text-slate-800 dark:text-slate-100">
									Nenhum grupo encontrado
								</h3>
								<p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
									Crie seu primeiro grupo para dividir viagens com amigos,
									compras de casa ou eventos do fim de semana.
								</p>
							</div>
							<button
								onClick={() => setIsCriarGrupoOpen(true)}
								className="px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-black text-xs shadow-md transition-all cursor-pointer inline-flex items-center gap-2">
								<Plus size={16} /> Criar Primeiro Grupo
							</button>
						</div>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{gruposFiltrados.map((grupo) => {
								const despesasDoGrupo = todasDespesasSplit.filter((d) => {
									const m = getPaymentInfo(d.observacao);
									return m?.grupo_id === grupo.id;
								});
								const totalGasto = despesasDoGrupo.reduce((s, d) => {
									const m = getPaymentInfo(d.observacao);
									return s + Number(m?.valor_total || d.valor || 0);
								}, 0);

								return (
									<div
										key={grupo.id}
										onClick={() => setGrupoSelecionado(grupo)}
										className="group bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:border-purple-300 dark:hover:border-purple-800/60 transition-all cursor-pointer flex flex-col justify-between">
										<div>
											<div className="flex items-center justify-between mb-4">
												<div
													className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black shadow-sm"
													style={{
														backgroundColor: grupo.cor_hex || "#8b5cf6",
													}}>
													<Layers size={22} />
												</div>
												<span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
													{grupo.tipo}
												</span>
											</div>

											<h3 className="font-black text-lg text-slate-800 dark:text-slate-100 group-hover:text-purple-600 transition-colors">
												{grupo.nome}
											</h3>
											<p className="text-xs text-slate-400 mt-1 line-clamp-2">
												{grupo.membros?.map((m) => m.nome).join(", ") ||
													"Sem membros"}
											</p>
										</div>

										<div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
											<div>
												<span className="text-[10px] font-bold text-slate-400 block">
													Total Gasto
												</span>
												<span className="text-sm font-black text-slate-800 dark:text-slate-100">
													R${" "}
													{totalGasto.toLocaleString("pt-BR", {
														minimumFractionDigits: 2,
													})}
												</span>
											</div>

											<span className="text-xs font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
												Ver Grupo <ArrowRight size={14} />
											</span>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			) : activeTab === "amigos" ? (
				/* ========================================================
           ABA 2: AMIGOS E SALDOS (DEVEDORES & CREDORES)
           ======================================================== */
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{/* DEVEDORES (QUEM TE DEVE) */}
					<div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
						<div className="flex items-center justify-between">
							<div>
								<h3 className="font-black text-base text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
									<ArrowDownLeft size={18} /> Quem te Deve (A Receber)
								</h3>
								<p className="text-xs text-slate-400 font-medium">
									Contas pagas por você com partes em aberto
								</p>
							</div>
							<span className="font-black text-sm text-emerald-600">
								R${" "}
								{totalAReceber.toLocaleString("pt-BR", {
									minimumFractionDigits: 2,
								})}
							</span>
						</div>

						{devedoresFiltrados.length === 0 ? (
							<div className="p-8 text-center text-slate-400 text-xs font-medium bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
								Nenhum amigo te deve nada no momento. Tudo certo!
							</div>
						) : (
							<div className="space-y-3">
								{devedoresFiltrados.map((d, idx) => (
									<div
										key={idx}
										className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col gap-3">
										<div className="flex items-center justify-between">
											<div>
												<h4 className="font-black text-sm text-slate-800 dark:text-slate-100">
													{d.contato.nome}
												</h4>
												<p className="text-[10px] text-slate-400">
													{d.contato.telefone ||
														d.contato.email ||
														"Sem contato cadastrado"}
												</p>
											</div>
											<div className="text-right">
												<span className="font-black text-base text-emerald-600 dark:text-emerald-400">
													R${" "}
													{Number(d.total_devido).toLocaleString("pt-BR", {
														minimumFractionDigits: 2,
													})}
												</span>
											</div>
										</div>

										<div className="flex items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
											<button
												onClick={() => handleCobrarWhatsApp(d)}
												className="flex-1 py-2 px-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
												<MessageSquare size={14} /> Cobrar no WhatsApp
											</button>

											<button
												onClick={() =>
													exportarExcelPessoa({ nome: d.contato.nome, itens: d.itens || [] }).catch(() =>
														toast.error("Não foi possível gerar a planilha."),
													)
												}
												title={`Baixar planilha com ${d.contato.nome}`}
												aria-label={`Baixar planilha com ${d.contato.nome}`}
												className="py-2 px-3 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-100 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
												<Download size={14} /> Excel
											</button>

											<button
												onClick={() => {
													const primeiroItem = d.itens.find(
														(i: any) => !i.terceiro_pago,
													);
													if (primeiroItem)
														handleOpenPaymentModal(primeiroItem);
												}}
												className="py-2 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer">
												Quitar (Settle Up)
											</button>
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					{/* CREDORES (A QUEM VOCÊ DEVE) */}
					<div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
						<div className="flex items-center justify-between">
							<div>
								<h3 className="font-black text-base text-rose-500 flex items-center gap-2">
									<ArrowUpRight size={18} /> A Quem Você Deve (A Pagar)
								</h3>
								<p className="text-xs text-slate-400 font-medium">
									Sua parte em contas pagas por outras pessoas
								</p>
							</div>
							<span className="font-black text-sm text-rose-500">
								R${" "}
								{totalAPagar.toLocaleString("pt-BR", {
									minimumFractionDigits: 2,
								})}
							</span>
						</div>

						{credores.length === 0 ? (
							<div className="p-8 text-center text-slate-400 text-xs font-medium bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
								Você não deve nada a nenhum amigo. Tudo quitado!
							</div>
						) : (
							<div className="space-y-3">
								{credores.map((c, idx) => (
									<div
										key={idx}
										className="p-4 sm:p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col gap-4">
										<div className="flex items-center justify-between">
											<div>
												<div className="flex items-center gap-2">
													<h4 className="font-black text-base text-slate-800 dark:text-slate-100">
														{c.contato.nome}
													</h4>
													<span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
														{c.itens.length} despesa(s)
													</span>
												</div>
												<p className="text-xs text-slate-400 mt-0.5">
													{c.contato.telefone ||
														c.contato.email ||
														"Sem contato cadastrado"}
												</p>
											</div>
											<div className="text-right">
												<span className="text-[10px] font-bold uppercase text-slate-400 block">Total a Pagar</span>
												<span className="font-black text-lg text-rose-600 dark:text-rose-400">
													R${" "}
													{Number(c.total_devido).toLocaleString("pt-BR", {
														minimumFractionDigits: 2,
													})}
												</span>
											</div>
										</div>

										{/* DETALHAMENTO ITEM A ITEM DAS DESPESAS */}
										<div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
											<div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300">
												<span className="flex items-center gap-1.5">
													<Receipt size={14} className="text-rose-500" />
													Detalhamento das Contas & Parcelas
												</span>
												<span className="text-[11px] text-slate-400 font-semibold">
													{c.itens.filter((i: any) => !i.quitado).length} pendente(s)
												</span>
											</div>

											<div className="space-y-2 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
												{c.itens.map((item: any) => (
													<div
														key={item.id}
														className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs transition-all ${
															item.quitado
																? "bg-slate-50/50 dark:bg-slate-800/20 border-slate-200/50 dark:border-slate-800 opacity-60"
																: "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700/80 shadow-2xs"
														}`}
													>
														<div className="min-w-0">
															<div className="flex items-center gap-2 flex-wrap">
																<span className="font-bold text-slate-800 dark:text-slate-100">
																	{item.descricao}
																</span>
																<span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
																	item.is_credito
																		? "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300"
																		: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
																}`}>
																	{item.forma_pagamento}
																</span>
															</div>
															<p className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
																<span>Data: {new Date(item.data + "T12:00:00").toLocaleDateString("pt-BR")}</span>
																{item.cartao_nome && <span>• Cartão: <strong>{item.cartao_nome}</strong></span>}
																{item.conta_nome && <span>• Conta: <strong>{item.conta_nome}</strong></span>}
															</p>
														</div>

														<div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
															<div className="text-right">
																<span className="text-[9px] text-slate-400 block uppercase font-bold">Valor</span>
																<span className={`font-black text-xs ${item.quitado ? "text-slate-500 line-through" : "text-rose-600 dark:text-rose-400"}`}>
																	R$ {Number(item.valor_parcela_usuario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
																</span>
															</div>

															{item.quitado ? (
																<span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold">
																	Quitado
																</span>
															) : (
																<button
																	onClick={() => handleOpenPaymentModal(item)}
																	className="px-2.5 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[11px] font-bold shadow-xs cursor-pointer transition-colors"
																	title="Quitar este lançamento"
																>
																	Quitar
																</button>
															)}
														</div>
													</div>
												))}
											</div>
										</div>

										<div className="flex items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
											<button
												onClick={() => {
													const primeiroItem = c.itens.find(
														(i: any) => !i.quitado,
													);
													if (primeiroItem)
														handleOpenPaymentModal(primeiroItem);
												}}
												className="flex-1 py-2.5 px-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
												<Check size={14} /> Registrar Meu Pagamento / Acerto Geral
											</button>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			) : activeTab === "atividades" ? (
				/* ========================================================
           ABA 3: ATIVIDADES & LANÇAMENTOS
           ======================================================== */
				<div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
					<h3 className="font-black text-lg text-slate-800 dark:text-slate-100">
						Feed de Atividades
					</h3>

					{todasDespesasSplit.length === 0 ? (
						<div className="p-8 text-center text-slate-400 text-xs font-medium bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
							Nenhuma despesa dividida registrada ainda.
						</div>
					) : (
						<div className="space-y-3">
							{todasDespesasSplit.map((d) => {
								const meta = getPaymentInfo(d.observacao);
								return (
									<div
										key={d.id}
										className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 flex items-center justify-between gap-4">
										<div className="flex items-center gap-3">
											<div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center shrink-0">
												<Split size={18} />
											</div>
											<div>
												<h4 className="font-black text-xs text-slate-800 dark:text-slate-100">
													{d.descricao}
												</h4>
												<p className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
													<span>
														{new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR")}
													</span>
													{meta?.grupo_nome && <span>• Grupo: {meta.grupo_nome}</span>}
													{d.cartoes?.nome ? (
														<span className="text-purple-600 dark:text-purple-400 font-bold">• Crédito ({d.cartoes.nome})</span>
													) : d.contas_bancarias?.nome ? (
														<span className="text-emerald-600 dark:text-emerald-400 font-bold">• Débito ({d.contas_bancarias.nome})</span>
													) : (
														<span className="text-slate-400 font-medium">• Débito / Pix</span>
													)}
												</p>
											</div>
										</div>

										<div className="flex items-center gap-3">
											<span className="font-black text-sm text-slate-900 dark:text-slate-100">
												R${" "}
												{Number(d.valor).toLocaleString("pt-BR", {
													minimumFractionDigits: 2,
												})}
											</span>
											{d.terceiro_pago ? (
												<span className="flex items-center gap-2">
													<span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
													Quitado
												</span>
													<button
														onClick={() => handleDesfazerPagamento(d.id)}
														title="Reabrir esta despesa"
														className="text-[10px] font-bold text-slate-400 hover:text-rose-600 underline cursor-pointer">
														Desfazer
													</button>
												</span>
											) : (
												<button
													onClick={() => handleOpenPaymentModal(d)}
													className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer">
													Quitar
												</button>
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			) : (
				/* ========================================================
           ABA 4: CONVITES E AMIGOS CADASTRADOS
           ======================================================== */
				<div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
					<div className="flex justify-between items-center">
						<div>
							<h3 className="font-black text-lg text-slate-800 dark:text-slate-100">
								Amigos & Convites Dinâmicos
							</h3>
							<p className="text-xs text-slate-400">
								Convide seus amigos para criarem conta no app e sincronizarem os
								saldos em tempo real!
							</p>
						</div>
						<button
							onClick={() => setIsAddContatoOpen(true)}
							className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5">
							<Plus size={14} /> Novo Amigo
						</button>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
						{contatos.map((contato) => {
							const temConta =
								contato.email &&
								usuariosComConta.has(contato.email.toLowerCase());
							return (
								<div
									key={contato.id}
									className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-3">
									<div className="min-w-0">
										<h4 className="font-black text-xs text-slate-800 dark:text-slate-100 truncate">
											{contato.nome}
										</h4>
										<p className="text-[10px] text-slate-400 truncate">
											{contato.email || contato.telefone || "Sem contato"}
										</p>
										<div className="mt-1">
											{temConta ? (
												<span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
													<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />{" "}
													Conta Ativa
												</span>
											) : (
												<span className="text-[10px] text-slate-400">
													Não cadastrado
												</span>
											)}
										</div>
									</div>

									<div className="flex items-center gap-1 shrink-0">
										<button
											onClick={() => setContatoParaConvite(contato)}
											className="p-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
											title="Convidar Amigo">
											<Send size={14} />
										</button>
										<button
											onClick={() => handleDeleteContato(contato.id, contato.nome)}
											className="p-2.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 dark:hover:bg-rose-950/40 rounded-xl text-xs transition-colors cursor-pointer"
											title="Excluir Contato">
											<Trash2 size={14} />
										</button>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* ========================================================
          MODAIS INTEGRADOS
         ======================================================== */}
			{/* 1. Modal de Dividir Despesa */}
			<AddSplitDespesaModal
				isOpen={isAddSplitOpen}
				onClose={() => setIsAddSplitOpen(false)}
				onSuccess={() => {
					setIsAddSplitOpen(false);
					loadAllData();
				}}
				onOpenAddContato={() => {
					setIsAddSplitOpen(false);
					setIsAddContatoOpen(true);
				}}
				onOpenCriarGrupo={() => {
					setIsAddSplitOpen(false);
					setIsCriarGrupoOpen(true);
				}}
				initialGrupoId={initialGrupoIdForSplit}
			/>

			{/* 2. Modal de Criar Grupo */}
			<CriarGrupoModal
				isOpen={isCriarGrupoOpen}
				onClose={() => setIsCriarGrupoOpen(false)}
				onSuccess={(novo) => {
					setIsCriarGrupoOpen(false);
					loadAllData();
					setGrupoSelecionado(novo);
				}}
				userId={userId}
				userName={userName}
				contatosDisponiveis={contatos}
			/>

			{/* 3. Modal de Adicionar Contato */}
			{isAddContatoOpen && (
				<AddContatoWeb
					onClose={() => setIsAddContatoOpen(false)}
					onSuccess={() => {
						setIsAddContatoOpen(false);
						loadAllData();
					}}
				/>
			)}

			{/* 4. Modal de Convite de Amigo */}
			{contatoParaConvite && (
				<ConviteAmigoModal
					isOpen={!!contatoParaConvite}
					onClose={() => setContatoParaConvite(null)}
					contato={contatoParaConvite}
					userName={userName}
				/>
			)}

			{/* 5. Modal de Chat IA de Acordos */}
			{isChatIaOpen && (
				<ChatAcordosIaModal
					isOpen={isChatIaOpen}
					onClose={() => setIsChatIaOpen(false)}
					onSuccess={() => {
						setIsChatIaOpen(false);
						loadAllData();
					}}
					userId={userId}
					contatosDisponiveis={contatos}
				/>
			)}

			{/* 6. Modal de Pagamento / Settle Up */}
			{paymentModalOpen && (
				<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
					<div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-5 border border-slate-100 dark:border-slate-800 shadow-2xl animate-in zoom-in-95 duration-150">
						<div className="flex justify-between items-center">
							<h3 className="font-black text-lg text-slate-800 dark:text-slate-100">
								Liquidar / Settle Up
							</h3>
							<button
								onClick={() => setPaymentModalOpen(false)}
								className="text-slate-400 hover:text-slate-600 cursor-pointer">
								<X size={20} />
							</button>
						</div>

						<p className="text-xs text-slate-500">
							Registrar acerto para a despesa:{" "}
							<strong>{selectedItemForPayment?.descricao}</strong>
						</p>

						<div className="space-y-3">
							<div className="grid grid-cols-2 gap-2">
								<button
									type="button"
									onClick={() => setPaymentType("total")}
									className={`p-3 rounded-xl border text-xs font-bold cursor-pointer ${
										paymentType === "total"
											? "bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
											: "border-slate-200 dark:border-slate-700 text-slate-600"
									}`}>
									Quitação Total
								</button>
								<button
									type="button"
									onClick={() => setPaymentType("parcial")}
									className={`p-3 rounded-xl border text-xs font-bold cursor-pointer ${
										paymentType === "parcial"
											? "bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
											: "border-slate-200 dark:border-slate-700 text-slate-600"
									}`}>
									Valor Parcial
								</button>
							</div>

							{paymentType === "parcial" && (
								<div className="space-y-1">
									<label className="text-[10px] font-bold text-slate-400">
										Valor Pago (R$)
									</label>
									<input
										type="text"
										placeholder="0,00"
										value={partialAmount}
										onChange={(e) => setPartialAmount(e.target.value)}
										className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-bold"
									/>
								</div>
							)}

							<div className="space-y-1">
								<label className="text-[10px] font-bold text-slate-400">
									Data do Pagamento
								</label>
								<input
									type="date"
									value={paymentDate}
									onChange={(e) => setPaymentDate(e.target.value)}
									className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-bold"
								/>
							</div>
						</div>

						<div className="flex justify-end gap-2 pt-2">
							<button
								type="button"
								onClick={() => setPaymentModalOpen(false)}
								className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer">
								Cancelar
							</button>
							<button
								type="button"
								onClick={handleConfirmarPagamento}
								className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md cursor-pointer">
								Confirmar Acerto
							</button>
						</div>
					</div>
				</div>
			)}
		</motion.div>
	);
}
