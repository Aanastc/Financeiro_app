/**
 * TIPOS E SCHEMAS PARA IMPORTAÇÃO DE DOCUMENTOS FINANCEIROS POR IA
 * 
 * Regra Arquitetural:
 * A IA retorna dados estritamente estruturados nesta tipagem.
 * Em nenhuma hipótese a IA gera SQL ou executa operações diretas no banco.
 */

export type TipoDocumento =
  | 'contrato_emprestimo'
  | 'contrato_financiamento'
  | 'renegociacao_cartao'
  | 'fatura_cartao'
  | 'extrato_bancario'
  | 'comprovante_pagamento'
  | 'comprovante_transferencia'
  | 'documento_investimento'
  | 'outros';

export type StatusProcessamento =
  | 'PENDENTE'
  | 'PROCESSANDO'
  | 'AGUARDANDO_CONFIRMACAO'
  | 'PROCESSADO'
  | 'ERRO';

// 1. CONTRATO DE EMPRÉSTIMO OU FINANCIAMENTO
export interface ParcelaObrigacao {
  numero_parcela: number;
  valor: number;
  data_vencimento: string; // YYYY-MM-DD
}

export interface DadosContratoEmprestimo {
  tipo_divida: 'emprestimo_pessoal' | 'financiamento_veiculo' | 'financiamento_imobiliario' | 'credito_consignado' | 'outros';
  descricao: string;
  instituicao: string;
  valor_original: number; // Valor líquido liberado
  valor_total_com_juros: number; // Soma total das parcelas / CET
  quantidade_parcelas: number;
  valor_parcela: number;
  data_contratacao: string; // YYYY-MM-DD
  data_primeira_parcela: string; // YYYY-MM-DD
  taxa_juros_mensal?: number;
  cet_anual?: number;
  parcelas: ParcelaObrigacao[];
}

// 2. RENEGOCIAÇÃO DE CARTÃO
export interface DadosRenegociacaoCartao {
  tipo_divida: 'renegociacao_cartao';
  descricao: string;
  instituicao: string;
  cartao_nome_ou_final?: string;
  valor_original: number;
  valor_total_com_juros: number;
  quantidade_parcelas: number;
  valor_parcela: number;
  data_acordo: string; // YYYY-MM-DD
  data_primeira_parcela: string; // YYYY-MM-DD
  fatura_origem_identificador?: string;
  parcelas: ParcelaObrigacao[];
}

// 3. FATURA DE CARTÃO DE CRÉDITO
export interface ItemFatura {
  data: string; // YYYY-MM-DD
  descricao: string;
  valor: number;
  categoria_sugerida: string;
  parcela_atual?: number;
  total_parcelas?: number;
  terceiro?: boolean;
  nome_terceiro?: string;
}

export interface PagamentoFaturaDetectado {
  data: string; // YYYY-MM-DD
  descricao: string;
  valor: number;
}

export interface DadosFaturaCartao {
  cartao_nome_ou_final: string;
  mes_referencia: string; // YYYY-MM
  data_fechamento: string; // YYYY-MM-DD
  data_vencimento: string; // YYYY-MM-DD
  valor_total: number;
  itens: ItemFatura[];
  pagamentos?: PagamentoFaturaDetectado[];
}

// 4. EXTRATO BANCÁRIO
export interface TransacaoExtrato {
  data: string; // YYYY-MM-DD
  descricao: string;
  valor: number;
  tipo: 'RECEITA' | 'DESPESA' | 'TRANSFERENCIA' | 'PAGAMENTO_DIVIDA' | 'PAGAMENTO_FATURA' | 'APORTE' | 'RESGATE';
  categoria_sugerida: string;
  subtipo?: 'APLICACAO_RDB' | 'RESGATE_RDB' | 'TRANSFERENCIA_PROPRIA' | null;
  principal?: number;
  rendimento?: number;
  documento_numero?: string;
  favorecido?: string;
  parcela_atual?: number;
  total_parcelas?: number;
  terceiro?: boolean;
  nome_terceiro?: string;
}

export interface DadosExtratoBancario {
  conta_nome_ou_banco: string;
  data_inicio?: string;
  data_fim?: string;
  transacoes: TransacaoExtrato[];
}

// 5. COMPROVANTE DE PAGAMENTO
export interface DadosComprovantePagamento {
  data: string; // YYYY-MM-DD
  valor: number;
  instituicao: string;
  descricao: string;
  tipo_pagamento_sugerido: 'parcela_divida' | 'fatura_cartao' | 'despesa_geral';
  identificadores?: {
    codigo_barras?: string;
    linha_digitavel?: string;
    autenticacao?: string;
  };
  divida_ou_parcela_sugerida?: string;
}

// 6. COMPROVANTE DE TRANSFERÊNCIA
export interface DadosComprovanteTransferencia {
  data: string; // YYYY-MM-DD
  valor: number;
  banco_origem: string;
  banco_destino: string;
  favorecido: string;
  cpf_cnpj?: string;
  descricao: string;
}

