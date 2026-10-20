-- ====================================================================
-- MIGRAÇÃO 003: AJUSTES DE INTEGRIDADE, RLS, PERFORMANCE E FUSO HORÁRIO
-- Arquivo: supabase/migrations/003_ajustes_schema_integridade_performance.sql
-- ====================================================================

-- 1. CORREÇÃO DE FUSO HORÁRIO (timestamp -> timestamptz)
-- Garante que datas de auditoria e criação respeitem timezone UTC
ALTER TABLE public.metas 
    ALTER COLUMN criado_em TYPE timestamptz USING criado_em AT TIME ZONE 'UTC';

ALTER TABLE public.metas_depositos 
    ALTER COLUMN data_deposito TYPE timestamptz USING data_deposito AT TIME ZONE 'UTC';

ALTER TABLE public.usuarios 
    ALTER COLUMN criado_em TYPE timestamptz USING criado_em AT TIME ZONE 'UTC';

-- 2. PADRONIZAÇÃO DE DEFAULT EM contatos
ALTER TABLE public.contatos 
    ALTER COLUMN usuario_id SET DEFAULT auth.uid();

-- 3. COLUNAS AUSENTES UTILIZADAS NO FRONTEND / SERVICES
-- A coluna considerar_soma é lida em financeService.getMonthlyStats e HomeWeb
ALTER TABLE public.transacoes 
    ADD COLUMN IF NOT EXISTS considerar_soma boolean NOT NULL DEFAULT true;

-- 4. ADICIONAR usuario_id EM TABELAS FILHAS (ESSENCIAL PARA RLS E REALTIME)
-- parcelas_divida
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'parcelas_divida' 
          AND column_name = 'usuario_id'
    ) THEN
        ALTER TABLE public.parcelas_divida 
            ADD COLUMN usuario_id uuid DEFAULT auth.uid() REFERENCES public.usuarios(id) ON DELETE CASCADE;

        -- Se houver registros existentes, vincula ao usuario_id da divida pai
        UPDATE public.parcelas_divida p
        SET usuario_id = d.usuario_id
        FROM public.dividas d
        WHERE p.divida_id = d.id AND p.usuario_id IS NULL;

        -- Torna NOT NULL após preenchimento
        ALTER TABLE public.parcelas_divida ALTER COLUMN usuario_id SET NOT NULL;
    END IF;
END $$;

-- historico_investimentos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'historico_investimentos' 
          AND column_name = 'usuario_id'
    ) THEN
        ALTER TABLE public.historico_investimentos 
            ADD COLUMN usuario_id uuid DEFAULT auth.uid() REFERENCES public.usuarios(id) ON DELETE CASCADE;

        -- Se houver registros existentes, vincula ao usuario_id do investimento pai
        UPDATE public.historico_investimentos h
        SET usuario_id = i.usuario_id
        FROM public.investimentos i
        WHERE h.investimento_id = i.id AND h.usuario_id IS NULL;

        -- Torna NOT NULL após preenchimento
        ALTER TABLE public.historico_investimentos ALTER COLUMN usuario_id SET NOT NULL;
    END IF;
END $$;

-- 5. AJUSTAR ON DELETE CASCADE NAS CHAVES ESTRANGEIRAS
-- Evita erros ao deletar usuários, dívidas, faturas, transações ou cartões

-- metas_depositos -> metas
ALTER TABLE public.metas_depositos 
    DROP CONSTRAINT IF EXISTS metas_depositos_meta_id_fkey,
    ADD CONSTRAINT metas_depositos_meta_id_fkey 
        FOREIGN KEY (meta_id) REFERENCES public.metas(id) ON DELETE CASCADE;

-- parcelas -> parcelamentos
ALTER TABLE public.parcelas 
    DROP CONSTRAINT IF EXISTS parcelas_parcelamento_id_fkey,
    ADD CONSTRAINT parcelas_parcelamento_id_fkey 
        FOREIGN KEY (parcelamento_id) REFERENCES public.parcelamentos(id) ON DELETE CASCADE;

-- parcelas_divida -> dividas
ALTER TABLE public.parcelas_divida 
    DROP CONSTRAINT IF EXISTS parcelas_divida_divida_id_fkey,
    ADD CONSTRAINT parcelas_divida_divida_id_fkey 
        FOREIGN KEY (divida_id) REFERENCES public.dividas(id) ON DELETE CASCADE;

-- pagamentos_divida -> dividas & parcelas_divida
ALTER TABLE public.pagamentos_divida 
    DROP CONSTRAINT IF EXISTS pagamentos_divida_divida_id_fkey,
    ADD CONSTRAINT pagamentos_divida_divida_id_fkey 
        FOREIGN KEY (divida_id) REFERENCES public.dividas(id) ON DELETE CASCADE;

ALTER TABLE public.pagamentos_divida 
    DROP CONSTRAINT IF EXISTS pagamentos_divida_parcela_id_fkey,
    ADD CONSTRAINT pagamentos_divida_parcela_id_fkey 
        FOREIGN KEY (parcela_id) REFERENCES public.parcelas_divida(id) ON DELETE SET NULL;

-- historico_investimentos -> investimentos
ALTER TABLE public.historico_investimentos 
    DROP CONSTRAINT IF EXISTS historico_investimentos_investimento_id_fkey,
    ADD CONSTRAINT historico_investimentos_investimento_id_fkey 
        FOREIGN KEY (investimento_id) REFERENCES public.investimentos(id) ON DELETE CASCADE;

