import { supabase } from "./supabase";

/**
 * Cliente da IA (Gemini) via Supabase Edge Function `ai-generate`.
 * A chave da API fica apenas no servidor — nunca no bundle do navegador.
 */
export type TarefaIA = "documento" | "consultor" | "acordo";
export type ParteIA = string | { inlineData: { data: string; mimeType: string } };

export class IAIndisponivelError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "IAIndisponivelError";
  }
}

export const aiService = {
  /** Gera texto com a IA. Lança IAIndisponivelError em caso de falha. */
  async gerar(tarefa: TarefaIA, partes: ParteIA[], opcoes: { json?: boolean } = {}): Promise<string> {
    const { data, error } = await supabase.functions.invoke("ai-generate", {
      body: { tarefa, partes, json: Boolean(opcoes.json) },
    });

    if (error) {
      let mensagem = "Não foi possível consultar a IA agora. Tente novamente em instantes.";
      let status: number | undefined;
      // FunctionsHttpError traz a Response original em `context`
      const resposta = (error as any)?.context;
      if (resposta && typeof resposta.json === "function") {
        status = resposta.status;
        try {
          const corpo = await resposta.json();
          if (corpo?.error) mensagem = corpo.error;
        } catch {
          /* corpo não-JSON: mantém mensagem padrão */
        }
      }
      throw new IAIndisponivelError(mensagem, status);
    }

    const texto = typeof data?.text === "string" ? data.text.trim() : "";
    if (!texto) throw new IAIndisponivelError("A IA retornou uma resposta vazia.");
    return texto;
  },

  /** Gera e faz parse de JSON (remove cercas ```json se houver). */
  async gerarJson<T = unknown>(tarefa: TarefaIA, partes: ParteIA[]): Promise<T> {
    const texto = await this.gerar(tarefa, partes, { json: true });
    const limpo = texto.replace(/```json/gi, "").replace(/```/g, "").trim();
    try {
      return JSON.parse(limpo) as T;
    } catch {
      throw new IAIndisponivelError("A IA retornou um formato inválido. Tente novamente.");
    }
  },
};
