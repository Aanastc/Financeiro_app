import { supabase } from "./supabase";

export const financeService = {
  /**
   * REALTIME - ASSINAR MUDANÇAS
   * Ouve qualquer inserção, atualização ou deleção em tempo real.
   */
  subscribeToChanges: (table: string, userId: string, callback: () => void) => {
    const channel = supabase
      .channel(`db-changes-${table}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: table,
          filter: `usuario_id=eq.${userId}`,
        },
        () => {
          callback(); // Executa a função de recarregar dados na interface
        }
      )
      .subscribe();

    return channel;
  },

  /**
   * BUSCA ESTATÍSTICAS FINANCEIRAS (Entradas e Gastos)
   */
  async getMonthlyStats(usuario_id: string, startDate: string, endDate: string) {
    try {
      const [entradas, gastos] = await Promise.all([
        supabase
          .from("entradas")
          .select("valor")
          .eq("usuario_id", usuario_id)
          .gte("data", startDate)
          .lte("data", endDate),
        supabase
          .from("gastos")
          .select("valor")
          .eq("usuario_id", usuario_id)
          .gte("data", startDate)
          .lte("data", endDate),
      ]);

      const totalEntradas = entradas.data?.reduce((sum, item) => sum + Number(item.valor), 0) || 0;
      const totalGastos = gastos.data?.reduce((sum, item) => sum + Number(item.valor), 0) || 0;

      const mediaEntradas = entradas.data?.length ? totalEntradas / entradas.data.length : 0;
      const mediaGastos = gastos.data?.length ? totalGastos / gastos.data.length : 0;

      return {
        totalEntradas,
        totalGastos,
        mediaEntradas,
        mediaGastos,
        saldo: totalEntradas - totalGastos,
      };
    } catch (error) {
      console.error("Erro ao buscar estatísticas:", error);
      throw error;
    }
  },

  /**
   * BUSCA OS LANÇAMENTOS MAIS RECENTES (Unificado)
   */
  async getRecentTransactions(usuario_id: string, limit: number) {
    try {
      const [entradas, gastos] = await Promise.all([
        supabase
          .from("entradas")
          .select("id, descricao, valor, data")
          .eq("usuario_id", usuario_id)
          .order("data", { ascending: false })
          .limit(limit),
        supabase
          .from("gastos")
          .select("id, descricao, valor, data")
          .eq("usuario_id", usuario_id)
          .order("data", { ascending: false })
          .limit(limit),
      ]);

      const merged = [
        ...(entradas.data?.map((i) => ({ ...i, tipo: "entrada" })) || []),
        ...(gastos.data?.map((i) => ({ ...i, tipo: "gasto" })) || []),
      ];

      return merged
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
        .slice(0, limit);
    } catch (error) {
      console.error("Erro ao buscar transações recentes:", error);
      throw error;
    }
  },

  /**
   * ADICIONAR ENTRADA
   */
  async addEntrada(usuario_id: string, dados: { descricao: string; valor: number; data: string }) {
    const { data, error } = await supabase
      .from("entradas")
      .insert([{ ...dados, usuario_id }])
      .select();

    if (error) throw error;
    return data;
  },

  /**
   * ADICIONAR GASTO
   */
  async addGasto(usuario_id: string, dados: { descricao: string; valor: number; data: string; classificacao: string; categoria?: string; tipo?: string }) {
    const { data, error } = await supabase
      .from("gastos")
      .insert([{ ...dados, usuario_id }])
      .select();

    if (error) throw error;
    return data;
  },

  /**
   * DELETAR REGISTRO (Unificado)
   */
  async deleteRecord(table: 'gastos' | 'entradas', id: string) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
  },

  /**
   * BUSCAR METAS
   */
  async getMetas(usuario_id: string) {
    const { data, error } = await supabase
      .from("metas")
      .select("*, metas_depositos(valor)")
      .eq("usuario_id", usuario_id)
      .order("criado_em", { ascending: false });

    if (error) throw error;
    return data;
  }
};