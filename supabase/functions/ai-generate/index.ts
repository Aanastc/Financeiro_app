// Supabase Edge Function: ai-generate
// ----------------------------------------------------------------------------
// Proxy autenticado para o Google Gemini. A chave da API fica SOMENTE no
// servidor (secret GEMINI_API_KEY) e nunca vai para o navegador.
//
// Deploy:
//   supabase secrets set GEMINI_API_KEY=xxxxx
//   supabase functions deploy ai-generate
//
// Request (POST, com o JWT do usuário no header Authorization — o
// supabase.functions.invoke() já envia):
//   { "tarefa": "documento" | "consultor" | "acordo",
//     "partes": [ "texto...", { "inlineData": { "data": "<base64>", "mimeType": "application/pdf" } } ],
//     "json": true }
// Response: { "text": string, "model": string }
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2.48.1";

type Tarefa = "documento" | "consultor" | "acordo";
type Parte = string | { inlineData: { data: string; mimeType: string } };

// Modelos escolhidos no servidor, por tarefa (o cliente não escolhe o modelo).
const MODELOS: Record<Tarefa, string[]> = {
  documento: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
  consultor: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
  acordo: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
};

const MIME_PERMITIDOS = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "text/plain",
  "text/csv",
]);

const MAX_BODY_BYTES = 20 * 1024 * 1024; // 20 MB (PDFs/imagens em base64)
const MAX_TEXTO_CHARS = 400_000;
const LIMITE_POR_HORA = 60; // requisições de IA por usuário/hora

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validarPartes(partes: unknown): Parte[] | string {
  if (!Array.isArray(partes) || partes.length === 0 || partes.length > 10) {
    return "Campo 'partes' deve ser uma lista com 1 a 10 itens.";
  }
  let totalTexto = 0;
  for (const p of partes) {
    if (typeof p === "string") {
      totalTexto += p.length;
      continue;
    }
    const inline = (p as any)?.inlineData;
    if (!inline || typeof inline.data !== "string" || typeof inline.mimeType !== "string") {
      return "Parte inválida: use texto ou { inlineData: { data, mimeType } }.";
    }
    if (!MIME_PERMITIDOS.has(inline.mimeType)) {
      return `Tipo de arquivo não suportado: ${inline.mimeType}`;
    }
  }
  if (totalTexto > MAX_TEXTO_CHARS) return "Conteúdo de texto muito grande.";
  return partes as Parte[];
}

async function chamarGemini(apiKey: string, modelo: string, partes: Parte[], respostaJson: boolean) {
  const body = {
    contents: [
      {
        role: "user",
        parts: partes.map((p) =>
          typeof p === "string"
            ? { text: p }
            : { inline_data: { mime_type: p.inlineData.mimeType, data: p.inlineData.data } }
        ),
      },
    ],
    generationConfig: respostaJson ? { responseMimeType: "application/json" } : undefined,
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    const err = new Error(`Gemini ${res.status}: ${detalhe.slice(0, 300)}`);
    (err as any).status = res.status;
    throw err;
  }

  const data = await res.json();
  const texto: string = (data?.candidates?.[0]?.content?.parts || [])
    .map((p: any) => p?.text || "")
    .join("")
    .trim();
  if (!texto) throw new Error("Resposta vazia do modelo.");
  return texto;
}

async function gerarComFallback(apiKey: string, modelos: string[], partes: Parte[], respostaJson: boolean) {
  let ultimoErro: unknown = null;
  for (const modelo of modelos) {
    let espera = 1000;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const text = await chamarGemini(apiKey, modelo, partes, respostaJson);
        return { text, model: modelo };
      } catch (err) {
        ultimoErro = err;
        const status = (err as any)?.status;
        const transitorio = status === 429 || status === 500 || status === 503;
        if (!transitorio) break; // erro definitivo neste modelo → tenta o próximo
        await new Promise((r) => setTimeout(r, espera));
        espera *= 2;
      }
    }
  }
  throw ultimoErro ?? new Error("Nenhum modelo disponível.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "IA não configurada no servidor." }, 503);

  // Autenticação: só usuários logados podem usar a IA
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Não autenticado." }, 401);

  const tamanho = Number(req.headers.get("content-length") || 0);
  if (tamanho > MAX_BODY_BYTES) return json({ error: "Arquivo muito grande (máx. 20 MB)." }, 413);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }

  const tarefa = payload?.tarefa as Tarefa;
  if (!MODELOS[tarefa]) return json({ error: "Tarefa inválida." }, 400);

  const partes = validarPartes(payload?.partes);
  if (typeof partes === "string") return json({ error: partes }, 400);

  // Limite de uso por usuário (se a tabela ia_requisicoes existir — migration 005)
  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("ia_requisicoes")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", user.id)
    .gte("criado_em", umaHoraAtras);
  if (!countError && (count ?? 0) >= LIMITE_POR_HORA) {
    return json({ error: "Limite de uso da IA atingido. Tente novamente mais tarde." }, 429);
  }

  try {
    const resultado = await gerarComFallback(apiKey, MODELOS[tarefa], partes, Boolean(payload?.json));
    if (!countError) {
      await supabase.from("ia_requisicoes").insert({ usuario_id: user.id, tarefa, modelo: resultado.model });
    }
    return json(resultado);
  } catch (err) {
    console.error("[ai-generate] falha:", err);
    return json({ error: "Não foi possível obter resposta da IA. Tente novamente em instantes." }, 502);
  }
});
