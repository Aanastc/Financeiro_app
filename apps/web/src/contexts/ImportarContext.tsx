import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import { toast } from "react-hot-toast";
import ExcelJS from "exceljs";

export interface TransacaoPreview {
	id: string;
	data: string;
	descricao: string;
	valor: number;
	categoria: string;
	tipo_transacao: 'Gasto' | 'Entrada' | 'Meta' | 'PagamentoFatura';
	classificacao: string;
	tipo: string;
	parcela_atual: number;
	total_parcelas: number;
	terceiro: boolean;
	contato_id: string;
	meta_id?: string;
	cartao_id?: string;
	ignorar: boolean;
	ignoredReason: string;
	terceiro_pago?: boolean;
	vinculo_id?: string;
	nome_terceiro?: string;
	observacao?: string;
	metodo_pagamento?: string;
	conta_id?: string;
}

export const CATEGORIAS_PADRAO = [
	"Moradia",
	"Alimentação",
	"Transporte",
	"Saúde",
	"Lazer",
	"Educação",
	"Assinaturas",
	"Presente",
	"Estetica e Comercio",
	"Emprestimo",
	"Salário",
	"Serviços",
	"Outros",
];

interface ImportarContextProps {
	file: File | null;
	preview: TransacaoPreview[];
	loading: boolean;
	progress: number;
	cartoes: any[];
	contatos: any[];
	gastosExistentes: any[];
	metas: any[];
	contas: any[];
	globalCartao: string;
	globalMetodoPagamento: string;
	dragActive: boolean;
	isAddContatoOpen: string | null;
	setFile: React.Dispatch<React.SetStateAction<File | null>>;
	setPreview: React.Dispatch<React.SetStateAction<TransacaoPreview[]>>;
	setLoading: React.Dispatch<React.SetStateAction<boolean>>;
	setProgress: React.Dispatch<React.SetStateAction<number>>;
	setGlobalCartao: React.Dispatch<React.SetStateAction<string>>;
	setGlobalMetodoPagamento: React.Dispatch<React.SetStateAction<string>>;
	setDragActive: React.Dispatch<React.SetStateAction<boolean>>;
	setIsAddContatoOpen: React.Dispatch<React.SetStateAction<string | null>>;
	carregarDadosBase: () => Promise<void>;
	processarArquivo: (droppedFile: File) => Promise<void>;
	updateItem: (id: string, field: string, value: any) => void;
	removeItem: (id: string) => void;
	handleSaveAll: () => Promise<void>;
	resetImport: () => void;
}

const ImportarContext = createContext<ImportarContextProps | undefined>(undefined);

const generateContentWithRetry = async (model: any, content: any[], retries = 1, delay = 1500): Promise<any> => {
	try {
		return await model.generateContent(content);
	} catch (error: any) {
		const errorMessage = error?.message || "";
		const isTransient = errorMessage.includes("503") || errorMessage.includes("experiencing high demand") || errorMessage.includes("429");
		
		if (retries > 0 && isTransient) {
			toast.loading("Processando dados, aguarde...", { id: "gemini-retry" });
			await new Promise(resolve => setTimeout(resolve, delay));
			return generateContentWithRetry(model, content, retries - 1, delay * 2);
		}
		toast.dismiss("gemini-retry");
		throw error;
	}
};

const isAutoConciliado = (obs?: string) => {
	if (!obs) return false;
	try {
		if (obs.trim().startsWith("{")) {
			const parsed = JSON.parse(obs);
			return parsed && parsed.auto_conciliado === true;
		}
	} catch (e) {}
	return false;
};

