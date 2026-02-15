import { supabase } from "./supabase";

export const entradasService = {
  async getEntradasByYear(userId: string, year: number) {
    const firstDay = `${year}-01-01`;
    const lastDay = `${year}-12-31`;

    const { data, error } = await supabase
      .from('entradas')
      .select('descricao, valor, data')
      .eq('usuario_id', userId)
      .gte('data', firstDay)
      .lte('data', lastDay);

    if (error) throw error;
    return data;
  },

  async addEntrada(descricao: string, valor: number, data: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Não autenticado");

    const { error } = await supabase
      .from('entradas')
      .insert([{ usuario_id: user.id, descricao, valor, data }]);

    if (error) throw error;
  }
};