// 7. DOCUMENTO DE INVESTIMENTO
export interface DadosDocumentoInvestimento {
  ativo: string;
  tipo: string;
  instituicao: string;
  valor_investido: number;
  valor_atual?: number;
  data: string; // YYYY-MM-DD
  quantidade?: number;
}

// RESPOSTA ESTRUTURADA GERAL RETORNADA PELA IA
export type DadosExtraidos =
  | { tipo_documento: 'contrato_emprestimo' | 'contrato_financiamento'; dados: DadosContratoEmprestimo }
  | { tipo_documento: 'renegociacao_cartao'; dados: DadosRenegociacaoCartao }
  | { tipo_documento: 'fatura_cartao'; dados: DadosFaturaCartao }
  | { tipo_documento: 'extrato_bancario'; dados: DadosExtratoBancario }
  | { tipo_documento: 'comprovante_pagamento'; dados: DadosComprovantePagamento }
  | { tipo_documento: 'comprovante_transferencia'; dados: DadosComprovanteTransferencia }
  | { tipo_documento: 'documento_investimento'; dados: DadosDocumentoInvestimento }
  | { tipo_documento: 'outros'; dados: Record<string, any> };

export interface ExtracaoIAOutput {
  tipo_documento: TipoDocumento;
  confianca: number; // 0.0 a 1.0
  resumo: string;
  dados: any;
}

// MODELO DA TABELA documentos_importados
export interface DocumentoImportado {
  id: string;
  usuario_id: string;
  nome_arquivo: string;
  hash_arquivo: string;
  tamanho_bytes?: number;
  mime_type?: string;
  tipo_documento: TipoDocumento;
  status: StatusProcessamento;
  confianca: number;
  dados_extraidos: DadosExtraidos;
  erro?: string;
  resultado_importacao?: Record<string, any>;
  criado_em: string;
  processado_em?: string;
}

// OPÇÕES DE IMPORTAÇÃO CONFIRMADA PELO USUÁRIO
export interface ConfirmacaoImportacaoPayload {
  documento_id: string;
  conta_id?: string;
  cartao_id?: string;
  fatura_origem_id?: string;
  divida_id?: string;
  parcela_id?: string;
  dados_ajustados?: any;
}

// 8. REPRESENTAÇÃO SEMÂNTICA NORMALIZADA (REGRA DE INTERPRETAÇÃO DA IA)
export type NaturezaLancamento =
  | 'COMPRA'
  | 'PARCELA'
  | 'PAGAMENTO_FATURA'
  | 'TRANSFERENCIA'
  | 'RECEITA'
  | 'ESTORNO'
  | 'SAQUE'
  | 'LIMITE_CONVERTIDO'
  | 'JUROS'
  | 'TARIFA'
  | 'AJUSTE'
  | 'OUTRO';

export interface LancamentoNormalizado {
  id?: string;
  data: string; // YYYY-MM-DD
  descricaoOriginal: string;
  descricaoNormalizada: string;
  valorOriginal: number; // Preserva o dado bruto do CSV/PDF
  valorFinanceiro: number; // Valor monetário positivo absoluto
  natureza: NaturezaLancamento;
  sinalOriginal: number; // -1 ou +1
  confianca: number; // 0.0 a 1.0
  categoria_sugerida?: string;
  parcela_atual?: number;
  total_parcelas?: number;
  cartao_id?: string | null;
  conta_id?: string | null;
  fatura_id?: string | null;
  fatura_mes_ref?: string | null;
  duplicata_detectada?: boolean;
  duplicata_motivo?: string;
  ignorar?: boolean;
  metadata?: Record<string, any>;
}

export interface CausaDivergenciaFatura {
  tipo: 'pagamento_identificado' | 'juros_encargos' | 'saldo_anterior' | 'operacao_limite' | 'estorno' | 'parcelamento' | 'outro';
  descricao: string;
  valor: number;
}

export interface ValidacaoTotalFatura {
  totalInformadoBanco: number;
  totalCalculado: number;
  diferenca: number;
  bateComBanco: boolean;
  toleranciaCentavos: number;
  possiveisCausas: CausaDivergenciaFatura[];
  resumoAuditoria: string;
}

// Runtime exports para compatibilidade total com bundling no Vite e imports em dev
export const DOCUMENTOS_IMPORTADOS_TYPES = {
  contrato_emprestimo: 'contrato_emprestimo',
  contrato_financiamento: 'contrato_financiamento',
  renegociacao_cartao: 'renegociacao_cartao',
  fatura_cartao: 'fatura_cartao',
  extrato_bancario: 'extrato_bancario',
  comprovante_pagamento: 'comprovante_pagamento',
  comprovante_transferencia: 'comprovante_transferencia',
  documento_investimento: 'documento_investimento',
  outros: 'outros'
} as const;

export const DadosContratoEmprestimo = {};
export const DadosRenegociacaoCartao = {};
export const ExtracaoIAOutput = {};
export const DocumentoImportado = {};
export const TipoDocumento = {};
export const StatusProcessamento = {};
export const ConfirmacaoImportacaoPayload = {};
export const LancamentoNormalizado = {};
export const ValidacaoTotalFatura = {};

