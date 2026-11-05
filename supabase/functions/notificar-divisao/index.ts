// Supabase Edge Function: notificar-divisao
// ----------------------------------------------------------------------------
// Avisa por e-mail os contatos envolvidos em despesas divididas.
//
// Segurança:
//   * Exige usuário logado; as transações são lidas COM o token dele (RLS):
//     só dá para notificar sobre despesas que o próprio usuário lançou.
//   * O destinatário NUNCA vem do navegador: é o e-mail do contato vinculado
//     à despesa (contato_id, parceria_credor_id ou participantes do grupo).
//   * Limite de envios por usuário/hora (tabela notificacoes_email — migration 010).
//
// Secrets necessários:
//   supabase secrets set RESEND_API_KEY=re_xxx EMAIL_REMETENTE="Tech Finance <avisos@seudominio.com>"
//   (o domínio do remetente precisa estar verificado no Resend)
//
// Request: POST { "transacao_ids": ["uuid", ...] }
// Response: { "enviados": n, "ignorados": n }
// ----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2.48.1";

const LIMITE_POR_HORA = 40;
const MAX_TRANSACOES = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const moeda = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
const escapar = (t: string) =>
  String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const lerMeta = (obs?: string | null): any => {
  try {
    return obs && obs.trim().startsWith("{") ? JSON.parse(obs) : {};
  } catch {
    return {};
  }
};

interface Linha {
  data: string;
  descricao: string;
  valor: number;
  sentido: "VOCE_DEVE" | "TE_DEVE"; // do ponto de vista de quem RECEBE o e-mail
}

