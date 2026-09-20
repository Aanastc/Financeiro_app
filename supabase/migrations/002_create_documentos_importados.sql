-- ====================================================================
-- MIGRAÇÃO: TABELA DE CONTROLE E AUDITORIA DA IA DE IMPORTAÇÃO
-- Arquivo: supabase/migrations/002_create_documentos_importados.sql
-- ====================================================================

-- 1. Criação da tabela documentos_importados
CREATE TABLE IF NOT EXISTS public.documentos_importados (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.usuarios(id) ON DELETE CASCADE,
    nome_arquivo text NOT NULL,
    hash_arquivo text NOT NULL,
    tamanho_bytes bigint,
    mime_type text,
    tipo_documento text NOT NULL CHECK (tipo_documento IN (
        'contrato_emprestimo',
        'contrato_financiamento',
        'renegociacao_cartao',
        'fatura_cartao',
        'extrato_bancario',
        'comprovante_pagamento',
        'comprovante_transferencia',
        'documento_investimento',
        'outros'
    )),
    status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN (
        'PENDENTE',
        'PROCESSANDO',
        'AGUARDANDO_CONFIRMACAO',
        'PROCESSADO',
        'ERRO'
    )),
    confianca numeric(4,2) CHECK (confianca >= 0 AND confianca <= 1.0),
    dados_extraidos jsonb,
    erro text,
    resultado_importacao jsonb,
    criado_em timestamptz NOT NULL DEFAULT now(),
    processado_em timestamptz,
    CONSTRAINT uq_documento_usuario_hash UNIQUE (usuario_id, hash_arquivo)
);

-- 2. Rastreabilidade das entidades financeiras criadas por documentos importados
ALTER TABLE public.transacoes 
    ADD COLUMN IF NOT EXISTS documento_importado_id uuid REFERENCES public.documentos_importados(id) ON DELETE SET NULL;

ALTER TABLE public.dividas 
    ADD COLUMN IF NOT EXISTS documento_importado_id uuid REFERENCES public.documentos_importados(id) ON DELETE SET NULL;

ALTER TABLE public.faturas 
    ADD COLUMN IF NOT EXISTS documento_importado_id uuid REFERENCES public.documentos_importados(id) ON DELETE SET NULL;

-- 3. Índices estratégicos para performance e idempotência
CREATE INDEX IF NOT EXISTS idx_doc_imp_usuario_status ON public.documentos_importados(usuario_id, status);
CREATE INDEX IF NOT EXISTS idx_doc_imp_hash ON public.documentos_importados(usuario_id, hash_arquivo);
CREATE INDEX IF NOT EXISTS idx_transacoes_doc_id ON public.transacoes(documento_importado_id);
CREATE INDEX IF NOT EXISTS idx_dividas_doc_id ON public.dividas(documento_importado_id);
CREATE INDEX IF NOT EXISTS idx_faturas_doc_id ON public.faturas(documento_importado_id);

-- 4. Habilitação de RLS e Políticas de Segurança Multi-Tenant
ALTER TABLE public.documentos_importados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doc_imp_user_all" ON public.documentos_importados;
CREATE POLICY "doc_imp_user_all" ON public.documentos_importados
    FOR ALL
    USING (auth.uid() = usuario_id)
    WITH CHECK (auth.uid() = usuario_id);

COMMENT ON TABLE public.documentos_importados IS 'Rastreia todos os documentos processados pela IA financeira com hash de idempotência e dados estruturados extraídos.';
