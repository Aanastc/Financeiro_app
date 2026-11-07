import type { ContextoFinanceiro, Fase } from "./contextoFinanceiro";
import { contextoParaPrompt } from "./contextoFinanceiro";

/**
 * Consultor = EDUCADOR financeiro: ensina a pessoa a cuidar do próprio dinheiro
 * usando os números dela. Este arquivo concentra a persona, os prompts e o plano
 * de reserva calculado no app (quando a IA está indisponível).
 */

export interface RelatorioEducador {
	resumo: string;
	pontos_fortes: string[];
	alertas: { titulo: string; explicacao: string; gravidade: "alta" | "media" | "baixa" }[];
	plano: { titulo: string; acao: string; por_que: string; prazo: string; impacto?: string }[];
	licao: { tema: string; explicacao: string; exemplo: string };
	perguntas_sugeridas: string[];
	/** true = gerado no app, sem IA */
	local?: boolean;
}

export const FASES: { id: Fase; titulo: string; descricao: string }[] = [
	{ id: "organizar", titulo: "Organizar", descricao: "Gastar menos do que ganha todo mês" },
	{ id: "sair_das_dividas", titulo: "Sair das dívidas", descricao: "Quitar primeiro as de juros mais altos" },
	{ id: "construir_reserva", titulo: "Reserva de emergência", descricao: "Guardar de 3 a 6 meses de gastos" },
	{ id: "investir_e_metas", titulo: "Investir e realizar metas", descricao: "Fazer o dinheiro trabalhar pelos seus sonhos" },
];

const moeda = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PERSONA = `Você é um EDUCADOR FINANCEIRO pessoal, dentro de um app de finanças brasileiro.
Seu papel é ensinar a pessoa a entender e cuidar do próprio dinheiro, usando OS NÚMEROS REAIS DELA.

Como você age:
- Fala em português do Brasil, com linguagem simples, acolhedora e sem julgamento. Nada de "economês": se usar um termo (reserva de emergência, juros compostos, rotativo, CDI, taxa de poupança), explique em uma frase.
- Ensina o PORQUÊ de cada recomendação e mostra a conta com os valores da pessoa (ex.: "você sobra R$ 300/mês; guardando isso, em 10 meses tem R$ 3.000").
- Segue a ordem da jornada: 1) gastar menos do que ganha; 2) sair das dívidas caras (cartão rotativo e cheque especial primeiro); 3) montar reserva de emergência (3 a 6 meses de gastos, com liquidez diária); 4) investir e realizar metas.
- Usa SÓ os dados fornecidos. Nunca invente valores, taxas de juros ou fatos. Se faltar um dado importante, diga qual e sugira registrá-lo no app (ex.: "cadastre a taxa de juros dessa dívida").
- NÃO recomenda produtos, bancos, corretoras ou ativos específicos, não promete rentabilidade e não dá aconselhamento jurídico/tributário. Pode explicar tipos de investimento de forma geral (renda fixa, Tesouro, CDB, poupança) e seus riscos.
- Valores em reais no formato brasileiro (R$ 1.234,56). Seja concreto e breve.
- Reconheça o que a pessoa já faz bem: motivação também é educação.`;

export function promptRelatorio(c: ContextoFinanceiro): string {
	return `${PERSONA}

DADOS FINANCEIROS DA PESSOA (JSON; valores em reais):
${contextoParaPrompt(c)}

Observações sobre os dados:
- "medias_mensais" usa os últimos meses fechados; é a melhor base para o orçamento do mês.
- "gastos_recorrentes_provaveis" são compras repetidas em vários meses (assinaturas, contas). Podem ser revisadas.
- "etapa_da_jornada" já foi calculada pelo app; oriente a partir dela.

Responda APENAS com um JSON válido neste formato:
{
  "resumo": "2 a 4 frases: diagnóstico honesto e acolhedor da situação, citando os números principais",
  "pontos_fortes": ["1 a 3 coisas que a pessoa já faz bem (se não houver, uma frase de incentivo realista)"],
  "alertas": [{ "titulo": "curto", "explicacao": "o que está acontecendo e por que importa, com números", "gravidade": "alta|media|baixa" }],
  "plano": [{ "titulo": "curto", "acao": "o que fazer, bem concreto", "por_que": "o conceito por trás, em linguagem simples", "prazo": "esta semana|este mês|próximos 3 meses", "impacto": "efeito esperado em R$ ou meses, se der para calcular" }],
  "licao": { "tema": "um conceito financeiro mais útil para a etapa atual", "explicacao": "explicação simples em 2 a 4 frases", "exemplo": "o conceito aplicado aos números da pessoa" },
  "perguntas_sugeridas": ["3 perguntas curtas que a pessoa poderia fazer a você no chat, específicas para a situação dela"]
}
Regras: 0 a 4 alertas; 3 a 5 passos no plano, do mais urgente ao menos urgente; nada fora do JSON.`;
}

