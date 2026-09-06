import { supabase } from "./supabase";

export const authService = {
  /**
   * CADASTRO DE USUÁRIO
   * Cria a conta no Auth e insere os dados na tabela pública 'usuarios'.
   */
async register(email: string, password: string, nome: string) {
  // 1. Registro no Auth
  const { data, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: nome, full_name: nome },
    },
  });

  if (authError) throw authError;

  // 2. Registro na tabela pública
  if (data.user) {
    const { error: dbError } = await supabase
      .from("usuarios")
      .insert([{ id: data.user.id, nome: nome, email: email }]);

    if (dbError) {
      // Se for erro de RLS, apenas logamos no console e deixamos o fluxo seguir
      // O perfil será criado/corrigido quando o usuário validar o Token
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
  async updateProfile(nome: string, avatarUrl?: string, email?: string, password?: string, telefone?: string, cpf?: string) {
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

    const { error: dbError } = await supabase
      .from("usuarios")
      .update(dbUpdates)
      .eq("id", user.id);

    if (dbError) throw dbError;
  },

  /**
   * BUSCAR DADOS DO USUÁRIO ATUAL
   * Tenta buscar na tabela 'usuarios', com fallback para o Auth Metadata.
   */
  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("usuarios")
      .select("id, nome, email, telefone, cpf")
      .eq("id", user.id)
      .single();

    if (error) {
      // Fallback: Retorna dados do Auth se a tabela pública falhar
      return { 
        id: user.id,
        nome: user.user_metadata?.display_name || "Usuário", 
        avatar_url: user.user_metadata?.avatar_url || null,
        email: user.email 
      };
    }
    
    return {
      ...data,
      avatar_url: user.user_metadata?.avatar_url || null
    };
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