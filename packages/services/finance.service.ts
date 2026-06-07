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
    const limparDescricao = (descricao: string) => {
      return descricao.replace(/\(\d+\/\d+\)/g, "").trim();
    };

    const valorNumerico =
      typeof form.valor === "string"
        ? parseFloat(form.valor.replace(/\./g, "").replace(",", "."))
        : form.valor;

    const numParcelas = parseInt(form.parcelas) || parseInt(form.total_parcelas) || 1;
    const isCredito = form.metodo_pagamento === "Crédito";
    const descricaoLimpa = limparDescricao(form.descricao);

    // 💳 PARCELADO (CRIAÇÃO MANUAL OU INÍCIO DE IMPORTAÇÃO)
    // Se for crédito e tiver mais de 1 parcela, e for a primeira (ou não informada)
    if (isCredito && numParcelas > 1 && (!form.parcela_atual || form.parcela_atual === 1)) {
      const idAgrupador = crypto.randomUUID();
      const listaParcelas = [];
      const [year, month, day] = form.data.split('-').map(Number);

      for (let i = 0; i < numParcelas; i++) {
        // Lógica robusta de meses (evita pular meses em dias 31)
        const dataParcela = new Date(year, month - 1 + i, day, 12, 0, 0);
        if (dataParcela.getDate() !== day) {
          dataParcela.setDate(0); // Volta para o último dia do mês anterior se houver overflow
        }

        listaParcelas.push({
          usuario_id,
          descricao: descricaoLimpa,
          valor: valorNumerico / numParcelas,
          data: dataParcela.toISOString().split("T")[0],
          categoria: form.categoria || "Outros",
          classificacao: form.classificacao || "Variável",
          tipo: form.tipo || "Essencial",
          metodo_pagamento: "Crédito",
          cartao_id: form.cartao_id,
          parcela_atual: i + 1,
          total_parcelas: numParcelas,
          identificador_parcelamento: idAgrupador,
          considerar_soma: false,
          terceiro: form.terceiro || false,
          contato_id: form.contato_id || null,
        });
      }

      const { error } = await supabase.from("gastos").insert(listaParcelas);
      if (error) throw error;
      return;
    }

    // 💸 GASTO NORMAL OU PARCELA INTERMEDIÁRIA (IMPORTAÇÃO)
    const { error } = await supabase.from("gastos").insert([
      {
        usuario_id,
        descricao: descricaoLimpa,
        valor: valorNumerico,
        data: form.data,
        categoria: form.categoria || "Outros",
        classificacao: form.classificacao || "Variável",
        tipo: form.tipo || "Essencial",
        metodo_pagamento: form.metodo_pagamento,
        cartao_id: isCredito ? form.cartao_id : null,
        total_parcelas: form.total_parcelas || numParcelas || 1,
        parcela_atual: form.parcela_atual || 1,
        identificador_parcelamento: form.identificador_parcelamento || null,
        considerar_soma: !isCredito,
        terceiro: form.terceiro || false,
        contato_id: form.contato_id || null,
      },
    ]);

    if (error) throw error;
  },

  async bulkAddGastos(usuario_id: string, gastos: any[]) {
    const limparDescricao = (descricao: string) => {
      return descricao.replace(/\(\d+\/\d+\)/g, "").trim();
    };

    const payload: any[] = [];

    gastos.forEach(g => {
      const isCredito = g.metodo_pagamento === "Crédito";
      const descLimpa = limparDescricao(g.descricao);
      const numParcelas = parseInt(g.total_parcelas) || 1;
      const parcelaAtual = parseInt(g.parcela_atual) || 1;

      // Se for a primeira parcela de um plano, expande para o futuro
      if (isCredito && numParcelas > 1 && parcelaAtual === 1) {
        const idAgrupador = crypto.randomUUID();
        const [year, month, day] = g.data.split('-').map(Number);
        // Em importações bulk, o valor já é o da parcela
        const valorParcela = Math.round(Math.abs(g.valor) * 100) / 100;

        for (let i = 0; i < numParcelas; i++) {
          const dataParcela = new Date(year, month - 1 + i, day, 12, 0, 0);
          if (dataParcela.getDate() !== day) {
            dataParcela.setDate(0);
          }

          payload.push({
            usuario_id,
            descricao: descLimpa,
            valor: valorParcela,
            data: dataParcela.toISOString().split("T")[0],
            categoria: g.categoria || "Outros",
            classificacao: g.classificacao || "Variável",
            tipo: g.tipo || "Essencial",
            metodo_pagamento: "Crédito",
            cartao_id: g.cartao_id,
            parcela_atual: i + 1,
            total_parcelas: numParcelas,
            identificador_parcelamento: idAgrupador,
            considerar_soma: false,
          });
        }
      } else {
        // Gasto normal
        payload.push({
          ...g,
          usuario_id,
          descricao: descLimpa,
          considerar_soma: !isCredito,
          categoria: g.categoria || "Outros",
          classificacao: g.classificacao || "Variável",
          tipo: g.tipo || "Essencial",
          valor: Math.abs(g.valor)
        });
      }
    });

    const { error } = await supabase.from("gastos").insert(payload);
    if (error) throw error;
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

  async getGlobalBalance(usuario_id: string) {
    try {
      const [entradas, gastosDebito, pagamentosFatura] = await Promise.all([
        supabase.from("entradas").select("valor").eq("usuario_id", usuario_id),
        supabase.from("gastos").select("valor").eq("usuario_id", usuario_id).eq("considerar_soma", true),
        supabase.from("pagamentos_faturas").select("valor").eq("usuario_id", usuario_id),
      ]);

      const totalEntradas = entradas.data?.reduce((sum: number, item: any) => sum + Number(item.valor), 0) || 0;
      const totalGastosDebito = gastosDebito.data?.reduce((sum: number, item: any) => sum + Number(item.valor), 0) || 0;
      const totalPagamentos = pagamentosFatura.data?.reduce((sum: number, item: any) => sum + Number(item.valor), 0) || 0;

      return totalEntradas - (totalGastosDebito + totalPagamentos);
    } catch (error) {
      console.error("Erro ao buscar saldo global:", error);
      throw error;
    }
  },

  async getInvestimentos(usuario_id: string) {
    const { data, error } = await supabase.from("investimentos").select("*").eq("usuario_id", usuario_id).order("titulo");
    if (error) throw error;
    return data;
  },

  async addInvestimento(usuario_id: string, dados: any) {
    const { data, error } = await supabase.from("investimentos").insert([{ ...dados, usuario_id }]).select();
    if (error) throw error;
    return data;
  },

  async deleteRecord(table: 'gastos' | 'entradas' | 'investimentos' | 'dividas' | 'metas' | 'contatos', id: string) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
  },

  // ==========================================
  // MÓDULO DE DEVEDORES E CONTATOS (TERCEIROS)
  // ==========================================
  
  async getContatos(usuario_id: string) {
    const { data, error } = await supabase.from("contatos").select("*").eq("usuario_id", usuario_id).order("nome");
    if (error) throw error;
    return data;
  },

  async addContato(usuario_id: string, dados: any) {
    const { data, error } = await supabase.from("contatos").insert([{ ...dados, usuario_id }]).select();
    if (error) throw error;
    return data;
  },

  async addMeta(usuario_id: string, dados: any) {
    const { error } = await supabase.from("metas").insert([{ ...dados, usuario_id }]);
    if (error) throw error;
  },

  async addDepositoMeta(usuario_id: string, dados: any) {
    const { error } = await supabase.from("metas_depositos").insert([{ ...dados, usuario_id }]);
    if (error) throw error;
  },

  async addDivida(usuario_id: string, dados: any) {
    const { error } = await supabase.from("dividas").insert([{ ...dados, usuario_id }]);
    if (error) throw error;
  },

  async getDevedores(usuario_id: string) {
    // Busca TODOS os gastos marcados como terceiro = true (pagos e não pagos) para manter histórico
    const { data, error } = await supabase
      .from("gastos")
      .select("*, contatos(*)")
      .eq("usuario_id", usuario_id)
      .eq("terceiro", true)
      .order("data", { ascending: false });
      
    if (error) throw error;

    // Agrupa por contato
    const devedoresMap = new Map();
    data.forEach((gasto: any) => {
      const contatoId = gasto.contato_id;
      if (!contatoId || !gasto.contatos) return;
      
      if (!devedoresMap.has(contatoId)) {
        devedoresMap.set(contatoId, {
          contato: gasto.contatos,
          total_devido: 0,
          itens: []
        });
      }
      
      const devedor = devedoresMap.get(contatoId);
      // Soma apenas se NÃO estiver pago
      if (!gasto.terceiro_pago) {
        devedor.total_devido += Number(gasto.valor);
      }
      devedor.itens.push(gasto);
    });

    return Array.from(devedoresMap.values());
  },

  async marcarTerceiroPago(gasto_id: string, pago: boolean) {
    const { error } = await supabase.from("gastos").update({ terceiro_pago: pago }).eq("id", gasto_id);
    if (error) throw error;
  },

  // ==========================================
  // MÓDULO DE FATURAS (CARTÕES)
  // ==========================================

  async getFaturaMensal(usuario_id: string, cartao_id: string, anoMes: string) {
    // anoMes no formato "YYYY-MM"
    const [ano, mes] = anoMes.split("-").map(Number);
    
    // Busca dados do cartão para saber os dias de fechamento/vencimento
    const { data: cartao, error: cartaoError } = await supabase
      .from("cartoes")
      .select("*")
      .eq("id", cartao_id)
      .single();
      
    if (cartaoError || !cartao) throw cartaoError || new Error("Cartão não encontrado");

    // Lógica para filtrar o mês: do primeiro ao último dia do mês
    // Como a data já representa a data em que a parcela cai:
    const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
    
    // Para pegar o último dia do mês, criamos a data no dia 0 do próximo mês
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const dataFim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
    
    const { data: itens, error } = await supabase
      .from("gastos")
      .select("*")
      .eq("usuario_id", usuario_id)
      .eq("cartao_id", cartao_id)
      .gte("data", dataInicio)
      .lte("data", dataFim)
      .order("data", { ascending: true });

    if (error) throw error;

    const totalFatura = itens.reduce((sum, item) => sum + Number(item.valor), 0);

    // Busca se já houve pagamento para esta fatura
    const { data: pagamentos, error: pagError } = await supabase
      .from("pagamentos_faturas")
      .select("valor")
      .eq("usuario_id", usuario_id)
      .eq("cartao_id", cartao_id)
      .eq("mes_referencia", anoMes);
      
    if (pagError) throw pagError;

    const totalPago = pagamentos.reduce((sum, item) => sum + Number(item.valor), 0);
    
    return {
      cartao,
      itens,
      totalFatura,
      totalPago,
      pendente: Math.max(0, totalFatura - totalPago)
    };
  }
};
