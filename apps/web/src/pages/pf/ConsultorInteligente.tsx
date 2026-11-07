import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../../../packages/services/supabase";
import { financeService } from "../../../../../packages/services/finance.service";
import { aiService } from "../../../../../packages/services/ai.service";
import toast from "react-hot-toast";
import {
	Brain,
	Sparkles,
	Copy,
	Check,
	RefreshCw,
	ChevronLeft,
	ChevronRight,
	Send,
	Wallet,
	AlertTriangle,
	MessageSquare,
	ArrowUpRight,
	Bot,
	User as UserIcon,
	GraduationCap,
	ShieldCheck,
	PiggyBank,
	Trash2,
	ThumbsUp,
	Loader2,
	Info,
} from "lucide-react";
import { montarContextoFinanceiro, calcularNota, type ContextoFinanceiro } from "../../lib/contextoFinanceiro";
import {
	FASES,
	promptRelatorio,
	promptChat,
	relatorioLocal,
	perguntasSugeridas,
	validarRelatorio,
	type RelatorioEducador,
} from "../../lib/educadorFinanceiro";

interface ChatMessage {
	id: string;
	sender: "user" | "ai";
	text: string;
	timestamp: string;
}

const moeda = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const agora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const chaveRelatorio = (ano: number) => `finance_educador_relatorio_v2_${ano}`;
const chaveChat = (ano: number) => `finance_educador_chat_v2_${ano}`;
const lerCache = <T,>(chave: string): T | null => {
	try {
		const t = localStorage.getItem(chave);
		return t ? (JSON.parse(t) as T) : null;
	} catch {
		return null;
	}
};
const salvarCache = (chave: string, valor: unknown) => {
	try {
		localStorage.setItem(chave, JSON.stringify(valor));
	} catch {
		/* sem armazenamento */
	}
};

/** **negrito** e listas "- " vindas da IA, sem HTML cru. */
function TextoFormatado({ texto }: { texto: string }) {
	const negrito = (linha: string) =>
		linha.split(/\*\*([^*]+)\*\*/g).map((p, i) => (i % 2 === 1 ? <strong key={i} className="font-extrabold">{p}</strong> : p));
	return (
		<>
			{texto.split("\n").map((linha, i) => {
				const item = linha.match(/^\s*[-•*]\s+(.*)/);
				if (item) {
					return (
						<div key={i} className="flex gap-2 pl-1">
							<span className="text-indigo-500">•</span>
							<span>{negrito(item[1])}</span>
						</div>
					);
				}
				return linha.trim() ? <p key={i}>{negrito(linha)}</p> : <div key={i} className="h-2" />;
			})}
		</>
	);
}

const GRAVIDADE = {
	alta: "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-200",
	media: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200",
	baixa: "bg-sky-50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-900/50 text-sky-800 dark:text-sky-200",
};

const ETAPAS_CARREGANDO = [
	"Lendo suas entradas e gastos dos últimos meses...",
	"Separando gastos fixos, variáveis e recorrentes...",
	"Conferindo cartões, dívidas e reserva...",
	"Preparando seu plano e a lição do dia...",
];

