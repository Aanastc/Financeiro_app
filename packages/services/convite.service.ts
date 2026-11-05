import { supabase } from "./supabase";

/**
 * Convites para contatos criarem conta no app e ficarem vinculados.
 * O vínculo é gravado pela função aceitar_convite (migration 006).
 */

const CHAVE_PENDENTE = "finance_convite_pendente";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ContatoConvite {
  id: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
}

/** Telefone no formato do WhatsApp (com DDI). Números brasileiros sem DDI recebem 55. */
export function telefoneWhatsApp(telefone?: string | null): string | null {
  let digitos = (telefone || "").replace(/\D/g, "").replace(/^0+/, "");
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
  return digitos.length >= 12 && digitos.length <= 15 ? digitos : null;
}

export interface DespesaCompartilhadaComigo {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  valor_pago: number;
  quitado: boolean;
  /** VOCE_DEVE: a outra pessoa pagou; TE_DEVEM: você pagou */
  direcao: "VOCE_DEVE" | "TE_DEVEM";
  pessoa: string;
  /** Cobrança opcional: você pode aceitar ou recusar (migration 011) */
  opcional?: boolean;
  resposta?: "aceita" | "recusada" | null;
}

export const conviteService = {
  /** Despesas que outras pessoas dividiram com você (somente leitura — migration 009). */
  async compartilhadasComigo(): Promise<DespesaCompartilhadaComigo[]> {
    const { data, error } = await supabase.rpc("despesas_compartilhadas_comigo");
    if (error) {
      console.warn("Despesas compartilhadas indisponíveis:", error.message);
      return [];
    }
    return (data || []) as DespesaCompartilhadaComigo[];
  },

  /** Aceita ou recusa uma cobrança opcional feita a você (migration 011). */
  async responderCobranca(transacaoId: string, aceitar: boolean): Promise<{ ok: boolean; motivo?: string }> {
    const { data, error } = await supabase.rpc("responder_cobranca_opcional", {
      p_transacao_id: transacaoId,
      p_aceitar: aceitar,
    });
    if (error) return { ok: false, motivo: error.message };
    return (data as any) || { ok: false };
  },

  linkConvite(contato: ContatoConvite, origem = window.location.origin): string {
    const params = new URLSearchParams({ convite: contato.id });
    if (contato.email) params.set("email", contato.email);
    return `${origem}/register?${params.toString()}`;
  },

  mensagem(contato: ContatoConvite, nomeRemetente?: string | null): string {
    const de = nomeRemetente ? `${nomeRemetente} te convidou` : "Você foi convidado(a)";
    return [
      `Olá, ${contato.nome}! Tudo bem?`,
      "",
      `${de} para o Finance App, onde a gente organiza as contas e divide despesas.`,
      "",
      "Crie sua conta por este link para ficarmos conectados no app:",
      this.linkConvite(contato),
    ].join("\n");
  },

  /** URL do WhatsApp. Sem telefone válido, abre o WhatsApp para escolher o contato. */
  urlWhatsApp(contato: ContatoConvite, nomeRemetente?: string | null): string {
    const texto = encodeURIComponent(this.mensagem(contato, nomeRemetente));
    const tel = telefoneWhatsApp(contato.telefone);
    return tel ? `https://wa.me/${tel}?text=${texto}` : `https://wa.me/?text=${texto}`;
  },

  /** mailto: abre o app de e-mail do usuário com o convite pronto. */
  urlEmail(contato: ContatoConvite, nomeRemetente?: string | null): string {
    const assunto = encodeURIComponent(`${nomeRemetente || "Um amigo"} te convidou para o Finance App`);
    const corpo = encodeURIComponent(this.mensagem(contato, nomeRemetente));
    return `mailto:${encodeURIComponent(contato.email || "")}?subject=${assunto}&body=${corpo}`;
  },

  /** Guarda o convite da URL atual (?convite=) para aceitar depois do login/cadastro. */
  capturarDaUrl(): void {
    try {
      const id = new URLSearchParams(window.location.search).get("convite");
      if (id && UUID.test(id)) localStorage.setItem(CHAVE_PENDENTE, id);
    } catch {
      /* storage indisponível: ignora */
    }
  },

  /**
   * Aceita o convite pendente (se houver) para o usuário logado.
   * Retorna o nome de quem convidou em caso de sucesso, ou null.
   */
  async aceitarPendente(): Promise<{ ok: boolean; convidante?: string; motivo?: string } | null> {
    let id: string | null = null;
    try {
      id = localStorage.getItem(CHAVE_PENDENTE);
    } catch {
      return null;
    }
    if (!id) return null;

    const { data, error } = await supabase.rpc("aceitar_convite", { p_contato_id: id });
    if (error) {
      // Função ainda não criada (migration 006 pendente): mantém o convite para tentar depois
      console.warn("Convite não pôde ser aceito agora:", error.message);
      return null;
    }
    try {
      localStorage.removeItem(CHAVE_PENDENTE);
    } catch {
      /* ignora */
    }
    return data as { ok: boolean; convidante?: string; motivo?: string };
  },
};

/**
 * Avisa por e-mail os contatos envolvidos nas despesas informadas
 * (Edge Function notificar-divisao). Falhas não interrompem o fluxo do usuário.
 */
export async function notificarDivisaoPorEmail(transacaoIds: string[]): Promise<{ enviados: number } | null> {
  const ids = transacaoIds.filter(Boolean);
  if (ids.length === 0) return null;
  const { data, error } = await supabase.functions.invoke("notificar-divisao", { body: { transacao_ids: ids } });
  if (error) {
    console.warn("Aviso por e-mail não enviado:", error.message);
    return null;
  }
  return data as { enviados: number };
}
