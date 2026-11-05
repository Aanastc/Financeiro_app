-- ==============================================================================
-- MIGRATION 004: GRUPOS E MEMBROS (DESPESAS COMPARTILHADAS)
-- ==============================================================================

-- 1. TABELA DE GRUPOS
CREATE TABLE IF NOT EXISTS public.grupos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL DEFAULT auth.uid(),
  nome text NOT NULL,
  tipo text DEFAULT 'outro', -- 'viagem', 'casa', 'casal', 'role', 'outro'
  descricao text,
  icone text DEFAULT 'Users',
  cor_hex text DEFAULT '#8b5cf6',
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT grupos_pkey PRIMARY KEY (id),
  CONSTRAINT grupos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE
);

-- 2. TABELA DE MEMBROS DO GRUPO
CREATE TABLE IF NOT EXISTS public.grupo_membros (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL,
  contato_id uuid,
  usuario_id uuid,
  nome text NOT NULL,
  email text,
  telefone text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT grupo_membros_pkey PRIMARY KEY (id),
  CONSTRAINT grupo_membros_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id) ON DELETE CASCADE
);

-- 3. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_grupos_usuario_id ON public.grupos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_grupo_membros_grupo_id ON public.grupo_membros(grupo_id);
CREATE INDEX IF NOT EXISTS idx_grupo_membros_contato_id ON public.grupo_membros(contato_id);
CREATE INDEX IF NOT EXISTS idx_grupo_membros_usuario_id ON public.grupo_membros(usuario_id);

-- 4. POLÍTICAS RLS (ROW LEVEL SECURITY)
ALTER TABLE public.grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupo_membros ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'grupos' AND policyname = 'grupos_select_policy') THEN
    CREATE POLICY grupos_select_policy ON public.grupos FOR SELECT USING (usuario_id = auth.uid());
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'grupos' AND policyname = 'grupos_insert_policy') THEN
    CREATE POLICY grupos_insert_policy ON public.grupos FOR INSERT WITH CHECK (usuario_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'grupos' AND policyname = 'grupos_update_policy') THEN
    CREATE POLICY grupos_update_policy ON public.grupos FOR UPDATE USING (usuario_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'grupos' AND policyname = 'grupos_delete_policy') THEN
    CREATE POLICY grupos_delete_policy ON public.grupos FOR DELETE USING (usuario_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'grupo_membros' AND policyname = 'grupo_membros_all_policy') THEN
    CREATE POLICY grupo_membros_all_policy ON public.grupo_membros FOR ALL 
    USING (
      EXISTS (
        SELECT 1 FROM public.grupos g 
        WHERE g.id = grupo_membros.grupo_id AND g.usuario_id = auth.uid()
      )
    );
  END IF;
END $$;

