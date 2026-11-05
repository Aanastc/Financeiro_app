import { supabase } from "./supabase";

/** Perfil do usuário (tabela public.usuarios + avatar do Auth). */
export interface PerfilUsuario {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cpf: string | null;
  acompanha_mei: boolean | null;
  avatar_url: string | null;
}

export const authService = {
  /**
   * CADASTRO DE USUÁRIO
   * Cria a conta no Auth e insere os dados na tabela pública 'usuarios'.
   */
async register(email: string, password: string, nome: string, acompanha_mei: boolean = false) {
  // 1. Registro no Auth
  const { data, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // lidos pelo trigger criar_perfil_usuario (migration 005)
      data: { display_name: nome, full_name: nome, acompanha_mei },
    },
  });

  if (authError) throw authError;

  // 2. Registro na tabela pública
  if (data.user) {
    // O perfil normalmente já é criado pelo trigger no banco; isto é só um reforço.
    const { error: dbError } = await supabase
      .from("usuarios")
      .upsert([{ id: data.user.id, nome, email, acompanha_mei }], { onConflict: "id", ignoreDuplicates: true });

    if (dbError) {
      // Sem sessão ainda (confirmação de e-mail pendente) o RLS bloqueia — o trigger cuida do perfil.
      console.warn("Aviso: Perfil será sincronizado após a validação do e-mail.");
    }
  }
  return data;
},

  /**
   * VERIFICAÇÃO DE TOKEN (OTP)
   * Valida o código de 6 dígitos enviado por e-mail.
   */
  async verifyOtp(email: string, token: string) {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup',
    });
    
    if (error) throw error;
    return data;
  },

  /**
   * REENVIAR TOKEN (OTP)
   * Reenvia o código de ativação para o e-mail do usuário.
   */
  async resendOtp(email: string) {
    const { data, error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });
    
    if (error) throw error;
    return data;
  },

  /**
   * LOGIN
   */
  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) throw error;
    return data;
  },

  /**
   * SIGN IN WITH GOOGLE
   */
  async signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/home`,
      },
    });
    if (error) throw error;
    return data;
  },

  /**
   * ATUALIZAÇÃO DE PERFIL
   * Atualiza o nome, email, senha e foto na tabela pública e nos metadados do Auth.
   */
  async updateProfile(nome: string, avatarUrl?: string, email?: string, password?: string, telefone?: string, cpf?: string, acompanha_mei?: boolean) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado");

    // Prepara as atualizações do Auth
    const authUpdates: any = {
      data: { display_name: nome, full_name: nome, avatar_url: avatarUrl }
    };

    if (email && email !== user.email) {
      authUpdates.email = email;
    }

    if (password) {
      authUpdates.password = password;
    }

    // 1. Atualiza nos metadados do Auth (e altera e-mail/senha se fornecidos)
    const { error: authError } = await supabase.auth.updateUser(authUpdates);
    if (authError) throw authError;

    // 2. Atualiza na tabela pública 'usuarios'
    const dbUpdates: any = { nome };
    if (email && email !== user.email) dbUpdates.email = email;
    if (telefone !== undefined) dbUpdates.telefone = telefone;
    if (cpf !== undefined) dbUpdates.cpf = cpf;
    if (acompanha_mei !== undefined) dbUpdates.acompanha_mei = acompanha_mei;

    const { error: dbError } = await supabase
      .from("usuarios")
      .update(dbUpdates)
      .eq("id", user.id);

    if (dbError) throw dbError;
  },

  /**
   * Quais destes e-mails já têm conta no app? Não expõe nenhum outro dado pessoal.
   * Usa a função emails_com_conta (migration 005); se ela ainda não existir,
   * recorre à consulta antiga para não quebrar o recurso durante a transição.
   */
  async emailsComConta(emails: string[]): Promise<Set<string>> {
    const normalizados = Array.from(new Set(emails.map(e => (e || "").trim().toLowerCase()).filter(Boolean)));
    if (normalizados.length === 0) return new Set();

    const { data, error } = await supabase.rpc("emails_com_conta", { emails: normalizados });
    if (!error) {
      return new Set(((data as string[] | null) || []).map(e => e.toLowerCase()));
    }

    const { data: legado } = await supabase.from("usuarios").select("email").in("email", normalizados);
    return new Set((legado || []).map((u: any) => (u.email || "").toLowerCase()).filter(Boolean));
  },

  /**
   * BUSCAR DADOS DO USUÁRIO ATUAL
   * Tenta buscar na tabela 'usuarios', com fallback para o Auth Metadata.
   */
  async getCurrentUser(): Promise<PerfilUsuario | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("usuarios")
      .select("id, nome, email, telefone, cpf, acompanha_mei")
      .eq("id", user.id)
      .single();

    const avatar_url: string | null = user.user_metadata?.avatar_url || null;

    if (error || !data) {
      // Fallback: Retorna dados do Auth se a tabela pública falhar
      return {
        id: user.id,
        nome: user.user_metadata?.display_name || "Usuário",
        email: user.email ?? null,
        telefone: null,
        cpf: null,
        acompanha_mei: null,
        avatar_url,
      };
    }

    return { ...data, avatar_url };
  },

  /**
   * UPLOAD DE AVATAR
   * Faz o upload da foto de perfil para o storage e retorna a URL pública.
   */
  async uploadAvatar(file: File, userId: string) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}-${Math.random()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    return data.publicUrl;
  },

  /**
   * RECUPERAÇÃO DE SENHA (ESQUECI MINHA SENHA)
   * Envia um link de recuperação para o e-mail do usuário.
   */
  async resetPasswordForEmail(email: string) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
    return data;
  },

  /**
   * ATUALIZAR SENHA
   * Atualiza a senha do usuário logado/em sessão de recuperação.
   */
  async updatePassword(password: string) {
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return data;
  },

  /**
   * LOGOUT
   */
  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};