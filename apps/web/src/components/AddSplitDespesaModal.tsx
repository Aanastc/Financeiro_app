import SeletorCategoria from "./SeletorCategoria";
import InputMoeda from "./InputMoeda";
import { notificacoesService } from "../../../../packages/services/notificacoes.service";
import { useState, useEffect } from "react";
import {
	X,
	DollarSign,
	Split,
	Users,
	CreditCard,
	Wallet,
	Check,
	Plus,
	Percent,
	Layers,
	Hash,
	RotateCcw } from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";
import { authService } from "../../../../packages/services/auth.service";
import { financeService } from "../../../../packages/services/finance.service";
import { despesasCompartilhadasService } from "../../../../packages/services/despesas-compartilhadas.service";
import type { Grupo } from "../../../../packages/services/despesas-compartilhadas.service";
import toast from "react-hot-toast";
import { notificarDivisaoPorEmail } from "../../../../packages/services/convite.service";

interface AddSplitDespesaModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess: () => void;
	onOpenAddContato: () => void;
	onOpenCriarGrupo?: () => void;
	initialGrupoId?: string | null;
}

export default function AddSplitDespesaModal({
	isOpen,
	onClose,
	onSuccess,
	onOpenAddContato,
	onOpenCriarGrupo,
	initialGrupoId,
}: AddSplitDespesaModalProps) {
	const [loading, setLoading] = useState(false);
	const [userId, setUserId] = useState<string>("");
	const [userName, setUserName] = useState<string>("Você");
	const [contatos, setContatos] = useState<any[]>([]);
	const [grupos, setGrupos] = useState<Grupo[]>([]);
	const [cartoes, setCartoes] = useState<any[]>([]);
	const [contas, setContas] = useState<any[]>([]);

	// TIPO DE SPLIT: AMIGO OU GRUPO
	const [tipoDestino, setTipoDestino] = useState<"AMIGO" | "GRUPO">("AMIGO");
	const [grupoId, setGrupoId] = useState<string>("");

	// DADOS BÁSICOS DA DESPESA
	const [descricao, setDescricao] = useState("");
	const [valorTotalStr, setValorTotalStr] = useState("");
	const [data, setData] = useState(
		() => new Date().toISOString().split("T")[0],
	);
	const [categoriaId, setCategoriaId] = useState("");
	const [formaPagamento, setFormaPagamento] = useState<"CONTA" | "CARTAO">(
		"CONTA",
	);
	const [contaId, setContaId] = useState("");
	const [cartaoId, setCartaoId] = useState("");

	// 1 A 1 (AMIGO)
	const [contatoId, setContatoId] = useState("");
	const [contatoSelecionado, setContatoSelecionado] = useState<any>(null);
	const [contatoTemContaNoApp, setContatoTemContaNoApp] = useState(false);
	const [pagoPorAmigo, setPagoPorAmigo] = useState<"VOCE" | "CONTATO">("VOCE");

	// GRUPO (MÚLTIPLOS PARTICIPANTES)
	const [participantesGrupo, setParticipantesGrupo] = useState<
		{
			id: string;
			nome: string;
			selecionado: boolean;
			valorExato: string;
			percentual: number;
			cotas: number;
			is_user?: boolean;
			contato_id?: string | null;
		}[]
	>([]);
	const [pagadorGrupoId, setPagadorGrupoId] = useState<string>("user");

	// MÉTODOS DE DIVISÃO
	const [metodoDivisao, setMetodoDivisao] = useState<
		"IGUAL" | "EXATO" | "PORCENTAGEM" | "COTAS"
	>("IGUAL");

	// Inputs customizados para 1 a 1
	const [minhaParteStr, setMinhaParteStr] = useState("");
	const [parteContatoStr, setParteContatoStr] = useState("");
	const [minhaPorcentagem, setMinhaPorcentagem] = useState(50);
	const [contatoPorcentagem, setContatoPorcentagem] = useState(50);

	// RECORRÊNCIA (EX: TODO DIA 1 MENSAL)
	const [isRecorrente, setIsRecorrente] = useState(false);
	// Compra que já está/vai entrar na fatura ou extrato: registra só o valor a receber
	// (não soma nos gastos, na fatura nem no saldo — evita lançar duas vezes)
	const [jaNoExtrato, setJaNoExtrato] = useState(false);
	const [avisarPorEmail, setAvisarPorEmail] = useState(true);
	const [diaDoMes, setDiaDoMes] = useState<number>(1);
	const [mesesRecorrencia, setMesesRecorrencia] = useState<number>(12);

	const loadInitialData = async () => {
		try {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return;
			setUserId(user.id);
			setUserName(
				user.user_metadata?.full_name || user.email?.split("@")[0] || "Você",
			);

			const [contatosRes, gruposRes, cartoesRes, contasRes] =
				await Promise.all([
					supabase
						.from("contatos")
						.select("*")
						.eq("usuario_id", user.id)
						.order("nome"),
					despesasCompartilhadasService.getGrupos(user.id),
					financeService.getCartoes(user.id).catch(() => []),
					financeService.getContasBancarias(user.id).catch(() => []),
				]);

			const cList = contatosRes.data || [];
			setContatos(cList);
			setGrupos(gruposRes || []);
			setCartoes(cartoesRes || []);
			setContas(contasRes || []);

			if (contasRes && contasRes.length > 0) setContaId(contasRes[0].id);
			if (cartoesRes && cartoesRes.length > 0) setCartaoId(cartoesRes[0].id);
			if (cList.length > 0 && !contatoId) setContatoId(cList[0].id);

			if (initialGrupoId && gruposRes.some((g) => g.id === initialGrupoId)) {
				setTipoDestino("GRUPO");
				setGrupoId(initialGrupoId);
			} else if (gruposRes && gruposRes.length > 0 && !grupoId) {
				setGrupoId(gruposRes[0].id);
			}
		} catch (e) {
			console.error(e);
		}
	};

	useEffect(() => {
		if (isOpen) {
			loadInitialData();
		}
	}, [isOpen]);

	// Atualiza contato 1 a 1
	useEffect(() => {
		const contato = contatos.find((c) => c.id === contatoId);
		setContatoSelecionado(contato || null);

		if (contato?.email) {
			const email = contato.email.trim().toLowerCase();
			authService
				.emailsComConta([email])
				.then((comConta) => setContatoTemContaNoApp(comConta.has(email)))
				.catch(() => setContatoTemContaNoApp(false));
		} else {
			setContatoTemContaNoApp(false);
		}
	}, [contatoId, contatos]);

	// Atualiza participantes quando o grupo muda
	useEffect(() => {
		if (tipoDestino === "GRUPO" && grupoId) {
			const g = grupos.find((item) => item.id === grupoId);
			if (g && g.membros) {
				setParticipantesGrupo(
					g.membros.map((m) => ({
						id: m.id,
						nome: m.is_user ? `${m.nome} (Você)` : m.nome,
						selecionado: true,
						valorExato: "",
						percentual: Math.round((100 / g.membros!.length) * 10) / 10,
						cotas: 1,
						is_user: m.is_user,
						contato_id: m.contato_id,
					})),
				);
				const userMembro = g.membros.find((m) => m.is_user);
				if (userMembro) {
					setPagadorGrupoId(userMembro.id);
				} else if (g.membros.length > 0) {
					setPagadorGrupoId(g.membros[0].id);
				}
			}
		}
	}, [tipoDestino, grupoId, grupos]);

	if (!isOpen) return null;

	const valorTotal =
		parseFloat(valorTotalStr.replace(/\./g, "").replace(",", ".")) || 0;

	// CÁLCULOS 1 A 1
	let minhaCotaAmigo = 0;
	let cotaContatoAmigo = 0;

	if (metodoDivisao === "IGUAL") {
		minhaCotaAmigo = Math.round((valorTotal / 2) * 100) / 100;
		cotaContatoAmigo = Math.round((valorTotal - minhaCotaAmigo) * 100) / 100;
	} else if (metodoDivisao === "EXATO") {
		minhaCotaAmigo =
			parseFloat(minhaParteStr.replace(/\./g, "").replace(",", ".")) || 0;
		cotaContatoAmigo =
			parseFloat(parteContatoStr.replace(/\./g, "").replace(",", ".")) || 0;
	} else if (metodoDivisao === "PORCENTAGEM") {
		minhaCotaAmigo =
			Math.round(valorTotal * (minhaPorcentagem / 100) * 100) / 100;
		cotaContatoAmigo = Math.round((valorTotal - minhaCotaAmigo) * 100) / 100;
	} else if (metodoDivisao === "COTAS") {
		minhaCotaAmigo = Math.round((valorTotal / 2) * 100) / 100;
		cotaContatoAmigo = Math.round((valorTotal - minhaCotaAmigo) * 100) / 100;
	}

	// CÁLCULOS PARA GRUPO
	const participantesAtivos = participantesGrupo.filter((p) => p.selecionado);
	const totalParticipantesAtivos = participantesAtivos.length;

	let calculoMembrosGrupo: {
		id: string;
		nome: string;
		valorDevido: number;
		contato_id?: string | null;
		is_user?: boolean;
	}[] = [];

	if (
		tipoDestino === "GRUPO" &&
		totalParticipantesAtivos > 0 &&
		valorTotal > 0
	) {
		if (metodoDivisao === "IGUAL") {
			const parteBase =
				Math.floor((valorTotal / totalParticipantesAtivos) * 100) / 100;
			let resto =
				Math.round((valorTotal - parteBase * totalParticipantesAtivos) * 100) /
				100;

			calculoMembrosGrupo = participantesAtivos.map((p, idx) => {
				const valorDevido = idx === 0 ? parteBase + resto : parteBase;
				return {
					id: p.id,
					nome: p.nome,
					valorDevido: Math.round(valorDevido * 100) / 100,
					contato_id: p.contato_id,
					is_user: p.is_user,
				};
			});
		} else if (metodoDivisao === "EXATO") {
			calculoMembrosGrupo = participantesAtivos.map((p) => ({
				id: p.id,
				nome: p.nome,
				valorDevido:
					parseFloat(p.valorExato.replace(/\./g, "").replace(",", ".")) || 0,
				contato_id: p.contato_id,
				is_user: p.is_user,
			}));
		} else if (metodoDivisao === "PORCENTAGEM") {
			calculoMembrosGrupo = participantesAtivos.map((p) => ({
				id: p.id,
				nome: p.nome,
				valorDevido: Math.round(valorTotal * (p.percentual / 100) * 100) / 100,
				contato_id: p.contato_id,
				is_user: p.is_user,
			}));
		} else if (metodoDivisao === "COTAS") {
			const somaCotas = participantesAtivos.reduce(
				(sum, p) => sum + (Number(p.cotas) || 1),
				0,
			);
			calculoMembrosGrupo = participantesAtivos.map((p) => {
				const proporcao =
					somaCotas > 0 ? (Number(p.cotas) || 1) / somaCotas : 0;
				return {
					id: p.id,
					nome: p.nome,
					valorDevido: Math.round(valorTotal * proporcao * 100) / 100,
					contato_id: p.contato_id,
					is_user: p.is_user,
				};
			});
		}
	}

	// Validação de soma no método EXATO
	const somaExatoGrupo = calculoMembrosGrupo.reduce(
		(s, m) => s + m.valorDevido,
		0,
	);
	const diferencaExatoGrupo = Math.abs(valorTotal - somaExatoGrupo);
	const somaBateGrupo = valorTotal > 0 && diferencaExatoGrupo < 0.05;

	const somaBateAmigo =
		valorTotal > 0 &&
		Math.abs(valorTotal - (minhaCotaAmigo + cotaContatoAmigo)) < 0.05;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!descricao.trim()) {
			toast.error("Informe a descrição da despesa");
			return;
		}
		if (valorTotal <= 0) {
			toast.error("Informe um valor total válido maior que zero");
			return;
		}

		if (tipoDestino === "AMIGO") {
			if (!contatoId) {
				toast.error("Selecione um amigo para dividir");
				return;
			}
			if (metodoDivisao === "EXATO" && !somaBateAmigo) {
				toast.error(
					`A soma das partes (R$ ${(minhaCotaAmigo + cotaContatoAmigo).toFixed(2)}) não fecha com R$ ${valorTotal.toFixed(2)}`,
				);
				return;
			}
		} else {
			if (!grupoId) {
				toast.error("Selecione ou crie um grupo primeiro!");
				return;
			}
			if (totalParticipantesAtivos === 0) {
				toast.error("Selecione pelo menos 1 participante que consumiu");
				return;
			}
			if (metodoDivisao === "EXATO" && !somaBateGrupo) {
				toast.error(
					`A soma dos valores (R$ ${somaExatoGrupo.toFixed(2)}) difere do total (R$ ${valorTotal.toFixed(2)})`,
				);
				return;
			}
		}

		setLoading(true);
		const idsParaAvisar: string[] = [];
		try {
			if (tipoDestino === "AMIGO") {
				const contatoNome = contatoSelecionado?.nome || "Amigo";
				const splitMetadata = {
					is_split: true,
					split_tipo: "amigo",
					descricao_original: descricao,
					valor_total: valorTotal,
					minha_cota: minhaCotaAmigo,
					cota_contato: cotaContatoAmigo,
					pago_por: pagoPorAmigo,
					metodo_divisao: metodoDivisao,
					contato_id: contatoId,
					contato_nome: contatoNome,
					contato_email: contatoSelecionado?.email || null,
					contato_tem_conta: contatoTemContaNoApp,
					criado_em: new Date().toISOString(),
				};

				const iteracoes = isRecorrente ? mesesRecorrencia : 1;
				const txsToInsert: any[] = [];

				for (let m = 0; m < iteracoes; m++) {
					let dataFinal = data;
					let sufixoDesc = "";

					if (isRecorrente) {
						const baseDate = new Date(data + "T12:00:00");
						const targetDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + m, diaDoMes);
						dataFinal = targetDate.toISOString().split("T")[0];
						const mesNome = targetDate.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
						sufixoDesc = ` (${mesNome})`;
					}

					const splitMetadataComRec = {
						...splitMetadata,
						recorrente: isRecorrente,
						recorrencia_tipo: isRecorrente ? "MENSAL" : null,
						recorrencia_dia: isRecorrente ? diaDoMes : null,
						mes_numero: m + 1,
						total_meses: iteracoes,
					};

					if (pagoPorAmigo === "VOCE") {
						txsToInsert.push({
							usuario_id: userId,
							tipo: "DESPESA",
							descricao: `${descricao}${sufixoDesc} (Parte ${contatoNome})`,
							valor: cotaContatoAmigo,
							data: dataFinal,
							categoria_id: categoriaId || null,
							conta_id: !jaNoExtrato && formaPagamento === "CONTA" ? contaId || null : null,
							cartao_id: !jaNoExtrato && formaPagamento === "CARTAO" ? cartaoId || null : null,
							considerar_soma: !jaNoExtrato,
							terceiro: true,
							terceiro_pago: false,
							contato_id: contatoId,
							observacao: JSON.stringify({ ...splitMetadataComRec, ja_no_extrato: jaNoExtrato }),
							status: m === 0 ? "confirmada" : "pendente",
						});
					} else {
						txsToInsert.push({
							usuario_id: userId,
							tipo: "DESPESA",
							descricao: `${descricao}${sufixoDesc} - ${contatoNome}`,
							valor: minhaCotaAmigo,
							data: dataFinal,
							categoria_id: categoriaId || null,
							terceiro: false,
							terceiro_pago: false,
							observacao: JSON.stringify({
								...splitMetadataComRec,
								parceria_credor_id: contatoId,
								parceria_credor_nome: contatoNome,
							}),
							status: m === 0 ? "confirmada" : "pendente",
						});
					}
				}

				const { data: inseridas, error: txError } = await supabase.from("transacoes").insert(txsToInsert).select("id");
				if (txError) throw txError;
				idsParaAvisar.push(...(inseridas || []).map((t: any) => t.id));
			} else {
				// SALVANDO NO GRUPO
				const grupoAtual = grupos.find((g) => g.id === grupoId);
				const pagadorMembro = participantesGrupo.find(
					(p) => p.id === pagadorGrupoId,
				);
				const vocePagou = pagadorMembro?.is_user || false;

				const participantesDetalhados = calculoMembrosGrupo.map((m) => ({
					id: m.id,
					nome: m.nome,
					valor_devido: m.valorDevido,
					contato_id: m.contato_id,
					is_user: m.is_user,
				}));

				const grupoMetadata = {
					is_split: true,
					split_tipo: "grupo",
					grupo_id: grupoId,
					grupo_nome: grupoAtual?.nome || "Grupo",
					descricao_original: descricao,
					valor_total: valorTotal,
					pago_por_id: pagadorGrupoId,
					pago_por_nome: pagadorMembro?.nome || "Participante",
					voce_pagou: vocePagou,
					metodo_divisao: metodoDivisao,
					participantes: participantesDetalhados,
					criado_em: new Date().toISOString(),
				};

				// Minha cota de consumo no grupo
				const meuConsumo =
					calculoMembrosGrupo.find((m) => m.is_user)?.valorDevido || 0;
				// Total que os outros membros devem
				const consumoDosOutros = valorTotal - meuConsumo;

				const iteracoesGrupo = isRecorrente ? mesesRecorrencia : 1;
				const txsToInsertGrupo: any[] = [];

				for (let m = 0; m < iteracoesGrupo; m++) {
					let dataFinal = data;
					let sufixoDesc = "";

					if (isRecorrente) {
						const baseDate = new Date(data + "T12:00:00");
						const targetDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + m, diaDoMes);
						dataFinal = targetDate.toISOString().split("T")[0];
						const mesNome = targetDate.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
						sufixoDesc = ` (${mesNome})`;
					}

					const grupoMetadataComRec = {
						...grupoMetadata,
						recorrente: isRecorrente,
						recorrencia_tipo: isRecorrente ? "MENSAL" : null,
						recorrencia_dia: isRecorrente ? diaDoMes : null,
						mes_numero: m + 1,
						total_meses: iteracoesGrupo,
					};

					if (vocePagou) {
						txsToInsertGrupo.push({
							usuario_id: userId,
							tipo: "DESPESA",
							descricao: `${descricao}${sufixoDesc} [${grupoAtual?.nome || "Grupo"}]`,
							valor: consumoDosOutros > 0 ? consumoDosOutros : valorTotal,
							data: dataFinal,
							categoria_id: categoriaId || null,
							conta_id: !jaNoExtrato && formaPagamento === "CONTA" ? contaId || null : null,
							cartao_id: !jaNoExtrato && formaPagamento === "CARTAO" ? cartaoId || null : null,
							considerar_soma: !jaNoExtrato,
							terceiro: true,
							terceiro_pago: false,
							observacao: JSON.stringify({ ...grupoMetadataComRec, ja_no_extrato: jaNoExtrato }),
							status: m === 0 ? "confirmada" : "pendente",
						});
					} else {
						txsToInsertGrupo.push({
							usuario_id: userId,
							tipo: "DESPESA",
							descricao: `${descricao}${sufixoDesc} [${grupoAtual?.nome || "Grupo"}]`,
							valor: meuConsumo,
							data: dataFinal,
							categoria_id: categoriaId || null,
							terceiro: false,
							terceiro_pago: false,
							observacao: JSON.stringify({
								...grupoMetadataComRec,
								parceria_credor_id: pagadorMembro?.contato_id || pagadorGrupoId,
								parceria_credor_nome: pagadorMembro?.nome,
							}),
							status: m === 0 ? "confirmada" : "pendente",
						});
					}
				}

				const { data: inseridas, error: txError } = await supabase.from("transacoes").insert(txsToInsertGrupo).select("id");
				if (txError) throw txError;
				idsParaAvisar.push(...(inseridas || []).map((t: any) => t.id));
			}

			// Aviso no app para quem já aceitou o convite (não bloqueia)
			notificacoesService.avisarDivisaoVinculados(idsParaAvisar);

			// Aviso por e-mail (não bloqueia: falha só gera log)
			if (avisarPorEmail && idsParaAvisar.length > 0) {
				notificarDivisaoPorEmail(idsParaAvisar).then((r) => {
					if (r && r.enviados > 0) toast.success(`Aviso enviado por e-mail (${r.enviados}).`);
				});
			}

			if (isRecorrente) {
				toast.success(`Assinatura recorrente programada para ${mesesRecorrencia} meses (todo dia ${diaDoMes})!`);
			} else {
				toast.success("Despesa dividida com sucesso!");
			}
			onSuccess();
			onClose();
		} catch (err: any) {
			console.error(err);
			toast.error(
				"Erro ao salvar despesa: " + (err.message || "Erro desconhecido"),
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
			<div className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-800 flex flex-col max-h-[95vh]">
				{/* HEADER */}
				<div className="p-6 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 text-white flex justify-between items-center shrink-0">
					<div className="flex items-center gap-3">
						<div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center backdrop-blur-xs">
							<Split size={24} className="text-white" />
						</div>
						<div>
							<h2 className="text-xl font-black">
								Dividir Despesa
							</h2>
							<p className="text-emerald-100 text-xs font-semibold">
								{tipoDestino === "GRUPO"
									? "Rateio no Grupo com Múltiplos Amigos"
									: "Divisão 1 a 1 com Amigo"}
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer">
						<X size={20} />
					</button>
				</div>

				{/* FORM */}
				<form
					onSubmit={handleSubmit}
					className="p-6 space-y-6 overflow-y-auto flex-1 scrollbar-thin">
					{/* SELEÇÃO DO DESTINO: COM AMIGO OU EM GRUPO */}
					<div className="space-y-1.5">
						<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ml-1">
							Onde você quer dividir?
						</label>
						<div className="grid grid-cols-2 gap-3">
							<button
								type="button"
								onClick={() => setTipoDestino("AMIGO")}
								className={`p-3.5 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
									tipoDestino === "AMIGO"
										? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-sm ring-2 ring-emerald-400/30"
										: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
								}`}>
								<Users size={16} /> Com 1 Amigo
							</button>

							<button
								type="button"
								onClick={() => setTipoDestino("GRUPO")}
								className={`p-3.5 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
									tipoDestino === "GRUPO"
										? "bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-purple-700 dark:text-purple-300 shadow-sm ring-2 ring-purple-400/30"
										: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
								}`}>
								<Layers size={16} /> Em um Grupo ({grupos.length})
							</button>
						</div>
					</div>

					{/* DESCRIÇÃO E VALOR TOTAL */}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ml-1">
								Descrição do Gasto *
							</label>
							<input
								type="text"
								required
								placeholder="Ex: Jantar no Outback, Airbnb praia, Supermercado..."
								value={descricao}
								onChange={(e) => setDescricao(e.target.value)}
								className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
								autoFocus
							/>
						</div>

						<div className="space-y-1.5">
							<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ml-1">
								Valor Total (R$) *
							</label>
							<InputMoeda
								required
								value={valorTotalStr}
								onChange={(v) => setValorTotalStr(v)}
								className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-black text-emerald-600 dark:text-emerald-400 text-lg outline-none focus:ring-2 focus:ring-emerald-500"
							/>
						</div>
					</div>

					{/* CATEGORIA */}
					<div className="space-y-1.5">
						<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ml-1">
							Categoria
						</label>
						<SeletorCategoria tipo="DESPESA" value={categoriaId} onChange={setCategoriaId} />
					</div>

					{/* SE DESTINO FOR AMIGO */}
					{tipoDestino === "AMIGO" ? (
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<div className="space-y-1.5">
								<div className="flex justify-between items-center ml-1">
									<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
										Selecione o Amigo
									</label>
									<button
										type="button"
										onClick={onOpenAddContato}
										className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer">
										<Plus size={12} /> Novo Amigo
									</button>
								</div>
								<select
									value={contatoId}
									onChange={(e) => setContatoId(e.target.value)}
									className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer">
									{contatos.map((c) => (
										<option key={c.id} value={c.id}>
											{c.nome} {c.email ? `(${c.email})` : ""}
										</option>
									))}
								</select>
								{contatoSelecionado && (
									<div className="text-[10px] font-bold mt-1 ml-1 flex items-center gap-1.5">
										{contatoTemContaNoApp ? (
											<span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
												<span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
												Conta no App Ativa (Sincronização Dinâmica)
											</span>
										) : (
											<span className="text-slate-400 flex items-center gap-1">
												<span className="w-2 h-2 rounded-full bg-slate-300" />
												Contato Externo (Poderá enviar convite)
											</span>
										)}
									</div>
								)}
							</div>

							<div className="space-y-1.5">
								<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ml-1">
									Data
								</label>
								<input
									type="date"
									required
									value={data}
									onChange={(e) => setData(e.target.value)}
									className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
								/>
							</div>
						</div>
					) : (
						/* SE DESTINO FOR GRUPO */
						<div className="space-y-4">
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div className="space-y-1.5">
									<div className="flex justify-between items-center ml-1">
										<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
											Grupo Selecionado
										</label>
										{onOpenCriarGrupo && (
											<button
												type="button"
												onClick={onOpenCriarGrupo}
												className="text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5 cursor-pointer">
												<Plus size={12} /> Criar Novo Grupo
											</button>
										)}
									</div>
									{grupos.length === 0 ? (
										<div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl text-xs text-amber-800 dark:text-amber-300">
											Nenhum grupo cadastrado ainda.{" "}
											<button
												type="button"
												onClick={onOpenCriarGrupo}
												className="font-bold underline cursor-pointer ml-1">
												Clique para criar seu primeiro grupo
											</button>
										</div>
									) : (
										<select
											value={grupoId}
											onChange={(e) => setGrupoId(e.target.value)}
											className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer">
											{grupos.map((g) => (
												<option key={g.id} value={g.id}>
													{g.nome} ({g.membros?.length || 0} membros)
												</option>
											))}
										</select>
									)}
								</div>

								<div className="space-y-1.5">
									<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ml-1">
										Data
									</label>
									<input
										type="date"
										required
										value={data}
										onChange={(e) => setData(e.target.value)}
										className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
									/>
								</div>
							</div>

							{/* LISTA DE PARTICIPANTES DO GRUPO QUE CONSUMIRAM */}
							{participantesGrupo.length > 0 && (
								<div className="space-y-2 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
									<div className="flex justify-between items-center">
										<label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
											Quem participou desta despesa? ({totalParticipantesAtivos}
											/{participantesGrupo.length})
										</label>
										<button
											type="button"
											onClick={() => {
												const todosMarcados = participantesGrupo.every(
													(p) => p.selecionado,
												);
												setParticipantesGrupo(
													participantesGrupo.map((p) => ({
														...p,
														selecionado: !todosMarcados,
													})),
												);
											}}
											className="text-[10px] font-bold text-purple-600 hover:underline cursor-pointer">
											{participantesGrupo.every((p) => p.selecionado)
												? "Desmarcar todos"
												: "Marcar todos"}
										</button>
									</div>

									<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
										{participantesGrupo.map((p, idx) => (
											<div
												key={p.id}
												onClick={() => {
													const copia = [...participantesGrupo];
													copia[idx].selecionado = !copia[idx].selecionado;
													setParticipantesGrupo(copia);
												}}
												className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer text-xs ${
													p.selecionado
														? "bg-purple-100/70 dark:bg-purple-950/40 border-purple-400 text-purple-900 dark:text-purple-200 font-bold"
														: "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 opacity-60"
												}`}>
												<span className="truncate">{p.nome}</span>
												<div
													className={`w-4 h-4 rounded-md flex items-center justify-center border ${
														p.selecionado
															? "bg-purple-600 border-purple-600 text-white"
															: "border-slate-300 dark:border-slate-700"
													}`}>
													{p.selecionado && <Check size={10} />}
												</div>
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					)}

					{/* QUEM PAGOU A CONTA? */}
					<div className="space-y-2">
						<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ml-1">
							Quem pagou o valor total?
						</label>
						{tipoDestino === "AMIGO" ? (
							<div className="grid grid-cols-2 gap-3">
								<button
									type="button"
									onClick={() => setPagoPorAmigo("VOCE")}
									className={`p-3.5 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
										pagoPorAmigo === "VOCE"
											? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-sm"
											: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
									}`}>
									<Check
										size={16}
										className={
											pagoPorAmigo === "VOCE"
												? "opacity-100 text-emerald-600"
												: "opacity-0"
										}
									/>
									Eu paguei o total
								</button>

								<button
									type="button"
									onClick={() => setPagoPorAmigo("CONTATO")}
									className={`p-3.5 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
										pagoPorAmigo === "CONTATO"
											? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-sm"
											: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
									}`}>
									<Check
										size={16}
										className={
											pagoPorAmigo === "CONTATO"
												? "opacity-100 text-indigo-600"
												: "opacity-0"
										}
									/>
									{contatoSelecionado?.nome || "O amigo"} pagou
								</button>
							</div>
						) : (
							<select
								value={pagadorGrupoId}
								onChange={(e) => setPagadorGrupoId(e.target.value)}
								className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer">
								{participantesGrupo.map((p) => (
									<option key={p.id} value={p.id}>
										{p.is_user
											? `Eu (${userName}) paguei`
											: `${p.nome} pagou o total`}
									</option>
								))}
							</select>
						)}
					</div>

					{/* FORMA DE DIVISÃO  */}
					<div className="space-y-3">
						<div className="flex items-center justify-between ml-1">
							<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
								Como você quer dividir? (Split Method)
							</label>
							<span className="text-[10px] font-bold text-slate-400">
								Forma de divisão
							</span>
						</div>

						<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
							{[
								{
									id: "IGUAL",
									label: "Partes Iguais",
									icon: Split,
									desc: "Divide igualmente",
								},
								{
									id: "EXATO",
									label: "Valores Exatos",
									icon: DollarSign,
									desc: "R$ exato por pessoa",
								},
								{
									id: "PORCENTAGEM",
									label: "Porcentagem %",
									icon: Percent,
									desc: "% personalizada",
								},
								{
									id: "COTAS",
									label: "Por Cotas",
									icon: Hash,
									desc: "Partes/pesos",
								},
							].map((item) => {
								const IconComp = item.icon;
								const isSelected = metodoDivisao === item.id;
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => setMetodoDivisao(item.id as any)}
										className={`py-3 px-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
											isSelected
												? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 shadow-md ring-2 ring-slate-400/30"
												: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
										}`}>
										<IconComp size={16} />
										<span>{item.label}</span>
									</button>
								);
							})}
						</div>

						{/* INPUTS CUSTOMIZADOS PARA GRUPO */}
						{tipoDestino === "GRUPO" && metodoDivisao === "EXATO" && (
							<div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
								<p className="text-[10px] font-bold text-slate-400">
									Informe o valor exato gasto por participante:
								</p>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
									{participantesGrupo
										.filter((p) => p.selecionado)
										.map((p) => (
											<div key={p.id} className="flex items-center gap-2">
												<span className="text-xs font-bold text-slate-700 dark:text-slate-300 w-28 truncate">
													{p.nome}:
												</span>
												<InputMoeda
													value={p.valorExato}
													onChange={(v) => {
														const copia = [...participantesGrupo];
														const realIdx = copia.findIndex(
															(item) => item.id === p.id,
														);
														copia[realIdx].valorExato = v;
														setParticipantesGrupo(copia);
													}}
													className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100"
												/>
											</div>
										))}
								</div>
								{!somaBateGrupo && valorTotal > 0 && (
									<p className="text-xs font-bold text-rose-500 mt-1">
										Soma informada: R$ {somaExatoGrupo.toFixed(2)} de R${" "}
										{valorTotal.toFixed(2)} (Falta R${" "}
										{(valorTotal - somaExatoGrupo).toFixed(2)})
									</p>
								)}
							</div>
						)}

						{tipoDestino === "GRUPO" && metodoDivisao === "PORCENTAGEM" && (
							<div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
								<p className="text-[10px] font-bold text-slate-400">
									Informe a porcentagem de cada um (deve somar 100%):
								</p>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
									{participantesGrupo
										.filter((p) => p.selecionado)
										.map((p) => (
											<div key={p.id} className="flex items-center gap-2">
												<span className="text-xs font-bold text-slate-700 dark:text-slate-300 w-28 truncate">
													{p.nome}:
												</span>
												<div className="flex items-center gap-1 flex-1">
													<input
														type="number"
														min="0"
														max="100"
														value={p.percentual}
														onChange={(e) => {
															const copia = [...participantesGrupo];
															const realIdx = copia.findIndex(
																(item) => item.id === p.id,
															);
															copia[realIdx].percentual = Number(
																e.target.value,
															);
															setParticipantesGrupo(copia);
														}}
														className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100"
													/>
													<span className="text-xs font-bold text-slate-400">
														%
													</span>
												</div>
											</div>
										))}
								</div>
							</div>
						)}

						{tipoDestino === "GRUPO" && metodoDivisao === "COTAS" && (
							<div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
								<p className="text-[10px] font-bold text-slate-400">
									Informe as cotas/partes de cada um (ex: 1 para individual, 2
									para casal/consumo maior):
								</p>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
									{participantesGrupo
										.filter((p) => p.selecionado)
										.map((p) => (
											<div key={p.id} className="flex items-center gap-2">
												<span className="text-xs font-bold text-slate-700 dark:text-slate-300 w-28 truncate">
													{p.nome}:
												</span>
												<input
													type="number"
													min="1"
													value={p.cotas}
													onChange={(e) => {
														const copia = [...participantesGrupo];
														const realIdx = copia.findIndex(
															(item) => item.id === p.id,
														);
														copia[realIdx].cotas = Math.max(
															1,
															Number(e.target.value),
														);
														setParticipantesGrupo(copia);
													}}
													className="w-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100"
												/>
												<span className="text-xs text-slate-400">cota(s)</span>
											</div>
										))}
								</div>
							</div>
						)}

						{/* INPUTS CUSTOMIZADOS PARA 1 A 1 */}
						{tipoDestino === "AMIGO" && metodoDivisao === "EXATO" && (
							<div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
								<div className="space-y-1">
									<label className="text-[10px] font-bold text-slate-400">
										Minha Parte (R$)
									</label>
									<InputMoeda
										value={minhaParteStr}
										onChange={(v) => setMinhaParteStr(v)}
										className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none"
									/>
								</div>
								<div className="space-y-1">
									<label className="text-[10px] font-bold text-slate-400">
										Parte do {contatoSelecionado?.nome || "Amigo"} (R$)
									</label>
									<InputMoeda
										value={parteContatoStr}
										onChange={(v) => setParteContatoStr(v)}
										className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none"
									/>
								</div>
								{!somaBateAmigo && valorTotal > 0 && (
									<p className="col-span-2 text-xs font-bold text-rose-500 mt-1">
										Soma atual: R${" "}
										{(minhaCotaAmigo + cotaContatoAmigo).toFixed(2)} de R${" "}
										{valorTotal.toFixed(2)}
									</p>
								)}
							</div>
						)}

						{tipoDestino === "AMIGO" && metodoDivisao === "PORCENTAGEM" && (
							<div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
								<div className="space-y-1">
									<label className="text-[10px] font-bold text-slate-400">
										Minha %
									</label>
									<input
										type="number"
										min="0"
										max="100"
										value={minhaPorcentagem}
										onChange={(e) => {
											const val = Math.max(
												0,
												Math.min(100, Number(e.target.value)),
											);
											setMinhaPorcentagem(val);
											setContatoPorcentagem(100 - val);
										}}
										className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none"
									/>
								</div>
								<div className="space-y-1">
									<label className="text-[10px] font-bold text-slate-400">
										% de {contatoSelecionado?.nome || "Amigo"}
									</label>
									<input
										type="number"
										min="0"
										max="100"
										value={contatoPorcentagem}
										onChange={(e) => {
											const val = Math.max(
												0,
												Math.min(100, Number(e.target.value)),
											);
											setContatoPorcentagem(val);
											setMinhaPorcentagem(100 - val);
										}}
										className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none"
									/>
								</div>
							</div>
						)}
					</div>

					{/* RESUMO VISUAL DA PARTILHA */}
					<div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-2">
						<p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
							Demonstrativo da Partilha
						</p>
						{tipoDestino === "AMIGO" ? (
							<>
								<div className="flex justify-between items-center text-xs font-bold text-slate-600 dark:text-slate-300">
									<span>Sua parte no gasto:</span>
									<span className="font-black text-slate-800 dark:text-slate-100">
										R${" "}
										{minhaCotaAmigo.toLocaleString("pt-BR", {
											minimumFractionDigits: 2,
										})}
									</span>
								</div>
								<div className="flex justify-between items-center text-xs font-bold text-slate-600 dark:text-slate-300">
									<span>Parte de {contatoSelecionado?.nome || "Amigo"}:</span>
									<span className="font-black text-slate-800 dark:text-slate-100">
										R${" "}
										{cotaContatoAmigo.toLocaleString("pt-BR", {
											minimumFractionDigits: 2,
										})}
									</span>
								</div>
								<div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-sm font-black">
									{pagoPorAmigo === "VOCE" ? (
										<>
											<span className="text-emerald-600 dark:text-emerald-400">
												Você recebe de {contatoSelecionado?.nome || "Amigo"}:
											</span>
											<span className="text-emerald-600 dark:text-emerald-400 text-base">
												R${" "}
												{cotaContatoAmigo.toLocaleString("pt-BR", {
													minimumFractionDigits: 2,
												})}
											</span>
										</>
									) : (
										<>
											<span className="text-rose-600 dark:text-rose-400">
												Você deve pagar a {contatoSelecionado?.nome || "Amigo"}:
											</span>
											<span className="text-rose-600 dark:text-rose-400 text-base">
												R${" "}
												{minhaCotaAmigo.toLocaleString("pt-BR", {
													minimumFractionDigits: 2,
												})}
											</span>
										</>
									)}
								</div>
							</>
						) : (
							<div className="space-y-1.5">
								{calculoMembrosGrupo.map((m) => (
									<div
										key={m.id}
										className="flex justify-between items-center text-xs">
										<span className="font-bold text-slate-700 dark:text-slate-300">
											{m.nome}:
										</span>
										<span className="font-black text-slate-900 dark:text-slate-100">
											R${" "}
											{m.valorDevido.toLocaleString("pt-BR", {
												minimumFractionDigits: 2,
											})}
										</span>
									</div>
								))}
								<div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-xs font-bold text-purple-600 dark:text-purple-400">
									<span>Pagador Total:</span>
									<span>
										{
											participantesGrupo.find((p) => p.id === pagadorGrupoId)
												?.nome
										}
									</span>
								</div>
							</div>
						)}
					</div>

					{/* FORMA DE PAGAMENTO SE VOCÊ PAGOU */}
					<div className="space-y-2">
						<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ml-1">
							Origem do Pagamento (Conta ou Cartão)
						</label>
						<div className="grid grid-cols-2 gap-3">
							<button
								type="button"
								onClick={() => setFormaPagamento("CONTA")}
								className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer ${
									formaPagamento === "CONTA"
										? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900"
										: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
								}`}>
								<Wallet size={16} /> Conta Bancária
							</button>
							<button
								type="button"
								onClick={() => setFormaPagamento("CARTAO")}
								className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer ${
									formaPagamento === "CARTAO"
										? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900"
										: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
								}`}>
								<CreditCard size={16} /> Cartão de Crédito
							</button>
						</div>

						{formaPagamento === "CONTA" && contas.length > 0 && (
							<select
								value={contaId}
								onChange={(e) => setContaId(e.target.value)}
								className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-800 dark:text-slate-100">
								{contas.map((c) => (
									<option key={c.id} value={c.id}>
										{c.nome}
									</option>
								))}
							</select>
						)}

						{formaPagamento === "CARTAO" && cartoes.length > 0 && (
							<select
								value={cartaoId}
								onChange={(e) => setCartaoId(e.target.value)}
								className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-800 dark:text-slate-100">
								{cartoes.map((c) => (
									<option key={c.id} value={c.id}>
										{c.nome}
									</option>
								))}
							</select>
						)}

						{(tipoDestino === "AMIGO" ? pagoPorAmigo === "VOCE" : Boolean(participantesGrupo.find((p) => p.id === pagadorGrupoId)?.is_user)) && (
						<label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 cursor-pointer">
							<input
								type="checkbox"
								className="mt-0.5 w-4 h-4 accent-emerald-600 shrink-0"
								checked={jaNoExtrato}
								onChange={(e) => setJaNoExtrato(e.target.checked)}
							/>
							<span>
								<span className="block text-xs font-bold text-slate-800 dark:text-slate-100">
									Essa compra já está (ou vai entrar) na minha fatura/extrato
								</span>
								<span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
									Registra só quanto vão te pagar. Não soma nos seus gastos, na fatura nem no saldo, para não lançar duas vezes quando você importar o extrato.
								</span>
							</span>
						</label>
						)}
					</div>

					<label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 cursor-pointer">
						<input
							type="checkbox"
							className="w-4 h-4 accent-indigo-600 shrink-0"
							checked={avisarPorEmail}
							onChange={(e) => setAvisarPorEmail(e.target.checked)}
						/>
						<span className="text-xs font-bold text-slate-800 dark:text-slate-100">
							Avisar por e-mail
							<span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">
								Quem tiver e-mail cadastrado recebe o lançamento e a parte que lhe cabe.
							</span>
						</span>
					</label>

					{/* OPÇÃO DE RECORRÊNCIA (MENSAL TODO DIA X) */}
					<div className="p-4 rounded-2xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 space-y-3">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2.5">
								<div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
									isRecorrente ? "bg-purple-600 text-white shadow-xs" : "bg-slate-200 dark:bg-slate-800 text-slate-500"
								}`}>
									<RotateCcw size={16} />
								</div>
								<div>
									<span className="font-bold text-xs text-slate-800 dark:text-slate-100 block">
										Pagamento Recorrente Mensal
									</span>
									<span className="text-[10px] text-slate-400 block">
										Ex: Assinatura Spotify, Netflix, internet ou academia todo mês
									</span>
								</div>
							</div>

							<label className="relative inline-flex items-center cursor-pointer">
								<input
									type="checkbox"
									checked={isRecorrente}
									onChange={(e) => setIsRecorrente(e.target.checked)}
									className="sr-only peer"
								/>
								<div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-purple-600"></div>
							</label>
						</div>

						{isRecorrente && (
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2.5 border-t border-purple-200/50 dark:border-purple-900/40 animate-in fade-in duration-150">
								<div className="space-y-1">
									<label className="text-[10px] font-black uppercase text-purple-700 dark:text-purple-300">
										Dia do Mês para Acerto
									</label>
									<div className="flex items-center gap-2">
										<span className="text-xs font-bold text-slate-500">Todo dia</span>
										<input
											type="number"
											min={1}
											max={31}
											value={diaDoMes}
											onChange={(e) => setDiaDoMes(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
											className="w-20 bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800 rounded-xl px-3 py-1.5 text-xs font-black text-center text-purple-700 dark:text-purple-300 outline-none focus:ring-2 focus:ring-purple-500"
										/>
										<span className="text-xs font-bold text-slate-500">do mês</span>
									</div>
								</div>

								<div className="space-y-1">
									<label className="text-[10px] font-black uppercase text-purple-700 dark:text-purple-300">
										Duração da Recorrência
									</label>
									<select
										value={mesesRecorrencia}
										onChange={(e) => setMesesRecorrencia(parseInt(e.target.value))}
										className="w-full bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
									>
										<option value={3}>3 meses</option>
										<option value={6}>6 meses (Semestral)</option>
										<option value={12}>12 meses (1 Ano)</option>
										<option value={24}>24 meses (2 Anos)</option>
									</select>
								</div>
							</div>
						)}
					</div>

					{/* SUBMIT BUTTON */}
					<div className="pt-2 shrink-0">
						<button
							type="submit"
							disabled={loading}
							className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-xl shadow-emerald-100 dark:shadow-none disabled:opacity-50 cursor-pointer text-sm uppercase">
							<Check size={18} />
							{loading
								? "SALVANDO..."
								: isRecorrente
								? `PROGRAMAR RECORRÊNCIA (${mesesRecorrencia} MESES)`
								: "CONFIRMAR E REGISTRAR DIVISÃO"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