export function promptChat(c: ContextoFinanceiro, historico: { autor: "usuario" | "educador"; texto: string }[], pergunta: string): string {
	const conversa = historico
		.slice(-10)
		.map((m) => `${m.autor === "usuario" ? "Pessoa" : "Educador"}: ${m.texto.slice(0, 1200)}`)
		.join("\n");
	return `${PERSONA}

DADOS FINANCEIROS DA PESSOA (JSON; valores em reais):
${contextoParaPrompt(c)}

${conversa ? `CONVERSA ATÉ AGORA:\n${conversa}\n` : ""}
NOVA MENSAGEM DA PESSOA: "${pergunta}"

Como responder no chat:
- Responda a pergunta diretamente, em até ~180 palavras, usando os números dela quando fizer sentido.
- Pode usar **negrito** e listas com "- ". Sem tabelas e sem blocos de código.
- Se a pergunta for vaga, responda o essencial e termine com UMA pergunta para entender melhor (ex.: objetivo, prazo).
- Se for algo que você não pode fazer (indicar ativo específico, garantir retorno), explique com gentileza e ofereça o que pode: o conceito e como decidir.

AÇÕES NO APP (só quando a pessoa pedir explicitamente):
1. Cadastrar contas bancárias e/ou cartões ("cadastre o cartão X", "crie a conta Y"): confirme os itens na resposta e coloque no FINAL absoluto:
<<<ACTION_JSON
{ "contas": [{ "nome": "Santander", "tipo": "Conta Corrente", "saldo_inicial": 0, "cor_hex": "#EC0000", "instituicao": "Santander" }],
  "cartoes": [{ "nome": "Cartão Santander", "limite": 100, "fechamento_dia": 6, "vencimento_dia": 10, "cor_hex": "#EC0000", "conta_nome": "Santander" }] }
ACTION_JSON>>>
Cores por banco: Santander #EC0000, Nubank #8A05BE, Inter #FF7A00, Wise #00B9FF, Itaú #EC7000, Bradesco #CC092F, Banco do Brasil #FCFD01, C6 #242424.
2. A pessoa diz que já quitou uma dívida ("já quitei o empréstimo do Nubank"): parabenize e coloque no FINAL absoluto:
<<<ACTION_JSON
{ "quitar_divida": { "termo": "nubank" } }
ACTION_JSON>>>
O app sempre pede confirmação antes de gravar. Fora desses dois casos, não use ACTION_JSON.`;
}

