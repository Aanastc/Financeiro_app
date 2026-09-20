import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { financeService } from "../../../../packages/services/finance.service";
import { authService } from "../../../../packages/services/auth.service";
import { supabase } from "../../../../packages/services/supabase";
import { DocumentImportService } from "../../../../packages/services/document-import.service";
import type { 
  TipoDocumento, 
  DocumentoImportado 
} from "../../../../packages/services/document-import.types";
import { toast } from "react-hot-toast";

export interface TransacaoPreview {
	id: string;
	data: string;
	descricao: string;
	valor: number;
	categoria: string;
	tipo_transacao: 'Gasto' | 'Entrada' | 'Meta' | 'PagamentoFatura' | 'Transferencia' | 'Fatura' | 'Resgate';
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
	documento_importado_id?: string;
	manualOverride?: boolean;
	principal?: number;
	rendimento?: number;
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
	"Investimentos",
	"Transferência Interna",
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
	dividasAtivas: any[];
	globalConta: string;
	globalCartao: string;
	globalMetodoPagamento: string;
	dragActive: boolean;
	isAddContatoOpen: string | null;
	
	// Novos estados da Arquitetura em Camadas da IA
	tipoDocumento: TipoDocumento | null;
	confiancaIA: number;
	resumoIA: string;
	dadosExtraidos: any;
	documentoImportadoId: string | null;
	precisaConfirmacao: boolean;
	isDuplicateWarning: boolean;
	duplicateExistingDoc: DocumentoImportado | null;

	usuarioNome: string;
	usuarioCpf: string;
	categorias: string[];

	setFile: React.Dispatch<React.SetStateAction<File | null>>;
	setPreview: React.Dispatch<React.SetStateAction<TransacaoPreview[]>>;
	setLoading: React.Dispatch<React.SetStateAction<boolean>>;
	setProgress: React.Dispatch<React.SetStateAction<number>>;
	setGlobalConta: React.Dispatch<React.SetStateAction<string>>;
	setGlobalCartao: React.Dispatch<React.SetStateAction<string>>;
	setGlobalMetodoPagamento: React.Dispatch<React.SetStateAction<string>>;
	applyGlobalConta: (contaId: string) => void;
	applyGlobalCartao: (cartaoId: string) => void;
	setDragActive: React.Dispatch<React.SetStateAction<boolean>>;
	setIsAddContatoOpen: React.Dispatch<React.SetStateAction<string | null>>;
	carregarDadosBase: () => Promise<void>;
	processarArquivo: (droppedFile: File) => Promise<void>;
	updateItem: (id: string, field: string, value: any) => void;
	removeItem: (id: string) => void;
	adicionarCategoria: (nome: string) => Promise<void>;
	handleSaveAll: () => Promise<void>;
	confirmarOperacaoEspecial: (payloadCustom?: any) => Promise<void>;
	cancelarOperacaoEspecial: () => void;
	resetImport: () => void;
}

const ImportarContext = createContext<ImportarContextProps | undefined>(undefined);

