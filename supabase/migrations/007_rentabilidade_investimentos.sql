-- ==============================================================================
-- MIGRATION 007: RENTABILIDADE DEFINIDA PELO USUÁRIO NOS INVESTIMENTOS
-- ==============================================================================
-- Aditiva e idempotente: só adiciona colunas opcionais. Nenhum dado é alterado.
--
--   indexador        : como o ativo rende — 'CDI', 'PREFIXADO', 'IPCA', 'SELIC', 'POUPANCA', 'OUTRO'
--   taxa             : número da rentabilidade, interpretado pelo indexador:
--                        CDI       → % do CDI         (ex.: 102  = 102% do CDI)
--                        PREFIXADO → % ao ano          (ex.: 12.5 = 12,5% a.a.)
--                        IPCA      → IPCA + x% ao ano  (ex.: 6    = IPCA + 6%)
--                        SELIC     → Selic + x% ao ano (ex.: 0.1  = Selic + 0,1%)
--   vencimento       : data de vencimento do título (opcional)
--   liquidez_diaria  : pode resgatar a qualquer momento?
-- ==============================================================================

ALTER TABLE public.investimentos ADD COLUMN IF NOT EXISTS indexador text;
ALTER TABLE public.investimentos ADD COLUMN IF NOT EXISTS taxa numeric;
ALTER TABLE public.investimentos ADD COLUMN IF NOT EXISTS vencimento date;
ALTER TABLE public.investimentos ADD COLUMN IF NOT EXISTS liquidez_diaria boolean;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investimentos_indexador_check') THEN
    ALTER TABLE public.investimentos
      ADD CONSTRAINT investimentos_indexador_check
      CHECK (indexador IS NULL OR indexador IN ('CDI', 'PREFIXADO', 'IPCA', 'SELIC', 'POUPANCA', 'OUTRO'));
  END IF;
END $$;
