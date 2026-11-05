-- ==============================================================================
-- MIGRATION 008: CPF E TELEFONE ÚNICOS POR CONTA + E-MAIL SINCRONIZADO
-- ==============================================================================
-- Aditiva: não apaga nem reescreve dados existentes.
--
--   1. Um CPF e um telefone só podem pertencer a UMA conta. A comparação usa só os
--      dígitos ("149.676.036-02" = "14967603602"). Vale no cadastro e na edição do
--      perfil, e é garantida no banco (não dá para contornar pelo front-end).
--   2. O cadastro grava CPF e telefone enviados pelo app (metadados do signUp).
--      Se já estiverem em uso, o cadastro é recusado.
--   3. Quando a troca de e-mail é CONFIRMADA no Auth, o perfil é atualizado.
--
-- Contas antigas sem CPF/telefone continuam válidas (o app pede para completar).
-- Se já houver duplicados no banco, os índices únicos não são criados (aviso no log)
-- mas a validação por trigger continua barrando NOVOS duplicados.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.somente_digitos(valor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(coalesce(valor, ''), '\D', '', 'g'), '');
$$;

-- ------------------------------------------------------------------------------
-- 1. Validação de duplicidade (SECURITY DEFINER: enxerga outras contas apesar do RLS,
--    mas só devolve "já em uso", sem expor de quem)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_cpf_telefone_unicos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.somente_digitos(NEW.cpf) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id <> NEW.id AND public.somente_digitos(u.cpf) = public.somente_digitos(NEW.cpf)
  ) THEN
    RAISE EXCEPTION 'CPF_EM_USO' USING ERRCODE = '23505', HINT = 'Já existe uma conta com este CPF.';
  END IF;

  IF public.somente_digitos(NEW.telefone) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id <> NEW.id AND public.somente_digitos(u.telefone) = public.somente_digitos(NEW.telefone)
  ) THEN
    RAISE EXCEPTION 'TELEFONE_EM_USO' USING ERRCODE = '23505', HINT = 'Já existe uma conta com este telefone.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuarios_cpf_telefone_unicos ON public.usuarios;
CREATE TRIGGER trg_usuarios_cpf_telefone_unicos
  BEFORE INSERT OR UPDATE OF cpf, telefone ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.validar_cpf_telefone_unicos();

-- Índices únicos (garantia extra), só se ainda não houver duplicados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT public.somente_digitos(cpf) FROM public.usuarios
    WHERE public.somente_digitos(cpf) IS NOT NULL
    GROUP BY 1 HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_cpf_digitos
      ON public.usuarios (public.somente_digitos(cpf))
      WHERE public.somente_digitos(cpf) IS NOT NULL;
  ELSE
    RAISE NOTICE 'Há CPFs duplicados em usuarios: índice único não criado (o trigger segue barrando novos).';
  END IF;

  IF NOT EXISTS (
    SELECT public.somente_digitos(telefone) FROM public.usuarios
    WHERE public.somente_digitos(telefone) IS NOT NULL
    GROUP BY 1 HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_telefone_digitos
      ON public.usuarios (public.somente_digitos(telefone))
      WHERE public.somente_digitos(telefone) IS NOT NULL;
  ELSE
    RAISE NOTICE 'Há telefones duplicados em usuarios: índice único não criado (o trigger segue barrando novos).';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Perfil no cadastro agora inclui CPF e telefone (substitui a função da 005)
-- ------------------------------------------------------------------------------
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
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    CASE WHEN lower(NEW.raw_user_meta_data->>'acompanha_mei') = 'true' THEN true ELSE false END,
    NULLIF(btrim(NEW.raw_user_meta_data->>'cpf'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'telefone'), '')
  )
  ON CONFLICT (id) DO NOTHING;
  -- CPF/telefone repetidos: o trigger de usuarios lança erro e o cadastro inteiro é desfeito
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. E-mail do perfil acompanha a troca CONFIRMADA no Auth
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sincronizar_email_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.usuarios SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_alterado ON auth.users;
CREATE TRIGGER on_auth_user_email_alterado
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sincronizar_email_usuario();
