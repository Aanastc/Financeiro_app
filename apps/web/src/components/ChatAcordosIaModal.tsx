import { useState, useRef, useEffect } from "react";
import {
	X,
	Send,
	Sparkles,
	Bot,
	User,
	CheckCircle2,
	AlertCircle,
	ShieldCheck,
	Loader2,
	ChevronRight } from "lucide-react";
import { aiService } from "../../../../packages/services/ai.service";
import { supabase } from "../../../../packages/services/supabase";
import { toast } from "react-hot-toast";

interface ChatAcordosIaModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess: () => void;
	userId?: string;
	contatosDisponiveis?: any[];
}

interface ItemAcordo {
	titulo: string;
	parcelaAtual?: number;
	totalParcelas?: number;
	valor: number;
	status?: string;
}

interface PagamentoCronograma {
	data: string;
	valor: number;
	observacao?: string;
	pago?: boolean;
}

interface AcordoEstruturado {
	contatoNome?: string;
	contatoId?: string;
	tipoRelacao?: "DEVO_PARA_ELE" | "ELE_ME_DEVE";
	itens: ItemAcordo[];
	totalMensalAtual?: number;
	adiantamentoValor?: number;
	adiantamentoData?: string;
	saldoCreditoRestante?: number;
	cronograma: PagamentoCronograma[];
	dataQuitacaoFinal?: string;
	prontoParaLancar?: boolean;
	campoFaltante?: string;
}

interface ChatMessage {
	id: string;
	sender: "user" | "ai";
	text: string;
	acordoPreview?: AcordoEstruturado | null;
	timestamp: string;
}

