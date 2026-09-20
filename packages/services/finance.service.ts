import { supabase } from "./supabase";
import { getFaturaCycle, getFaturaMesReferencia } from "../utils/cartao.utils";

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
   */
  async getMonthlyStats(usuario_id: string, startDate: string, endDate: string) {
    try {
      const [txRes, movRes] = await Promise.all([
        supabase
          .from("transacoes")
          .select("valor, tipo, considerar_soma")
          .eq("usuario_id", usuario_id)
          .gte("data", startDate)
          .lte("data", endDate),
        supabase
          .from("movimentacoes")
          .select("valor, tipo, transacoes(tipo)")
          .eq("usuario_id", usuario_id)
          .gte("data", startDate)
          .lte("data", endDate)
      ]);

      if (txRes.error) throw txRes.error;

      let totalReceitas = 0;
      let totalDespesas = 0;
      let totalEstornos = 0;

      (txRes.data || []).forEach((t: any) => {
        const v = Number(t.valor || 0);
        if (t.tipo === "RECEITA") {
          totalReceitas += v;
        } else if (t.tipo === "DESPESA" && t.considerar_soma !== false) {
          totalDespesas += v;
        } else if (t.tipo === "ESTORNO") {
          totalEstornos += v;
        }
      });

      const totalGastosLiquido = Math.max(0, totalDespesas - totalEstornos);

      // Fluxo de caixa de contas bancárias (entradas vs saídas)
      let entradasCaixa = 0;
      let saidasCaixa = 0;
      (movRes.data || []).forEach((m: any) => {
        if (m.transacoes?.tipo === "TRANSFERENCIA") return;
        const v = Number(m.valor || 0);
        if (m.tipo === "ENTRADA") entradasCaixa += v;
        else if (m.tipo === "SAIDA") saidasCaixa += v;
      });

      return {
        totalEntradas: totalReceitas,
        totalGastos: totalGastosLiquido,
        saldo: totalReceitas - totalGastosLiquido,
        fluxoCaixa: {
          entradasCaixa,
          saidasCaixa,
          saldoCaixa: entradasCaixa - saidasCaixa
        }
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
        isGasto: t.tipo === "DESPESA",
        metodo_pagamento: t.cartao_id ? "Crédito" : "Débito",
        tipo_transacao: t.tipo
      }));

      return formatted;
    } catch (error) { throw error; }
  },

  // ==========================================
  // NOVA MOVIMENTAÇÃO (UX Core - Etapa 3)
  // ==========================================
  async addTransacao(usuario_id: string, payload: any) {
    const {
      tipo, // GASTO, ENTRADA, TRANSFERENCIA
      valor,
      descricao,
      data,
      categoria_id,
      forma_pagamento, // CONTA, CARTAO
      conta_id,
      cartao_id,
      parcelas,
      observacao,
      conta_destino_id
    } = payload;

    const numericValue = parseFloat(valor);

    try {
      if (tipo === "TRANSFERENCIA") {
        // Transferência = 1 transacao + 2 movimentações (Saída e Entrada)
        const { data: tx, error: txError } = await supabase
          .from("transacoes")
          .insert([{
            usuario_id,
            tipo: "TRANSFERENCIA",
            descricao,
            valor: numericValue,
            data,
            conta_id,
            observacao,
            status: "confirmada"
          }]).select().single();
        if (txError) throw txError;

        // Movimentação de Saída da Origem
        await supabase.from("movimentacoes").insert([{
          usuario_id,
          transacao_id: tx.id,
          conta_id,
          tipo: "SAIDA",
          valor: numericValue,
          data
        }]);

        // Movimentação de Entrada no Destino
        await supabase.from("movimentacoes").insert([{
          usuario_id,
          transacao_id: tx.id,
          conta_id: conta_destino_id,
          tipo: "ENTRADA",
          valor: numericValue,
          data
        }]);

        // Registrar também nas transferencias table para histórico
        await supabase.from("transferencias").insert([{
          usuario_id,
          conta_origem_id: conta_id,
          conta_destino_id,
          valor: numericValue,
          data,
          observacao: observacao || descricao,
          transacao_id: tx.id
        }]);

        return tx;
      }

      if (tipo === "ENTRADA") {
        const { data: tx, error: txError } = await supabase
          .from("transacoes")
          .insert([{
            usuario_id,
            tipo: "RECEITA",
            descricao,
            valor: numericValue,
            data,
            conta_id,
            categoria_id,
            observacao,
            status: "confirmada"
          }]).select().single();
        if (txError) throw txError;

        await supabase.from("movimentacoes").insert([{
          usuario_id,
          transacao_id: tx.id,
          conta_id,
          tipo: "ENTRADA",
          valor: numericValue,
          data
        }]);
        return tx;
      }

      if (tipo === "GASTO") {
        if (forma_pagamento === "CONTA") {
          // Gasto à vista na conta (Débito/Pix)
          const { data: tx, error: txError } = await supabase
            .from("transacoes")
            .insert([{
              usuario_id,
              tipo: "DESPESA",
              descricao,
              valor: numericValue,
              data,
              conta_id,
              categoria_id,
              observacao,
              status: "confirmada"
            }]).select().single();
          if (txError) throw txError;

          await supabase.from("movimentacoes").insert([{
            usuario_id,
            transacao_id: tx.id,
            conta_id,
            tipo: "SAIDA",
            valor: numericValue,
            data
          }]);
          return tx;
        }

        if (forma_pagamento === "CARTAO") {
            // TODO: Criar a fatura correspondente se não existir
            // TODO: Atrelar parcelas se > 1
            // Por enquanto, lança uma transacao atrelada ao cartao (fatura pendente)
            const { data: tx, error: txError } = await supabase
            .from("transacoes")
            .insert([{
              usuario_id,
              tipo: "DESPESA",
              descricao,
              valor: numericValue,
              data,
              cartao_id,
              categoria_id,
              observacao,
              status: "confirmada"
            }]).select().single();
          if (txError) throw txError;
          return tx;
        }
      }
    } catch (error) {
      console.error("Erro ao adicionar transação:", error);
      throw error;
    }
  },

  async getContasBancarias(usuario_id: string) {
    const { data: contas, error } = await supabase.from("contas_bancarias").select("*").eq("usuario_id", usuario_id).order("nome");
    if (error) throw error;

    const { data: movimentacoes, error: errMov } = await supabase.from("movimentacoes").select("conta_id, valor, tipo").eq("usuario_id", usuario_id);
    if (errMov) throw errMov;

    // Calcula saldo em runtime: saldo_inicial + entradas - saidas
    const contasList = contas || [];
    const movs = movimentacoes || [];

    return contasList.map(conta => {
      let saldo = Number(conta.saldo_inicial || 0);
      movs.filter(m => m.conta_id === conta.id).forEach(m => {
        if (m.tipo === "ENTRADA") saldo += Number(m.valor);
        else if (m.tipo === "SAIDA") saldo -= Number(m.valor);
      });
      return { ...conta, saldo_atual: saldo };
    });
  },

  // ==========================================
  // MÓDULO DE CATEGORIAS (Fase 1)
  // ==========================================
  async getCategorias(usuario_id: string, tipo?: string) {
    let query = supabase.from("categorias").select("*").eq("usuario_id", usuario_id).eq("ativa", true).order("nome");
    if (tipo) {
      query = query.eq("tipo", tipo);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async addCategoria(usuario_id: string, dados: any) {
    const { data, error } = await supabase.from("categorias").insert([{ ...dados, usuario_id }]).select().single();
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
    const { data: cartoes, error } = await supabase.from("cartoes").select("*, contas_bancarias(nome)").eq("usuario_id", usuario_id).order("nome");
    if (error) throw error;
    
    // Busca faturas em aberto para todos os cartões do usuário
    const { data: faturas } = await supabase.from("faturas").select("cartao_id, valor_total").eq("status", "aberta").eq("usuario_id", usuario_id);
    
    const cartoesMapeados = (cartoes || []).map(cartao => {
      // Somar o valor total das faturas abertas do cartão
      const faturasDoCartao = (faturas || []).filter(f => f.cartao_id === cartao.id);
      const saldoGasto = faturasDoCartao.reduce((acc, f) => acc + Number(f.valor_total || 0), 0);
      const limite = Number(cartao.limite || 0);
      
      return {
        ...cartao,
        saldoGasto,
        disponivel: Math.max(0, limite - saldoGasto),
        parcelasEmAberto: 0 // Simplificado para este momento
      };
    });
    
    return cartoesMapeados;
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
    const { data, error } = await supabase
      .from("transacoes")
      .select("*")
      .eq("usuario_id", usuario_id)
      .eq("tipo", "DESPESA")
      .not("cartao_id", "is", null); 
    if (error) throw error;
    return data || [];
  },

  /**
   * BUSCA PAGAMENTOS PARA LIBERAÇÃO DE LIMITE
   */
  async getPagamentosFaturas(usuario_id: string) {
    const { data, error } = await supabase
      .from("transacoes")
      .select("*")
      .eq("usuario_id", usuario_id)
      .eq("tipo", "PAGAMENTO_FATURA");
    if (error) throw error;
    return data || [];
  },

  async addGasto(usuario_id: string, form: any) {
    const rawDesc = String(form.descricao || "");
    const matchParcelas = rawDesc.match(/(?:parcela\s*|parc\.?\s*)?(\d{1,2})\s*[/]\s*(\d{1,2})|\b(\d{1,2})\s+de\s+(\d{1,2})\b/i);
    const parcelaDetectada = matchParcelas ? parseInt(matchParcelas[1] || matchParcelas[3], 10) : 1;
    const totalDetectado = matchParcelas ? parseInt(matchParcelas[2] || matchParcelas[4], 10) : 1;

    const limparDescricao = (descricao: string) => {
      return (descricao || "")
        .replace(/\s*[-–—]?\s*(?:parcela|parc\.?)?\s*\(?\d{1,2}\s*[/]\s*\d{1,2}\)?/gi, "")
        .replace(/\s*[-–—]?\s*\d{1,2}\s+de\s+\d{1,2}/gi, "")
        .trim();
    };

    const valorNumerico =
      typeof form.valor === "string"
        ? parseFloat(form.valor.replace(/\./g, "").replace(",", "."))
        : form.valor;

    const numParcelas = parseInt(form.parcelas) || parseInt(form.total_parcelas) || totalDetectado || 1;
    const currentParcelaInput = parseInt(form.parcela_atual) || parcelaDetectada || 1;
    const isCredito = form.metodo_pagamento === "Crédito";
    const descricaoLimpa = limparDescricao(rawDesc);

    // 🛡️ PROTEÇÃO: Se for pagamento de fatura, NUNCA salvar como despesa!
    if (form.tipo === "PAGAMENTO_FATURA" || form.tipo_transacao === "PagamentoFatura" || /pagamento\s*recebido/i.test(descricaoLimpa)) {
      return this.processPagamentoFatura(usuario_id, {
        conta_id: form.conta_id || null,
        cartao_id: form.cartao_id || null,
        valor: valorNumerico,
        data: form.data,
        descricao: descricaoLimpa,
        documento_importado_id: form.documento_importado_id || null
      });
    }

    // 🛡️ PROTEÇÃO: Se for pagamento de dívida/renegociação, NUNCA salvar como despesa de consumo!
    if (form.tipo === "PAGAMENTO_DIVIDA" || form.tipo_transacao === "PagamentoDivida") {
      const { data: tx, error: txError } = await supabase.from("transacoes").insert([{
        usuario_id,
        tipo: "PAGAMENTO_DIVIDA",
        descricao: descricaoLimpa || "Pagamento de Parcela - Dívida",
        valor: valorNumerico,
        data: form.data,
        conta_id: form.conta_id || null,
        documento_importado_id: form.documento_importado_id || null,
        status: "confirmada"
      }]).select().single();
      if (txError) throw txError;

      if (form.conta_id && tx) {
        await supabase.from("movimentacoes").insert([{
          usuario_id,
          transacao_id: tx.id,
          conta_id: form.conta_id,
          tipo: "SAIDA",
          valor: valorNumerico,
          data: form.data
        }]);
      }
      return tx;
    }

    // 🔍 BUSCA CATEGORIA ID (Mapeamento Gradual)
    let categoria_id = null;
    if (form.categoria) {
      const { data: cat } = await supabase
        .from("categorias")
        .select("id")
        .eq("usuario_id", usuario_id)
        .eq("nome", form.categoria)
        .eq("tipo", "DESPESA")
        .single();
      if (cat) categoria_id = cat.id;
    }

    // 💰 VALOR E DETALHES DE PARCELAMENTO (A despesa do mês é SEMPRE da parcela incorrida)
    const valorParcelaAtual = form.valor_ja_dividido ? valorNumerico : Math.round((valorNumerico / numParcelas) * 100) / 100;
    const valorTotalCompra = form.valor_ja_dividido ? Math.round((valorNumerico * numParcelas) * 100) / 100 : valorNumerico;

    // 1. 💸 REGISTRA A TRANSAÇÃO NA TABELA `transacoes` (Deduplicação defensiva)
    let transacao: any = null;
    let { data: existingTx } = await supabase
      .from("transacoes")
      .select("*")
      .eq("usuario_id", usuario_id)
      .eq("data", form.data)
      .eq("valor", valorParcelaAtual)
      .eq("cartao_id", isCredito ? form.cartao_id : null)
      .ilike("descricao", `%${descricaoLimpa}%`)
      .maybeSingle();

    // Se não achou por data exata, mas for parcelamento, busca se já existia pré-criada para esta mesma parcela
    if (!existingTx && numParcelas > 1) {
      const { data: pendingParcTx } = await supabase
        .from("transacoes")
        .select("*")
        .eq("usuario_id", usuario_id)
        .eq("cartao_id", isCredito ? form.cartao_id : null)
        .eq("valor", valorParcelaAtual)
        .ilike("descricao", `%${descricaoLimpa}%`)
        .ilike("descricao", `%${currentParcelaInput}/${numParcelas}%`)
        .maybeSingle();

      if (pendingParcTx) {
        existingTx = pendingParcTx;
      }
    }

    if (existingTx) {
      transacao = existingTx;
      // Se era uma parcela pré-criada como 'pendente' ou com data estimada diferente, confirma com os dados reais
      if (existingTx.status === 'pendente' || existingTx.data !== form.data) {
        await supabase
          .from("transacoes")
          .update({
            status: 'confirmada',
            data: form.data,
            documento_importado_id: form.documento_importado_id || existingTx.documento_importado_id
          })
          .eq("id", existingTx.id);
        transacao.status = 'confirmada';
        transacao.data = form.data;
      }
    } else {
      const tipoTransacao = form.tipo === 'ESTORNO' ? 'ESTORNO' : (form.tipo === 'AJUSTE' ? 'AJUSTE' : 'DESPESA');
      const descFinal = numParcelas > 1 ? `${descricaoLimpa} - Parcela ${currentParcelaInput}/${numParcelas}` : descricaoLimpa;
      const { data: novaTx, error: errTransacao } = await supabase.from("transacoes").insert([
        {
          usuario_id,
          tipo: tipoTransacao,
          descricao: descFinal,
          valor: valorParcelaAtual,
          data: form.data,
          cartao_id: isCredito ? form.cartao_id : null,
          conta_id: isCredito ? null : form.conta_id,
          categoria_id,
          documento_importado_id: form.documento_importado_id || null,
          status: "confirmada",
          observacao: `Classificação: ${form.classificacao || 'Variável'} | Tipo: ${form.tipo || 'Essencial'} | Parcela: ${currentParcelaInput}/${numParcelas} | Terceiro: ${form.terceiro || false}`,
        },
      ]).select().single();

      if (errTransacao) throw errTransacao;
      transacao = novaTx;
    }

    // 2. 💳 CICLO COMPLETO DE COMPRA PARCELADA (`transacoes`, `parcelamentos` e `parcelas`)
    if (numParcelas > 1) {
      try {
        const [year, month, day] = form.data.split('-').map(Number);

        // Busca se já existe um parcelamento prévio desta compra para reaproveitar
        const { data: existingParcs } = await supabase
          .from("parcelamentos")
          .select("*, parcelas(*)")
          .eq("usuario_id", usuario_id)
          .eq("quantidade_parcelas", numParcelas)
          .ilike("descricao", `%${descricaoLimpa}%`);

        let parcelamento = (existingParcs && existingParcs.length > 0) ? existingParcs[0] : null;

        if (!parcelamento) {
          const { data: newParc, error: errParc } = await supabase.from("parcelamentos").insert([{
            usuario_id,
            descricao: descricaoLimpa,
            valor_total: valorTotalCompra,
            quantidade_parcelas: numParcelas
          }]).select().maybeSingle();

          if (!errParc && newParc) {
            parcelamento = newParc;
          }
        }

        const parcelasExistentes = parcelamento?.parcelas || [];

        // Itera por todas as parcelas (1..numParcelas) para criar as anteriores e futuras em `transacoes` e `parcelas`
        for (let i = 1; i <= numParcelas; i++) {
          const deslocamentoMeses = i - currentParcelaInput;
          const dataParcela = new Date(year, month - 1 + deslocamentoMeses, day, 12, 0, 0);
          if (dataParcela.getDate() !== day) {
            dataParcela.setDate(0); // Ajuste de fim de mês
          }
          const dataParcelaStr = dataParcela.toISOString().split("T")[0];
          const isCurrent = i === currentParcelaInput;
          const isPast = i < currentParcelaInput;
          const descParcela = `${descricaoLimpa} - Parcela ${i}/${numParcelas}`;
          let txIdForParcela = isCurrent ? transacao.id : null;

          if (!isCurrent) {
            // Verifica se já existe transação criada para esta parcela (inclusive em caso de antecipação)
            const { data: existingOtherTx } = await supabase
              .from("transacoes")
              .select("*")
              .eq("usuario_id", usuario_id)
              .eq("cartao_id", isCredito ? form.cartao_id : null)
              .eq("valor", valorParcelaAtual)
              .ilike("descricao", `%${descricaoLimpa}%`)
              .ilike("descricao", `%${i}/${numParcelas}%`)
              .maybeSingle();

            if (existingOtherTx) {
              txIdForParcela = existingOtherTx.id;
            } else {
              // Cria a transação correspondente:
              // Passadas são confirmadas (histórico); futuras são pendentes (compromissos futuros)
              const { data: createdParcTx } = await supabase
                .from("transacoes")
                .insert([{
                  usuario_id,
                  tipo: "DESPESA",
                  descricao: descParcela,
                  valor: valorParcelaAtual,
                  data: dataParcelaStr,
                  cartao_id: isCredito ? form.cartao_id : null,
                  conta_id: isCredito ? null : form.conta_id,
                  categoria_id,
                  documento_importado_id: form.documento_importado_id || null,
                  status: isPast ? "confirmada" : "pendente",
                  observacao: `Classificação: ${form.classificacao || 'Variável'} | Tipo: ${form.tipo || 'Essencial'} | Parcela: ${i}/${numParcelas} | Terceiro: ${form.terceiro || false}`
                }])
                .select()
                .single();

              if (createdParcTx) {
                txIdForParcela = createdParcTx.id;
              }
            }
          }

          // Mantém registro atualizado na tabela auxiliar 'parcelas'
          if (parcelamento?.id) {
            const targetParcela = parcelasExistentes.find((p: any) => p.numero_parcela === i);
            if (targetParcela) {
              await supabase
                .from("parcelas")
                .update({
                  status: isPast || isCurrent ? 'PAGA' : 'PENDENTE',
                  transacao_id: txIdForParcela || targetParcela.transacao_id,
                  valor: valorParcelaAtual,
                  data_vencimento: isCurrent ? form.data : targetParcela.data_vencimento || dataParcelaStr
                })
                .eq("id", targetParcela.id);
            } else {
              await supabase.from("parcelas").insert([{
                usuario_id,
                parcelamento_id: parcelamento.id,
                transacao_id: txIdForParcela,
                numero_parcela: i,
                valor: valorParcelaAtual,
                data_vencimento: isCurrent ? form.data : dataParcelaStr,
                status: isPast || isCurrent ? 'PAGA' : 'PENDENTE'
              }]);
            }
          }
        }

        // Sincroniza as faturas para incluir as novas parcelas criadas nos meses correspondentes
        if (isCredito) {
          this.syncCardFaturas(usuario_id).catch(() => {});
        }
      } catch (parcErr) {
        console.warn("Aviso ao registrar metadados de parcelamento:", parcErr);
      }
    }

    // 3. 🏦 SE FOR DÉBITO/PIX, REGISTRA A MOVIMENTAÇÃO BANCÁRIA DE SAÍDA
    if (!isCredito && form.conta_id && !existingTx) {
      const { error: errMov } = await supabase.from("movimentacoes").insert([{
        usuario_id,
        transacao_id: transacao.id,
        conta_id: form.conta_id,
        tipo: 'SAIDA',
        valor: valorParcelaAtual,
        data: form.data
      }]);
      if (errMov) throw errMov;
    }
    return transacao;
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

    // 3. Cria as Movimentações (Uma saída na origem e uma entrada no destino)
    const { error: errMovs } = await supabase.from("movimentacoes").insert([
      {
        usuario_id,
        transacao_id: transacao.id,
        conta_id: form.conta_origem_id,
        tipo: 'SAIDA',
        valor: valorNumerico,
        data: form.data
      },
      {
        usuario_id,
        transacao_id: transacao.id,
        conta_id: form.conta_destino_id,
        tipo: 'ENTRADA',
        valor: valorNumerico,
        data: form.data
      }
    ]);

    if (errMovs) throw errMovs;
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
          usuario_id,
          tipo: "DESPESA",
          descricao: descLimpa,
          valor: Math.abs(g.valor),
          data: g.data,
          cartao_id: isCredito ? g.cartao_id : null,
          conta_id: !isCredito ? (g.conta_id || null) : null,
          status: "confirmada"
        });
      }
    });

    const { error } = await supabase.from("transacoes").insert(payload);
    if (error) throw error;
  },

  async getGastosPorCartao(cartao_id: string) {
    const { data, error } = await supabase.from("transacoes").select("*").eq("cartao_id", cartao_id).order("data", { ascending: false });
    if (error) throw error;
    return data;
  },

  /**
   * LANÇAR PAGAMENTO DE FATURA (NOVA LOGICA)
   * Registra na tabela de transacoes para liberar limite e abater saldo global
   */
  async pagarFatura(
    usuario_id: string,
    cartao_id: string,
    valor: number,
    mesReferencia: string,
    tipoPagamento: string = 'Total',
    dataPagamento?: string,
    observacao?: string,
    conta_id?: string
  ) {
    const dataIso = dataPagamento || new Date().toISOString().split("T")[0];
    const { data, error } = await supabase.from("transacoes").insert([{
      usuario_id,
      cartao_id,
      conta_id: conta_id || null,
      tipo: 'PAGAMENTO_FATURA',
      descricao: `Pagamento Fatura ${mesReferencia}`,
      valor,
      data: dataIso,
      observacao: observacao || `Tipo: ${tipoPagamento}`
    }]).select();
    
    if (error) throw error;

    if (conta_id && data?.[0]?.id) {
      await supabase.from("movimentacoes").insert([{
        usuario_id,
        conta_id,
        transacao_id: data[0].id,
        tipo: 'SAIDA',
        valor,
        data: dataIso
      }]);
    }

    return data;
  },

  async getGlobalBalance(usuario_id: string) {
    try {
      // Saldo bancário disponível real: soma dos saldos em todas as contas ativas (saldo_inicial + entradas - saidas)
      const contas = await this.getContasBancarias(usuario_id);
      return (contas || []).reduce((acc: number, c: any) => acc + Number(c.saldo_atual || 0), 0);
    } catch (error) {
      console.error("Erro ao buscar saldo global de contas:", error);
      throw error;
    }
  },

  /**
   * Cálculo unificado de Patrimônio Líquido sem duplicação patrimonial.
   * Regra: Investimento = Ativo; Meta = Propósito; Conta = Caixa.
   * Não duplica investimentos que possuem metas vinculadas.
   */
  async getPatrimonioConsolidado(usuario_id: string) {
    try {
      const [contas, investimentos, metas, dividas, faturas] = await Promise.all([
        this.getContasBancarias(usuario_id).catch(() => []),
        this.getInvestimentos(usuario_id).catch(() => []),
        supabase.from("metas").select("id, metas_depositos(valor)").eq("usuario_id", usuario_id),
        this.getDividas(usuario_id).catch(() => []),
        supabase.from("faturas").select("valor_total, valor_pago, status").eq("usuario_id", usuario_id).neq("status", "paga")
      ]);

      // 1. Saldo em contas bancárias (caixa líquido)
      const totalContas = (contas || []).reduce((acc: number, c: any) => acc + Number(c.saldo_atual || 0), 0);

      // 2. Total em investimentos (ativos sob custódia)
      const totalInvestimentos = (investimentos || []).reduce((acc: number, i: any) => acc + Number(i.valor_atual || 0), 0);

      // 3. Identifica quais metas possuem investimentos vinculados
      const metasComInvestimento = new Set<string>();
      (investimentos || []).forEach((inv: any) => {
        const match = inv.corretora?.match(/\[Meta:\s*([^\]]+)\]/);
        if (match && match[1]) metasComInvestimento.add(match[1]);
      });

      // 4. Aportes manuais em metas que NÃO possuem investimento vinculado
      let totalMetasManuais = 0;
      if (metas.data) {
        metas.data.forEach((m: any) => {
          if (!metasComInvestimento.has(m.id) && m.metas_depositos) {
            m.metas_depositos.forEach((d: any) => {
              totalMetasManuais += Number(d.valor || 0);
            });
          }
        });
      }

      // 5. Passivos (dívidas ativas e faturas em aberto)
      const totalDividas = (dividas || []).reduce((acc: number, d: any) => acc + Number(d.valor_atual || 0), 0);
      const totalFaturasPendentes = (faturas.data || []).reduce((acc: number, f: any) => {
        const pendente = Math.max(0, Number(f.valor_total || 0) - Number(f.valor_pago || 0));
        return acc + pendente;
      }, 0);
      const totalPassivos = totalDividas + totalFaturasPendentes;

      // 6. Patrimônio Líquido consolidado sem duplicação
      const patrimonioLiquido = totalContas + totalInvestimentos + totalMetasManuais - totalPassivos;

      return {
        totalContas,
        totalInvestimentos,
        totalMetasManuais,
        totalPassivos,
        patrimonioLiquido
      };
    } catch (error) {
      console.error("Erro ao calcular patrimônio consolidado:", error);
      throw error;
    }
  },

  /**
   * Processa uma aplicação patrimonial em Investimento / RDB / Caixinha
   * - Cria transação APORTE (sem classificar como despesa de consumo)
   * - Cria movimentação bancária de SAÍDA na conta de origem
   * - Incrementa ou cria o registro em investimentos (e histórico)
   * - Se vinculado a uma Meta, a Meta reflete via investimento (SEM duplicar em metas_depositos)
   */
  async processAporteInvestimento(usuario_id: string, params: {
    conta_id?: string | null;
    valor: number;
    data: string;
    descricao?: string | null;
    documento_importado_id?: string | null;
    meta_id?: string | null;
    instituicao?: string | null;
    titulo_investimento?: string | null;
  }) {
    const valor = Math.abs(Number(params.valor));
    if (valor <= 0) return null;

    // 1. Transação de APORTE (não é despesa de consumo)
    const { data: tx, error: txErr } = await supabase
      .from("transacoes")
      .insert([{
        usuario_id,
        tipo: "APORTE",
        descricao: params.descricao || "Aplicação RDB / Investimento",
        valor,
        data: params.data,
        conta_id: params.conta_id || null,
        documento_importado_id: params.documento_importado_id || null,
        status: "confirmada"
      }])
      .select()
      .single();

    if (txErr) throw txErr;

    // 2. Movimentação bancária de SAÍDA na conta de origem
    if (params.conta_id && tx) {
      await supabase.from("movimentacoes").insert([{
        usuario_id,
        transacao_id: tx.id,
        conta_id: params.conta_id,
        tipo: "SAIDA",
        valor,
        data: params.data
      }]);
    }

    // 3. Atualizar ou criar Investimento correspondente
    const titulo = params.titulo_investimento || (params.descricao?.includes("RDB") ? "RDB Nubank" : "Aplicação RDB / Caixinha");
    
    const { data: invs } = await supabase
      .from("investimentos")
      .select("*")
      .eq("usuario_id", usuario_id);

    let targetInv = (invs || []).find((inv: any) => {
      if (params.meta_id && inv.corretora?.includes(params.meta_id)) return true;
      if (inv.titulo?.toLowerCase().includes("rdb") && titulo.toLowerCase().includes("rdb")) return true;
      return false;
    });

    if (targetInv) {
      const novoInvestido = Number(targetInv.valor_investido || 0) + valor;
      const novoAtual = Number(targetInv.valor_atual || 0) + valor;
      const updateData: any = {
        valor_investido: novoInvestido,
        valor_atual: novoAtual
      };
      if (params.meta_id && (!targetInv.corretora || !targetInv.corretora.includes(params.meta_id))) {
        const baseCorretora = targetInv.corretora?.replace(/\[Meta:\s*[^\]]+\]/, '').trim() || params.instituicao || "Nubank";
        updateData.corretora = `[Meta: ${params.meta_id}] ${baseCorretora}`.trim();
      }
      await supabase
        .from("investimentos")
        .update(updateData)
        .eq("id", targetInv.id);

      await supabase.from("historico_investimentos").insert([{
        investimento_id: targetInv.id,
        valor: novoAtual,
        data_registro: params.data
      }]);
    } else {
      // Cria novo investimento vinculando à meta no campo corretora se houver
      const corretoraTag = params.meta_id ? `[Meta: ${params.meta_id}] ${params.instituicao || "Nubank"}`.trim() : (params.instituicao || "Nubank");
      const { data: newInv } = await supabase
        .from("investimentos")
        .insert([{
          usuario_id,
          titulo,
          tipo: "Renda Fixa",
          valor_investido: valor,
          valor_atual: valor,
          corretora: corretoraTag,
          data_inicio: params.data
        }])
        .select()
        .single();

      if (newInv) {
        await supabase.from("historico_investimentos").insert([{
          investimento_id: newInv.id,
          valor,
          data_registro: params.data
        }]);
      }
    }

    // Sincroniza metadados com as metas
    this.syncMetasInvestimentos(usuario_id).catch(() => {});

    return tx;
  },

  /**
   * Processa o resgate de um Investimento / RDB / Caixinha
   * - Cria transação RESGATE (sem inflar receita operacional)
   * - Cria movimentação bancária de ENTRADA na conta receptora
   * - Reduz o saldo do investimento correspondente
   */
  async processResgateInvestimento(usuario_id: string, params: {
    conta_id?: string | null;
    valor: number;
    data: string;
    descricao?: string | null;
    documento_importado_id?: string | null;
    principal?: number | null;
    rendimento?: number | null;
    instituicao?: string | null;
    meta_id?: string | null;
  }) {
    const valor = Math.abs(Number(params.valor));
    if (valor <= 0) return null;

    // 1. Transação de RESGATE (não é receita operacional)
    const { data: tx, error: txErr } = await supabase
      .from("transacoes")
      .insert([{
        usuario_id,
        tipo: "RESGATE",
        descricao: params.descricao || "Resgate RDB / Investimento",
        valor,
        data: params.data,
        conta_id: params.conta_id || null,
        documento_importado_id: params.documento_importado_id || null,
        status: "confirmada"
      }])
      .select()
      .single();

    if (txErr) throw txErr;

    // 2. Movimentação bancária de ENTRADA
    if (params.conta_id && tx) {
      await supabase.from("movimentacoes").insert([{
        usuario_id,
        transacao_id: tx.id,
        conta_id: params.conta_id,
        tipo: "ENTRADA",
        valor,
        data: params.data
      }]);
    }

    // 3. Atualizar Investimento reduzindo o saldo
    const { data: invs } = await supabase
      .from("investimentos")
      .select("*")
      .eq("usuario_id", usuario_id);

    let targetInv = (invs || []).find((inv: any) => {
      if (params.meta_id && inv.corretora?.includes(params.meta_id)) return true;
      return inv.titulo?.toLowerCase().includes("rdb") || inv.tipo?.toLowerCase().includes("renda fixa");
    }) || (invs && invs[0]);

    if (targetInv) {
      const novoAtual = Math.max(0, Number(targetInv.valor_atual || 0) - valor);
      const principalBaixa = params.principal ? Math.min(Number(targetInv.valor_investido || 0), params.principal) : Math.min(Number(targetInv.valor_investido || 0), valor);
      const novoInvestido = Math.max(0, Number(targetInv.valor_investido || 0) - principalBaixa);

      const updateData: any = {
        valor_investido: novoInvestido,
        valor_atual: novoAtual
      };
      if (params.meta_id && (!targetInv.corretora || !targetInv.corretora.includes(params.meta_id))) {
        const baseCorretora = targetInv.corretora?.replace(/\[Meta:\s*[^\]]+\]/, '').trim() || params.instituicao || "Nubank";
        updateData.corretora = `[Meta: ${params.meta_id}] ${baseCorretora}`.trim();
      }

      await supabase
        .from("investimentos")
        .update(updateData)
        .eq("id", targetInv.id);

      await supabase.from("historico_investimentos").insert([{
        investimento_id: targetInv.id,
        valor: novoAtual,
        data_registro: params.data
      }]);
    }

    // Sincroniza metadados com as metas
    this.syncMetasInvestimentos(usuario_id).catch(() => {});

    return tx;
  },

  /**
   * SINCRONIZA AUTOMATICAMENTE METAS E INVESTIMENTOS (RDB / Caixinhas / Reserva de Emergência)
   * Garante que:
   * 1. A Meta 'Reserva de Emergência' esteja vinculada ao investimento de RDB.
   * 2. O saldo acumulado da meta reflita as transações de APORTE e RESGATE existentes na tabela transacoes.
   */
  async syncMetasInvestimentos(usuario_id: string) {
    try {
      const [metasRes, invsRes, txRes] = await Promise.all([
        supabase.from("metas").select("*").eq("usuario_id", usuario_id),
        supabase.from("investimentos").select("*").eq("usuario_id", usuario_id),
        supabase.from("transacoes").select("*").eq("usuario_id", usuario_id).in("tipo", ["APORTE", "RESGATE"])
      ]);

      const metas = metasRes.data || [];
      const invs = invsRes.data || [];
      const txs = txRes.data || [];

      if (metas.length === 0) return;

      const metaReserva = metas.find(m => /reserva(\s+de)?\s+emerg[eê]ncia|caixinha/i.test(m.titulo)) || metas[0];
      if (!metaReserva) return;

      // Filtra transações relacionadas a RDB / Caixinhas
      const txRdb = txs.filter(t => {
        const d = (t.descricao || "").toLowerCase();
        return d.includes("rdb") || d.includes("caixinha") || d.includes("reserva") || t.tipo === "APORTE" || t.tipo === "RESGATE";
      });

      if (txRdb.length === 0) return;

      const totalAportes = txRdb.filter(t => t.tipo === "APORTE" || (t.descricao || "").toLowerCase().includes("aplica")).reduce((acc, cur) => acc + Number(cur.valor || 0), 0);
      const totalResgates = txRdb.filter(t => t.tipo === "RESGATE" || (t.descricao || "").toLowerCase().includes("resgate")).reduce((acc, cur) => acc + Number(cur.valor || 0), 0);
      const saldoCalculado = Math.max(0, totalAportes - totalResgates);

      // Localiza investimento de RDB
      let targetInv = invs.find((inv: any) => {
        if (inv.corretora?.includes(metaReserva.id)) return true;
        return (inv.titulo || "").toLowerCase().includes("rdb") || (inv.titulo || "").toLowerCase().includes("reserva");
      });

      const corretoraTag = `[Meta: ${metaReserva.id}] Nubank`;

      if (targetInv) {
        const needsCorretoraFix = !targetInv.corretora?.includes(metaReserva.id);
        const needsValorFix = Number(targetInv.valor_atual || 0) === 0 && saldoCalculado > 0;
        if (needsCorretoraFix || needsValorFix) {
          await supabase.from("investimentos").update({
            corretora: corretoraTag,
            valor_atual: needsValorFix ? saldoCalculado : targetInv.valor_atual,
            valor_investido: needsValorFix ? saldoCalculado : targetInv.valor_investido
          }).eq("id", targetInv.id);
        }
      } else if (saldoCalculado > 0) {
        await supabase.from("investimentos").insert([{
          usuario_id,
          titulo: "RDB Nubank",
          tipo: "Renda Fixa",
          valor_investido: saldoCalculado,
          valor_atual: saldoCalculado,
          corretora: corretoraTag,
          data_inicio: new Date().toISOString().split("T")[0]
        }]);
      }
    } catch (err) {
      console.warn("Erro em syncMetasInvestimentos:", err);
    }
  },

  /**
   * Processa o pagamento de Fatura de Cartão de Crédito
   * - Cria transação PAGAMENTO_FATURA
   * - Cria movimentação bancária de SAÍDA na conta pagadora
   * - Quita/atualiza a fatura correspondente
   * - NÃO duplica como despesa de consumo
   */
  async processPagamentoFatura(usuario_id: string, params: {
    conta_id?: string | null;
    cartao_id?: string | null;
    fatura_id?: string | null;
    valor: number;
    data: string;
    descricao?: string | null;
    documento_importado_id?: string | null;
  }) {
    const valor = Math.abs(Number(params.valor));
    if (valor <= 0) return null;

    // 1. Transação de PAGAMENTO_FATURA (Liquidação de obrigação - NUNCA despesa de consumo)
    const { data: tx, error: txErr } = await supabase
      .from("transacoes")
      .insert([{
        usuario_id,
        tipo: "PAGAMENTO_FATURA",
        descricao: params.descricao || "Pagamento de Fatura",
        valor,
        data: params.data,
        conta_id: params.conta_id || null,
        cartao_id: params.cartao_id || null,
        fatura_id: params.fatura_id || null,
        documento_importado_id: params.documento_importado_id || null,
        status: "confirmada"
      }])
      .select()
      .single();

    if (txErr) throw txErr;

    // 2. Movimentação de SAÍDA na conta bancária (Fluxo de caixa real)
    if (params.conta_id && tx) {
      await supabase.from("movimentacoes").insert([{
        usuario_id,
        transacao_id: tx.id,
        conta_id: params.conta_id,
        tipo: "SAIDA",
        valor,
        data: params.data
      }]);
    }

    // 3. Atualiza fatura se fornecida ou localiza fatura correspondente do cartão
    let targetFaturaId = params.fatura_id;
    if (!targetFaturaId && params.cartao_id) {
      const { data: faturas } = await supabase
        .from("faturas")
        .select("id, data_vencimento, data_fechamento, valor_total, valor_pago, status")
        .eq("usuario_id", usuario_id)
        .eq("cartao_id", params.cartao_id)
        .order("data_vencimento", { ascending: false });

      if (faturas && faturas.length > 0) {
        const pendente = faturas.find(f => f.status !== "paga");
        targetFaturaId = pendente ? pendente.id : faturas[0].id;
      }
    }

    if (targetFaturaId) {
      const { data: fatura } = await supabase
        .from("faturas")
        .select("id, valor_total, valor_pago, status")
        .eq("id", targetFaturaId)
        .single();

      if (fatura) {
        const totalFatura = Number(fatura.valor_total || 0);
        const jaPago = Number(fatura.valor_pago || 0);
        const saldoDevedor = Math.max(0, totalFatura - jaPago);
        const novoPago = jaPago + valor;
        let excedenteCredito = 0;

        if (valor > saldoDevedor && totalFatura > 0) {
          excedenteCredito = Math.round((valor - saldoDevedor) * 100) / 100;
        }

        const status = novoPago >= totalFatura ? "paga" : "parcialmente_paga";
        await supabase.from("faturas").update({ valor_pago: novoPago, status }).eq("id", targetFaturaId);

        // Se houve excedente pago a maior, anota como crédito a favor sem criar despesa
        if (excedenteCredito > 0 && tx) {
          await supabase
            .from("transacoes")
            .update({
              fatura_id: targetFaturaId,
              observacao: `Quitação da obrigação: R$ ${saldoDevedor.toFixed(2)} | Excedente / Crédito a favor do cartão: R$ ${excedenteCredito.toFixed(2)}`
            })
            .eq("id", tx.id);
        } else if (tx && !tx.fatura_id) {
          await supabase.from("transacoes").update({ fatura_id: targetFaturaId }).eq("id", tx.id);
        }
      }
    }

    return tx;
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
    const tableName = table === "gastos" ? "transacoes" : table === "entradas" ? "transacoes" : table === "dividas" ? "dividas" : table;
    const { error } = await supabase.from(tableName).delete().eq("id", id);
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
    const payload: any = {
      meta_id: dados.meta_id,
      valor: dados.valor,
      usuario_id
    };
    if (dados.data_deposito || dados.data) {
      payload.data_deposito = dados.data_deposito || dados.data;
    }
    const { error } = await supabase.from("metas_depositos").insert([payload]);
    if (error) {
      // Fallback caso ocorra erro com data_deposito
      delete payload.data_deposito;
      delete payload.data;
      const { error: retryError } = await supabase.from("metas_depositos").insert([payload]);
      if (retryError) throw retryError;
    }
  },
  // ==========================================
  // NOVO MOTOR DE DÍVIDAS (Etapa 4)
  // ==========================================

  async getDividas(usuario_id: string) {
    const { data: dividas, error } = await supabase
      .from("dividas")
      .select("*, parcelas_divida(*)")
      .eq("usuario_id", usuario_id)
      .order("criado_em", { ascending: false });
    
    if (error) throw error;

    // Ordenar parcelas de cada dívida
    return (dividas || []).map(d => {
        const parcelas = (d.parcelas_divida || []).sort((a: any, b: any) => a.numero_parcela - b.numero_parcela);
        return { ...d, parcelas_divida: parcelas };
    });
  },

  async addDivida(usuario_id: string, payload: { divida: any, parcelas: any[] }) {
    // 1. Inserir Dívida
    const { data: divida, error: dividaError } = await supabase
      .from("dividas")
      .insert([{ ...payload.divida, usuario_id }])
      .select()
      .single();
    
    if (dividaError) throw dividaError;

    // 2. Inserir Parcelas atreladas
    if (payload.parcelas && payload.parcelas.length > 0) {
        const parcelasParaInserir = payload.parcelas.map(p => ({
            ...p,
            divida_id: divida.id
        }));

        const { error: parcelasError } = await supabase
          .from("parcelas_divida")
          .insert(parcelasParaInserir);
        
        if (parcelasError) throw parcelasError;
    }

    return divida;
  },

  async pagarParcelaDivida(
    usuario_id: string,
    parcela_id: string,
    divida_id: string,
    valor_pago: number,
    conta_id: string,
    data_pagamento: string,
    tipo_pagamento: 'parcela' | 'quitacao' | 'amortizacao' = 'parcela',
    desconto: number = 0
  ) {
    // 1. Criar a transação de PAGAMENTO_DIVIDA (Liquidação de obrigação - NUNCA despesa de consumo duplicada)
    const { data: tx, error: txError } = await supabase
        .from("transacoes")
        .insert([{
            usuario_id,
            tipo: "PAGAMENTO_DIVIDA",
            descricao: tipo_pagamento === 'quitacao' ? "Quitação Total de Dívida" : "Pagamento de Parcela - Dívida",
            valor: valor_pago,
            data: data_pagamento,
            conta_id: conta_id,
            observacao: desconto > 0 ? `Desconto de quitação: R$ ${desconto.toFixed(2)}` : null,
            status: "confirmada"
        }])
        .select().single();
    if (txError) throw txError;

    // 2. Criar a movimentação de SAÍDA para abater o dinheiro da conta no fluxo de caixa
    await supabase.from("movimentacoes").insert([{
        usuario_id, transacao_id: tx.id, conta_id, tipo: "SAIDA", valor: valor_pago, data: data_pagamento
    }]);

    // 3. Registrar o vínculo em pagamentos_divida
    await supabase.from("pagamentos_divida").insert([{
        divida_id,
        parcela_id: parcela_id || null,
        transacao_id: tx.id,
        valor_pago,
        data_pagamento,
        tipo_pagamento
    }]);

    // 4. Atualizar o status da parcela para 'paga'
    if (parcela_id) {
      await supabase.from("parcelas_divida").update({ status: 'paga' }).eq("id", parcela_id);
    }

    if (tipo_pagamento === 'quitacao') {
      await supabase.from("parcelas_divida").update({ status: 'paga' }).eq("divida_id", divida_id);
      await supabase.from("dividas").update({ status: 'quitada' }).eq("id", divida_id);
    } else {
      // 5. Verificar se todas as parcelas foram pagas para quitar a dívida
      const { data: parcelas } = await supabase.from("parcelas_divida").select("status").eq("divida_id", divida_id);
      const todasPagas = parcelas && parcelas.length > 0 && parcelas.every(p => p.status === 'paga');
      
      if (todasPagas) {
          await supabase.from("dividas").update({ status: 'quitada' }).eq("id", divida_id);
      }
    }

    return tx;
  },

  async quitarDividaManual(divida_id: string) {
    const { error } = await supabase.from("dividas").update({ status: 'quitada' }).eq("id", divida_id);
    if (error) throw error;
  },

  async deleteDivida(divida_id: string, usuario_id: string) {
    // 1. Excluir pagamentos atrelados
    await supabase.from("pagamentos_divida").delete().eq("divida_id", divida_id);
    // 2. Excluir parcelas atreladas
    await supabase.from("parcelas_divida").delete().eq("divida_id", divida_id);
    // 3. Excluir dívida
    const { error } = await supabase.from("dividas").delete().eq("id", divida_id).eq("usuario_id", usuario_id);
    if (error) throw error;
  },

  async toggleParcelaStatus(parcela_id: string, divida_id: string, novoStatus: 'paga' | 'pendente') {
    const { error } = await supabase
      .from("parcelas_divida")
      .update({
        status: novoStatus
      })
      .eq("id", parcela_id);
    if (error) throw error;

    // Recalcular status da dívida
    const { data: parcelas } = await supabase.from("parcelas_divida").select("status").eq("divida_id", divida_id);
    const todasPagas = parcelas && parcelas.length > 0 && parcelas.every(p => p.status === 'paga');
    await supabase.from("dividas").update({ status: todasPagas ? 'quitada' : 'ativa' }).eq("id", divida_id);
  },

  async marcarParcelasVencidasPagas(divida_id: string) {
    const hojeStr = new Date().toISOString().split("T")[0];
    const { error } = await supabase
      .from("parcelas_divida")
      .update({
        status: 'paga'
      })
      .eq("divida_id", divida_id)
      .lt("data_vencimento", hojeStr)
      .eq("status", "pendente");
    if (error) throw error;

    // Recalcular status da dívida
    const { data: parcelas } = await supabase.from("parcelas_divida").select("status").eq("divida_id", divida_id);
    const todasPagas = parcelas && parcelas.length > 0 && parcelas.every(p => p.status === 'paga');
    await supabase.from("dividas").update({ status: todasPagas ? 'quitada' : 'ativa' }).eq("id", divida_id);
  },

  async sincronizarGastosParcelasPagas(usuario_id: string, divida_id: string, conta_id?: string) {
    // 1. Buscar a dívida e suas parcelas
    const { data: divida, error: dividaErr } = await supabase
      .from("dividas")
      .select("*, parcelas_divida(*)")
      .eq("id", divida_id)
      .single();
    if (dividaErr) throw dividaErr;

    // 2. Descobrir conta_id se não fornecida
    let finalContaId = conta_id;
    if (!finalContaId) {
      const { data: contas } = await supabase.from("contas_bancarias").select("id, nome, instituicao").eq("usuario_id", usuario_id);
      if (contas && contas.length > 0) {
        const matching = contas.find(c => 
          (divida.instituicao && c.nome?.toLowerCase().includes(divida.instituicao.toLowerCase())) ||
          (divida.instituicao && c.instituicao?.toLowerCase().includes(divida.instituicao.toLowerCase()))
        );
        finalContaId = matching ? matching.id : contas[0].id;
      }
    }

    // 3. Buscar quais parcelas já têm pagamento registrado para evitar duplicidade
    const { data: pagamentosExistentes } = await supabase
      .from("pagamentos_divida")
      .select("parcela_id")
      .eq("divida_id", divida_id);

    const parcelasJaRegistradas = new Set((pagamentosExistentes || []).map(p => p.parcela_id));

    // 4. Filtrar parcelas 'paga' sem registro de pagamento de dívida
    const parcelasPagasSemRegistro = (divida.parcelas_divida || [])
      .filter((p: any) => p.status === 'paga' && !parcelasJaRegistradas.has(p.id));

    let inseridos = 0;
    for (const p of parcelasPagasSemRegistro) {
      const dt = p.data_vencimento;
      const vlr = Number(p.valor_esperado);

      // Inserir transação de PAGAMENTO_DIVIDA (Liquidação - NUNCA DESPESA de consumo!)
      const { data: tx, error: txErr } = await supabase
        .from("transacoes")
        .insert([{
          usuario_id,
          tipo: "PAGAMENTO_DIVIDA",
          descricao: `Pagamento ${divida.descricao || 'Dívida'} - Parcela #${p.numero_parcela}`,
          valor: vlr,
          data: dt,
          conta_id: finalContaId || null,
          status: "confirmada"
        }])
        .select()
        .single();

      if (!txErr && tx) {
        // Inserir movimentação de SAÍDA de caixa
        if (finalContaId) {
          await supabase.from("movimentacoes").insert([{
            usuario_id,
            transacao_id: tx.id,
            conta_id: finalContaId,
            tipo: "SAIDA",
            valor: vlr,
            data: dt
          }]);
        }

        // Inserir vínculo em pagamentos_divida
        await supabase.from("pagamentos_divida").insert([{
          divida_id,
          parcela_id: p.id,
          transacao_id: tx.id,
          valor_pago: vlr,
          data_pagamento: dt,
          tipo_pagamento: 'parcela'
        }]);

        inseridos++;
      }
    }

    return { total: parcelasPagasSemRegistro.length, inseridos };
  },

  async getDevedores(usuario_id: string) {
    // Busca TODOS os gastos marcados como terceiro = true (pagos e não pagos) para manter histórico
    const { data, error } = await supabase
      .from("transacoes")
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
    const { error } = await supabase.from("transacoes").update({ terceiro_pago: pago }).eq("id", gasto_id);
    if (error) throw error;
  },

  // ==========================================
  // MÓDULO DE FATURAS (CARTÕES)
  // ==========================================

  async getFaturaMensal(usuario_id: string, cartao_id: string, anoMes: string) {
    // 1. Busca os dados do cartão
    const { data: cartao, error: cartaoError } = await supabase
      .from("cartoes")
      .select("*")
      .eq("id", cartao_id)
      .single();
      
    if (cartaoError || !cartao) throw cartaoError || new Error("Cartão não encontrado");

    // 2. Busca a fatura na nova tabela definitiva "faturas"
    // anoMes vem como "YYYY-MM", a data de vencimento da fatura determina seu mês
    // Mas a tabela "faturas" usa `data_fechamento` ou `data_vencimento`
    // Vamos buscar pela fatura cujo ano/mes do vencimento ou fechamento bata.
    const { data: faturas, error: faturaError } = await supabase
      .from("faturas")
      .select("*")
      .eq("cartao_id", cartao_id)
      .eq("usuario_id", usuario_id);

    if (faturaError) throw faturaError;

    // Filtra a fatura correspondente ao mes (por simplicidade, usando substring da data_vencimento)
    let fatura = faturas?.find(f => f.data_vencimento?.startsWith(anoMes));
    
    // Se não encontrou, retorna uma estrutura vazia simulada
    if (!fatura) {
        return {
            cartao,
            fatura_id: null,
            valor_total: 0,
            status: "aberta", // status padrão para faturas não iniciadas/não geradas
            dataInicio: "",
            dataFim: "",
            itens: [],
            pagamentos: 0
        };
    }

    // 3. Se a fatura existe, busca as transações (e parcelas) atreladas a ela
    const { data: transacoes, error: transacoesError } = await supabase
      .from("transacoes")
      .select("*, parcelas(*)")
      .eq("fatura_id", fatura.id)
      .order("data", { ascending: true });

    if (transacoesError) throw transacoesError;

    // TODO: Suportar pagamentos de faturas baseados no novo modelo (Transferência de conta corrente para Cartão)
    // Por enquanto, apenas enviamos as transações
    return {
      cartao,
      fatura_id: fatura.id,
      valor_total: fatura.valor_total,
      status: fatura.status,
      data_fechamento: fatura.data_fechamento,
      data_vencimento: fatura.data_vencimento,
      itens: transacoes || [],
      pagamentos: 0 // Placeholder
    };
  },

  /**
   * FUNÇÕES CANÔNICAS DE DOMÍNIO PARA CÁLCULO DE FATURAS (REGRA CONTÁBIL ESTATUTÁRIA)
   * Garante separação estrita de:
   * charges (compras, parcelas, limites, juros, tarifas)
   * credits (estornos, créditos de fatura, cancelamentos)
   * payments (pagamento recebido, liquidação de fatura)
   */
  calculateInvoiceCharges(itens: any[]): number {
    return (itens || [])
      .filter(t => {
        const desc = (t.descricao || "").toLowerCase();
        const isPagamento = t.tipo === "PAGAMENTO_FATURA" || desc.includes("pagamento recebido") || desc.includes("pagamento de fatura") || desc.includes("pagamento cartão");
        const isEstorno = t.tipo === "ESTORNO" || desc.includes("estorno") || desc.includes("crédito de fatura") || desc.includes("desconto (nufinanceira)");
        return !isPagamento && !isEstorno;
      })
      .reduce((sum, t) => sum + Math.abs(Number(t.valor || 0)), 0);
  },

  calculateInvoiceCredits(itens: any[]): number {
    return (itens || [])
      .filter(t => {
        const desc = (t.descricao || "").toLowerCase();
        const isEstorno = t.tipo === "ESTORNO" || desc.includes("estorno") || desc.includes("crédito de fatura") || desc.includes("desconto (nufinanceira)");
        return isEstorno;
      })
      .reduce((sum, t) => sum + Math.abs(Number(t.valor || 0)), 0);
  },

  calculateInvoicePayments(itens: any[]): number {
    return (itens || [])
      .filter(t => {
        const desc = (t.descricao || "").toLowerCase();
        return t.tipo === "PAGAMENTO_FATURA" || desc.includes("pagamento recebido") || desc.includes("pagamento de fatura") || desc.includes("pagamento cartão");
      })
      .reduce((sum, t) => sum + Math.abs(Number(t.valor || 0)), 0);
  },

  calculateInvoiceTotal(itens: any[]): number {
    const charges = this.calculateInvoiceCharges(itens);
    const credits = this.calculateInvoiceCredits(itens);
    return Math.round(Math.max(0, charges - credits) * 100) / 100;
  },

  calculateInvoiceBalance(valorTotal: number, valorPago: number): number {
    return Math.round(Math.max(0, valorTotal - valorPago) * 100) / 100;
  },

  /**
   * ESTADOS E TRANSIÇÕES DA OBRIGAÇÃO FINANCEIRA (SEÇÃO 15: MÍNIMO, PARCIAL, ADIANTADO, RENEGOCIAÇÃO)
   * Separa rigidamente 'Gasto Econômico' de 'Fluxo de Caixa / Pagamento'
   */
  calculateObligationState(params: {
    valorObrigacaoOriginal: number;
    pagamentos?: Array<{ valor: number; tipo?: string; antecipado?: boolean }>;
    estornos?: Array<{ valor: number }>;
    jurosEncargos?: Array<{ valor: number; tipo?: string; documentado?: boolean }>;
    renegociacao?: {
      valorTotalRenegociado: number;
      parcelas?: number;
      jurosDiscriminados?: number;
      dividaOriginal?: number;
      detalhado: boolean;
    };
  }) {
    const original = Math.abs(Number(params.valorObrigacaoOriginal || 0));
    const estornos = (params.estornos || []).reduce((acc, e) => acc + Math.abs(Number(e.valor || 0)), 0);
    const pagamentos = (params.pagamentos || []).reduce((acc, p) => acc + Math.abs(Number(p.valor || 0)), 0);

    // Despesa de consumo líquido
    const despesasConsumo = Math.round(Math.max(0, original - estornos) * 100) / 100;

    // Despesas financeiras só são reconhecidas se documentalmente comprovadas
    let despesasFinanceiras = 0;
    (params.jurosEncargos || []).forEach(j => {
      if (j.documentado !== false) {
        despesasFinanceiras += Math.abs(Number(j.valor || 0));
      }
    });

    // Tratamento de renegociação
    let valorObrigacaoAtual = despesasConsumo;
    let renegociacaoInconsistencia: string | null = null;
    let isRenegociada = false;

    if (params.renegociacao) {
      isRenegociada = true;
      const reneg = params.renegociacao;
      if (reneg.detalhado && reneg.jurosDiscriminados !== undefined) {
        despesasFinanceiras += Math.abs(Number(reneg.jurosDiscriminados));
        valorObrigacaoAtual = Math.round(Number(reneg.valorTotalRenegociado) * 100) / 100;
      } else if (!reneg.detalhado) {
        // Se a composição não for discriminada, NÃO inventar que diferenca = juros!
        valorObrigacaoAtual = Math.round(Number(reneg.valorTotalRenegociado) * 100) / 100;
        renegociacaoInconsistencia = "Composição da renegociação não identificada. Necessária conciliação/revisão.";
      } else {
        valorObrigacaoAtual = Math.round(Number(reneg.valorTotalRenegociado) * 100) / 100;
      }
    } else {
      valorObrigacaoAtual = Math.round((despesasConsumo + despesasFinanceiras) * 100) / 100;
    }

    const gastoTotalEconomico = Math.round((despesasConsumo + despesasFinanceiras) * 100) / 100;
    const saldoRestante = Math.round(Math.max(0, valorObrigacaoAtual - pagamentos) * 100) / 100;
    const saldoCredor = Math.round(Math.max(0, pagamentos - valorObrigacaoAtual) * 100) / 100;
    const movimentacoesCaixa = Math.round(pagamentos * 100) / 100;

    let status: 'QUITADA' | 'PARCIAL' | 'ABERTA' | 'RENEGOCIADA' | 'EXCEDENTE_CREDITO' = 'ABERTA';
    if (isRenegociada && saldoRestante > 0) {
      status = 'RENEGOCIADA';
    } else if (saldoCredor > 0) {
      status = 'EXCEDENTE_CREDITO';
    } else if (saldoRestante === 0 && pagamentos > 0) {
      status = 'QUITADA';
    } else if (pagamentos > 0 && saldoRestante > 0) {
      status = 'PARCIAL';
    }

    return {
      despesasConsumo,
      despesasFinanceiras,
      gastoTotalEconomico,
      valorObrigacao: valorObrigacaoAtual,
      valorPago: pagamentos,
      saldoRestante,
      saldoCredor,
      movimentacoesCaixa,
      status,
      renegociacaoInconsistencia
    };
  },

  /**
   * SINCRONIZA E GERA AUTOMATICAMENTE AS FATURAS DOS CARTÕES
   * Agrupa as transações de cartão por ciclo mensal e garante registros na tabela faturas
   */
  async syncCardFaturas(usuario_id: string) {
    try {
      const [cardsRes, txRes] = await Promise.all([
        supabase.from("cartoes").select("*").eq("usuario_id", usuario_id),
        supabase.from("transacoes").select("*").eq("usuario_id", usuario_id).not("cartao_id", "is", null)
      ]);

      const cards = cardsRes.data || [];
      const transacoes = txRes.data || [];
      if (cards.length === 0 || transacoes.length === 0) return;

      const cardsMap = new Map(cards.map((c: any) => [c.id, c]));

      // Agrupa transações por cartao_id e mesReferencia
      const groups = new Map<string, { card: any, mesRef: string, items: any[] }>();

      for (const tx of transacoes) {
        const card = cardsMap.get(tx.cartao_id);
        if (!card) continue;

        const mesRef = getFaturaMesReferencia(tx.data, card.fechamento_dia, card.vencimento_dia);
        const groupKey = `${card.id}_${mesRef}`;

        if (!groups.has(groupKey)) {
          groups.set(groupKey, { card, mesRef, items: [] });
        }
        groups.get(groupKey)!.items.push(tx);
      }

      for (const { card, mesRef, items } of groups.values()) {
        const { dataInicio, dataFim } = getFaturaCycle(mesRef, card.fechamento_dia, card.vencimento_dia);
        const dataVencimento = `${mesRef}-${String(card.vencimento_dia).padStart(2, '0')}`;

        // Verifica se já existe fatura para esse vencimento
        const { data: existingFatura } = await supabase
          .from("faturas")
          .select("id, valor_total, valor_pago")
          .eq("usuario_id", usuario_id)
          .eq("cartao_id", card.id)
          .eq("data_vencimento", dataVencimento)
          .maybeSingle();

        const isTxPagamento = (t: any) => t.tipo === "PAGAMENTO_FATURA" || /pagamento\s*recebido|pagamento\s*de\s*fatura|pagamento\s*cart[aã]o/i.test(t.descricao || "");
        const isTxEstorno = (t: any) => t.tipo === "ESTORNO" || /estorno|cr[eé]dito\s*de\s*fatura|desconto\s*\(nufinanceira\)/i.test(t.descricao || "");

        // Auto-repara no banco transações com tipo incorreto
        const pagamentosComTipoErrado = items.filter(t => isTxPagamento(t) && t.tipo !== "PAGAMENTO_FATURA");
        if (pagamentosComTipoErrado.length > 0) {
          const idsToFix = pagamentosComTipoErrado.map(t => t.id);
          supabase.from("transacoes").update({ tipo: "PAGAMENTO_FATURA" }).in("id", idsToFix).then();
        }

        const estornosComTipoErrado = items.filter(t => isTxEstorno(t) && t.tipo !== "ESTORNO");
        if (estornosComTipoErrado.length > 0) {
          const idsToFixEstornos = estornosComTipoErrado.map(t => t.id);
          supabase.from("transacoes").update({ tipo: "ESTORNO" }).in("id", idsToFixEstornos).then();
        }

        // Aplica funções canônicas de domínio
        const valorTotal = this.calculateInvoiceTotal(items);
        const valorPago = this.calculateInvoicePayments(items);
        const saldoDevedor = this.calculateInvoiceBalance(valorTotal, valorPago);

        const hojeStr = new Date().toISOString().split("T")[0];
        let status = "aberta";
        if (valorPago >= valorTotal && valorTotal > 0) {
          status = "paga";
        } else if (valorPago > 0) {
          status = "parcialmente_paga";
        } else if (hojeStr > dataVencimento) {
          status = "atrasada";
        } else if (hojeStr > dataFim) {
          status = "fechada";
        }

        let faturaId = existingFatura?.id;

        if (existingFatura) {
          await supabase
            .from("faturas")
            .update({
              valor_total: valorTotal,
              valor_pago: valorPago,
              status
            })
            .eq("id", existingFatura.id);
        } else {
          const { data: novaFatura } = await supabase
            .from("faturas")
            .insert([{
              usuario_id,
              cartao_id: card.id,
              data_inicio: dataInicio,
              data_fechamento: dataFim,
              data_vencimento: dataVencimento,
              status,
              valor_total: valorTotal,
              valor_pago: valorPago
            }])
            .select()
            .single();
          faturaId = novaFatura?.id;
        }

        // Vincula as transações que ainda não possuem fatura_id
        if (faturaId) {
          const txIdsToUpdate = items.filter(t => !t.fatura_id).map(t => t.id);
          if (txIdsToUpdate.length > 0) {
            await supabase
              .from("transacoes")
              .update({ fatura_id: faturaId })
              .in("id", txIdsToUpdate);
          }
        }
      }
    } catch (err) {
      console.warn("Erro ao sincronizar faturas:", err);
    }
  },

  async getAllFaturas(usuario_id: string) {
    await this.syncCardFaturas(usuario_id);

    const [faturasRes, dividasRes] = await Promise.all([
      supabase
        .from("faturas")
        .select("*, cartoes(nome, cor_hex, fechamento_dia, vencimento_dia)")
        .eq("usuario_id", usuario_id)
        .order("data_vencimento", { ascending: false }),
      supabase
        .from("dividas")
        .select("id, fatura_origem_id, status, descricao")
        .eq("usuario_id", usuario_id)
        .not("fatura_origem_id", "is", null)
    ]);

    if (faturasRes.error) throw faturasRes.error;

    const renegMap = new Map<string, any>();
    (dividasRes.data || []).forEach((d: any) => {
      if (d.fatura_origem_id) renegMap.set(d.fatura_origem_id, d);
    });

    return (faturasRes.data || []).map((f: any) => {
      const reneg = renegMap.get(f.id);
      return {
        ...f,
        status: reneg ? "renegociada" : f.status,
        renegociacao_id: reneg?.id || null,
        renegociacao_descricao: reneg?.descricao || null
      };
    });
  },

  /**
   * LIMPA TODOS OS LANÇAMENTOS DO USUÁRIO (PRESERVANDO CONTAS E CARTÕES)
   */
  async limparLancamentosUsuario(usuario_id: string) {
    try {
      // 1. Dívidas e pagamentos vinculados
      const { data: dividas } = await supabase.from("dividas").select("id").eq("usuario_id", usuario_id);
      const divIds = (dividas || []).map(d => d.id);
      if (divIds.length > 0) {
        await supabase.from("pagamentos_divida").delete().in("divida_id", divIds);
        await supabase.from("parcelas_divida").delete().in("divida_id", divIds);
      }
      await supabase.from("dividas").delete().eq("usuario_id", usuario_id);

      // 2. Movimentações e transferências
      await supabase.from("movimentacoes").delete().eq("usuario_id", usuario_id);
      await supabase.from("transferencias").delete().eq("usuario_id", usuario_id);

      // 3. Parcelamentos e parcelas
      await supabase.from("parcelas").delete().eq("usuario_id", usuario_id);
      await supabase.from("parcelamentos").delete().eq("usuario_id", usuario_id);

      // 4. Transações e faturas
      await supabase.from("transacoes").delete().eq("usuario_id", usuario_id);
      await supabase.from("faturas").delete().eq("usuario_id", usuario_id);

      // 5. Documentos importados
      await supabase.from("documentos_importados").delete().eq("usuario_id", usuario_id);

      // 6. Investimentos
      const { data: invs } = await supabase.from("investimentos").select("id").eq("usuario_id", usuario_id);
      const invIds = (invs || []).map(i => i.id);
      if (invIds.length > 0) {
        await supabase.from("historico_investimentos").delete().in("investimento_id", invIds);
      }
      await supabase.from("investimentos").delete().eq("usuario_id", usuario_id);

      // 7. Depósitos de metas (mantém as metas)
      const { data: metas } = await supabase.from("metas").select("id").eq("usuario_id", usuario_id);
      const metaIds = (metas || []).map(m => m.id);
      if (metaIds.length > 0) {
        await supabase.from("metas_depositos").delete().in("meta_id", metaIds);
      }

      // CONTAS BANCÁRIAS E CARTÕES PERMANECEM 100% INTACTOS!
      return { success: true };
    } catch (err) {
      console.error("Erro ao limpar lançamentos do usuário:", err);
      throw err;
    }
  }
};