export default function ConsultorInteligente() {
	const [ano, setAno] = useState(new Date().getFullYear());
	const [userId, setUserId] = useState<string | null>(null);
	const [ctx, setCtx] = useState<ContextoFinanceiro | null>(null);
	const [carregandoDados, setCarregandoDados] = useState(true);

	const [relatorio, setRelatorio] = useState<(RelatorioEducador & { geradoEm?: string }) | null>(null);
	const [gerando, setGerando] = useState(false);
	const [etapa, setEtapa] = useState(0);
	const [copiado, setCopiado] = useState(false);

	const [chat, setChat] = useState<ChatMessage[]>([]);
	const [entrada, setEntrada] = useState("");
	const [enviando, setEnviando] = useState(false);
	const fimChatRef = useRef<HTMLDivElement>(null);

	const boasVindas = (a: number): ChatMessage => ({
		id: "welcome",
		sender: "ai",
		text: `Oi! Sou seu educador financeiro. Já olhei seus números de ${a}: pode me perguntar qualquer coisa sobre seus gastos, dívidas, reserva ou metas, que eu explico com base na sua realidade.`,
		timestamp: agora(),
	});

	const carregarDados = useCallback(async () => {
		setCarregandoDados(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) return;
			setUserId(user.id);
			setCtx(await montarContextoFinanceiro(user.id, ano));
		} catch (e) {
			console.error("Erro ao montar contexto financeiro:", e);
			toast.error("Não foi possível carregar seus dados financeiros.");
		} finally {
			setCarregandoDados(false);
		}
	}, [ano]);

	useEffect(() => {
		carregarDados();
		setRelatorio(lerCache(chaveRelatorio(ano)));
		setChat(lerCache<ChatMessage[]>(chaveChat(ano)) || [boasVindas(ano)]);
	}, [ano, carregarDados]);

	useEffect(() => {
		if (!gerando) return;
		setEtapa(0);
		const id = setInterval(() => setEtapa((e) => Math.min(e + 1, ETAPAS_CARREGANDO.length - 1)), 1600);
		return () => clearInterval(id);
	}, [gerando]);

	useEffect(() => {
		fimChatRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}, [chat, enviando]);

	const nota = ctx ? calcularNota(ctx) : null;
	const faseIdx = ctx ? FASES.findIndex((f) => f.id === ctx.fase) : -1;
	const sugestoes = relatorio?.perguntas_sugeridas?.length ? relatorio.perguntas_sugeridas : ctx ? perguntasSugeridas(ctx) : [];

	// --------------------------------------------------------------------------
	// Relatório
	// --------------------------------------------------------------------------
	const gerarRelatorio = async () => {
		if (!ctx) return;
		setGerando(true);
		try {
			let r: RelatorioEducador | null = null;
			try {
				r = validarRelatorio(await aiService.gerarJson("consultor", [promptRelatorio(ctx)]));
			} catch (e) {
				console.warn("IA indisponível, usando plano calculado no app:", e);
			}
			const final = { ...(r || relatorioLocal(ctx)), geradoEm: new Date().toISOString() };
			setRelatorio(final);
			salvarCache(chaveRelatorio(ano), final);
			toast.success(r ? "Análise pronta!" : "IA indisponível: mostrei o plano calculado pelo app.");
		} finally {
			setGerando(false);
		}
	};

	const copiarRelatorio = () => {
		if (!relatorio) return;
		const texto = [
			`Resumo: ${relatorio.resumo}`,
			relatorio.pontos_fortes.length ? `\nO que você já faz bem:\n${relatorio.pontos_fortes.map((p) => `- ${p}`).join("\n")}` : "",
			relatorio.alertas.length ? `\nPontos de atenção:\n${relatorio.alertas.map((a) => `- ${a.titulo}: ${a.explicacao}`).join("\n")}` : "",
			`\nPlano de ação:\n${relatorio.plano.map((p, i) => `${i + 1}. ${p.titulo} (${p.prazo}): ${p.acao} — ${p.por_que}${p.impacto ? ` ${p.impacto}` : ""}`).join("\n")}`,
			`\nLição: ${relatorio.licao.tema}\n${relatorio.licao.explicacao}\n${relatorio.licao.exemplo}`,
		].join("\n");
		navigator.clipboard.writeText(texto);
		setCopiado(true);
		toast.success("Análise copiada!");
		setTimeout(() => setCopiado(false), 2500);
	};

	// --------------------------------------------------------------------------
	// Ações pedidas no chat (sempre com confirmação)
	// --------------------------------------------------------------------------
	const executarAcoes = async (dados: any) => {
		if (!userId) return;
		if (dados.quitar_divida) {
			const termo = String(dados.quitar_divida.termo || dados.quitar_divida.descricao || dados.quitar_divida.nome || "").toLowerCase();
			const todas = await financeService.getDividas(userId);
			const alvo = termo
				? (todas || []).find((d: any) => d.status !== "quitada" && ((d.instituicao || "").toLowerCase().includes(termo) || (d.descricao || "").toLowerCase().includes(termo)))
				: null;
			if (!alvo) toast("Não encontrei essa dívida em aberto para dar baixa.");
			else if (window.confirm(`Marcar a dívida "${alvo.descricao}" como quitada?`)) {
				await financeService.quitarDividaManual(alvo.id, true);
				toast.success(`Dívida "${alvo.descricao}" quitada! 🎉`);
			}
		}

		const contas = Array.isArray(dados.contas) ? dados.contas.filter((c: any) => c?.nome) : [];
		const cartoes = Array.isArray(dados.cartoes) ? dados.cartoes.filter((c: any) => c?.nome) : [];
		if (contas.length + cartoes.length === 0) return;
		const ok = window.confirm(
			`Cadastrar/atualizar no sistema?\n\n` +
				contas.map((c: any) => `• Conta: ${c.nome}`).concat(cartoes.map((c: any) => `• Cartão: ${c.nome} (limite ${moeda(Number(c.limite || 0))})`)).join("\n"),
		);
		if (!ok) return;
		const dia = (v: any, padrao: number) => {
			const n = Number(v);
			return Number.isInteger(n) && n >= 1 && n <= 31 ? n : padrao;
		};
		const contaIds: Record<string, string> = {};
		for (const c of contas) {
			const { data: existente } = await supabase.from("contas_bancarias").select("id").eq("usuario_id", userId).ilike("nome", c.nome).maybeSingle();
			if (existente) contaIds[c.nome.toLowerCase()] = existente.id;
			else {
				const { data: nova } = await supabase
					.from("contas_bancarias")
					.insert([{ usuario_id: userId, nome: c.nome, tipo: c.tipo || "Conta Corrente", saldo_inicial: Number(c.saldo_inicial || 0), cor_hex: c.cor_hex || "#111827", instituicao: c.instituicao || c.nome }])
					.select()
					.single();
				if (nova) contaIds[c.nome.toLowerCase()] = nova.id;
			}
		}
		for (const k of cartoes) {
			const contaId = k.conta_nome ? contaIds[String(k.conta_nome).toLowerCase()] || null : null;
			const campos = { limite: Number(k.limite || 0), fechamento_dia: dia(k.fechamento_dia, 1), vencimento_dia: dia(k.vencimento_dia, 10), cor_hex: k.cor_hex || "#ec4899" };
			const { data: existente } = await supabase.from("cartoes").select("id").eq("usuario_id", userId).ilike("nome", k.nome).maybeSingle();
			if (existente) await supabase.from("cartoes").update({ ...campos, ...(contaId ? { conta_id: contaId } : {}) }).eq("id", existente.id);
			else await supabase.from("cartoes").insert([{ usuario_id: userId, nome: k.nome, ...campos, conta_id: contaId }]);
		}
		toast.success("Contas e cartões salvos!");
	};

	// --------------------------------------------------------------------------
	// Chat (com histórico da conversa)
	// --------------------------------------------------------------------------
	const enviar = async (texto?: string) => {
		const pergunta = (texto ?? entrada).trim();
		if (!pergunta || enviando || !ctx) return;
		const msgUsuario: ChatMessage = { id: `u-${Date.now()}`, sender: "user", text: pergunta, timestamp: agora() };
		const historico = chat.filter((m) => m.id !== "welcome");
		const comPergunta = [...chat, msgUsuario];
		setChat(comPergunta);
		setEntrada("");
		setEnviando(true);
		try {
			let resposta = "";
			try {
				resposta = await aiService.gerar("consultor", [
					promptChat(ctx, historico.map((m) => ({ autor: m.sender === "user" ? "usuario" : "educador", texto: m.text })), pergunta),
				]);
			} catch (e) {
				console.warn("IA indisponível no chat:", e);
			}
			if (!resposta) {
				const local = relatorioLocal(ctx);
				resposta = `No momento não consegui falar com a IA, mas pelos seus números:\n\n${local.resumo}\n\n**Próximo passo:** ${local.plano[0]?.titulo} — ${local.plano[0]?.acao}`;
			}
			const acao = resposta.match(/<<<ACTION_JSON([\s\S]*?)ACTION_JSON>>>/);
			if (acao) {
				resposta = resposta.replace(/<<<ACTION_JSON[\s\S]*?ACTION_JSON>>>/, "").trim();
				try {
					await executarAcoes(JSON.parse(acao[1].trim()));
					await carregarDados();
				} catch (e) {
					console.error("Erro ao executar ação do chat:", e);
				}
			}
			const final = [...comPergunta, { id: `a-${Date.now()}`, sender: "ai" as const, text: resposta, timestamp: agora() }];
			setChat(final);
			salvarCache(chaveChat(ano), final.slice(-40));
		} finally {
			setEnviando(false);
		}
	};

	const limparConversa = () => {
		if (!window.confirm("Apagar a conversa com o consultor deste ano?")) return;
		const inicial = [boasVindas(ano)];
		setChat(inicial);
		salvarCache(chaveChat(ano), inicial);
	};

	// --------------------------------------------------------------------------
	// Tela
	// --------------------------------------------------------------------------
	const cartao = "bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm";

	return (
		<div className="space-y-6 pb-20 max-w-6xl mx-auto">
			{/* CABEÇALHO */}
			<div className={`${cartao} p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5`}>
				<div className="flex items-center gap-3">
					<div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-pink-600 flex items-center justify-center text-white shrink-0">
						<GraduationCap size={24} />
					</div>
					<div>
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100">Consultor Financeiro</h1>
							<span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
								<Sparkles size={11} className="text-pink-500" /> Educador com IA
							</span>
						</div>
						<p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
							Entenda seus números, aprenda os conceitos e siga um plano feito para a sua realidade.
						</p>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2.5">
					<div className="flex items-center bg-slate-50 dark:bg-slate-800 rounded-2xl p-1 border border-slate-200 dark:border-slate-700">
						<button onClick={() => setAno(ano - 1)} aria-label="Ano anterior" className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-400 cursor-pointer">
							<ChevronLeft size={18} />
						</button>
						<span className="px-3 font-black text-sm text-slate-800 dark:text-white select-none">{ano}</span>
						<button onClick={() => setAno(ano + 1)} aria-label="Próximo ano" className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-400 cursor-pointer">
							<ChevronRight size={18} />
						</button>
					</div>
					{relatorio && (
						<button onClick={copiarRelatorio} className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-bold text-xs uppercase cursor-pointer">
							{copiado ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />} {copiado ? "Copiado" : "Copiar"}
						</button>
					)}
					<button
						onClick={gerarRelatorio}
						disabled={gerando || carregandoDados || !ctx}
						className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white rounded-2xl font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50">
						{gerando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
						{gerando ? "Analisando..." : relatorio ? "Atualizar análise" : "Analisar minhas finanças"}
					</button>
				</div>
			</div>

			{carregandoDados && !ctx ? (
				<div className={`${cartao} p-12 flex items-center justify-center gap-3 text-slate-500`}>
					<Loader2 className="animate-spin" /> Carregando seus números...
				</div>
			) : ctx && nota ? (
				<>
					{/* JORNADA */}
					<div className={`${cartao} p-5 sm:p-6 space-y-4`}>
						<div className="flex items-center justify-between gap-2">
							<h2 className="text-sm font-black text-slate-800 dark:text-slate-100">Sua jornada financeira</h2>
							<span className="text-[11px] text-slate-400">a etapa é calculada pelos seus números</span>
						</div>
						<ol className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
							{FASES.map((f, i) => {
								const atual = i === faseIdx;
								const feita = i < faseIdx;
								return (
									<li
										key={f.id}
										className={`p-3 rounded-2xl border ${
											atual
												? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-700"
												: feita
													? "border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-900/50"
													: "border-slate-200 dark:border-slate-800"
										}`}>
										<div className="flex items-center gap-2">
											<span
												className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${
													atual ? "bg-indigo-600 text-white" : feita ? "bg-emerald-500 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
												}`}>
												{feita ? <Check size={13} /> : i + 1}
											</span>
											<span className={`text-xs font-black ${atual ? "text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-slate-200"}`}>{f.titulo}</span>
										</div>
										<p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-snug">{f.descricao}</p>
										{atual && <p className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 mt-1.5">Você está aqui</p>}
									</li>
								);
							})}
						</ol>
					</div>

					{/* INDICADORES */}
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
						<div className={`${cartao} p-5`}>
							<p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Saúde financeira</p>
							<p className="mt-1 text-3xl font-black text-slate-800 dark:text-slate-100">
								{nota.nota}
								<span className="text-xs font-bold text-slate-400"> / 100</span>
							</p>
							<div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
								<div
									className={`h-full rounded-full ${nota.nota >= 80 ? "bg-emerald-500" : nota.nota >= 60 ? "bg-indigo-500" : nota.nota >= 40 ? "bg-amber-500" : "bg-rose-500"}`}
									style={{ width: `${nota.nota}%` }}
								/>
							</div>
							<ul className="mt-3 space-y-0.5">
								{nota.criterios.map((k) => (
									<li key={k.rotulo} className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
										<span>{k.rotulo}</span>
										<span className={`font-black ${k.pontos > 0 ? "text-emerald-600 dark:text-emerald-400" : k.pontos < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>
											{k.pontos > 0 ? `+${k.pontos}` : k.pontos}
										</span>
									</li>
								))}
							</ul>
						</div>

						<div className={`${cartao} p-5`}>
							<p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
								<Wallet size={13} /> Sobra média por mês
							</p>
							<p className={`mt-1 text-2xl font-black ${ctx.sobraMediaMensal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
								{moeda(ctx.sobraMediaMensal)}
							</p>
							<p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
								Renda {moeda(ctx.rendaMediaMensal)} − gastos {moeda(ctx.gastoMedioMensal)}
							</p>
							<p className="text-[11px] mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-slate-500 dark:text-slate-400">
								<span>Taxa de poupança</span>
								<span className="font-black text-slate-700 dark:text-slate-200">{ctx.taxaPoupancaMedia}%</span>
							</p>
						</div>

						<div className={`${cartao} p-5`}>
							<p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
								<PiggyBank size={13} /> Reserva de emergência
							</p>
							<p className="mt-1 text-2xl font-black text-slate-800 dark:text-slate-100">
								{ctx.reserva.mesesCobertos.toLocaleString("pt-BR")} <span className="text-sm font-bold text-slate-400">meses</span>
							</p>
							<div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
								<div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, (ctx.reserva.mesesCobertos / 6) * 100)}%` }} />
							</div>
							<p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
								{moeda(ctx.reserva.disponivel)} de {moeda(ctx.gastoMedioMensal * 6)} (meta: 6 meses)
							</p>
						</div>

						<div className={`${cartao} p-5`}>
							<p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
								<AlertTriangle size={13} /> Dívidas
							</p>
							<p className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-500">{moeda(ctx.totalDividas)}</p>
							<p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{moeda(ctx.parcelasDividasMes)} de parcelas por mês</p>
							<p className="text-[11px] mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-slate-500 dark:text-slate-400">
								<span>Peso na renda</span>
								<span className={`font-black ${ctx.comprometimentoDividasPct >= 30 ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-200"}`}>
									{ctx.rendaMediaMensal > 0 ? `${ctx.comprometimentoDividasPct}%` : "—"}
								</span>
							</p>
						</div>
					</div>
					{ctx.mesesBase.length < 3 && (
						<p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 -mt-2">
							<Info size={13} /> As médias usam {ctx.mesesBase.length || "nenhum"} mês(es) com lançamentos. Quanto mais meses registrados, mais preciso fica o diagnóstico.
						</p>
					)}

					{/* ANÁLISE DO EDUCADOR */}
					<div className={`${cartao} p-5 sm:p-7 space-y-6`}>
						<div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
							<h2 className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
								<Brain className="text-indigo-600 dark:text-indigo-400" size={22} /> Diagnóstico e plano de ação
							</h2>
							{relatorio?.geradoEm && (
								<span className="text-[11px] text-slate-400">
									{relatorio.local ? "Calculado pelo app" : "Gerado com IA"} em {new Date(relatorio.geradoEm).toLocaleDateString("pt-BR")}
								</span>
							)}
						</div>

						{gerando ? (
							<div className="py-10 flex flex-col items-center text-center gap-3">
								<Loader2 size={36} className="animate-spin text-indigo-500" />
								<p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{ETAPAS_CARREGANDO[etapa]}</p>
							</div>
						) : relatorio ? (
							<div className="space-y-6">
								<div className="p-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/70 dark:border-slate-800">
									<div className="text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed space-y-1">
										<TextoFormatado texto={relatorio.resumo} />
									</div>
								</div>

								<div className="grid gap-4 md:grid-cols-2">
									{relatorio.pontos_fortes.length > 0 && (
										<div className="space-y-2">
											<h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
												<ThumbsUp size={13} /> O que você já faz bem
											</h3>
											{relatorio.pontos_fortes.map((p, i) => (
												<p key={i} className="text-sm p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-200">
													{p}
												</p>
											))}
										</div>
									)}
									{relatorio.alertas.length > 0 && (
										<div className="space-y-2">
											<h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
												<AlertTriangle size={13} /> Pontos de atenção
											</h3>
											{relatorio.alertas.map((a, i) => (
												<div key={i} className={`text-sm p-3 rounded-xl border ${GRAVIDADE[a.gravidade]}`}>
													<p className="font-black">{a.titulo}</p>
													<p className="text-xs mt-0.5 opacity-90">{a.explicacao}</p>
												</div>
											))}
										</div>
									)}
								</div>

								<div className="space-y-3">
									<h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Seu plano, passo a passo</h3>
									<ol className="space-y-3">
										{relatorio.plano.map((p, i) => (
											<li key={i} className="flex gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
												<span className="shrink-0 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-black">{i + 1}</span>
												<div className="min-w-0 space-y-1">
													<div className="flex flex-wrap items-center gap-2">
														<p className="font-black text-slate-800 dark:text-slate-100 text-sm">{p.titulo}</p>
														<span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{p.prazo}</span>
													</div>
													<p className="text-sm text-slate-700 dark:text-slate-200">{p.acao}</p>
													<p className="text-xs text-slate-500 dark:text-slate-400">
														<span className="font-bold">Por quê: </span>
														{p.por_que}
													</p>
													{p.impacto && <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{p.impacto}</p>}
												</div>
											</li>
										))}
									</ol>
								</div>

								{relatorio.licao?.explicacao && (
									<div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50 to-pink-50 dark:from-indigo-950/40 dark:to-pink-950/20 border border-indigo-200/70 dark:border-indigo-900/50 space-y-2">
										<p className="text-[11px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
											<GraduationCap size={14} /> Lição do dia · {relatorio.licao.tema}
										</p>
										<p className="text-sm text-slate-700 dark:text-slate-200">{relatorio.licao.explicacao}</p>
										{relatorio.licao.exemplo && (
											<p className="text-sm text-slate-700 dark:text-slate-200">
												<span className="font-black">No seu caso: </span>
												{relatorio.licao.exemplo}
											</p>
										)}
									</div>
								)}

								<p className="text-[11px] text-slate-400 flex items-start gap-1.5">
									<ShieldCheck size={13} className="shrink-0 mt-0.5" />
									Conteúdo educativo com base nos dados que você registrou. Não é recomendação de investimento.
								</p>
							</div>
						) : (
							<div className="py-10 text-center space-y-3">
								<div className="w-14 h-14 rounded-3xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
									<Sparkles size={28} />
								</div>
								<h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Pronto para analisar {ano}</h3>
								<p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto">
									Clique em <strong>Analisar minhas finanças</strong>: você recebe um diagnóstico, um plano passo a passo e uma lição prática com os seus números.
								</p>
							</div>
						)}
					</div>

					{/* CHAT */}
					<div className={`${cartao} p-5 sm:p-7 space-y-4`}>
						<div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-xl bg-pink-100 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 flex items-center justify-center">
									<MessageSquare size={20} />
								</div>
								<div>
									<h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Pergunte ao educador</h3>
									<p className="text-xs text-slate-400">Ele lembra da conversa e responde com os seus números.</p>
								</div>
							</div>
							{chat.length > 1 && (
								<button onClick={limparConversa} title="Apagar conversa" aria-label="Apagar conversa" className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer">
									<Trash2 size={16} />
								</button>
							)}
						</div>

						{sugestoes.length > 0 && (
							<div className="flex flex-wrap gap-2">
								{sugestoes.map((s) => (
									<button
										key={s}
										onClick={() => enviar(s)}
										disabled={enviando}
										className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
										{s} <ArrowUpRight size={13} className="text-slate-400" />
									</button>
								))}
							</div>
						)}

						<div className="space-y-3 max-h-[28rem] overflow-y-auto p-2 rounded-2xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800">
							{chat.map((m) => {
								const ia = m.sender === "ai";
								return (
									<div key={m.id} className={`flex gap-2.5 ${ia ? "justify-start" : "justify-end"}`}>
										{ia && (
											<div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-pink-600 text-white flex items-center justify-center shrink-0 mt-1">
												<Bot size={16} />
											</div>
										)}
										<div
											className={`max-w-[85%] sm:max-w-xl p-3.5 rounded-2xl text-sm leading-relaxed space-y-1 ${
												ia ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/70 dark:border-slate-700" : "bg-indigo-600 text-white"
											}`}>
											{ia ? <TextoFormatado texto={m.text} /> : <p className="whitespace-pre-line">{m.text}</p>}
											<span className={`block text-[9px] font-bold ${ia ? "text-slate-400" : "text-indigo-200 text-right"}`}>{m.timestamp}</span>
										</div>
										{!ia && (
											<div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 mt-1">
												<UserIcon size={16} />
											</div>
										)}
									</div>
								);
							})}
							{enviando && (
								<div className="flex items-center gap-2.5">
									<div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-pink-600 text-white flex items-center justify-center shrink-0">
										<Bot size={16} />
									</div>
									<div className="bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs text-slate-500 font-bold flex items-center gap-2">
										<Loader2 size={14} className="animate-spin text-indigo-600" /> Pensando com os seus números...
									</div>
								</div>
							)}
							<div ref={fimChatRef} />
						</div>

						<form
							onSubmit={(e) => {
								e.preventDefault();
								enviar();
							}}
							className="flex items-center gap-2">
							<input
								type="text"
								value={entrada}
								onChange={(e) => setEntrada(e.target.value)}
								placeholder="Ex.: vale a pena antecipar parcelas da minha dívida?"
								disabled={enviando}
								maxLength={800}
								className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
							/>
							<button
								type="submit"
								disabled={!entrada.trim() || enviando}
								aria-label="Enviar pergunta"
								className="p-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl cursor-pointer shrink-0">
								<Send size={18} />
							</button>
						</form>
					</div>
				</>
			) : (
				<div className={`${cartao} p-12 text-center text-slate-500`}>Não foi possível carregar seus dados. Tente recarregar a página.</div>
			)}
		</div>
	);
}