function montarEmail(remetente: string, destinatario: string, linhas: Linha[], appUrl: string) {
  const deve = linhas.filter(l => l.sentido === "VOCE_DEVE").reduce((s, l) => s + l.valor, 0);
  const recebe = linhas.filter(l => l.sentido === "TE_DEVE").reduce((s, l) => s + l.valor, 0);
  const saldo = recebe - deve;
  const resumo =
    saldo < 0
      ? `Sua parte: <strong style="color:#be123c">${moeda(-saldo)}</strong> para ${escapar(remetente)}`
      : saldo > 0
        ? `${escapar(remetente)} vai te devolver <strong style="color:#047857">${moeda(saldo)}</strong>`
        : "Os valores se compensam.";

  const itens = linhas
    .map(
      l => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;white-space:nowrap">${dataBR(l.data)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px">${escapar(l.descricao)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;font-size:14px;color:${l.sentido === "VOCE_DEVE" ? "#be123c" : "#047857"};white-space:nowrap">${moeda(l.valor)}</td>
      </tr>`
    )
    .join("");

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
      <tr><td style="background:#0f3d2e;padding:22px 28px;color:#ffffff;font-size:18px;font-weight:800;letter-spacing:.3px">Tech Finance</td></tr>
      <tr><td style="padding:28px">
        <p style="margin:0 0 6px;font-size:16px;color:#0f172a">Olá, ${escapar(destinatario)}!</p>
        <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.5"><strong>${escapar(remetente)}</strong> registrou ${linhas.length > 1 ? "despesas divididas" : "uma despesa dividida"} com você:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itens}</table>
        <p style="margin:20px 0 24px;font-size:15px;color:#0f172a">${resumo}</p>
        <a href="${appUrl}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px">Ver no Tech Finance</a>
      </td></tr>
      <tr><td style="padding:16px 28px;background:#f8fafc;color:#94a3b8;font-size:11px;line-height:1.5">
        Você recebeu este aviso porque ${escapar(remetente)} cadastrou você como contato no Tech Finance.<br>
        © ${new Date().getFullYear()} ANA LETICIA TECH. Todos os direitos reservados.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;

  const texto = [
    `Olá, ${destinatario}!`,
    `${remetente} registrou despesas divididas com você:`,
    ...linhas.map(l => `- ${dataBR(l.data)} ${l.descricao}: ${moeda(l.valor)}`),
    "",
    `Ver no app: ${appUrl}`,
  ].join("\n");

  return { html, texto };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const remetenteEmail = Deno.env.get("EMAIL_REMETENTE");
  const appUrl = Deno.env.get("APP_URL") || "https://financeiro-app-web-dqgn.vercel.app";
  if (!resendKey || !remetenteEmail) return json({ error: "Envio de e-mail não configurado." }, 503);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || (user as any).is_anonymous) return json({ error: "Não autenticado." }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }
  const ids: string[] = Array.isArray(body?.transacao_ids) ? body.transacao_ids.slice(0, MAX_TRANSACOES) : [];
  if (ids.length === 0) return json({ error: "Nenhuma despesa informada." }, 400);

  // Limite de envios
  const umaHora = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supabase
    .from("notificacoes_email")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", user.id)
    .gte("criado_em", umaHora);
  if ((count ?? 0) >= LIMITE_POR_HORA) return json({ error: "Limite de avisos por hora atingido." }, 429);

  // RLS garante que só vêm transações do próprio usuário
  const [{ data: txs }, { data: perfil }, { data: contatos }] = await Promise.all([
    supabase.from("transacoes").select("id, data, descricao, valor, terceiro, contato_id, observacao").in("id", ids),
    supabase.from("usuarios").select("nome").eq("id", user.id).maybeSingle(),
    supabase.from("contatos").select("id, nome, email").eq("usuario_id", user.id),
  ]);
  const contatoPorId = new Map((contatos || []).map((c: any) => [c.id, c]));
  const remetente = perfil?.nome || "Um contato";

  // Agrupa as linhas por destinatário
  const porContato = new Map<string, { contato: any; linhas: Linha[]; txIds: string[] }>();
  const adicionar = (contatoId: string | null | undefined, linha: Linha, txId: string) => {
    const c = contatoId ? contatoPorId.get(contatoId) : null;
    if (!c?.email) return;
    const g = porContato.get(c.id) || { contato: c, linhas: [], txIds: [] };
    g.linhas.push(linha);
    g.txIds.push(txId);
    porContato.set(c.id, g);
  };

  for (const t of txs || []) {
    const meta = lerMeta(t.observacao);
    const descricao = meta.descricao_original || t.descricao;
    if (meta.split_tipo === "grupo" && Array.isArray(meta.participantes)) {
      // Você pagou: cada participante (exceto você) é avisado da parte que te deve
      if (meta.voce_pagou) {
        for (const p of meta.participantes) {
          if (p.is_user || !p.contato_id) continue;
          adicionar(p.contato_id, { data: t.data, descricao, valor: Number(p.valor_devido) || 0, sentido: "VOCE_DEVE" }, t.id);
        }
      } else if (meta.parceria_credor_id) {
        // Outra pessoa pagou: só ela é avisada de quanto você vai devolver
        // (os demais devem a ela, não a você)
        adicionar(meta.parceria_credor_id, { data: t.data, descricao, valor: Number(t.valor) || 0, sentido: "TE_DEVE" }, t.id);
      }
    } else if (t.terceiro && t.contato_id) {
      adicionar(t.contato_id, { data: t.data, descricao, valor: Number(t.valor) || 0, sentido: "VOCE_DEVE" }, t.id);
    } else if (meta.parceria_credor_id) {
      adicionar(meta.parceria_credor_id, { data: t.data, descricao, valor: Number(t.valor) || 0, sentido: "TE_DEVE" }, t.id);
    }
  }

  let enviados = 0;
  for (const { contato, linhas, txIds } of porContato.values()) {
    const { html, texto } = montarEmail(remetente, contato.nome, linhas, appUrl);
    let status = "enviado";
    let erro: string | null = null;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: remetenteEmail,
          to: [contato.email],
          subject: `${remetente} dividiu ${linhas.length > 1 ? `${linhas.length} despesas` : "uma despesa"} com você`,
          html,
          text: texto,
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      enviados++;
    } catch (e) {
      status = "erro";
      erro = String((e as Error).message || e);
      console.error("[notificar-divisao]", erro);
    }
    await supabase.from("notificacoes_email").insert({
      usuario_id: user.id,
      contato_id: contato.id,
      transacao_ids: txIds,
      destinatario: contato.email,
      status,
      erro,
    });
  }

  return json({ enviados, ignorados: (txs || []).length === 0 ? ids.length : 0 });
});
