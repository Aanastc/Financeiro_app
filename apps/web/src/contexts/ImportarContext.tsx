import { inserirMovimentacoes, moedasDasContas } from "../../../../packages/services/finance.service";
import { moedaService, ehReal, MOEDAS, formatarMoeda } from "../../../../packages/services/moeda.service";
import { minhasEmpresas, registrarRetirada, classificarComoRetirada } from "../../../../packages/services/empresa.service";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { financeService } from "../../../../packages/services/finance.service";
import { authService } from "../../../../packages/services/auth.service";
import { supabase } from "../../../../packages/services/supabase";
import { DocumentImportService } from "../../../../packages/services/document-import.service";
import type { 
  TipoDocumento, 
  DocumentoImportado,
  ExtracaoIAOutput
} from "../../../../packages/services/document-import.types";
import { toast } from "react-hot-toast";
import {
	detectarInstituicao,
	encontrarPorInstituicao,
	nomeArquivoIndicaExtrato,
} from "../../../../packages/utils/instituicoes";
import { ehAplicacaoInvestimento, ehResgateInvestimento } from "../../../../packages/utils/investimentos";
import { lerParcelaDaDescricao } from "../../../../packages/utils/parcelas";
import { regraDaEmpresa } from "../lib/pj/regrasImportacao";
import {
	lerTextoSePlano,
	lerCabecalhoConta,
	contaPeloCabecalho,
	contaLembrada,
	lembrarContaDoCabecalho,
	saldoFinalDoExtrato,
	type CabecalhoConta,
	type SaldoDoExtrato,
} from "../lib/extratoCabecalho";

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
	cartao_id?: string | null;
	ignorar: boolean;
	ignoredReason: string;
	terceiro_pago?: boolean;
	vinculo_id?: string;
	nome_terceiro?: string;
	observacao?: string;
	metodo_pagamento?: string;
	conta_id?: string;
	conta_destino_id?: string;
	documento_importado_id?: string;
	manualOverride?: boolean;
	principal?: number;
	rendimento?: number;
	/** Transferência: o dinheiro ENTROU ou SAIU da conta do extrato */
	sentido?: "ENTRADA" | "SAIDA";
	/** Conta em outra moeda: valor no extrato (moeda da conta) e cotação usada */
	valor_original?: number;
	moeda?: string;
	cotacao?: number;
	/** Em qual saldo da conta a linha cai (moeda do extrato; ex.: CAD dentro da Wise) */
	moeda_mov?: string;
	/** Conversão de moeda dentro da mesma conta (Wise "To CAD"): moeda e valor que entraram */
	moeda_destino?: string;
	valor_destino?: number;
	/** Débito de parcela de empréstimo: dívida que ele paga (baixa a próxima parcela em aberto) */
	divida_id?: string;
}

const CODIGOS_MOEDA = new Set(MOEDAS.map((m) => m.codigo));

/** Linha de conversão de moeda dentro da mesma conta? ("To CAD", "Convertido para USD", "BRL → CAD") */
export function conversaoDeMoeda(t: any, descricao: string, moedaExtrato?: string): { moeda_destino: string; valor_destino?: number } | null {
	const daIa = String(t?.moeda_destino || "").toUpperCase();
	const valorIa = Number(t?.valor_destino) > 0 ? Number(t.valor_destino) : undefined;
	if (CODIGOS_MOEDA.has(daIa) && daIa !== moedaExtrato) return { moeda_destino: daIa, valor_destino: valorIa };
	const texto = `${t?.descricao || ""} ${descricao || ""}`;
	const m = texto.match(/(?:^|\s)(?:[Tt]o|[Pp]ara|[Ee]m|[Ii]nto|→|->)\s+([A-Z]{3})\b/) || texto.match(/\bconver\w*\s+(?:de\s+|from\s+)?[A-Z]{3}\s+(?:para|to|em|→|->)\s+([A-Z]{3})\b/i);
	const codigo = m ? m[1].toUpperCase() : "";
	if (CODIGOS_MOEDA.has(codigo) && codigo !== moedaExtrato) return { moeda_destino: codigo, valor_destino: valorIa };
	return null;
}

