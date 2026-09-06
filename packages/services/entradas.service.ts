import { supabase } from "./supabase";

export const entradasService = {
  async getEntradasByYear(userId: string, year: number) {
    const firstDay = `${year}-01-01`;
    const lastDay = `${year}-12-31`;

    const { data, error } = await supabase
      .from("receitas")
      .select('descricao, valor, data')
      .eq('usuario_id', userId)
      .gte('data', firstDay)
      .lte('data', lastDay);

    if (error) throw error;
    return data;
  },

  async addEntrada(descricao: string, valor: number, data: string, conta_id: string | null = null, categoria: string = "Outros") {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado");

    const { error } = await supabase
      .from("transacoes")
      .insert([{
        usuario_id: user.id,
        tipo: 'RECEITA',
        descricao,
        valor,
        data,
        conta_id,
        observacao: `[LEGADO] Categoria: ${categoria}`
      }]);

    if (error) throw error;
  },
};