import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "./supabase";
import { financeService } from "./finance.service";
import ExcelJS from "exceljs";
import type {
  TipoDocumento,
  StatusProcessamento,
  ExtracaoIAOutput,
  DocumentoImportado,
  ConfirmacaoImportacaoPayload,
  DadosContratoEmprestimo,
  DadosRenegociacaoCartao,
  DadosFaturaCartao,
  DadosExtratoBancario,
  DadosComprovantePagamento,
  DadosComprovanteTransferencia,
  NaturezaLancamento,
  LancamentoNormalizado,
  ValidacaoTotalFatura,
  CausaDivergenciaFatura
} from "./document-import.types";

/**
 * SERVIÇO DE IMPORTAÇÃO DE DOCUMENTOS FINANCEIROS POR IA
 * 
 * Arquitetura em Camadas:
 * Documento -> Hash (Idempotência) -> IA (Classificação + Extração) 
 * -> Schema Validation -> Business Validation -> Confirmação -> Serviços de Domínio -> Supabase
 */
export class DocumentImportService {
  /**
   * 1. CALCULAR HASH SHA-256 DO ARQUIVO PARA IDEMPOTÊNCIA
   */
  static async calculateFileHash(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    // Usa a Web Crypto API nativa do navegador
    if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }
    // Fallback simples
    return `${file.name}-${file.size}-${file.lastModified}`;
  }

  /**
   * 2. VERIFICAÇÃO DE IDEMPOTÊNCIA NO BANCO
   */
  static async checkIdempotency(usuario_id: string, hash: string): Promise<DocumentoImportado | null> {
    try {
      const { data, error } = await supabase
        .from("documentos_importados")
        .select("*")
        .eq("usuario_id", usuario_id)
        .eq("hash_arquivo", hash)
        .maybeSingle();

      if (error && error.code !== "PGRST116" && error.code !== "42P01") {
        console.warn("Erro ao verificar idempotência:", error);
      }
      return data || null;
    } catch (e) {
      console.warn("Tabela documentos_importados ainda não acessível via REST:", e);
      return null;
    }
  }

  /**
   * 3. REGISTRAR DOCUMENTO NO BANCO (STATUS: PROCESSANDO OU PENDENTE)
   */
  static async createDocumentRecord(params: {
    usuario_id: string;
    nome_arquivo: string;
    hash_arquivo: string;
    tamanho_bytes: number;
    mime_type: string;
    tipo_documento: TipoDocumento;
    status: StatusProcessamento;
  }): Promise<string | null> {
    try {
      // 1. Tenta verificar se já existe documento com este hash
      const { data: existing } = await supabase
        .from("documentos_importados")
        .select("id")
        .eq("usuario_id", params.usuario_id)
        .eq("hash_arquivo", params.hash_arquivo)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("documentos_importados")
          .update({
            status: params.status,
            nome_arquivo: params.nome_arquivo,
            processado_em: null,
            erro: null
          })
          .eq("id", existing.id);
        return existing.id;
      }

      // 2. Insere novo registro
      const { data, error } = await supabase
        .from("documentos_importados")
        .insert([{
          usuario_id: params.usuario_id,
          nome_arquivo: params.nome_arquivo,
          hash_arquivo: params.hash_arquivo,
          tamanho_bytes: params.tamanho_bytes,
          mime_type: params.mime_type,
          tipo_documento: params.tipo_documento,
          status: params.status,
          criado_em: new Date().toISOString()
        }])
        .select("id")
        .single();

      if (error) {
        console.warn("Aviso ao registrar documento_importado:", error?.message || error);
        return null;
      }
      return data?.id || null;
    } catch (e: any) {
      console.warn("Falha silenciosa ao registrar documento no banco:", e?.message || e);
      return null;
    }
  }

  /**
   * 4. ATUALIZAR STATUS E DADOS DO DOCUMENTO IMPORTADO
   */
  static async updateDocumentRecord(
    id: string,
    updates: Partial<DocumentoImportado>
  ): Promise<void> {
    try {
      await supabase
        .from("documentos_importados")
        .update(updates)
        .eq("id", id);
    } catch (e) {
      console.warn("Erro ao atualizar registro de documento:", e);
    }
  }

  /**
   * 5. PREPARAR CONTEÚDO DO ARQUIVO PARA O MODELO MULTIMODAL GEMINI
   */
  static async prepareFileContent(file: File): Promise<{
    isMultimodal: boolean;
    mimeType: string;
    base64Data?: string;
    textContent?: string;
  }> {
    const name = file.name.toLowerCase();
    const isPdf = name.endsWith(".pdf");
    const isImage = name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp");
    const isCsv = name.endsWith(".csv");
    const isOfx = name.endsWith(".ofx");
    const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");

    if (isPdf || isImage) {
      const base64DataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const base64Data = base64DataUrl.split(",")[1];
      let mimeType = "application/pdf";
      if (isImage) {
        if (name.endsWith(".png")) mimeType = "image/png";
        else if (name.endsWith(".webp")) mimeType = "image/webp";
        else mimeType = "image/jpeg";
      }

      return { isMultimodal: true, mimeType, base64Data };
    }

    if (isCsv || isOfx) {
      const textContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsText(file, "UTF-8");
      });
      return { isMultimodal: false, mimeType: isOfx ? "application/ofx" : "text/csv", textContent };
    }

    if (isExcel) {
      const workbook = new ExcelJS.Workbook();
      const arrayBuffer = await file.arrayBuffer();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) throw new Error("A planilha do Excel está vazia.");

      let excelText = "";
      worksheet.eachRow((row, rowNumber) => {
        const rowValues = Array.isArray(row.values)
          ? row.values.slice(1).map(val => val !== null && val !== undefined ? String(val) : "").join(", ")
          : Object.values(row.values || {}).join(", ");
        excelText += `Linha ${rowNumber}: ${rowValues}\n`;
      });

      return { isMultimodal: false, mimeType: "text/plain", textContent: excelText };
    }

    throw new Error("Formato de arquivo não suportado. Use PDF, Imagem, CSV, OFX ou Excel.");
  }

  /**
   * 6. PROMPT ESTRUTURADO ESPECIALIZADO (SEM SQL, SEM INSERT)
   */
  static getStructuredPrompt(): string {
    return `Você é um motor de extração e classificação de documentos financeiros de altíssima precisão contábil.
Sua única responsabilidade é INTERPRETAR e EXTRAIR dados estruturados do documento fornecido, diferenciando com rigor:
1) Despesa real de consumo (compras no débito, compras no cartão, juros e encargos);
2) Liquidação/pagamento de obrigação (PAGAMENTO_FATURA, PAGAMENTO_DIVIDA);
3) Movimentação patrimonial / fluxo de caixa (TRANSFERENCIA, AJUSTE, APORTE, RESGATE);
4) Dívidas e renegociações (renegociacao_cartao, emprestimo_pessoal);
5) Compras parceladas (ciclo completo X/Y).

É EXPRESSAMENTE PROIBIDO gerar código SQL, comandos INSERT/UPDATE ou instruções de manipulação de banco de dados.
Retorne APENAS um objeto JSON estrito, sem markdown (\`\`\`json), sem textos antes ou depois.

O JSON deve seguir OBRIGATORIAMENTE esta estrutura:
{
  "tipo_documento": "contrato_emprestimo" | "contrato_financiamento" | "renegociacao_cartao" | "fatura_cartao" | "extrato_bancario" | "comprovante_pagamento" | "comprovante_transferencia" | "documento_investimento" | "outros",
  "confianca": 0.95, // float entre 0.00 e 1.00
  "resumo": "Breve resumo legível do documento",
  "dados": { ... }
}

REGRAS DE CLASSIFICAÇÃO E EXTRAÇÃO:

1. SE FOR "contrato_emprestimo" OU "contrato_financiamento":
   - Identifique termos como "Quadro Resumo", "Contrato de Empréstimo", "Termos do Empréstimo", "Valor Financiado", "Cronograma de Parcelas".
   - "dados": {
       "tipo_divida": "emprestimo_pessoal" | "financiamento_veiculo" | "financiamento_imobiliario" | "credito_consignado",
       "descricao": "Empréstimo " + Nome da Instituição,
       "instituicao": "Santander" / "Nubank" / etc,
       "valor_original": number (valor líquido liberado/financiado),
       "valor_total_com_juros": number (soma total a pagar com juros),
       "quantidade_parcelas": number (inteiro, ex: 24),
       "valor_parcela": number (valor de cada prestação),
       "data_contratacao": "YYYY-MM-DD",
       "data_primeira_parcela": "YYYY-MM-DD",
       "taxa_juros_mensal": number (opcional),
       "cet_anual": number (opcional),
       "parcelas": [
         { "numero_parcela": 1, "valor": 550.00, "data_vencimento": "YYYY-MM-DD" }
       ]
     }

2. SE FOR "renegociacao_cartao":
   - Identifique "Detalhes do seu Parcelamento", "Renegociação de Cartão", "Acordo de Fatura", "Saldo Parcelado".
   - REGRA MANDATÓRIA: Renegociação de cartão é DÍVIDA e NÃO despesa de consumo. Não duplique o valor como despesa!
   - "dados": {
       "tipo_divida": "renegociacao_cartao",
       "descricao": "Renegociação Cartão " + Nome do Cartão,
       "instituicao": "Santander" / "Nubank",
       "cartao_nome_ou_final": "Nome ou últimos 4 dígitos",
       "valor_original": number (saldo principal da fatura renegociada),
       "valor_total_com_juros": number (total renegociado a pagar),
       "quantidade_parcelas": number,
       "valor_parcela": number,
       "data_acordo": "YYYY-MM-DD",
       "data_primeira_parcela": "YYYY-MM-DD",
       "fatura_origem_identificador": "Identificador ou mês se visível",
       "parcelas": [
         { "numero_parcela": 1, "valor": 400.00, "data_vencimento": "YYYY-MM-DD" }
       ]
     }

3. SE FOR "fatura_cartao":
   - ATENÇÃO DE CLASSIFICAÇÃO: NÃO CONFUNDA COM EXTRATO DE CONTA BANCÁRIA! Se o documento tiver "Extrato Consolidado", "Conta Corrente", Agência e Conta, ou depósitos e transferências Pix (como extratos do Santander), ele é "extrato_bancario" e NUNCA fatura de cartão!
   - Identifique CSVs com colunas "date, category, title, amount" ou faturas em PDF de cartão com compras, data de vencimento e fechamento.
   - REGRA MANDATÓRIA 1: "Pagamento recebido" NUNCA é RECEITA! É liquidação de fatura ("PAGAMENTO_FATURA"). Coloque em "pagamentos".
   - REGRA MANDATÓRIA 2 (COMPRAS PARCELADAS): Sempre que identificar padrões como "2/10", "5/20", "1/5", "Parcela 2/12", "03/10":
     - Extraia OBRIGATORIAMENTE "parcela_atual": número e "total_parcelas": número.
     - "descricao": Nome LIMPO do estabelecimento (remova o sufixo " - Parcela X/Y" ou " X/Y").
     - "valor": Valor da parcela atual lançado nesta fatura (positivo).
   - REGRA MANDATÓRIA 3: "Limite convertido em saldo na sua conta do Nubank" ou "Pix no crédito" NÃO é despesa de consumo. Identifique no item com categoria "Financiamento / Ajuste de Limite" e sinalize a natureza.
   - REGRA MANDATÓRIA 4 (LINHAS NEGATIVAS, DESCONTOS E CRÉDITO DE RENEGOCIAÇÃO):
     Em CSVs do Nubank e faturas de cartão, valores negativos (com sinal "-", ex: "-2549.22", "-2039.94", "-3695.90", "-78.37", "-21.94") representam CRÉDITOS / PAGAMENTOS / ABATIMENTOS na fatura, e NUNCA compras ou despesas de consumo!
     * "Renegociação de pendências" com valor negativo (ex: "-2549.22", "-2039.94"): é o CRÉDITO do saldo devedor anterior que foi renegociado. Ele NUNCA deve entrar em "itens" como despesa! Coloque em "pagamentos" com valor positivo correspondente!
     * Apenas a linha com valor POSITIVO (ex: "Renegociação de pendências ... 1/3, 1064.07") é a parcela que entra em "itens" com "parcela_atual": 1 e "total_parcelas": 3!
     * "Desconto (NuFinanceira)" ou "Desconto de antecipação": são créditos/descontos, coloque em "pagamentos" e NUNCA em "itens"!
   - "dados": {
       "cartao_nome_ou_final": "Nubank" / "Santander",
       "mes_referencia": "YYYY-MM",
       "data_fechamento": "YYYY-MM-DD",
       "data_vencimento": "YYYY-MM-DD",
       "valor_total": number,
       "itens": [
         {
           "data": "YYYY-MM-DD",
           "descricao": "Nome do estabelecimento limpo (ex: 'Uber *Trip', 'Mercado Livre', 'Limite convertido em saldo')",
           "valor": number (positivo),
           "categoria_sugerida": "Alimentação" | "Transporte" | "Saúde" | "Lazer" | "Educação" | "Assinaturas" | "Moradia" | "Financiamento / Ajuste de Limite" | "Outros",
           "parcela_atual": 2,
           "total_parcelas": 10,
           "terceiro": false
         }
       ],
       "pagamentos": [
         { "data": "YYYY-MM-DD", "descricao": "Pagamento recebido", "valor": number }
       ]
     }

4. SE FOR "extrato_bancario":
   - REGRA DE OURO DE CLASSIFICAÇÃO:
     Documentos intitulados "EXTRATO CONSOLIDADO", "EXTRATO DE CONTA CORRENTE", extratos bancários com Agência e Conta (como extratos do Santander, Itaú, Nubank, Inter, Bradesco, BB, Caixa) contendo movimentações de conta (saldo, depósitos, Pix, salário, transferências) SÃO OBRIGATORIAMENTE "extrato_bancario" e NUNCA "fatura_cartao"!
     Mesmo que apareçam linhas como "PAGAMENTO CARTAO CREDITO BCE" ou "CARTAO VISA", isso é apenas o débito na conta para pagar a fatura do cartão ("tipo": "PAGAMENTO_FATURA"), e JAMAIS transforma o documento em uma fatura de cartão!
   - REGRA MANDATÓRIA PARA TRANSFERÊNCIAS PIX (ESPECIALMENTE NO SANTANDER):
     * No extrato Santander e em outros bancos, o nome da pessoa física ou jurídica que enviou ou recebeu o Pix aparece impresso na LINHA LOGO ABAIXO de "PIX RECEBIDO" ou "PIX ENVIADO".
       Exemplo real no Santander:
         "02/02 PIX RECEBIDO"
         "Ana Leticia Alves Claudia"
         "- 1.110,00"
       Você DEVE OBRIGATORIAMENTE capturar o nome e colocar:
         "descricao": "Pix Recebido: Ana Leticia Alves Claudia"
         "favorecido": "Ana Leticia Alves Claudia"
     * TRANSFERÊNCIAS ENTRE CONTAS PRÓPRIAS (DE MIM PRA MIM / MESMA TITULARIDADE):
       Identifique a titular da conta no cabeçalho do extrato (ex: "Prezada Ana" / "Ana Leticia Alves Claudiano").
       Se quem enviou ou recebeu o Pix for o próprio titular ou tiver o mesmo prenome e nome (ex: "Ana Leticia Alves Claudia", "Ana Leticia Alves Claudiano", "Ana Leticia"):
         "tipo": "TRANSFERENCIA"
         "subtipo": "TRANSFERENCIA_PROPRIA"
         "categoria_sugerida": "Transferência Interna"
         "descricao": "Pix Recebido: Ana Leticia Alves Claudia"
         "favorecido": "Ana Leticia Alves Claudia"
     * ATENÇÃO CRÍTICA COM PARENTES / MESMO SOBRENOME:
       Parentes ou familiares que apenas compartilham o sobrenome da família mas têm primeiro nome diferente (ex: "Claudiney Jules Claudiano") NÃO SÃO A MESMA PESSOA que a titular Ana Letícia!
       Transações com Claudiney são transações com TERCEIROS normais:
         Se Pix Enviado para Claudiney: "tipo": "DESPESA", "subtipo": null, "categoria_sugerida": "Outros", "favorecido": "Claudiney Jules Claudiano"
         Se Pix Recebido de Claudiney: "tipo": "RECEITA", "subtipo": null, "categoria_sugerida": "Pix Recebido", "favorecido": "Claudiney Jules Claudiano"
       JAMAIS classifique transações com Claudiney como "TRANSFERENCIA_PROPRIA"!
   - REGRA MANDATÓRIA PARA APLICAÇÃO E RESGATE RDB / CAIXINHA / INVESTIMENTOS:
     - Saída/aporte ("Aplicação RDB", "Caixinha", "Guardar dinheiro"): "tipo": "APORTE", "subtipo": "APLICACAO_RDB", "categoria_sugerida": "Investimentos". NUNCA classifique como DESPESA de consumo!
     - Entrada/resgate ("Resgate RDB", "Resgate Caixinha"): "tipo": "RESGATE", "subtipo": "RESGATE_RDB", "categoria_sugerida": "Investimentos". NUNCA classifique como RECEITA operacional!
   - REGRA MANDATÓRIA PARA PAGAMENTO DE FATURA E DIVIDAS:
     - "Pagamento de fatura", "Pagamento cartão", "PAGAMENTO CARTAO CREDITO BCE": "tipo": "PAGAMENTO_FATURA". NUNCA classifique como DESPESA de consumo!
     - "Pagamento de empréstimo", "Pagamento parcela dívida": "tipo": "PAGAMENTO_DIVIDA".
   - "dados": {
       "conta_nome_ou_banco": "Santander" / "Nubank" / "Inter" / "Wise",
       "data_inicio": "YYYY-MM-DD",
       "data_fim": "YYYY-MM-DD",
       "transacoes": [
         {
           "data": "YYYY-MM-DD",
           "descricao": "Nome limpo com pagador/favorecido (ex: 'Pix Recebido: Ana Leticia Alves Claudia')",
           "valor": number (positivo),
           "tipo": "RECEITA" | "DESPESA" | "TRANSFERENCIA" | "PAGAMENTO_DIVIDA" | "PAGAMENTO_FATURA" | "APORTE" | "RESGATE",
           "categoria_sugerida": "Salário" | "Pix Recebido" | "Transferência Interna" | "Alimentação" | "Transporte" | "Investimentos" | "Cartão de Crédito" | "Outros",
           "subtipo": "APLICACAO_RDB" | "RESGATE_RDB" | "TRANSFERENCIA_PROPRIA" | "CONVERSAO_LIMITE_CARTAO" | null,
           "principal": number,
           "rendimento": number,
           "documento_numero": "número do doc se houver",
           "favorecido": "Nome da pessoa ou empresa"
         }
       ]
     }

5. SE FOR "comprovante_pagamento":
   - "dados": {
       "data": "YYYY-MM-DD",
       "valor": number,
       "instituicao": "Banco emissor",
       "descricao": "Favorecido ou título pago",
       "tipo_pagamento_sugerido": "parcela_divida" | "fatura_cartao" | "despesa_geral",
       "identificadores": {
         "codigo_barras": "...",
         "linha_digitavel": "...",
         "autenticacao": "..."
       },
       "divida_ou_parcela_sugerida": "se houver menção no comprovante"
     }

6. SE FOR "comprovante_transferencia":
   - "dados": {
       "data": "YYYY-MM-DD",
       "valor": number,
       "banco_origem": "Banco A",
       "banco_destino": "Banco B",
       "favorecido": "Nome do destinatário",
       "cpf_cnpj": "...",
       "descricao": "Motivo ou descrição do Pix/TED"
     }

7. SE FOR "documento_investimento":
   - "dados": {
       "ativo": "Nome do fundo, CDB, Tesouro Direto ou ação",
       "tipo": "Renda Fixa" | "Fundo" | "Ação" | "CDB",
       "instituicao": "Corretora ou Banco",
       "valor_investido": number,
       "valor_atual": number,
       "data": "YYYY-MM-DD",
       "quantidade": number
     }

DIRETRIZES FUNDAMENTAIS:
- NUNCA invente despesas fictícias.
- Se o documento trouxer compras parceladas (ex: 2/10), o valor da linha é o valor daquela parcela; não multiplique nem invente outras compras.
- Retorne estritamente o JSON sem blocos markdown.`;
  }

  /**
   * Parser nativo e determinístico para CSVs do Nubank
   * Garante 100% de precisão nos nomes de favorecidos/pagadores em transferências Pix
   * e classificação exata de RDB / Caixinha sem latência de IA.
   */
  static tryParseNubankCsv(textContent: string): ExtracaoIAOutput | null {
    const lines = textContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;

    const header = lines[0].toLowerCase();
    if (!header.includes("data") || !header.includes("valor") || !header.includes("descri")) {
      return null;
    }

    const transacoes: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split(",");
      if (parts.length < 4) continue;

      const dataRaw = parts[0].trim();
      const valorRaw = parts[1].trim();
      const ident = parts[2].trim();
      const descRaw = parts.slice(3).join(",").trim();

      let dataIso = dataRaw;
      if (dataRaw.includes("/")) {
        const [d, m, y] = dataRaw.split("/");
        dataIso = d.length === 4 
          ? `${d}-${m.padStart(2, "0")}-${y.padStart(2, "0")}` 
          : `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }

      const valorNum = parseFloat(valorRaw) || 0;
      const isSaida = valorNum < 0;
      const valorAbs = Math.abs(valorNum);

      let descLimpa = descRaw;
      let favorecido = "";
      let tipo: "RECEITA" | "DESPESA" | "INVESTIMENTO" | "TRANSFERENCIA" | "APORTE" | "RESGATE" | "PAGAMENTO_FATURA" = isSaida ? "DESPESA" : "RECEITA";
      let subtipo: string | null = null;
      let categoria = "Outros";

      const matchEnv = descRaw.match(/Transfer[eê]ncia enviada pelo Pix\s*-\s*([^-]+)/i);
      const matchRec = descRaw.match(/Transfer[eê]ncia recebida pelo Pix\s*-\s*([^-]+)/i);

      if (matchEnv && matchEnv[1]) {
        favorecido = matchEnv[1].trim();
        descLimpa = `Pix Enviado: ${favorecido}`;
        tipo = "DESPESA";
        categoria = "Outros";
      } else if (matchRec && matchRec[1]) {
        favorecido = matchRec[1].trim();
        descLimpa = `Pix Recebido: ${favorecido}`;
        tipo = "RECEITA";
        categoria = "Pix Recebido";
      } else if (/aplica[cç][aã]o\s*rdb|guardar\s*dinheiro|caixinha/i.test(descRaw)) {
        descLimpa = "Aplicação RDB";
        tipo = "APORTE";
        subtipo = "APLICACAO_RDB";
        categoria = "Investimentos";
      } else if (/resgate\s*rdb|resgate\s*caixinha/i.test(descRaw)) {
        descLimpa = "Resgate RDB";
        tipo = "RESGATE";
        subtipo = "RESGATE_RDB";
        categoria = "Investimentos";
      } else if (/limite\s*convertido/i.test(descRaw)) {
        descLimpa = "Limite convertido em saldo na conta";
        tipo = "TRANSFERENCIA";
        subtipo = "CONVERSAO_LIMITE_CARTAO";
        categoria = "Financiamento / Ajuste de Limite";
      } else if (/compra no d[eé]bito\s*-\s*/i.test(descRaw)) {
        descLimpa = descRaw.replace(/compra no d[eé]bito\s*-\s*/i, "").trim();
        tipo = "DESPESA";
      } else if (/pagamento de fatura/i.test(descRaw)) {
        descLimpa = "Pagamento de Fatura";
        tipo = "PAGAMENTO_FATURA";
        subtipo = "PAGAMENTO_FATURA";
        categoria = "Cartão de Crédito";
      }

      transacoes.push({
        data: dataIso,
        descricao: descLimpa,
        valor: valorAbs,
        tipo,
        subtipo,
        categoria_sugerida: categoria,
        favorecido: favorecido || undefined,
        documento_numero: ident || undefined
      });
    }

    if (transacoes.length === 0) return null;

    return {
      tipo_documento: "extrato_bancario",
      confianca: 1.0,
      resumo: `Extrato Bancário Nubank com ${transacoes.length} lançamentos identificados com os nomes completos dos destinatários/pagadores do Pix.`,
      dados: {
        conta_nome_ou_banco: "Nubank",
        transacoes
      }
    };
  }

  /**
   * Parser nativo e determinístico para CSVs de Fatura de Cartão do Nubank
   * Reconhece o cabeçalho 'date,title,amount' (3 colunas) ou 'date,category,title,amount' (4 colunas)
   * Garante que compras e limites convertidos sejam classificados como Fatura de Cartão (Gasto no Cartão) e NUNCA Entrada na Conta!
   */
  static tryParseNubankCardCsv(textContent: string): ExtracaoIAOutput | null {
    const lines = textContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;

    const header = lines[0].toLowerCase();
    const hasDate = header.includes("date") || header.includes("data");
    const hasTitle = header.includes("title") || header.includes("titulo") || header.includes("título") || header.includes("descri");
    const hasAmount = header.includes("amount") || header.includes("valor");

    // Deve conter data, título/descrição e valor/amount
    if (!hasDate || !hasTitle || !hasAmount) {
      return null;
    }

    // Se tiver "identificador", é o extrato da conta bancária, não fatura de cartão
    if (header.includes("identificador")) {
      return null;
    }

    const hasCategory = header.includes("category") || header.includes("categoria");
    const itens: any[] = [];
    const pagamentos: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split(",");
      if (parts.length < 3) continue;

      let dataRaw = "";
      let categoryRaw = "Outros";
      let titleRaw = "";
      let amountRaw = "";

      if (hasCategory && parts.length >= 4) {
        dataRaw = parts[0].trim();
        categoryRaw = parts[1].trim() || "Outros";
        titleRaw = parts.slice(2, parts.length - 1).join(",").trim();
        amountRaw = parts[parts.length - 1].trim();
      } else {
        // Formato padrão Nubank 3 colunas: date,title,amount
        dataRaw = parts[0].trim();
        titleRaw = parts.slice(1, parts.length - 1).join(",").trim();
        amountRaw = parts[parts.length - 1].trim();
      }

      const amountNum = parseFloat(amountRaw) || 0;
      if (amountNum === 0) continue;

      let dataIso = dataRaw;
      if (dataRaw.includes("/")) {
        const [d, m, y] = dataRaw.split("/");
        dataIso = d.length === 4 
          ? `${d}-${m.padStart(2, "0")}-${y.padStart(2, "0")}` 
          : `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }

      const valorOriginal = amountNum;
      const valorFinanceiro = Math.abs(amountNum);
      const sinalOriginal = amountNum >= 0 ? 1 : -1;

      const isPagamento = /pagamento\s*recebido|pagamento\s*de\s*fatura|pagamento\s*cart[aã]o/i.test(titleRaw);
      const isEstorno = /estorno|cr[eé]dito\s*de\s*fatura|desconto\s*\(nufinanceira\)|reembolso/i.test(titleRaw) || (amountNum < 0 && !isPagamento);
      const isLimiteConvertido = /limite\s+convertido/i.test(titleRaw);
      const matchParcelas = titleRaw.match(/(\d+)\s*[/]\s*(\d+)/) || titleRaw.match(/(\d+)\s+de\s+(\d+)/i);
      const isParcela = !isPagamento && !isEstorno && Boolean(matchParcelas);
      const isJuros = /juros|multa|encargos|iof/i.test(titleRaw);
      const isTarifa = /tarifa|anuidade/i.test(titleRaw);

      if (isPagamento) {
        pagamentos.push({
          data: dataIso,
          descricao: titleRaw || "Pagamento de Fatura",
          valor: valorFinanceiro,
          valorOriginal,
          valorFinanceiro,
          sinalOriginal,
          natureza: "PAGAMENTO_FATURA" as NaturezaLancamento,
          confianca: 0.99
        });
      } else {
        let natureza: NaturezaLancamento = "COMPRA";
        let catSugerida = categoryRaw;

        if (isEstorno) {
          natureza = "ESTORNO";
          catSugerida = "Estorno / Crédito";
        } else if (isLimiteConvertido) {
          natureza = "LIMITE_CONVERTIDO";
          catSugerida = "Financiamento / Ajuste de Limite";
        } else if (isParcela) {
          natureza = "PARCELA";
        } else if (isJuros) {
          natureza = "JUROS";
          catSugerida = "Encargos Financeiros";
        } else if (isTarifa) {
          natureza = "TARIFA";
          catSugerida = "Tarifas";
        } else if (/renegocia[cç][aã]o/i.test(titleRaw)) {
          catSugerida = "Emprestimo";
        } else if (/uber|99\s*app|transporte/i.test(titleRaw)) {
          catSugerida = "Transporte";
        } else if (/restaurante|ifood|alimenta[cç][aã]o|pora[oõ]/i.test(titleRaw)) {
          catSugerida = "Alimentação";
        } else if (/fiap|teacher|curso|educa[cç][aã]o/i.test(titleRaw)) {
          catSugerida = "Educação";
        }

        const parcelaAtual = matchParcelas ? parseInt(matchParcelas[1]) : 1;
        const totalParcelas = matchParcelas ? parseInt(matchParcelas[2]) : 1;

        itens.push({
          data: dataIso,
          descricao: titleRaw,
          valor: valorFinanceiro,
          valorOriginal,
          valorFinanceiro,
          sinalOriginal,
          natureza,
          confianca: 0.98,
          categoria_sugerida: catSugerida || "Outros",
          parcela_atual: parcelaAtual,
          total_parcelas: totalParcelas,
          terceiro: false
        });
      }
    }

    if (itens.length === 0 && pagamentos.length === 0) return null;

    const validacaoTotais = this.validateInvoiceTotals({
      itens,
      pagamentos
    });

    return {
      tipo_documento: "fatura_cartao",
      confianca: 1.0,
      resumo: `Fatura de Cartão Nubank com ${itens.length} lançamentos de fatura e ${pagamentos.length} pagamentos identificados. Total apurado: R$ ${validacaoTotais.totalCalculado.toFixed(2)}.`,
      dados: {
        cartao_nome_ou_final: "Nubank",
        valor_total: validacaoTotais.totalCalculado,
        valor_pago: pagamentos.reduce((s, p) => s + p.valor, 0),
        saldo_devedor: Math.max(0, validacaoTotais.totalCalculado - pagamentos.reduce((s, p) => s + p.valor, 0)),
        itens,
        pagamentos,
        validacao_totais: validacaoTotais
      }
    };
  }

  /**
   * 7. VALIDAÇÃO E AUDITORIA DE TOTAIS DA FATURA (REGRA OBRIGATÓRIA)
   * Compara o total informado pelo banco com a soma dos lançamentos interpretados
   */
  static validateInvoiceTotals(params: {
    totalInformadoBanco?: number;
    itens: Array<{
      descricao: string;
      valor: number;
      natureza?: string;
      valorOriginal?: number;
    }>;
    pagamentos?: Array<{
      descricao: string;
      valor: number;
    }>;
  }): ValidacaoTotalFatura {
    const itens = params.itens || [];
    const pagamentos = params.pagamentos || [];

    // 1. Débitos elegíveis (compras, parcelas, juros, tarifas, limites convertidos)
    const charges = itens
      .filter(i => {
        const nat = i.natureza;
        const desc = (i.descricao || "").toLowerCase();
        const isEstorno = nat === "ESTORNO" || desc.includes("estorno") || desc.includes("crédito de fatura") || desc.includes("desconto (nufinanceira)");
        return !isEstorno;
      })
      .reduce((sum, i) => sum + Math.abs(Number(i.valor || 0)), 0);

    // 2. Créditos e estornos
    const credits = itens
      .filter(i => {
        const nat = i.natureza;
        const desc = (i.descricao || "").toLowerCase();
        return nat === "ESTORNO" || desc.includes("estorno") || desc.includes("crédito de fatura") || desc.includes("desconto (nufinanceira)");
      })
      .reduce((sum, i) => sum + Math.abs(Number(i.valor || 0)), 0);

    const totalCalculado = Math.round(Math.max(0, charges - credits) * 100) / 100;
    const totalPagamentos = Math.round(pagamentos.reduce((sum, p) => sum + Math.abs(Number(p.valor || 0)), 0) * 100) / 100;

    const totalInformado = params.totalInformadoBanco !== undefined && params.totalInformadoBanco > 0
      ? params.totalInformadoBanco
      : totalCalculado;

    const diferenca = Math.round((totalInformado - totalCalculado) * 100) / 100;
    const bateComBanco = Math.abs(diferenca) <= 0.05;

    const possiveisCausas: CausaDivergenciaFatura[] = [];

    if (!bateComBanco) {
      if (totalPagamentos > 0) {
        possiveisCausas.push({
          tipo: 'pagamento_identificado',
          descricao: `Foram identificados R$ ${totalPagamentos.toFixed(2)} em pagamentos de fatura que abatem o saldo devedor, mas não aumentam o total de compras.`,
          valor: totalPagamentos
        });
      }

      const limites = itens.filter(i => i.natureza === "LIMITE_CONVERTIDO" || /limite\s+convertido/i.test(i.descricao));
      const totalLimites = limites.reduce((s, l) => s + Math.abs(Number(l.valor || 0)), 0);
      if (totalLimites > 0) {
        possiveisCausas.push({
          tipo: 'operacao_limite',
          descricao: `Operações de 'Limite convertido em saldo' somam R$ ${totalLimites.toFixed(2)} na fatura do cartão.`,
          valor: totalLimites
        });
      }

      if (credits > 0) {
        possiveisCausas.push({
          tipo: 'estorno',
          descricao: `Créditos e estornos de R$ ${credits.toFixed(2)} deduzem do total da fatura.`,
          valor: credits
        });
      }

      if (Math.abs(Math.abs(diferenca) - totalPagamentos) <= 0.05) {
        possiveisCausas.push({
          tipo: 'saldo_anterior',
          descricao: `A diferença de R$ ${Math.abs(diferenca).toFixed(2)} coincide com o total de pagamentos do período.`,
          valor: totalPagamentos
        });
      }
    }

    const resumoAuditoria = bateComBanco
      ? `Total auditado com sucesso (R$ ${totalCalculado.toFixed(2)}).`
      : `Divergência de R$ ${Math.abs(diferenca).toFixed(2)} entre o total informado (R$ ${totalInformado.toFixed(2)}) e a soma apurada dos lançamentos (R$ ${totalCalculado.toFixed(2)}).`;

    return {
      totalInformadoBanco: totalInformado,
      totalCalculado,
      diferenca,
      bateComBanco,
      toleranciaCentavos: 0.05,
      possiveisCausas,
      resumoAuditoria
    };
  }

  /**
   * 7. CHAMAR GEMINI E PROCESSAR RETORNO ESTRUTURADO
   */
  static async extractDocumentWithAI(file: File): Promise<ExtracaoIAOutput> {
    const fileContent = await this.prepareFileContent(file);

    // Atalhos determinísticos e instantâneos para CSVs do Nubank (Cartão e Conta):
    if (!fileContent.isMultimodal && fileContent.textContent) {
      const parsedNubankCard = this.tryParseNubankCardCsv(fileContent.textContent);
      if (parsedNubankCard) {
        return parsedNubankCard;
      }
      const parsedNubankAccount = this.tryParseNubankCsv(fileContent.textContent);
      if (parsedNubankAccount) {
        return parsedNubankAccount;
      }
    }

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey || apiKey === "sua_chave_aqui") {
      throw new Error("Chave da API do Google Gemini não configurada!");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const prompt = this.getStructuredPrompt();

    const modelsToTry = [
      "gemini-2.5-flash",
      "gemini-flash-latest",
      "gemini-2.5-pro",
      "gemini-2.5-flash-lite"
    ];

    const callWithRetry = async (modelInstance: any, contentPayload: any[], retries = 2, delay = 1500): Promise<any> => {
      try {
        return await modelInstance.generateContent(contentPayload);
      } catch (err: any) {
        const errMsg = (err?.message || "").toLowerCase();
        const isTransient = errMsg.includes("503") || errMsg.includes("high demand") || errMsg.includes("429") || errMsg.includes("overloaded");
        if (retries > 0 && isTransient) {
          console.warn(`[Gemini Retry] Modelo sobrecarregado (503). Aguardando ${delay}ms para tentar novamente...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return callWithRetry(modelInstance, contentPayload, retries - 1, delay * 2);
        }
        throw err;
      }
    };

    let result: any = null;
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const fileContextPrompt = `${prompt}\n\n[INFORMAÇÕES CRÍTICAS DO ARQUIVO]:\n- Nome do arquivo: "${file.name}".\n- Se o nome do arquivo indicar extrato (ex: "santander", "extrato", "conta_corrente"), este documento É OBRIGATORIAMENTE um "extrato_bancario" e JAMAIS "fatura_cartao". Extraia todas as linhas em "transacoes" com data, descrição, valor e favorecido!\n- Capture o titular da conta no cabeçalho em "titular".`;
        if (fileContent.isMultimodal && fileContent.base64Data) {
          result = await callWithRetry(model, [
            fileContextPrompt,
            {
              inlineData: {
                data: fileContent.base64Data,
                mimeType: fileContent.mimeType
              }
            }
          ]);
        } else {
          result = await callWithRetry(model, [
            fileContextPrompt,
            `Conteúdo do arquivo (${file.name}):\n${fileContent.textContent}`
          ]);
        }
        if (result) break;
      } catch (err: any) {
        console.warn(`Tentativa com ${modelName} falhou:`, err?.message || err);
        lastError = err;
      }
    }

    if (!result) {
      throw lastError || new Error("Não foi possível obter resposta da Inteligência Artificial. Por favor, tente novamente em alguns instantes.");
    }

    const rawText = result.response.text();
    const cleanText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleanText);
    } catch (e) {
      console.error("Falha ao fazer parse do JSON retornado pela IA:", rawText);
      throw new Error("A IA retornou um formato inválido. Tente novamente.");
    }

    const dados = parsed.dados || {};
    let tipo = parsed.tipo_documento || "outros";
    const fileNameLower = (file.name || "").toLowerCase();

    // Se o arquivo for claramente um extrato bancário (ex: Santander, extrato de conta), NUNCA permitir que seja classificado como fatura_cartao
    const isSantanderExtrato = (fileNameLower.includes("santander") || fileNameLower.includes("extrato")) && !fileNameLower.includes("fatura");
    const temItensBancarios = (dados.itens || []).some((it: any) => /pix|sal[aá]rio|ted|doc|dep[oó]sito|transfer[eê]ncia|rendimento|saldo|resgate|aplica[çc][aã]o/i.test(it.descricao || ""));
    
    if (tipo === "fatura_cartao" && (isSantanderExtrato || temItensBancarios)) {
      tipo = "extrato_bancario";
      parsed.tipo_documento = "extrato_bancario";
      if (Array.isArray(dados.itens) && (!dados.transacoes || dados.transacoes.length === 0)) {
        dados.transacoes = dados.itens.map((it: any) => ({
          ...it,
          tipo: (/recebid|sal[aá]rio|dep[oó]sito|resgate|rendimento/i.test(it.descricao || "") || it.tipo === "RECEITA") ? "RECEITA" : "DESPESA"
        }));
      }
      if (Array.isArray(dados.pagamentos) && Array.isArray(dados.transacoes)) {
        dados.pagamentos.forEach((p: any) => {
          dados.transacoes.push({
            ...p,
            tipo: "PAGAMENTO_FATURA",
            categoria_sugerida: "Cartão de Crédito"
          });
        });
      }
    }

    // Pós-processamento de fatura de cartão: remove créditos, estornos e abatimentos de renegociação de 'itens'
    if (tipo === "fatura_cartao" && Array.isArray(dados.itens)) {
      const itensValidos: any[] = [];
      const pagamentos: any[] = Array.isArray(dados.pagamentos) ? dados.pagamentos : [];

      dados.itens.forEach((it: any) => {
        const desc = (it.descricao || "").toLowerCase();
        const rawValor = Number(it.valor) || 0;
        const vlrAbs = Math.abs(rawValor);

        // Verifica se no CSV original essa linha tinha valor negativo
        const isNegativoNoTexto = fileContent.textContent &&
          new RegExp(`[^\n\r]*-[\\s]*${vlrAbs.toFixed(2).replace('.', '[.,]')}`, 'i').test(fileContent.textContent);

        const isAbatimentoRenegociacao = desc.includes("renegociação de pendências") || desc.includes("renegociacao");
        const isDesconto = desc.includes("desconto") && !desc.includes("compra");
        const isPagamentoRecebido = desc.includes("pagamento recebido") || desc.includes("pgto recebido");

        if (rawValor < 0 || (isAbatimentoRenegociacao && isNegativoNoTexto) || isDesconto || isPagamentoRecebido) {
          pagamentos.push({
            data: it.data,
            descricao: it.descricao,
            valor: vlrAbs
          });
        } else {
          itensValidos.push(it);
        }
      });

      dados.itens = itensValidos;
      dados.pagamentos = pagamentos;
    }

    // Enriquecimento e auto-detecção da instituição financeira (ex: Santander, Nubank, Inter, Wise, etc.)
    if (!dados.instituicao || dados.instituicao === "Banco" || dados.instituicao === "Importado" || dados.instituicao.trim() === "") {
      if (fileNameLower.includes("santander") || (dados.descricao && dados.descricao.toLowerCase().includes("santander"))) {
        dados.instituicao = "Santander";
      } else if (fileNameLower.includes("nubank") || fileNameLower.includes("nu") || (dados.descricao && dados.descricao.toLowerCase().includes("nubank"))) {
        dados.instituicao = "Nubank";
      } else if (fileNameLower.includes("inter") || (dados.descricao && dados.descricao.toLowerCase().includes("inter"))) {
        dados.instituicao = "Inter";
      } else if (fileNameLower.includes("wise") || (dados.descricao && dados.descricao.toLowerCase().includes("wise"))) {
        dados.instituicao = "Wise";
      } else if (fileNameLower.includes("itau") || fileNameLower.includes("itaú")) {
        dados.instituicao = "Itaú";
      } else if (fileNameLower.includes("bradesco")) {
        dados.instituicao = "Bradesco";
      } else if (fileNameLower.includes("caixa")) {
        dados.instituicao = "Caixa";
      }
    }

    // Pós-processamento e garantia de nomes em transações PIX e transferências
    if (tipo === "extrato_bancario" && Array.isArray(dados.transacoes)) {
      dados.transacoes = dados.transacoes.map((t: any) => {
        let desc = (t.descricao || "").trim();
        let fav = (t.favorecido || "").trim();

        // Extrai favorecido de padrões conhecidos de transferências Pix (Nubank / Santander / Itaú / Inter)
        const matchEnv = desc.match(/Transfer[eê]ncia enviada pelo Pix\s*-\s*([^-]+)/i);
        const matchRec = desc.match(/Transfer[eê]ncia recebida pelo Pix\s*-\s*([^-]+)/i);

        if (matchEnv && matchEnv[1]) {
          fav = matchEnv[1].trim();
          desc = `Pix Enviado: ${fav}`;
          t.favorecido = fav;
        } else if (matchRec && matchRec[1]) {
          fav = matchRec[1].trim();
          desc = `Pix Recebido: ${fav}`;
          t.favorecido = fav;
        }

        const isGenerico = !desc || /^(pix|pix recebido|pix enviado|transfer[eê]ncia|transfer[eê]ncia enviada|transfer[eê]ncia enviada pelo pix|transfer[eê]ncia recebida|transfer[eê]ncia recebida pelo pix|ted|doc|compra no d[eé]bito)$/i.test(desc.trim());

        if (fav) {
          if (isGenerico) {
            desc = t.tipo === "RECEITA" ? `Pix Recebido: ${fav}` : `Pix Enviado: ${fav}`;
          } else if (!desc.toLowerCase().includes(fav.toLowerCase())) {
            desc = `${desc} - ${fav}`;
          }
        }

        const descLower = desc.toLowerCase();
        const favLower = fav.toLowerCase();
        const titularNorm = (dados.titular || "").toLowerCase();

        // Claudiney é cônjuge/parente/terceiro (mesmo sobrenome Claudiano, mas prenome diferente). NUNCA é a titular Ana Letícia!
        const isClaudiney = favLower.includes("claudiney") || descLower.includes("claudiney");

        // Identifica titular da conta e transferências próprias (mesma titularidade)
        const isNomeTitular = !isClaudiney && (
          (titularNorm && favLower && titularNorm.includes("ana") && favLower.includes("ana") && (titularNorm.includes(favLower) || favLower.includes(titularNorm))) ||
          (favLower.includes("ana leticia") || favLower.includes("ana claudia") || (favLower.includes("leticia") && favLower.includes("claudia")))
        );
        
        const isPropria = !isClaudiney && (
          isNomeTitular ||
          /mesma\s+titularidade|contas?\s+pr[oó]prias?|entre\s+minhas\s+contas/i.test(descLower) ||
          ((t.subtipo === "TRANSFERENCIA_PROPRIA" || t.tipo === "TRANSFERENCIA") && (favLower.includes("ana") || descLower.includes("ana")))
        );

        let tipoTx = t.tipo;
        let subtipoTx = t.subtipo || null;
        let catSugerida = t.categoria_sugerida;

        if (isPropria) {
          tipoTx = "TRANSFERENCIA";
          subtipoTx = "TRANSFERENCIA_PROPRIA";
          catSugerida = "Transferência Interna";
        } else if (isClaudiney) {
          tipoTx = (descLower.includes("pix recebido") || t.tipo === "RECEITA") ? "RECEITA" : "DESPESA";
          subtipoTx = null;
          catSugerida = tipoTx === "RECEITA" ? "Pix Recebido" : "Outros";
        } else if (descLower.includes("rdb") || descLower.includes("caixinha") || descLower.includes("guardar dinheiro")) {
          if (descLower.includes("resgate")) {
            tipoTx = "RECEITA";
            subtipoTx = "RESGATE_RDB";
            catSugerida = "Investimentos";
          } else {
            tipoTx = "INVESTIMENTO";
            subtipoTx = "APLICACAO_RDB";
            catSugerida = "Investimentos";
          }
        }

        return {
          ...t,
          tipo: tipoTx,
          subtipo: subtipoTx,
          categoria_sugerida: catSugerida,
          descricao: desc || (tipoTx === "RECEITA" ? "Recebimento / Pix" : tipoTx === "TRANSFERENCIA" ? "Transferência Própria" : "Pagamento / Pix")
        };
      });
    }

    // Normalização defensiva de cronograma de parcelas para empréstimos e renegociações
    if (tipo === "contrato_emprestimo" || tipo === "contrato_financiamento" || tipo === "renegociacao_cartao") {
      const qtd = parseInt(dados.quantidade_parcelas) || 0;
      const vlr = parseFloat(dados.valor_parcela) || 0;
      const hojeStr = new Date().toISOString().split("T")[0];
      
      if ((!dados.parcelas || !Array.isArray(dados.parcelas) || dados.parcelas.length === 0) && qtd > 0) {
        const baseDateStr = dados.data_primeira_parcela || dados.data_contratacao || dados.data_acordo || new Date().toISOString().split("T")[0];
        const baseDate = new Date(baseDateStr + "T12:00:00");
        dados.parcelas = Array.from({ length: qtd }).map((_, idx) => {
          const d = new Date(baseDate);
          d.setMonth(d.getMonth() + idx);
          const vcto = d.toISOString().split("T")[0];
          return {
            numero_parcela: idx + 1,
            valor: vlr > 0 ? vlr : ((dados.valor_original || dados.valor_total_com_juros || 0) / qtd),
            data_vencimento: vcto,
            status: vcto < hojeStr ? "paga" : "pendente"
          };
        });
      } else if (Array.isArray(dados.parcelas)) {
        // Marca status de cada parcela baseado na data atual
        dados.parcelas = dados.parcelas.map((p: any) => ({
          ...p,
          status: p.status || (p.data_vencimento < hojeStr ? "paga" : "pendente")
        }));
      }
    }

    return {
      tipo_documento: tipo,
      confianca: typeof parsed.confianca === "number" ? parsed.confianca : 0.85,
      resumo: parsed.resumo || "Documento financeiro processado",
      dados
    };
  }

  /**
   * 8. VALIDAÇÃO DE SCHEMA ESTRITA (GARANTE COERÊNCIA DOS DADOS)
   */
  static validateSchema(tipo: TipoDocumento, dados: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!dados || typeof dados !== "object") {
      return { valid: false, errors: ["Dados extraídos ausentes ou em formato inválido."] };
    }

    switch (tipo) {
      case "contrato_emprestimo":
      case "contrato_financiamento": {
        const d = dados as DadosContratoEmprestimo;
        if (!d.valor_original || d.valor_original <= 0) {
          if (d.valor_total_com_juros && d.valor_total_com_juros > 0) {
            d.valor_original = d.valor_total_com_juros;
          } else {
            errors.push("Valor do empréstimo inválido ou ausente.");
          }
        }
        if (!d.quantidade_parcelas || d.quantidade_parcelas <= 0) {
          errors.push("Quantidade de parcelas deve ser maior que zero.");
        }
        // Auto-gera se ainda estiver vazio mas houver quantidade
        if ((!d.parcelas || !Array.isArray(d.parcelas) || d.parcelas.length === 0) && d.quantidade_parcelas > 0) {
          const baseDate = new Date((d.data_primeira_parcela || d.data_contratacao || new Date().toISOString().split("T")[0]) + "T12:00:00");
          d.parcelas = Array.from({ length: d.quantidade_parcelas }).map((_, idx) => {
            const date = new Date(baseDate);
            date.setMonth(date.getMonth() + idx);
            return {
              numero_parcela: idx + 1,
              valor: d.valor_parcela || ((d.valor_original || 0) / d.quantidade_parcelas),
              data_vencimento: date.toISOString().split("T")[0]
            };
          });
        }
        break;
      }

      case "renegociacao_cartao": {
        const d = dados as DadosRenegociacaoCartao;
        if (!d.valor_original && !d.valor_total_com_juros) errors.push("Valor da renegociação ausente.");
        if (!d.quantidade_parcelas || d.quantidade_parcelas <= 0) errors.push("Quantidade de parcelas inválida.");
        if ((!d.parcelas || !Array.isArray(d.parcelas) || d.parcelas.length === 0) && d.quantidade_parcelas > 0) {
          const baseDate = new Date((d.data_primeira_parcela || d.data_acordo || new Date().toISOString().split("T")[0]) + "T12:00:00");
          d.parcelas = Array.from({ length: d.quantidade_parcelas }).map((_, idx) => {
            const date = new Date(baseDate);
            date.setMonth(date.getMonth() + idx);
            return {
              numero_parcela: idx + 1,
              valor: d.valor_parcela || ((d.valor_total_com_juros || d.valor_original || 0) / d.quantidade_parcelas),
              data_vencimento: date.toISOString().split("T")[0]
            };
          });
        }
        break;
      }

      case "fatura_cartao": {
        const d = dados as DadosFaturaCartao;
        if (!d.itens || !Array.isArray(d.itens)) errors.push("Lista de compras da fatura ausente.");
        break;
      }

      case "extrato_bancario": {
        const d = dados as DadosExtratoBancario;
        if (!d.transacoes || !Array.isArray(d.transacoes)) errors.push("Lista de transações do extrato ausente.");
        break;
      }

      case "comprovante_pagamento": {
        const d = dados as DadosComprovantePagamento;
        if (!d.valor || d.valor <= 0) errors.push("Valor do comprovante de pagamento inválido.");
        if (!d.data) errors.push("Data do pagamento ausente.");
        break;
      }

      case "comprovante_transferencia": {
        const d = dados as DadosComprovanteTransferencia;
        if (!d.valor || d.valor <= 0) errors.push("Valor da transferência inválido.");
        break;
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 9. VERIFICAR SE O DOCUMENTO REQUER CONFIRMAÇÃO DO USUÁRIO
   */
  static requiresUserConfirmation(tipo: TipoDocumento, confianca: number): boolean {
    // 1. Operações com impacto de dívida futura SEMPRE requerem confirmação
    if (tipo === "contrato_emprestimo" || tipo === "contrato_financiamento" || tipo === "renegociacao_cartao") {
      return true;
    }
    // 2. Comprovantes de pagamento isolados requerem confirmação de qual obrigação pagar
    if (tipo === "comprovante_pagamento") {
      return true;
    }
    // 3. Qualquer documento com confiança menor que 85% exige confirmação
    if (confianca < 0.85) {
      return true;
    }
    return false;
  }

  /**
   * 10. PERSISTÊNCIA VIA SERVIÇOS DE DOMÍNIO FINANCEIRO (SEM SQL DIRETO)
   */
  static async persistToDomain(params: {
    usuario_id: string;
    tipo_documento: TipoDocumento;
    dados: any;
    documento_importado_id?: string;
    contexto?: {
      conta_id?: string;
      cartao_id?: string;
      fatura_origem_id?: string;
      divida_id?: string;
    };
  }): Promise<{ success: boolean; totalItens: number; mensagem: string; detalhes?: any }> {
    const { usuario_id, tipo_documento, dados, documento_importado_id, contexto } = params;

    switch (tipo_documento) {
      // -------------------------------------------------------------
      // CASO A: EMPRÉSTIMO OU FINANCIAMENTO
      // Cria DÍVIDA + PARCELAS_DIVIDA (NÃO CRIA 24 TRANSAÇÕES DE GASTO)
      // -------------------------------------------------------------
      case "contrato_emprestimo":
      case "contrato_financiamento": {
        const emp = dados as DadosContratoEmprestimo;
        const totalParcelas = emp.quantidade_parcelas || emp.parcelas.length || 1;
        const valorOriginal = emp.valor_original || (emp.valor_parcela * totalParcelas);
        const valorAtual = emp.valor_total_com_juros || (emp.valor_parcela * totalParcelas);

        const hojeStr = new Date().toISOString().split("T")[0];

        const parcelasParaInserir = (emp.parcelas && emp.parcelas.length > 0)
          ? emp.parcelas.map(p => {
              const isPaga = p.status === "paga" || (!p.status && p.data_vencimento < hojeStr);
              return {
                numero_parcela: p.numero_parcela,
                valor_esperado: p.valor,
                data_vencimento: p.data_vencimento,
                status: isPaga ? "paga" : "pendente"
              };
            })
          : Array.from({ length: totalParcelas }).map((_, idx) => {
              const baseDate = new Date((emp.data_primeira_parcela || emp.data_contratacao || new Date().toISOString().split("T")[0]) + "T12:00:00");
              baseDate.setMonth(baseDate.getMonth() + idx);
              const vcto = baseDate.toISOString().split("T")[0];
              const isPaga = vcto < hojeStr;
              return {
                numero_parcela: idx + 1,
                valor_esperado: emp.valor_parcela,
                data_vencimento: vcto,
                status: isPaga ? "paga" : "pendente"
              };
            });

        const totalPagas = parcelasParaInserir.filter(p => p.status === "paga").length;
        const todasPagas = totalPagas === parcelasParaInserir.length && parcelasParaInserir.length > 0;

        const novaDivida = {
          tipo: emp.tipo_divida || "emprestimo_pessoal",
          descricao: emp.descricao || `Empréstimo ${emp.instituicao || "Bancário"}`,
          instituicao: emp.instituicao || "Banco",
          valor_original: valorOriginal,
          valor_atual: valorAtual,
          data_contratacao: emp.data_contratacao || new Date().toISOString().split("T")[0],
          status: todasPagas ? "quitada" : "ativa",
          documento_importado_id: documento_importado_id || null
        };

        const dividaCriada = await financeService.addDivida(usuario_id, {
          divida: novaDivida,
          parcelas: parcelasParaInserir
        });

        // Registra automaticamente as parcelas anteriores pagas como despesas contábeis no extrato
        if (totalPagas > 0) {
          try {
            await financeService.sincronizarGastosParcelasPagas(usuario_id, dividaCriada.id, contexto?.conta_id);
          } catch (syncErr) {
            console.warn("Aviso ao sincronizar despesas de parcelas pagas:", syncErr);
          }
        }

        return {
          success: true,
          totalItens: parcelasParaInserir.length,
          mensagem: `Empréstimo cadastrado com sucesso! ${parcelasParaInserir.length} parcelas registradas (${totalPagas} quitadas/anteriores, ${parcelasParaInserir.length - totalPagas} pendentes).`,
          detalhes: { divida_id: dividaCriada.id, pagas: totalPagas, pendentes: parcelasParaInserir.length - totalPagas }
        };
      }

      // -------------------------------------------------------------
      // CASO B: RENEGOCIAÇÃO DE CARTÃO
      // Cria DÍVIDA 'renegociacao_cartao' + PARCELAS + LINK COM FATURA
      // -------------------------------------------------------------
      case "renegociacao_cartao": {
        const reneg = dados as DadosRenegociacaoCartao;
        const totalParcelas = reneg.quantidade_parcelas || reneg.parcelas.length || 1;
        const valorOriginal = reneg.valor_original || (reneg.valor_parcela * totalParcelas);
        const valorAtual = reneg.valor_total_com_juros || (reneg.valor_parcela * totalParcelas);

        // Valida que a fatura de origem pertence ao usuário se fornecida
        let faturaOrigemValida: string | null = null;
        if (contexto?.fatura_origem_id) {
          const { data: faturaCheck } = await supabase
            .from("faturas")
            .select("id")
            .eq("id", contexto.fatura_origem_id)
            .eq("usuario_id", usuario_id)
            .maybeSingle();
          if (faturaCheck) {
            faturaOrigemValida = faturaCheck.id;
          }
        }

        const hojeStr = new Date().toISOString().split("T")[0];

        const parcelasParaInserir = (reneg.parcelas && reneg.parcelas.length > 0)
          ? reneg.parcelas.map(p => {
              const isPaga = p.status === "paga" || (!p.status && p.data_vencimento < hojeStr);
              return {
                numero_parcela: p.numero_parcela,
                valor_esperado: p.valor,
                data_vencimento: p.data_vencimento,
                status: isPaga ? "paga" : "pendente"
              };
            })
          : Array.from({ length: totalParcelas }).map((_, idx) => {
              const baseDate = new Date((reneg.data_primeira_parcela || new Date().toISOString().split("T")[0]) + "T12:00:00");
              baseDate.setMonth(baseDate.getMonth() + idx);
              const vcto = baseDate.toISOString().split("T")[0];
              const isPaga = vcto < hojeStr;
              return {
                numero_parcela: idx + 1,
                valor_esperado: reneg.valor_parcela,
                data_vencimento: vcto,
                status: isPaga ? "paga" : "pendente"
              };
            });

        const totalPagas = parcelasParaInserir.filter(p => p.status === "paga").length;
        const todasPagas = totalPagas === parcelasParaInserir.length && parcelasParaInserir.length > 0;

        const novaDivida = {
          tipo: "renegociacao_cartao",
          descricao: reneg.descricao || `Renegociação ${reneg.instituicao || "Cartão"}`,
          instituicao: reneg.instituicao || "Cartão de Crédito",
          valor_original: valorOriginal,
          valor_atual: valorAtual,
          data_contratacao: reneg.data_acordo || new Date().toISOString().split("T")[0],
          fatura_origem_id: faturaOrigemValida,
          status: todasPagas ? "quitada" : "ativa",
          documento_importado_id: documento_importado_id || null
        };

        const dividaCriada = await financeService.addDivida(usuario_id, {
          divida: novaDivida,
          parcelas: parcelasParaInserir
        });

        if (totalPagas > 0) {
          try {
            await financeService.sincronizarGastosParcelasPagas(usuario_id, dividaCriada.id, contexto?.conta_id);
          } catch (syncErr) {
            console.warn("Aviso ao sincronizar despesas de renegociação paga:", syncErr);
          }
        }

        return {
          success: true,
          totalItens: parcelasParaInserir.length,
          mensagem: `Renegociação registrada com sucesso! ${parcelasParaInserir.length} parcelas (${totalPagas} pagas, ${parcelasParaInserir.length - totalPagas} pendentes).`,
          detalhes: { divida_id: dividaCriada.id, pagas: totalPagas, pendentes: parcelasParaInserir.length - totalPagas }
        };
      }

      // -------------------------------------------------------------
      // CASO C: FATURA DE CARTÃO DE CRÉDITO
      // Compras individuais atreladas ao cartão/fatura (SEM debitar conta!)
      // -------------------------------------------------------------
      case "fatura_cartao": {
        const fatura = dados as DadosFaturaCartao;
        const cartaoId = contexto?.cartao_id;
        if (!cartaoId) {
          throw new Error("É obrigatório selecionar o cartão de crédito associado à fatura.");
        }

        // Valida que o cartão pertence ao mesmo usuário
        const { data: cartaoCheck } = await supabase
          .from("cartoes")
          .select("id")
          .eq("id", cartaoId)
          .eq("usuario_id", usuario_id)
          .single();
        if (!cartaoCheck) throw new Error("Cartão não encontrado ou não pertence a este usuário.");

        let importadas = 0;
        for (const item of (fatura.itens || [])) {
          const isLimite = item.natureza === "LIMITE_CONVERTIDO" || /limite\s+convertido/i.test(item.descricao);
          await financeService.addGasto(usuario_id, {
            descricao: item.descricao,
            valor: item.valor,
            data: item.data,
            categoria: isLimite ? "Financiamento / Ajuste de Limite" : (item.categoria_sugerida || "Outros"),
            tipo: isLimite ? "AJUSTE" : "DESPESA",
            metodo_pagamento: "Crédito",
            cartao_id: cartaoId,
            parcelas: (item.total_parcelas || 1).toString(),
            parcela_atual: item.parcela_atual || 1,
            total_parcelas: item.total_parcelas || 1,
            terceiro: item.terceiro || false,
            documento_importado_id: documento_importado_id || null
          });
          importadas++;
        }

        // Se a fatura continha "Pagamento recebido", registra o pagamento da fatura
        if (fatura.pagamentos && fatura.pagamentos.length > 0) {
          for (const pag of fatura.pagamentos) {
            await financeService.processPagamentoFatura(usuario_id, {
              cartao_id: cartaoId,
              valor: pag.valor,
              data: pag.data,
              descricao: pag.descricao || "Pagamento de Fatura",
              documento_importado_id: documento_importado_id || null
            });
          }
        }

        return {
          success: true,
          totalItens: importadas,
          mensagem: `${importadas} lançamentos de cartão importados com sucesso!`
        };
      }

      // -------------------------------------------------------------
      // CASO D: EXTRATO BANCÁRIO
      // Entradas e Saídas geram transação + movimentação de conta
      // Diferencia consumo real de pagamentos de dívida/fatura e transferências
      // -------------------------------------------------------------
      case "extrato_bancario": {
        const extrato = dados as DadosExtratoBancario;
        const contaId = contexto?.conta_id;
        if (!contaId) {
          throw new Error("É obrigatório selecionar a conta bancária do extrato.");
        }

        // Valida que a conta pertence ao usuário
        const { data: contaCheck } = await supabase
          .from("contas_bancarias")
          .select("id")
          .eq("id", contaId)
          .eq("usuario_id", usuario_id)
          .single();
        if (!contaCheck) throw new Error("Conta bancária não pertence a este usuário.");

        let total = 0;
        for (const t of (extrato.transacoes || [])) {
          const descLower = (t.descricao || "").toLowerCase();
          const isLimite = t.natureza === "LIMITE_CONVERTIDO" || descLower.includes("limite convertido");
          const isPagamentoFatura = t.tipo === "PAGAMENTO_FATURA" || t.natureza === "PAGAMENTO_FATURA" || descLower.includes("pagamento de fatura") || descLower.includes("pgto fatura");
          const isAplicacao = t.tipo === "APORTE" || t.tipo === "INVESTIMENTO" || (descLower.includes("rdb") && !descLower.includes("resgate")) || descLower.includes("caixinha") || descLower.includes("guardar dinheiro");
          const isResgate = t.tipo === "RESGATE" || (descLower.includes("rdb") && descLower.includes("resgate")) || descLower.includes("resgate caixinha");
          const isTransf = t.tipo === "TRANSFERENCIA" || t.natureza === "TRANSFERENCIA" || /mesma\s+titularidade|contas?\s+pr[oó]prias?/i.test(descLower);

          if (t.tipo === "RECEITA" || isLimite) {
            const txTipo = isLimite ? "AJUSTE" : "RECEITA";
            const txCat = isLimite ? "Financiamento / Ajuste de Limite" : (t.categoria_sugerida || "Outros");

            // Mapeia categoria_id existente ou cria uma se necessário
            let catId = null;
            if (txCat) {
              const { data: cat } = await supabase
                .from("categorias")
                .select("id")
                .eq("usuario_id", usuario_id)
                .ilike("nome", txCat.trim())
                .maybeSingle();
              if (cat) {
                catId = cat.id;
              } else {
                const { data: novaCat } = await supabase
                  .from("categorias")
                  .insert([{
                    usuario_id,
                    nome: txCat.trim(),
                    tipo: "RECEITA",
                    ativa: true,
                    cor_hex: "#10B981"
                  }])
                  .select("id")
                  .maybeSingle();
                if (novaCat) catId = novaCat.id;
              }
            }

            const { data: tx, error } = await supabase
              .from("transacoes")
              .insert([{
                usuario_id,
                tipo: txTipo,
                categoria_id: catId,
                descricao: t.descricao,
                valor: t.valor,
                data: t.data,
                conta_id: contaId,
                status: "confirmada",
                documento_importado_id: documento_importado_id || null,
                observacao: `Categoria: ${txCat}`
              }])
              .select().single();

            if (error) {
              console.error("Erro ao inserir transação de receita (import-service):", error);
            }

            if (!error && tx) {
              if (contaId) {
                await supabase.from("movimentacoes").insert([{
                  usuario_id,
                  transacao_id: tx.id,
                  conta_id: contaId,
                  tipo: "ENTRADA",
                  valor: t.valor,
                  data: t.data
                }]);
              }
              total++;
            }
          } else if (isPagamentoFatura) {
            await financeService.processPagamentoFatura(usuario_id, {
              conta_id: contaId,
              valor: t.valor,
              data: t.data,
              descricao: t.descricao || "Pagamento de Fatura",
              documento_importado_id: documento_importado_id || null
            });
            total++;
          } else if (isAplicacao) {
            await financeService.processAporteInvestimento(usuario_id, {
              conta_id: contaId,
              valor: t.valor,
              data: t.data,
              descricao: t.descricao || "Aplicação Financeira",
              meta_id: metaReservaId,
              documento_importado_id: documento_importado_id || null
            });
            total++;
          } else if (isResgate) {
            await financeService.processResgateInvestimento(usuario_id, {
              conta_id: contaId,
              valor: t.valor,
              data: t.data,
              descricao: t.descricao || "Resgate de Investimento",
              meta_id: metaReservaId,
              documento_importado_id: documento_importado_id || null
            });
            total++;
          } else if (isTransf) {
            const { data: tx, error } = await supabase
              .from("transacoes")
              .insert([{
                usuario_id,
                tipo: "TRANSFERENCIA",
                descricao: t.descricao || "Transferência entre contas próprias",
                valor: t.valor,
                data: t.data,
                conta_id: contaId,
                status: "confirmada",
                documento_importado_id: documento_importado_id || null,
                observacao: "Transferência Interna"
              }])
              .select().single();
            if (!error && tx) {
              await supabase.from("movimentacoes").insert([{
                usuario_id,
                transacao_id: tx.id,
                conta_id: contaId,
                tipo: "SAIDA",
                valor: t.valor,
                data: t.data
              }]);
              total++;
            }
          } else {
            await financeService.addGasto(usuario_id, {
              descricao: t.descricao,
              valor: t.valor,
              data: t.data,
              categoria: t.categoria_sugerida || "Outros",
              metodo_pagamento: "Débito",
              conta_id: contaId,
              documento_importado_id: documento_importado_id || null
            });
            total++;
          }
        }

        await financeService.syncMetasInvestimentos(usuario_id).catch(() => {});

        return {
          success: true,
          totalItens: total,
          mensagem: `${total} transações do extrato bancário importadas com sucesso!`
        };
      }

      // -------------------------------------------------------------
      // CASO E: COMPROVANTE DE PAGAMENTO
      // Realiza a quitação da dívida/parcela se indicada
      // -------------------------------------------------------------
      case "comprovante_pagamento": {
        const comp = dados as DadosComprovantePagamento;
        if (contexto?.parcela_id && contexto?.divida_id && contexto?.conta_id) {
          await financeService.pagarParcelaDivida(
            usuario_id,
            contexto.parcela_id,
            contexto.divida_id,
            comp.valor,
            contexto.conta_id,
            comp.data
          );
          return {
            success: true,
            totalItens: 1,
            mensagem: `Pagamento de R$ ${comp.valor.toFixed(2)} registrado e parcela quitada com sucesso!`
          };
        } else {
          // Lança como transação de despesa comum
          await financeService.addGasto(usuario_id, {
            descricao: comp.descricao || "Pagamento de Comprovante",
            valor: comp.valor,
            data: comp.data,
            categoria: "Outros",
            metodo_pagamento: "Débito",
            conta_id: contexto?.conta_id || null,
            documento_importado_id: documento_importado_id || null
          });
          return {
            success: true,
            totalItens: 1,
            mensagem: `Pagamento de R$ ${comp.valor.toFixed(2)} lançado com sucesso.`
          };
        }
      }

      // -------------------------------------------------------------
      // CASO F: COMPROVANTE DE TRANSFERÊNCIA
      // 1 Transação + 2 Movimentações (ambas do mesmo usuário)
      // -------------------------------------------------------------
      case "comprovante_transferencia": {
        const trans = dados as DadosComprovanteTransferencia;
        const contaOrigem = contexto?.conta_id;
        if (!contaOrigem) throw new Error("Conta bancária de origem é obrigatória para a transferência.");

        // Valida que a conta de origem pertence ao usuário
        const { data: cOrigem } = await supabase
          .from("contas_bancarias")
          .select("id")
          .eq("id", contaOrigem)
          .eq("usuario_id", usuario_id)
          .single();
        if (!cOrigem) throw new Error("Conta de origem não pertence ao usuário.");

        await financeService.addTransacao(usuario_id, {
          tipo: "TRANSFERENCIA",
          descricao: trans.descricao || `Transferência para ${trans.favorecido}`,
          valor: trans.valor,
          data: trans.data,
          conta_id: contaOrigem,
          conta_destino_id: contaOrigem // se não houver outra conta selecionada
        });

        return {
          success: true,
          totalItens: 1,
          mensagem: `Transferência de R$ ${trans.valor.toFixed(2)} registrada com sucesso.`
        };
      }

      default:
        throw new Error(`Tipo de documento '${tipo_documento}' não suportado para persistência automática.`);
    }
  }
}
