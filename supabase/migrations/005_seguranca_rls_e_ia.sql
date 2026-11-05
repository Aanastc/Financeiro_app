-- ==============================================================================
-- MIGRATION 005: SEGURANÇA (RLS EM TODAS AS TABELAS) + SUPORTE À IA NO SERVIDOR
-- ==============================================================================
-- Esta migration é ADITIVA e idempotente:
--   * não apaga nem altera nenhum dado existente (sem DELETE/UPDATE/DROP TABLE);
--   * pode ser executada mais de uma vez sem efeito colateral;
--   * políticas novas são permissivas e somam às que já existirem.
--
-- O que ela faz:
--   1. Ativa Row Level Security em todas as tabelas com dono (usuario_id) e cria a
--      política "cada usuário só vê/altera as próprias linhas".
--   2. Protege tabelas sem usuario_id através da tabela-pai (pagamentos_divida).
--   3. Protege public.usuarios (CPF, telefone) — cada um só lê/edita o próprio perfil.
--   4. Cria a função emails_com_conta(), que responde apenas QUAIS e-mails têm conta,
--      sem expor dados pessoais (substitui a leitura direta de public.usuarios).
--   5. Cria o perfil em public.usuarios automaticamente no cadastro (trigger), e
--      cria perfis que estejam faltando para contas já existentes.
--   6. Cria a tabela ia_requisicoes, usada pela Edge Function ai-generate para
--      limitar o uso da IA por usuário.
-- ==============================================================================


-- ------------------------------------------------------------------------------
-- 1. RLS GENÉRICO PARA TABELAS COM usuario_id
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'metas', 'metas_depositos', 'cartoes', 'investimentos', 'historico_investimentos',
    'contas_bancarias', 'contatos', 'categorias', 'faturas', 'transferencias',
    'parcelamentos', 'parcelas', 'transacoes', 'movimentacoes', 'dividas',
    'parcelas_divida', 'documentos_importados', 'grupos',
    -- tabelas legadas usadas pelo app mobile (se ainda existirem)
    'despesas', 'receitas'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'usuario_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_dono'
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
             USING (usuario_id = (SELECT auth.uid()))
             WITH CHECK (usuario_id = (SELECT auth.uid()))',
          t || '_dono', t
        );
      END IF;

      -- Índice para as políticas e para os filtros .eq("usuario_id", ...) do app
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (usuario_id)', 'idx_' || t || '_usuario_id', t);
    END IF;
  END LOOP;
END $$;


-- ------------------------------------------------------------------------------
-- 2. pagamentos_divida (não tem usuario_id → herda o dono da dívida)
-- ------------------------------------------------------------------------------
ALTER TABLE public.pagamentos_divida ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pagamentos_divida' AND policyname = 'pagamentos_divida_dono'
  ) THEN
    CREATE POLICY pagamentos_divida_dono ON public.pagamentos_divida FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.dividas d
        WHERE d.id = pagamentos_divida.divida_id AND d.usuario_id = (SELECT auth.uid())
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.dividas d
        WHERE d.id = pagamentos_divida.divida_id AND d.usuario_id = (SELECT auth.uid())
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pagamentos_divida_divida_id ON public.pagamentos_divida (divida_id);


-- ------------------------------------------------------------------------------
-- 3. public.usuarios (perfil: só o próprio usuário lê/edita; sem DELETE)
-- ------------------------------------------------------------------------------
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usuarios' AND policyname = 'usuarios_select_proprio') THEN
    CREATE POLICY usuarios_select_proprio ON public.usuarios FOR SELECT TO authenticated
      USING (id = (SELECT auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usuarios' AND policyname = 'usuarios_insert_proprio') THEN
    CREATE POLICY usuarios_insert_proprio ON public.usuarios FOR INSERT TO authenticated
      WITH CHECK (id = (SELECT auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usuarios' AND policyname = 'usuarios_update_proprio') THEN
    CREATE POLICY usuarios_update_proprio ON public.usuarios FOR UPDATE TO authenticated
      USING (id = (SELECT auth.uid()))
      WITH CHECK (id = (SELECT auth.uid()));
  END IF;
END $$;


-- ------------------------------------------------------------------------------
-- 4. emails_com_conta(): diz QUAIS e-mails têm conta, sem expor CPF/telefone/nome
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emails_com_conta(emails text[])
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT lower(trim(u.email))
  FROM public.usuarios u
  WHERE auth.uid() IS NOT NULL
    AND u.email IS NOT NULL
    AND lower(trim(u.email)) IN (
      SELECT lower(trim(e)) FROM unnest(emails[1:200]) AS e
    );
$$;

REVOKE ALL ON FUNCTION public.emails_com_conta(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emails_com_conta(text[]) TO authenticated;


-- ------------------------------------------------------------------------------
-- 5. Perfil automático no cadastro + perfis faltantes
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_perfil_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuarios (id, nome, email, acompanha_mei)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    CASE WHEN lower(NEW.raw_user_meta_data->>'acompanha_mei') = 'true' THEN true ELSE false END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_perfil ON auth.users;
CREATE TRIGGER on_auth_user_created_perfil
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.criar_perfil_usuario();

-- Contas antigas sem perfil (somente INSERT do que falta; nada é sobrescrito)
INSERT INTO public.usuarios (id, nome, email, acompanha_mei)
SELECT
  au.id,
  COALESCE(
    NULLIF(au.raw_user_meta_data->>'display_name', ''),
    NULLIF(au.raw_user_meta_data->>'full_name', ''),
    split_part(au.email, '@', 1)
  ),
  au.email,
  CASE WHEN lower(au.raw_user_meta_data->>'acompanha_mei') = 'true' THEN true ELSE false END
FROM auth.users au
LEFT JOIN public.usuarios u ON u.id = au.id
WHERE u.id IS NULL
ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------------------------
-- 6. Controle de uso da IA (Edge Function ai-generate)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ia_requisicoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL DEFAULT auth.uid(),
  tarefa text NOT NULL,
  modelo text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ia_requisicoes_pkey PRIMARY KEY (id),
  CONSTRAINT ia_requisicoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ia_requisicoes_usuario_data ON public.ia_requisicoes (usuario_id, criado_em DESC);

ALTER TABLE public.ia_requisicoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ia_requisicoes' AND policyname = 'ia_requisicoes_select_proprio') THEN
    CREATE POLICY ia_requisicoes_select_proprio ON public.ia_requisicoes FOR SELECT TO authenticated
      USING (usuario_id = (SELECT auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ia_requisicoes' AND policyname = 'ia_requisicoes_insert_proprio') THEN
    CREATE POLICY ia_requisicoes_insert_proprio ON public.ia_requisicoes FOR INSERT TO authenticated
      WITH CHECK (usuario_id = (SELECT auth.uid()));
  END IF;
END $$;
