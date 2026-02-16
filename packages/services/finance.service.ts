import { supabase } from "./supabase";

export const financeService = {
  /**
   * BUSCA ESTATÍSTICAS FINANCEIRAS (Entradas e Gastos)
   * Útil para o resumo mensal e anual.
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

      // Médias simples (Baseadas na quantidade de registros no período)
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
   * Mescla entradas e gastos para mostrar na Home.
   */
  async getRecentTransactions(usuario_id: string, limit: number) {
    try {
      // Busca os últimos registros de cada tabela
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

      // Adiciona a marcação de tipo e unifica
      const merged = [
        ...(entradas.data?.map((i) => ({ ...i, tipo: "entrada" })) || []),
        ...(gastos.data?.map((i) => ({ ...i, tipo: "gasto" })) || []),
      ];

      // Ordena por data (mais recente primeiro) e limita ao número solicitado
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
  async addGasto(usuario_id: string, dados: { descricao: string; valor: number; data: string; classificacao: string }) {
    const { data, error } = await supabase
      .from("gastos")
      .insert([{ ...dados, usuario_id }])
      .select();

    if (error) throw error;
    return data;
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