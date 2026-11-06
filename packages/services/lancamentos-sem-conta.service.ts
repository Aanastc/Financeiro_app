import { supabase } from "./supabase";
import { buscarTodasPaginas } from "./paginacao";
import { financeService, inserirMovimentacoes } from "./finance.service";

/**
 * Lançamentos que deveriam estar numa conta (ou cartão) e não estão.
 *
 * Não contam como "sem conta":
 *   - divisão de contas e acordos (o dinheiro não passou por conta sua);
 *   - lançamentos que não entram na soma (considerar_soma = false);
 *   - tipos que não são receita/despesa (transferência, aporte, etc.);
 *   - parcelas futuras ainda pendentes.
 */

const lerMeta = (obs?: string | null): Record<string, any> => {
  const t = (obs || "").trim();
  if (!t.startsWith("{")) return {};
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
};

export function ehLancamentoSemConta(t: any, hoje = new Date().toISOString().slice(0, 10)): boolean {
  const tipo = String(t.tipo || "").toUpperCase();
  const receita = tipo === "RECEITA";
  const despesa = tipo === "DESPESA";
  if (!receita && !despesa) return false;
  if (t.conta_id) return false;
  if (despesa && t.cartao_id) return false;
  if (t.considerar_soma === false) return false;
  if (t.terceiro) return false;
  if (t.data && t.data > hoje) return false;
  const meta = lerMeta(t.observacao);
  if (meta.parceria_credor_id || meta.is_split || meta.acordo_ia || meta.acerto_divisao || meta.split_tipo) return false;
  return true;
}

export const lancamentosSemContaService = {
  async listar(usuarioId: string) {
    const linhas = await buscarTodasPaginas<any>((de, ate) =>
      supabase
        .from("transacoes")
        .select("id, tipo, descricao, valor, data, conta_id, cartao_id, considerar_soma, terceiro, observacao, status, categorias(nome)")
        .eq("usuario_id", usuarioId)
        .in("tipo", ["RECEITA", "DESPESA"])
        .is("conta_id", null)
        .order("data", { ascending: false })
        .order("id")
        .range(de, ate),
    );
    return linhas.filter((t) => ehLancamentoSemConta(t));
  },

  /**
   * Liga o lançamento a uma conta (com a movimentação de entrada/saída, para o
   * saldo da conta ficar certo) ou, se for despesa, a um cartão.
   */
  async vincular(usuarioId: string, t: { id: string; tipo: string; valor: number; data: string }, destino: { contaId?: string; cartaoId?: string }) {
    if (destino.cartaoId) {
      if (String(t.tipo).toUpperCase() !== "DESPESA") throw new Error("Só despesas podem ir para cartão.");
      const { error } = await supabase.from("transacoes").update({ cartao_id: destino.cartaoId }).eq("id", t.id).eq("usuario_id", usuarioId);
      if (error) throw error;
      return;
    }
    if (!destino.contaId) throw new Error("Escolha a conta.");
    const { error } = await supabase.from("transacoes").update({ conta_id: destino.contaId }).eq("id", t.id).eq("usuario_id", usuarioId);
    if (error) throw error;

    // Movimentação: atualiza a existente ou cria (é ela que entra no saldo da conta)
    const { data: existentes } = await supabase.from("movimentacoes").select("id").eq("usuario_id", usuarioId).eq("transacao_id", t.id).limit(1);
    if (existentes && existentes.length > 0) {
      await supabase.from("movimentacoes").update({ conta_id: destino.contaId }).eq("id", existentes[0].id);
    } else {
      const { error: errMov } = await inserirMovimentacoes([
        {
          usuario_id: usuarioId,
          transacao_id: t.id,
          conta_id: destino.contaId,
          tipo: String(t.tipo).toUpperCase() === "RECEITA" ? "ENTRADA" : "SAIDA",
          valor: Number(t.valor),
          data: t.data,
        },
      ]);
      if (errMov) throw errMov;
    }
  },

  /** Depois de ligar despesas a cartões, recalcula as faturas. */
  async recalcularFaturas(usuarioId: string) {
    await financeService.syncCardFaturas(usuarioId).catch(() => {});
  },
};
