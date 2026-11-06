import { moedaService, ehReal } from "./moeda.service";
import { supabase } from "./supabase";
import { lerParcelaDaDescricao, descricaoSemParcela } from "../utils/parcelas";
import { getFaturaCycle, getFaturaMesReferencia } from "../utils/cartao.utils";
import { encontrarPorInstituicao } from "../utils/instituicoes";
import { buscarTodasPaginas } from "./paginacao";
import { sincronizarCaixinhas, ocultarCaixinha, contaDaCaixinha } from "./caixinhas.service";
import {
  detectarProdutoInvestimento,
  ehAplicacaoInvestimento,
  ehResgateInvestimento,
  instituicaoDoInvestimento,
  metaIdDoInvestimento,
  corretoraComMeta,
} from "../utils/investimentos";

/** Colunas da migration 007; se ainda não existirem no banco, salva sem elas. */
const CAMPOS_RENTABILIDADE = ["indexador", "taxa", "vencimento", "liquidez_diaria", "conta_id", "ajuste_valor", "ajuste_data"];

async function salvarInvestimento(
  tabela: () => any,
  dados: any,
  executar: (payload: any, q: any) => PromiseLike<{ data: any; error: any }>
) {
  let { data, error } = await executar(dados, tabela());
  if (error && /column|schema cache/i.test(error.message || "") && CAMPOS_RENTABILIDADE.some(c => c in dados)) {
    const semRentabilidade = Object.fromEntries(Object.entries(dados).filter(([k]) => !CAMPOS_RENTABILIDADE.includes(k)));
    console.warn("Colunas de rentabilidade ausentes (migration 007 pendente). Salvando sem elas.");
    ({ data, error } = await executar(semRentabilidade, tabela()));
  }
  if (error) throw error;
  return data;
}

/**
 * Investimento correspondente a um aporte/resgate:
 * 1) o vinculado à meta informada; 2) o do mesmo produto (ex.: CDB) e, se informada,
 * da mesma instituição, desde que não esteja vinculado a OUTRA meta.
 */
function encontrarInvestimento(invs: any[], metaId?: string | null, produto?: string | null, instituicao?: string | null) {
  if (metaId) {
    const daMeta = invs.find(inv => metaIdDoInvestimento(inv.corretora) === metaId);
    if (daMeta) return daMeta;
  }
  if (!produto) return undefined;
  const inst = (instituicao || "").toLowerCase();
  return invs.find(inv => {
    const outraMeta = metaIdDoInvestimento(inv.corretora);
    if (outraMeta && metaId && outraMeta !== metaId) return false;
    const mesmoProduto = detectarProdutoInvestimento(`${inv.titulo || ""} ${inv.tipo || ""}`) === produto;
    const instInv = instituicaoDoInvestimento(inv.corretora).toLowerCase();
    const mesmaInst = !inst || !instInv || instInv.includes(inst) || inst.includes(instInv);
    return mesmoProduto && mesmaInst;
  });
}


// ============================================================================
// MOEDAS (contas em outra moeda — SQL seção 10)
// transacoes.valor é sempre em REAIS; movimentacoes.valor fica na MOEDA DA CONTA.
// Sem a seção 10 aplicada, todas as contas são tratadas como BRL (nada muda).
// ============================================================================

/** Moeda de cada conta (BRL se a coluna ainda não existir). */
export async function moedasDasContas(ids: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return {};
  const { data, error } = await supabase.from("contas_bancarias").select("id, moeda").in("id", unicos);
  if (error) return {};
  return Object.fromEntries((data || []).map((c: any) => [c.id, String(c.moeda || "BRL").toUpperCase()]));
}

/**
 * Grava movimentações. Cada linha traz `valor` em reais e, opcionalmente:
 *  - `moeda`: em qual saldo da conta o dinheiro entra/sai (ex.: Wise tem BRL e CAD).
 *    Sem `moeda`, é a moeda principal da conta (como sempre foi).
 *  - `valor_na_conta`: o valor já nessa moeda (ex.: 2.50 CAD). Sem ele, converte pela cotação do dia.
 * Contas em real sem outra moeda: grava exatamente como antes.
 */
export async function inserirMovimentacoes(linhas: any[]) {
  const moedas = await moedasDasContas(linhas.map((l) => l.conta_id));
  const prontas: any[] = [];
  let usaOutraMoeda = false;
  for (const l of linhas) {
    const { valor_na_conta, moeda: moedaLinha, ...resto } = l;
    const moedaConta = moedas[l.conta_id] || "BRL";
    const moeda = String(moedaLinha || moedaConta).toUpperCase();
    // Saldo em moeda diferente da principal da conta (SQL seção 11): marca a moeda na movimentação
    const extra = moeda !== moedaConta ? { moeda } : {};
    if (moeda !== moedaConta) usaOutraMoeda = true;
    if (ehReal(moeda)) {
      // Em real: valor em reais (ou o valor que efetivamente chegou, numa conversão)
      prontas.push({ ...resto, ...extra, valor: valor_na_conta ?? resto.valor });
      continue;
    }
    let valor = valor_na_conta;
    if (valor === undefined || valor === null) {
      const cot = await moedaService.cotacao(moeda, l.data);
      if (!cot) return { data: null, error: new Error(`Não foi possível obter a cotação de ${moeda} em ${l.data}.`) };
      valor = Math.round((Number(l.valor) / cot) * 100) / 100;
    }
    prontas.push({ ...resto, ...extra, valor });
  }
  const res = await supabase.from("movimentacoes").insert(prontas);
  if (res.error && usaOutraMoeda && /moeda/i.test(String((res.error as any).message || ""))) {
    return { ...res, error: new Error("Para guardar saldo em outra moeda na mesma conta, rode a seção 11 do supabase/migrations/ajustes_supabase.sql.") };
  }
  return res;
}

/** Campos de moeda para gravar na transação (só quando não é real). */
const camposMoeda = (p: any) =>
  p && p.moeda && !ehReal(p.moeda) && Number(p.valor_original) > 0
    ? { moeda: String(p.moeda).toUpperCase(), valor_original: Number(p.valor_original), cotacao: Number(p.cotacao) || null }
    : {};

