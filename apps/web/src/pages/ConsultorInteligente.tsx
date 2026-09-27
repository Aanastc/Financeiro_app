import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import { GoogleGenerativeAI } from "@google/generative-ai";
import toast from "react-hot-toast";
import { 
	Brain, 
	Sparkles, 
	Copy, 
	Check, 
	RefreshCw, 
	Lightbulb, 
	ChevronLeft, 
	ChevronRight, 
	Send, 
	ShieldCheck, 
	TrendingUp, 
	TrendingDown, 
	Wallet, 
	AlertTriangle, 
	MessageSquare, 
	PieChart, 
	Target, 
	ArrowUpRight,
	Bot,
	User as UserIcon
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Recommendation {
	icon: string;
	title: string;
	description: string;
	prioridade?: "alta" | "media" | "normal";
	categoria?: string;
}

interface ParsedReport {
	summary: string;
	recommendations: Recommendation[];
}

interface ChatMessage {
	id: string;
	sender: "user" | "ai";
	text: string;
	timestamp: string;
}

function parseAIReport(text: string): ParsedReport {
	const result: ParsedReport = {
		summary: "",
		recommendations: []
	};

	if (!text) return result;

	const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
	let currentSection: "summary" | "recommendations" | null = null;
	const summaryParagraphs: string[] = [];

	for (const line of lines) {
		const lowerLine = line.toLowerCase();
		
		if (
			lowerLine.includes("resumo geral") || 
			lowerLine.includes("situação atual") || 
			lowerLine.includes("diagnóstico")
		) {
			currentSection = "summary";
			continue;
		}
		
		if (
			lowerLine.includes("dicas e recomend") || 
			lowerLine.includes("recomendações") || 
			lowerLine.includes("dicas") ||
			lowerLine.includes("plano de ação")
		) {
			currentSection = "recommendations";
			continue;
		}

		if (currentSection === "summary" || currentSection === null) {
			const cleanLine = line.replace(/^\*\*|^\*|^\#+\s*|\*\*$/g, "").trim();
			if (cleanLine && !cleanLine.toLowerCase().startsWith("resumo geral") && !cleanLine.toLowerCase().startsWith("situação atual")) {
				summaryParagraphs.push(cleanLine);
			}
		} else if (currentSection === "recommendations") {
			const isBullet = /^[•\-\*\d\.\s]*[💡📈💰⚠️🎯🏦🛑💵🔍🚀⭐]/.test(line) || 
							 /^[•\-\*\d\.\(\)]+\s+/.test(line);

			if (isBullet) {
				let lineContent = line.replace(/^[•\-\*\d\.\s\(\)]*/, "").trim();
				let emoji = "💡";
				const emojiMatch = lineContent.match(/^([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDC00-\uDFFF])/);
				if (emojiMatch) {
					emoji = emojiMatch[1];
					lineContent = lineContent.slice(emoji.length).trim();
				}

				let title = "Recomendação";
				let description = lineContent;

				const boldMatch = lineContent.match(/^\*\*(.*?)\*\*(:|-|\s)*(.*)/);
				const colonMatch = lineContent.match(/^(.*?)(:|-)\s*(.*)/);

				if (boldMatch) {
					title = boldMatch[1].trim();
					description = boldMatch[3].trim();
				} else if (colonMatch) {
					title = colonMatch[1].replace(/^\*\*|\*\*$/g, "").trim();
					description = colonMatch[3].trim();
				} else {
					const dotIndex = lineContent.indexOf(".");
					if (dotIndex > 0 && dotIndex < 40) {
						title = lineContent.slice(0, dotIndex).replace(/^\*\*|\*\*$/g, "").trim();
						description = lineContent.slice(dotIndex + 1).trim();
					}
				}

				let prioridade: "alta" | "media" | "normal" = "normal";
				if (["⚠️", "🛑", "urgente", "dívida", "crítica"].some(k => emoji === k || title.toLowerCase().includes(k))) {
					prioridade = "alta";
				} else if (["💡", "econom", "custo", "atenção"].some(k => emoji === k || title.toLowerCase().includes(k))) {
					prioridade = "media";
				}

				result.recommendations.push({
					icon: emoji,
					title: title.replace(/^:\s*/, ""),
					description,
					prioridade
				});
			} else {
				if (result.recommendations.length > 0) {
					result.recommendations[result.recommendations.length - 1].description += " " + line.replace(/^\*\*|\*\*$/g, "").trim();
				} else {
					summaryParagraphs.push(line.replace(/^\*\*|^\*|^\#+\s*|\*\*$/g, "").trim());
				}
			}
		}
	}

	result.summary = summaryParagraphs.join("\n\n");

	if (result.recommendations.length === 0 && text) {
		const items = text.split(/\n\s*\n/);
		items.forEach(item => {
			if (item.toLowerCase().includes("resumo") || item.toLowerCase().includes("diagnóstico")) {
				result.summary = item.replace(/^\*\*|^\*|^\#+\s*|\*\*$/g, "").trim();
			} else if (/[💡📈💰⚠️🎯🏦🛑💵🔍🚀⭐]/.test(item)) {
				const emojiMatch = item.match(/([💡📈💰⚠️🎯🏦🛑💵🔍🚀⭐])/);
				const emoji = emojiMatch ? emojiMatch[1] : "💡";
				const cleanItem = item.replace(/[💡📈💰⚠️🎯🏦🛑💵🔍🚀⭐]/, "").trim();
				const boldMatch = cleanItem.match(/^\*\*(.*?)\*\*(:|-|\s)*(.*)/s);
				if (boldMatch) {
					result.recommendations.push({
						icon: emoji,
						title: boldMatch[1].trim(),
						description: boldMatch[3].trim()
					});
				} else {
					result.recommendations.push({
						icon: emoji,
						title: "Dica",
						description: cleanItem
					});
				}
			}
		});
	}

	if (!result.summary && text) {
		result.summary = text;
	}

	return result;
}

function renderFormattedText(text: string) {
	if (!text) return null;
	const parts = text.split(/\*\*([^*]+)\*\*/g);
	return parts.map((part, index) => {
		if (index % 2 === 1) {
			return <strong key={index} className="font-extrabold text-indigo-600 dark:text-indigo-400">{part}</strong>;
		}
		return part;
	});
}

const LOADING_STEPS = [
	"Coletando saldos bancários e investimentos consolidados...",
	"Estruturando despesas e faturas de cartão de crédito...",
	"Calculando parcelas de dívidas e compromissos ativos...",
	"Avaliando taxa de poupança e fluxo de caixa anual...",
	"Gemini AI gerando diagnóstico estratégico e plano de ação..."
];

const PROMPTS_SUGERIDOS = [
	"Como posso quitar minhas dívidas mais rápido?",
	"Onde estou gastando mais dinheiro este ano?",
	"Quanto devo guardar para reserva de emergência?",
	"Qual a meta de poupança ideal para o meu perfil?"
];

export default function ConsultorInteligente() {
	const hoje = new Date();
	const [filterYear, setFilterYear] = useState(hoje.getFullYear());
	const [aiReport, setAiReport] = useState<string>("");
	const [loadingAI, setLoadingAI] = useState(false);
	const [loadingStepIndex, setLoadingStepIndex] = useState(0);
	const [copySuccess, setCopySuccess] = useState(false);

	// Dados do usuário calculados
	const [metrics, setMetrics] = useState({
		totalReceitas: 0,
		totalGastos: 0,
		saldoContas: 0,
		totalInvestimentos: 0,
		totalDividas: 0,
		devedoresTotal: 0,
		topCategories: [] as { nome: string; valor: number }[],
		cartoesResumo: [] as any[],
		dividasAtivasDetalhes: [] as {
			id: string;
			descricao: string;
			instituicao: string;
			valorOriginal: number;
			valorRestante: number;
			parcelasPagas: number;
			totalParcelas: number;
		}[]
	});

	// Chat com IA
	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
	const [inputMessage, setInputMessage] = useState("");
	const [isChatSending, setIsChatSending] = useState(false);
	const chatEndRef = useRef<HTMLDivElement>(null);

	// Carregar dados e métricas do ano
	const loadUserData = useCallback(async () => {
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) return;

			const startOfYear = `${filterYear}-01-01`;
			const endOfYear = `${filterYear}-12-31`;

			const [contas, cartoes, dividas, resTx, investimentos, devedores] = await Promise.all([
				financeService.getContasBancarias(user.id).catch(() => []),
				financeService.getCartoes(user.id).catch(() => []),
				financeService.getDividas(user.id).catch(() => []),
				supabase.from("transacoes").select("*, categorias(nome), cartoes(nome)").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear).catch(() => ({ data: [] })),
				financeService.getInvestimentos(user.id).catch(() => []),
				financeService.getDevedores(user.id).catch(() => [])
			]);

			const transacoes = ((resTx as any)?.data || []) as any[];

			const totalReceitas = transacoes.filter(t => t.tipo === "RECEITA").reduce((acc, cur) => acc + Number(cur.valor || 0), 0);
			const totalDespesas = transacoes.filter(t => t.tipo === "DESPESA").reduce((acc, cur) => acc + Number(cur.valor || 0), 0);
			const totalEstornos = transacoes.filter(t => t.tipo === "ESTORNO").reduce((acc, cur) => acc + Number(cur.valor || 0), 0);
			const totalGastos = Math.max(0, totalDespesas - totalEstornos);
			const saldoContas = (contas || []).reduce((acc: number, c: any) => acc + Number(c.saldo_atual || 0), 0);
			const totalInvestimentos = (investimentos || []).reduce((acc: number, i: any) => acc + Number(i.valor_investido || 0), 0);

			const dividasAtivas = (dividas || []).filter((d: any) => d.status !== "quitada");
			const dividasAtivasDetalhes = dividasAtivas.map((d: any) => {
				const parcelas = d.parcelas_divida || [];
				const pendentes = parcelas.filter((p: any) => p.status === "pendente");
				const pagas = parcelas.filter((p: any) => p.status === "paga");
				const valorRestante = pendentes.length > 0
					? pendentes.reduce((acc: number, p: any) => acc + Number(p.valor_esperado || 0), 0)
					: Number(d.valor_atual || d.valor_original || 0);
				return {
					id: d.id,
					descricao: d.descricao || "Dívida",
					instituicao: d.instituicao || "Banco",
					valorOriginal: Number(d.valor_original || 0),
					valorRestante,
					parcelasPagas: pagas.length,
					totalParcelas: parcelas.length
				};
			});

			const totalDividas = dividasAtivasDetalhes.reduce((acc, d) => acc + d.valorRestante, 0);
			const devedoresTotal = (devedores || []).reduce((acc: number, dev: any) => acc + Number(dev.total_devido || 0), 0);

			const catMap: { [key: string]: number } = {};
			transacoes.filter(t => t.tipo === "DESPESA").forEach(t => {
				const cName = t.categorias?.nome || t.categoria || "Outros";
				catMap[cName] = (catMap[cName] || 0) + Number(t.valor || 0);
			});
			const topCategories = Object.entries(catMap)
				.map(([nome, valor]) => ({ nome, valor }))
				.sort((a, b) => b.valor - a.valor)
				.slice(0, 4);

			setMetrics({
				totalReceitas,
				totalGastos,
				saldoContas,
				totalInvestimentos,
				totalDividas,
				devedoresTotal,
				topCategories,
				cartoesResumo: cartoes || [],
				dividasAtivasDetalhes
			});
		} catch (error) {
			console.error("Erro ao carregar dados do usuário:", error);
		}
	}, [filterYear]);

	useEffect(() => {
		loadUserData();
		const cached = localStorage.getItem(`finance_ai_report_${filterYear}`);
		if (cached) {
			setAiReport(cached);
		} else {
			setAiReport("");
		}

		// Carregar chat do cache se houver
		const cachedChat = localStorage.getItem(`finance_ai_chat_${filterYear}`);
		if (cachedChat) {
			try {
				setChatMessages(JSON.parse(cachedChat));
			} catch (e) {
				setChatMessages([]);
			}
		} else {
			setChatMessages([
				{
					id: "welcome",
					sender: "ai",
					text: `Olá! Sou seu Consultor Financeiro Inteligente. Analisei suas finanças de ${filterYear}. Você pode ler o relatório completo acima ou me fazer perguntas diretamente aqui embaixo!`,
					timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
				}
			]);
		}
	}, [filterYear, loadUserData]);

	useEffect(() => {
		let intervalId: any;
		if (loadingAI) {
			setLoadingStepIndex(0);
			intervalId = setInterval(() => {
				setLoadingStepIndex(prev => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
			}, 1800);
		}
		return () => {
			if (intervalId) clearInterval(intervalId);
		};
	}, [loadingAI]);

	useEffect(() => {
		chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [chatMessages]);

	// Score Financeiro (0 a 100)
	const scoreInfo = (() => {
		let score = 50;
		const { totalReceitas, totalGastos, totalDividas, saldoContas, totalInvestimentos } = metrics;
		
		if (totalReceitas > 0) {
			const taxaPoupanca = ((totalReceitas - totalGastos) / totalReceitas) * 100;
			if (taxaPoupanca > 20) score += 20;
			else if (taxaPoupanca > 0) score += 10;
			else score -= 20;
		}

		if (totalDividas === 0) {
			score += 15;
		} else if (totalReceitas > 0 && totalDividas < totalReceitas * 0.3) {
			score += 5;
		} else {
			score -= 15;
		}

		if (saldoContas + totalInvestimentos > (totalGastos / 12) * 3) {
			score += 15; // Reserva de 3 meses
		}

		score = Math.max(15, Math.min(98, score));

		if (score >= 80) {
			return {
				score,
				label: "Excelente & Saudável",
				badgeClass: "text-emerald-700 bg-emerald-100 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
				barColor: "bg-emerald-500",
				icon: "🏆",
				desc: "Suas finanças estão com excelente margem e boa estrutura de patrimônio."
			};
		}
		if (score >= 60) {
			return {
				score,
				label: "Equilibrado",
				badgeClass: "text-indigo-700 bg-indigo-100 border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800",
				barColor: "bg-indigo-500",
				icon: "✨",
				desc: "Contas em dia, com oportunidade de aumentar a taxa de poupança."
			};
		}
		if (score >= 40) {
			return {
				score,
				label: "Requer Atenção",
				badgeClass: "text-amber-700 bg-amber-100 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
				barColor: "bg-amber-500",
				icon: "⚠️",
				desc: "Gastos próximos ou acima das receitas. Foco em reduzir despesas e amortizar dívidas."
			};
		}
		return {
			score,
			label: "Crítico / Em Alerta",
			badgeClass: "text-rose-700 bg-rose-100 border-rose-300 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800",
			barColor: "bg-rose-500",
			icon: "🚨",
			desc: "Dívidas elevadas ou déficit financeiro. Prioridade máxima em corte de gastos."
		};
	})();

	// Gerar Diagnóstico com IA
	const generateAIInsights = async () => {
		setLoadingAI(true);
		try {
			const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
			const { totalReceitas, totalGastos, saldoContas, totalInvestimentos, totalDividas, topCategories, devedoresTotal, dividasAtivasDetalhes } = metrics;

			const dividasContexto = dividasAtivasDetalhes && dividasAtivasDetalhes.length > 0
				? dividasAtivasDetalhes.map(d => `${d.descricao} (${d.instituicao}): falta pagar R$ ${d.valorRestante.toFixed(2)} de R$ ${d.valorOriginal.toFixed(2)} (${d.parcelasPagas}/${d.totalParcelas} parcelas pagas)`).join("; ")
				: "Nenhuma dívida ativa registrada";

			if (!apiKey) {
				// Fallback inteligente algorítmico caso a API Key não esteja configurada
				const saldoAno = totalReceitas - totalGastos;
				const taxaPoupanca = totalReceitas > 0 ? Math.round((saldoAno / totalReceitas) * 100) : 0;
				const maiorCat = topCategories[0]?.nome || "Despesas Gerais";
				const fallbackReport = `**Resumo Geral da Situação Atual:**
No ano de ${filterYear}, você acumulou **${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalReceitas)}** em receitas e **${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalGastos)}** em despesas, resultando em um saldo líquido de **${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoAno)}** (taxa de poupança de **${taxaPoupanca}%**). Suas reservas em contas somam **${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoContas)}** e os investimentos totalizam **${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalInvestimentos)}**. O saldo devedor ativo em aberto está em **${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalDividas)}** (${dividasContexto}).

**Dicas e Recomendações:**
• 💡 **Otimizar Gastos em ${maiorCat}:** Esta é sua categoria com maior volume financeiro (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(topCategories[0]?.valor || 0)}). Definir um teto mensal reduzirá a pressão sobre o orçamento.
• 🎯 **Amortização e Gestão de Dívidas:** ${totalDividas > 0 ? `Com R$ ${totalDividas.toLocaleString('pt-BR')} restantes em pendências ativas (${dividasContexto}), priorize a quitação das parcelas mais onerosas para estancar juros.` : "Você não possui dívidas ativas pendentes, mantenha o foco em poupar e investir!"}
• 📈 **Construção de Reserva:** Direcione pelo menos 15% das entradas mensais para investimentos líquidos antes de realizar compras discricionárias.`;

				setAiReport(fallbackReport);
				localStorage.setItem(`finance_ai_report_${filterYear}`, fallbackReport);
				toast.success("Diagnóstico gerado com sucesso!");
				setLoadingAI(false);
				return;
			}

			const genAI = new GoogleGenerativeAI(apiKey);

			const prompt = `Você é um Consultor Financeiro Pessoal experiente e empático.
Analise os seguintes dados financeiros reais do usuário para o ano ${filterYear}:
- Saldo Atual Disponível em Contas: R$ ${saldoContas.toFixed(2)}
- Entradas Totais no Ano: R$ ${totalReceitas.toFixed(2)}
- Despesas Totais no Ano: R$ ${totalGastos.toFixed(2)}
- Saldo Líquido do Ano: R$ ${(totalReceitas - totalGastos).toFixed(2)}
- Total Investido: R$ ${totalInvestimentos.toFixed(2)}
- Total em Dívidas Ativas (Saldo devedor restante): R$ ${totalDividas.toFixed(2)}
- Detalhes de Dívidas e Empréstimos Ativos: ${dividasContexto}
- Valores a Receber (Devedores): R$ ${devedoresTotal.toFixed(2)}
- Maiores Categorias de Despesa: ${JSON.stringify(topCategories)}

Elabore um relatório consultivo completo, objetivo e altamente prático em Português do Brasil com esta exata estrutura:

1. Resumo Geral da Situação Atual:
Faça um diagnóstico direto e sincero sobre receitas vs despesas, saúde do fluxo de caixa, dívidas e segurança financeira.

2. Dicas e Recomendações:
Forneça pelo menos 3 a 4 recomendações práticas priorizadas (com emojis como 🎯, 💡, 📈, ⚠️) abrangendo:
- Amortização de dívidas e cartões (se houver dívidas ativas, cite os contratos como ${dividasContexto});
- Otimização da categoria com maior gasto;
- Formação de reserva de emergência e investimentos.

Escreva o texto com títulos em negrito (**Título**) e bullets com emojis claros. Sem blocos de código.`;

			const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-pro", "gemini-2.5-flash-lite"];
			let resultText = "";

			for (const modelName of modelsToTry) {
				try {
					const model = genAI.getGenerativeModel({ model: modelName });
					const res = await model.generateContent(prompt);
					resultText = res.response.text().trim();
					if (resultText) break;
				} catch (err: any) {
					console.warn(`Tentativa com ${modelName} falhou:`, err.message);
				}
			}

			if (!resultText) {
				throw new Error("Não foi possível gerar a análise com os modelos de IA disponíveis.");
			}

			setAiReport(resultText);
			localStorage.setItem(`finance_ai_report_${filterYear}`, resultText);
			toast.success("Diagnóstico concluído!");
		} catch (error: any) {
			console.error("Erro na análise:", error);
			toast.error(error.message || "Erro ao consultar a IA.");
		} finally {
			setLoadingAI(false);
		}
	};

	// Enviar mensagem no Chat Interativo
	const handleSendChatMessage = async (textToSend?: string) => {
		const msgText = (textToSend || inputMessage).trim();
		if (!msgText || isChatSending) return;

		const userMsg: ChatMessage = {
			id: `user-${Date.now()}`,
			sender: "user",
			text: msgText,
			timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
		};

		const updatedChat = [...chatMessages, userMsg];
		setChatMessages(updatedChat);
		setInputMessage("");
		setIsChatSending(true);

		try {
			const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
			const { totalReceitas, totalGastos, saldoContas, totalInvestimentos, totalDividas, topCategories, dividasAtivasDetalhes } = metrics;

			const dividasContexto = dividasAtivasDetalhes && dividasAtivasDetalhes.length > 0
				? dividasAtivasDetalhes.map(d => `${d.descricao} (${d.instituicao}): falta pagar R$ ${d.valorRestante.toFixed(2)} de R$ ${d.valorOriginal.toFixed(2)} (${d.parcelasPagas}/${d.totalParcelas} parcelas pagas)`).join("; ")
				: "Nenhuma dívida ativa registrada (R$ 0,00)";

			let aiResponse = "";

			if (apiKey) {
				const genAI = new GoogleGenerativeAI(apiKey);
				const chatPrompt = `Você é um Consultor Financeiro Pessoal Inteligente e Assistente operacional do sistema.
O usuário está no ano ${filterYear} e possui o seguinte contexto financeiro:
- Saldo em contas: R$ ${saldoContas.toFixed(2)}
- Receitas no ano: R$ ${totalReceitas.toFixed(2)}
- Despesas no ano: R$ ${totalGastos.toFixed(2)}
- Saldo líquido no ano: R$ ${(totalReceitas - totalGastos).toFixed(2)}
- Saldo devedor restante em dívidas ativas: R$ ${totalDividas.toFixed(2)}
- Contratos de dívidas e empréstimos ativos: ${dividasContexto}
- Investimentos: R$ ${totalInvestimentos.toFixed(2)}
- Maiores categorias de gastos: ${topCategories.map(c => `${c.nome}: R$ ${c.valor.toFixed(2)}`).join(", ")}

Mensagem do usuário: "${msgText}"

HABILIDADE OPERACIONAL DE COMANDOS:
1. Se o usuário solicitar criar, cadastrar ou adicionar contas bancárias e/ou cartões de crédito (ex: "Crie essas contas para mim:", "Cadastre o cartão X", "Adicione a conta Y"), você deve:
- Responder confirmando amigavelmente os itens que estão sendo cadastrados com seus respectivos detalhes (limite, datas de fechamento e vencimento).
- Incluir OBRIGATORIAMENTE no FINAL absoluto da sua resposta a tag de ação estruturada em JSON:
<<<ACTION_JSON
{
  "contas": [
    { "nome": "Santander", "tipo": "Conta Corrente", "saldo_inicial": 0, "cor_hex": "#EC0000", "instituicao": "Santander" }
  ],
  "cartoes": [
    { "nome": "Cartão Santander", "limite": 100, "fechamento_dia": 6, "vencimento_dia": 10, "cor_hex": "#EC0000", "conta_nome": "Santander" }
  ]
}
ACTION_JSON>>>

2. Se o usuário informar que já quitou, pagou ou quer dar baixa em uma dívida ou empréstimo (ex: "já quitei esse empréstimo da nubank", "quitei a dívida do santander", "quite o empréstimo nubank", "já quitei esse empretimo"):
- Você deve parabenizar calorosamente o usuário por quitar essa pendência financeira e informar que já está dando baixa e marcando a dívida como quitada no sistema.
- Incluir OBRIGATORIAMENTE no FINAL absoluto da sua resposta a tag de ação estruturada em JSON:
<<<ACTION_JSON
{
  "quitar_divida": {
    "termo": "nubank" // identifique a dívida que ele mencionou (ex: nubank, santander ou o nome da dívida)
  }
}
ACTION_JSON>>>

Cores recomendadas por banco:
- Santander: #EC0000
- Nubank: #8A05BE
- Inter: #FF7A00
- Wise: #00B9FF
- Itaú: #EC7000
- Bradesco: #CC092F
- Banco do Brasil: #FCFD01
- C6: #242424

Se não for um comando de criação ou quitação, responda normalmente como consultor financeiro com base nos dados reais acima.`;

				const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-pro", "gemini-2.5-flash-lite"];
				for (const modelName of modelsToTry) {
					try {
						const model = genAI.getGenerativeModel({ model: modelName });
						const res = await model.generateContent(chatPrompt);
						aiResponse = res.response.text().trim();
						if (aiResponse) break;
					} catch (e) {
						// continue to next model
					}
				}
			}

			if (!aiResponse) {
				// Resposta simulada inteligente caso offline
				aiResponse = `Analisando sua pergunta: com receitas de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalReceitas)} e despesas de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalGastos)}, a prioridade número 1 é garantir que as pendências de dívidas (${totalDividas > 0 ? `saldo restante de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalDividas)}: ${dividasContexto}` : 'nenhuma pendência ativa'}) e a maior categoria de consumo (${topCategories[0]?.nome || 'Gastos'}) tenham limites bem definidos neste mês.`;
			}

			// Processa Ações Automáticas se detectadas na resposta da IA
			const actionMatch = aiResponse.match(/<<<ACTION_JSON([\s\S]*?)ACTION_JSON>>>/);
			if (actionMatch) {
				try {
					const actionData = JSON.parse(actionMatch[1].trim());
					const { data: { user } } = await supabase.auth.getUser();

					if (user) {
						const createdContasMap: { [nome: string]: string } = {};

						// Quitar Dívida
						if (actionData.quitar_divida) {
							const termo = (actionData.quitar_divida.termo || actionData.quitar_divida.descricao || actionData.quitar_divida.nome || actionData.quitar_divida).toString().toLowerCase();
							const todasDividas = await financeService.getDividas(user.id);
							const alvo = (todasDividas || []).find((d: any) => 
								d.status !== 'quitada' && (
									(d.instituicao && d.instituicao.toLowerCase().includes(termo)) ||
									(d.descricao && d.descricao.toLowerCase().includes(termo))
								)
							);
							if (alvo) {
								await financeService.quitarDividaManual(alvo.id, true);
								toast.success(`Dívida "${alvo.descricao}" marcada como quitada com sucesso! 🎉`);
								await loadUserData();
							}
						}

						// Cria Contas
						if (actionData.contas && Array.isArray(actionData.contas)) {
							for (const c of actionData.contas) {
								const { data: existing } = await supabase
									.from("contas_bancarias")
									.select("id")
									.eq("usuario_id", user.id)
									.ilike("nome", c.nome)
									.maybeSingle();

								if (existing) {
									createdContasMap[c.nome.toLowerCase()] = existing.id;
								} else {
									const { data: inserted } = await supabase
										.from("contas_bancarias")
										.insert([{
											usuario_id: user.id,
											nome: c.nome,
											tipo: c.tipo || "Conta Corrente",
											saldo_inicial: Number(c.saldo_inicial || 0),
											cor_hex: c.cor_hex || "#111827",
											instituicao: c.instituicao || c.nome
										}])
										.select()
										.single();
									if (inserted) {
										createdContasMap[c.nome.toLowerCase()] = inserted.id;
									}
								}
							}
						}

						// Cria Cartões
						if (actionData.cartoes && Array.isArray(actionData.cartoes)) {
							for (const card of actionData.cartoes) {
								const contaId = card.conta_nome 
									? (createdContasMap[card.conta_nome.toLowerCase()] || null)
									: null;

								const { data: existingCard } = await supabase
									.from("cartoes")
									.select("id")
									.eq("usuario_id", user.id)
									.ilike("nome", card.nome)
									.maybeSingle();

								if (existingCard) {
									await supabase
										.from("cartoes")
										.update({
											limite: Number(card.limite || 0),
											fechamento_dia: Number(card.fechamento_dia || 1),
											vencimento_dia: Number(card.vencimento_dia || 10),
											cor_hex: card.cor_hex || "#ec4899",
											conta_id: contaId
										})
										.eq("id", existingCard.id);
								} else {
									await supabase
										.from("cartoes")
										.insert([{
											usuario_id: user.id,
											nome: card.nome,
											limite: Number(card.limite || 0),
											fechamento_dia: Number(card.fechamento_dia || 1),
											vencimento_dia: Number(card.vencimento_dia || 10),
											cor_hex: card.cor_hex || "#ec4899",
											conta_id: contaId
										}]);
								}
							}
						}

						if (actionData.contas || actionData.cartoes) {
							toast.success("Contas e cartões processados e salvos com sucesso!");
						}
						await loadUserData();
					}
				} catch (actionErr) {
					console.error("Erro ao executar ação da IA:", actionErr);
				}

				// Limpa a tag da exibição do chat
				aiResponse = aiResponse.replace(/<<<ACTION_JSON[\s\S]*?ACTION_JSON>>>/, "").trim();
			}

			const aiMsg: ChatMessage = {
				id: `ai-${Date.now()}`,
				sender: "ai",
				text: aiResponse,
				timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
			};

			const finalChat = [...updatedChat, aiMsg];
			setChatMessages(finalChat);
			localStorage.setItem(`finance_ai_chat_${filterYear}`, JSON.stringify(finalChat));
		} catch (error) {
			console.error("Erro no chat:", error);
			toast.error("Erro ao enviar mensagem para o consultor.");
		} finally {
			setIsChatSending(false);
		}
	};

	const handleCopyReport = () => {
		if (!aiReport) return;
		navigator.clipboard.writeText(aiReport);
		setCopySuccess(true);
		toast.success("Relatório copiado para a área de transferência!");
		setTimeout(() => setCopySuccess(false), 3000);
	};

	const parsed = parseAIReport(aiReport);

	return (
		<div className="space-y-6 sm:space-y-8 pb-20 animate-in fade-in duration-500 max-w-6xl mx-auto">
			
			{/* SECTION 1: HEADER & ACTIONS */}
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
				<div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-pink-500/10 rounded-full blur-3xl pointer-events-none -z-10" />
				
				<div className="space-y-2">
					<div className="flex items-center gap-3">
						<div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-pink-600 flex items-center justify-center text-white shadow-md shadow-indigo-200 dark:shadow-none shrink-0">
							<Brain size={24} className="animate-pulse" />
						</div>
						<div>
							<div className="flex items-center gap-2">
								<h1 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100">
									Consultor Inteligente
								</h1>
								<span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
									<Sparkles size={11} className="text-pink-500" />
									Gemini AI
								</span>
							</div>
							<p className="text-slate-500 dark:text-slate-400 font-medium text-xs sm:text-sm mt-0.5">
								Diagnóstico holístico, recomendações práticas e consultor interativo para suas finanças.
							</p>
						</div>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-3 self-start lg:self-center">
					{/* SELETOR DE ANO */}
					<div className="flex items-center bg-slate-50 dark:bg-slate-800 rounded-2xl p-1 border border-slate-200 dark:border-slate-700">
						<button
							onClick={() => setFilterYear(filterYear - 1)}
							className="p-2 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-xl transition-all text-slate-600 dark:text-slate-400 cursor-pointer"
							title="Ano Anterior"
						>
							<ChevronLeft size={18} />
						</button>
						<span className="px-3 font-black text-sm text-slate-800 dark:text-white select-none">
							{filterYear}
						</span>
						<button
							onClick={() => setFilterYear(filterYear + 1)}
							className="p-2 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-xl transition-all text-slate-600 dark:text-slate-400 cursor-pointer"
							title="Próximo Ano"
						>
							<ChevronRight size={18} />
						</button>
					</div>

					{aiReport && (
						<button
							onClick={handleCopyReport}
							className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 rounded-2xl font-bold text-xs uppercase transition-all shadow-sm cursor-pointer"
						>
							{copySuccess ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
							<span>{copySuccess ? "Copiado!" : "Copiar"}</span>
						</button>
					)}

					<button
						onClick={generateAIInsights}
						disabled={loadingAI}
						className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white rounded-2xl font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-indigo-200 dark:shadow-none cursor-pointer disabled:opacity-50 active:scale-95"
					>
						{loadingAI ? (
							<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
						) : (
							<RefreshCw size={16} />
						)}
						<span>{loadingAI ? "Analisando..." : "Nova Análise"}</span>
					</button>
				</div>
			</div>

			{/* SECTION 2: KPIS & SAÚDE FINANCEIRA */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
				
				{/* SCORE DE SAÚDE FINANCEIRA */}
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
					<div>
						<div className="flex items-center justify-between mb-2">
							<span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Saúde Financeira</span>
							<span className="text-xl">{scoreInfo.icon}</span>
						</div>
						<div className="flex items-baseline gap-2">
							<span className="text-3xl sm:text-4xl font-black text-slate-800 dark:text-slate-100">
								{scoreInfo.score}
							</span>
							<span className="text-xs font-bold text-slate-400">/ 100</span>
						</div>
						<span className={`inline-block text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border mt-2 ${scoreInfo.badgeClass}`}>
							{scoreInfo.label}
						</span>
					</div>
					<div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mt-4">
						<div className={`h-full rounded-full transition-all duration-700 ${scoreInfo.barColor}`} style={{ width: `${scoreInfo.score}%` }} />
					</div>
				</div>

				{/* SALDO LÍQUIDO NO ANO */}
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
					<div>
						<div className="flex items-center justify-between mb-2">
							<span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Saldo Líquido ({filterYear})</span>
							<div className={`p-2 rounded-xl ${metrics.totalReceitas >= metrics.totalGastos ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'}`}>
								{metrics.totalReceitas >= metrics.totalGastos ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
							</div>
						</div>
						<h3 className={`text-2xl sm:text-3xl font-black ${metrics.totalReceitas >= metrics.totalGastos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
							{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(metrics.totalReceitas - metrics.totalGastos)}
						</h3>
					</div>
					<div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 font-semibold mt-3">
						<span>Taxa de Poupança</span>
						<span className="font-black text-slate-700 dark:text-slate-200">
							{metrics.totalReceitas > 0 ? `${Math.round(((metrics.totalReceitas - metrics.totalGastos) / metrics.totalReceitas) * 100)}%` : "0%"}
						</span>
					</div>
				</div>

				{/* PATRIMÔNIO LÍQUIDO */}
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
					<div>
						<div className="flex items-center justify-between mb-2">
							<span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Patrimônio Líquido</span>
							<div className="p-2 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 rounded-xl">
								<Wallet size={18} />
							</div>
						</div>
						<h3 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100">
							{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((metrics.saldoContas + metrics.totalInvestimentos) - metrics.totalDividas)}
						</h3>
					</div>
					<div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 font-semibold mt-3">
						<span>Investido + Contas</span>
						<span className="font-black text-indigo-600 dark:text-indigo-400">
							{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(metrics.saldoContas + metrics.totalInvestimentos)}
						</span>
					</div>
				</div>

				{/* COMPROMETIMENTO COM DÍVIDAS */}
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
					<div>
						<div className="flex items-center justify-between mb-2">
							<span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Dívidas Ativas</span>
							<div className="p-2 bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 rounded-xl">
								<AlertTriangle size={18} />
							</div>
						</div>
						<h3 className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-500">
							{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(metrics.totalDividas)}
						</h3>
					</div>
					<div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 font-semibold mt-3">
						<span>Comprometimento</span>
						<span className="font-black text-slate-700 dark:text-slate-200">
							{metrics.totalReceitas > 0 ? `${Math.round((metrics.totalDividas / metrics.totalReceitas) * 100)}% da renda` : "—"}
						</span>
					</div>
				</div>

			</div>

			{/* SECTION 3: RELATÓRIO DO CONSULTOR IA */}
			<div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
				
				<div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
					<div className="flex items-center gap-2.5">
						<Lightbulb className="text-indigo-600 dark:text-indigo-400" size={22} />
						<h2 className="text-xl font-black text-slate-800 dark:text-slate-100">
							Diagnóstico Estratégico do Consultor
						</h2>
					</div>
					<span className="text-xs text-slate-400 font-bold">
						{aiReport ? `Consolidação ${filterYear}` : "Aguardando Análise"}
					</span>
				</div>

				{loadingAI ? (
					<div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
						<div className="relative flex items-center justify-center w-20 h-20 bg-gradient-to-tr from-indigo-500 to-pink-500 rounded-full animate-spin p-[3px]">
							<div className="w-full h-full bg-white dark:bg-slate-900 rounded-full flex items-center justify-center">
								<Brain className="text-indigo-600 dark:text-indigo-400 animate-pulse" size={32} />
							</div>
						</div>
						<h3 className="text-lg font-black text-slate-800 dark:text-slate-100">
							Análise Inteligente em Andamento
						</h3>
						<p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 max-w-md animate-pulse">
							{LOADING_STEPS[loadingStepIndex]}
						</p>
					</div>
				) : aiReport ? (
					<div className="space-y-6">
						{/* RESUMO GERAL */}
						<div className="p-6 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/70 dark:border-slate-800 relative">
							<span className="absolute -top-3 left-6 px-3 py-0.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider rounded-full shadow-sm">
								Visão Geral
							</span>
							<p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed font-medium whitespace-pre-line pt-1">
								{renderFormattedText(parsed.summary)}
							</p>
						</div>

						{/* RECOMENDAÇÕES */}
						{parsed.recommendations.length > 0 && (
							<div className="space-y-4">
								<h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
									Plano de Ação e Recomendações
								</h3>
								<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
									{parsed.recommendations.map((rec, idx) => {
										const isHigh = rec.prioridade === "alta";
										const isMed = rec.prioridade === "media";
										return (
											<motion.div
												key={idx}
												whileHover={{ y: -4 }}
												className={`p-5 rounded-2xl border flex flex-col justify-between space-y-3 transition-all ${
													isHigh
														? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40"
														: isMed
														? "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40"
														: "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800"
												}`}
											>
												<div className="space-y-2">
													<div className="flex items-center justify-between">
														<span className="text-2xl">{rec.icon}</span>
														<span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
															isHigh
																? "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300"
																: isMed
																? "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"
																: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300"
														}`}>
															{isHigh ? "Prioridade Alta" : isMed ? "Otimização" : "Estratégia"}
														</span>
													</div>
													<h4 className="font-black text-slate-800 dark:text-slate-100 text-sm">
														{rec.title}
													</h4>
													<p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
														{renderFormattedText(rec.description)}
													</p>
												</div>
											</motion.div>
										);
									})}
								</div>
							</div>
						)}
					</div>
				) : (
					<div className="py-12 text-center space-y-3">
						<div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
							<Sparkles size={32} />
						</div>
						<h3 className="text-lg font-black text-slate-800 dark:text-slate-100">
							Nenhum Diagnóstico Ativo para {filterYear}
						</h3>
						<p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto font-medium">
							Clique em **"Nova Análise"** no canto superior direito para o Gemini AI consolidar todas as suas movimentações e gerar seu relatório completo.
						</p>
					</div>
				)}

			</div>

			{/* SECTION 4: CHAT INTERATIVO COM O CONSULTOR IA */}
			<div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
				<div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-pink-100 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 flex items-center justify-center">
							<MessageSquare size={20} />
						</div>
						<div>
							<h3 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
								Pergunte ao Consultor
							</h3>
							<p className="text-xs text-slate-400 font-medium">
								Tire dúvidas pontuais sobre seus cartões, metas, cortes de gastos e dívidas.
							</p>
						</div>
					</div>
				</div>

				{/* PERGUNTAS SUGERIDAS (1 CLIQUE) */}
				<div className="flex flex-wrap gap-2">
					{PROMPTS_SUGERIDOS.map((sug, i) => (
						<button
							key={i}
							onClick={() => handleSendChatMessage(sug)}
							disabled={isChatSending}
							className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
						>
							<span>{sug}</span>
							<ArrowUpRight size={13} className="text-slate-400" />
						</button>
					))}
				</div>

				{/* ÁREA DE CONVERSA */}
				<div className="space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar p-2 rounded-2xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800">
					{chatMessages.map((msg) => {
						const isAI = msg.sender === "ai";
						return (
							<div
								key={msg.id}
								className={`flex gap-3 ${isAI ? 'justify-start' : 'justify-end'}`}
							>
								{isAI && (
									<div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-pink-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-1">
										<Bot size={16} />
									</div>
								)}
								<div className={`max-w-xl p-4 rounded-2xl text-xs sm:text-sm font-medium leading-relaxed ${
									isAI
										? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/70 dark:border-slate-700 shadow-sm whitespace-pre-line'
										: 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none'
								}`}>
									{isAI ? renderFormattedText(msg.text) : msg.text}
									<span className={`block text-[9px] mt-1 font-bold ${isAI ? 'text-slate-400' : 'text-indigo-200 text-right'}`}>
										{msg.timestamp}
									</span>
								</div>
								{!isAI && (
									<div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 mt-1">
										<UserIcon size={16} />
									</div>
								)}
							</div>
						);
					})}
					{isChatSending && (
						<div className="flex items-center gap-3">
							<div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-pink-600 text-white flex items-center justify-center shrink-0 shadow-sm">
								<Bot size={16} />
							</div>
							<div className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs text-slate-500 font-bold flex items-center gap-2 shadow-sm">
								<div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-indigo-600" />
								<span>Consultor está analisando seus números...</span>
							</div>
						</div>
					)}
					<div ref={chatEndRef} />
				</div>

				{/* INPUT DO CHAT */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						handleSendChatMessage();
					}}
					className="flex items-center gap-2 pt-2"
				>
					<input
						type="text"
						value={inputMessage}
						onChange={(e) => setInputMessage(e.target.value)}
						placeholder="Digite sua dúvida sobre seus gastos, faturas ou dívidas..."
						disabled={isChatSending}
						className="flex-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3.5 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
					/>
					<button
						type="submit"
						disabled={!inputMessage.trim() || isChatSending}
						className="p-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl shadow-sm transition-all cursor-pointer shrink-0"
						title="Enviar pergunta"
					>
						<Send size={18} />
					</button>
				</form>

			</div>

		</div>
	);
}
