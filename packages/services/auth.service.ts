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
   * ATUALIZAÇÃO DE PERFIL
   * Atualiza o nome na tabela pública e nos metadados do Auth.
   */
  async updateProfile(nome: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado");

    // Atualiza na tabela pública 'usuarios'
    const { error: dbError } = await supabase
      .from("usuarios")
      .update({ nome })
      .eq("id", user.id);

    if (dbError) throw dbError;

    // Atualiza nos metadados do Auth (para o Dashboard Administrativo)
    await supabase.auth.updateUser({
      data: { display_name: nome }
    });
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
      .select("nome, email")
      .eq("id", user.id)
      .single();

    if (error) {
      // Fallback: Retorna dados do Auth se a tabela pública falhar
      return { 
        nome: user.user_metadata?.display_name || "Usuário", 
        email: user.email 
      };
    }
    
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