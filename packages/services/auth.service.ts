import { supabase } from "./supabase";

export const authService = {
  // CADASTRO
  async register(email: string, password: string, nome: string) {
    // 1. Cria no Auth
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) throw authError;

    if (data.user) {
      // 2. Salva na tabela public.usuarios
      const { error: dbError } = await supabase
        .from("usuarios")
        .insert([{ id: data.user.id, nome }]);

      if (dbError) throw dbError;
    }
    return data;
  },

  // LOGIN
  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },

  // EDIÇÃO DE PERFIL
  async updateProfile(nome: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado");

    const { error } = await supabase
      .from("usuarios")
      .update({ nome })
      .eq("id", user.id);

    if (error) throw error;
  },

  // BUSCAR NOME DO USUÁRIO ATUAL
  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("usuarios")
      .select("nome")
      .eq("id", user.id)
      .single();

    if (error) throw error;
    return data;
  },

  async logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
},
};