-- faturas -> cartoes
ALTER TABLE public.faturas 
    DROP CONSTRAINT IF EXISTS faturas_cartao_id_fkey,
    ADD CONSTRAINT faturas_cartao_id_fkey 
        FOREIGN KEY (cartao_id) REFERENCES public.cartoes(id) ON DELETE CASCADE;

-- movimentacoes -> transacoes
ALTER TABLE public.movimentacoes 
    DROP CONSTRAINT IF EXISTS movimentacoes_transacao_fkey,
    ADD CONSTRAINT movimentacoes_transacao_fkey 
        FOREIGN KEY (transacao_id) REFERENCES public.transacoes(id) ON DELETE CASCADE;

-- transferencias -> transacoes
ALTER TABLE public.transferencias 
    DROP CONSTRAINT IF EXISTS transferencias_transacao_fkey,
    ADD CONSTRAINT transferencias_transacao_fkey 
        FOREIGN KEY (transacao_id) REFERENCES public.transacoes(id) ON DELETE CASCADE;

-- transacoes -> cartao/fatura/categoria/conta (SET NULL ao deletar o recurso pai)
ALTER TABLE public.transacoes 
    DROP CONSTRAINT IF EXISTS transacoes_cartao_id_fkey,
    ADD CONSTRAINT transacoes_cartao_id_fkey 
        FOREIGN KEY (cartao_id) REFERENCES public.cartoes(id) ON DELETE SET NULL;

ALTER TABLE public.transacoes 
    DROP CONSTRAINT IF EXISTS transacoes_fatura_fkey,
    ADD CONSTRAINT transacoes_fatura_fkey 
        FOREIGN KEY (fatura_id) REFERENCES public.faturas(id) ON DELETE SET NULL;

ALTER TABLE public.transacoes 
    DROP CONSTRAINT IF EXISTS transacoes_categoria_id_fkey,
    ADD CONSTRAINT transacoes_categoria_id_fkey 
        FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE SET NULL;

-- 6. VALIDAÇÕES E CHECKS DE INTEGRIDADE
-- Cartões: dias de vencimento e fechamento entre 1 e 31
ALTER TABLE public.cartoes 
    DROP CONSTRAINT IF EXISTS chk_cartoes_dias,
    ADD CONSTRAINT chk_cartoes_dias 
        CHECK (vencimento_dia BETWEEN 1 AND 31 AND fechamento_dia BETWEEN 1 AND 31);

-- Faturas: coerência cronológica de datas
ALTER TABLE public.faturas 
    DROP CONSTRAINT IF EXISTS chk_faturas_cronologia,
    ADD CONSTRAINT chk_faturas_cronologia 
        CHECK (data_inicio <= data_fechamento AND data_fechamento <= data_vencimento);

-- Transações: valor estritamente positivo (o tipo define débito/crédito)
ALTER TABLE public.transacoes 
    DROP CONSTRAINT IF EXISTS chk_transacoes_valor_positivo,
    ADD CONSTRAINT chk_transacoes_valor_positivo 
        CHECK (valor > 0);

-- 7. ÍNDICES DE ALTA PERFORMANCE (Foreign Keys & Filtros Frequentes)
-- O Postgres não cria índices em FKs automaticamente. Sem eles, o app fica lento com muitos registros.
CREATE INDEX IF NOT EXISTS idx_transacoes_usuario_data ON public.transacoes (usuario_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_transacoes_conta_id ON public.transacoes (conta_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_cartao_id ON public.transacoes (cartao_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_fatura_id ON public.transacoes (fatura_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_categoria_id ON public.transacoes (categoria_id);

CREATE INDEX IF NOT EXISTS idx_movimentacoes_usuario_data ON public.movimentacoes (usuario_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_transacao_id ON public.movimentacoes (transacao_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_conta_id ON public.movimentacoes (conta_id);

CREATE INDEX IF NOT EXISTS idx_faturas_cartao_status ON public.faturas (cartao_id, status);
CREATE INDEX IF NOT EXISTS idx_faturas_usuario_venc ON public.faturas (usuario_id, data_vencimento);

CREATE INDEX IF NOT EXISTS idx_parcelas_divida_divida_id ON public.parcelas_divida (divida_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_divida_usuario_id ON public.parcelas_divida (usuario_id);

CREATE INDEX IF NOT EXISTS idx_historico_invest_investimento ON public.historico_investimentos (investimento_id);
CREATE INDEX IF NOT EXISTS idx_historico_invest_usuario ON public.historico_investimentos (usuario_id);

CREATE INDEX IF NOT EXISTS idx_transferencias_transacao_id ON public.transferencias (transacao_id);

-- 8. HABILITAÇÃO DE RLS (ROW LEVEL SECURITY) E POLÍTICAS BÁSICAS
-- Garante isolamento seguro entre usuários autenticados no Supabase
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcelas_divida ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos_divida ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_investimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metas_depositos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcelamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcelas ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS padrão (cada usuário só acessa e manipula seus próprios registros)
DO $$
DECLARE
    t text;
    tabelas text[] := ARRAY[
        'usuarios', 'contas_bancarias', 'cartoes', 'categorias',
        'transacoes', 'movimentacoes', 'faturas', 'transferencias',
        'dividas', 'parcelas_divida', 'investimentos', 'historico_investimentos',
        'metas', 'metas_depositos', 'contatos', 'parcelamentos', 'parcelas'
    ];
BEGIN
    FOREACH t IN ARRAY tabelas LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'user_isolation_policy', t);
        IF t = 'usuarios' THEN
            EXECUTE format('CREATE POLICY user_isolation_policy ON public.%I FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id)', t);
        ELSE
            EXECUTE format('CREATE POLICY user_isolation_policy ON public.%I FOR ALL USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id)', t);
        END IF;
    END LOOP;
END $$;
