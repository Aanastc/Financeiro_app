-- ==============================================================================
-- MIGRATION 009: CONVIDADOS (SÓ DIVISÃO DE CONTAS) + "COMPARTILHADO COMIGO"
-- ==============================================================================
-- Aditiva e idempotente. Requer, no painel do Supabase:
--   Authentication → Sign In / Providers → "Allow anonymous sign-ins" = ON
--   (recomendado também ativar CAPTCHA para evitar criação abusiva de convidados)
--
--   1. Convidado = usuário anônimo do Supabase (sem e-mail/senha/CPF). O perfil é
--      criado com o nome "Convidado(a)" e pode virar conta completa depois.
--   2. Convidado pode aceitar convite (não tem e-mail para conferir).
--   3. despesas_compartilhadas_comigo(): quem foi vinculado a um contato vê, em
--      SOMENTE LEITURA, as despesas divididas com ele — apenas data, descrição,
--      valor e situação. Nenhum outro dado da conta de quem dividiu é exposto.
-- ==============================================================================

-- Requer 008 (somente_digitos / trigger de CPF). Recria a função de perfil:
CREATE OR REPLACE FUNCTION public.criar_perfil_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuarios (id, nome, email, acompanha_mei, cpf, telefone)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(split_part(coalesce(NEW.email, ''), '@', 1), ''),
      'Convidado(a)'
    ),
    NEW.email,
    CASE WHEN lower(NEW.raw_user_meta_data->>'acompanha_mei') = 'true' THEN true ELSE false END,
    NULLIF(btrim(NEW.raw_user_meta_data->>'cpf'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'telefone'), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- Convite: convidado anônimo pode aceitar
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aceitar_convite(p_contato_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_anonimo boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
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

  -- Conta completa precisa ter o mesmo e-mail do contato (se houver); convidado anônimo não tem e-mail
  IF NOT v_anonimo AND c.email IS NOT NULL AND btrim(c.email) <> ''
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

-- ------------------------------------------------------------------------------
-- Leitura tolerante de JSON (observação pode ser texto livre)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.json_seguro(valor text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF valor IS NULL OR valor !~ '^\s*\{' THEN
    RETURN NULL;
  END IF;
  RETURN valor::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.numero_seguro(valor text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN valor::numeric;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- ------------------------------------------------------------------------------
-- Despesas compartilhadas comigo (somente leitura, campos mínimos)
--   direcao = 'VOCE_DEVE'  → a outra pessoa pagou e você deve sua parte
--   direcao = 'TE_DEVEM'   → você pagou e a outra pessoa deve a parte dela
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.despesas_compartilhadas_comigo()
RETURNS TABLE (
  id uuid,
  data date,
  descricao text,
  valor numeric,
  valor_pago numeric,
  quitado boolean,
  direcao text,
  pessoa text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH vinculos AS (
    SELECT c.id AS contato_id, c.usuario_id AS dono
    FROM public.contatos c
    WHERE auth.uid() IS NOT NULL AND c.usuario_vinculado_id = auth.uid()
  )
  -- A outra pessoa pagou e lançou a sua parte como "terceiro" (você deve a ela)
  SELECT t.id, t.data, t.descricao, t.valor,
         coalesce(public.numero_seguro(public.json_seguro(t.observacao) ->> 'valor_pago'), CASE WHEN t.terceiro_pago THEN t.valor ELSE 0 END),
         t.terceiro_pago, 'VOCE_DEVE', u.nome
  FROM public.transacoes t
  JOIN vinculos v ON v.contato_id = t.contato_id AND v.dono = t.usuario_id
  JOIN public.usuarios u ON u.id = v.dono
  WHERE t.tipo = 'DESPESA' AND t.terceiro = true

  UNION ALL

  -- Você pagou e a outra pessoa registrou que deve a parte dela a você
  SELECT t.id, t.data, t.descricao, t.valor,
         coalesce(public.numero_seguro(public.json_seguro(t.observacao) ->> 'valor_pago'), CASE WHEN t.terceiro_pago THEN t.valor ELSE 0 END),
         t.terceiro_pago, 'TE_DEVEM', u.nome
  FROM public.transacoes t
  JOIN vinculos v ON v.dono = t.usuario_id
  JOIN public.usuarios u ON u.id = v.dono
  WHERE t.tipo = 'DESPESA'
    AND public.json_seguro(t.observacao) ->> 'parceria_credor_id' = v.contato_id::text

  ORDER BY 2 DESC;
$$;

REVOKE ALL ON FUNCTION public.despesas_compartilhadas_comigo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.despesas_compartilhadas_comigo() TO authenticated;