function executarConciliacao(itens: TransacaoPreview[], contatosList: any[]): TransacaoPreview[] {
	const limpos = itens.map(item => ({
		...item,
		terceiro_pago: isAutoConciliado(item.observacao) ? false : item.terceiro_pago,
		vinculo_id: undefined,
		observacao: isAutoConciliado(item.observacao) ? undefined : item.observacao,
		categoria: item.categoria === "Anulação de Gasto de Terceiro" ? "Outros" : item.categoria
	}));

	for (let i = 0; i < limpos.length; i++) {
		const item = limpos[i];
		if (item.tipo_transacao === "Gasto" && item.terceiro && item.contato_id && !item.terceiro_pago) {
			const contato = contatosList.find(c => c.id === item.contato_id);
			if (!contato) continue;

			const contatoNome = contato.nome.toLowerCase();

			const parceira = limpos.find(p => 
				p.id !== item.id &&
				p.tipo_transacao === "Entrada" &&
				!p.vinculo_id &&
				Math.abs(p.valor - item.valor) < 1.00 &&
				(p.descricao.toLowerCase().includes(contatoNome) || 
				 (p.nome_terceiro && p.nome_terceiro.toLowerCase().includes(contatoNome)))
			);

			if (parceira) {
				item.terceiro_pago = true;
				item.vinculo_id = parceira.id;
				item.observacao = JSON.stringify({ 
					auto_conciliado: true, 
					vinculo_id: parceira.id,
					descricao_parceira: parceira.descricao,
					data_parceira: parceira.data
				});

				parceira.vinculo_id = item.id;
				parceira.categoria = "Anulação de Gasto de Terceiro";
				parceira.observacao = JSON.stringify({ 
					auto_conciliado: true, 
					vinculo_id: item.id,
					descricao_parceira: item.descricao,
					data_parceira: item.data
				});
			}
		}
	}

	return limpos;
}

function parseRetryAfter(message: string): Date | null {
	const regex = /retry (?:after|in) ([0-9.]+)\s*(s|m|h|seconds|minutes|hours)/i;
	const match = message.match(regex);
	if (!match) {
		const regexTight = /retry (?:after|in) ([0-9.]+)(s|m|h)/i;
		const matchTight = message.match(regexTight);
		if (!matchTight) return null;
		return calculateFutureTime(parseFloat(matchTight[1]), matchTight[2]);
	}
	return calculateFutureTime(parseFloat(match[1]), match[2]);
}

function calculateFutureTime(value: number, unit: string): Date {
	const now = new Date();
	let msToAdd = 0;
	const unitLower = unit.toLowerCase();
	if (unitLower.startsWith("s")) {
		msToAdd = value * 1000;
	} else if (unitLower.startsWith("m")) {
		msToAdd = value * 60 * 1000;
	} else if (unitLower.startsWith("h")) {
		msToAdd = value * 60 * 60 * 1000;
	}
	return new Date(now.getTime() + msToAdd);
}

function formatFutureTime(date: Date): string {
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const seconds = String(date.getSeconds()).padStart(2, "0");
	const timeStr = `${hours}:${minutes}:${seconds}`;

	const now = new Date();
	if (date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
		return `hoje às ${timeStr}`;
	} else {
		const day = String(date.getDate()).padStart(2, "0");
		const month = String(date.getMonth() + 1).padStart(2, "0");
		return `no dia ${day}/${month} às ${timeStr}`;
	}
}