export default function ChatAcordosIaModal({
	isOpen,
	onClose,
	onSuccess,
	userId = "",
	contatosDisponiveis = [],
}: ChatAcordosIaModalProps) {
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [contatoSelecionadoId, setContatoSelecionadoId] = useState("");
	const [acordoAtual, setAcordoAtual] = useState<AcordoEstruturado | null>(
		null,
	);

	const [messages, setMessages] = useState<ChatMessage[]>([
		{
			id: "welcome",
			sender: "ai",
			text: "Olá! Sou seu Assistente de Acordos e Divisão de Contas.\n\nVocê pode colar aqui mensagens do WhatsApp, anotações de parcelas, adiantamentos ou acordos combinados com amigos. Eu vou organizar as contas, abater saldos positivos, montar o cronograma mês a mês e pedir sua validação antes de lançar!",
			timestamp: new Date().toLocaleTimeString("pt-BR", {
				hour: "2-digit",
				minute: "2-digit",
			}),
		},
	]);

	const messagesEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (isOpen) {
			setTimeout(() => {
				messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
			}, 100);
		}
	}, [isOpen, messages]);

	if (!isOpen) return null;

	// Parser algorítmico robusto e resiliente (suporta emojis, formatações do WhatsApp/Markdown e datas)
	const extrairAcordoFallback = (texto: string): AcordoEstruturado => {
		const itens: ItemAcordo[] = [];
		const cronogramaFinal: PagamentoCronograma[] = [];
		let adiantamentoValor = 0;
		let adiantamentoData = "";
		let saldoCreditoRestante = 0;
		let dataQuitacaoFinal = "";

		const linhas = texto.split("\n");

		// Se houver bloco explícito com 💰 (cronograma consolidado com valores finais), prioriza para o cronograma
		const linhasComSacoMoedas = linhas.filter((l) => l.includes("💰"));
		const linhasCronograma =
			linhasComSacoMoedas.length > 0 ? linhasComSacoMoedas : linhas;

		for (const linhaOriginal of linhas) {
			const linha = linhaOriginal.replace(/[*_#]/g, "").trim();
			if (!linha) continue;

			// Ex: Celular 1 — 9/10 parcelas — R$ 379,61
			const matchItem = linha.match(
				/(?:📱|💻|🏋️|•|-)*\s*([A-Za-z0-9\sÀ-ÿ]+?)\s*[—–-]\s*(?:(\d+)\/(\d+)\s*parcelas?|mensal)\s*[—–-]\s*(?:R\$\s*)?([\d.,]+)/i,
			);
			if (matchItem) {
				const titulo = matchItem[1].trim();
				const pAtual = matchItem[2] ? parseInt(matchItem[2], 10) : undefined;
				const pTotal = matchItem[3] ? parseInt(matchItem[3], 10) : undefined;
				const valor = parseFloat(
					matchItem[4].replace(/\./g, "").replace(",", "."),
				);
				if (
					titulo &&
					!isNaN(valor) &&
					!itens.some((i) => i.titulo === titulo)
				) {
					itens.push({
						titulo,
						parcelaAtual: pAtual,
						totalParcelas: pTotal,
						valor,
					});
				}
			}

			// Pagamento / Adiantamento (ex: "No dia 18/09, transferi R$ 1.600,00")
			const matchAdiant1 = linha.match(
				/(?:dia\s*)?(\d{1,2}\/\d{1,2})[^\d]*(?:transferi|adiantei|paguei)\s*(?:R\$\s*)?([\d.,]+)/i,
			);
			const matchAdiant2 = linha.match(
				/(?:transferi|adiantei|paguei)\s*(?:R\$\s*)?([\d.,]+)[^\d]*(?:dia\s*)?(\d{1,2}\/\d{1,2})/i,
			);
			if (matchAdiant1) {
				adiantamentoData = matchAdiant1[1];
				adiantamentoValor = parseFloat(
					matchAdiant1[2].replace(/\./g, "").replace(",", "."),
				);
			} else if (matchAdiant2) {
				adiantamentoValor = parseFloat(
					matchAdiant2[1].replace(/\./g, "").replace(",", "."),
				);
				adiantamentoData = matchAdiant2[2];
			}

			const matchSaldoPos = linha.match(
				/saldo\s+positivo\s+de\s*(?:R\$\s*)?([\d.,]+)/i,
			);
			if (matchSaldoPos) {
				saldoCreditoRestante = parseFloat(
					matchSaldoPos[1].replace(/\./g, "").replace(",", "."),
				);
			}

			// Quitação final
			const matchQuitacao = linha.match(
				/(?:após o pagamento de|quitado até|quitação em|totalmente quitado[^\d]*)\s*(\d{1,2}\/\d{1,2})/i,
			);
			if (matchQuitacao) {
				dataQuitacaoFinal = matchQuitacao[1];
			}
		}

		// Cronograma ordenado
		for (const linhaOriginal of linhasCronograma) {
			const linha = linhaOriginal.replace(/[*_#]/g, "").trim();
			const matchDataValor = linha.match(
				/(?:💰|📅|•)*\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*[:—–-]\s*(?:R\$\s*)?([\d.,]+)(?:\s*[—–-]\s*(.*))?/i,
			);
			if (matchDataValor) {
				const dataStr = matchDataValor[1];
				const val = parseFloat(
					matchDataValor[2].replace(/\./g, "").replace(",", "."),
				);
				const obs = matchDataValor[3]?.trim() || "";
				if (!isNaN(val)) {
					const jaPago =
						obs.toLowerCase().includes("já transferido") ||
						obs.toLowerCase().includes("pago");
					if (
						!cronogramaFinal.some((c) => c.data === dataStr && c.valor === val)
					) {
						cronogramaFinal.push({
							data: dataStr,
							valor: val,
							observacao: obs,
							pago: jaPago,
						});
					}
				}
			}
		}

		if (cronogramaFinal.length > 0 && !dataQuitacaoFinal) {
			dataQuitacaoFinal = cronogramaFinal[cronogramaFinal.length - 1].data;
		}

		const totalMensalAtual = itens.reduce((sum, item) => sum + item.valor, 0);

		// Checa se há nome de contato no texto
		let contatoEncontrado: any = null;
		for (const c of contatosDisponiveis || []) {
			if (c.nome && texto.toLowerCase().includes(c.nome.toLowerCase())) {
				contatoEncontrado = c;
				break;
			}
		}

		return {
			contatoNome: contatoEncontrado?.nome,
			contatoId: contatoEncontrado?.id,
			tipoRelacao: "DEVO_PARA_ELE",
			itens,
			totalMensalAtual,
			adiantamentoValor: adiantamentoValor || undefined,
			adiantamentoData: adiantamentoData || undefined,
			saldoCreditoRestante: saldoCreditoRestante || undefined,
			cronograma: cronogramaFinal,
			dataQuitacaoFinal,
			prontoParaLancar: Boolean(
				contatoEncontrado && cronogramaFinal.length > 0,
			),
			campoFaltante: !contatoEncontrado ? "contato" : undefined,
		};
	};

	const processarTextoComIa = async (texto: string) => {
		try {
			const nomesContatosExistentes = (contatosDisponiveis || [])
				.map((c) => `id: "${c.id}", nome: "${c.nome}"`)
				.join("; ");

			const prompt = `Você é um assistente financeiro especialista em interpretar acordos de divisão de despesas (estilo Splitwise).
Analise o texto abaixo e extraia um JSON estruturado com todos os detalhes do acordo.

Contatos já cadastrados no sistema:
[${nomesContatosExistentes}]

Texto fornecido pelo usuário:
"""
${texto}
"""

Responda SOMENTE um objeto JSON válido (sem tags markdown de bloco, sem explicações), com esta interface:
{
  "contatoNome": string ou null (identifique se o texto menciona algum contato ou pessoa a quem pertence a conta),
  "contatoId": string ou null (se bater com algum dos contatos cadastrados),
  "tipoRelacao": "DEVO_PARA_ELE" ou "ELE_ME_DEVE" (o padrão para parcelas que o usuário vai pagar a alguém é "DEVO_PARA_ELE"),
  "itens": [
    {
      "titulo": string (ex: "Celular 1", "Seguro notebook"),
      "parcelaAtual": number ou null,
      "totalParcelas": number ou null,
      "valor": number
    }
  ],
  "totalMensalAtual": number (soma das parcelas ativas),
  "adiantamentoValor": number ou null (se houve transferência prévia/adiantamento),
  "adiantamentoData": string ou null (ex: "18/09"),
  "saldoCreditoRestante": number ou null (crédito positivo que sobrou do adiantamento),
  "cronograma": [
    {
      "data": string (ex: "06/10", "05/11", "05/12"),
      "valor": number,
      "observacao": string (ex: "Quitação Celular 1", "Cancelamento academia"),
      "pago": boolean (true se já foi transferido/pago)
    }
  ],
  "dataQuitacaoFinal": string ou null (ex: "05/04"),
  "campoFaltante": string ou null ("contato" se não foi informado quem é o credor/devedor)
}`;

			return await aiService.gerarJson<AcordoEstruturado>("acordo", [prompt]);
		} catch (error) {
			console.warn("Erro ao chamar Gemini, usando fallback local:", error);
			return extrairAcordoFallback(texto);
		}
	};

	const handleEnviarMensagem = async () => {
		const texto = input.trim();
		if (!texto || loading) return;

		const userMsg: ChatMessage = {
			id: Date.now().toString(),
			sender: "user",
			text: texto,
			timestamp: new Date().toLocaleTimeString("pt-BR", {
				hour: "2-digit",
				minute: "2-digit",
			}),
		};

		setMessages((prev) => [...prev, userMsg]);
		setInput("");
		setLoading(true);

		try {
			// Processa o texto com a IA
			const resultado = await processarTextoComIa(texto);

			// Se o usuário selecionou contato previamente, aplica
			if (contatoSelecionadoId && !resultado.contatoId) {
				const c = contatosDisponiveis.find(
					(x) => x.id === contatoSelecionadoId,
				);
				if (c) {
					resultado.contatoId = c.id;
					resultado.contatoNome = c.nome;
					delete resultado.campoFaltante;
				}
			}

			setAcordoAtual(resultado);

			let respostaTexto = "";
			if (!resultado.contatoNome && !resultado.contatoId) {
				respostaTexto =
					"Entendi o cronograma e os valores com perfeição! 🎉\n\nPorém, **para quem você deve** esse valor (ou quem deve para você)?\n\nSelecione um contato abaixo ou me informe o nome da pessoa para vincularmos ao acordo:";
			} else {
				respostaTexto = `Organizei todos os itens com **${resultado.contatoNome}**! Veja o demonstrativo de conferência abaixo para validar antes de lançar:`;
			}

			const aiMsg: ChatMessage = {
				id: (Date.now() + 1).toString(),
				sender: "ai",
				text: respostaTexto,
				acordoPreview: resultado,
				timestamp: new Date().toLocaleTimeString("pt-BR", {
					hour: "2-digit",
					minute: "2-digit",
				}),
			};

			setMessages((prev) => [...prev, aiMsg]);
		} catch (err) {
			toast.error("Ocorreu um erro ao processar o acordo.");
		} finally {
			setLoading(false);
		}
	};

	const vincularContato = (contatoId: string) => {
		setContatoSelecionadoId(contatoId);
		const c = contatosDisponiveis.find((x) => x.id === contatoId);
		if (!c || !acordoAtual) return;

		const atualizado: AcordoEstruturado = {
			...acordoAtual,
			contatoId: c.id,
			contatoNome: c.nome,
			campoFaltante: undefined,
			prontoParaLancar: true,
		};

		setAcordoAtual(atualizado);

		const msg: ChatMessage = {
			id: Date.now().toString(),
			sender: "ai",
			text: `Perfeito! Vinculei este acordo a **${c.nome}**. Confira os dados completos e clique em **"Confirmar e Registrar Acordo"** para salvar:`,
			acordoPreview: atualizado,
			timestamp: new Date().toLocaleTimeString("pt-BR", {
				hour: "2-digit",
				minute: "2-digit",
			}),
		};

		setMessages((prev) => [...prev, msg]);
	};

	const handleConfirmarELancar = async (acordo: AcordoEstruturado) => {
		if (!acordo.contatoId && !acordo.contatoNome) {
			toast.error("Selecione um contato antes de confirmar o acordo.");
			return;
		}

		setSaving(true);
		try {
			let effectiveUserId = userId;
			if (!effectiveUserId) {
				const {
					data: { user },
				} = await supabase.auth.getUser();
				effectiveUserId = user?.id || "";
			}

			let finalContatoId = acordo.contatoId;

			// Cria o contato se for nome novo
			if (!finalContatoId && acordo.contatoNome) {
				const { data: newContato, error: errContato } = await supabase
					.from("contatos")
					.insert([{ usuario_id: effectiveUserId, nome: acordo.contatoNome }])
					.select()
					.single();

				if (errContato) throw errContato;
				finalContatoId = newContato.id;
			}

			// Prepara data base no formato ISO com suporte inteligente à virada de ano
			const anoAtual = new Date().getFullYear();
			const primeiroMes =
				parseInt(acordo.cronograma[0]?.data?.split("/")?.[1], 10) || 1;
			const formatarData = (dStr: string) => {
				const parts = dStr.split("/");
				const dia = parts[0].padStart(2, "0");
				const mes = parseInt(parts[1], 10);
				if (parts[2]) {
					return `${parts[2]}-${String(mes).padStart(2, "0")}-${dia}`;
				}
				// Se o mês for menor que o mês de início da série (ex: 01, 02, 03 vs 09, 10), pertence ao ano seguinte
				const ano = mes < primeiroMes ? anoAtual + 1 : anoAtual;
				return `${ano}-${String(mes).padStart(2, "0")}-${dia}`;
			};

			// Lança cada parcela do cronograma como transação com metadados
			const transacoesParaInserir = (acordo.cronograma || []).map(
				(pag, idx) => {
					const dataIso = formatarData(pag.data);
					const isJaPago = pag.pago || false;
					const rotulo = pag.observacao
						? `${pag.observacao}`
						: acordo.itens[0]?.titulo || "Acordo Parcelado";

					return {
						usuario_id: effectiveUserId,
						tipo: "DESPESA",
						descricao: `${rotulo} (${idx + 1}/${acordo.cronograma.length}) - ${acordo.contatoNome}`,
						valor: pag.valor,
						data: dataIso,
						status: isJaPago ? "confirmada" : "pendente",
						terceiro: true,
						terceiro_pago: isJaPago,
						contato_id: finalContatoId,
						observacao: JSON.stringify({
							parceria_credor_id: finalContatoId,
							acordo_ia: true,
							valor_total: pag.valor,
							observacao_original: pag.observacao,
							itens_inclusos: acordo.itens.map((i) => i.titulo),
							quitacao_prevista: acordo.dataQuitacaoFinal,
						}),
					};
				},
			);

			if (transacoesParaInserir.length > 0) {
				const { error: errInsert } = await supabase
					.from("transacoes")
					.insert(transacoesParaInserir);

				if (errInsert) throw errInsert;
			}

			toast.success("Acordo registrado com sucesso!");
			onSuccess();
			onClose();
		} catch (error) {
			console.error("Erro ao registrar acordo:", error);
			toast.error("Erro ao salvar as parcelas do acordo.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
			<div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl h-[88vh] max-h-[800px] flex flex-col shadow-2xl overflow-hidden">
				{/* CABEÇALHO */}
				<div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center shadow-xs">
							<Sparkles size={20} />
						</div>
						<div>
							<h3 className="font-black text-base text-slate-800 dark:text-slate-100 flex items-center gap-2">
								Assistente IA de Acordos & Divisões
								<span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
									Gemini AI
								</span>
							</h3>
							<p className="text-xs text-slate-400 font-medium">
								Cole mensagens de parcelas, adiantamentos e o robô monta o
								cronograma para validação.
							</p>
						</div>
					</div>

					<button
						onClick={onClose}
						className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
						<X size={18} />
					</button>
				</div>

				{/* CORPO DO CHAT COM MENSAGENS E CARDS */}
				<div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
					{messages.map((msg) => (
						<div
							key={msg.id}
							className={`flex gap-3 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
							{msg.sender === "ai" && (
								<div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-1">
									<Bot size={16} />
								</div>
							)}

							<div
								className={`max-w-[85%] sm:max-w-[78%] space-y-3 ${msg.sender === "user" ? "items-end" : "items-start"}`}>
								{/* BOLHA DE TEXTO */}
								<div
									className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
										msg.sender === "user"
											? "bg-purple-600 text-white font-medium rounded-tr-xs shadow-xs"
											: "bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 rounded-tl-xs border border-slate-200/50 dark:border-slate-700/50"
									}`}>
									{msg.text}
								</div>

								{/* SELETOR RÁPIDO DE CONTATO SE ESTIVER FALTANDO */}
								{msg.acordoPreview?.campoFaltante === "contato" && (
									<div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 space-y-3">
										<div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs">
											<AlertCircle size={15} />
											<span>Selecione para quem é este acordo:</span>
										</div>

										<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
											{contatosDisponiveis.map((c) => (
												<button
													key={c.id}
													onClick={() => vincularContato(c.id)}
													className="p-2.5 rounded-xl border border-amber-200/60 dark:border-amber-800/50 bg-white dark:bg-slate-900 hover:border-purple-500 text-left transition-all cursor-pointer flex items-center justify-between gap-2">
													<span className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">
														{c.nome}
													</span>
													<ChevronRight
														size={14}
														className="text-slate-400 shrink-0"
													/>
												</button>
											))}
										</div>
									</div>
								)}

								{/* CARD DE CONFERÊNCIA E VALIDAÇÃO ESTRUTURADO */}
								{msg.acordoPreview &&
									msg.acordoPreview.cronograma.length > 0 && (
										<div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800/80 shadow-md space-y-4">
											<div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
												<div className="flex items-center gap-2">
													<ShieldCheck size={18} className="text-purple-600" />
													<h4 className="font-black text-xs sm:text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider">
														Resumo para Validação
													</h4>
												</div>
												<span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
													{msg.acordoPreview.contatoNome
														? `Com ${msg.acordoPreview.contatoNome}`
														: "Contato Pendente"}
												</span>
											</div>

											{/* ITENS INCLUSOS */}
											{msg.acordoPreview.itens.length > 0 && (
												<div className="space-y-1.5">
													<p className="text-[10px] font-black uppercase text-slate-400">
														Itens / Parcelas Identificadas:
													</p>
													<div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
														{msg.acordoPreview.itens.map((item, idx) => (
															<div
																key={idx}
																className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
																<span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
																	{item.titulo}{" "}
																	{item.parcelaAtual && item.totalParcelas
																		? `(${item.parcelaAtual}/${item.totalParcelas})`
																		: ""}
																</span>
																<span className="font-bold text-slate-900 dark:text-slate-100 ml-2 shrink-0">
																	R$ {item.valor.toFixed(2)}
																</span>
															</div>
														))}
													</div>
												</div>
											)}

											{/* CRONOGRAMA DE PAGAMENTOS COM ADIANTAMENTOS */}
											<div className="space-y-2">
												<div className="flex items-center justify-between">
													<p className="text-[10px] font-black uppercase text-slate-400">
														Cronograma de Próximos Pagamentos:
													</p>
													{msg.acordoPreview.dataQuitacaoFinal && (
														<span className="text-[10px] font-bold text-purple-600">
															Quitação final:{" "}
															{msg.acordoPreview.dataQuitacaoFinal}
														</span>
													)}
												</div>

												<div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
													{msg.acordoPreview.cronograma.map((pag, idx) => (
														<div
															key={idx}
															className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
																pag.pago
																	? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300"
																	: "bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200"
															}`}>
															<div className="flex items-center gap-2 min-w-0">
																<span className="font-black w-14 shrink-0 text-purple-600 dark:text-purple-400">
																	{pag.data}
																</span>
																<span className="truncate text-slate-500 dark:text-slate-400 text-[11px]">
																	{pag.observacao || "Parcela mensal"}
																</span>
															</div>

															<div className="flex items-center gap-2 shrink-0">
																<span className="font-black text-xs">
																	R$ {pag.valor.toFixed(2)}
																</span>
																{pag.pago && (
																	<span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60">
																		Pago
																	</span>
																)}
															</div>
														</div>
													))}
												</div>
											</div>

											{/* BOTÃO DE CONFIRMAR E LANÇAR */}
											{msg.acordoPreview.contatoNome && (
												<button
													onClick={() =>
														handleConfirmarELancar(msg.acordoPreview!)
													}
													disabled={saving}
													className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer">
													{saving ? (
														<>
															<Loader2 size={16} className="animate-spin" />{" "}
															Registrando no Sistema...
														</>
													) : (
														<>
															<CheckCircle2 size={16} /> Confirmar e Registrar
															Acordo
														</>
													)}
												</button>
											)}
										</div>
									)}
							</div>

							{msg.sender === "user" && (
								<div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 mt-1">
									<User size={16} />
								</div>
							)}
						</div>
					))}

					{loading && (
						<div className="flex items-center gap-2 text-xs font-bold text-purple-600 p-2">
							<Loader2 size={16} className="animate-spin" />
							<span>Interpretando acordo e calculando parcelas...</span>
						</div>
					)}
					<div ref={messagesEndRef} />
				</div>

				{/* BARRA DE ENTRADA DO CHAT */}
				<div className="p-3 sm:p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
					<form
						onSubmit={(e) => {
							e.preventDefault();
							handleEnviarMensagem();
						}}
						className="flex items-end gap-2">
						<textarea
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									handleEnviarMensagem();
								}
							}}
							placeholder="Cole o acordo aqui ou envie uma mensagem (ex: 'Esse acordo é com a Maria')..."
							rows={2}
							className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-purple-500 resize-none"
						/>

						<button
							type="submit"
							disabled={!input.trim() || loading}
							className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white flex items-center justify-center shadow-md transition-all cursor-pointer shrink-0">
							<Send size={18} />
						</button>
					</form>
				</div>
			</div>
		</div>
	);
}
