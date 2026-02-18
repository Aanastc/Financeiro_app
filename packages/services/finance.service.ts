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
   * ESTATÍSTICAS FINANCEIRAS (DASHBOARD)
   * Regra: Soma entradas (-) gastos Débito (-) pagamentos de faturas.
   * Gastos no crédito são ignorados aqui para evitar duplicidade.
   */
  async getMonthlyStats(usuario_id: string, startDate: string, endDate: string) {
    try {
      const [entradas, gastosDebito, pagamentosFatura] = await Promise.all([
        supabase.from("entradas").select("valor").eq("usuario_id", usuario_id).gte("data", startDate).lte("data", endDate),
        supabase.from("gastos").select("valor").eq("usuario_id", usuario_id).eq("considerar_soma", true).gte("data", startDate).lte("data", endDate),
        supabase.from("pagamentos_faturas").select("valor").eq("usuario_id", usuario_id).gte("data", startDate).lte("data", endDate),
      ]);

      const totalEntradas = entradas.data?.reduce((sum: number, item: any) => sum + Number(item.valor), 0) || 0;
      const totalGastosDebito = gastosDebito.data?.reduce((sum: number, item: any) => sum + Number(item.valor), 0) || 0;
      const totalPagamentos = pagamentosFatura.data?.reduce((sum: number, item: any) => sum + Number(item.valor), 0) || 0;

      return {
        totalEntradas,
        totalGastos: totalGastosDebito + totalPagamentos,
        saldo: totalEntradas - (totalGastosDebito + totalPagamentos),
      };
    } catch (error) {
      console.error("Erro ao buscar estatísticas:", error);
      throw error;
    }
  },

  async getRecentTransactions(usuario_id: string, limit: number) {
    try {
      const [entradas, gastos] = await Promise.all([
        supabase.from("entradas").select("id, descricao, valor, data").eq("usuario_id", usuario_id).order("data", { ascending: false }).limit(limit),
        supabase.from("gastos").select("id, descricao, valor, data, metodo_pagamento").eq("usuario_id", usuario_id).order("data", { ascending: false }).limit(limit),
      ]);

      const merged = [
        ...(entradas.data?.map((i: any) => ({ ...i, tipo: "entrada" })) || []),
        ...(gastos.data?.map((i: any) => ({ ...i, tipo: "gasto" })) || []),
      ];

      return merged
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
        .slice(0, limit);
    } catch (error) { throw error; }
  },

  async getCartoes(usuario_id: string) {
    const { data, error } = await supabase.from("cartoes").select("*").eq("usuario_id", usuario_id).order("nome");
    if (error) throw error;
    return data;
  },

  async addCartao(usuario_id: string, dados: any) {
    const { data, error } = await supabase.from("cartoes").insert([{ ...dados, usuario_id }]).select();
    if (error) throw error;
    return data;
  },

  async getAllGastosCredito(usuario_id: string) {
    const { data, error } = await supabase.from("gastos").select("*").eq("usuario_id", usuario_id).eq("metodo_pagamento", "Crédito"); 
    if (error) throw error;
    return data;
  },

  /**
   * BUSCA PAGAMENTOS PARA LIBERAÇÃO DE LIMITE
   */
  async getPagamentosFaturas(usuario_id: string) {
    const { data, error } = await supabase.from("pagamentos_faturas").select("*").eq("usuario_id", usuario_id);
    if (error) throw error;
    return data;
  },

  async addGasto(usuario_id: string, form: any) {
    const valorNumerico = typeof form.valor === 'string' 
        ? parseFloat(form.valor.replace(/\./g, "").replace(",", ".")) 
        : form.valor;
    
    const numParcelas = parseInt(form.parcelas) || 1;
    const isCredito = form.metodo_pagamento === "Crédito";

    if (isCredito && numParcelas > 1) {
      const idAgrupador = crypto.randomUUID();
      const listaParcelas = [];

      for (let i = 0; i < numParcelas; i++) {
        const dataParcela = new Date(form.data);
        dataParcela.setMonth(dataParcela.getMonth() + i);

        listaParcelas.push({
          usuario_id,
          descricao: `${form.descricao} (${i + 1}/${numParcelas})`,
          valor: valorNumerico / numParcelas,
          data: dataParcela.toISOString().split("T")[0],
          categoria: form.categoria,
          classificacao: form.classificacao,
          tipo: form.tipo,
          metodo_pagamento: "Crédito",
          cartao_id: form.cartao_id,
          parcela_atual: i + 1,
          total_parcelas: numParcelas,
          identificador_parcelamento: idAgrupador,
          considerar_soma: false // Itens de crédito não abatem saldo imediato
        });
      }
      return await supabase.from("gastos").insert(listaParcelas);
    }

    return await supabase.from("gastos").insert([{
      usuario_id,
      descricao: form.descricao,
      valor: valorNumerico,
      data: form.data,
      categoria: form.categoria,
      classificacao: form.classificacao,
      tipo: form.tipo,
      metodo_pagamento: form.metodo_pagamento,
      cartao_id: isCredito ? form.cartao_id : null,
      considerar_soma: !isCredito // Só Débito abate saldo agora
    }]);
  },

  async getGastosPorCartao(cartao_id: string) {
    const { data, error } = await supabase.from("gastos").select("*").eq("cartao_id", cartao_id).order("data", { ascending: false });
    if (error) throw error;
    return data;
  },

  /**
   * LANÇAR PAGAMENTO DE FATURA (NOVA LOGICA)
   * Registra na tabela de pagamentos para liberar limite e abater saldo global
   */
  async pagarFatura(usuario_id: string, cartao_id: string, valor: number, mesReferencia: string) {
    const { data, error } = await supabase.from("pagamentos_faturas").insert([{
      usuario_id,
      cartao_id,
      valor,
      mes_referencia: mesReferencia,
      data: new Date().toISOString().split("T")[0]
    }]);
    
    if (error) throw error;
    return data;
  },

  async deleteRecord(table: 'gastos' | 'entradas', id: string) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
  }
};