/** Plano calculado no app, com as mesmas regras do educador (sem IA). */
export function relatorioLocal(c: ContextoFinanceiro): RelatorioEducador {
	const pontos: string[] = [];
	const alertas: RelatorioEducador["alertas"] = [];
	const plano: RelatorioEducador["plano"] = [];
	const maiorCat = c.categorias[0];
	const metaReserva = c.gastoMedioMensal * 6;

	if (c.sobraMediaMensal > 0) pontos.push(`Você tem sobrado em média ${moeda(c.sobraMediaMensal)} por mês (${c.taxaPoupancaMedia}% da renda).`);
	if (c.totalDividas <= 0) pontos.push("Você não tem dívidas ativas cadastradas.");
	if (c.reserva.mesesCobertos >= 3) pontos.push(`Sua reserva cobre ${c.reserva.mesesCobertos} meses de gastos.`);
	if (pontos.length === 0) pontos.push("Registrar suas finanças no app já é o primeiro passo: sem enxergar os números, não dá para melhorar.");

	if (c.rendaMediaMensal > 0 && c.sobraMediaMensal < 0) {
		alertas.push({ titulo: "Gastando mais do que ganha", explicacao: `Nos últimos meses os gastos (${moeda(c.gastoMedioMensal)}) passaram a renda (${moeda(c.rendaMediaMensal)}) em ${moeda(-c.sobraMediaMensal)} por mês. Essa diferença vira dívida ou consome a reserva.`, gravidade: "alta" });
		plano.push({ titulo: "Fechar o mês no azul", acao: `Corte ${moeda(-c.sobraMediaMensal)} por mês, começando pelos gastos variáveis${maiorCat ? ` e por ${maiorCat.nome}` : ""}.`, por_que: "Enquanto o mês fecha no vermelho, qualquer outro plano fica de pé em areia.", prazo: "este mês" });
	}
	if (c.totalDividas > 0) {
		alertas.push({ titulo: "Dívidas em aberto", explicacao: `Faltam ${moeda(c.totalDividas)} em dívidas, com ${moeda(c.parcelasDividasMes)} de parcelas por mês (${c.comprometimentoDividasPct}% da renda).`, gravidade: c.comprometimentoDividasPct >= 30 ? "alta" : "media" });
		plano.push({ titulo: "Atacar a dívida mais cara", acao: "Cadastre a taxa de juros de cada dívida e direcione qualquer sobra extra para a de juros mais altos, pagando o mínimo das outras.", por_que: "Juros de dívida crescem mais rápido que qualquer investimento comum: quitar a mais cara é o melhor 'rendimento' garantido.", prazo: "este mês" });
	}
	if (c.reserva.mesesCobertos < 6) {
		const falta = Math.max(0, metaReserva - c.reserva.disponivel);
		const mesesParaChegar = c.sobraMediaMensal > 0 ? Math.ceil(falta / c.sobraMediaMensal) : null;
		plano.push({
			titulo: "Construir a reserva de emergência",
			acao: `Separe todo mês uma parte da sobra num lugar com liquidez diária até chegar a ${moeda(metaReserva)} (6 meses dos seus gastos).`,
			por_que: "A reserva evita entrar em dívida quando surge um imprevisto (saúde, carro, perda de renda).",
			prazo: "próximos 3 meses",
			impacto: mesesParaChegar ? `Com a sobra atual, você chega lá em cerca de ${mesesParaChegar} meses.` : undefined,
		});
	}
	if (c.recorrentes.length > 0) {
		const total = c.recorrentes.reduce((s, r) => s + r.valorMedio, 0);
		plano.push({ titulo: "Revisar gastos recorrentes", acao: `Revise ${c.recorrentes.slice(0, 3).map((r) => r.descricao).join(", ")}${c.recorrentes.length > 3 ? " e outros" : ""}: cancele o que não usa.`, por_que: "Pequenos gastos fixos somam muito ao longo do ano e passam despercebidos.", prazo: "esta semana", impacto: `Esses recorrentes somam ~${moeda(total)}/mês.` });
	}
	if (c.cartoes.some((k) => k.usoLimitePct > 80)) {
		alertas.push({ titulo: "Limite do cartão quase todo comprometido", explicacao: "Faturas e parcelas futuras já usam mais de 80% do limite de algum cartão. Parcelar demais compromete a renda dos próximos meses.", gravidade: "media" });
	}
	if (plano.length < 3 && maiorCat) {
		plano.push({ titulo: `Definir um teto para ${maiorCat.nome}`, acao: `Defina um limite mensal para ${maiorCat.nome} (hoje ~${moeda(maiorCat.mediaMensal)}/mês, ${maiorCat.pct}% dos gastos do ano).`, por_que: "Um teto por categoria transforma 'tentar gastar menos' em uma meta que dá para acompanhar.", prazo: "este mês" });
	}
	if (plano.length < 3) {
		plano.push({ titulo: "Pagar-se primeiro", acao: "No dia em que a renda cair, separe logo o valor de guardar, antes de gastar.", por_que: "O que sobra no fim do mês costuma ser zero; o que se separa no começo, não.", prazo: "este mês" });
	}

	const licoes: Record<Fase, RelatorioEducador["licao"]> = {
		organizar: { tema: "Orçamento 50-30-20", explicacao: "Uma referência simples: 50% da renda para necessidades, 30% para desejos e 20% para o futuro (guardar ou quitar dívidas).", exemplo: `Com renda de ${moeda(c.rendaMediaMensal)}, seriam ${moeda(c.rendaMediaMensal * 0.5)} para necessidades, ${moeda(c.rendaMediaMensal * 0.3)} para desejos e ${moeda(c.rendaMediaMensal * 0.2)} para o futuro.` },
		sair_das_dividas: { tema: "Juros compostos contra você", explicacao: "Nas dívidas, os juros incidem sobre juros: o valor cresce cada vez mais rápido. Por isso a ordem importa: primeiro a de juros mais altos.", exemplo: `Suas parcelas de dívida somam ${moeda(c.parcelasDividasMes)}/mês. Cada dívida quitada libera essa parcela para a próxima, num efeito bola de neve.` },
		construir_reserva: { tema: "Reserva de emergência", explicacao: "É um dinheiro guardado para imprevistos, em aplicação segura e com resgate imediato. O tamanho recomendado é de 3 a 6 meses dos seus gastos.", exemplo: `Seus gastos médios são ${moeda(c.gastoMedioMensal)}/mês: a reserva ideal fica entre ${moeda(c.gastoMedioMensal * 3)} e ${moeda(metaReserva)}. Hoje você tem ${moeda(c.reserva.disponivel)}.` },
		investir_e_metas: { tema: "Juros compostos a seu favor", explicacao: "Investindo com regularidade, os rendimentos passam a render também. O tempo é o maior aliado: começar cedo vale mais do que começar com muito.", exemplo: `Investindo ${moeda(Math.max(100, c.sobraMediaMensal))} por mês por 10 anos, o rendimento sobre o rendimento faz o total crescer bem além do que você depositou.` },
	};

	return {
		resumo: `Nos últimos meses sua renda média foi ${moeda(c.rendaMediaMensal)} e seus gastos ${moeda(c.gastoMedioMensal)}, ${c.sobraMediaMensal >= 0 ? `sobrando ${moeda(c.sobraMediaMensal)}` : `faltando ${moeda(-c.sobraMediaMensal)}`} por mês. Sua reserva cobre ${c.reserva.mesesCobertos} meses de gastos${c.totalDividas > 0 ? ` e há ${moeda(c.totalDividas)} em dívidas` : ""}.`,
		pontos_fortes: pontos.slice(0, 3),
		alertas: alertas.slice(0, 4),
		plano: plano.slice(0, 5),
		licao: licoes[c.fase],
		perguntas_sugeridas: perguntasSugeridas(c),
		local: true,
	};
}

