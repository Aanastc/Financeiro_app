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
			toast.loading(`Servidor ocupado. Re-tentando em ${(delay / 1000).toFixed(1)}s...`, { id: "gemini-retry" });
			await new Promise(resolve => setTimeout(resolve, delay));
			return generateContentWithRetry(model, content, retries - 1, delay * 2);
		}
		toast.dismiss("gemini-retry");
		throw error;
	}
};

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
	
	const [globalCartao, setGlobalCartao] = useState("");
	const [globalMetodoPagamento, setGlobalMetodoPagamento] = useState("Crédito");
	const [isAddContatoOpen, setIsAddContatoOpen] = useState<string | null>(null);

	const carregarDadosBase = useCallback(async () => {
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
			const dataCartoes = await financeService.getCartoes(user.id);
			setCartoes(dataCartoes || []);

			const { data: dataContatos } = await supabase.from('contatos').select('*').eq('usuario_id', user.id);
			setContatos(dataContatos || []);

			const { data: dataGastos } = await supabase
				.from('gastos')
				.select('descricao, parcela_atual, total_parcelas, valor, data')
				.eq('usuario_id', user.id)
				.gt('total_parcelas', 1);
			setGastosExistentes(dataGastos || []);

			const { data: dataMetas } = await supabase.from('metas').select('*').eq('usuario_id', user.id);
			setMetas(dataMetas || []);
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
- "descricao": string (nome limpo da transação. Remova quaisquer indicações ou sufixos de parcelas como "de - X/Y", "X/Y", "de Y", "parcela X", etc., deixando apenas o nome do estabelecimento ou operação base, por exemplo: se a transação for "Htm Operacao Codigo de - 1/12", a descrição deve ser apenas "Htm Operacao Codigo")
- "valor": number (positivo, float)
- "tipo_transacao": string (exatamente "Entrada", "Gasto", "Meta" ou "PagamentoFatura". Classifique como "Meta" se a descrição indicar transferência, depósito ou resgate de caixinha, cofrinho, investimentos de metas ou reserva de economia, como "retirado para caixinha", "guardado na caixinha", "cofrinho", etc. Classifique como "PagamentoFatura" se a descrição indicar explicitamente o pagamento ou liquidação da fatura de um cartão de crédito, por exemplo "Pagamento de fatura", "Pagamento Nubank", "Fatura paga", etc.)
- "categoria": string (adivinhe uma dessas: Moradia, Alimentação, Transporte, Saúde, Lazer, Educação, Assinaturas, Presente, Estetica e Comercio, Emprestimo, Salário, Serviços, Outros)
- "parcela_atual": number (se for "1/10" ou "de - 1/12", coloque 1. Se não tiver parcela, 1)
- "total_parcelas": number (se for "1/10" ou "de - 1/12", coloque 12 ou o número total de parcelas indicado. Se não tiver parcela, 1)
- "terceiro": boolean (true se for pagamento para/por terceiro e não do próprio titular, ex: compra pra fulano)

Regras Importantes de Análise:
1. Quando houver operações de crédito/antecipação ou empréstimo onde o valor do crédito entra como saldo na conta, mas há uma diferença de juros/taxas retida, identifique essa diferença e gere uma transação separada do tipo "Gasto" (categoria "Emprestimo" ou "Outros") com descrição apropriada (ex: "Juros de Antecipação" ou similar) representando esse gasto correspondente à diferença dos juros.`;

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
				"gemini-1.5-flash",
				"gemini-1.5-flash-latest",
				"gemini-1.5-pro"
			];
			let result;
			let lastError;

			for (let i = 0; i < modelsToTry.length; i++) {
				const modelName = modelsToTry[i];
				try {
					if (i > 0) {
						toast.loading(`Utilizando modelo de backup (${modelName})...`, { id: "gemini-fallback" });
					}
					const modelInstance = genAI.getGenerativeModel({ model: modelName });
					result = await callGemini(modelInstance);
					toast.dismiss("gemini-fallback");
					toast.dismiss("gemini-retry");
					break;
				} catch (err: any) {
					console.warn(`Falha no modelo ${modelName}:`, err);
					lastError = err;
					toast.dismiss("gemini-fallback");
					toast.dismiss("gemini-retry");
				}
			}

			if (!result) {
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
					supabase.from("gastos").select("descricao, categoria").eq("usuario_id", user.id),
					supabase.from("entradas").select("descricao, categoria").eq("usuario_id", user.id)
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

				const tipoTransacaoFinal = (t.tipo_transacao === "Entrada" || t.tipo_transacao === "Gasto" || t.tipo_transacao === "Meta" || t.tipo_transacao === "PagamentoFatura") 
					? t.tipo_transacao 
					: "Gasto";

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

				return {
					id: Date.now() + index.toString(),
					data: t.data || new Date().toISOString().split('T')[0],
					descricao: t.descricao || "Sem descrição",
					valor: parseFloat(t.valor) || 0,
					tipo_transacao: tipoTransacaoFinal,
					categoria: CATEGORIAS_PADRAO.includes(categoriaFinal) ? categoriaFinal : "Outros",
					parcela_atual: t.parcela_atual || 1,
					total_parcelas: t.total_parcelas || 1,
					terceiro: t.terceiro || false,
					contato_id: "",
					meta_id: matchedMetaId,
					cartao_id: matchedCartaoId,
					ignorar,
					ignoredReason,
					classificacao: "Variável",
					tipo: "Lazer"
				};
			});
			
			clearInterval(interval);
			setProgress(100);
			setPreview(processados);
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
		setPreview(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
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

		const hasGastosCredito = itemsToSave.some(i => i.tipo_transacao === "Gasto");
		if (hasGastosCredito && globalMetodoPagamento === "Crédito" && !globalCartao) {
			toast.error("Por favor, selecione o Cartão de Crédito global no topo da tela antes de salvar.");
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
					categoria: i.categoria
				}));

			if (entradasParaSalvar.length > 0) {
				const { error } = await supabase.from("entradas").insert(entradasParaSalvar);
				if (error) throw error;
				importados += entradasParaSalvar.length;
			}

			const gastos = itemsToSave.filter(i => i.tipo_transacao === "Gasto");
			for (const item of gastos) {
				await financeService.addGasto(user.id, {
					descricao: item.descricao,
					valor: item.valor,
					data: item.data,
					categoria: item.categoria,
					classificacao: item.classificacao,
					tipo: item.tipo,
					metodo_pagamento: globalMetodoPagamento,
					cartao_id: globalMetodoPagamento === "Crédito" ? globalCartao : null,
					parcelas: item.total_parcelas.toString(),
					parcela_atual: item.parcela_atual,
					total_parcelas: item.total_parcelas,
					terceiro: item.terceiro,
					contato_id: item.contato_id || null,
					valor_ja_dividido: true
				});
				importados++;
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
