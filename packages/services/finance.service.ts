import { supabase } from "./supabase";
import { getFaturaCycle } from "../utils/cartao.utils";

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
      const { data: transacoes, error } = await supabase
        .from("transacoes")
        .select("valor, tipo, cartao_id")
        .eq("usuario_id", usuario_id)
        .gte("data", startDate)
        .lte("data", endDate)
        .in("status", ["CONFIRMADA", "PENDENTE"]); // Ajuste conforme seu enum de status

      if (error) throw error;

      let totalEntradas = 0;
      let totalGastosDebito = 0;
      let totalPagamentos = 0;

      transacoes?.forEach((t: any) => {
        const valorNum = Number(t.valor);
        if (t.tipo === "RECEITA") {
          totalEntradas += valorNum;
        } else if (t.tipo === "DESPESA" && !t.cartao_id) {
          totalGastosDebito += valorNum;
        } else if (t.tipo === "PAGAMENTO_FATURA") {
          totalPagamentos += valorNum;
        }
      });

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
      const { data, error } = await supabase
        .from("transacoes")
        .select("id, descricao, valor, data, tipo, cartao_id")
        .eq("usuario_id", usuario_id)
        .order("data", { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Mapeia para o formato que a interface já espera (metodo_pagamento, isGasto)
      const formatted = (data || []).map((t: any) => ({
        id: t.id,
        descricao: t.descricao,
        valor: t.valor,
        data: t.data,
        isGasto: t.tipo === "DESPESA" || t.tipo === "PAGAMENTO_FATURA",
        metodo_pagamento: t.cartao_id ? "Crédito" : "Débito",
        tipo_transacao: t.tipo
      }));

      return formatted;
    } catch (error) { throw error; }
  },

  async getContasBancarias(usuario_id: string) {
    const { data, error } = await supabase.from("contas_bancarias").select("*").eq("usuario_id", usuario_id).order("nome");
    if (error) throw error;
    return data;
  },

  async addContaBancaria(usuario_id: string, dados: any) {
    const { data, error } = await supabase.from("contas_bancarias").insert([{ ...dados, usuario_id }]).select();
    if (error) throw error;
    return data;
  },

  async updateContaBancaria(usuario_id: string, conta_id: string, dados: any) {
    const { data, error } = await supabase
      .from("contas_bancarias")
      .update(dados)
      .eq("id", conta_id)
      .eq("usuario_id", usuario_id)
      .select();
    if (error) throw error;
    return data;
  },

  async deleteContaBancaria(usuario_id: string, conta_id: string) {
    const { error } = await supabase
      .from("contas_bancarias")
      .delete()
      .eq("id", conta_id)
      .eq("usuario_id", usuario_id);
    if (error) throw error;
  },

  async getCartoes(usuario_id: string) {
    const { data, error } = await supabase.from("cartoes").select("*, contas_bancarias(nome)").eq("usuario_id", usuario_id).order("nome");
    if (error) throw error;
    return data;
  },

  async addCartao(usuario_id: string, dados: any) {
    // Inclui conta_id e dependente se houver
    const { data, error } = await supabase.from("cartoes").insert([{ ...dados, usuario_id }]).select();
    if (error) throw error;
    return data;
  },

  async updateCartao(usuario_id: string, cartao_id: string, dados: any) {
    const { data, error } = await supabase
      .from("cartoes")
      .update(dados)
      .eq("id", cartao_id)
      .eq("usuario_id", usuario_id)
      .select();
    if (error) throw error;
    return data;
  },

  async getAllGastosCredito(usuario_id: string) {
    const { data, error } = await supabase.from("despesas").select("*").eq("usuario_id", usuario_id).eq("metodo_pagamento", "Crédito"); 
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

    // 💳 PARCELADO (CRIAÇÃO MANUAL)
    if (isCredito && numParcelas > 1) {
      const valorDaParcela = form.valor_ja_dividido ? valorNumerico : (valorNumerico / numParcelas);
      const [year, month, day] = form.data.split('-').map(Number);
      const currentParcelaInput = form.parcela_atual || 1;

      const listaTransacoes = [];

      for (let i = 1; i <= numParcelas; i++) {
        // Calcula a data da parcela i deslocada a partir do mês da parcela de entrada
        const deslocamentoMeses = i - currentParcelaInput;
        const dataParcela = new Date(year, month - 1 + deslocamentoMeses, day, 12, 0, 0);
        if (dataParcela.getDate() !== day) {
          dataParcela.setDate(0); // Ajuste de fim de mês
        }

        listaTransacoes.push({
          usuario_id,
          tipo: 'DESPESA',
          descricao: `${descricaoLimpa} (${i}/${numParcelas})`,
          valor: valorDaParcela,
          data: dataParcela.toISOString().split("T")[0],
          cartao_id: form.cartao_id,
          conta_id: null,
          observacao: `[LEGADO] Categoria: ${form.categoria} | Agrupador: ${form.identificador_parcelamento}`,
        });
      }

      if (listaTransacoes.length > 0) {
        const { error } = await supabase.from("transacoes").insert(listaTransacoes);
        if (error) throw error;
      }
      return;
    }

    // 💸 GASTO NORMAL
    const { error } = await supabase.from("transacoes").insert([
      {
        usuario_id,
        tipo: 'DESPESA',
        descricao: descricaoLimpa,
        valor: valorNumerico,
        data: form.data,
        cartao_id: isCredito ? form.cartao_id : null,
        conta_id: isCredito ? null : form.conta_id,
        observacao: `[LEGADO] Categoria: ${form.categoria}`,
      },
    ]);

    if (error) throw error;
  },

  async addTransferencia(usuario_id: string, form: any) {
    const valorNumerico =
      typeof form.valor === "string"
        ? parseFloat(form.valor.replace(/\./g, "").replace(",", "."))
        : form.valor;

    if (!form.conta_origem_id || !form.conta_destino_id) {
      throw new Error("Contas de origem e destino são obrigatórias");
    }

    // 1. Cria a Transação "Pai"
    const { data: transacao, error: errTransacao } = await supabase.from("transacoes").insert([
      {
        usuario_id,
        tipo: 'TRANSFERENCIA',
        descricao: form.descricao || "Transferência entre contas",
        valor: valorNumerico,
        data: form.data,
        observacao: form.observacao || null,
        // conta_id não é preenchido aqui pois a transação envolve duas contas. 
        // Os detalhes ficam na tabela `transferencias`.
      },
    ]).select().single();

    if (errTransacao) throw errTransacao;

    // 2. Cria o detalhamento de Transferência
    const { error: errDetalhe } = await supabase.from("transferencias").insert([
      {
        usuario_id,
        conta_origem_id: form.conta_origem_id,
        conta_destino_id: form.conta_destino_id,
        valor: valorNumerico,
        data: form.data,
        transacao_id: transacao.id,
        observacao: form.observacao || null
      }
    ]);

    if (errDetalhe) throw errDetalhe;
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

    const { error } = await supabase.from("despesas").insert(payload);
    if (error) throw error;
  },

  async getGastosPorCartao(cartao_id: string) {
    const { data, error } = await supabase.from("despesas").select("*").eq("cartao_id", cartao_id).order("data", { ascending: false });
    if (error) throw error;
    return data;
  },

  /**
   * LANÇAR PAGAMENTO DE FATURA (NOVA LOGICA)
   * Registra na tabela de pagamentos para liberar limite e abater saldo global
   */
  async pagarFatura(
    usuario_id: string,
    cartao_id: string,
    valor: number,
    mesReferencia: string,
    tipoPagamento: string = 'Total',
    dataPagamento?: string,
    observacao?: string
  ) {
    const { data, error } = await supabase.from("pagamentos_faturas").insert([{
      usuario_id,
      cartao_id,
      valor,
      mes_referencia: mesReferencia,
      tipo_pagamento: tipoPagamento,
      data: dataPagamento || new Date().toISOString().split("T")[0],
      observacao: observacao || null
    }]);
    
    if (error) throw error;
    return data;
  },

  async getGlobalBalance(usuario_id: string) {
    try {
      const [entradas, gastosDebito, pagamentosFatura, metas, investimentos] = await Promise.all([
        supabase.from("receitas").select("valor").eq("usuario_id", usuario_id),
        supabase.from("despesas").select("valor").eq("usuario_id", usuario_id).eq("considerar_soma", true),
        supabase.from("pagamentos_faturas").select("valor").eq("usuario_id", usuario_id),
        supabase.from("metas").select("id, metas_depositos(valor)").eq("usuario_id", usuario_id),
        supabase.from("investimentos").select("valor_investido").eq("usuario_id", usuario_id),
      ]);

      const totalEntradas = entradas.data?.reduce((sum: number, item: any) => sum + Number(item.valor), 0) || 0;
      const totalGastosDebito = gastosDebito.data?.reduce((sum: number, item: any) => sum + Number(item.valor), 0) || 0;
      const totalPagamentos = pagamentosFatura.data?.reduce((sum: number, item: any) => sum + Number(item.valor), 0) || 0;

      let totalMetaDepositos = 0;
      if (metas.data) {
        metas.data.forEach((m: any) => {
          if (m.metas_depositos) {
            m.metas_depositos.forEach((d: any) => {
              totalMetaDepositos += Number(d.valor || 0);
            });
          }
        });
      }

      const totalInvestido = investimentos.data?.reduce((sum: number, item: any) => sum + Number(item.valor_investido || 0), 0) || 0;

      return totalEntradas - (totalGastosDebito + totalPagamentos + totalMetaDepositos + totalInvestido);
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
    const { error } = await supabase.from("passivos").insert([{ ...dados, usuario_id }]);
    if (error) throw error;
  },

  async getUserIdByEmail(email: string) {
    const { data, error } = await supabase.rpc('get_user_id_by_email', { search_email: email });
    if (error) throw error;
    return data; // UUID ou null
  },

  async pagarParcelaDivida(dividaId: string, currentParcela: number, totalParcelas: number, currentVencimento: string) {
    const nextParcela = currentParcela + 1;
    const status = nextParcela >= totalParcelas ? 'quitada' : 'pendente';
    
    // Calcula vencimento do próximo mês
    const date = new Date(currentVencimento + "T12:00:00");
    date.setMonth(date.getMonth() + 1);
    const nextVencimento = date.toISOString().split("T")[0];

    const { error } = await supabase
      .from("passivos")
      .update({
        parcela_atual: nextParcela,
        status,
        vencimento_parcela: nextVencimento
      })
      .eq("id", dividaId);

    if (error) throw error;
  },

  async quitarDivida(dividaId: string) {
    const { error } = await supabase
      .from("passivos")
      .update({ status: 'quitada' })
      .eq("id", dividaId);

    if (error) throw error;
  },

  async getDevedores(usuario_id: string) {
    // Busca TODOS os gastos marcados como terceiro = true (pagos e não pagos) para manter histórico
    const { data, error } = await supabase
      .from("despesas")
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
        let valorDevido = Number(gasto.valor);
        if (gasto.observacao) {
          try {
            if (gasto.observacao.trim().startsWith("{")) {
              const meta = JSON.parse(gasto.observacao);
              if (meta && typeof meta.valor_pago === "number") {
                valorDevido = Math.max(0, valorDevido - meta.valor_pago);
              }
            }
          } catch (e) {
            // Ignore JSON parsing errors for plain observations
          }
        }
        devedor.total_devido += valorDevido;
      }
      devedor.itens.push(gasto);
    });

    return Array.from(devedoresMap.values());
  },

  async marcarTerceiroPago(gasto_id: string, pago: boolean) {
    const { error } = await supabase.from("despesas").update({ terceiro_pago: pago }).eq("id", gasto_id);
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

    // Lógica correta de filtragem baseada no ciclo exato de fechamento
    const fechamentoDia = cartao.fechamento_dia || 1;
    const vencimentoDia = cartao.vencimento_dia || 1;
    
    const { dataInicio, dataFim } = getFaturaCycle(anoMes, fechamentoDia, vencimentoDia);
    
    const { data: itens, error } = await supabase
      .from("despesas")
      .select("*, contatos(*)")
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