/** Saldo de uma conta convertido para reais (cotação de hoje). */
const saldoEmReais = (c: any) => Number(c?.saldo_reais ?? (ehReal(c?.moeda) ? c?.saldo_atual : 0) ?? 0);

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
      const [txData, movData] = await Promise.all([
        buscarTodasPaginas<any>((de, ate) => supabase
          .from("transacoes")
          .select("valor, tipo, considerar_soma")
          .eq("usuario_id", usuario_id)
          .gte("data", startDate)
          .lte("data", endDate)
          .order("id")
          .range(de, ate)),
        buscarTodasPaginas<any>((de, ate) => supabase
          .from("movimentacoes")
          .select("valor, tipo, transacoes(tipo)")
          .eq("usuario_id", usuario_id)
          .gte("data", startDate)
          .lte("data", endDate)
          .order("id")
          .range(de, ate))
      ]);
      const txRes = { data: txData };
      const movRes = { data: movData };

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
    // Conta em outra moeda: valor em reais + valor digitado na moeda da conta
    const extrasMoeda = camposMoeda(payload);
    const valorNaConta = Number(payload.valor_original) > 0 && payload.moeda && !ehReal(payload.moeda) ? Number(payload.valor_original) : undefined;

    const numericValue = parseFloat(valor);

    try {
      if (tipo === "TRANSFERENCIA") {
        // Transferência = 1 transacao + 2 movimentações (Saída na Origem e Entrada no Destino)
        const { data: tx, error: txError } = await supabase
          .from("transacoes")
          .insert([{
            usuario_id,
            tipo: "TRANSFERENCIA",
            descricao,
            valor: numericValue,
            data,
            conta_id: conta_id || null,
            observacao,
            ...extrasMoeda,
            status: "confirmada",
            documento_importado_id: payload.documento_importado_id || null
          }]).select().single();
        if (txError) throw txError;

        // Movimentação de Saída da Origem
        if (conta_id) {
          await inserirMovimentacoes([{
            usuario_id,
            transacao_id: tx.id,
            conta_id,
            tipo: "SAIDA",
            valor: numericValue,
            valor_na_conta: payload.valor_origem_na_conta ?? valorNaConta,
            data
          }]);
        }

        // Movimentação de Entrada no Destino
        if (conta_destino_id) {
          await inserirMovimentacoes([{
            usuario_id,
            transacao_id: tx.id,
            conta_id: conta_destino_id,
            tipo: "ENTRADA",
            valor: numericValue,
            valor_na_conta: payload.valor_destino_na_conta,
            data
          }]);
        }

        // Registrar também nas transferencias table para histórico e conciliação
        if (conta_id && conta_destino_id) {
          await supabase.from("transferencias").insert([{
            usuario_id,
            conta_origem_id: conta_id,
            conta_destino_id,
            valor: numericValue,
            data,
            observacao: observacao || descricao,
            transacao_id: tx.id
          }]);
        }

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
            status: "confirmada",
            ...extrasMoeda
          }]).select().single();
        if (txError) throw txError;

        await inserirMovimentacoes([{
          usuario_id,
          transacao_id: tx.id,
          conta_id,
          tipo: "ENTRADA",
          valor: numericValue,
          valor_na_conta: valorNaConta,
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
              status: "confirmada",
              ...extrasMoeda
            }]).select().single();
          if (txError) throw txError;

          await inserirMovimentacoes([{
            usuario_id,
            transacao_id: tx.id,
            conta_id,
            tipo: "SAIDA",
            valor: numericValue,
            valor_na_conta: valorNaConta,
            data
          }]);
          return tx;
        }

        if (forma_pagamento === "CARTAO") {
            // Compra parcelada: cada parcela entra no mês correspondente (mesma regra do addGasto)
            const numParcelas = parseInt(String(parcelas ?? "1"), 10) || 1;
            if (numParcelas > 1) {
              return this.addGasto(usuario_id, {
                descricao,
                valor: numericValue,
                data,
                categoria_id,
                metodo_pagamento: "Crédito",
                cartao_id,
                parcelas: String(numParcelas),
                parcela_atual: 1,
              });
            }

            // À vista no cartão: a fatura do ciclo é montada por syncCardFaturas
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

  /**
   * Faturas antigas que a pessoa já pagou no banco, mas o pagamento não foi registrado no app
   * (ex.: extrato do banco não importado). Marca como paga pelo valor total; nada é apagado.
   */
  async marcarFaturasComoPagas(usuario_id: string, faturaIds: string[]) {
    const { data: faturas, error } = await supabase
      .from("faturas")
      .select("id, cartao_id, valor_total, valor_pago, data_vencimento")
      .eq("usuario_id", usuario_id)
      .in("id", faturaIds);
    if (error) throw error;
    let n = 0;
    for (const f of faturas || []) {
      const falta = Math.round((Number(f.valor_total || 0) - Number(f.valor_pago || 0)) * 100) / 100;
      if (falta <= 0.009) continue;
      // Pagamento registrado no dia do vencimento, sem conta (o saldo das contas não muda;
      // se o extrato do banco com esse pagamento for importado depois, conta uma vez só)
      const { error: errTx } = await supabase.from("transacoes").insert([{
        usuario_id,
        tipo: "PAGAMENTO_FATURA",
        descricao: "Pagamento de fatura (marcado como pago)",
        valor: falta,
        data: f.data_vencimento,
        cartao_id: f.cartao_id,
        fatura_id: f.id,
        status: "confirmada",
        observacao: "Marcado como pago pelo usuário",
      }]);
      if (errTx) throw errTx;
      await supabase.from("faturas").update({ status: "paga", valor_pago: Number(f.valor_total || 0) }).eq("id", f.id).eq("usuario_id", usuario_id);
      n++;
    }
    return n;
  },

  /**
   * Transferência lançada por engano que na verdade foi uma ENTRADA (ex.: pró-labore/salário
   * vindo da conta do CNPJ). Só muda o tipo e a categoria da transação; as movimentações
   * (o dinheiro que entrou na conta) continuam iguais, então o saldo não muda.
   */
  async reclassificarTransferenciaComoEntrada(usuario_id: string, transacao_id: string, categoriaNome: string) {
    const nome = (categoriaNome || "Salário").trim();
    let { data: cat } = await supabase
      .from("categorias")
      .select("id")
      .eq("usuario_id", usuario_id)
      .eq("tipo", "RECEITA")
      .ilike("nome", nome)
      .limit(1)
      .maybeSingle();
    if (!cat) {
      const { data: nova, error: errCat } = await supabase
        .from("categorias")
        .insert([{ usuario_id, nome, tipo: "RECEITA", ativa: true }])
        .select("id")
        .single();
      if (errCat) throw errCat;
      cat = nova;
    }
    const { data, error } = await supabase
      .from("transacoes")
      .update({ tipo: "RECEITA", categoria_id: cat!.id, considerar_soma: true })
      .eq("id", transacao_id)
      .eq("usuario_id", usuario_id)
      .eq("tipo", "TRANSFERENCIA")
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Essa transferência não foi encontrada (talvez já tenha sido alterada).");
    return data;
  },

  /**
   * Ajusta o saldo da conta para bater com o banco: muda só o saldo inicial
   * (diferença entre o saldo real e o calculado). Nenhuma movimentação é alterada.
   */
  async ajustarSaldoConta(usuario_id: string, conta_id: string, saldoReal: number) {
    const contas = await this.getContasBancarias(usuario_id);
    const conta = contas.find((c: any) => c.id === conta_id);
    if (!conta) throw new Error("Conta não encontrada.");
    const diferenca = Math.round((Number(saldoReal) - Number(conta.saldo_atual || 0)) * 100) / 100;
    if (Math.abs(diferenca) < 0.005) return conta;
    const novoInicial = Math.round((Number(conta.saldo_inicial || 0) + diferenca) * 100) / 100;
    const { error } = await supabase
      .from("contas_bancarias")
      .update({ saldo_inicial: novoInicial })
      .eq("id", conta_id)
      .eq("usuario_id", usuario_id);
    if (error) throw error;
    return { ...conta, saldo_inicial: novoInicial, saldo_atual: Number(saldoReal) };
  },

  async getContasBancarias(usuario_id: string) {
    const { data: contas, error } = await supabase.from("contas_bancarias").select("*").eq("usuario_id", usuario_id).order("nome");
    if (error) throw error;

    // Todas as movimentações (paginado: o Supabase limita 1000 linhas por consulta).
    // `moeda` (SQL seção 11) diz em qual saldo da conta ela caiu; sem a coluna, tudo é da moeda principal.
    type Mov = { conta_id: string; valor: number; tipo: string; moeda?: string | null };
    const carregar = (colunas: string) =>
      buscarTodasPaginas<Mov>((de, ate) =>
        supabase.from("movimentacoes").select(colunas).eq("usuario_id", usuario_id).order("id").range(de, ate) as any
      );
    let movimentacoes: Mov[];
    try {
      movimentacoes = await carregar("conta_id, valor, tipo, moeda");
    } catch {
      movimentacoes = await carregar("conta_id, valor, tipo");
    }

    const contasList = contas || [];
    const movs = movimentacoes || [];
    const centavos = (v: number) => Math.round(v * 100) / 100;

    // Saldo por moeda: saldo_inicial (moeda principal) + entradas - saídas de cada moeda
    const saldosPorConta = new Map<string, Record<string, number>>();
    for (const conta of contasList) {
      const principal = String(conta.moeda || "BRL").toUpperCase();
      saldosPorConta.set(conta.id, { [principal]: Number(conta.saldo_inicial || 0) });
    }
    const principalDe = new Map(contasList.map((c: any) => [c.id, String(c.moeda || "BRL").toUpperCase()]));
    for (const m of movs) {
      const saldos = saldosPorConta.get(m.conta_id);
      if (!saldos) continue;
      const moeda = String(m.moeda || principalDe.get(m.conta_id) || "BRL").toUpperCase();
      const v = Number(m.valor) || 0;
      saldos[moeda] = (saldos[moeda] || 0) + (m.tipo === "ENTRADA" ? v : m.tipo === "SAIDA" ? -v : 0);
    }

    // Cotação de hoje para cada moeda estrangeira em uso (uma busca por moeda)
    const moedas = [...new Set([...saldosPorConta.values()].flatMap((s) => Object.keys(s)).filter((m) => !ehReal(m)))];
    const cotacoes: Record<string, number | null> = {};
    await Promise.all(moedas.map(async (m) => (cotacoes[m] = await moedaService.cotacao(m).catch(() => null))));
    const cotacaoDe = (m: string) => (ehReal(m) ? 1 : cotacoes[m] ?? null);

    return contasList.map(conta => {
      const moeda = String(conta.moeda || "BRL").toUpperCase();
      const saldos = saldosPorConta.get(conta.id) || { [moeda]: 0 };
      const saldo = centavos(saldos[moeda] || 0);
      // Outras moedas guardadas na mesma conta (ex.: Wise em reais com saldo em CAD)
      const outras_moedas = Object.entries(saldos)
        .filter(([m, v]) => m !== moeda && Math.abs(v) >= 0.005)
        .map(([m, v]) => {
          const cot = cotacaoDe(m);
          return { moeda: m, valor: centavos(v), cotacao_hoje: cot, reais: cot ? centavos(v * cot) : null };
        });
      const cot = cotacaoDe(moeda);
      // saldo_atual: só a moeda principal · saldo_reais: a conta inteira (todas as moedas) em reais
      const saldo_reais = cot ? centavos(saldo * cot + outras_moedas.reduce((s, o) => s + (o.reais ?? 0), 0)) : null;
      return { ...conta, moeda, saldo_atual: saldo, cotacao_hoje: cot, outras_moedas, saldo_reais };
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
    return buscarTodasPaginas<any>((de, ate) => supabase
      .from("transacoes")
      .select("*")
      .eq("usuario_id", usuario_id)
      .eq("tipo", "DESPESA")
      .not("cartao_id", "is", null)
      .order("id")
      .range(de, ate));
  },

  /**
   * BUSCA PAGAMENTOS PARA LIBERAÇÃO DE LIMITE
   */
  async getPagamentosFaturas(usuario_id: string) {
    await this.autoSyncPagamentosCartaoComTransacoes(usuario_id);
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
    // Datas/períodos ("Período: 03/09 a 02/10") não contam como parcela — ver packages/utils/parcelas.ts
    const parcelaLida = lerParcelaDaDescricao(rawDesc, { exigirPalavra: form.metodo_pagamento !== "Crédito" });
    const parcelaDetectada = parcelaLida ? parcelaLida.atual : 1;
    const totalDetectado = parcelaLida ? parcelaLida.total : 1;

    const limparDescricao = (descricao: string) => descricaoSemParcela(descricao);

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
        await inserirMovimentacoes([{
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

    // 🔍 BUSCA CATEGORIA ID (Mapeamento Gradual) — aceita o id direto quando já conhecido
    let categoria_id = form.categoria_id || null;
    if (!categoria_id && form.categoria) {
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
    // A última parcela absorve a diferença de centavos (ex.: R$ 100 em 3x = 33,33 + 33,33 + 33,34)
    const valorDaParcela = (i: number) =>
      form.valor_ja_dividido || numParcelas <= 1 || i < numParcelas
        ? valorParcelaAtual
        : Math.round((valorNumerico - valorParcelaAtual * (numParcelas - 1)) * 100) / 100;
    const valorDestaParcela = valorDaParcela(currentParcelaInput);

    // 1. 💸 REGISTRA A TRANSAÇÃO NA TABELA `transacoes` (Deduplicação defensiva)
    let transacao: any = null;
    let { data: existingTx } = await supabase
      .from("transacoes")
      .select("*")
      .eq("usuario_id", usuario_id)
      .eq("data", form.data)
      .eq("valor", valorDestaParcela)
      .eq("cartao_id", isCredito ? form.cartao_id : null)
      .ilike("descricao", `%${descricaoLimpa}%`)
      .maybeSingle();

    // Se não achou por data exata, mas for parcelamento, busca se já existia pré-criada para esta mesma parcela
    if (!existingTx && numParcelas > 1) {
      // Tolerância de centavos: a fatura real pode diferir da parcela estimada (ex.: 63,60 × 63,63)
      const tolerancia = Math.max(0.1, valorDestaParcela * 0.02);
      const { data: pendingParcTxs } = await supabase
        .from("transacoes")
        .select("*")
        .eq("usuario_id", usuario_id)
        .eq("cartao_id", isCredito ? form.cartao_id : null)
        .gte("valor", Math.round((valorDestaParcela - tolerancia) * 100) / 100)
        .lte("valor", Math.round((valorDestaParcela + tolerancia) * 100) / 100)
        .ilike("descricao", `%${descricaoLimpa}%`)
        .ilike("descricao", `%${currentParcelaInput}/${numParcelas}%`)
        .limit(1);
      const pendingParcTx = (pendingParcTxs || [])[0];

      if (pendingParcTx) {
        existingTx = pendingParcTx;
        // Vale o valor da fatura real
        if (Math.abs(Number(pendingParcTx.valor) - valorDestaParcela) > 0.004) {
          await supabase.from("transacoes").update({ valor: valorDestaParcela }).eq("id", pendingParcTx.id).eq("usuario_id", usuario_id);
          existingTx.valor = valorDestaParcela;
        }
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
          valor: valorDestaParcela,
          data: form.data,
          cartao_id: isCredito ? form.cartao_id : null,
          conta_id: isCredito ? null : form.conta_id,
          categoria_id,
          documento_importado_id: form.documento_importado_id || null,
          status: "confirmada",
          considerar_soma: form.considerar_soma !== undefined ? form.considerar_soma : true,
          observacao: `Classificação: ${form.classificacao || 'Variável'} | Tipo: ${form.tipo || 'Essencial'} | Parcela: ${currentParcelaInput}/${numParcelas} | Terceiro: ${form.terceiro || false}`,
          ...(isCredito ? {} : camposMoeda(form)),
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
              .eq("valor", valorDaParcela(i))
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
                  valor: valorDaParcela(i),
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
                  valor: valorDaParcela(i),
                  data_vencimento: isCurrent ? form.data : targetParcela.data_vencimento || dataParcelaStr
                })
                .eq("id", targetParcela.id);
            } else {
              await supabase.from("parcelas").insert([{
                usuario_id,
                parcelamento_id: parcelamento.id,
                transacao_id: txIdForParcela,
                numero_parcela: i,
                valor: valorDaParcela(i),
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
      const { error: errMov } = await inserirMovimentacoes([{
        usuario_id,
        transacao_id: transacao.id,
        conta_id: form.conta_id,
        // estorno/devolução na conta é dinheiro voltando
        tipo: transacao.tipo === 'ESTORNO' ? 'ENTRADA' : 'SAIDA',
        valor: valorDestaParcela,
        // extrato em outra moeda: sai do saldo daquela moeda, no valor exato do extrato
        moeda: form.moeda_mov || undefined,
        valor_na_conta: Number(form.valor_original) > 0 ? Number(form.valor_original) : undefined,
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
    const { error: errMovs } = await inserirMovimentacoes([
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
      await inserirMovimentacoes([{
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
      return (contas || []).reduce((acc: number, c: any) => acc + saldoEmReais(c), 0);
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
      const totalContas = (contas || []).reduce((acc: number, c: any) => acc + saldoEmReais(c), 0);

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
      await inserirMovimentacoes([{
        usuario_id,
        transacao_id: tx.id,
        conta_id: params.conta_id,
        tipo: "SAIDA",
        valor,
        data: params.data
      }]);
    }

    // 3. Caixinha do banco: o saldo é montado pelas aplicações/resgates da conta (caixinhas.service)
    if (params.titulo_investimento && !params.meta_id) {
      this.syncMetasInvestimentos(usuario_id).catch(() => {});
      return tx;
    }

    // 3. Atualizar ou criar Investimento correspondente
    const produto = detectarProdutoInvestimento(params.descricao || "");
    const titulo = params.titulo_investimento ||
      (produto ? `${produto}${params.instituicao ? ` ${params.instituicao}` : ""}` : "Aplicação");
    
    const { data: invs } = await supabase
      .from("investimentos")
      .select("*")
      .eq("usuario_id", usuario_id);

    // Caixinha do banco (ex.: "Caixinha Inter"): uma por banco, achada pelo nome.
    // Senão: 1º investimento vinculado à mesma meta; 2º mesmo produto (ex.: CDB) sem vínculo conflitante
    const caixinhaDoBanco = params.titulo_investimento && !params.meta_id
      ? (invs || []).find((inv: any) => (inv.titulo || "").trim().toLowerCase() === params.titulo_investimento!.trim().toLowerCase())
      : undefined;
    let targetInv = params.titulo_investimento && !params.meta_id
      ? caixinhaDoBanco
      : encontrarInvestimento(invs || [], params.meta_id, produto, params.instituicao);

    if (targetInv) {
      const novoInvestido = Number(targetInv.valor_investido || 0) + valor;
      const novoAtual = Number(targetInv.valor_atual || 0) + valor;
      const updateData: any = {
        valor_investido: novoInvestido,
        valor_atual: novoAtual
      };
      if (params.meta_id && (!targetInv.corretora || !targetInv.corretora.includes(params.meta_id))) {
        const baseCorretora = targetInv.corretora?.replace(/\[Meta:\s*[^\]]+\]/, '').trim() || params.instituicao || "";
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
      const corretoraTag = params.meta_id ? `[Meta: ${params.meta_id}] ${params.instituicao || ""}`.trim() : (params.instituicao || null);
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
    titulo_investimento?: string | null;
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
      await inserirMovimentacoes([{
        usuario_id,
        transacao_id: tx.id,
        conta_id: params.conta_id,
        tipo: "ENTRADA",
        valor,
        data: params.data
      }]);
    }

    // 3. Caixinha do banco: recalculada pelas aplicações/resgates da conta (caixinhas.service)
    if (params.titulo_investimento && !params.meta_id) {
      this.syncMetasInvestimentos(usuario_id).catch(() => {});
      return tx;
    }

    // 3. Atualizar Investimento reduzindo o saldo
    const { data: invs } = await supabase
      .from("investimentos")
      .select("*")
      .eq("usuario_id", usuario_id);

    // Mesma regra do aporte. Com vários investimentos e nenhum correspondente, não abate de um aleatório.
    const produtoResgate = detectarProdutoInvestimento(params.descricao || "");
    const caixinhaDoBanco = params.titulo_investimento && !params.meta_id
      ? (invs || []).find((inv: any) => (inv.titulo || "").trim().toLowerCase() === params.titulo_investimento!.trim().toLowerCase())
      : undefined;
    let targetInv = caixinhaDoBanco
      || encontrarInvestimento(invs || [], params.meta_id, produtoResgate, params.instituicao)
      || ((invs || []).length === 1 ? invs![0] : undefined);

    if (targetInv) {
      const novoAtual = Math.max(0, Number(targetInv.valor_atual || 0) - valor);
      const principalBaixa = params.principal ? Math.min(Number(targetInv.valor_investido || 0), params.principal) : Math.min(Number(targetInv.valor_investido || 0), valor);
      const novoInvestido = Math.max(0, Number(targetInv.valor_investido || 0) - principalBaixa);

      const updateData: any = {
        valor_investido: novoInvestido,
        valor_atual: novoAtual
      };
      if (params.meta_id && (!targetInv.corretora || !targetInv.corretora.includes(params.meta_id))) {
        const baseCorretora = targetInv.corretora?.replace(/\[Meta:\s*[^\]]+\]/, '').trim() || params.instituicao || "";
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
    // Caixinhas por banco e rendimento calculado (antes de olhar as metas)
    await sincronizarCaixinhas(usuario_id).catch((e) => console.warn("Caixinhas:", e));
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
      const txRdb = txs.filter(t =>
        t.tipo === "APORTE" || t.tipo === "RESGATE" ||
        ehAplicacaoInvestimento(t.descricao || "") || ehResgateInvestimento(t.descricao || "")
      );

      if (txRdb.length === 0) return;

      const totalAportes = txRdb.filter(t => t.tipo === "APORTE" || (t.descricao || "").toLowerCase().includes("aplica")).reduce((acc, cur) => acc + Number(cur.valor || 0), 0);
      const totalResgates = txRdb.filter(t => t.tipo === "RESGATE" || (t.descricao || "").toLowerCase().includes("resgate")).reduce((acc, cur) => acc + Number(cur.valor || 0), 0);
      const saldoCalculado = Math.max(0, totalAportes - totalResgates);

      // Localiza investimento de RDB
      // Vínculo escolhido pelo usuário tem prioridade; só sugere vínculo para investimento SEM meta
      // Caixinhas por banco ("Caixinha Inter", "Caixinha Nubank") são independentes: nunca entram aqui
      const ehCaixinhaDeBanco = (inv: any) => /^caixinha\s+\S/i.test((inv.titulo || "").trim());
      if (invs.some(ehCaixinhaDeBanco) && !invs.some((inv: any) => metaIdDoInvestimento(inv.corretora) === metaReserva.id)) return;
      let targetInv = invs.find((inv: any) => metaIdDoInvestimento(inv.corretora) === metaReserva.id)
        || invs.find((inv: any) => !metaIdDoInvestimento(inv.corretora) && !ehCaixinhaDeBanco(inv) && /rdb|reserva|caixinha/i.test(inv.titulo || ""));

      // Preserva a instituição já registrada no investimento (sem assumir banco)
      const baseCorretora = targetInv?.corretora?.replace(/\[Meta:\s*[^\]]+\]/, '').trim() || "";
      const corretoraTag = `[Meta: ${metaReserva.id}] ${baseCorretora}`.trim();

      if (targetInv) {
        const needsCorretoraFix = !metaIdDoInvestimento(targetInv.corretora);
        // (com caixinhas por banco, o total de aplicações não é desta reserva: não sobrescreve o valor)
        const needsValorFix = Number(targetInv.valor_atual || 0) === 0 && saldoCalculado > 0 && !invs.some(ehCaixinhaDeBanco);
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
          titulo: "Reserva (RDB / Caixinha)",
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

    // Se cartao_id não foi informado (ex: extrato bancário de pagamento de fatura), tenta inferir
    let targetCartaoId = params.cartao_id;
    if (!targetCartaoId) {
      const { data: cards } = await supabase.from("cartoes").select("*").eq("usuario_id", usuario_id);
      if (cards && cards.length > 0) {
        const descLower = (params.descricao || "").toLowerCase();
        let matched = cards.find(c => descLower.includes((c.nome || "").toLowerCase()));
        if (!matched && params.conta_id) {
          const { data: conta } = await supabase.from("contas_bancarias").select("nome").eq("id", params.conta_id).maybeSingle();
          if (conta) {
            const contaLower = (conta.nome || "").toLowerCase();
            matched = cards.find(c => (c.nome || "").toLowerCase().includes(contaLower) || contaLower.includes((c.nome || "").toLowerCase()));
          }
        }
        if (!matched && cards.length === 1) {
          matched = cards[0];
        }
        if (matched) {
          targetCartaoId = matched.id;
        }
      }
    }

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
        cartao_id: targetCartaoId || null,
        fatura_id: params.fatura_id || null,
        documento_importado_id: params.documento_importado_id || null,
        status: "confirmada"
      }])
      .select()
      .single();

    if (txErr) throw txErr;

    // 2. Movimentação de SAÍDA na conta bancária (Fluxo de caixa real)
    if (params.conta_id && tx) {
      await inserirMovimentacoes([{
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
    if (!targetFaturaId && targetCartaoId) {
      const { data: faturas } = await supabase
        .from("faturas")
        .select("id, data_vencimento, data_fechamento, valor_total, valor_pago, status")
        .eq("usuario_id", usuario_id)
        .eq("cartao_id", targetCartaoId)
        .order("data_vencimento", { ascending: false });

      if (faturas && faturas.length > 0) {
        // A fatura paga é a que já tinha fechado na data do pagamento (a mais recente delas)
        const fechadas = faturas.filter(f => String(f.data_fechamento || "") < String(params.data));
        const alvo = fechadas.find(f => f.status !== "paga") || fechadas[0] || faturas[faturas.length - 1];
        targetFaturaId = alvo?.id;
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

    // 4. Se houver dívida de renegociação associada ao cartão/banco, abater a parcela correspondente
    try {
      const { data: dividasReneg } = await supabase
        .from("dividas")
        .select("id, descricao, valor_atual, parcelas_divida(*)")
        .eq("usuario_id", usuario_id)
        .eq("tipo", "renegociacao_cartao")
        .eq("status", "ativa");

      if (dividasReneg && dividasReneg.length > 0) {
        for (const reneg of dividasReneg) {
          const parcelas = (reneg.parcelas_divida || []).sort((a: any, b: any) => a.numero_parcela - b.numero_parcela);
          const pendentes = parcelas.filter((p: any) => p.status === "pendente");
          if (pendentes.length > 0) {
            // Verifica se o valor pago é compatível com a parcela da renegociação ou cobre ela
            const proxParcela = pendentes[0];
            const pValor = Number(proxParcela.valor_esperado || 0);
            if (valor >= pValor * 0.95 || Math.abs(valor - pValor) <= 10.0) {
              await supabase
                .from("parcelas_divida")
                .update({ status: "paga" })
                .eq("id", proxParcela.id);

              await supabase.from("pagamentos_divida").insert([{
                divida_id: reneg.id,
                parcela_id: proxParcela.id,
                transacao_id: tx.id,
                valor_pago: Math.min(valor, pValor),
                data_pagamento: params.data,
                tipo_pagamento: "parcela"
              }]);

              // Abate valor_atual da dívida
              const novoSaldo = Math.max(0, Number(reneg.valor_atual || 0) - pValor);
              const restamOutras = pendentes.length > 1;
              await supabase
                .from("dividas")
                .update({
                  valor_atual: novoSaldo,
                  status: restamOutras ? "ativa" : "quitada"
                })
                .eq("id", reneg.id);
            }
          }
        }
      }
    } catch (e) {
      console.warn("Aviso ao conciliar pagamento de fatura com renegociação de cartão:", e);
    }

    return tx;
  },

  async getInvestimentos(usuario_id: string) {
    const { data, error } = await supabase.from("investimentos").select("*").eq("usuario_id", usuario_id).order("titulo");
    if (error) throw error;
    return data;
  },

  async addInvestimento(usuario_id: string, dados: any) {
    return salvarInvestimento(() => supabase.from("investimentos"), dados, (payload, q) =>
      q.insert([{ ...payload, usuario_id }]).select()
    );
  },

  async updateInvestimento(usuario_id: string, id: string, dados: any) {
    return salvarInvestimento(() => supabase.from("investimentos"), dados, (payload, q) =>
      q.update(payload).eq("id", id).eq("usuario_id", usuario_id).select()
    );
  },

  /** Exclui o investimento e seu histórico de valores (ação explícita do usuário). */
  async deleteInvestimento(usuario_id: string, id: string) {
    const { data: inv, error: errBusca } = await supabase
      .from("investimentos").select("*").eq("id", id).eq("usuario_id", usuario_id).maybeSingle();
    if (errBusca) throw errBusca;
    if (!inv) throw new Error("Investimento não encontrado.");
    // Caixinha do banco apagada não deve ser recriada pelas aplicações da conta
    const contaCaixinha = await contaDaCaixinha(usuario_id, inv);
    if (contaCaixinha) await ocultarCaixinha(usuario_id, contaCaixinha);
    const { error: errHist } = await supabase.from("historico_investimentos").delete().eq("investimento_id", id);
    if (errHist) throw errHist;
    const { error } = await supabase.from("investimentos").delete().eq("id", id).eq("usuario_id", usuario_id);
    if (error) throw error;
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

  async updateMeta(usuario_id: string, id: string, dados: any) {
    const { error } = await supabase.from("metas").update(dados).eq("id", id).eq("usuario_id", usuario_id);
    if (error) throw error;
  },

  /**
   * Apaga a meta (ação explícita do usuário). Os investimentos/caixinhas ligados a ela
   * continuam existindo, só perdem o vínculo; os depósitos da meta são apagados junto.
   */
  async deleteMeta(usuario_id: string, id: string) {
    const { data: invs } = await supabase.from("investimentos").select("id, corretora").eq("usuario_id", usuario_id);
    for (const inv of invs || []) {
      if (metaIdDoInvestimento(inv.corretora) === id) {
        await supabase.from("investimentos").update({ corretora: corretoraComMeta(inv.corretora, null) }).eq("id", inv.id).eq("usuario_id", usuario_id);
      }
    }
    // metas_depositos não tem ON DELETE CASCADE: remove os depósitos da meta antes (usuário confirmou)
    const { error: errDep } = await supabase.from("metas_depositos").delete().eq("meta_id", id).eq("usuario_id", usuario_id);
    if (errDep) throw errDep;
    const { error } = await supabase.from("metas").delete().eq("id", id).eq("usuario_id", usuario_id);
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

  async autoSyncDividasComTransacoes(usuario_id: string) {
    try {
      // 1. Buscar dívidas ativas
      const { data: dividasAtivas, error } = await supabase
        .from("dividas")
        .select("*, parcelas_divida(*)")
        .eq("usuario_id", usuario_id)
        .neq("status", "quitada");

      if (error || !dividasAtivas || dividasAtivas.length === 0) return;

      // 2. Buscar APENAS transações de saída/despesa com débito de parcela
      const { data: txs } = await supabase
        .from("transacoes")
        .select("id, valor, data, descricao, conta_id, tipo")
        .eq("usuario_id", usuario_id)
        .in("tipo", ["DESPESA", "PAGAMENTO_DIVIDA"]);

      if (!txs || txs.length === 0) return;

      // Lançamento que já pagou uma parcela não serve para outra
      const { data: vinculados } = await supabase.from("pagamentos_divida").select("transacao_id");
      const jaUsadas = new Set((vinculados || []).map((v: any) => v.transacao_id));

      for (const divida of dividasAtivas) {
        const instLower = (divida.instituicao || "").toLowerCase();
        const descDividaLower = (divida.descricao || "").toLowerCase();

        const parcelas = (divida.parcelas_divida || []).sort((a: any, b: any) => a.numero_parcela - b.numero_parcela);
        const pendentes = parcelas.filter((p: any) => p.status === 'pendente');

        // Para cada parcela pendente, verificar se existe um débito correspondente próximo da data de vencimento
        for (const p of pendentes) {
          const matchingTx = txs.find(t => {
            if (jaUsadas.has(t.id)) return false;
            const tDesc = (t.descricao || "").toLowerCase();
            const tVal = Math.abs(Number(t.valor || 0));
            const pVal = Math.abs(Number(p.valor_esperado || 0));
            const valorCompativel = Math.abs(tVal - pVal) <= 5.0; // Tolerância de centavos/IOF

            const descMatches = (instLower && tDesc.includes(instLower) && (tDesc.includes("empr") || tDesc.includes("parcela") || tDesc.includes("finan"))) ||
                                (descDividaLower && tDesc.includes(descDividaLower));

            // Proximidade de data (dentro do mesmo mês de vencimento)
            const tMes = (t.data || "").substring(0, 7);
            const pMes = (p.data_vencimento || "").substring(0, 7);
            const dataProxima = tMes === pMes;

            return valorCompativel && descMatches && dataProxima;
          });

          if (matchingTx) {
            jaUsadas.add(matchingTx.id);
            // Marcar APENAS essa parcela como paga
            await supabase
              .from("parcelas_divida")
              .update({ status: 'paga' })
              .eq("id", p.id);
            await this.gravarDadosPagamentoParcela(p.id, matchingTx.data, Math.abs(Number(matchingTx.valor)));

            // Registrar pagamento
            const { data: jaExiste } = await supabase
              .from("pagamentos_divida")
              .select("id")
              .eq("transacao_id", matchingTx.id)
              .maybeSingle();

            if (!jaExiste) {
              await supabase.from("pagamentos_divida").insert([{
                divida_id: divida.id,
                parcela_id: p.id,
                transacao_id: matchingTx.id,
                valor_pago: Math.abs(Number(matchingTx.valor)),
                data_pagamento: matchingTx.data,
                tipo_pagamento: 'parcela'
              }]);
            }
          }
        }

        // Atualizar saldo devedor da dívida com base nas parcelas restantes
        const { data: parcelasAtualizadas } = await supabase
          .from("parcelas_divida")
          .select("valor_esperado, status")
          .eq("divida_id", divida.id);

        if (parcelasAtualizadas && parcelasAtualizadas.length > 0) {
          const restamPendentes = parcelasAtualizadas.filter(p => p.status === 'pendente');
          if (restamPendentes.length === 0) {
            // Apenas se TODAS as parcelas forem pagas individualmente
            await supabase
              .from("dividas")
              .update({ status: 'quitada', valor_atual: 0 })
              .eq("id", divida.id);
          } else {
            const novoSaldo = restamPendentes.reduce((acc, curr) => acc + Number(curr.valor_esperado || 0), 0);
            await supabase
              .from("dividas")
              .update({ status: 'ativa', valor_atual: novoSaldo })
              .eq("id", divida.id);
          }
        }
      }
    } catch (e) {
      console.warn("Aviso na sincronização automática de dívidas com extrato:", e);
    }
  },

  async getDividas(usuario_id: string) {
    await this.autoSyncDividasComTransacoes(usuario_id);

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
    await inserirMovimentacoes([{
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

  /** Grava quando e quanto foi pago na parcela (SQL seção 17). Sem as colunas, segue só com o status. */
  async gravarDadosPagamentoParcela(parcela_id: string, data_pagamento: string | null, valor_pago: number | null) {
    const { error } = await supabase
      .from("parcelas_divida")
      .update({ data_pagamento, valor_pago })
      .eq("id", parcela_id);
    if (error && !/data_pagamento|valor_pago|column|schema cache/i.test(error.message || "")) throw error;
  },

  /** Falta pagar = soma das parcelas em aberto; sem nenhuma em aberto, a dívida fica quitada. */
  async recalcularDivida(divida_id: string) {
    const { data: parcelas } = await supabase.from("parcelas_divida").select("valor_esperado, status").eq("divida_id", divida_id);
    if (!parcelas || parcelas.length === 0) return;
    const abertas = parcelas.filter((p: any) => p.status !== "paga");
    const falta = Math.round(abertas.reduce((acc: number, p: any) => acc + Number(p.valor_esperado || 0), 0) * 100) / 100;
    await supabase
      .from("dividas")
      .update(abertas.length ? { status: "ativa", valor_atual: falta } : { status: "quitada", valor_atual: 0 })
      .eq("id", divida_id);
  },

  /**
   * Registra o pagamento de uma parcela com a data e o valor de verdade
   * (adiantamento costuma sair antes do vencimento e com desconto).
   *  - debitar = true  → lança a saída na conta agora;
   *  - debitar = false → o dinheiro já saiu (está no extrato): só dá baixa, e vincula ao lançamento se informado.
   */
  async registrarPagamentoParcela(
    usuario_id: string,
    p: { divida_id: string; parcela_id: string; valor_pago: number; data_pagamento: string; debitar: boolean; conta_id?: string | null; transacao_id?: string | null }
  ) {
    if (p.debitar) {
      if (!p.conta_id) throw new Error("Escolha a conta de onde saiu o dinheiro.");
      await this.pagarParcelaDivida(usuario_id, p.parcela_id, p.divida_id, p.valor_pago, p.conta_id, p.data_pagamento);
    } else {
      await supabase.from("parcelas_divida").update({ status: "paga" }).eq("id", p.parcela_id);
      if (p.transacao_id) {
        const { data: ja } = await supabase.from("pagamentos_divida").select("id").eq("transacao_id", p.transacao_id).maybeSingle();
        if (!ja) {
          await supabase.from("pagamentos_divida").insert([{
            divida_id: p.divida_id,
            parcela_id: p.parcela_id,
            transacao_id: p.transacao_id,
            valor_pago: p.valor_pago,
            data_pagamento: p.data_pagamento,
            tipo_pagamento: "parcela",
          }]);
        }
      }
    }
    await this.gravarDadosPagamentoParcela(p.parcela_id, p.data_pagamento, p.valor_pago);
    await this.recalcularDivida(p.divida_id);
  },

  /** Corrige a data/valor de uma parcela já paga (e do vínculo com o lançamento, se houver). */
  async editarPagamentoParcela(parcela_id: string, data_pagamento: string, valor_pago: number) {
    await this.gravarDadosPagamentoParcela(parcela_id, data_pagamento, valor_pago);
    await supabase.from("pagamentos_divida").update({ data_pagamento, valor_pago }).eq("parcela_id", parcela_id);
  },

  /** "Paguei até a parcela N": dá baixa em todas as parcelas em aberto até ela (sem lançar dinheiro). */
  async marcarParcelasPagasAte(divida_id: string, numero_parcela: number) {
    const { error } = await supabase
      .from("parcelas_divida")
      .update({ status: "paga" })
      .eq("divida_id", divida_id)
      .lte("numero_parcela", numero_parcela)
      .neq("status", "paga");
    if (error) throw error;
    await this.recalcularDivida(divida_id);
  },

  /**
   * Débito de empréstimo vindo do extrato: liga o lançamento à parcela (a escolhida ou a
   * próxima em aberto — pagamento adiantado baixa a parcela mais antiga que falta).
   */
  async vincularPagamentoDivida(
    usuario_id: string,
    p: { transacao_id: string; divida_id: string; parcela_id?: string | null; valor: number; data: string }
  ) {
    const { data: ja } = await supabase.from("pagamentos_divida").select("id, parcela_id").eq("transacao_id", p.transacao_id).maybeSingle();
    if (ja) return ja.parcela_id || null;

    let parcelaId = p.parcela_id || null;
    // 1º: parcela já marcada como paga mas sem registro de quando/quanto (ex.: "paguei até jan/27"),
    //     a partir do mês do pagamento — o débito do extrato é o comprovante dela.
    if (!parcelaId) {
      const { data: semRegistro, error: errSem } = await supabase
        .from("parcelas_divida")
        .select("id, data_vencimento")
        .eq("divida_id", p.divida_id)
        .eq("status", "paga")
        .is("data_pagamento", null)
        .gte("data_vencimento", `${p.data.slice(0, 7)}-01`)
        .order("numero_parcela", { ascending: true });
      if (!errSem && semRegistro?.length) {
        const { data: ligadas } = await supabase.from("pagamentos_divida").select("parcela_id").eq("divida_id", p.divida_id);
        const comPagamento = new Set((ligadas || []).map((l: any) => l.parcela_id));
        parcelaId = semRegistro.find((x: any) => !comPagamento.has(x.id))?.id || null;
      }
    }
    // 2º: a próxima parcela em aberto (adiantamento baixa a mais antiga que falta)
    if (!parcelaId) {
      const { data: abertas } = await supabase
        .from("parcelas_divida")
        .select("id")
        .eq("divida_id", p.divida_id)
        .neq("status", "paga")
        .order("numero_parcela", { ascending: true })
        .limit(1);
      parcelaId = abertas?.[0]?.id || null;
    }

    await supabase.from("pagamentos_divida").insert([{
      divida_id: p.divida_id,
      parcela_id: parcelaId,
      transacao_id: p.transacao_id,
      valor_pago: p.valor,
      data_pagamento: p.data,
      tipo_pagamento: parcelaId ? "parcela" : "amortizacao",
    }]);
    if (parcelaId) {
      await supabase.from("parcelas_divida").update({ status: "paga" }).eq("id", parcelaId);
      await this.gravarDadosPagamentoParcela(parcelaId, p.data, p.valor);
    }
    await this.recalcularDivida(p.divida_id);
    return parcelaId;
  },

  async quitarDividaManual(divida_id: string, marcarParcelasComoPagas: boolean = true) {
    if (marcarParcelasComoPagas) {
      await supabase
        .from("parcelas_divida")
        .update({ status: 'paga' })
        .eq("divida_id", divida_id);
    }
    const { error } = await supabase
      .from("dividas")
      .update({ status: 'quitada', valor_atual: 0 })
      .eq("id", divida_id);
    if (error) throw error;
  },

  async reabrirDivida(divida_id: string) {
    const { error } = await supabase
      .from("dividas")
      .update({ status: 'ativa' })
      .eq("id", divida_id);
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
    // Voltou para "em aberto": some a data/valor pagos
    if (novoStatus === 'pendente') await this.gravarDadosPagamentoParcela(parcela_id, null, null);
    await this.recalcularDivida(divida_id);
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
          await inserirMovimentacoes([{
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
              // Cobrança opcional recusada pela outra pessoa não conta como a receber
              if (meta?.resposta_cobranca === "recusada") valorDevido = 0;
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

  /** Marca/desmarca uma cobrança como opcional (a outra pessoa poderá recusar). */
  async definirCobrancaOpcional(gasto: { id: string; observacao?: string | null }, opcional: boolean) {
    let meta: Record<string, any> = {};
    const obs = (gasto.observacao || "").trim();
    if (obs.startsWith("{")) {
      try {
        meta = JSON.parse(obs);
      } catch {
        meta = { observacao_original: obs };
      }
    } else if (obs) {
      meta = { observacao_original: obs };
    }
    meta.opcional = opcional;
    if (!opcional) delete meta.resposta_cobranca;
    const { error } = await supabase.from("transacoes").update({ observacao: JSON.stringify(meta) }).eq("id", gasto.id);
    if (error) throw error;
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
        const isEstorno = t.tipo === "ESTORNO" || desc.includes("estorno") || desc.includes("crédito de fatura") || desc.includes("desconto (nufinanceira)") || /^cr[eé]dito de\b/.test(desc.trim());
        return !isPagamento && !isEstorno;
      })
      .reduce((sum, t) => sum + Math.abs(Number(t.valor || 0)), 0);
  },

  calculateInvoiceCredits(itens: any[]): number {
    return (itens || [])
      .filter(t => {
        const desc = (t.descricao || "").toLowerCase();
        const isEstorno = t.tipo === "ESTORNO" || desc.includes("estorno") || desc.includes("crédito de fatura") || desc.includes("desconto (nufinanceira)") || /^cr[eé]dito de\b/.test(desc.trim());
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
   * SINCRONIZA AUTOMATICAMENTE PAGAMENTOS DE FATURA SEM CARTÃO IDENTIFICADO
   * Vincula pagamentos importados do extrato bancário diretamente ao cartão correspondente
   */
  async autoSyncPagamentosCartaoComTransacoes(usuario_id: string) {
    try {
      const [cardsRes, contasRes, txRes] = await Promise.all([
        supabase.from("cartoes").select("*").eq("usuario_id", usuario_id),
        supabase.from("contas_bancarias").select("*").eq("usuario_id", usuario_id),
        supabase.from("transacoes").select("*").eq("usuario_id", usuario_id)
      ]);

      const cards = cardsRes.data || [];
      const contas = contasRes.data || [];
      const txs = txRes.data || [];
      if (cards.length === 0 || txs.length === 0) return;

      const contasMap = new Map(contas.map(c => [c.id, c]));

      for (const tx of txs) {
        const descLower = (tx.descricao || "").toLowerCase();
        const isPagamentoFatura = tx.tipo === "PAGAMENTO_FATURA" ||
          /pagamento\s*(?:de\s*)?fatura|pagamento\s*cart[aã]o|pgto\s*fatura|pagamento\s*recebido/i.test(descLower);

        if (!isPagamentoFatura) continue;

        if (tx.cartao_id) {
          if (tx.tipo !== "PAGAMENTO_FATURA") {
            await supabase.from("transacoes").update({ tipo: "PAGAMENTO_FATURA" }).eq("id", tx.id);
          }
          continue;
        }

        // Tentar identificar o cartão correto
        let targetCard = null;
        const conta = tx.conta_id ? contasMap.get(tx.conta_id) : null;
        const contaNomeLower = conta ? (conta.nome || "").toLowerCase() : "";

        // 1º cartão vinculado à conta debitada; 2º mesma instituição citada; 3º único cartão
        targetCard =
          (conta && cards.find(c => c.conta_id === conta.id)) ||
          encontrarPorInstituicao(cards, `${descLower} ${conta?.instituicao || ""} ${contaNomeLower}`) ||
          (cards.length === 1 ? cards[0] : null);

        if (targetCard) {
          await supabase.from("transacoes").update({
            cartao_id: targetCard.id,
            tipo: "PAGAMENTO_FATURA"
          }).eq("id", tx.id);
        }
      }
    } catch (err) {
      console.warn("Aviso na auto-sincronização de pagamentos de cartão:", err);
    }
  },

  /**
   * SINCRONIZA E GERA AUTOMATICAMENTE AS FATURAS DOS CARTÕES
   * Agrupa as transações de cartão por ciclo mensal e garante registros na tabela faturas
   */
  async syncCardFaturas(usuario_id: string) {
    try {
      await this.autoSyncPagamentosCartaoComTransacoes(usuario_id);

      const [cardsRes, txRes] = await Promise.all([
        supabase.from("cartoes").select("*").eq("usuario_id", usuario_id),
        supabase.from("transacoes").select("*").eq("usuario_id", usuario_id).not("cartao_id", "is", null)
      ]);

      const cards = cardsRes.data || [];
      const transacoes = txRes.data || [];
      if (cards.length === 0) return;

      if (transacoes.length === 0) return;

      const cardsMap = new Map(cards.map((c: any) => [c.id, c]));
      const ehPagamento = (t: any) => t.tipo === "PAGAMENTO_FATURA" || /pagamento\s*recebido|pagamento\s*de\s*fatura|pagamento\s*cart[aã]o/i.test(t.descricao || "");

      // Agrupa transações por cartao_id e mesReferencia
      const groups = new Map<string, { card: any, mesRef: string, items: any[] }>();
      // Pagamentos ficam à parte: pagam a fatura FECHADA anterior, não o ciclo em que caem
      const pagamentosPorCartao = new Map<string, any[]>();

      for (const tx of transacoes) {
        const card = cardsMap.get(tx.cartao_id);
        if (!card) continue;
        if (ehPagamento(tx)) {
          pagamentosPorCartao.set(card.id, [...(pagamentosPorCartao.get(card.id) || []), tx]);
          continue;
        }

        const mesRef = getFaturaMesReferencia(tx.data, card.fechamento_dia, card.vencimento_dia);
        const groupKey = `${card.id}_${mesRef}`;

        if (!groups.has(groupKey)) {
          groups.set(groupKey, { card, mesRef, items: [] });
        }
        groups.get(groupKey)!.items.push(tx);
      }

      // Distribui cada pagamento: primeiro na fatura já fechada (a que ele está pagando),
      // o que sobrar vai para a fatura aberta. Pagamento repetido (mesmo valor em até 5 dias,
      // um vindo do extrato da conta e outro da fatura) conta uma vez só.
      const mesAntes = (ym: string) => {
        const [a, m] = ym.split("-").map(Number);
        const d = new Date(a, m - 2, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      };
      const pagoPorGrupo = new Map<string, number>();
      const totalDoGrupo = (key: string) => {
        const g = groups.get(key);
        return g ? this.calculateInvoiceTotal(g.items) : 0;
      };
      for (const [cardId, lista] of pagamentosPorCartao) {
        const card = cardsMap.get(cardId);
        const ordenados = [...lista].sort((a, b) => String(a.data).localeCompare(String(b.data)));
        const considerados: any[] = [];
        for (const p of ordenados) {
          const dia = (x: any) => new Date(String(x.data).slice(0, 10) + "T12:00:00").getTime();
          const repetido = considerados.find((q) =>
            Math.abs(Math.abs(Number(q.valor)) - Math.abs(Number(p.valor))) < 0.01 &&
            Math.abs(dia(q) - dia(p)) <= 5 * 86400000 &&
            Boolean(q.conta_id) !== Boolean(p.conta_id));
          if (repetido) continue;
          considerados.push(p);
          const aberta = getFaturaMesReferencia(String(p.data).slice(0, 10), card.fechamento_dia, card.vencimento_dia);
          let resto = Math.abs(Number(p.valor) || 0);
          for (const ref of [mesAntes(aberta), aberta]) {
            const key = `${cardId}_${ref}`;
            if (!groups.has(key) || resto <= 0.009) continue;
            const falta = ref === aberta ? resto : Math.max(0, totalDoGrupo(key) - (pagoPorGrupo.get(key) || 0));
            const usa = Math.min(falta, resto);
            if (usa <= 0) continue;
            pagoPorGrupo.set(key, Math.round(((pagoPorGrupo.get(key) || 0) + usa) * 100) / 100);
            resto -= usa;
          }
        }
        // Auto-repara no banco pagamentos com tipo incorreto
        const tipoErrado = lista.filter((t: any) => t.tipo !== "PAGAMENTO_FATURA").map((t: any) => t.id);
        if (tipoErrado.length > 0) supabase.from("transacoes").update({ tipo: "PAGAMENTO_FATURA" }).in("id", tipoErrado).then();
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
        const isTxEstorno = (t: any) => t.tipo === "ESTORNO" || /estorno|cr[eé]dito\s*de\s*fatura|desconto\s*\(nufinanceira\)/i.test(t.descricao || "") || /^\s*cr[eé]dito de\b/i.test(t.descricao || "");

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
        const valorPago = pagoPorGrupo.get(`${card.id}_${mesRef}`) || 0;

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

      // Faturas que não batem mais com nenhum ciclo (ex.: o dia de fechamento/vencimento do
      // cartão mudou e as compras foram reagrupadas): ficam zeradas para não aparecerem como
      // "fatura antiga sem pagamento". Faturas criadas a partir de um documento importado ficam como estão.
      const ciclosAtuais = new Set([...groups.values()].map(g => `${g.card.id}_${g.mesRef}-${String(g.card.vencimento_dia).padStart(2, "0")}`));
      const { data: todasFaturas } = await supabase
        .from("faturas")
        .select("id, cartao_id, data_vencimento, valor_total, documento_importado_id")
        .eq("usuario_id", usuario_id);
      for (const fa of todasFaturas || []) {
        if (!cardsMap.has(fa.cartao_id) || fa.documento_importado_id) continue;
        if (ciclosAtuais.has(`${fa.cartao_id}_${String(fa.data_vencimento).slice(0, 10)}`)) continue;
        if (Number(fa.valor_total) > 0) {
          await supabase.from("faturas").update({ valor_total: 0, valor_pago: 0, status: "paga" }).eq("id", fa.id);
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