/** Entrou ou saiu? Usa o que a IA disser, o sinal do valor ou a descrição. */
export function sentidoDaTransferencia(t: any, descricao: string): "ENTRADA" | "SAIDA" {
	const s = String(t?.sentido || "").toUpperCase();
	if (s === "ENTRADA" || s === "SAIDA") return s;
	if (Number(t?.valor) < 0) return "SAIDA";
	const d = (descricao || "").toLowerCase();
	if (/receb|entrada|cr[eé]dito em conta|dep[oó]sito|received|added|from |deposit|top.?up/.test(d)) return "ENTRADA";
	if (/envi|sa[ií]da|convers[aã]o|saque|pagamento|d[eé]bito|sent|moved|to [a-z]{3}\b|return|withdraw|convert/.test(d)) return "SAIDA";
	return t?.tipo === "RECEITA" ? "ENTRADA" : "SAIDA";
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
	"Impostos e Tarifas",
	"Juros e Encargos",
	"Tarifas Bancárias",
	"Cartão de Crédito",
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
	/** Saldo que o próprio extrato mostra no fim (coluna "Saldo" do CSV / OFX) */
	saldoExtrato: SaldoDoExtrato | null;
	ajustarSaldoAoSalvar: boolean;
	setAjustarSaldoAoSalvar: React.Dispatch<React.SetStateAction<boolean>>;
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
 * Dedução contábil determinística de categorias e tipos essenciais
 * (IOF, Juros de Limite/Cheque Especial, Tarifas Bancárias, Pagamento de Fatura)
 */
export function inferDeterministicContabil(descricao: string, _tipo?: string): { categoria?: string; tipo_transacao?: TransacaoPreview['tipo_transacao'] } | null {
	// Sem acento: "Pagamento cartão" e "Pagamento cartao" precisam cair na mesma regra
	const descUpper = normalizeText(descricao || "").toUpperCase().replace(/\s+/g, " ");
	// Devolução/estorno de parcela de empréstimo: dinheiro que o banco devolveu (não é receita)
	if (/(DEVOLUCAO|ESTORNO|RESTITUICAO).*(CONSIGNADO|EMPRESTIMO|PARCELA CRED|CRED CONSIG)/.test(descUpper)) {
		return { categoria: "Empréstimo", tipo_transacao: "Entrada" };
	}
	// Parcela de empréstimo / consignado / financiamento debitada na conta
	if (/\b(EMPRESTIMO|CONSIGNADO|FINANCIAMENTO)\b/.test(descUpper) && !/(LIBERACAO|CREDITO DE EMPRESTIMO|EMPRESTIMO CONTRATADO|DEPOSITO)/.test(descUpper)) {
		return { categoria: "Empréstimo", tipo_transacao: "Gasto" };
	}
	if (
		descUpper.includes("LIQUIDO DE VENCIMENTO") || 
		descUpper.includes("LÍQUIDO DE VENCIMENTO") || 
		descUpper.includes("LIQ. VENCIMENTO") || 
		descUpper.includes("LIQ VENCIMENTO") || 
		descUpper.includes("LIQUIDACAO DE VENCIMENTO") || 
		descUpper.includes("LIQUIDAÇÃO DE VENCIMENTO") || 
		descUpper.includes("IQUIDACAO DE VENCIMENTO") || 
		descUpper.includes("IQUIDAÇÃO DE VENCIMENTO") || 
		descUpper.includes("CREDITO SALARIO") || 
		descUpper.includes("CRÉDITO SALÁRIO") || 
		descUpper.includes("CRED SALARIO") || 
		descUpper.includes("FOLHA DE PAGAMENTO") || 
		descUpper.includes("PROVENTOS") || 
		descUpper.includes("HOLERITE") || 
		descUpper.includes("PAGTO SALARIO")
	) {
		return { categoria: "Salário", tipo_transacao: "Entrada" };
	}
	if (descUpper.includes("IOF") || descUpper.includes("IRRF") || descUpper.includes("IMPOSTO OPERA")) {
		return { categoria: "Impostos e Tarifas", tipo_transacao: "Gasto" };
	}
	if (descUpper.includes("JUROS SALDO UTILIZ") || descUpper.includes("LIMITE DA CONTA") || descUpper.includes("CHEQUE ESPECIAL") || descUpper.includes("JUROS UTILIZADO") || descUpper.includes("ENCARGOS CONTA")) {
		return { categoria: "Juros e Encargos", tipo_transacao: "Gasto" };
	}
	if (descUpper.includes("TARIFA") || descUpper.includes("MANUTENCAO DE CONTA") || descUpper.includes("PACOTE DE SERVICOS")) {
		return { categoria: "Tarifas Bancárias", tipo_transacao: "Gasto" };
	}
	if (descUpper.includes("PAGAMENTO FATURA") || descUpper.includes("PAGAMENTO DA FATURA") || descUpper.includes("PGTO FATURA") || descUpper.includes("PAG FATURA") || descUpper.includes("PAGAMENTO CARTAO") || descUpper.includes("PGTO CARTAO") || descUpper.includes("PAGAMENTO DE CARTAO")) {
		return { categoria: "Cartão de Crédito", tipo_transacao: "PagamentoFatura" };
	}
	if (
		descUpper.includes("RENEGOCIACAO") ||
		descUpper.includes("RENEGOCIAÇÃO") ||
		descUpper.includes("PARCELAMENTO DE FATURA") ||
		descUpper.includes("PARCELAMENTO FACIL") ||
		descUpper.includes("PARCELAMENTO FÁCIL") ||
		(descUpper.includes("8282") && descUpper.includes("PARCELA")) ||
		(descUpper.includes("FISICO") && descUpper.includes("PARCELA"))
	) {
		return { categoria: "Renegociação de Cartão", tipo_transacao: "Fatura" };
	}
	return null;
}

/**
 * Aprendizado por histórico e hábitos passados do usuário:
 * Descobre a categoria que o usuário mais utilizou para termos parecidos (ex: "Rafael" -> "Assinaturas").
 */
export function inferFromUserHistory(
	descricao: string,
	favorecido: string | undefined,
	gastosExistentes: any[],
	categoriaMap: Record<string, string>
): string | null {
	if (!gastosExistentes || gastosExistentes.length === 0) return null;

	const descNorm = normalizeText(descricao || "");
	const favNorm = normalizeText(favorecido || "");

	const stopWords = new Set(["pix", "enviado", "recebido", "transferencia", "ted", "doc", "pagamento", "compra", "debito", "credito", "para", "pelo", "pela", "com", "amp", "ltda", "me", "sa", "outros", "conta", "saldo"]);
	
	const searchTerms: string[] = [];
	if (favNorm) {
		const favTokens = favNorm.split(/\s+/).filter(t => t.length >= 3 && !stopWords.has(t));
		for (const tok of favTokens) {
			if (!searchTerms.includes(tok)) searchTerms.push(tok);
		}
	}
	const descTokens = descNorm.split(/[\s:,\-]+/).filter(t => t.length >= 3 && !stopWords.has(t));
	for (const tok of descTokens) {
		if (!searchTerms.includes(tok)) searchTerms.push(tok);
	}

	if (searchTerms.length === 0) return null;

	const categoryCount: Record<string, number> = {};

	for (const ex of gastosExistentes) {
		if (!ex.categoria_id) continue;
		const catNome = categoriaMap[ex.categoria_id];
		if (!catNome || catNome.toLowerCase() === "outros") continue;

		const exDescNorm = normalizeText(ex.descricao || "");
		
		for (const term of searchTerms) {
			if (exDescNorm.includes(term)) {
				const weight = (favNorm && favNorm.includes(term)) ? 3 : 1;
				categoryCount[catNome] = (categoryCount[catNome] || 0) + weight;
				break;
			}
		}
	}

	let bestCategory: string | null = null;
	let highestCount = 0;
	for (const [cat, count] of Object.entries(categoryCount)) {
		if (count > highestCount) {
			highestCount = count;
			bestCategory = cat;
		}
	}

	return bestCategory;
}

/**
 * Procura, entre os contatos cadastrados do usuário, um cujo nome apareça no texto
 * (descrição + favorecido). Exige o primeiro nome + ao menos mais um nome coincidente,
 * para não confundir parentes que só compartilham o sobrenome.
 */
export function encontrarContatoPorNome<T extends { nome?: string | null }>(
	texto: string,
	contatos: T[]
): T | undefined {
	const alvo = normalizeText(texto || "");
	if (!alvo) return undefined;
	const stopWords = new Set(["de", "da", "do", "dos", "das", "e"]);
	return contatos.find(c => {
		const nome = normalizeText(c.nome || "");
		if (nome.length < 3) return false;
		if (alvo.includes(nome)) return true;
		const partes = nome.split(/\s+/).filter(p => p.length >= 3 && !stopWords.has(p));
		if (partes.length < 2 || !alvo.includes(partes[0])) return false;
		return partes.filter(p => alvo.includes(p)).length >= 2;
	});
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

	// 1. Termos explícitos bancários de mesma titularidade
	if (/mesma\s+titularidade|contas?\s+pr[oó]prias?|entre\s+minhas\s+contas|entre\s+contas/i.test(combined)) {
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

/** "Shopee *Loja - Parcela 4/6" → { base: "shopee loja", n: 4, total: 6 } */
export function lerParcela(descricao?: string | null): { base: string; n: number; total: number } | null {
	const texto = String(descricao || "");
	const p = lerParcelaDaDescricao(texto);
	if (!p) return null;
	const n = p.atual;
	const total = p.total;
	const base = normalizeText(texto.replace(p.trecho, " ").replace(/\s+-\s*$/, ""))
		.replace(/[^a-z0-9 ]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return { base, n, total };
}

/** Mesma loja/compra? (descrições de fatura variam: "Amazonmktplc*Czcomerci" × "Amazonmktplc Czcomerci") */
function mesmaCompra(a: string, b: string): boolean {
	if (!a || !b) return false;
	const juntoA = a.replace(/\s/g, "");
	const juntoB = b.replace(/\s/g, "");
	if (juntoA === juntoB || juntoA.includes(juntoB) || juntoB.includes(juntoA)) return true;
	const pa = a.split(" ").filter((w) => w.length >= 4);
	return pa.length > 0 && pa.filter((w) => b.includes(w)).length >= Math.min(2, pa.length);
}

/**
 * Conta sua do outro lado de uma transferência, pelo que o próprio extrato informa:
 * número da conta ("Conta: 55525276-0") ou o banco ("BCO SANTANDER", "BANCO INTER", "WISE").
 * Só responde quando não há dúvida (um único candidato). Transferência para/de CNPJ
 * (empresa) só casa com conta cujo número bate.
 */
export function contaDoOutroLado(texto: string, contasList: any[], contaAtualId?: string | null): string | undefined {
	const t = String(texto || "");
	const outras = (contasList || []).filter((c) => c.id && c.id !== contaAtualId);
	if (outras.length === 0) return undefined;
	const digitos = (s: any) => String(s || "").replace(/\D/g, "");
	const numeros = [...t.matchAll(/conta:?\s*([\d.\-]{4,})/gi)].map((m) => digitos(m[1])).filter((n) => n.length >= 4);
	const porNumero = outras.filter((c) => {
		const nc = digitos(c.numero_conta);
		return nc.length >= 4 && numeros.some((n) => n.includes(nc) || nc.includes(n));
	});
	if (porNumero.length === 1) return porNumero[0].id;
	if (/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/.test(t)) {
		// Empresa (CNPJ): é a sua empresa só se houver UMA conta de empresa cadastrada
		const pj = outras.filter((c) => c.empresa_id);
		return pj.length === 1 ? pj[0].id : undefined;
	}
	const banco = detectarInstituicao(t);
	if (!banco) return undefined;
	const doBanco = outras.filter((c) => detectarInstituicao(`${c.instituicao || ""} ${c.nome || ""}`)?.nome === banco.nome);
	return doBanco.length === 1 ? doBanco[0].id : undefined;
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

	const itemIsEntrada = item.tipo_transacao === "Entrada" || item.tipo_transacao === "RECEITA";
	const itemIsGasto = item.tipo_transacao === "Gasto" || item.tipo_transacao === "Fatura" || item.tipo_transacao === "DESPESA" || item.tipo_transacao === "PagamentoFatura";

	// Parcela de compra ("Loja X - Parcela 4/6"): a mesma parcela da mesma compra já existe
	// (inclusive as parcelas futuras que o app cria ao importar a 1ª fatura), mesmo com data
	// estimada diferente ou centavos de diferença.
	const parcelaItem = lerParcela(item.descricao);
	if (parcelaItem && itemIsGasto) {
		for (const ex of existentes) {
			const parcelaEx = lerParcela(ex.descricao);
			if (!parcelaEx || parcelaEx.n !== parcelaItem.n || parcelaEx.total !== parcelaItem.total) continue;
			if (!(ex.tipo === "DESPESA" || ex.tipo === "ESTORNO")) continue;
			const exValor = Math.abs(Number(ex.valor) || 0);
			if (Math.abs(itemValor - exValor) > Math.max(0.1, itemValor * 0.02)) continue;
			if (!mesmaCompra(parcelaItem.base, parcelaEx.base)) continue;
			const d1 = new Date(item.data.split("T")[0] + "T12:00:00").getTime();
			const d2 = new Date(String(ex.data).split("T")[0] + "T12:00:00").getTime();
			if (Math.abs(d1 - d2) / 86400000 > 45) continue;
			const dataFormatada = ex.data ? String(ex.data).split("T")[0].split("-").reverse().join("/") : "";
			const c = ex.cartao_id ? cartoesList.find((card) => card.id === ex.cartao_id) : null;
			return {
				repetida: true,
				motivo: `⚠️ Parcela ${parcelaItem.n}/${parcelaItem.total} já lançada em ${dataFormatada}${c ? ` (${/^cart/i.test(c.nome || "") ? c.nome : `Cartão ${c.nome}`})` : ""} - R$ ${exValor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
				transacaoOriginal: ex,
			};
		}
	}

	for (const ex of existentes) {
		const exIsEntrada = ex.tipo === "RECEITA";
		const exIsGasto = ex.tipo === "DESPESA" || ex.tipo === "PAGAMENTO_FATURA" || ex.tipo === "PAGAMENTO_DIVIDA" || ex.tipo === "ESTORNO";

		// 🛡️ REGRA CRÍTICA DE OURO: UMA ENTRADA (RECEITA) NUNCA É DUPLICADA DE UM GASTO/DÉBITO!
		if (itemIsEntrada && !exIsEntrada) continue;
		if (itemIsGasto && !exIsGasto) continue;

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
	const limpos: TransacaoPreview[] = itens.map(item => ({
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
	const [saldoExtrato, setSaldoExtrato] = useState<SaldoDoExtrato | null>(null);
	const [ajustarSaldoAoSalvar, setAjustarSaldoAoSalvar] = useState(true);
	const [cabecalhoConta, setCabecalhoConta] = useState<CabecalhoConta | null>(null);
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
		const conta = contas.find((c) => c.id === contaId);
		// Pagamento de fatura no extrato deste banco = cartão deste banco
		const cartaoDaConta = conta
			? cartoes.find((c) => c.conta_id === contaId) || encontrarPorInstituicao(cartoes, `${conta.instituicao || ""} ${conta.nome || ""}`)
			: undefined;
		setPreview(prev => prev.map(item => {
			const novo: TransacaoPreview = { ...item, conta_id: contaId };
			if (item.tipo_transacao === "PagamentoFatura" && cartaoDaConta) novo.cartao_id = cartaoDaConta.id;
			// A conta do outro lado da transferência não pode ser a própria conta do extrato
			if (item.conta_destino_id === contaId) novo.conta_destino_id = "";
			if (item.tipo_transacao === "Gasto" && /empr[eé]stimo|consignado|financiamento/i.test(item.descricao || "")) {
				novo.divida_id = dividaDoDebito(item.descricao, contaId) || "";
			}
			return novo;
		}));
	};

	/** Dívida ativa (empréstimo/financiamento) do mesmo banco da conta que um débito do extrato está pagando. */
	const dividaDoDebito = (descricao: string, contaId?: string | null): string | undefined => {
		const conta = contas.find((c) => c.id === contaId);
		if (!conta) return undefined;
		const instConta = detectarInstituicao(`${conta.instituicao || ""} ${conta.nome || ""}`);
		const candidatas = dividasAtivas.filter((d: any) => {
			if (d.tipo === "renegociacao_cartao") return false;
			if (!(d.parcelas_divida || []).some((p: any) => p.status !== "paga")) return false;
			const instDivida = detectarInstituicao(`${d.instituicao || ""} ${d.descricao || ""}`);
			return Boolean(instConta && instDivida && instConta.id === instDivida.id);
		});
		if (candidatas.length <= 1) return candidatas[0]?.id;
		const consignado = /consign/i.test(descricao || "");
		const preferida = candidatas.find((d: any) => consignado === /consign/i.test(`${d.descricao || ""} ${d.observacao || ""}`));
		return (preferida || candidatas[0]).id;
	};

	const applyGlobalCartao = (cartaoId: string) => {
		setGlobalCartao(cartaoId);
		setPreview(prev => prev.map(item => {
			if (tipoDocumento === "extrato_bancario") {
				if (item.tipo_transacao === "PagamentoFatura") {
					return { ...item, cartao_id: cartaoId };
				}
				return item;
			}
			return {
				...item,
				cartao_id: cartaoId,
				metodo_pagamento: cartaoId ? "Crédito" : item.metodo_pagamento
			};
		}));
	};

	const [usuarioNome, setUsuarioNome] = useState<string>("");
	const [usuarioCpf, setUsuarioCpf] = useState<string>("");
	const [categorias, setCategorias] = useState<string[]>(CATEGORIAS_PADRAO);
	const [categoriaMap, setCategoriaMap] = useState<Record<string, string>>({});

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

			const mapCat: Record<string, string> = {};
			(dataCategorias || []).forEach((c: any) => {
				if (c.id && c.nome) mapCat[c.id] = c.nome;
			});
			setCategoriaMap(mapCat);

			let metasCarregadas = dataMetas.data || [];
			// (aplicações vão para a caixinha do banco; nenhuma meta é criada sozinha)
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
					const contatoTerceiro = encontrarContatoPorNome(`${desc} ${item.nome_terceiro || ""}`, contatos);
					if (contatoTerceiro) {
						if (tipo === "Transferencia" || cat === "Transferência Interna" || ignorar) {
							tipo = desc.toLowerCase().includes("pix recebido") ? "Entrada" : "Gasto";
							cat = tipo === "Entrada" ? "Pix Recebido" : "Outros";
							ignorar = false;
							ignoredReason = "";
							item.terceiro = true;
							item.nome_terceiro = contatoTerceiro.nome;
							item.contato_id = contatoTerceiro.id;
							mudouItem = true;
						}
					} else {
						const isTransf = isTransferenciaPropria(desc, item.nome_terceiro, usuarioNome, usuarioCpf);
						// Antigamente isso descartava a linha; agora a transferência entra no saldo da conta
						// (a duplicidade com o extrato do outro banco é checada ao salvar).
						if (ignorar && /contas pr[oó]prias/i.test(ignoredReason || "")) {
							ignorar = false;
							ignoredReason = "";
							mudouItem = true;
						}
						if ((isTransf || tipo === "Transferencia") && !item.sentido) {
							item.sentido = sentidoDaTransferencia({ valor: item.valor, tipo: tipo === "Entrada" ? "RECEITA" : undefined }, desc);
							mudouItem = true;
						}
						if (isTransf && (tipo !== "Transferencia" || cat !== "Transferência Interna" || item.cartao_id || item.metodo_pagamento === "Crédito")) {
							tipo = "Transferencia";
							cat = "Transferência Interna";
							item.cartao_id = null;
							item.metodo_pagamento = "Débito";
							mudouItem = true;
						}
					}
				}

				// 3. Aplicação e Resgate de investimentos (CDB, RDB, LCI/LCA, Tesouro, poupança, caixinha...)
				const descLower = desc.toLowerCase();
				const isAplicacao = ehAplicacaoInvestimento(desc);
				if (isAplicacao && (tipo !== "Meta" || !metaId)) {
					tipo = "Meta";
					cat = "Investimentos";
					mudouItem = true;
				}

				const isResgate = ehResgateInvestimento(desc);
				if (isResgate && tipo !== "Resgate") {
					tipo = "Resgate";
					cat = "Investimentos";
					mudouItem = true;
				}

				// 4. Detecção Contábil Determinística (IOF, Juros de Limite, Tarifas, Pagamento de Fatura)
				const contabilLive = inferDeterministicContabil(desc, tipo);
				if (contabilLive && !item.manualOverride) {
					if (contabilLive.categoria && cat !== contabilLive.categoria) {
						cat = contabilLive.categoria;
						mudouItem = true;
					}
					if (contabilLive.tipo_transacao && tipo !== contabilLive.tipo_transacao) {
						tipo = contabilLive.tipo_transacao;
						mudouItem = true;
					}
				}

				const isPagamentoFatura = tipo === "PagamentoFatura" || descLower.includes("pagamento de fatura") || descLower.includes("pagamento da fatura") || descLower.includes("pgto fatura");
				// Pagamento de fatura nunca tem categoria de consumo (ex.: "Alimentação" aprendida do histórico)
				if (isPagamentoFatura && (tipo !== "PagamentoFatura" || (!item.manualOverride && cat !== "Cartão de Crédito"))) {
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
					if (!item.cartao_id && cartoes.length === 1) {
						item.cartao_id = cartoes[0].id;
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
			const pareceExtrato = nomeArquivoIndicaExtrato(droppedFile.name);
			if (pareceExtrato && ext.tipo_documento === "fatura_cartao") {
				ext.tipo_documento = "extrato_bancario";
				setTipoDocumento("extrato_bancario");
			}

			// Instituição citada no arquivo ou nos dados extraídos (nome do arquivo tem prioridade)
			const pistaInstituicao = [
				droppedFile.name,
				ext.dados?.instituicao,
				ext.dados?.conta_nome_ou_banco,
				ext.dados?.cartao_nome_ou_final,
			].filter(Boolean).join(" ");

			// O próprio arquivo diz agência/conta e o saldo final (CSV/OFX) — mais confiável que a IA
			const textoPlano = await lerTextoSePlano(droppedFile);
			const cab = textoPlano ? lerCabecalhoConta(textoPlano) : null;
			setCabecalhoConta(cab);
			setSaldoExtrato(textoPlano && ext.tipo_documento === "extrato_bancario" ? saldoFinalDoExtrato(textoPlano) : null);
			setAjustarSaldoAoSalvar(true);
			const idLembrado = contaLembrada(cab);
			let contaDetectada =
				contaPeloCabecalho(cab, contas) ||
				contas.find((c) => c.id === idLembrado) ||
				encontrarPorInstituicao(contas, droppedFile.name) ||
				encontrarPorInstituicao(contas, `${pistaInstituicao} ${(textoPlano || "").slice(0, 1500)}`);
			// Mesmo banco com conta pessoal e da empresa (Inter PF x Inter PJ): o arquivo diz qual é
			const arquivoDeEmpresa = /\b(cnpj|pj|empresa|mei)\b/i.test(normalizeText(droppedFile.name)) ||
				/\b\d{2}\.?\d{3}\.?\d{3}\/?0001-?\d{2}\b/.test((textoPlano || "").slice(0, 600));
			if (contaDetectada && !contaPeloCabecalho(cab, contas) && contas.find((c) => c.id === idLembrado) !== contaDetectada) {
				const instDetectada = detectarInstituicao(`${contaDetectada.instituicao || ""} ${contaDetectada.nome || ""}`);
				const doMesmoBanco = contas.filter((c) => {
					const i = detectarInstituicao(`${c.instituicao || ""} ${c.nome || ""}`);
					return instDetectada && i?.id === instDetectada.id;
				});
				const certa = doMesmoBanco.find((c) => Boolean(c.empresa_id) === arquivoDeEmpresa);
				if (certa) contaDetectada = certa;
			}
			if (!contaDetectada && arquivoDeEmpresa) {
				const pj = contas.filter((c) => c.empresa_id);
				if (pj.length === 1) contaDetectada = pj[0];
			}
			// Sem reconhecer a conta, NÃO chuta a primeira da lista: a pessoa escolhe no topo
			const detectedContaId = contaDetectada?.id || (contas.length === 1 ? contas[0].id : "");
			setGlobalConta(detectedContaId);
			if (!detectedContaId && ext.tipo_documento === "extrato_bancario") {
				toast("Não reconheci de qual banco é este extrato. Escolha a conta no topo da tabela.", { icon: "🏦", duration: 6000 });
			}

			// Cartão padrão para pagamentos de fatura: o vinculado à conta do extrato, senão o da mesma instituição
			const cartaoPadraoPagamento =
				cartoes.find(c => detectedContaId && c.conta_id === detectedContaId) ||
				(contaDetectada ? encontrarPorInstituicao(cartoes, `${contaDetectada.instituicao || ""} ${contaDetectada.nome || ""}`) : undefined) ||
				encontrarPorInstituicao(cartoes, pistaInstituicao);

			let detectedCartaoId = "";
			if (ext.tipo_documento === "fatura_cartao" && !pareceExtrato) {
				const cartaoDetectado = encontrarPorInstituicao(cartoes, droppedFile.name) || encontrarPorInstituicao(cartoes, pistaInstituicao);
				detectedCartaoId = cartaoDetectado?.id || (cartoes.length > 0 ? cartoes[0].id : "");
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
			const isFatura = ext.tipo_documento === "fatura_cartao" && !pareceExtrato;

			if (ext.tipo_documento === "extrato_bancario" && ext.dados?.transacoes) {
				rawItems = ext.dados.transacoes.map((t: any) => {
					const descLower = (t.descricao || "").toLowerCase();
					const isAplicacaoRDB = ehAplicacaoInvestimento(t.descricao || "") ||
					                       t.tipo === "INVESTIMENTO" ||
					                       t.tipo === "APORTE" ||
					                       t.subtipo === "APLICACAO_RDB";

					const isResgateRDB = ehResgateInvestimento(t.descricao || "") ||
					                     t.tipo === "RESGATE" ||
					                     t.subtipo === "RESGATE_RDB";

					const isPagamentoFatura = descLower.includes("pagamento de fatura") ||
					                          descLower.includes("pagamento da fatura") ||
					                          descLower.includes("pgto fatura") ||
					                          t.tipo === "PAGAMENTO_FATURA" ||
					                          t.subtipo === "PAGAMENTO_FATURA";

					const isSalario = descLower.includes("liquido de vencimento") || 
					                  descLower.includes("líquido de vencimento") || 
					                  descLower.includes("liq vencimento") || 
					                  descLower.includes("credito salario") || 
					                  descLower.includes("folha de pagamento") || 
					                  descLower.includes("proventos") || 
					                  descLower.includes("holerite");
					const isLimiteConvertido = descLower.includes("limite convertido") || t.subtipo === "CONVERSAO_LIMITE_CARTAO";
					const isResgateEmprestimo = descLower.includes("resgate de empréstimo") || descLower.includes("resgate de emprestimo") || descLower.includes("pagamento de empréstimo") || descLower.includes("pagamento de emprestimo");

					let tipoTransacao: TransacaoPreview['tipo_transacao'] = "Gasto";
					const isTransfBanco = (t.tipo === "TRANSFERENCIA" || t.subtipo === "TRANSFERENCIA_PROPRIA") && !encontrarContatoPorNome(`${descLower} ${t.favorecido || ""}`, contatos);
					if (isTransfBanco) tipoTransacao = "Transferencia";
					else if (isAplicacaoRDB) tipoTransacao = "Meta";
					else if (isResgateRDB) tipoTransacao = "Resgate";
					else if (isPagamentoFatura) tipoTransacao = "PagamentoFatura";
					else if (isLimiteConvertido || isSalario) tipoTransacao = "Entrada";
					else if (t.tipo === "RECEITA" || descLower.includes("pix recebido")) tipoTransacao = "Entrada";
					else tipoTransacao = "Gasto";

					let finalCat = t.categoria_sugerida;
					if (isSalario) finalCat = "Salário";
					else if (isLimiteConvertido) finalCat = "Financiamento / Ajuste de Limite";
					else if (isResgateEmprestimo) finalCat = "Emprestimo";

					const autoCardId = isPagamentoFatura ? (cartaoPadraoPagamento?.id || null) : null;
					return {
						...t,
						tipo_transacao: tipoTransacao,
						metodo_pagamento: "Débito",
						conta_id: detectedContaId,
						cartao_id: autoCardId,
						categoria_sugerida: finalCat,
						observacao: isResgateEmprestimo ? "Quitação / Pagamento de Empréstimo" : t.observacao
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

				// "Pagamento recebido" que veio no meio dos itens também é pagamento (não pode sumir)
				const pagamentosNosItens = (ext.dados?.itens || [])
					.filter((t: any) => /pagamento\s*recebido/i.test(t.descricao || ""))
					.map((t: any) => ({ data: t.data, descricao: t.descricao, valor: Math.abs(Number(t.valor) || 0) }));
				const faturaPagamentos = [...(ext.dados?.pagamentos || []), ...pagamentosNosItens].map((p: any) => ({
					...p,
					valor: Math.abs(Number(p.valor) || 0),
					tipo_transacao: "PagamentoFatura",
					metodo_pagamento: "Débito",
					cartao_id: detectedCartaoId,
					// A saída do dinheiro é registrada pelo extrato da conta; aqui só quita a fatura
					conta_id: null,
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

				// Favorecido que é um contato cadastrado = terceiro (nunca transferência própria)
				const contatoTerceiro = encontrarContatoPorNome(`${cleanDesc} ${favorecido}`, contatos);
				const isContatoTerceiro = Boolean(contatoTerceiro);

				// Verifica transferência própria (mesmo titular) para qualquer usuário
				const isTransfPropria = !isContatoTerceiro && (
					isTransferenciaPropria(cleanDesc, favorecido, nomeUserAtual, cpfUserAtual, ext.dados?.titular) ||
					(t.subtipo === "TRANSFERENCIA_PROPRIA" && !favorecido) ||
					/mesma\s+titularidade|contas?\s+pr[oó]prias?/i.test(cleanDesc)
				);

				const descLower = cleanDesc.toLowerCase();
				const isAplicacao = t.tipo_transacao === "Meta" || 
				                    ehAplicacaoInvestimento(cleanDesc) ||
				                    t.subtipo === "APLICACAO_RDB";

				const isLimiteConvertido = descLower.includes("limite convertido") || t.subtipo === "CONVERSAO_LIMITE_CARTAO";
				const isExtratoBancario = tipoDocumento === "extrato_bancario";
				const isFaturaItem = !isExtratoBancario && (
					isFatura || 
					Boolean(t.cartao_id) || 
					t.tipo_transacao === "Fatura" ||
					isLimiteConvertido
				);

				let tipoFinal: TransacaoPreview['tipo_transacao'];
				if (isContatoTerceiro) {
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

				// Dedução contábil (IOF, Juros de Cheque Especial / Limite, Tarifas)
				const contabil = inferDeterministicContabil(cleanDesc, t.tipo_transacao);
				if (contabil?.tipo_transacao && !isTransfPropria && !isContatoTerceiro && !isAplicacao) {
					tipoFinal = contabil.tipo_transacao;
				}

				// Aprendizado por histórico do usuário (ex: transações para 'Rafael' aprendidas como 'Assinaturas')
				const learnedCat = (!contabil && !isContatoTerceiro && !isTransfPropria && !isAplicacao && !isLimiteConvertido && tipoFinal !== "PagamentoFatura")
					? inferFromUserHistory(cleanDesc, favorecido, gastosExistentes, categoriaMap)
					: null;

				let categoriaFinal = isContatoTerceiro
					? (tipoFinal === "Entrada" ? "Pix Recebido" : (t.categoria_sugerida && t.categoria_sugerida !== "Transferência Interna" ? t.categoria_sugerida : "Outros"))
					: (isTransfPropria
						? "Transferência Interna"
						: (isAplicacao 
							? "Investimentos" 
							: (isLimiteConvertido 
								? "Financiamento / Ajuste de Limite" 
								: (contabil?.categoria 
									|| learnedCat 
									|| (categorias.some(c => c.toLowerCase() === (t.categoria_sugerida || "").toLowerCase()) ? t.categoria_sugerida : (CATEGORIAS_PADRAO.includes(t.categoria_sugerida) ? t.categoria_sugerida : "Outros"))))));

				// Pagamento de fatura não é consumo: nunca herda categoria como "Alimentação"
				if (tipoFinal === "PagamentoFatura") categoriaFinal = "Cartão de Crédito";
				// Extrato da conta da EMPRESA: cliente pagando = faturamento; Receita Federal = DAS;
				// prefeitura = ISS; contador = contabilidade (Pix para você vira retirada ao salvar)
				// (contaIdFinal só é calculado mais abaixo: aqui usa a mesma origem — conta da linha ou do extrato)
				const contaDaLinha = isFatura ? undefined : contas.find((c) => c.id === (t.conta_id || detectedContaId));
				if (contaDaLinha?.empresa_id && !isTransfPropria && !isAplicacao && tipoFinal !== "PagamentoFatura") {
					const pj = regraDaEmpresa(cleanDesc, Number(t.valor) || 0, tipoFinal);
					if (pj) {
						tipoFinal = pj.tipo_transacao;
						categoriaFinal = pj.categoria;
					}
				}
				// Empréstimo: devolução de parcela = estorno (abate o que saiu); débito = parcela da dívida
				const ehCoisaDeEmprestimo = contabil?.categoria === "Empréstimo" && !isTransfPropria && !isContatoTerceiro;
				const ehDevolucaoEmprestimo = ehCoisaDeEmprestimo && tipoFinal === "Entrada";

				// Sem meta escolhida, a aplicação vai para a caixinha do próprio banco (ex.: "Caixinha Inter")
				const metaIdFinal = t.meta_id || "";

				// Deduplicação Inteligente: cruza com lançamentos já existentes no banco do usuário
				const dup = encontrarTransacaoRepetida(
					{ data: t.data, valor: parseFloat(t.valor) || 0, descricao: cleanDesc, tipo_transacao: tipoFinal },
					gastosExistentes,
					cartoes,
					contas
				);

				// Transferência entre contas suas entra no saldo da conta do extrato (a duplicidade com o
				// extrato do outro banco é checada ao salvar). Só repetição de verdade é descartada.
				const deveIgnorar = isContatoTerceiro ? false : (!isTransfPropria && dup.repetida);
				const motivoIgnorar = isContatoTerceiro ? "" : (!isTransfPropria && dup.repetida ? dup.motivo : "");

				const cartaoIdFinal = (isFatura || tipoFinal === "Fatura") 
					? (t.cartao_id || detectedCartaoId || cartoes[0]?.id || null) 
					: (tipoFinal === "PagamentoFatura" ? (t.cartao_id || cartaoPadraoPagamento?.id || null) : null);
				const contaIdFinal = (isFatura || tipoFinal === "Fatura") ? null : (t.conta_id || detectedContaId || null);

				// Linha de conta (débito, Pix, juros, tarifa) só é parcela com a palavra "parcela":
				// "10/10 supermercado" é data e "Período: 03/09 a 02/10" é período, não 3/9.
				const ehLinhaDeConta = isExtratoBancario && tipoFinal !== "Fatura";
				const parcLida = lerParcelaDaDescricao(cleanDesc, { exigirPalavra: ehLinhaDeConta || Boolean(contabil) });
				let detectedParcelaAtual = t.parcela_atual;
				let detectedTotalParcelas = t.total_parcelas;
				if (parcLida) {
					detectedParcelaAtual = parcLida.atual;
					detectedTotalParcelas = parcLida.total;
				} else if (ehLinhaDeConta || contabil) {
					// a IA também confunde data com parcela: sem "parcela" escrito, é à vista
					detectedParcelaAtual = 1;
					detectedTotalParcelas = 1;
				}

				const isGastoFinal = tipoFinal === "Gasto";
				const terceiroFinal = isContatoTerceiro ? true : (isGastoFinal ? (t.terceiro || false) : false);
				const contatoIdFinal = contatoTerceiro ? contatoTerceiro.id : (t.contato_id || "");
				const nomeTerceiroFinal = contatoTerceiro
					? contatoTerceiro.nome
					: (t.nome_terceiro || favorecido || "");

				return {
					id: Date.now() + index.toString(),
					data: t.data || new Date().toISOString().split('T')[0],
					descricao: cleanDesc || (tipoFinal === "Entrada" ? "Pix Recebido" : tipoFinal === "Meta" ? "Aplicação RDB" : tipoFinal === "Transferencia" ? "Transferência Própria" : tipoFinal === "Fatura" ? "Compra no Cartão" : "Pix Enviado"),
					valor: Math.abs(parseFloat(t.valor) || 0),
					tipo_transacao: tipoFinal,
					sentido: tipoFinal === "Transferencia" ? sentidoDaTransferencia(t, cleanDesc) : undefined,
					...(tipoFinal === "Transferencia" ? conversaoDeMoeda(t, cleanDesc, String(ext?.dados?.moeda || "").toUpperCase() || undefined) || {} : {}),
					...(tipoFinal === "Transferencia" && !conversaoDeMoeda(t, cleanDesc, String(ext?.dados?.moeda || "").toUpperCase() || undefined)
						? { conta_destino_id: contaDoOutroLado(`${t.descricao || ""} ${t.favorecido || ""} ${cleanDesc}`, contas, contaIdFinal) }
						: {}),
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
					tipo: isLimiteConvertido
						? "AJUSTE"
						: tipoFinal === "Entrada"
							? (ehDevolucaoEmprestimo || t.tipo === "ESTORNO" || /\bestorno\b/i.test(cleanDesc) ? "ESTORNO" : "RECEITA")
							: tipoFinal === "Gasto"
								? (t.tipo === "AJUSTE" ? "AJUSTE" : "DESPESA")
								: (t.tipo || "DESPESA"),
					divida_id: ehCoisaDeEmprestimo && tipoFinal === "Gasto" ? (dividaDoDebito(cleanDesc, contaIdFinal) || "") : undefined,
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
	/** Nome da instituição da conta (para investimentos/RDB), sem assumir banco nenhum. */
	const instituicaoDaConta = (contaId?: string | null): string | null => {
		const conta = contas.find(c => c.id === contaId);
		if (!conta) return null;
		return detectarInstituicao(`${conta.instituicao || ""} ${conta.nome || ""}`)?.nome || conta.instituicao || conta.nome || null;
	};

	/** Nome da caixinha do banco da conta: "Caixinha Inter", "Caixinha Nubank"... */
	const caixinhaDaConta = (contaId?: string | null): string | null => {
		const banco = instituicaoDaConta(contaId);
		return banco ? `Caixinha ${banco}` : null;
	};

	const handleSaveAll = async () => {
		let itemsToSave = preview.filter(p => !p.ignorar);
		if (itemsToSave.length === 0) {
			toast.error("Nenhum lançamento novo para salvar.");
			return;
		}

		// Extrato sem conta escolhida iria para a conta errada
		const precisaConta = itemsToSave.some((i) => i.tipo_transacao !== "Fatura" && !i.cartao_id && !(i.conta_id || globalConta));
		if (tipoDocumento === "extrato_bancario" && precisaConta) {
			toast.error("Escolha no topo de qual conta é este extrato antes de salvar.");
			return;
		}

		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) throw new Error("Usuário não autenticado");

			let importados = 0;

			// Moeda do extrato: a que a IA leu (ex.: extrato do saldo em CAD da Wise) ou a da conta.
			// Cada linha vira reais pela cotação do dia dela (é o que entra em gastos/entradas);
			// a movimentação cai no saldo daquela moeda dentro da conta, no valor exato do extrato.
			const moedasContas = await moedasDasContas(
				[...new Set(itemsToSave.map((i) => i.conta_id || globalConta).filter(Boolean))] as string[],
			);
			const lidaNoExtrato = String(dadosExtraidos?.moeda || "").toUpperCase().trim();
			const moedaExtrato = CODIGOS_MOEDA.has(lidaNoExtrato) ? lidaNoExtrato : "";
			const convertidos: TransacaoPreview[] = [];
			for (const i of itemsToSave) {
				const conta = i.conta_id || globalConta;
				const moedaConta = (conta && moedasContas[conta]) || "BRL";
				const moeda = moedaExtrato || moedaConta;
				const noCartao = i.tipo_transacao === "Fatura" || i.metodo_pagamento === "Crédito" || Boolean(i.cartao_id);
				if (noCartao) {
					convertidos.push(i);
					continue;
				}
				if (ehReal(moeda)) {
					convertidos.push({ ...i, moeda_mov: moeda });
					continue;
				}
				const conv = await moedaService.paraReais(i.valor, moeda, i.data);
				if (!conv) throw new Error(`Não foi possível obter a cotação de ${moeda} em ${i.data}. Tente de novo em instantes.`);
				convertidos.push({ ...i, valor: conv.reais, valor_original: i.valor, moeda, cotacao: conv.cotacao, moeda_mov: moeda });
			}
			itemsToSave = convertidos;
			const extrasMoeda = (i: TransacaoPreview) =>
				i.moeda && i.valor_original ? { moeda: i.moeda, valor_original: i.valor_original, cotacao: i.cotacao } : {};

			// 1. Entradas (Receitas ou Ajustes)
			const entradas = itemsToSave.filter(i => i.tipo_transacao === "Entrada");
			for (const item of entradas) {
				const isLimite = item.tipo === "AJUSTE" || (item.descricao && /limite\s+convertido/i.test(item.descricao));
				// Estorno/devolução (ex.: parcela do consignado devolvida): dinheiro volta para a conta,
				// mas não é receita — abate os gastos da categoria (aparece em Gastos como crédito)
				const isEstorno = !isLimite && item.tipo === "ESTORNO";
				const txTipo = isLimite ? "AJUSTE" : isEstorno ? "ESTORNO" : "RECEITA";
				const txCat = isLimite ? "Financiamento / Ajuste de Limite" : (item.categoria || "Outros");

				// Mapeia categoria_id existente ou cria uma se necessário
				let categoriaId: string | null = null;
				if (txCat) {
					// Estorno abate gasto: usa a categoria de despesa com esse nome (ex.: "Empréstimo")
					const { data: cats } = await supabase
						.from("categorias")
						.select("id, tipo")
						.eq("usuario_id", user.id)
						.ilike("nome", txCat.trim());
					const cat = isEstorno
						? (cats || []).find((c: any) => c.tipo === "DESPESA") || (cats || [])[0]
						: (cats || []).find((c: any) => c.tipo !== "DESPESA") || (cats || [])[0];
					if (cat) {
						categoriaId = cat.id;
					} else {
						const { data: novaCat } = await supabase
							.from("categorias")
							.insert([{
								usuario_id: user.id,
								nome: txCat.trim(),
								tipo: isEstorno ? "DESPESA" : "RECEITA",
								ativa: true,
								cor_hex: "#10B981"
							}])
							.select("id")
							.maybeSingle();
						if (novaCat) categoriaId = novaCat.id;
					}
				}

				const contaIdFinal = item.conta_id || globalConta || null;

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
						observacao: `Categoria: ${txCat}`,
						...extrasMoeda(item),
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
						await inserirMovimentacoes([{
							usuario_id: user.id,
							transacao_id: tx.id,
							conta_id: tx.conta_id,
							tipo: "ENTRADA",
							valor: tx.valor,
							valor_na_conta: item.valor_original,
							moeda: item.moeda_mov,
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

				const txGasto = await financeService.addGasto(user.id, {
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
					considerar_soma: finalCat !== "Renegociação de Cartão" && !item.descricao.toLowerCase().includes("renegocia"),
					documento_importado_id: documentoImportadoId || null,
					moeda: item.moeda,
					valor_original: item.valor_original,
					cotacao: item.cotacao,
					moeda_mov: item.moeda_mov,
				});
				// Parcela de empréstimo paga pelo extrato: dá baixa na dívida (data e valor reais)
				if (item.divida_id && !isFaturaTrans && (txGasto as any)?.id) {
					await financeService
						.vincularPagamentoDivida(user.id, { transacao_id: (txGasto as any).id, divida_id: item.divida_id, valor: item.valor, data: item.data })
						.catch((e: any) => console.warn("Não consegui ligar o débito à dívida:", e));
				}
				importados++;
			}

			// 3. Metas / Aplicações em RDB / Caixinhas (Movimentação Patrimonial - NÃO é despesa)
			const metasItems = itemsToSave.filter(i => i.tipo_transacao === "Meta");
			for (const item of metasItems) {
				// Sem meta escolhida: caixinha do banco da conta (uma por banco)
				const targetMetaId = item.meta_id || null;
				await financeService.processAporteInvestimento(user.id, {
					conta_id: item.conta_id || globalConta || null,
					valor: item.valor,
					data: item.data,
					descricao: item.descricao || "Aplicação RDB / Caixinha",
					meta_id: targetMetaId,
					instituicao: instituicaoDaConta(item.conta_id || globalConta),
					titulo_investimento: targetMetaId ? null : caixinhaDaConta(item.conta_id || globalConta),
					documento_importado_id: documentoImportadoId || null
				});
				importados++;
			}

			// 4. Resgates de RDB / Caixinhas (Retorno de Patrimônio - NÃO é receita operacional)
			const resgatesItems = itemsToSave.filter(i => i.tipo_transacao === "Resgate");
			for (const item of resgatesItems) {
				const targetMetaId = item.meta_id || null;

				await financeService.processResgateInvestimento(user.id, {
					conta_id: item.conta_id || globalConta || null,
					valor: item.valor,
					data: item.data,
					descricao: item.descricao || "Resgate RDB / Caixinha",
					principal: (item as any).principal || null,
					rendimento: (item as any).rendimento || null,
					instituicao: instituicaoDaConta(item.conta_id || globalConta),
					meta_id: targetMetaId,
					titulo_investimento: targetMetaId ? null : caixinhaDaConta(item.conta_id || globalConta),
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

			// 6. Transferências entre contas suas
			//    - já existe nesta conta (mesmo valor, sentido e data próxima)? pula;
			//    - a outra conta já registrou a perna contrária (extrato do outro banco)? só completa;
			//    - senão cria a transferência (conta do outro lado é opcional).
			const transferencias = itemsToSave.filter(i => i.tipo_transacao === "Transferencia");
			const empresasDoUsuario = transferencias.length ? await minhasEmpresas(user.id) : [];
			const somarDias = (iso: string, d: number) => {
				const x = new Date(`${iso}T12:00:00`);
				x.setDate(x.getDate() + d);
				return x.toISOString().slice(0, 10);
			};
			const pernasDeTransferencia = async (contaId: string, tipo: "ENTRADA" | "SAIDA", data: string) => {
				const { data: movs } = await supabase
					.from("movimentacoes")
					.select("id, valor, transacao_id, transacoes!movimentacoes_transacao_fkey(tipo, observacao)")
					.eq("usuario_id", user.id)
					.eq("conta_id", contaId)
					.eq("tipo", tipo)
					.gte("data", somarDias(data, -3))
					.lte("data", somarDias(data, 3));
				// transferência entre contas suas ou retirada da empresa (pró-labore/lucros) já lançada
				return (movs || []).filter((m: any) => {
					const t = Array.isArray(m.transacoes) ? m.transacoes[0] : m.transacoes;
					return t?.tipo === "TRANSFERENCIA" || /retirada_pj/.test(t?.observacao || "");
				});
			};
			let jaExistiam = 0;
			let completadas = 0;
			for (const item of transferencias) {
				const contaDoc = item.conta_id || globalConta || null;
				const outra = item.conta_destino_id && item.conta_destino_id !== contaDoc ? item.conta_destino_id : null;
				const entrou = (item.sentido || "SAIDA") === "ENTRADA";
				const valorNaConta = item.valor_original ?? item.valor;

				if (contaDoc) {
					const nestaConta = await pernasDeTransferencia(contaDoc, entrou ? "ENTRADA" : "SAIDA", item.data);
					if (nestaConta.some((m: any) => Math.abs(Number(m.valor) - valorNaConta) < 0.01)) {
						jaExistiam++;
						continue;
					}
				}
				// Conversão de moeda dentro da mesma conta (Wise: R$ 10 → 2.50 CAD).
				// O dinheiro continua seu e na mesma conta: sai de um saldo e entra no outro.
				if (contaDoc && item.moeda_destino && item.moeda_destino !== item.moeda_mov) {
					const moedaLinha = item.moeda_mov || "BRL";
					let valorDestino = Number(item.valor_destino) || 0;
					if (!valorDestino) {
						if (ehReal(item.moeda_destino)) valorDestino = item.valor;
						else {
							const cot = await moedaService.cotacao(item.moeda_destino, item.data);
							if (!cot) throw new Error(`Não foi possível obter a cotação de ${item.moeda_destino} em ${item.data}.`);
							valorDestino = Math.round((item.valor / cot) * 100) / 100;
						}
					}
					const linha = { moeda: moedaLinha, valor: valorNaConta };
					const outraMoeda = { moeda: item.moeda_destino, valor: valorDestino };
					const [de, para] = entrou ? [outraMoeda, linha] : [linha, outraMoeda];
					const { data: tx, error: errTx } = await supabase
						.from("transacoes")
						.insert([{
							usuario_id: user.id,
							tipo: "TRANSFERENCIA",
							descricao: item.descricao || `Conversão ${de.moeda} → ${para.moeda}`,
							valor: item.valor,
							data: item.data,
							conta_id: contaDoc,
							status: "confirmada",
							observacao: `Conversão de moeda: ${formatarMoeda(de.valor, de.moeda)} → ${formatarMoeda(para.valor, para.moeda)}`,
							documento_importado_id: documentoImportadoId || null,
							...extrasMoeda(item),
						}])
						.select()
						.single();
					if (errTx) throw errTx;
					const { error: errMov } = await inserirMovimentacoes([
						{ usuario_id: user.id, transacao_id: tx.id, conta_id: contaDoc, tipo: "SAIDA", valor: item.valor, valor_na_conta: de.valor, moeda: de.moeda, data: item.data },
						{ usuario_id: user.id, transacao_id: tx.id, conta_id: contaDoc, tipo: "ENTRADA", valor: item.valor, valor_na_conta: para.valor, moeda: para.moeda, data: item.data },
					]);
					if (errMov) throw errMov;
					importados++;
					continue;
				}

				// Sem conta do outro lado escolhida: se UMA outra conta sua tem a perna contrária
				// (mesmo valor, ±3 dias) ainda sem par, é essa transferência — só completa.
				if (contaDoc && !outra) {
					const candidatas: any[] = [];
					for (const c of contas) {
						if (c.id === contaDoc) continue;
						const pernas = await pernasDeTransferencia(c.id, entrou ? "SAIDA" : "ENTRADA", item.data);
						for (const m of pernas) {
							if (Math.abs(Number(m.valor) - Number(item.valor)) > 0.01) continue;
							const { data: todas } = await supabase.from("movimentacoes").select("conta_id").eq("transacao_id", m.transacao_id);
							if ((todas || []).length === 1) candidatas.push(m);
						}
					}
					if (candidatas.length === 1) {
						await inserirMovimentacoes([{
							usuario_id: user.id,
							transacao_id: candidatas[0].transacao_id,
							conta_id: contaDoc,
							tipo: entrou ? "ENTRADA" : "SAIDA",
							valor: item.valor,
							valor_na_conta: item.valor_original,
							moeda: item.moeda_mov,
							data: item.data,
						}]);
						completadas++;
						importados++;
						continue;
					}
				}

				if (contaDoc && outra) {
					const doOutroLado = await pernasDeTransferencia(outra, entrou ? "SAIDA" : "ENTRADA", item.data);
					for (const m of doOutroLado) {
						// a transação do outro lado ainda não tem a perna desta conta?
						const { data: pernas } = await supabase.from("movimentacoes").select("conta_id").eq("transacao_id", m.transacao_id);
						if ((pernas || []).some((x: any) => x.conta_id === contaDoc)) continue;
						await inserirMovimentacoes([{
							usuario_id: user.id,
							transacao_id: m.transacao_id,
							conta_id: contaDoc,
							tipo: entrou ? "ENTRADA" : "SAIDA",
							valor: item.valor,
							valor_na_conta: item.valor_original,
							data: item.data,
						}]);
						completadas++;
						importados++;
						break;
					}
					if (completadas && doOutroLado.length) continue;
				}

				// Saiu da conta da EMPRESA para você e a conta pessoal já tem essa entrada (extrato pessoal
				// importado antes, como "Pix recebido Ana Leticia Tech"): liga as duas pontas e vira retirada.
				const contaDocObj = contas.find((c) => c.id === contaDoc);
				if (contaDoc && !entrou && contaDocObj?.empresa_id) {
					const pessoais = contas.filter((c) => !c.empresa_id && (!outra || c.id === outra)).map((c) => c.id);
					let ligada = false;
					if (pessoais.length) {
						const { data: entradas } = await supabase
							.from("movimentacoes")
							.select("transacao_id, conta_id, valor, data")
							.eq("usuario_id", user.id)
							.in("conta_id", pessoais)
							.eq("tipo", "ENTRADA")
							.gte("data", somarDias(item.data, -3))
							.lte("data", somarDias(item.data, 3));
						for (const m of (entradas || []).filter((x: any) => Math.abs(Number(x.valor) - Number(item.valor)) < 0.01)) {
							const { data: pernas } = await supabase.from("movimentacoes").select("id").eq("transacao_id", m.transacao_id);
							if ((pernas || []).length !== 1) continue;
							await inserirMovimentacoes([{ usuario_id: user.id, transacao_id: m.transacao_id, conta_id: contaDoc, tipo: "SAIDA", valor: item.valor, data: item.data }]);
							// Pix da empresa para a dona = pró-labore (vira "Salário" na visão pessoal); lucros se marca no painel
							await classificarComoRetirada(user.id, m.transacao_id, "PRO_LABORE", m.conta_id, contaDoc);
							completadas++;
							importados++;
							ligada = true;
							break;
						}
					}
					if (ligada) continue;
				}

				// Da conta da empresa para uma conta pessoal sua = retirada (pró-labore ou lucros)
				const origemConta = contas.find((c) => c.id === (entrou ? outra : contaDoc));
				const destinoConta = contas.find((c) => c.id === (entrou ? contaDoc : outra));
				if (origemConta?.empresa_id && destinoConta && !destinoConta.empresa_id) {
					const emp = empresasDoUsuario.find((e) => e.id === origemConta.empresa_id);
					await registrarRetirada(user.id, {
						contaEmpresa: origemConta.id,
						contaPessoal: destinoConta.id,
						valor: item.valor,
						data: item.data,
						tipo: "PRO_LABORE",
						descricao: item.descricao,
						documento_importado_id: documentoImportadoId || null,
					});
					importados++;
					continue;
				}

				await financeService.addTransacao(user.id, {
					tipo: "TRANSFERENCIA",
					descricao: item.descricao || "Transferência entre contas próprias",
					valor: item.valor,
					data: item.data,
					conta_id: entrou ? outra : contaDoc,
					conta_destino_id: entrou ? contaDoc : outra,
					observacao: item.categoria || "Transferência interna",
					documento_importado_id: documentoImportadoId || null,
					...extrasMoeda(item),
					...(item.valor_original
						? entrou
							? { valor_destino_na_conta: item.valor_original }
							: { valor_origem_na_conta: item.valor_original }
						: {}),
				});
				importados++;
			}
			if (jaExistiam) toast(`${jaExistiam} transferência(s) já estavam lançadas pelo extrato do outro banco — não dupliquei.`);

			// Atualiza documento_importado se existir
			if (documentoImportadoId) {
				await DocumentImportService.updateDocumentRecord(documentoImportadoId, {
					status: "PROCESSADO",
					processado_em: new Date().toISOString(),
					resultado_importacao: { total_importados: importados }
				});
			}

			await financeService.syncMetasInvestimentos(user.id).catch(() => {});
			await financeService.autoSyncDividasComTransacoes(user.id).catch(() => {});

			// Conta do extrato: lembra a agência/conta e confere o saldo com o que o banco mostra
			if (tipoDocumento === "extrato_bancario" && globalConta) {
				lembrarContaDoCabecalho(cabecalhoConta, globalConta);
				const contaObj = contas.find((c) => c.id === globalConta);
				if (contaObj && cabecalhoConta?.conta && !contaObj.numero_conta) {
					await supabase
						.from("contas_bancarias")
						.update({ numero_conta: cabecalhoConta.conta, ...(contaObj.agencia ? {} : { agencia: cabecalhoConta.agencia || null }) })
						.eq("id", globalConta)
						.eq("usuario_id", user.id);
				}
				if (saldoExtrato && ajustarSaldoAoSalvar) {
					try {
						const ajuste = await igualarSaldoAoExtrato(user.id, globalConta, saldoExtrato);
						if (ajuste !== null) {
							toast.success(`Saldo da conta ajustado para bater com o extrato (${formatarMoeda(saldoExtrato.saldo, "BRL")} em ${saldoExtrato.data.split("-").reverse().join("/")}).`, { duration: 6000 });
						}
					} catch (e: any) {
						toast.error("Importei, mas não consegui ajustar o saldo: " + (e?.message || e));
					}
				}
			}
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

	/**
	 * Deixa o saldo da conta igual ao do extrato na data dele. O que foi lançado depois dessa data
	 * continua contando (saldo de hoje = saldo do extrato + movimentos posteriores).
	 * Devolve a diferença aplicada, ou null se já batia.
	 */
	const igualarSaldoAoExtrato = async (usuarioId: string, contaId: string, ref: SaldoDoExtrato): Promise<number | null> => {
		const conta = contas.find((c) => c.id === contaId);
		const moedaConta = conta?.moeda || "BRL";
		let depois = 0;
		for (let de = 0; ; de += 1000) {
			const { data, error } = await supabase
				.from("movimentacoes")
				.select("tipo, valor, moeda")
				.eq("usuario_id", usuarioId)
				.eq("conta_id", contaId)
				.gt("data", ref.data)
				.range(de, de + 999);
			if (error) throw error;
			for (const m of data || []) {
				if (m.moeda && m.moeda !== moedaConta) continue;
				depois += (m.tipo === "ENTRADA" ? 1 : -1) * Number(m.valor || 0);
			}
			if (!data || data.length < 1000) break;
		}
		const saldoHoje = Math.round((ref.saldo + depois) * 100) / 100;
		const antes = (await financeService.getContasBancarias(usuarioId)).find((c: any) => c.id === contaId);
		const diferenca = Math.round((saldoHoje - Number(antes?.saldo_atual || 0)) * 100) / 100;
		if (Math.abs(diferenca) < 0.01) return null;
		await financeService.ajustarSaldoConta(usuarioId, contaId, saldoHoje);
		return diferenca;
	};

	const resetImport = () => {
		setSaldoExtrato(null);
		setCabecalhoConta(null);
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
				saldoExtrato,
				ajustarSaldoAoSalvar,
				setAjustarSaldoAoSalvar,
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
