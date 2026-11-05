-- ==============================================================================
-- MIGRATION 010: REGISTRO DE NOTIFICAÇÕES POR E-MAIL (DIVISÃO DE CONTAS)
-- ==============================================================================
-- Aditiva. Usada pela Edge Function notificar-divisao para limitar envios por
-- usuário e manter histórico de quem foi avisado de qual despesa.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.notificacoes_email (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL DEFAULT auth.uid(),
  contato_id uuid,
  transacao_ids uuid[] NOT NULL DEFAULT '{}',
  destinatario text NOT NULL,
  status text NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado', 'erro')),
  erro text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notificacoes_email_pkey PRIMARY KEY (id),
  CONSTRAINT notificacoes_email_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE,
  CONSTRAINT notificacoes_email_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.contatos(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_email_usuario_data ON public.notificacoes_email (usuario_id, criado_em DESC);

ALTER TABLE public.notificacoes_email ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notificacoes_email' AND policyname = 'notificacoes_email_select_proprio') THEN
    CREATE POLICY notificacoes_email_select_proprio ON public.notificacoes_email FOR SELECT TO authenticated
      USING (usuario_id = (SELECT auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notificacoes_email' AND policyname = 'notificacoes_email_insert_proprio') THEN
    CREATE POLICY notificacoes_email_insert_proprio ON public.notificacoes_email FOR INSERT TO authenticated
      WITH CHECK (usuario_id = (SELECT auth.uid()));
  END IF;
END $$;