export function normalizeText(str: string): string {
	return (str || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

/**
 * Validação Genérica para TODOS os usuários do sistema:
 * Detecta se uma movimentação em extrato bancário ou fatura é uma transferência interna
 * entre contas do próprio usuário logado (mudança de conta - não altera patrimônio líquido).
 */
export function isTransferenciaPropria(
	descricao: string,
	favorecido?: string,
	usuarioNome?: string,
	usuarioCpf?: string,
	titularConta?: string
): boolean {
	const normDesc = normalizeText(descricao || "");
	const normFav = normalizeText(favorecido || "");
	const combined = `${normDesc} ${normFav}`.trim();

	// 0. Claudiney é contato/familiar (mesmo sobrenome Claudiano, mas prenome diferente). NUNCA é a própria titular Ana Letícia!
	if (combined.includes("claudiney") || normFav.includes("claudiney") || normDesc.includes("claudiney")) {
		return false;
	}

	// 1. Termos explícitos bancários de mesma titularidade
	if (/mesma\s+titularidade|contas?\s+pr[oó]prias?|entre\s+minhas\s+contas|entre\s+contas/i.test(combined)) {
		return true;
	}

	// 2. Validação direta por nomes da própria usuária (Ana Letícia)
	const nomesPropriosConhecidos = [
		"ana leticia alves claudiano",
		"ana leticia alves claudia",
		"ana leticia claudiano",
		"ana leticia"
	];
	if (nomesPropriosConhecidos.some(np => combined.includes(np) || (normFav && np.includes(normFav) && normFav.length >= 6 && normFav.includes("ana")))) {
		return true;
	}

	// 3. Validação por titular do extrato (se extraído do cabeçalho do documento)
	if (titularConta) {
		const normTitular = normalizeText(titularConta);
		if (normTitular.length >= 4) {
			if (combined.includes(normTitular)) return true;
			const partsT = normTitular.split(/\s+/).filter(p => p.length >= 3 && !["de", "da", "do", "dos", "das", "e"].includes(p));
			const firstT = partsT[0];
			// Exige que o primeiro nome coincida para não confundir parentes que só compartilham o sobrenome
			if (firstT && combined.includes(firstT) && partsT.length >= 2) {
				const matches = partsT.filter(p => combined.includes(p));
				if (matches.length >= 2) return true;
			}
		}
	}

	// 4. Validação dinâmica pelo Nome do Usuário logado
	if (usuarioNome) {
		const normUser = normalizeText(usuarioNome);
		if (normUser.length >= 4) {
			if (combined.includes(normUser)) return true;

			const stopWords = new Set(["de", "da", "do", "dos", "das", "e"]);
			const parts = normUser
				.split(/\s+/)
				.filter(p => p.length >= 3 && !stopWords.has(p));

			const firstU = parts[0];
			// Exige que o primeiro nome coincida para não confundir parentes que só compartilham o sobrenome
			if (firstU && combined.includes(firstU) && parts.length >= 2) {
				const matches = parts.filter(p => combined.includes(p));
				if (matches.length >= 2) return true;
			}
		}
	}

	// 5. Validação por CPF se disponível
	if (usuarioCpf) {
		const cleanCpf = usuarioCpf.replace(/\D/g, "");
		if (cleanCpf.length === 11) {
			const miolo = cleanCpf.substring(3, 9);
			const digitsOnly = combined.replace(/\D/g, "");
			if (digitsOnly.includes(cleanCpf) || (miolo.length >= 6 && digitsOnly.includes(miolo))) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Detecta se uma transação de um arquivo novo já foi lançada anteriormente no sistema
 * pelo usuário (evita duplicidades e avisa sobre registros já importados).
 */
export function encontrarTransacaoRepetida(
	item: { data: string; valor: number; descricao: string; tipo_transacao?: string },
	existentes: any[],
	cartoesList: any[] = [],
	contasList: any[] = []
): { repetida: boolean; motivo?: string; transacaoOriginal?: any } {
	if (!existentes || existentes.length === 0) return { repetida: false };

	const itemValor = Math.abs(Number(item.valor) || 0);
	if (itemValor === 0) return { repetida: false };

	const normDescItem = normalizeText(item.descricao);

	for (const ex of existentes) {
		const exValor = Math.abs(Number(ex.valor) || 0);
		// 1. Diferença de valor (tolerância de até 0.05 para eventuais centavos/arredondamentos)
		if (Math.abs(itemValor - exValor) > 0.05) continue;

		// 2. Proximidade de data (tolerância de até 3.5 dias para compensação bancária D+1/D+2)
		let diffDias = 999;
		if (item.data && ex.data) {
			const d1 = new Date(item.data.split('T')[0] + "T12:00:00").getTime();
			const d2 = new Date(ex.data.split('T')[0] + "T12:00:00").getTime();
			diffDias = Math.abs((d1 - d2) / (1000 * 60 * 60 * 24));
		}

		if (diffDias > 3.5) continue;

		const normDescEx = normalizeText(ex.descricao);

		// 3. Comparação de descrições
		const matchDesc = normDescItem === normDescEx ||
			(normDescItem.length >= 4 && normDescEx.includes(normDescItem)) ||
			(normDescEx.length >= 4 && normDescItem.includes(normDescEx));

		// Identificação de palavras-chave características
		const isLimiteConvertido = normDescItem.includes("limite convertido") && normDescEx.includes("limite convertido");
		const isRDB = normDescItem.includes("rdb") && normDescEx.includes("rdb");
		const isPix = normDescItem.includes("pix") && normDescEx.includes("pix");

		// Data exata (mesmo dia) e termos em comum
		const mesmaData = diffDias < 1.0;
		const stopWords = new Set(["pelo", "para", "conta", "saldo", "pela", "sobre", "com"]);
		const palavrasItem = normDescItem.split(/\s+/).filter(w => w.length >= 4 && !stopWords.has(w));
		const temTermoComum = palavrasItem.some(w => normDescEx.includes(w));

		if (matchDesc || isLimiteConvertido || isRDB || (mesmaData && temTermoComum) || (mesmaData && palavrasItem.length === 0)) {
			const dataFormatada = ex.data ? ex.data.split('T')[0].split('-').reverse().join('/') : '';
			let origem = ex.tipo === "RECEITA" ? "Receita" : "Gasto";
			if (ex.cartao_id && cartoesList) {
				const c = cartoesList.find(card => card.id === ex.cartao_id);
				origem = c ? `Cartão ${c.nome}` : "Cartão de Crédito";
			} else if (ex.conta_id && contasList) {
				const acc = contasList.find(a => a.id === ex.conta_id);
				origem = acc ? `Conta ${acc.nome}` : "Conta Corrente";
			}

			return {
				repetida: true,
				motivo: `⚠️ Já lançado anteriormente em ${dataFormatada} (${origem} - R$ ${exValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`,
				transacaoOriginal: ex
			};
		}
	}

	return { repetida: false };
}

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
	const [dividasAtivas, setDividasAtivas] = useState<any[]>([]);
	
	const [globalConta, setGlobalConta] = useState("");
	const [globalCartao, setGlobalCartao] = useState("");
	const [globalMetodoPagamento, setGlobalMetodoPagamento] = useState("Débito");
	const [isAddContatoOpen, setIsAddContatoOpen] = useState<string | null>(null);

	// Estados da Camada de IA & Validação
	const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento | null>(null);
	const [confiancaIA, setConfiancaIA] = useState(0);
	const [resumoIA, setResumoIA] = useState("");
	const [dadosExtraidos, setDadosExtraidos] = useState<any>(null);
	const [documentoImportadoId, setDocumentoImportadoId] = useState<string | null>(null);
	const [precisaConfirmacao, setPrecisaConfirmacao] = useState(false);
	const [isDuplicateWarning, setIsDuplicateWarning] = useState(false);
	const [duplicateExistingDoc, setDuplicateExistingDoc] = useState<DocumentoImportado | null>(null);

	const applyGlobalConta = (contaId: string) => {
		setGlobalConta(contaId);
		setPreview(prev => prev.map(item => ({
			...item,
			conta_id: contaId
		})));
	};

	const applyGlobalCartao = (cartaoId: string) => {
		setGlobalCartao(cartaoId);
		setPreview(prev => prev.map(item => ({
			...item,
			cartao_id: cartaoId,
			metodo_pagamento: cartaoId ? "Crédito" : item.metodo_pagamento
		})));
	};

	const [usuarioNome, setUsuarioNome] = useState<string>("");
	const [usuarioCpf, setUsuarioCpf] = useState<string>("");
	const [categorias, setCategorias] = useState<string[]>(CATEGORIAS_PADRAO);

	const adicionarCategoria = async (nome: string) => {
		const limpo = nome.trim();
		if (!limpo) return;
		setCategorias(prev => {
			if (prev.some(c => c.toLowerCase() === limpo.toLowerCase())) return prev;
			return [...prev, limpo];
		});

		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (user) {
				await financeService.addCategoria(user.id, {
					nome: limpo,
					tipo: "DESPESA",
					ativa: true
				});
			}
		} catch (e) {
			console.warn("Não foi possível persistir categoria na tabela:", e);
		}
	};

	const carregarDadosBase = useCallback(async () => {
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
			let nomeUser = user.user_metadata?.display_name || user.user_metadata?.nome || user.user_metadata?.full_name || "";
			let cpfUser = "";

			try {
				const currentUser = await authService.getCurrentUser();
				if (currentUser) {
					if (currentUser.nome && currentUser.nome !== "Usuário") nomeUser = currentUser.nome;
					if (currentUser.cpf) cpfUser = currentUser.cpf;
				}
			} catch (e) {
				console.warn("Erro ao buscar perfil do usuário no authService:", e);
			}

			setUsuarioNome(nomeUser);
			setUsuarioCpf(cpfUser);

			const [dataCartoes, dataContatos, dataGastos, dataMetas, dataContas, dataDividas, dataCategorias] = await Promise.all([
				financeService.getCartoes(user.id),
				supabase.from('contatos').select('*').eq('usuario_id', user.id),
				supabase.from("transacoes").select('id, data, valor, descricao, tipo, cartao_id, conta_id, fatura_id, categoria_id').eq('usuario_id', user.id).order('data', { ascending: false }).limit(1000),
				supabase.from('metas').select('*').eq('usuario_id', user.id),
				supabase.from('contas_bancarias').select('*').eq('usuario_id', user.id),
				supabase.from('dividas').select('*, parcelas_divida(*)').eq('usuario_id', user.id).in('status', ['ativa', 'inadimplente']),
				financeService.getCategorias(user.id).catch(() => [])
			]);

			const nomesDoBanco = (dataCategorias || []).map((c: any) => c.nome);
			const todasCategorias = Array.from(new Set([...CATEGORIAS_PADRAO, ...nomesDoBanco])).filter(Boolean);
			setCategorias(todasCategorias);

			let metasCarregadas = dataMetas.data || [];
			let reserva = metasCarregadas.find(m => /reserva(\s+de)?\s+emerg[eê]ncia|caixinha/i.test(m.titulo));
			if (!reserva) {
				try {
					const hoje = new Date();
					const prazo = new Date(hoje.setFullYear(hoje.getFullYear() + 1)).toISOString().split('T')[0];
					await financeService.addMeta(user.id, {
						titulo: "Reserva de Emergência",
						valor: 10000,
						prazo: prazo,
						debito_automatico: false
					});
					const { data: recarregadas } = await supabase.from('metas').select('*').eq('usuario_id', user.id);
					if (recarregadas && recarregadas.length > 0) {
						metasCarregadas = recarregadas;
					}
				} catch (e) {
					console.warn("Auto-criação de Reserva de Emergência falhou:", e);
				}
			}

			setCartoes(dataCartoes || []);
			setContatos(dataContatos.data || []);
			setGastosExistentes(dataGastos.data || []);
			setMetas(metasCarregadas);
			setContas(dataContas.data || []);
			setDividasAtivas(dataDividas.data || []);
		}
	}, []);

	useEffect(() => {
		carregarDadosBase();
	}, [carregarDadosBase]);

	// Auto-corrige em tempo real transferências próprias, lançamentos de Pix, RDB ou Caixinhas, e detecta duplicatas existentes
	useEffect(() => {
		if (preview.length === 0) return;
		const reserva = metas.find(m => /reserva(\s+de)?\s+emerg[eê]ncia|caixinha/i.test(m.titulo)) || metas[0];

		setPreview(prev => {
			let alterado = false;
			const atualizado = prev.map(item => {
				let desc = item.descricao || "";
				let tipo = item.tipo_transacao;
				let cat = item.categoria;
				let metaId = item.meta_id;
				let ignorar = item.ignorar;
				let ignoredReason = item.ignoredReason;
				let mudouItem = false;

				// 1. Limpeza de Pix longo do Nubank (extrai quem recebeu ou enviou)
				const matchEnv = desc.match(/Transfer[eê]ncia enviada pelo Pix\s*-\s*([^-]+)/i);
				const matchRec = desc.match(/Transfer[eê]ncia recebida pelo Pix\s*-\s*([^-]+)/i);
				if (matchEnv && matchEnv[1]) {
					desc = `Pix Enviado: ${matchEnv[1].trim()}`;
					mudouItem = true;
				} else if (matchRec && matchRec[1]) {
					desc = `Pix Recebido: ${matchRec[1].trim()}`;
					mudouItem = true;
				}

				// 2. Detecção dinâmica de Transferência entre contas próprias para TODOS os usuários
				if (!item.manualOverride) {
					const isClaudiney = desc.toLowerCase().includes("claudiney") || (item.nome_terceiro && item.nome_terceiro.toLowerCase().includes("claudiney"));
					if (isClaudiney) {
						if (tipo === "Transferencia" || cat === "Transferência Interna" || ignorar) {
							tipo = desc.toLowerCase().includes("pix recebido") ? "Entrada" : "Gasto";
							cat = tipo === "Entrada" ? "Pix Recebido" : "Outros";
							ignorar = false;
							ignoredReason = "";
							item.terceiro = true;
							item.nome_terceiro = "Claudiney Jules Claudiano";
							const cClaudiney = contatos.find(c => (c.nome || "").toLowerCase().includes("claudiney"));
							if (cClaudiney) item.contato_id = cClaudiney.id;
							mudouItem = true;
						}
					} else {
						const isTransf = isTransferenciaPropria(desc, item.nome_terceiro, usuarioNome, usuarioCpf);
						if (isTransf && (!ignorar || tipo !== "Transferencia" || cat !== "Transferência Interna" || item.cartao_id || item.metodo_pagamento === "Crédito")) {
							ignorar = true;
							ignoredReason = "Transferência entre contas próprias (Mesmo titular - não altera patrimônio)";
							tipo = "Transferencia";
							cat = "Transferência Interna";
							item.cartao_id = null;
							item.metodo_pagamento = "Débito";
							if (!item.conta_id && contas.length > 0) item.conta_id = contas[0].id;
							mudouItem = true;
						}
					}
				}

				// 3. Aplicação e Resgate RDB / Caixinha
				const descLower = desc.toLowerCase();
				const isAplicacao = (descLower.includes("rdb") && !descLower.includes("resgate")) || descLower.includes("caixinha") || descLower.includes("guardar dinheiro");
				if (isAplicacao && (tipo !== "Meta" || !metaId)) {
					tipo = "Meta";
					cat = "Investimentos";
					if (reserva) metaId = reserva.id;
					mudouItem = true;
				}

				const isResgate = (descLower.includes("rdb") && descLower.includes("resgate")) || descLower.includes("resgate caixinha");
				if (isResgate && tipo !== "Resgate") {
					tipo = "Resgate";
					cat = "Investimentos";
					mudouItem = true;
				}

				// 4. Detecção de Pagamento de Fatura vs Fatura de Cartão / Limite Convertido
				const isPagamentoFatura = descLower.includes("pagamento de fatura") || descLower.includes("pagamento da fatura") || descLower.includes("pgto fatura");
				if (isPagamentoFatura && tipo !== "PagamentoFatura") {
					tipo = "PagamentoFatura";
					cat = "Cartão de Crédito";
					mudouItem = true;
				}

				const isLimiteConvertido = descLower.includes("limite convertido");
				const isExtratoBancario = tipoDocumento === "extrato_bancario";

				const isFaturaItem = !isPagamentoFatura && !isResgate && !isAplicacao && tipo !== "Transferencia" && (
					(!isExtratoBancario && (tipoDocumento === "fatura_cartao" || isLimiteConvertido)) ||
					(item.metodo_pagamento === "Crédito" && !isExtratoBancario) ||
					(Boolean(item.cartao_id) && !isExtratoBancario) ||
					(descLower.includes("fatura") && !isPagamentoFatura && !isExtratoBancario)
				);

				if (isFaturaItem && !item.manualOverride) {
					// Se for fatura de cartão, muda o tipo para Fatura (NUNCA Entrada)
					if (tipo !== "Fatura" && tipo !== "PagamentoFatura") {
						tipo = "Fatura";
						mudouItem = true;
					}
					if (!item.cartao_id && nuCard) {
						item.cartao_id = nuCard.id;
						item.metodo_pagamento = "Crédito";
						item.conta_id = undefined;
						mudouItem = true;
					}
					if (isLimiteConvertido) {
						if (item.tipo !== "AJUSTE") {
							item.tipo = "AJUSTE";
							mudouItem = true;
						}
						if (cat !== "Financiamento / Ajuste de Limite") {
							cat = "Financiamento / Ajuste de Limite";
							mudouItem = true;
						}
					}
				} else if (isExtratoBancario && isLimiteConvertido && !item.manualOverride) {
					if (tipo !== "Entrada") {
						tipo = "Entrada";
						mudouItem = true;
					}
					if (item.tipo !== "AJUSTE") {
						item.tipo = "AJUSTE";
						mudouItem = true;
					}
					if (cat !== "Financiamento / Ajuste de Limite") {
						cat = "Financiamento / Ajuste de Limite";
						mudouItem = true;
					}
				}

				// 5. Verificação em tempo real contra gastosExistentes caso não tenha sido alterado manualmente
				if (!item.manualOverride && !ignorar && gastosExistentes.length > 0) {
					const dup = encontrarTransacaoRepetida(
						{ data: item.data, valor: item.valor, descricao: desc, tipo_transacao: tipo },
						gastosExistentes,
						cartoes,
						contas
					);
					if (dup.repetida) {
						ignorar = true;
						ignoredReason = dup.motivo || "⚠️ Já lançado anteriormente no sistema";
						mudouItem = true;
					}
				}

				if (mudouItem) {
					alterado = true;
					return {
						...item,
						descricao: desc,
						tipo_transacao: tipo,
						categoria: cat,
						meta_id: metaId,
						ignorar,
						ignoredReason
					};
				}
				return item;
			});
			return alterado ? atualizado : prev;
		});
	}, [metas, preview.length, usuarioNome, usuarioCpf, gastosExistentes, cartoes, contas, tipoDocumento]);

	/**
	 * PROCESSAMENTO DO ARQUIVO SEGUINDO A ARQUITETURA EM CAMADAS
	 */
	const processarArquivo = async (droppedFile: File) => {
		setFile(droppedFile);
		setLoading(true);
		setProgress(10);
		setIsDuplicateWarning(false);
		setDuplicateExistingDoc(null);
		setPrecisaConfirmacao(false);
		setDadosExtraidos(null);
		setPreview([]);

		const interval = setInterval(() => {
			setProgress((prev) => {
				if (prev >= 92) {
					clearInterval(interval);
					return 92;
				}
				return prev + Math.floor(Math.random() * 6) + 3;
			});
		}, 200);

		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) throw new Error("Usuário não autenticado. Faça login novamente.");

			// -------------------------------------------------------------
			// CAMADA 1: CALCULAR HASH E VERIFICAR IDEMPOTÊNCIA
			// -------------------------------------------------------------
			const fileHash = await DocumentImportService.calculateFileHash(droppedFile);
			const existingDoc = await DocumentImportService.checkIdempotency(user.id, fileHash);

			if (existingDoc && existingDoc.status === "PROCESSADO") {
				setIsDuplicateWarning(true);
				setDuplicateExistingDoc(existingDoc);
				toast("Aviso: este documento já foi importado anteriormente.", { icon: "⚠️" });
			}

			// Registra o documento com status PROCESSANDO
			const docId = await DocumentImportService.createDocumentRecord({
				usuario_id: user.id,
				nome_arquivo: droppedFile.name,
				hash_arquivo: fileHash,
				tamanho_bytes: droppedFile.size,
				mime_type: droppedFile.type || "application/octet-stream",
				tipo_documento: "outros",
				status: "PROCESSANDO"
			});
			setDocumentoImportadoId(docId);

			// -------------------------------------------------------------
			// CAMADA 2: IA & EXTRAÇÃO ESTRUTURADA (PROIBIDO SQL)
			// -------------------------------------------------------------
			setProgress(40);
			const ext: ExtracaoIAOutput = await DocumentImportService.extractDocumentWithAI(droppedFile);

			setTipoDocumento(ext.tipo_documento);
			setConfiancaIA(ext.confianca);
			setResumoIA(ext.resumo);
			setDadosExtraidos(ext.dados);

			// -------------------------------------------------------------
			// CAMADA 3: VALIDAÇÃO DE SCHEMA
			// -------------------------------------------------------------
			setProgress(70);
			const schemaValidation = DocumentImportService.validateSchema(ext.tipo_documento, ext.dados);
			if (!schemaValidation.valid) {
				if (docId) {
					await DocumentImportService.updateDocumentRecord(docId, {
						status: "ERRO",
						erro: schemaValidation.errors.join("; ")
					});
				}
				throw new Error(`Validação de dados falhou: ${schemaValidation.errors.join(", ")}`);
			}

			// Atualiza documento no banco com dados extraídos
			if (docId) {
				await DocumentImportService.updateDocumentRecord(docId, {
					tipo_documento: ext.tipo_documento,
					confianca: ext.confianca,
					dados_extraidos: { tipo_documento: ext.tipo_documento, dados: ext.dados } as any,
					status: DocumentImportService.requiresUserConfirmation(ext.tipo_documento, ext.confianca) ? "AGUARDANDO_CONFIRMACAO" : "PROCESSANDO"
				});
			}

			// -------------------------------------------------------------
			// CAMADA 4: REGRAS ESPECÍFICAS POR TIPO DE DOCUMENTO
			// -------------------------------------------------------------
			
			// Detecta contas/cartões padrão com base nas informações do arquivo
			const fileNameLower = droppedFile.name.toLowerCase();
			const isSantanderExtrato = (fileNameLower.includes("santander") || fileNameLower.includes("extrato")) && !fileNameLower.includes("fatura");
			if (isSantanderExtrato && ext.tipo_documento === "fatura_cartao") {
				ext.tipo_documento = "extrato_bancario";
				setTipoDocumento("extrato_bancario");
			}

			let detectedContaId = "";
			const santanderConta = contas.find(c => c.nome.toLowerCase().includes("santander") || (c.instituicao && c.instituicao.toLowerCase().includes("santander")));
			const nubankConta = contas.find(c => c.nome.toLowerCase().includes("nubank") || (c.instituicao && c.instituicao.toLowerCase().includes("nubank")));
			
			if (fileNameLower.includes("santander") && santanderConta) detectedContaId = santanderConta.id;
			else if (fileNameLower.includes("nu") && nubankConta) detectedContaId = nubankConta.id;
			else if (contas.length > 0) detectedContaId = contas[0].id;
			
			if (detectedContaId) setGlobalConta(detectedContaId);

			let detectedCartaoId = "";
			if (ext.tipo_documento === "fatura_cartao" && !isSantanderExtrato) {
				const nuCard = cartoes.find(c => c.nome.toLowerCase().includes("nubank"));
				const santanderCard = cartoes.find(c => c.nome.toLowerCase().includes("santander"));
				if (fileNameLower.includes("santander") && santanderCard) detectedCartaoId = santanderCard.id;
				else if (fileNameLower.includes("nu") && nuCard) detectedCartaoId = nuCard.id;
				else if (cartoes.length > 0) detectedCartaoId = cartoes[0].id;
				setGlobalCartao(detectedCartaoId);
			} else {
				setGlobalCartao("");
			}

			// SE FOR EMPRÉSTIMO OU RENEGOCIAÇÃO:
			// Não cria 24 despesas! Exige confirmação de criação de Dívida + Parcelas
			if (ext.tipo_documento === "contrato_emprestimo" || ext.tipo_documento === "contrato_financiamento" || ext.tipo_documento === "renegociacao_cartao") {
				setPrecisaConfirmacao(true);
				clearInterval(interval);
				setProgress(100);
				toast.success(`Identificado: ${ext.resumo}. Por favor, confirme para criar a obrigação financeira.`);
				return;
			}

			// SE FOR COMPROVANTE DE PAGAMENTO:
			if (ext.tipo_documento === "comprovante_pagamento") {
				setPrecisaConfirmacao(true);
				clearInterval(interval);
				setProgress(100);
				toast.success(`Comprovante de pagamento identificado: R$ ${ext.dados?.valor || 0}. Confirme os detalhes.`);
				return;
			}

			// SE FOR EXTRATO BANCÁRIO OU FATURA DE CARTÃO:
			// Popula a lista preview para o usuário auditar item por item
			let rawItems: any[] = [];
			const isFatura = ext.tipo_documento === "fatura_cartao" && !isSantanderExtrato;

			if (ext.tipo_documento === "extrato_bancario" && ext.dados?.transacoes) {
				rawItems = ext.dados.transacoes.map((t: any) => {
					const descLower = (t.descricao || "").toLowerCase();
					const isAplicacaoRDB = (descLower.includes("rdb") && !descLower.includes("resgate")) ||
					                       descLower.includes("caixinha") ||
					                       descLower.includes("guardar dinheiro") ||
					                       t.tipo === "INVESTIMENTO" ||
					                       t.tipo === "APORTE" ||
					                       t.subtipo === "APLICACAO_RDB";

					const isResgateRDB = (descLower.includes("rdb") && descLower.includes("resgate")) ||
					                     descLower.includes("resgate caixinha") ||
					                     t.tipo === "RESGATE" ||
					                     t.subtipo === "RESGATE_RDB";

					const isPagamentoFatura = descLower.includes("pagamento de fatura") ||
					                          descLower.includes("pagamento da fatura") ||
					                          descLower.includes("pgto fatura") ||
					                          t.tipo === "PAGAMENTO_FATURA" ||
					                          t.subtipo === "PAGAMENTO_FATURA";

					const isLimiteConvertido = descLower.includes("limite convertido") || t.subtipo === "CONVERSAO_LIMITE_CARTAO";

					let tipoTransacao: TransacaoPreview['tipo_transacao'] = "Gasto";
					const isTransfBanco = (t.tipo === "TRANSFERENCIA" || t.subtipo === "TRANSFERENCIA_PROPRIA") && !descLower.includes("claudiney") && !(t.favorecido && t.favorecido.toLowerCase().includes("claudiney"));
					if (isTransfBanco) tipoTransacao = "Transferencia";
					else if (isAplicacaoRDB) tipoTransacao = "Meta";
					else if (isResgateRDB) tipoTransacao = "Resgate";
					else if (isPagamentoFatura) tipoTransacao = "PagamentoFatura";
					else if (isLimiteConvertido) tipoTransacao = "Entrada";
					else if (t.tipo === "RECEITA" || descLower.includes("pix recebido")) tipoTransacao = "Entrada";
					else tipoTransacao = "Gasto";

					return {
						...t,
						tipo_transacao: tipoTransacao,
						metodo_pagamento: "Débito",
						conta_id: detectedContaId,
						cartao_id: null,
						categoria_sugerida: isLimiteConvertido ? "Financiamento / Ajuste de Limite" : t.categoria_sugerida
					};
				});
			} else if (isFatura) {
				const faturaItens = (ext.dados?.itens || [])
					.filter((t: any) => {
						const desc = (t.descricao || "").toLowerCase();
						const rawVal = Number(t.valor) || 0;
						if (rawVal < 0 || desc.includes("desconto") || desc.includes("pagamento recebido")) return false;
						return true;
					})
					.map((t: any) => {
						const isLimite = t.natureza === "LIMITE_CONVERTIDO" || (t.descricao && /limite\s+convertido/i.test(t.descricao));
						return {
							...t,
							tipo_transacao: "Fatura",
							metodo_pagamento: "Crédito",
							conta_id: null,
							cartao_id: detectedCartaoId,
							tipo: isLimite ? "AJUSTE" : (t.tipo || "DESPESA"),
							categoria_sugerida: isLimite ? "Financiamento / Ajuste de Limite" : (t.categoria_sugerida || "Outros")
						};
					});

				const faturaPagamentos = (ext.dados?.pagamentos || []).map((p: any) => ({
					...p,
					tipo_transacao: "PagamentoFatura",
					metodo_pagamento: "Débito",
					cartao_id: detectedCartaoId,
					conta_id: detectedContaId || null,
					categoria: "Pagamento de Fatura",
					classificacao: "Pagamento",
					tipo: "PAGAMENTO_FATURA",
					parcela_atual: 1,
					total_parcelas: 1,
					terceiro: false,
					contato_id: ""
				}));

				rawItems = [...faturaItens, ...faturaPagamentos];
			}

			// Localiza ou cria automaticamente a meta 'Reserva de Emergência' se houver aplicações RDB
			let metaReserva = metas.find(m => /reserva(\s+de)?\s+emerg[eê]ncia|caixinha(\s+reserva)?/i.test(m.titulo));
			const temAplicacaoRdb = rawItems.some(item => 
				item.tipo_transacao === "Meta" || 
				(item.descricao && item.descricao.toLowerCase().includes("rdb") && !item.descricao.toLowerCase().includes("resgate"))
			);

			if (temAplicacaoRdb && !metaReserva) {
				try {
					const { data: { user } } = await supabase.auth.getUser();
					if (user) {
						const hoje = new Date();
						const prazo = new Date(hoje.setFullYear(hoje.getFullYear() + 1)).toISOString().split('T')[0];
						const { data: novaMeta, error: errMeta } = await supabase
							.from("metas")
							.insert([{
								usuario_id: user.id,
								titulo: "Reserva de Emergência",
								valor: 10000,
								prazo: prazo,
								debito_automatico: false
							}])
							.select()
							.single();

						if (!errMeta && novaMeta) {
							metaReserva = novaMeta;
							setMetas(prev => [...prev, novaMeta]);
						}
					}
				} catch (e) {
					console.warn("Não foi possível criar meta Reserva de Emergência automaticamente:", e);
				}
			}

			let nomeUserAtual = usuarioNome;
			let cpfUserAtual = usuarioCpf;
			if (user && !nomeUserAtual) {
				try {
					const currentUser = await authService.getCurrentUser();
					if (currentUser) {
						if (currentUser.nome && currentUser.nome !== "Usuário") nomeUserAtual = currentUser.nome;
						if (currentUser.cpf) cpfUserAtual = currentUser.cpf;
					}
				} catch (e) {}
			}

			const processados: TransacaoPreview[] = rawItems.map((t: any, index: number) => {
				const isGasto = t.tipo_transacao === "Gasto";
				let cleanDesc = (t.descricao || "").trim();
				let favorecido = (t.favorecido || "").trim();

				// Extrai favorecido de padrões comuns de extratos (ex: Nubank "Transferência enviada pelo Pix - NOME - CPF")
				const matchEnv = cleanDesc.match(/Transfer[eê]ncia enviada pelo Pix\s*-\s*([^-]+)/i);
				const matchRec = cleanDesc.match(/Transfer[eê]ncia recebida pelo Pix\s*-\s*([^-]+)/i);

				if (matchEnv && matchEnv[1]) {
					favorecido = matchEnv[1].trim();
					cleanDesc = `Pix Enviado: ${favorecido}`;
				} else if (matchRec && matchRec[1]) {
					favorecido = matchRec[1].trim();
					cleanDesc = `Pix Recebido: ${favorecido}`;
				}

				const isDescGenerica = !cleanDesc || /^(pix|pix recebido|pix enviado|transfer[eê]ncia|transfer[eê]ncia enviada|transfer[eê]ncia enviada pelo pix|transfer[eê]ncia recebida|transfer[eê]ncia recebida pelo pix|ted|doc|compra no d[eé]bito)$/i.test(cleanDesc.trim());

				if (favorecido) {
					if (isDescGenerica) {
						cleanDesc = t.tipo_transacao === "Entrada" ? `Pix Recebido: ${favorecido}` : `Pix Enviado: ${favorecido}`;
					} else if (!cleanDesc.toLowerCase().includes(favorecido.toLowerCase())) {
						cleanDesc = `${cleanDesc} - ${favorecido}`;
					}
				}

				const isClaudiney = (cleanDesc || "").toLowerCase().includes("claudiney") || (favorecido || "").toLowerCase().includes("claudiney");
				const contatoClaudiney = isClaudiney ? contatos.find(c => (c.nome || "").toLowerCase().includes("claudiney")) : null;

				// Verifica transferência própria para TODOS os usuários do sistema (Ana Letícia titular)
				const isTransfPropria = !isClaudiney && (
					isTransferenciaPropria(cleanDesc, favorecido, nomeUserAtual, cpfUserAtual, ext.dados?.titular) ||
					((t.subtipo === "TRANSFERENCIA_PROPRIA" || t.tipo === "TRANSFERENCIA") && (cleanDesc.toLowerCase().includes("ana") || favorecido.toLowerCase().includes("ana"))) ||
					/mesma\s+titularidade|contas?\s+pr[oó]prias?/i.test(cleanDesc)
				);

				const descLower = cleanDesc.toLowerCase();
				const isAplicacao = t.tipo_transacao === "Meta" || 
				                    (descLower.includes("rdb") && !descLower.includes("resgate")) ||
				                    descLower.includes("caixinha") ||
				                    t.subtipo === "APLICACAO_RDB";

				const isLimiteConvertido = descLower.includes("limite convertido") || t.subtipo === "CONVERSAO_LIMITE_CARTAO";
				const isExtratoBancario = tipoDocumento === "extrato_bancario";
				const isFaturaItem = !isExtratoBancario && (
					isFatura || 
					Boolean(t.cartao_id) || 
					t.tipo_transacao === "Fatura" ||
					isLimiteConvertido
				);

				let tipoFinal: 'Gasto' | 'Entrada' | 'Meta' | 'PagamentoFatura' | 'Transferencia' | 'Fatura';
				if (isClaudiney) {
					tipoFinal = descLower.includes("pix recebido") || t.tipo === "RECEITA" ? "Entrada" : "Gasto";
				} else if (isTransfPropria) {
					tipoFinal = "Transferencia";
				} else if (isAplicacao) {
					tipoFinal = "Meta";
				} else if (t.tipo_transacao === "PagamentoFatura") {
					tipoFinal = "PagamentoFatura";
				} else if (isExtratoBancario && isLimiteConvertido) {
					tipoFinal = "Entrada";
				} else if (isFaturaItem) {
					tipoFinal = "Fatura";
				} else {
					tipoFinal = t.tipo_transacao || "Gasto";
				}

				let categoriaFinal = isClaudiney
					? (tipoFinal === "Entrada" ? "Pix Recebido" : (t.categoria_sugerida && t.categoria_sugerida !== "Transferência Interna" ? t.categoria_sugerida : "Outros"))
					: (isTransfPropria
						? "Transferência Interna"
						: (isAplicacao 
							? "Investimentos" 
							: (isLimiteConvertido ? "Financiamento / Ajuste de Limite" : (CATEGORIAS_PADRAO.includes(t.categoria_sugerida) ? t.categoria_sugerida : "Outros"))));

				const metaIdFinal = isAplicacao ? (t.meta_id || metaReserva?.id || (metas[0]?.id || "")) : (t.meta_id || "");

				// Deduplicação Inteligente: cruza com lançamentos já existentes no banco do usuário
				const dup = encontrarTransacaoRepetida(
					{ data: t.data, valor: parseFloat(t.valor) || 0, descricao: cleanDesc, tipo_transacao: tipoFinal },
					gastosExistentes,
					cartoes,
					contas
				);

				const deveIgnorar = isClaudiney ? false : (isTransfPropria || dup.repetida);
				const motivoIgnorar = isClaudiney 
					? "" 
					: (isTransfPropria 
						? "Transferência entre contas próprias (Mesmo titular - não altera patrimônio)" 
						: (dup.repetida ? dup.motivo : ""));

				const cartaoIdFinal = (isFatura || tipoFinal === "Fatura") ? (t.cartao_id || detectedCartaoId || cartoes[0]?.id || null) : null;
				const contaIdFinal = (isFatura || tipoFinal === "Fatura") ? null : (t.conta_id || detectedContaId || null);

				const matchParc = (cleanDesc || "").match(/(?:[-–—]?\s*(?:parcela|parc\.?)?\s*\(?(\d{1,2})\s*[/]\s*(\d{1,2})\)?)|(?:(\d{1,2})\s+de\s+(\d{1,2}))/i);
				let detectedParcelaAtual = t.parcela_atual;
				let detectedTotalParcelas = t.total_parcelas;

				if ((!detectedTotalParcelas || detectedTotalParcelas <= 1) && matchParc) {
					detectedParcelaAtual = parseInt(matchParc[1] || matchParc[3]) || 1;
					detectedTotalParcelas = parseInt(matchParc[2] || matchParc[4]) || 1;
				}

				const isGastoFinal = tipoFinal === "Gasto";
				const terceiroFinal = isClaudiney ? true : (isGastoFinal ? (t.terceiro || false) : false);
				const contatoIdFinal = isClaudiney && contatoClaudiney ? contatoClaudiney.id : (t.contato_id || "");
				const nomeTerceiroFinal = isClaudiney 
					? (contatoClaudiney ? contatoClaudiney.nome : (favorecido || "Claudiney Jules Claudiano"))
					: (t.nome_terceiro || favorecido || "");

				return {
					id: Date.now() + index.toString(),
					data: t.data || new Date().toISOString().split('T')[0],
					descricao: cleanDesc || (tipoFinal === "Entrada" ? "Pix Recebido" : tipoFinal === "Meta" ? "Aplicação RDB" : tipoFinal === "Transferencia" ? "Transferência Própria" : tipoFinal === "Fatura" ? "Compra no Cartão" : "Pix Enviado"),
					valor: parseFloat(t.valor) || 0,
					tipo_transacao: tipoFinal,
					categoria: categoriaFinal,
					meta_id: metaIdFinal,
					parcela_atual: detectedParcelaAtual || 1,
					total_parcelas: detectedTotalParcelas || 1,
					terceiro: terceiroFinal,
					contato_id: contatoIdFinal,
					nome_terceiro: nomeTerceiroFinal,
					cartao_id: cartaoIdFinal,
					conta_id: contaIdFinal,
					metodo_pagamento: (isFatura || tipoFinal === "Fatura") ? "Crédito" : "Débito",
					ignorar: deveIgnorar,
					ignoredReason: motivoIgnorar || "",
					classificacao: isLimiteConvertido ? "Ajuste" : "Variável",
					tipo: isLimiteConvertido ? "AJUSTE" : (t.tipo || (tipoFinal === "Entrada" ? "RECEITA" : "DESPESA")),
					documento_importado_id: docId || undefined
				};
			});

			const conciliados = executarConciliacao(processados, contatos);
			setPreview(conciliados);
			clearInterval(interval);
			setProgress(100);

			const repetidosCount = conciliados.filter(p => p.ignoredReason?.startsWith("⚠️")).length;
			if (repetidosCount > 0) {
				toast.success(`${conciliados.length} lançamentos processados (${repetidosCount} já cadastrados anteriormente no seu histórico e marcados para não duplicar).`, { duration: 6000 });
			} else {
				toast.success(`${conciliados.length} lançamentos estruturados com sucesso pela IA!`);
			}
		} catch (error: any) {
			clearInterval(interval);
			console.error(error);
			toast.error("Erro no processamento do documento: " + (error.message || error));
			setFile(null);
		} finally {
			clearInterval(interval);
			setLoading(false);
		}
	};

	const updateItem = (id: string, field: string, value: any) => {
		setPreview(prev => {
			const updated = prev.map(p => {
				if (p.id !== id) return p;
				const next = { ...p, [field]: value };
				if (field === "tipo_transacao" && value === "Meta" && !next.meta_id) {
					const reserva = metas.find(m => /reserva(\s+de)?\s+emerg[eê]ncia|caixinha/i.test(m.titulo)) || metas[0];
					if (reserva) next.meta_id = reserva.id;
				}
				if (field === "ignorar" && value === false) {
					next.manualOverride = true;
					next.ignoredReason = "";
				}
				return next;
			});
			return executarConciliacao(updated, contatos);
		});
	};

	const removeItem = (id: string) => {
		setPreview(prev => prev.filter(p => p.id !== id));
	};

	/**
	 * CONFIRMAR OPERAÇÃO ESPECIAL (EMPRÉSTIMO, RENEGOCIAÇÃO, COMPROVANTE)
	 */
	const confirmarOperacaoEspecial = async (payloadCustom?: any) => {
		if (!tipoDocumento || !dadosExtraidos) return;

		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) throw new Error("Usuário não autenticado.");

			const dadosParaPersistir = payloadCustom || dadosExtraidos;

			const resultado = await DocumentImportService.persistToDomain({
				usuario_id: user.id,
				tipo_documento: tipoDocumento,
				dados: dadosParaPersistir,
				documento_importado_id: documentoImportadoId || undefined,
				contexto: {
					conta_id: globalConta || undefined,
					cartao_id: globalCartao || undefined,
					fatura_origem_id: payloadCustom?.fatura_origem_id || undefined,
					divida_id: payloadCustom?.divida_id || undefined,
					parcela_id: payloadCustom?.parcela_id || undefined
				}
			});

			if (documentoImportadoId) {
				await DocumentImportService.updateDocumentRecord(documentoImportadoId, {
					status: "PROCESSADO",
					processado_em: new Date().toISOString(),
					resultado_importacao: resultado
				});
			}

			toast.success(resultado.mensagem);
			await carregarDadosBase();
			resetImport();
		} catch (error: any) {
			console.error("Erro ao confirmar operação:", error);
			toast.error("Erro ao salvar operação: " + (error.message || error));
		} finally {
			setLoading(false);
		}
	};

	const cancelarOperacaoEspecial = () => {
		resetImport();
		toast("Importação cancelada.");
	};

	/**
	 * SALVAR TODOS OS ITENS AUDITADOS DA TABELA (EXTRATO OU FATURA)
	 */
	const handleSaveAll = async () => {
		const itemsToSave = preview.filter(p => !p.ignorar);
		if (itemsToSave.length === 0) {
			toast.error("Nenhum lançamento novo para salvar.");
			return;
		}

		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) throw new Error("Usuário não autenticado");

			let importados = 0;

			// 1. Entradas (Receitas ou Ajustes)
			const entradas = itemsToSave.filter(i => i.tipo_transacao === "Entrada");
			for (const item of entradas) {
				const isLimite = item.tipo === "AJUSTE" || (item.descricao && /limite\s+convertido/i.test(item.descricao));
				const txTipo = isLimite ? "AJUSTE" : "RECEITA";
				const txCat = isLimite ? "Financiamento / Ajuste de Limite" : (item.categoria || "Outros");

				// Mapeia categoria_id existente ou cria uma se necessário
				let categoriaId: string | null = null;
				if (txCat) {
					const { data: cat } = await supabase
						.from("categorias")
						.select("id")
						.eq("usuario_id", user.id)
						.ilike("nome", txCat.trim())
						.maybeSingle();
					if (cat) {
						categoriaId = cat.id;
					} else {
						const { data: novaCat } = await supabase
							.from("categorias")
							.insert([{
								usuario_id: user.id,
								nome: txCat.trim(),
								tipo: "RECEITA",
								ativa: true,
								cor_hex: "#10B981"
							}])
							.select("id")
							.maybeSingle();
						if (novaCat) categoriaId = novaCat.id;
					}
				}

				const contaIdFinal = item.conta_id || globalConta || (contas.length > 0 ? contas[0].id : null);

				const { data: tx, error } = await supabase
					.from("transacoes")
					.insert([{
						usuario_id: user.id,
						tipo: txTipo,
						categoria_id: categoriaId,
						descricao: item.descricao,
						valor: item.valor,
						data: item.data,
						conta_id: contaIdFinal,
						documento_importado_id: documentoImportadoId || null,
						status: "confirmada",
						observacao: `Categoria: ${txCat}`
					}])
					.select()
					.single();

				if (error) {
					console.error("Erro ao salvar entrada:", error);
					throw error;
				}

				if (tx) {
					importados++;
					if (tx.conta_id) {
						await supabase.from("movimentacoes").insert([{
							usuario_id: user.id,
							transacao_id: tx.id,
							conta_id: tx.conta_id,
							tipo: "ENTRADA",
							valor: tx.valor,
							data: tx.data
						}]);
					}
				}
			}

			// 2. Gastos e Lançamentos de Fatura de Cartão
			const gastos = itemsToSave.filter(i => i.tipo_transacao === "Gasto" || i.tipo_transacao === "Fatura");
			for (const item of gastos) {
				const isFaturaTrans = item.tipo_transacao === "Fatura" || item.metodo_pagamento === "Crédito" || Boolean(item.cartao_id);
				const isLimite = item.tipo === "AJUSTE" || (item.descricao && /limite\s+convertido/i.test(item.descricao));
				const finalTipo = isLimite ? "AJUSTE" : (item.tipo || "DESPESA");
				const finalCat = isLimite ? "Financiamento / Ajuste de Limite" : item.categoria;

				await financeService.addGasto(user.id, {
					descricao: item.descricao,
					valor: item.valor,
					data: item.data,
					categoria: finalCat,
					classificacao: isLimite ? "Ajuste" : item.classificacao,
					tipo: finalTipo,
					metodo_pagamento: isFaturaTrans ? "Crédito" : (item.metodo_pagamento || "Débito"),
					cartao_id: item.cartao_id || (isFaturaTrans ? (globalCartao || cartoes[0]?.id) : null),
					conta_id: isFaturaTrans ? null : (item.conta_id || globalConta || null),
					parcelas: item.total_parcelas.toString(),
					parcela_atual: item.parcela_atual,
					total_parcelas: item.total_parcelas,
					terceiro: item.terceiro,
					contato_id: item.contato_id || null,
					terceiro_pago: item.terceiro_pago || false,
					observacao: item.observacao || null,
					valor_ja_dividido: true,
					documento_importado_id: documentoImportadoId || null
				});
				importados++;
			}

			// 3. Metas / Aplicações em RDB / Caixinhas (Movimentação Patrimonial - NÃO é despesa)
			const metasItems = itemsToSave.filter(i => i.tipo_transacao === "Meta");
			for (const item of metasItems) {
				let targetMetaId = item.meta_id;
				if (!targetMetaId) {
					let metaReserva = metas.find(m => /reserva(\s+de)?\s+emerg[eê]ncia|caixinha/i.test(m.titulo)) || metas[0];
					if (!metaReserva) {
						const hoje = new Date();
						const prazo = new Date(hoje.setFullYear(hoje.getFullYear() + 1)).toISOString().split('T')[0];
						const { data: novaMeta } = await supabase.from("metas").insert([{
							usuario_id: user.id,
							titulo: "Reserva de Emergência",
							valor: 10000,
							prazo: prazo,
							debito_automatico: false
						}]).select().single();
						if (novaMeta) {
							metaReserva = novaMeta;
							setMetas(prev => [...prev, novaMeta]);
						}
					}
					targetMetaId = metaReserva?.id;
				}

				await financeService.processAporteInvestimento(user.id, {
					conta_id: item.conta_id || globalConta || null,
					valor: item.valor,
					data: item.data,
					descricao: item.descricao || "Aplicação RDB / Caixinha",
					meta_id: targetMetaId || null,
					instituicao: "Nubank",
					documento_importado_id: documentoImportadoId || null
				});
				importados++;
			}

			// 4. Resgates de RDB / Caixinhas (Retorno de Patrimônio - NÃO é receita operacional)
			const resgatesItems = itemsToSave.filter(i => i.tipo_transacao === "Resgate");
			for (const item of resgatesItems) {
				let targetMetaId = item.meta_id;
				if (!targetMetaId) {
					let metaReserva = metas.find(m => /reserva(\s+de)?\s+emerg[eê]ncia|caixinha/i.test(m.titulo)) || metas[0];
					targetMetaId = metaReserva?.id;
				}

				await financeService.processResgateInvestimento(user.id, {
					conta_id: item.conta_id || globalConta || null,
					valor: item.valor,
					data: item.data,
					descricao: item.descricao || "Resgate RDB / Caixinha",
					principal: (item as any).principal || null,
					rendimento: (item as any).rendimento || null,
					instituicao: "Nubank",
					meta_id: targetMetaId || null,
					documento_importado_id: documentoImportadoId || null
				});
				importados++;
			}

			// 5. Pagamentos de Fatura de Cartão (Quitação de Obrigação - NÃO é despesa de consumo duplicada)
			const faturasItems = itemsToSave.filter(i => i.tipo_transacao === "PagamentoFatura");
			for (const item of faturasItems) {
				await financeService.processPagamentoFatura(user.id, {
					conta_id: item.conta_id || globalConta || null,
					cartao_id: item.cartao_id || null,
					valor: item.valor,
					data: item.data,
					descricao: item.descricao || "Pagamento de Fatura",
					documento_importado_id: documentoImportadoId || null
				});
				importados++;
			}

			// 5. Transferências Internas (se não foram ignoradas pelo usuário)
			const transferencias = itemsToSave.filter(i => i.tipo_transacao === "Transferencia");
			for (const item of transferencias) {
				const { data: tx, error: txErr } = await supabase
					.from("transacoes")
					.insert([{
						usuario_id: user.id,
						tipo: "TRANSFERENCIA",
						descricao: item.descricao || "Transferência entre contas próprias",
						valor: item.valor,
						data: item.data,
						conta_id: item.conta_id || globalConta || null,
						documento_importado_id: documentoImportadoId || null,
						status: "confirmada"
					}])
					.select()
					.single();

				if (!txErr && tx && tx.conta_id) {
					await supabase.from("movimentacoes").insert([{
						usuario_id: user.id,
						transacao_id: tx.id,
						conta_id: tx.conta_id,
						tipo: "SAIDA",
						valor: tx.valor,
						data: tx.data
					}]);
				}
				importados++;
			}

			// Atualiza documento_importado se existir
			if (documentoImportadoId) {
				await DocumentImportService.updateDocumentRecord(documentoImportadoId, {
					status: "PROCESSADO",
					processado_em: new Date().toISOString(),
					resultado_importacao: { total_importados: importados }
				});
			}

			await financeService.syncMetasInvestimentos(user.id).catch(() => {});
			toast.success(`${importados} lançamentos importados com sucesso!`);
			await carregarDadosBase();
			resetImport();
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
		setTipoDocumento(null);
		setConfiancaIA(0);
		setResumoIA("");
		setDadosExtraidos(null);
		setPrecisaConfirmacao(false);
		setIsDuplicateWarning(false);
		setDuplicateExistingDoc(null);
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
				dividasAtivas,
				globalConta,
				globalCartao,
				globalMetodoPagamento,
				dragActive,
				isAddContatoOpen,
				tipoDocumento,
				confiancaIA,
				resumoIA,
				dadosExtraidos,
				documentoImportadoId,
				precisaConfirmacao,
				isDuplicateWarning,
				duplicateExistingDoc,
				usuarioNome,
				usuarioCpf,
				categorias,
				adicionarCategoria,
				setFile,
				setPreview,
				setLoading,
				setProgress,
				setGlobalConta,
				setGlobalCartao,
				setGlobalMetodoPagamento,
				applyGlobalConta,
				applyGlobalCartao,
				setDragActive,
				setIsAddContatoOpen,
				carregarDadosBase,
				processarArquivo,
				updateItem,
				removeItem,
				handleSaveAll,
				confirmarOperacaoEspecial,
				cancelarOperacaoEspecial,
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