export function ImportarProvider({ children }: { children: React.ReactNode }) {
	const [dragActive, setDragActive] = useState(false);
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<TransacaoPreview[]>([]);
	const [loading, setLoading] = useState(false);
	const [progress, setProgress] = useState(0);
	const [cartoes, setCartoes] = useState<any[]>([]);
	const [contatos, setContatos] = useState<any[]>([]);
	const [gastosExistentes, setGastosExistentes] = useState<any[]>([]);
	const [metas, setMetas] = useState<any[]>([]);
	const [contas, setContas] = useState<any[]>([]);
	
	const [globalCartao, setGlobalCartao] = useState("");
	const [globalMetodoPagamento, setGlobalMetodoPagamento] = useState("Débito");
	const [isAddContatoOpen, setIsAddContatoOpen] = useState<string | null>(null);

	const carregarDadosBase = useCallback(async () => {
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
			const dataCartoes = await financeService.getCartoes(user.id);
			setCartoes(dataCartoes || []);

			const { data: dataContatos } = await supabase.from('contatos').select('*').eq('usuario_id', user.id);
			setContatos(dataContatos || []);

			const { data: dataGastos } = await supabase
				.from("despesas")
				.select('descricao, parcela_atual, total_parcelas, valor, data')
				.eq('usuario_id', user.id)
				.gt('total_parcelas', 1);
			setGastosExistentes(dataGastos || []);

			const { data: dataMetas } = await supabase.from('metas').select('*').eq('usuario_id', user.id);
			setMetas(dataMetas || []);

			const { data: dataContas } = await supabase.from('contas_bancarias').select('*').eq('usuario_id', user.id);
			setContas(dataContas || []);
		}
	}, []);

	useEffect(() => {
		carregarDadosBase();
	}, [carregarDadosBase]);

	const processarArquivo = async (droppedFile: File) => {
		const name = droppedFile.name.toLowerCase();
		const isPdf = name.endsWith(".pdf");
		const isImage = name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp");
		const isCsv = name.endsWith(".csv");
		const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");

		if (!isPdf && !isImage && !isCsv && !isExcel) {
			toast.error("Formato de arquivo não suportado. Use PDF, PNG, JPG, JPEG, WEBP, CSV ou EXCEL.");
			return;
		}

		setFile(droppedFile);
		setLoading(true);
		setProgress(5);

		const interval = setInterval(() => {
			setProgress((prev) => {
				if (prev >= 95) {
					clearInterval(interval);
					return 95;
				}
				return prev + Math.floor(Math.random() * 8) + 2;
			});
		}, 200);

		try {
			const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
			if (!apiKey || apiKey === "sua_chave_aqui") {
				clearInterval(interval);
				toast.error("Chave da API do Gemini não configurada no arquivo .env!");
				setFile(null);
				setLoading(false);
				return;
			}

			const genAI = new GoogleGenerativeAI(apiKey);

			const prompt = `Você é um assistente financeiro. Analise o extrato bancário ou tabela de transações fornecida. 
Retorne APENAS um JSON estrito, sem blocos de código (markdown \`\`\`json), sem textos adicionais, apenas o objeto JSON.
O JSON deve ter um array chamado "transacoes", e cada objeto deve ter:
- "data": string (formato YYYY-MM-DD)
- "categoria": string (Classifique o tipo exato da transação ou entrada. Para Entradas/Receitas, use classificações como "Pix Recebido", "Salário", "Rendimento", "Transferência", "Crédito em Conta", etc. Para gastos, adivinhe uma dessas: Moradia, Alimentação, Transporte, Saúde, Lazer, Educação, Assinaturas, Presente, Estetica e Comercio, Emprestimo, Serviços, Outros. Se for pagamento de fatura, use "Pagamento de Fatura".)
- "descricao": string (NOME LIMPO da pessoa, empresa, estabelecimento ou cartão. EXTREMAMENTE IMPORTANTE: REMOVA todos os prefixos como "PIX ENVIADO", "PIX RECEBIDO", "LÍQUIDO DE VENCIMENTO", "PAGAMENTO RECEBIDO", "CRÉDITO EM CONTA". Na descrição, deve sobrar APENAS o nome do destinatário/remetente, a razão social, ou o nome do cartão. Exemplos: Se for "PIX RECEBIDO - PEDRO SOUZA", a descrição é APENAS "Pedro Souza". Se for "LÍQUIDO DE VENCIMENTO", a descrição é o nome da empresa ou apenas "Salário Líquido". Se for "CRÉDITO EM CONTA", tente colocar o nome do banco ou origem. Remova também indicações de parcelas como "de - X/Y", "parcela X".)
- "valor": number (positivo, float)
- "tipo_transacao": string (exatamente "Entrada", "Gasto", "Meta" ou "PagamentoFatura". Classifique como "Meta" se a descrição indicar transferência, depósito ou resgate de caixinha, cofrinho, investimentos de metas ou reserva de economia. Classifique como "PagamentoFatura" se a descrição indicar explicitamente o pagamento, liquidação ou recebimento de crédito da fatura de um cartão de crédito.)
- "parcela_atual": number (se for "1/10" ou "de - 1/12", coloque 1. Se não tiver parcela, 1)
- "total_parcelas": number (se for "1/10" ou "de - 1/12", coloque 12 ou o número total de parcelas indicado. Se não tiver parcela, 1)
- "terceiro": boolean (true se for pagamento para/por terceiro e não do próprio titular, ex: compra pra fulano, OU se for uma entrada recebida de terceiros que represente reembolso/PIX de despesas divididas)
- "nome_terceiro": string (se "terceiro" for true, o nome do terceiro identificado no extrato)
- "metodo_pagamento": string (exatamente "Crédito" se for um gasto no cartão de crédito; "Débito" para extrato de conta corrente comum; ou "Pix" se for transferência instantânea Pix)

Regras Importantes de Análise:
1. Quando houver operações de crédito/antecipação ou empréstimo onde o valor do crédito entra como saldo na conta, mas há uma diferença de juros/taxas retida, identifique essa diferença e gere uma transação separada do tipo "Gasto" (categoria "Emprestimo" ou "Outros") com descrição apropriada (ex: "Juros de Antecipação" ou similar).
2. A separação entre CATEGORIA e DESCRIÇÃO deve ser rigorosa: Categoria é a NATUREZA da transação (Pix, Salário, Alimentação), Descrição é a ENTIDADE (João da Silva, Mercado Extra, Nubank).`;

			let base64String = "";
			let mimeType = "";
			let csvText = "";
			let excelText = "";

			if (isPdf || isImage) {
				const base64DataUrl = await new Promise<string>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = (e) => resolve(e.target?.result as string);
					reader.onerror = reject;
					reader.readAsDataURL(droppedFile);
				});

				base64String = base64DataUrl.split(',')[1];
				mimeType = "application/pdf";
				if (isImage) {
					if (name.endsWith(".png")) mimeType = "image/png";
					else if (name.endsWith(".webp")) mimeType = "image/webp";
					else mimeType = "image/jpeg";
				}
			} else if (isCsv) {
				csvText = await new Promise<string>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = (e) => resolve(e.target?.result as string);
					reader.onerror = reject;
					reader.readAsText(droppedFile, "UTF-8");
				});
			} else if (isExcel) {
				const workbook = new ExcelJS.Workbook();
				const arrayBuffer = await droppedFile.arrayBuffer();
				await workbook.xlsx.load(arrayBuffer);
				
				const worksheet = workbook.worksheets[0];
				if (!worksheet) {
					throw new Error("A planilha do Excel está vazia.");
				}

				worksheet.eachRow((row, rowNumber) => {
					const rowValues = Array.isArray(row.values)
						? row.values.slice(1).map(val => val !== null && val !== undefined ? String(val) : "").join(", ")
						: Object.values(row.values || {}).join(", ");
					excelText += `Linha ${rowNumber}: ${rowValues}\n`;
				});
			}

			const callGemini = async (modelInstance: any) => {
				if (isPdf || isImage) {
					return await generateContentWithRetry(modelInstance, [
						prompt,
						{
							inlineData: {
								data: base64String,
								mimeType
							}
						}
					], 1, 1500);
				} else if (isCsv) {
					return await generateContentWithRetry(modelInstance, [
						prompt,
						`Aqui está o conteúdo do arquivo CSV:\n${csvText}`
					], 1, 1500);
				} else {
					return await generateContentWithRetry(modelInstance, [
						prompt,
						`Aqui está o conteúdo extraído da planilha Excel:\n${excelText}`
					], 1, 1500);
				}
			};

			const modelsToTry = [
				"gemini-2.5-flash", 
				"gemini-2.0-flash", 
				"gemini-flash-latest",
				"gemini-pro-latest"
			];
			let result;
			let lastError;
			const errorsMap: { [model: string]: string } = {};

			for (let i = 0; i < modelsToTry.length; i++) {
				const modelName = modelsToTry[i];
				try {
					if (i > 0) {
						toast.loading("Processando dados, aguarde...", { id: "gemini-fallback" });
					}
					const modelInstance = genAI.getGenerativeModel({ model: modelName });
					result = await callGemini(modelInstance);
					toast.dismiss("gemini-fallback");
					toast.dismiss("gemini-retry");
					break;
				} catch (err: any) {
					console.warn(`Falha no modelo ${modelName}:`, err);
					errorsMap[modelName] = err?.message || String(err);
					lastError = err;
					toast.dismiss("gemini-fallback");
					toast.dismiss("gemini-retry");

					const errText = (err?.message || "").toLowerCase();
					const isBadFile = errText.includes("no pages") || 
					                  errText.includes("has no pages") || 
					                  errText.includes("400") ||
					                  errText.includes("invalid argument");
					if (isBadFile) {
						break;
					}
				}
			}

			if (!result) {
				console.error("Erros detalhados por modelo:", errorsMap);
				const primaryError = errorsMap["gemini-2.5-flash"] || "";
				if (primaryError && !primaryError.includes("404")) {
					const cleanErr = primaryError.toLowerCase();
					if (cleanErr.includes("429") || cleanErr.includes("quota") || cleanErr.includes("limit")) {
						const retryDate = parseRetryAfter(primaryError);
						if (retryDate) {
							throw new Error(`Limite de uso temporário da inteligência artificial excedido. Por favor, tente novamente ${formatFutureTime(retryDate)}.`);
						} else {
							throw new Error("Limite diário de uso da inteligência artificial excedido. Por favor, tente novamente amanhã a partir das 05:00 (horário de Brasília).");
						}
					}
					if (cleanErr.includes("503") || cleanErr.includes("overloaded") || cleanErr.includes("unavailable")) {
						throw new Error("O servidor de inteligência artificial está temporariamente ocupado. Por favor, tente novamente em alguns instantes.");
					}
					throw new Error(`Falha no processamento (Gemini 2.5): ${primaryError}`);
				}
				const errorMessage = lastError?.message || "";
				if (errorMessage.includes("404")) {
					throw new Error("Sua chave da API do Google não tem acesso aos modelos Gemini (Erro 404). Verifique no Google AI Studio se a chave está correta e com permissão.");
				}
				throw lastError || new Error("Não foi possível obter resposta de nenhum modelo da Inteligência Artificial.");
			}

			const text = result.response.text();
			const cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
			const json = JSON.parse(cleanText);

			const { data: { user } } = await supabase.auth.getUser();
			const categoriaMap = new Map<string, string>();
			if (user) {
				const [historyGastos, historyEntradas] = await Promise.all([
					supabase.from("despesas").select("descricao, categoria").eq("usuario_id", user.id),
					supabase.from("receitas").select("descricao, categoria").eq("usuario_id", user.id)
				]);

				historyGastos.data?.forEach(g => {
					if (g.descricao && g.categoria) {
						categoriaMap.set(g.descricao.trim().toLowerCase(), g.categoria);
					}
				});
				historyEntradas.data?.forEach(e => {
					if (e.descricao && e.categoria) {
						categoriaMap.set(e.descricao.trim().toLowerCase(), e.categoria);
					}
				});
			}
			
			const processados: TransacaoPreview[] = json.transacoes.map((t: any, index: number) => {
				let ignorar = false;
				let ignoredReason = "";

				if (t.total_parcelas > 1 && t.parcela_atual > 1) {
					const descMatch = t.descricao.replace(/\(\d+\/\d+\)/g, "").replace(/\d+\/\d+/g, "").trim().toLowerCase();
					
					const exists = gastosExistentes.find(g => 
						g.descricao.toLowerCase().includes(descMatch) && 
						g.parcela_atual === t.parcela_atual && 
						g.total_parcelas === t.total_parcelas
					);
					
					if (exists) {
						ignorar = true;
						ignoredReason = `Já Lançada (${t.parcela_atual}/${t.total_parcelas})`;
					}
				}

				let categoriaFinal = t.categoria;
				const cleanDesc = (t.descricao || "").trim().toLowerCase();
				if (cleanDesc) {
					if (categoriaMap.has(cleanDesc)) {
						categoriaFinal = categoriaMap.get(cleanDesc)!;
					} else {
						for (const [pastDesc, pastCat] of categoriaMap.entries()) {
							if (cleanDesc.includes(pastDesc) || pastDesc.includes(cleanDesc)) {
								categoriaFinal = pastCat;
								break;
							}
						}
					}
				}

				let tipoTransacaoFinal = (t.tipo_transacao === "Entrada" || t.tipo_transacao === "Gasto" || t.tipo_transacao === "Meta" || t.tipo_transacao === "PagamentoFatura") 
					? t.tipo_transacao 
					: "Gasto";

				if (tipoTransacaoFinal === "Meta" && metas.length === 0) {
					tipoTransacaoFinal = "Entrada";
				}

				let matchedMetaId = "";
				if (tipoTransacaoFinal === "Meta") {
					const foundMeta = metas.find(m => {
						const cleanTitle = m.titulo.toLowerCase();
						return cleanDesc.includes(cleanTitle) || cleanTitle.includes(cleanDesc) ||
							cleanDesc.split(/\s+/).some(word => word.length > 3 && cleanTitle.includes(word));
					});
					if (foundMeta) {
						matchedMetaId = foundMeta.id;
					}
				}

				let matchedCartaoId = "";
				if (tipoTransacaoFinal === "PagamentoFatura") {
					const foundCartao = cartoes.find(c => {
						const cleanName = c.nome.toLowerCase();
						return cleanDesc.includes(cleanName) || cleanName.includes(cleanDesc);
					});
					if (foundCartao) {
						matchedCartaoId = foundCartao.id;
					}
				}

				const isGasto = tipoTransacaoFinal === "Gasto";
				const terceiroFinal = isGasto ? (t.terceiro || false) : false;

				let matchedContatoId = "";
				if (terceiroFinal && t.nome_terceiro) {
					const cleanName = t.nome_terceiro.toLowerCase();
					const foundContato = contatos.find(c => {
						const cleanContatoName = c.nome.toLowerCase();
						return cleanName.includes(cleanContatoName) || cleanContatoName.includes(cleanName) ||
							cleanContatoName.split(" ").some(word => word.length > 3 && cleanName.includes(word));
					});
					if (foundContato) {
						matchedContatoId = foundContato.id;
					}
				}

				let defaultMetodo = t.metodo_pagamento || "Débito";
				if (defaultMetodo !== "Crédito" && defaultMetodo !== "Pix") {
					defaultMetodo = "Débito";
				}

				let defaultCartao = "";
				if (tipoTransacaoFinal === "PagamentoFatura") {
					defaultCartao = matchedCartaoId;
				} else if (tipoTransacaoFinal === "Gasto" && (defaultMetodo === "Crédito" || (t.total_parcelas || 1) > 1)) {
					defaultMetodo = "Crédito";
					defaultCartao = cartoes[0]?.id || "";
				}

				const defaultConta = contas[0]?.id || "";

				return {
					id: Date.now() + index.toString(),
					data: t.data || new Date().toISOString().split('T')[0],
					descricao: t.descricao || "Sem descrição",
					valor: parseFloat(t.valor) || 0,
					tipo_transacao: tipoTransacaoFinal,
					categoria: CATEGORIAS_PADRAO.includes(categoriaFinal) ? categoriaFinal : "Outros",
					parcela_atual: t.parcela_atual || 1,
					total_parcelas: t.total_parcelas || 1,
					terceiro: terceiroFinal,
					contato_id: matchedContatoId,
					nome_terceiro: t.nome_terceiro || "",
					meta_id: matchedMetaId,
					cartao_id: defaultCartao,
					metodo_pagamento: defaultMetodo,
					conta_id: defaultConta,
					ignorar,
					ignoredReason,
					classificacao: "Variável",
					tipo: "Lazer"
				};
			});
			
			const conciliados = executarConciliacao(processados, contatos);

			clearInterval(interval);
			setProgress(100);
			setPreview(conciliados);
			toast.success("Arquivo analisado com sucesso!");
		} catch (error: any) {
			clearInterval(interval);
			console.error(error);
			toast.error("Erro no processamento do arquivo: " + error.message);
			setFile(null);
		} finally {
			clearInterval(interval);
			setLoading(false);
		}
	};

	const updateItem = (id: string, field: string, value: any) => {
		setPreview(prev => {
			const updated = prev.map(p => p.id === id ? { ...p, [field]: value } : p);
			return executarConciliacao(updated, contatos);
		});
	};

	const removeItem = (id: string) => {
		setPreview(prev => prev.filter(p => p.id !== id));
	};

	const handleSaveAll = async () => {
		const itemsToSave = preview.filter(p => !p.ignorar);
		if (itemsToSave.length === 0) {
			toast.error("Nenhum lançamento novo para salvar.");
			return;
		}

		const hasOrphanedCredito = itemsToSave.some(i => i.tipo_transacao === "Gasto" && i.metodo_pagamento === "Crédito" && !i.cartao_id);
		if (hasOrphanedCredito) {
			toast.error("Por favor, selecione o Cartão de Crédito para todos os gastos marcados como Crédito.");
			return;
		}

		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) throw new Error("Usuário não autenticado");

			let importados = 0;

			const entradasParaSalvar = itemsToSave
				.filter(i => i.tipo_transacao === "Entrada")
				.map(i => ({
					usuario_id: user.id,
					descricao: i.descricao,
					valor: i.valor,
					data: i.data,
					categoria: i.categoria,
					conta_id: i.conta_id || null
				}));

			if (entradasParaSalvar.length > 0) {
				const { error } = await supabase.from("receitas").insert(entradasParaSalvar);
				if (error) throw error;
				importados += entradasParaSalvar.length;
			}

			const gastos = itemsToSave.filter(i => 
				i.tipo_transacao === "Gasto" && 
				(i.categoria !== "Emprestimo" || i.metodo_pagamento === "Crédito")
			);
			for (const item of gastos) {
				await financeService.addGasto(user.id, {
					descricao: item.descricao,
					valor: item.valor,
					data: item.data,
					categoria: item.categoria,
					classificacao: item.classificacao,
					tipo: item.tipo,
					metodo_pagamento: item.metodo_pagamento || "Débito",
					cartao_id: item.metodo_pagamento === "Crédito" ? (item.cartao_id || null) : null,
					parcelas: item.total_parcelas.toString(),
					parcela_atual: item.parcela_atual,
					total_parcelas: item.total_parcelas,
					terceiro: item.terceiro,
					contato_id: item.contato_id || null,
					terceiro_pago: item.terceiro_pago || false,
					observacao: item.observacao || null,
					valor_ja_dividido: true,
					conta_id: item.conta_id || null
				});
				importados++;
			}

			const { data: activeDividas } = await supabase
				.from("passivos")
				.select("*")
				.eq("usuario_id", user.id)
				.eq("status", "pendente");

			const salvarOuAtualizarDivida = async (item: any) => {
				const cleanDesc = item.descricao.replace(/\(\d+\/\d+\)/g, "").replace(/\d+\/\d+/g, "").trim().toLowerCase();
				
				const matchedDivida = activeDividas?.find(d => {
					const cleanDbDesc = d.descricao.replace(/\(\d+\/\d+\)/g, "").replace(/\d+\/\d+/g, "").trim().toLowerCase();
					return cleanDesc.includes(cleanDbDesc) || cleanDbDesc.includes(cleanDesc);
				});

				if (matchedDivida) {
					const novaParcela = Math.min(matchedDivida.parcelas, matchedDivida.parcela_atual + 1);
					const novoStatus = novaParcela === matchedDivida.parcelas ? "quitada" : "pendente";

					const { error: updateError } = await supabase
						.from("passivos")
						.update({
							parcela_atual: novaParcela,
							status: novoStatus,
							vencimento_parcela: item.data
						})
						.eq("id", matchedDivida.id);
					
					if (updateError) throw updateError;
				} else {
					const date = new Date(item.data + "T12:00:00");
					const totalParcelas = item.total_parcelas || 1;
					const parcelaAtual = item.parcela_atual || 1;
					date.setMonth(date.getMonth() + (totalParcelas - parcelaAtual));
					const vencimentoTotalCalculado = date.toISOString().split("T")[0];

					await financeService.addDivida(user.id, {
						descricao: item.descricao,
						valor_total: item.valor,
						parcelas: totalParcelas,
						parcela_atual: parcelaAtual,
						juros: 0,
						vencimento_parcela: item.data,
						vencimento_total: vencimentoTotalCalculado,
						status: "pendente",
						banco: "Importado",
						tipo_divida: "Empréstimo",
						data_inicio: item.data
					});
				}
			};

			const emprestimosGastos = itemsToSave.filter(i => i.tipo_transacao === "Gasto" && i.categoria === "Emprestimo");
			for (const item of emprestimosGastos) {
				await salvarOuAtualizarDivida(item);
				importados++;
			}

			const entradasEmprestimos = itemsToSave.filter(i => i.tipo_transacao === "Entrada" && i.categoria === "Emprestimo");
			for (const item of entradasEmprestimos) {
				await salvarOuAtualizarDivida(item);
			}

			const metasDepositos = itemsToSave.filter(i => i.tipo_transacao === "Meta");
			for (const item of metasDepositos) {
				if (!item.meta_id) {
					toast.error(`Por favor, selecione qual meta receberá o valor de R$ ${item.valor.toFixed(2)} (${item.descricao})`);
					setLoading(false);
					return;
				}
				await financeService.addDepositoMeta(user.id, {
					meta_id: item.meta_id,
					valor: item.valor,
					data: item.data
				});
				importados++;
			}

			const faturasPagamentos = itemsToSave.filter(i => i.tipo_transacao === "PagamentoFatura");
			for (const item of faturasPagamentos) {
				if (!item.cartao_id) {
					toast.error(`Por favor, selecione o cartão de crédito para o pagamento de R$ ${item.valor.toFixed(2)} (${item.descricao})`);
					setLoading(false);
					return;
				}
				const mesReferencia = item.data.substring(0, 7);
				await financeService.pagarFatura(
					user.id,
					item.cartao_id,
					item.valor,
					mesReferencia,
					'Total',
					item.data,
					item.descricao
				);
				importados++;
			}

			toast.success(`${importados} lançamentos importados com sucesso!`);
			setPreview([]);
			setFile(null);
		} catch (error: any) {
			console.error(error);
			toast.error("Erro ao importar: " + error.message);
		} finally {
			setLoading(false);
		}
	};

	const resetImport = () => {
		setFile(null);
		setPreview([]);
		setProgress(0);
		setLoading(false);
	};

	return (
		<ImportarContext.Provider
			value={{
				file,
				preview,
				loading,
				progress,
				cartoes,
				contatos,
				gastosExistentes,
				metas,
				contas,
				globalCartao,
				globalMetodoPagamento,
				dragActive,
				isAddContatoOpen,
				setFile,
				setPreview,
				setLoading,
				setProgress,
				setGlobalCartao,
				setGlobalMetodoPagamento,
				setDragActive,
				setIsAddContatoOpen,
				carregarDadosBase,
				processarArquivo,
				updateItem,
				removeItem,
				handleSaveAll,
				resetImport
			}}
		>
			{children}
		</ImportarContext.Provider>
	);
}

export function useImportar() {
	const context = useContext(ImportarContext);
	if (context === undefined) {
		throw new Error("useImportar must be used within an ImportarProvider");
	}
	return context;
}
