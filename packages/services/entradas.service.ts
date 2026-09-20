import { supabase } from "./supabase";

export const entradasService = {
  async getEntradasByYear(userId: string, year: number) {
    const firstDay = `${year}-01-01`;
    const lastDay = `${year}-12-31`;

    const { data, error } = await supabase
      .from("transacoes")
      .select('descricao, valor, data')
      .eq('usuario_id', userId)
      .eq('tipo', 'RECEITA')
      .gte('data', firstDay)
      .lte('data', lastDay);

    if (error) throw error;
    return data;
  },

  async addEntrada(descricao: string, valor: number, data: string, conta_id: string | null = null, categoria: string = "Outros") {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado");

    const { data: transacao, error: errTransacao } = await supabase
      .from("transacoes")
      .insert([{
        usuario_id: user.id,
        tipo: 'RECEITA',
        descricao,
        valor,
        data,
        conta_id,
        observacao: `[LEGADO] Categoria: ${categoria}`
      }]).select().single();

    if (errTransacao) throw errTransacao;

    if (conta_id) {
      const { error: errMov } = await supabase.from("movimentacoes").insert([{
        usuario_id: user.id,
        transacao_id: transacao.id,
        conta_id,
        tipo: 'ENTRADA',
        valor,
        data
      }]);
      if (errMov) throw errMov;
    }
  },
};