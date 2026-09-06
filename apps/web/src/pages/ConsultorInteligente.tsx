import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import { GoogleGenerativeAI } from "@google/generative-ai";
import toast from "react-hot-toast";
import { Brain, Sparkles, Copy, Check, RefreshCw, Lightbulb } from "lucide-react";
import { motion } from "framer-motion";

interface Recommendation {
	icon: string;
	title: string;
	description: string;
}

interface ParsedReport {
	summary: string;
	recommendations: Recommendation[];
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

	for (let line of lines) {
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

				result.recommendations.push({
					icon: emoji,
					title: title.replace(/^:\s*/, ""),
					description: description
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

function getHealthStatus(text: string): { label: string; colorClass: string; bgClass: string; icon: string } {
	const lower = (text || "").toLowerCase();
	
	const alertKeywords = ["atraso", "crítica", "perigo", "atenção", "preocupante", "dívida", "deficit", "gargalo", "excedendo", "ultrapassou", "cuidado"];
	const positiveKeywords = ["excelente", "saudável", "parabéns", "estável", "equilibrado", "superávit", "positivo", "economizando", "ótimo"];
	
	let alertCount = 0;
	let positiveCount = 0;
	
	alertKeywords.forEach(k => {
		const matches = lower.match(new RegExp(k, "g"));
		if (matches) alertCount += matches.length;
	});
	
	positiveKeywords.forEach(k => {
		const matches = lower.match(new RegExp(k, "g"));
		if (matches) positiveCount += matches.length;
	});
	
	if (alertCount > positiveCount + 1) {
		return {
			label: "Requer Atenção",
			colorClass: "text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-900/30",
			bgClass: "bg-amber-500/10 dark:bg-amber-500/5",
			icon: "⚠️"
		};
	} else if (positiveCount > alertCount + 1) {
		return {
			label: "Saúde Estável / Excelente",
			colorClass: "text-emerald-600 dark:text-emerald-450 border-emerald-250 dark:border-emerald-900/30",
			bgClass: "bg-emerald-500/10 dark:bg-emerald-500/5",
			icon: "✨"
		};
	}
	
	return {
		label: "Diagnóstico Concluído",
		colorClass: "text-indigo-600 dark:text-indigo-400 border-indigo-200/50 dark:border-indigo-900/30",
		bgClass: "bg-indigo-500/10 dark:bg-indigo-500/5",
		icon: "📊"
	};
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
	"Coletando saldos e movimentações consolidadas...",
	"Analisando distribuição de gastos por categoria...",
	"Verificando pendências financeiras e faturas...",
	"Calculando saldo devedor e contas a receber...",
	"Gemini AI estruturando seu relatório consultivo...",
	"Finalizando recomendações personalizadas..."
];

export default function ConsultorInteligente() {
	const hoje = new Date();
	const [filterYear, setFilterYear] = useState(hoje.getFullYear());
	const [aiReport, setAiReport] = useState<string>("");
	const [loadingAI, setLoadingAI] = useState(false);
	const [loadingStepIndex, setLoadingStepIndex] = useState(0);
	const [copySuccess, setCopySuccess] = useState(false);

	useEffect(() => {
		const cached = localStorage.getItem(`finance_ai_report_${filterYear}`);
		if (cached) {
			setAiReport(cached);
		} else {
			setAiReport("");
		}
	}, [filterYear]);

	useEffect(() => {
		let intervalId: any;
		if (loadingAI) {
			setLoadingStepIndex(0);
			intervalId = setInterval(() => {
				setLoadingStepIndex(prev => (prev < 5 ? prev + 1 : prev));
			}, 1800);
		}
		return () => {
			if (intervalId) clearInterval(intervalId);
		};
	}, [loadingAI]);

	const generateAIInsights = async () => {
		setLoadingAI(true);
		try {
			const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
			if (!apiKey) {
				toast.error("Chave da API do Gemini não configurada!");
				setLoadingAI(false);
				return;
			}

			const { data: { user } } = await supabase.auth.getUser();
			if (!user) return;

			const startOfYear = `${filterYear}-01-01`;
			const endOfYear = `${filterYear}-12-31`;

			const [
				saldoAtual,
				resEntradas,
				resGastos,
				resFaturas,
				resDiv,
				resDevedores,
				resCartoes
			] = await Promise.all([
				financeService.getGlobalBalance(user.id),
				supabase.from("receitas").select("*").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear),
				supabase.from("despesas").select("*").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear),
				supabase.from("pagamentos_faturas").select("*").eq("usuario_id", user.id).gte("data", startOfYear).lte("data", endOfYear),
				supabase.from("passivos").select("*").eq("usuario_id", user.id).gte("vencimento_parcela", startOfYear).lte("vencimento_parcela", endOfYear),
				financeService.getDevedores(user.id),
				financeService.getCartoes(user.id)
			]);

			const rawEntradas = resEntradas.data || [];
			const rawGastos = resGastos.data || [];
			const rawFaturas = resFaturas.data || [];
			const rawDividas = resDiv.data || [];
			const devedores = resDevedores || [];
			const cartoesData = resCartoes || [];

			let faturasPendentesData: any[] = [];
			if (cartoesData.length > 0) {
				const lastMonths: string[] = [];
				const d = new Date();
				for (let i = 0; i < 3; i++) {
					const year = d.getFullYear();
					const month = d.getMonth() + 1;
					lastMonths.push(`${year}-${String(month).padStart(2, '0')}`);
					d.setMonth(d.getMonth() - 1);
				}

				const faturasPromises: Promise<any>[] = [];
				cartoesData.forEach((c: any) => {
					lastMonths.forEach((m) => {
						faturasPromises.push(
							financeService.getFaturaMensal(user.id, c.id, m)
								.then(res => ({ ...res, mesReferencia: m }))
								.catch(() => null)
						);
					});
				});

				const faturasResult = await Promise.all(faturasPromises);
				faturasPendentesData = faturasResult.filter((f: any) => f && f.totalFatura > 0 && f.pendente > 0.01);
			}

			const categoriasGastos: { [key: string]: number } = {};
			rawGastos.forEach(g => {
				const cat = g.categoria || "Outros";
				categoriasGastos[cat] = (categoriasGastos[cat] || 0) + Number(g.valor);
			});

			const topCategories = Object.entries(categoriasGastos)
				.map(([nome, valor]) => ({ nome, valor }))
				.sort((a, b) => b.valor - a.valor)
				.slice(0, 3);

			const genAI = new GoogleGenerativeAI(apiKey);

			const prompt = `Você é um consultor financeiro pessoal especialista em finanças pessoais e investimentos.
Analise os seguintes dados financeiros do usuário para o ano ${filterYear}:
- Saldo Global Consolidado Atual: R$ ${saldoAtual}
- Entradas Totais do Ano: R$ ${rawEntradas.reduce((acc, cur) => acc + Number(cur.valor), 0)}
- Despesas Totais do Ano (incluindo faturas pagas): R$ ${rawGastos.reduce((acc, cur) => acc + Number(cur.valor), 0) + rawFaturas.reduce((acc, cur) => acc + Number(cur.valor), 0)}
- Dívidas Ativas: R$ ${rawDividas.reduce((acc, cur) => acc + Number(cur.valor_total), 0)}
- Distribuição de Gastos por Categoria: ${JSON.stringify(topCategories)}
- Faturas Pendentes nos últimos 3 meses: ${faturasPendentesData.length} faturas, somando R$ ${faturasPendentesData.reduce((acc, cur) => acc + Number(cur.pendente), 0)} em aberto
- Devedores ativos (dinheiro que o usuário emprestou e tem a receber): R$ ${devedores.reduce((acc, cur) => acc + Number(cur.total_devido), 0)}

Com base nesses dados completos, elabore um relatório consultivo estruturado em português do Brasil:
1. Resumo Geral da Situação Atual: Faça um diagnóstico sincero e direto sobre a relação entre receitas, gastos e o saldo atual.
2. Dicas e Recomendações: Forneça pelo menos 3 dicas práticas de economia, amortização de dívidas ou direcionamento de investimentos adequados para esse cenário.

Escreva o texto final formatado com títulos em negrito, tópicos claros com emojis e parágrafos curtos. Não use markdown de bloco (como \`\`\`), apenas negritos e quebras de linha para a leitura ficar muito agradável.`;

			const modelsToTry = [
				"gemini-2.5-flash", 
				"gemini-2.0-flash", 
				"gemini-flash-latest",
				"gemini-pro-latest"
			];
			let result;
			let lastError;

			const callModelWithRetry = async (modelName: string, retries = 1, delay = 1500): Promise<any> => {
				const modelInstance = genAI.getGenerativeModel({ model: modelName });
				try {
					return await modelInstance.generateContent(prompt);
				} catch (error: any) {
					const errorMessage = error?.message || "";
					const isTransient = errorMessage.includes("503") || errorMessage.includes("experiencing demand") || errorMessage.includes("429");
					if (retries > 0 && isTransient) {
						await new Promise(resolve => setTimeout(resolve, delay));
						return callModelWithRetry(modelName, retries - 1, delay * 2);
					}
					throw error;
				}
			};

			for (const modelName of modelsToTry) {
				try {
					result = await callModelWithRetry(modelName);
					break;
				} catch (err: any) {
					lastError = err;
				}
			}

			if (!result) {
				const errorMessage = lastError?.message || "";
				if (errorMessage.includes("404")) {
					throw new Error("Sua chave da API do Google não tem acesso aos modelos Gemini (Erro 404). Verifique no Google AI Studio se a chave está correta.");
				}
				throw lastError || new Error("Não foi possível conectar a Inteligência Artificial.");
			}
			const text = result.response.text().trim();
			setAiReport(text);
			localStorage.setItem(`finance_ai_report_${filterYear}`, text);
			toast.success("Análise de IA concluída!");
		} catch (error) {
			console.error("Erro ao gerar insights com IA:", error);
			toast.error("Erro na leitura da IA.");
		} finally {
			setLoadingAI(false);
		}
	};

	const handleCopyReport = () => {
		if (!aiReport) return;
		navigator.clipboard.writeText(aiReport);
		setCopySuccess(true);
		toast.success("Relatório copiado!");
		setTimeout(() => {
			setCopySuccess(false);
		}, 3000);
	};

	const containerVariants = {
		hidden: { opacity: 0 },
		visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
	};

	const itemVariants = {
		hidden: { y: 15, opacity: 0 },
		visible: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 260, damping: 22 } }
	};

