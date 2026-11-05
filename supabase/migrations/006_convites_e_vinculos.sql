-- ==============================================================================
-- MIGRATION 006: CONVITES — VÍNCULO ENTRE CONTATO E CONTA DO AMIGO
-- ==============================================================================
-- Aditiva e idempotente: só adiciona coluna/índice/função. Nenhum dado é apagado.
--
-- Fluxo:
--   1. A usuária gera um convite para um contato (link /register?convite=<contato_id>).
--   2. O amigo cria a conta (ou entra) pelo link.
--   3. O app chama aceitar_convite(<contato_id>), que grava em
--      contatos.usuario_vinculado_id a conta do amigo.
--
-- Segurança:
--   * Só quem está logado pode aceitar.
--   * Se o contato tem e-mail cadastrado, o e-mail da conta precisa ser o mesmo
--     (impede que alguém com o link "sequestre" o vínculo).
--   * Não dá para aceitar o próprio convite nem trocar um vínculo já feito por outra pessoa.
--   * O vínculo por si só NÃO dá acesso a dados de ninguém (RLS continua "cada um vê o seu").
-- ==============================================================================

ALTER TABLE public.contatos
  ADD COLUMN IF NOT EXISTS usuario_vinculado_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contatos_usuario_vinculado_id ON public.contatos (usuario_vinculado_id);

CREATE OR REPLACE FUNCTION public.aceitar_convite(p_contato_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  c public.contatos%ROWTYPE;
  v_convidante text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_autenticado');
  END IF;

  SELECT * INTO c FROM public.contatos WHERE id = p_contato_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'convite_invalido');
  END IF;

  IF c.usuario_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'proprio_convite');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  IF c.email IS NOT NULL AND btrim(c.email) <> ''
     AND lower(btrim(c.email)) <> lower(btrim(coalesce(v_email, ''))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'email_diferente');
  END IF;

  IF c.usuario_vinculado_id IS NOT NULL AND c.usuario_vinculado_id <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_vinculado');
  END IF;

  UPDATE public.contatos
     SET usuario_vinculado_id = v_uid,
         email = COALESCE(NULLIF(btrim(email), ''), v_email)
   WHERE id = p_contato_id;

  SELECT nome INTO v_convidante FROM public.usuarios WHERE id = c.usuario_id;

  RETURN jsonb_build_object('ok', true, 'convidante', v_convidante);
END;
$$;

REVOKE ALL ON FUNCTION public.aceitar_convite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aceitar_convite(uuid) TO authenticated;
