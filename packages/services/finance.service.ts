import { supabase } from "./supabase";

export const financeService = {
  /**
   * REALTIME - ASSINAR MUDANÇAS
   */
  subscribeToChanges: (table: string, userId: string, callback: () => void) => {
    const channel = supabase
      .channel(`db-changes-${table}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
          filter: `usuario_id=eq.${userId}`,
        },
        () => {
          callback();
        }
      )
      .subscribe();

    return channel;
  },

  /**
   * BUSCA ESTATÍSTICAS FINANCEIRAS
   */
  async getMonthlyStats(usuario_id: string, startDate: string, endDate: string) {
    try {
      const [entradas, gastos] = await Promise.all([
        supabase.from("entradas").select("valor").eq("usuario_id", usuario_id).gte("data", startDate).lte("data", endDate),
        supabase.from("gastos").select("valor").eq("usuario_id", usuario_id).gte("data", startDate).lte("data", endDate),
      ]);

      // CORREÇÃO TS: Tipagem sum e item
      const totalEntradas = entradas.data?.reduce((sum: number, item: any) => sum + Number(item.valor), 0) || 0;
      const totalGastos = gastos.data?.reduce((sum: number, item: any) => sum + Number(item.valor), 0) || 0;

      return {
        totalEntradas,
        totalGastos,
        saldo: totalEntradas - totalGastos,
      };
    } catch (error) {
      console.error("Erro ao buscar estatísticas:", error);
      throw error;
    }
  },

  /**
   * BUSCA OS LANÇAMENTOS MAIS RECENTES
   */
  async getRecentTransactions(usuario_id: string, limit: number) {
    try {
      const [entradas, gastos] = await Promise.all([
        supabase.from("entradas").select("id, descricao, valor, data").eq("usuario_id", usuario_id).order("data", { ascending: false }).limit(limit),
        supabase.from("gastos").select("id, descricao, valor, data").eq("usuario_id", usuario_id).order("data", { ascending: false }).limit(limit),
      ]);

      // CORREÇÃO TS: Tipagem i
      const merged = [
        ...(entradas.data?.map((i: any) => ({ ...i, tipo: "entrada" })) || []),
        ...(gastos.data?.map((i: any) => ({ ...i, tipo: "gasto" })) || []),
      ];

      return merged
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
        .slice(0, limit);
    } catch (error) {
      throw error;
    }
  },

  async addGasto(usuario_id: string, dados: any) {
    const { data, error } = await supabase.from("gastos").insert([{ ...dados, usuario_id }]).select();
    if (error) throw error;
    return data;
  },

  async deleteRecord(table: 'gastos' | 'entradas', id: string) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
  }
};