	return (
		<motion.div
			className="space-y-6 sm:space-y-8 pb-20 max-w-5xl mx-auto mt-6"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			<motion.div
				variants={itemVariants}
				className="relative overflow-hidden bg-gradient-to-br from-indigo-500/[0.03] via-slate-900/[0.02] to-pink-500/[0.03] dark:from-indigo-950/15 dark:via-slate-900/5 dark:to-pink-950/15 rounded-2xl border border-slate-250/60 dark:border-slate-800/80 shadow-sm p-6 sm:p-8 flex flex-col gap-6 transition-all duration-300"
			>
				<div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none -z-10" />
				<div className="absolute bottom-0 left-0 w-80 h-80 bg-pink-500/10 dark:bg-pink-500/5 rounded-full blur-[100px] pointer-events-none -z-10" />

				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-5">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-650 dark:text-indigo-400 rounded-xl">
								<Brain size={20} className="animate-pulse" />
							</div>
							<span className="text-xs font-black uppercase text-indigo-500 dark:text-indigo-400 tracking-wider">
								Consultor Inteligente
							</span>
						</div>
						<h3 className="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2 mt-1">
							<span>Insights de IA</span>
							<Sparkles className="text-pink-500 animate-pulse" size={18} />
						</h3>
						<p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
							Diagnósticos precisos e recomendações automáticas para otimizar suas finanças
						</p>
					</div>

					<div className="flex items-center gap-2 self-start sm:self-center shrink-0">
						{aiReport && !loadingAI && (
							<button
								onClick={handleCopyReport}
								className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-855 rounded-xl transition-all flex items-center justify-center gap-1.5 font-bold text-xs uppercase cursor-pointer"
								title="Copiar Relatório"
							>
								{copySuccess ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
								<span>{copySuccess ? "Copiado!" : "Copiar"}</span>
							</button>
						)}

						<button
							onClick={generateAIInsights}
							disabled={loadingAI}
							className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 dark:from-indigo-500 dark:to-pink-500 dark:hover:from-indigo-600 dark:hover:to-pink-600 text-white rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 font-black text-xs uppercase shadow-sm cursor-pointer active:scale-95 shrink-0 self-start sm:self-center font-extrabold"
						>
							{loadingAI ? (
								<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
							) : (
								<RefreshCw size={14} />
							)}
							<span>{loadingAI ? "Processando..." : "Nova Análise"}</span>
						</button>
					</div>
				</div>

				<div className="mt-2 min-h-[200px] flex flex-col justify-center">
					{loadingAI ? (
						<div className="w-full space-y-6 animate-pulse">
							<div className="flex flex-col items-center justify-center text-center p-8 bg-white/40 dark:bg-slate-900/40 rounded-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm max-w-lg mx-auto">
								<div className="relative flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-indigo-500 to-pink-500 rounded-full animate-spin p-[3px]">
									<div className="w-full h-full bg-white dark:bg-slate-900 rounded-full flex items-center justify-center">
										<Brain className="text-indigo-500 dark:text-indigo-400 animate-pulse" size={24} />
									</div>
								</div>
								<h4 className="font-extrabold text-slate-800 dark:text-slate-100 mt-5 text-sm">
									Análise em andamento
								</h4>
								<p className="text-xs text-slate-500 dark:text-slate-455 font-bold uppercase tracking-wider mt-2 min-h-[16px] transition-all duration-300">
									{LOADING_STEPS[loadingStepIndex]}
								</p>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-3 gap-5">
								<div className="h-32 bg-slate-200/60 dark:bg-slate-850/40 rounded-2xl"></div>
								<div className="h-32 bg-slate-200/60 dark:bg-slate-850/40 rounded-2xl"></div>
								<div className="h-32 bg-slate-200/60 dark:bg-slate-850/40 rounded-2xl"></div>
							</div>
						</div>
					) : aiReport ? (
						(() => {
							const parsed = parseAIReport(aiReport);
							const status = getHealthStatus(parsed.summary);
							return (
								<div className="space-y-8">
									<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
										<div className="lg:col-span-1 flex flex-col justify-between p-6 bg-gradient-to-br from-white/70 to-white/50 dark:from-slate-900/80 dark:to-slate-900/40 border border-slate-200/60 dark:border-slate-800/80 rounded-xl shadow-sm space-y-4">
											<div className="space-y-3">
												<span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest block">
													Diagnóstico Financeiro
												</span>
												<div className="flex items-center gap-3">
													<div className="text-3xl">{status.icon}</div>
													<div>
														<h4 className="font-black text-slate-800 dark:text-slate-100 text-sm">
															Status Geral
														</h4>
														<span className={`inline-block text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border mt-1 ${status.colorClass} ${status.bgClass}`}>
															{status.label}
														</span>
													</div>
												</div>
											</div>
											<div className="pt-3 border-t border-slate-100 dark:border-slate-800/60 text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
												Este relatório é baseado no saldo consolidado, distribuição de categorias e pagamentos pendentes do ano selecionado.
											</div>
										</div>

										<div className="lg:col-span-2 p-6 sm:p-8 bg-gradient-to-br from-white/70 to-white/50 dark:from-slate-900/80 dark:to-slate-900/40 border border-slate-200/60 dark:border-slate-800/80 rounded-xl shadow-sm flex flex-col justify-center">
											<div className="relative">
												<span className="absolute -top-3 -left-3 text-4xl text-indigo-500/10 font-serif select-none">“</span>
												<p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 font-medium leading-relaxed whitespace-pre-line relative z-10">
													{renderFormattedText(parsed.summary)}
												</p>
											</div>
										</div>
									</div>

									{parsed.recommendations.length > 0 && (
										<div className="space-y-4">
											<div className="flex items-center gap-2">
												<Lightbulb className="text-indigo-550" size={18} />
												<h4 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">
													Recomendações Práticas
												</h4>
											</div>

											<div className="grid grid-cols-1 md:grid-cols-3 gap-5">
												{parsed.recommendations.map((rec, index) => {
													let accentClass = "border-t-indigo-500";
													if (["⚠️", "🛑", "cuidado", "atraso", "perigo"].some(k => rec.icon === k || rec.title.toLowerCase().includes(k))) {
														accentClass = "border-t-rose-500";
													} else if (["💡", "✨", "ideia", "dica"].some(k => rec.icon === k || rec.title.toLowerCase().includes(k))) {
														accentClass = "border-t-amber-500";
													} else if (["📈", "💰", "econom", "invest"].some(k => rec.icon === k || rec.title.toLowerCase().includes(k))) {
														accentClass = "border-t-emerald-500";
													}

													return (
														<motion.div
															key={index}
															whileHover={{ y: -6, scale: 1.01 }}
															className={`p-5 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 border-t-4 ${accentClass} rounded-xl shadow-sm flex flex-col justify-between space-y-3 transition-all duration-200`}
														>
															<div className="space-y-3">
																<div className="flex items-center gap-2">
																	<span className="text-xl shrink-0">{rec.icon}</span>
																	<h5 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm leading-tight">
																		{rec.title}
																	</h5>
																</div>
																<p className="text-xs text-slate-650 dark:text-slate-400 leading-relaxed font-medium">
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
							);
						})()
					) : (
						<div className="p-10 bg-white/40 dark:bg-slate-900/40 rounded-xl border border-slate-200/50 dark:border-slate-800/50 text-center space-y-4 max-w-md mx-auto shadow-sm backdrop-blur-sm relative overflow-hidden">
							<div className="absolute -top-10 -right-10 w-24 h-24 bg-pink-500/10 rounded-full blur-xl"></div>
							<div className="absolute -bottom-10 -left-10 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl"></div>
							
							<div className="text-4xl select-none animate-bounce">✨</div>
							<h4 className="font-extrabold text-slate-800 dark:text-slate-100 text-base">Nenhum Diagnóstico Ativo</h4>
							<p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
								O consultor financeiro de Inteligência Artificial ainda não analisou o seu ano de {filterYear}. Clique no botão **Nova Análise** acima para gerar um relatório completo de saúde financeira.
							</p>
						</div>
					)}
				</div>

				<div className="pt-4 border-t border-slate-150/40 dark:border-slate-800/40 text-center flex flex-col sm:flex-row justify-between items-center gap-2">
					<span className="text-[9px] text-slate-450 dark:text-slate-500 font-bold uppercase tracking-widest">
						{aiReport ? "Processado via Gemini Generative AI" : "Pronto para análise"}
					</span>
					<span className="text-[9px] text-slate-450 dark:text-slate-500 font-bold uppercase tracking-widest">
						{aiReport ? `Consolidação dos dados de ${filterYear}` : "Resumo Financeiro"}
					</span>
				</div>
			</motion.div>
		</motion.div>
	);
}
