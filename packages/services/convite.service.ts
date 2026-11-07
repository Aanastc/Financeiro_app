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
  /** Grupo em que o lançamento foi feito (SQL pendente de 07/11/2026; antes disso vem vazio) */
  grupo_id?: string | null;
  grupo_nome?: string | null;
  parcela?: number | null;
  total_parcelas?: number | null;
  /** "Paguei" já avisado e aguardando quem recebeu confirmar */
  pagamento_informado?: { valor: number; informado_em: string } | null;
}

/** Grupo criado por outra pessoa em que você é membro (convite aceito). */
export interface GrupoQueParticipo {
  id: string;
  nome: string;
  tipo?: string | null;
  icone?: string | null;
  cor_hex?: string | null;
  criado_por: string;
  membros: string[];
}

const CHAVE_CONVITES_ENVIADOS = "finance_convites_enviados";

const convitesLocais = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CONVITES_ENVIADOS) || "{}");
  } catch {
    return {};
  }
};

/** Situação do convite de um contato. */
export type SituacaoConvite = "ativo" | "pendente" | "nao_convidado";

export const conviteService = {
  /** Guarda que o convite foi enviado (coluna convite_enviado_em — SQL seção 9; sem ela, fica no navegador). */
  async marcarEnviado(contatoId: string): Promise<string> {
    const agora = new Date().toISOString();
    try {
      const locais = convitesLocais();
      locais[contatoId] = agora;
      localStorage.setItem(CHAVE_CONVITES_ENVIADOS, JSON.stringify(locais));
    } catch {
      /* sem armazenamento local */
    }
    await supabase.from("contatos").update({ convite_enviado_em: agora }).eq("id", contatoId);
    return agora;
  },

  /** Quando o convite foi enviado (banco ou navegador), ou null. */
  enviadoEm(contato: { id: string; convite_enviado_em?: string | null } | null | undefined): string | null {
    if (!contato) return null;
    return contato.convite_enviado_em || convitesLocais()[contato.id] || null;
  },

  situacao(contato: any, temConta: boolean): SituacaoConvite {
    if (temConta) return "ativo";
    return this.enviadoEm(contato) ? "pendente" : "nao_convidado";
  },

  /** "convite enviado há 3 dias · aguardando aceitar" */
  textoSituacao(contato: any, temConta: boolean): string {
    const s = this.situacao(contato, temConta);
    if (s === "ativo") return "conta ativa no app";
    if (s === "nao_convidado") return "ainda não convidado";
    const dias = Math.floor((Date.now() - new Date(this.enviadoEm(contato)!).getTime()) / 86_400_000);
    const quando = dias <= 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`;
    return `convite enviado ${quando} · aguardando aceitar`;
  },

  /** Despesas que outras pessoas dividiram com você (somente leitura — migration 009). */
  async compartilhadasComigo(): Promise<DespesaCompartilhadaComigo[]> {
    const { data, error } = await supabase.rpc("despesas_compartilhadas_comigo");
    if (error) {
      console.warn("Despesas compartilhadas indisponíveis:", error.message);
      return [];
    }
    return (data || []) as DespesaCompartilhadaComigo[];
  },

  /** Grupos de outras pessoas em que você é membro (sem a função no banco, devolve lista vazia). */
  async gruposQueParticipo(): Promise<GrupoQueParticipo[]> {
    const { data, error } = await supabase.rpc("grupos_que_participo");
    if (error) {
      console.warn("Grupos compartilhados indisponíveis:", error.message);
      return [];
    }
    return (data || []) as GrupoQueParticipo[];
  },

  /**
   * Quem recebeu responde ao "Paguei" da outra pessoa.
   * Confirmar: chame DEPOIS de registrar o recebimento (é ele que dá baixa no item).
   */
  async responderPagamentoInformado(transacaoId: string, confirmado: boolean): Promise<{ ok: boolean; motivo?: string }> {
    const { data, error } = await supabase.rpc("responder_pagamento_informado", {
      p_transacao_id: transacaoId,
      p_confirmado: confirmado,
    });
    if (error) return { ok: false, motivo: error.message };
    return (data as any) || { ok: false };
  },

  /**
   * Aceita ou recusa uma cobrança opcional feita a você (migration 011).
   * Ao aceitar uma parcela, o banco aceita também as parcelas seguintes ainda sem resposta.
   */
  async responderCobranca(transacaoId: string, aceitar: boolean): Promise<{ ok: boolean; motivo?: string; parcelas_seguintes?: number }> {
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
/** Envio de e-mail desligado por enquanto (sem provedor configurado). Os avisos continuam no app. */
export const EMAIL_DIVISAO_ATIVO = false;

export async function notificarDivisaoPorEmail(transacaoIds: string[]): Promise<{ enviados: number } | null> {
  if (!EMAIL_DIVISAO_ATIVO) return null;
  const ids = transacaoIds.filter(Boolean);
  if (ids.length === 0) return null;
  const { data, error } = await supabase.functions.invoke("notificar-divisao", { body: { transacao_ids: ids } });
  if (error) {
    console.warn("Aviso por e-mail não enviado:", error.message);
    return null;
  }
  return data as { enviados: number };
}