/** Perguntas de 1 clique, a partir da situação da pessoa. */
export function perguntasSugeridas(c: ContextoFinanceiro): string[] {
	const p: string[] = [];
	if (c.sobraMediaMensal < 0) p.push("Onde posso cortar para fechar o mês no azul?");
	if (c.totalDividas > 0) p.push("Qual dívida devo quitar primeiro?");
	if (c.reserva.mesesCobertos < 6) p.push("Quanto preciso guardar por mês para a reserva?");
	if (c.cartoes.some((k) => k.usoLimitePct > 60)) p.push("Como usar o cartão sem me enrolar?");
	if (c.recorrentes.length > 0) p.push("Quais gastos recorrentes valem revisar?");
	if (c.metas.length > 0) p.push(`Vou conseguir bater a meta "${c.metas[0].titulo}" no prazo?`);
	if (c.fase === "investir_e_metas") p.push("Por onde começo a investir?");
	p.push("O que é a regra 50-30-20 no meu caso?");
	return [...new Set(p)].slice(0, 4);
}

/** Valida o JSON da IA (formato errado vira null e o app usa o plano local). */
export function validarRelatorio(r: any): RelatorioEducador | null {
	if (!r || typeof r !== "object" || typeof r.resumo !== "string" || !Array.isArray(r.plano) || r.plano.length === 0) return null;
	const txt = (v: any) => (typeof v === "string" ? v : "");
	return {
		resumo: r.resumo,
		pontos_fortes: Array.isArray(r.pontos_fortes) ? r.pontos_fortes.map(txt).filter(Boolean).slice(0, 3) : [],
		alertas: Array.isArray(r.alertas)
			? r.alertas.filter((a: any) => a?.titulo).slice(0, 4).map((a: any) => ({ titulo: txt(a.titulo), explicacao: txt(a.explicacao), gravidade: ["alta", "media", "baixa"].includes(a.gravidade) ? a.gravidade : "media" }))
			: [],
		plano: r.plano.filter((p: any) => p?.titulo).slice(0, 5).map((p: any) => ({ titulo: txt(p.titulo), acao: txt(p.acao), por_que: txt(p.por_que), prazo: txt(p.prazo) || "este mês", impacto: txt(p.impacto) || undefined })),
		licao: { tema: txt(r.licao?.tema) || "Educação financeira", explicacao: txt(r.licao?.explicacao), exemplo: txt(r.licao?.exemplo) },
		perguntas_sugeridas: Array.isArray(r.perguntas_sugeridas) ? r.perguntas_sugeridas.map(txt).filter(Boolean).slice(0, 4) : [],
	};
}
