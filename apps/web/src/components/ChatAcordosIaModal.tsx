import { useEffect, useMemo, useRef, useState } from "react";
import {
	AlertCircle,
	Bot,
	CheckCircle2,
	ChevronRight,
	Loader2,
	RotateCcw,
	Send,
	ShieldCheck,
	Sparkles,
	User,
	X,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { aiService } from "../../../../packages/services/ai.service";
import { supabase } from "../../../../packages/services/supabase";
import { notificarDivisaoPorEmail } from "../../../../packages/services/convite.service";
import type { Grupo, GrupoMembro } from "../../../../packages/services/despesas-compartilhadas.service";

/* ============================================================================
 * Assistente de divisão de contas
 * ----------------------------------------------------------------------------
 * Conversa guiada: um RASCUNHO vai sendo preenchido a cada mensagem e o app
 * (não a IA) decide qual informação ainda falta e pergunta, com botões de
 * resposta rápida. Respostas simples ("05/11/2026 todas", "meio a meio", "3x",
 * "eu paguei") são entendidas localmente; texto livre vai para a IA, que só
 * atualiza o rascunho. Nada é gravado antes da confirmação no resumo final.
 * ========================================================================== */

interface ChatAcordosIaModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess: () => void;
	userId?: string;
	contatosDisponiveis?: any[];
	/** Grupos do usuário: permite dizer "no grupo X" */
	grupos?: Grupo[];
	/** Grupo aberto na tela (o assistente já assume esse grupo) */
	grupoInicial?: Grupo | null;
}

type Divisao = "IGUAL" | "VALOR" | "PERCENTUAL";

interface ItemDivisao {
	id: string;
	descricao: string;
	valorTotal: number | null;
	dataCompra: string | null; // AAAA-MM-DD
	parcelas: number | null;
	divisao: Divisao | null;
	valorOutro: number | null;
	percentualOutro: number | null;
	opcional: boolean;
}

interface PagamentoAcordo {
	data: string; // DD/MM ou DD/MM/AAAA
	valor: number;
	observacao?: string;
	pago?: boolean;
}

interface Rascunho {
	modo: "DIVISAO" | "ACORDO" | null;
	pessoaNome: string | null;
	contatoId: string | null;
	grupoId: string | null;
	membroId: string | null;
	quemPagou: "EU" | "OUTRO" | null;
	jaNoExtrato: boolean | null;
	/** Dia do mês em que vencem as parcelas (0 = mesmo dia da compra) */
	diaVencimento: number | null;
	opcionaisDecididos: boolean;
	/** Já perguntamos se a divisão é dentro de um grupo em que a pessoa está */
	grupoDecidido: boolean;
	itens: ItemDivisao[];
	tipoRelacao: "DEVO_PARA_ELE" | "ELE_ME_DEVE" | null;
	cronograma: PagamentoAcordo[];
}

type Pergunta =
	| "itens"
	| "pessoa"
	| "membro"
	| "grupo"
	| "valor"
	| "data"
	| "parcelas"
	| "vencimento"
	| "divisao"
	| "valorOutro"
	| "quemPagou"
	| "extrato"
	| "opcionais"
	| "tipoRelacao"
	| "confirmar";

interface Chip {
	rotulo: string;
	aplicar: (r: Rascunho) => Rascunho | "MARCAR_OPCIONAIS";
}

interface Mensagem {
	id: string;
	autor: "user" | "ai";
	texto: string;
	chips?: Chip[];
	widget?: "opcionais" | "resumo";
	hora: string;
}

interface Lancamento {
	itemId?: string;
	data: string; // AAAA-MM-DD
	descricao: string;
	valor: number;
	opcional: boolean;
	pago: boolean;
	parcela: number;
	totalParcelas: number;
}

/* ------------------------------- utilidades ------------------------------- */

const pad = (n: number) => String(n).padStart(2, "0");
const isoDe = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hojeISO = () => isoDe(new Date());
const ontemISO = () => {
	const d = new Date();
	d.setDate(d.getDate() - 1);
	return isoDe(d);
};
const dataBR = (iso: string) => {
	const [a, m, d] = iso.split("-");
	return `${d}/${m}/${a}`;
};
const moeda = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const centavos = (v: number) => Math.round(v * 100) / 100;
const agora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const semAcento = (t: string) =>
	String(t || "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.trim();

/** Mesmo dia N meses depois (31/01 + 1 mês = 28/02). */
const somarMeses = (iso: string, n: number) => {
	const [a, m, d] = iso.split("-").map(Number);
	const alvo = new Date(a, m - 1 + n, 1);
	const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
	return `${alvo.getFullYear()}-${pad(alvo.getMonth() + 1)}-${pad(Math.min(d, ultimoDia))}`;
};

/** "05/11/2026", "5/11", "hoje", "ontem" -> AAAA-MM-DD */
const lerData = (texto: string): string | null => {
	const t = semAcento(texto);
	if (/\bhoje\b/.test(t)) return hojeISO();
	if (/\bontem\b/.test(t)) return ontemISO();
	const iso = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
	if (iso) {
		const [a, me, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
		return me >= 1 && me <= 12 && d >= 1 && d <= 31 ? `${a}-${pad(me)}-${pad(d)}` : null;
	}
	const m = t.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/);
	if (!m) return null;
	const dia = Number(m[1]);
	const mes = Number(m[2]);
	let ano = m[3] ? Number(m[3]) : new Date().getFullYear();
	if (ano < 100) ano += 2000;
	if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
	return `${ano}-${pad(mes)}-${pad(dia)}`;
};

const todasAsDatas = (texto: string) =>
	[...semAcento(texto).matchAll(/\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g)].map((m) => lerData(m[0])).filter(Boolean) as string[];

/** "R$ 1.600,00", "320", "320,5", "45.90" -> número */
const lerValor = (texto: string): number | null => {
	const m = String(texto).match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
	if (!m) return null;
	const bruto = m[1];
	const n = bruto.includes(",")
		? Number(bruto.replace(/\./g, "").replace(",", "."))
		: /^\d{1,3}(\.\d{3})+$/.test(bruto)
			? Number(bruto.replace(/\./g, ""))
			: Number(bruto);
	return Number.isFinite(n) && n > 0 ? n : null;
};

const numeroSeguro = (v: any): number | null => {
	if (v === null || v === undefined || v === "") return null;
	if (typeof v === "number") return Number.isFinite(v) ? v : null;
	return lerValor(String(v));
};

const rascunhoVazio = (): Rascunho => ({
	modo: null,
	pessoaNome: null,
	contatoId: null,
	grupoId: null,
	membroId: null,
	quemPagou: null,
	jaNoExtrato: null,
	diaVencimento: null,
	opcionaisDecididos: false,
	grupoDecidido: false,
	itens: [],
	tipoRelacao: null,
	cronograma: [],
});

const aplicarEmTodos = (r: Rascunho, campo: keyof ItemDivisao, valor: any, soVazios = true): Rascunho => ({
	...r,
	itens: r.itens.map((i) => (soVazios && i[campo] !== null && i[campo] !== undefined ? i : { ...i, [campo]: valor })),
});

/** Parte da outra pessoa em um item. */
const parteDoOutro = (i: ItemDivisao) => {
	const total = i.valorTotal || 0;
	if (i.divisao === "VALOR") return Math.min(total, i.valorOutro || 0);
	if (i.divisao === "PERCENTUAL") return centavos((total * (i.percentualOutro || 0)) / 100);
	return centavos(total / 2);
};

/** "DD/MM" do acordo -> ISO, virando o ano quando o mês "volta" (10, 11, 12, 01...). */
const datasDoAcordo = (cronograma: PagamentoAcordo[]) => {
	const anoAtual = new Date().getFullYear();
	let ano = anoAtual;
	let mesAnterior = 0;
	return cronograma.map((p) => {
		const [d, m, a] = p.data.split("/");
		const mes = Number(m);
		if (a) {
			ano = Number(a.length === 2 ? `20${a}` : a);
		} else if (mesAnterior && mes < mesAnterior) {
			ano += 1;
		}
		mesAnterior = mes;
		return `${ano}-${pad(mes)}-${pad(Number(d))}`;
	});
};

/**
 * N-ésima parcela com vencimento no dia `dia`: a 1ª vence no próprio mês da
 * compra se o dia ainda não passou, senão no mês seguinte (dia 31 em fevereiro = 28/29).
 */
const vencimento = (dataCompra: string, dia: number, n: number) => {
	const [a, m, d] = dataCompra.split("-").map(Number);
	const inicio = d <= dia ? 0 : 1;
	const alvo = new Date(a, m - 1 + inicio + n, 1);
	const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
	return `${alvo.getFullYear()}-${pad(alvo.getMonth() + 1)}-${pad(Math.min(dia, ultimo))}`;
};

const gerarLancamentos = (r: Rascunho): Lancamento[] => {
	if (r.modo === "ACORDO") {
		const datas = datasDoAcordo(r.cronograma);
		return r.cronograma.map((p, idx) => ({
			data: datas[idx],
			descricao: `Acordo ${idx + 1}/${r.cronograma.length}${p.observacao ? ` — ${p.observacao}` : ""}`,
			valor: centavos(p.valor),
			opcional: false,
			pago: Boolean(p.pago),
			parcela: idx + 1,
			totalParcelas: r.cronograma.length,
		}));
	}
	const out: Lancamento[] = [];
	for (const i of r.itens) {
		if (!i.valorTotal || !i.dataCompra) continue;
		const outro = parteDoOutro(i);
		const devido = r.quemPagou === "OUTRO" ? centavos(i.valorTotal - outro) : outro;
		if (devido <= 0) continue;
		const n = Math.max(1, i.parcelas || 1);
		const base = centavos(devido / n);
		const dia = n > 1 && r.diaVencimento ? r.diaVencimento : 0;
		for (let p = 0; p < n; p++) {
			out.push({
				itemId: i.id,
				data: dia ? vencimento(i.dataCompra, dia, p) : somarMeses(i.dataCompra, p),
				descricao: n > 1 ? `${i.descricao} (${p + 1}/${n})` : i.descricao,
				valor: p === n - 1 ? centavos(devido - base * (n - 1)) : base,
				opcional: r.quemPagou === "EU" && i.opcional,
				pago: false,
				parcela: p + 1,
				totalParcelas: n,
			});
		}
	}
	return out;
};

/** Agrupa as parcelas por data de vencimento (para o resumo não virar uma lista de 180 linhas). */
const porData = (lanc: Lancamento[]) => {
	const mapa = new Map<string, { data: string; total: number; opcional: number; itens: Lancamento[] }>();
	for (const l of lanc) {
		const g = mapa.get(l.data) || { data: l.data, total: 0, opcional: 0, itens: [] };
		g.total = centavos(g.total + l.valor);
		if (l.opcional) g.opcional = centavos(g.opcional + l.valor);
		g.itens.push(l);
		mapa.set(l.data, g);
	}
	return [...mapa.values()].sort((a, b) => a.data.localeCompare(b.data));
};

/* ------------------------------- componente ------------------------------- */

export default function ChatAcordosIaModal({
	isOpen,
	onClose,
	onSuccess,
	userId = "",
	contatosDisponiveis = [],
	grupos = [],
	grupoInicial = null,
}: ChatAcordosIaModalProps) {
	const contatos = contatosDisponiveis || [];
	const [input, setInput] = useState("");
	const [pensando, setPensando] = useState(false);
	const [salvando, setSalvando] = useState(false);
	const [rascunho, setRascunho] = useState<Rascunho>(rascunhoVazio);
	const [pergunta, setPergunta] = useState<Pergunta>("itens");
	const [mensagens, setMensagens] = useState<Mensagem[]>([]);
	const [marcados, setMarcados] = useState<Set<string>>(new Set());
	const fimRef = useRef<HTMLDivElement>(null);

	const grupoAtual = useMemo(() => grupos.find((g) => g.id === rascunho.grupoId) || null, [grupos, rascunho.grupoId]);
	const outrosDoGrupo = (g: Grupo | null) => (g?.membros || []).filter((m) => !m.is_user);
	const meuMembro = (g: Grupo | null) => (g?.membros || []).find((m) => m.is_user);
	const nomeOutro = rascunho.pessoaNome || "a outra pessoa";
	const primeiroNome = nomeOutro.split(" ")[0];

	/* ----------------------- pessoa, contato e grupo ----------------------- */

	const encontrarContato = (texto: string) => {
		const alvo = semAcento(texto);
		const completo = contatos
			.filter((c) => c.nome && alvo.includes(semAcento(c.nome)))
			.sort((a, b) => b.nome.length - a.nome.length)[0];
		if (completo) return completo;
		const palavras = new Set(alvo.split(/[^a-z0-9]+/).filter(Boolean));
		const porPrimeiro = contatos.filter((c) => c.nome && palavras.has(semAcento(c.nome).split(/\s+/)[0]));
		return porPrimeiro.length === 1 ? porPrimeiro[0] : null;
	};

	const encontrarGrupo = (texto: string): Grupo | null => {
		const t = semAcento(texto);
		const m = t.match(/grupo\s+["'“]?([^"'”\n,.;!?]+)/);
		if (m) {
			const nome = m[1].trim();
			const g =
				grupos.find((x) => semAcento(x.nome) === nome) ||
				grupos.find((x) => nome.startsWith(`${semAcento(x.nome)} `));
			if (g) return g;
		}
		return grupos.find((x) => semAcento(x.nome) === t) || null;
	};

	const definirMembro = (r: Rascunho, membro: GrupoMembro): Rascunho => {
		const contato = contatos.find((c) => c.id === membro.contato_id);
		const mesmoNome = semAcento(r.pessoaNome || "") === semAcento(membro.nome);
		return {
			...r,
			membroId: membro.id,
			contatoId: contato?.id || (mesmoNome ? r.contatoId : null),
			pessoaNome: contato?.nome || membro.nome,
		};
	};

	/** Liga ao grupo; com só uma outra pessoa no grupo, ela já é a contraparte. */
	const definirGrupo = (r: Rascunho, g: Grupo, texto = ""): Rascunho => {
		const outros = outrosDoGrupo(g);
		const base: Rascunho = { ...r, grupoId: g.id, membroId: null };
		if (outros.length === 1) return definirMembro(base, outros[0]);
		const alvo = semAcento(texto || r.pessoaNome || "");
		const citado = outros.find((o) => alvo && alvo.includes(semAcento(o.nome)));
		return citado ? definirMembro(base, citado) : { ...base, pessoaNome: null, contatoId: null };
	};

	const definirPessoa = (r: Rascunho, nome: string): Rascunho => {
		const g = grupos.find((x) => x.id === r.grupoId) || null;
		if (g) {
			const membro = outrosDoGrupo(g).find(
				(o) => semAcento(o.nome) === semAcento(nome) || semAcento(o.nome).split(" ")[0] === semAcento(nome).split(" ")[0],
			);
			if (membro) return definirMembro(r, membro);
		}
		const c = encontrarContato(nome);
		return { ...r, contatoId: c?.id || null, pessoaNome: c?.nome || nome.trim() };
	};

	/* ------------------------------ perguntas ------------------------------ */

	const gruposDaPessoa = (r: Rascunho) =>
		r.grupoId || !r.pessoaNome
			? []
			: grupos.filter((g) =>
					outrosDoGrupo(g).some(
						(m) => (r.contatoId && m.contato_id === r.contatoId) || semAcento(m.nome) === semAcento(r.pessoaNome || ""),
					),
				);

	const proximaPergunta = (r: Rascunho): Pergunta => {
		if (r.modo === "ACORDO" ? r.cronograma.length === 0 : r.itens.length === 0) return "itens";
		if (!r.pessoaNome) return r.grupoId && outrosDoGrupo(grupos.find((g) => g.id === r.grupoId) || null).length > 1 ? "membro" : "pessoa";
		if (!r.grupoDecidido && gruposDaPessoa(r).length > 0) return "grupo";
		if (r.modo === "ACORDO") return r.tipoRelacao ? "confirmar" : "tipoRelacao";
		if (r.itens.some((i) => !i.valorTotal)) return "valor";
		if (r.itens.some((i) => !i.dataCompra)) return "data";
		if (r.itens.some((i) => !i.parcelas)) return "parcelas";
		if (r.itens.some((i) => (i.parcelas || 1) > 1) && r.diaVencimento === null) return "vencimento";
		if (r.itens.some((i) => !i.divisao)) return "divisao";
		if (r.itens.some((i) => (i.divisao === "VALOR" && i.valorOutro === null) || (i.divisao === "PERCENTUAL" && i.percentualOutro === null)))
			return "valorOutro";
		if (!r.quemPagou) return "quemPagou";
		if (r.quemPagou === "EU" && r.jaNoExtrato === null) return "extrato";
		if (r.quemPagou === "EU" && !r.opcionaisDecididos) return "opcionais";
		return "confirmar";
	};

	const listaItens = (itens: ItemDivisao[]) =>
		itens.map((i) => `• ${i.descricao}${i.valorTotal ? ` — ${moeda(i.valorTotal)}` : ""}`).join("\n");

	const montarPergunta = (p: Pergunta, r: Rascunho): Omit<Mensagem, "id" | "autor" | "hora"> => {
		const nome = r.pessoaNome || "a outra pessoa";
		const pn = nome.split(" ")[0];
		const varios = r.itens.length > 1;
		const g = grupos.find((x) => x.id === r.grupoId) || null;
		switch (p) {
			case "itens":
				return {
					texto:
						"O que você quer dividir? Me mande a **descrição e o valor** de cada compra (pode ser uma por linha).\n\nSe for um acordo com cronograma de pagamentos, é só colar o texto.",
				};
			case "pessoa":
				return {
					texto: "Com quem você vai dividir? Escolha abaixo ou escreva o nome (se for alguém novo, eu cadastro).",
					chips: [
						...grupos.slice(0, 6).map((gr) => ({ rotulo: `Grupo ${gr.nome}`, aplicar: (x: Rascunho) => definirGrupo(x, gr) })),
						...contatos.slice(0, 10).map((c) => ({ rotulo: c.nome, aplicar: (x: Rascunho) => ({ ...x, contatoId: c.id, pessoaNome: c.nome }) })),
					],
				};
			case "grupo": {
				const gs = gruposDaPessoa(r);
				return {
					texto:
						gs.length === 1
							? `${pn} está no grupo **${gs[0].nome}**. Quer lançar dentro do grupo? Assim aparece no balanço e nas despesas do grupo.`
							: `${pn} está em mais de um grupo. Quer lançar dentro de algum deles?`,
					chips: [
						...gs.map((gr) => ({
							rotulo: gs.length === 1 ? `Sim, no grupo ${gr.nome}` : `Grupo ${gr.nome}`,
							aplicar: (x: Rascunho) => ({ ...definirGrupo(x, gr, x.pessoaNome || ""), grupoDecidido: true }),
						})),
						{ rotulo: "Não, só entre nós", aplicar: (x: Rascunho) => ({ ...x, grupoDecidido: true }) },
					],
				};
			}
			case "membro":
				return {
					texto: `Com quem do grupo **${g?.nome}** é essa divisão?`,
					chips: outrosDoGrupo(g).map((m) => ({ rotulo: m.nome, aplicar: (x: Rascunho) => definirMembro(x, m) })),
				};
			case "valor": {
				const item = r.itens.find((i) => !i.valorTotal)!;
				return { texto: `Qual o valor total de **${item.descricao}**?` };
			}
			case "data": {
				const faltam = r.itens.filter((i) => !i.dataCompra);
				return {
					texto: varios
						? `Qual a **data da compra**?\n${listaItens(faltam)}\n\nSe for a mesma para todas, mande só a data (ex.: 05/11/2026).`
						: `Qual a **data da compra** de ${r.itens[0].descricao}?`,
					chips: [
						{ rotulo: `Hoje (${dataBR(hojeISO()).slice(0, 5)})`, aplicar: (x) => aplicarEmTodos(x, "dataCompra", hojeISO()) },
						{ rotulo: `Ontem (${dataBR(ontemISO()).slice(0, 5)})`, aplicar: (x) => aplicarEmTodos(x, "dataCompra", ontemISO()) },
					],
				};
			}
			case "parcelas":
				return {
					texto: varios
						? "Foi **à vista ou parcelado**? Se cada compra for diferente, me diga (ex.: \"mercado à vista, tênis em 3x\")."
						: `${r.itens[0].descricao} foi **à vista ou parcelado**?`,
					chips: [
						{ rotulo: varios ? "Tudo à vista" : "À vista", aplicar: (x) => aplicarEmTodos(x, "parcelas", 1) },
						...[2, 3, 6, 10, 12].map((n) => ({ rotulo: `${n}x`, aplicar: (x: Rascunho) => aplicarEmTodos(x, "parcelas", n) })),
					],
				};
			case "vencimento": {
				const diaCompra = Number((r.itens.find((i) => (i.parcelas || 1) > 1)?.dataCompra || hojeISO()).slice(8, 10));
				return {
					texto: "Em que **dia do mês** vencem as parcelas? (ex.: \"dia 29\")",
					chips: [
						{ rotulo: `Mesmo dia da compra (${diaCompra})`, aplicar: (x) => ({ ...x, diaVencimento: 0 }) },
						...[5, 10, 15, 20, 25].map((d) => ({ rotulo: `Dia ${d}`, aplicar: (x: Rascunho) => ({ ...x, diaVencimento: d }) })),
					],
				};
			}
			case "divisao":
				return {
					texto: `Como dividir com ${pn}?`,
					chips: [
						{ rotulo: varios ? "Meio a meio em tudo" : "Meio a meio", aplicar: (x) => aplicarEmTodos(x, "divisao", "IGUAL") },
						{ rotulo: "Valor exato", aplicar: (x) => aplicarEmTodos(x, "divisao", "VALOR") },
						{ rotulo: "Porcentagem", aplicar: (x) => aplicarEmTodos(x, "divisao", "PERCENTUAL") },
					],
				};
			case "valorOutro": {
				const item = r.itens.find(
					(i) => (i.divisao === "VALOR" && i.valorOutro === null) || (i.divisao === "PERCENTUAL" && i.percentualOutro === null),
				)!;
				return {
					texto:
						item.divisao === "PERCENTUAL"
							? `Quantos **%** de ${item.descricao} (${moeda(item.valorTotal || 0)}) ficam para ${pn}?`
							: `Quanto de **${item.descricao}** (${moeda(item.valorTotal || 0)}) fica para ${pn}?`,
					chips: [{ rotulo: "Meio a meio neste", aplicar: (x) => ({ ...x, itens: x.itens.map((i) => (i.id === item.id ? { ...i, divisao: "IGUAL" } : i)) }) }],
				};
			}
			case "quemPagou":
				return {
					texto: "Quem pagou?",
					chips: [
						{ rotulo: "Eu paguei", aplicar: (x) => ({ ...x, quemPagou: "EU" }) },
						{ rotulo: `${pn} pagou`, aplicar: (x) => ({ ...x, quemPagou: "OUTRO", jaNoExtrato: false, opcionaisDecididos: true }) },
					],
				};
			case "extrato":
				return {
					texto:
						"Essa compra **já está (ou vai entrar) no seu extrato ou fatura**?\n\nSe sim, eu registro só o que te devem — sem somar de novo nos seus gastos quando você importar o extrato.",
					chips: [
						{ rotulo: "Sim, não duplicar", aplicar: (x) => ({ ...x, jaNoExtrato: true }) },
						{ rotulo: "Não, contar como gasto", aplicar: (x) => ({ ...x, jaNoExtrato: false }) },
					],
				};
			case "opcionais":
				return {
					texto: `Estes são os itens que ${pn} vai te pagar:\n${r.itens
						.map((i) => `• ${i.descricao} — ${moeda(parteDoOutro(i))}${(i.parcelas || 1) > 1 ? ` em ${i.parcelas}x` : ""}`)
						.join("\n")}\n\nQuer marcar algum como **opcional**? Cobranças opcionais podem ser **recusadas** por ${pn} no app.`,
					chips: [
						{ rotulo: "Nenhum é opcional", aplicar: (x) => ({ ...x, opcionaisDecididos: true, itens: x.itens.map((i) => ({ ...i, opcional: false })) }) },
						{ rotulo: "Marcar agora", aplicar: () => "MARCAR_OPCIONAIS" },
						{ rotulo: "Decidir depois", aplicar: (x) => ({ ...x, opcionaisDecididos: true }) },
					],
				};
			case "tipoRelacao":
				return {
					texto: "Nesse acordo, quem deve para quem?",
					chips: [
						{ rotulo: `Eu devo para ${pn}`, aplicar: (x) => ({ ...x, tipoRelacao: "DEVO_PARA_ELE" }) },
						{ rotulo: `${pn} me deve`, aplicar: (x) => ({ ...x, tipoRelacao: "ELE_ME_DEVE" }) },
					],
				};
			case "confirmar":
				return {
					texto: "Pronto! Confira o resumo. Se quiser mudar algo, é só me dizer (ex.: \"o mercado foi em 3x\").",
					widget: "resumo",
				};
		}
	};

	const enviarAi = (texto: string, extra?: Partial<Mensagem>) =>
		setMensagens((prev) => [...prev, { id: novoId(), autor: "ai", texto, hora: agora(), ...extra }]);

	/** Aplica o novo rascunho e faz a próxima pergunta. */
	const avancar = (r: Rascunho, prefixo = "") => {
		const p = proximaPergunta(r);
		setRascunho(r);
		setPergunta(p);
		const q = montarPergunta(p, r);
		enviarAi(prefixo ? `${prefixo}\n\n${q.texto}` : q.texto, { chips: q.chips, widget: q.widget });
	};

	/* --------------------- interpretação local (sem IA) --------------------- */

	const interpretarLocal = (p: Pergunta, texto: string, r: Rascunho): Rascunho | null => {
		const t = semAcento(texto);
		const curto = texto.length <= 80;
		const paraTodos = /\b(todas?|todos?|tudo|mesma|ambas?|ambos)\b/.test(t) || r.itens.filter((i) => !i.dataCompra).length <= 1;
		switch (p) {
			case "pessoa": {
				const g = encontrarGrupo(texto);
				if (g) return definirGrupo(r, g, texto);
				if (!curto || /\d/.test(t)) return null;
				const c = encontrarContato(texto);
				if (c) return { ...r, contatoId: c.id, pessoaNome: c.nome };
				const nome = texto.replace(/^(?:[eé]\s+)?(?:com|para|pra|de)\s+(?:[oa]\s+)?/i, "").replace(/[.!?]+$/, "").trim();
				return nome.length >= 2 && nome.split(/\s+/).length <= 6 ? { ...r, contatoId: null, pessoaNome: nome } : null;
			}
			case "grupo": {
				const gs = gruposDaPessoa(r);
				const citado = encontrarGrupo(texto);
				if (citado) return { ...definirGrupo(r, citado, r.pessoaNome || ""), grupoDecidido: true };
				if (/^(sim|s|isso|pode|no grupo)\b/.test(t) && gs.length === 1)
					return { ...definirGrupo(r, gs[0], r.pessoaNome || ""), grupoDecidido: true };
				if (/^(nao|n|so entre|só entre)\b/.test(t)) return { ...r, grupoDecidido: true };
				return null;
			}
			case "membro": {
				const membro = outrosDoGrupo(grupoAtual).find((o) => t.includes(semAcento(o.nome).split(" ")[0]));
				return membro ? definirMembro(r, membro) : null;
			}
			case "valor": {
				const v = curto ? lerValor(texto) : null;
				if (!v) return null;
				const alvo = r.itens.find((i) => !i.valorTotal)!;
				return { ...r, itens: r.itens.map((i) => (i.id === alvo.id ? { ...i, valorTotal: v } : i)) };
			}
			case "data": {
				const datas = todasAsDatas(texto);
				const d = datas.length <= 1 ? lerData(texto) : null;
				// Só a data (com ou sem "todas") vale para todas as compras sem data
				const resto = t
					.replace(/\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g, "")
					.replace(/\b(todas?|todos?|tudo|mesma|data|ambas?|ambos|as|os|e|de|para|pra|hoje|ontem|foi|foram)\b/g, "")
					.replace(/[^a-z]/g, "");
				if (!d || (!paraTodos && resto.length > 0)) return null;
				return aplicarEmTodos(r, "dataCompra", d);
			}
			case "parcelas": {
				if (!curto) return null;
				if (/\b(a vista|avista|vista)\b/.test(t) && !/\d+\s*x/.test(t)) return aplicarEmTodos(r, "parcelas", 1);
				const ns = [...t.matchAll(/(\d{1,2})\s*(?:x|vezes|parcelas?)\b/g)].map((m) => Number(m[1]));
				return ns.length === 1 && ns[0] >= 1 && ns[0] <= 48 ? aplicarEmTodos(r, "parcelas", ns[0]) : null;
			}
			case "vencimento": {
				if (!curto) return null;
				if (/mesmo dia|da compra/.test(t)) return { ...r, diaVencimento: 0 };
				const d = t.match(/\b(\d{1,2})\b/);
				return d && Number(d[1]) >= 1 && Number(d[1]) <= 31 ? { ...r, diaVencimento: Number(d[1]) } : null;
			}
			case "divisao":
				if (!curto) return null;
				if (/meio a meio|metade|50 ?%|igual/.test(t)) return aplicarEmTodos(r, "divisao", "IGUAL");
				if (/porcent|%/.test(t)) return aplicarEmTodos(r, "divisao", "PERCENTUAL");
				if (/valor|exato/.test(t)) return aplicarEmTodos(r, "divisao", "VALOR");
				return null;
			case "valorOutro": {
				const item = r.itens.find(
					(i) => (i.divisao === "VALOR" && i.valorOutro === null) || (i.divisao === "PERCENTUAL" && i.percentualOutro === null),
				)!;
				const v = curto ? lerValor(texto) : null;
				if (!v) return null;
				if (item.divisao === "PERCENTUAL" && v > 100) return null;
				if (item.divisao === "VALOR" && v > (item.valorTotal || 0)) return null;
				return {
					...r,
					itens: r.itens.map((i) =>
						i.id === item.id ? (i.divisao === "PERCENTUAL" ? { ...i, percentualOutro: v } : { ...i, valorOutro: v }) : i,
					),
				};
			}
			case "quemPagou":
				if (!curto) return null;
				if (/^(eu|fui eu|eu paguei|paguei)\b/.test(t)) return { ...r, quemPagou: "EU" };
				if (/\b(ela|ele)\b/.test(t) || (r.pessoaNome && t.includes(semAcento(r.pessoaNome).split(" ")[0])))
					return { ...r, quemPagou: "OUTRO", jaNoExtrato: false, opcionaisDecididos: true };
				return null;
			case "extrato":
				if (/^(sim|s|ja|já|esta|está|vai)\b/.test(t)) return { ...r, jaNoExtrato: true };
				if (/^(nao|não|n)\b/.test(t)) return { ...r, jaNoExtrato: false };
				return null;
			case "opcionais":
				if (/^(nenhum|nao|não)\b/.test(t)) return { ...r, opcionaisDecididos: true, itens: r.itens.map((i) => ({ ...i, opcional: false })) };
				if (/depois/.test(t)) return { ...r, opcionaisDecididos: true };
				if (/^(todos?|todas?)\b/.test(t)) return { ...r, opcionaisDecididos: true, itens: r.itens.map((i) => ({ ...i, opcional: true })) };
				return null;
			case "tipoRelacao":
				if (/eu devo|devo/.test(t)) return { ...r, tipoRelacao: "DEVO_PARA_ELE" };
				if (/me deve|deve pra mim|deve para mim/.test(t)) return { ...r, tipoRelacao: "ELE_ME_DEVE" };
				return null;
			default:
				return null;
		}
	};

	/**
	 * Ajustes citando o item, sem IA: "tênis em 3x, o resto à vista",
	 * "mercado dia 03/11", "uber meio a meio". Trechos com "resto/demais/outros"
	 * valem para os itens não citados.
	 */
	const ajustesPorItem = (texto: string, r: Rascunho): Rascunho | null => {
		if (r.modo !== "DIVISAO" || r.itens.length === 0) return null;
		const trechos = semAcento(texto)
			.split(/[,;\n]|\s+e\s+(?=\S+\s)/)
			.map((t) => t.trim())
			.filter(Boolean);
		const citados = new Set<string>();
		let mudou = false;
		let itens = r.itens.map((i) => ({ ...i }));
		const aplicar = (alvo: ItemDivisao, trecho: string) => {
			const n = trecho.match(/(\d{1,2})\s*(?:x|vezes|parcelas?)\b/);
			if (n && Number(n[1]) >= 1 && Number(n[1]) <= 48) {
				alvo.parcelas = Number(n[1]);
				mudou = true;
			} else if (/\b(a vista|avista)\b/.test(trecho)) {
				alvo.parcelas = 1;
				mudou = true;
			}
			const d = lerData(trecho);
			if (d) {
				alvo.dataCompra = d;
				mudou = true;
			}
			if (/meio a meio|metade/.test(trecho)) {
				alvo.divisao = "IGUAL";
				mudou = true;
			}
		};
		for (const trecho of trechos) {
			const item = itens.find((i) => {
				const palavras = semAcento(i.descricao).split(/\s+/).filter((p) => p.length >= 3);
				return palavras.length > 0 && palavras.some((p) => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(trecho));
			});
			if (item) {
				citados.add(item.id);
				aplicar(item, trecho);
			}
		}
		for (const trecho of trechos) {
			if (!/\b(resto|demais|outros|outras|restante)\b/.test(trecho)) continue;
			itens = itens.map((i) => {
				if (citados.has(i.id)) return i;
				const copia = { ...i };
				aplicar(copia, trecho);
				return copia;
			});
		}
		return mudou ? { ...r, itens } : null;
	};

	/* ------------------------------ IA (texto livre) ------------------------------ */

	const normalizarDaIa = (bruto: any, anterior: Rascunho): Rascunho => {
		const b = bruto && typeof bruto === "object" ? bruto : {};
		const porDescricao = new Map(anterior.itens.map((i) => [semAcento(i.descricao), i]));
		const itensIa: ItemDivisao[] = (Array.isArray(b.itens) ? b.itens : [])
			.filter((i: any) => i && String(i.descricao || "").trim())
			.map((i: any, idx: number) => {
				const ant = porDescricao.get(semAcento(i.descricao)) || anterior.itens[idx];
				const div = ["IGUAL", "VALOR", "PERCENTUAL"].includes(i.divisao) ? (i.divisao as Divisao) : (ant?.divisao ?? null);
				const parcelas = numeroSeguro(i.parcelas);
				const data = typeof i.dataCompra === "string" ? lerData(i.dataCompra) : null;
				return {
					id: ant?.id || novoId(),
					descricao: String(i.descricao).trim(),
					valorTotal: numeroSeguro(i.valorTotal) ?? ant?.valorTotal ?? null,
					dataCompra: data ?? ant?.dataCompra ?? null,
					parcelas: parcelas ? Math.min(48, Math.max(1, Math.round(parcelas))) : (ant?.parcelas ?? null),
					divisao: div,
					valorOutro: numeroSeguro(i.valorOutro) ?? ant?.valorOutro ?? null,
					percentualOutro: numeroSeguro(i.percentualOutro) ?? ant?.percentualOutro ?? null,
					opcional: typeof i.opcional === "boolean" ? i.opcional : (ant?.opcional ?? false),
				};
			});
		const cronograma: PagamentoAcordo[] = (Array.isArray(b.cronograma) ? b.cronograma : [])
			.filter((p: any) => p && /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(String(p.data || "").trim()))
			.map((p: any) => ({
				data: String(p.data).trim(),
				valor: numeroSeguro(p.valor) || 0,
				observacao: p.observacao ? String(p.observacao) : undefined,
				pago: Boolean(p.pago),
			}))
			.filter((p: PagamentoAcordo) => p.valor > 0);

		const modo = b.modo === "ACORDO" || b.modo === "DIVISAO" ? b.modo : anterior.modo;
		let r: Rascunho = {
			...anterior,
			modo: modo || (cronograma.length ? "ACORDO" : itensIa.length ? "DIVISAO" : null),
			itens: itensIa.length ? itensIa : anterior.itens,
			cronograma: cronograma.length ? cronograma : anterior.cronograma,
			quemPagou: b.quemPagou === "EU" || b.quemPagou === "OUTRO" ? b.quemPagou : anterior.quemPagou,
			jaNoExtrato: typeof b.jaNoExtrato === "boolean" ? b.jaNoExtrato : anterior.jaNoExtrato,
			diaVencimento: (() => {
				const d = numeroSeguro(b.diaVencimento);
				return d && d >= 1 && d <= 31 ? Math.round(d) : anterior.diaVencimento;
			})(),
			tipoRelacao: b.tipoRelacao === "DEVO_PARA_ELE" || b.tipoRelacao === "ELE_ME_DEVE" ? b.tipoRelacao : anterior.tipoRelacao,
		};
		if (r.quemPagou === "OUTRO") r = { ...r, jaNoExtrato: false, opcionaisDecididos: true };
		if (itensIa.some((i) => i.opcional)) r = { ...r, opcionaisDecididos: true };

		const g = typeof b.grupoNome === "string" ? encontrarGrupo(`grupo ${b.grupoNome}`) : null;
		if (g && g.id !== r.grupoId) r = definirGrupo(r, g, b.pessoaNome || "");
		const nome = typeof b.pessoaNome === "string" ? b.pessoaNome.trim() : "";
		if (nome && semAcento(nome) !== semAcento(r.pessoaNome || "")) r = definirPessoa(r, nome);
		return r;
	};

	const perguntarIa = async (texto: string, r: Rascunho): Promise<{ rascunho: Rascunho; comentario?: string } | null> => {
		const historico = mensagens
			.slice(-8)
			.map((m) => `${m.autor === "user" ? "Usuário" : "Assistente"}: ${m.texto}`)
			.join("\n");
		const { contatoId: _c, membroId: _m, grupoId: _g, ...visivel } = r;
		const prompt = `Você ajuda a registrar divisões de despesas entre o usuário e OUTRA pessoa, em português do Brasil.
Hoje é ${dataBR(hojeISO())} (em AAAA-MM-DD: ${hojeISO()}).
Contatos do usuário: ${contatos.map((c) => c.nome).join("; ") || "nenhum"}
Grupos: ${grupos.map((g) => `${g.nome} (membros: ${(g.membros || []).map((m) => m.nome).join(", ")})`).join("; ") || "nenhum"}
Grupo atual: ${grupoAtual?.nome || "nenhum"}

Rascunho atual (JSON):
${JSON.stringify({ ...visivel, grupoNome: grupoAtual?.nome || null })}

Última pergunta feita ao usuário: "${montarPergunta(pergunta, r).texto.replace(/\*\*/g, "").slice(0, 300)}"

Conversa recente:
${historico}

Nova mensagem do usuário:
"""
${texto}
"""

Atualize o rascunho com as informações da nova mensagem e responda SOMENTE um JSON:
{ "rascunho": { "modo", "pessoaNome", "grupoNome", "quemPagou", "jaNoExtrato", "diaVencimento", "tipoRelacao", "itens": [...], "cronograma": [...] }, "comentario": string ou null }

Regras:
- Mantenha tudo o que já está preenchido, a não ser que o usuário peça para mudar. NUNCA invente valores: use null quando não souber.
- "modo": "DIVISAO" quando o usuário lista compras/gastos para dividir; "ACORDO" quando cola um acordo/cronograma de pagamentos com datas e valores.
- "itens" (DIVISAO), um por compra: { "descricao", "valorTotal" (valor TOTAL da compra, número), "dataCompra" ("AAAA-MM-DD"; se disser "todas"/"tudo", aplique a todos os itens; sem ano, use ${new Date().getFullYear()}), "parcelas" (1 = à vista), "divisao" ("IGUAL" = meio a meio, "VALOR" ou "PERCENTUAL"), "valorOutro" (quanto fica para a outra pessoa, quando VALOR), "percentualOutro" (quando PERCENTUAL), "opcional" (true quando o item estiver marcado como "(Opcional)" ou o usuário disser que a pessoa pode recusar) }.
- "diaVencimento": dia do mês em que vencem as parcelas, se o usuário disser (ex.: "vence todo dia 29" → 29); senão null.
- Se o usuário remover um item, não o devolva. Se adicionar, inclua.
- "pessoaNome": nome da OUTRA pessoa (nunca o próprio usuário). "grupoNome": se citar um grupo.
- "quemPagou": "EU" se o usuário pagou, "OUTRO" se a outra pessoa pagou.
- "jaNoExtrato": true se a compra já está/vai estar no extrato ou fatura do usuário.
- ACORDO: "cronograma": [{ "data": "DD/MM" ou "DD/MM/AAAA", "valor", "observacao", "pago" }], "tipoRelacao": "DEVO_PARA_ELE" ou "ELE_ME_DEVE".
- "comentario": no máximo 1 frase curta, só se o usuário perguntou algo; senão null.`;

		try {
			const resposta: any = await Promise.race([
				aiService.gerarJson<any>("acordo", [prompt]),
				new Promise((_, rej) => setTimeout(() => rej(new Error("tempo esgotado")), 60_000)),
			]);
			const bruto = resposta?.rascunho ?? resposta;
			return { rascunho: normalizarDaIa(bruto, r), comentario: typeof resposta?.comentario === "string" ? resposta.comentario : undefined };
		} catch (e) {
			console.warn("[Assistente de divisão] IA indisponível:", e);
			return null;
		}
	};

	/**
	 * Sem IA: entende listas como "Mercado 120,50" ou "Descrição" + "R$ 18,90 (Opcional)"
	 * na linha de baixo. Linhas longas sem "R$" são tratadas como instrução, não item.
	 */
	const itensLocais = (texto: string): ItemDivisao[] => {
		const itens: ItemDivisao[] = [];
		let descricaoPendente = "";
		for (const bruta of texto.split(/\n|;/)) {
			const l = bruta.trim();
			if (!l) continue;
			const temReal = /r\$/i.test(l);
			const opcional = /\(?\s*opcional\s*\)?/i.test(l);
			const semOpcional = l.replace(/\(?\s*opcional\s*\)?/gi, "").trim();
			const terminaComNumero = /\d[\d.,]*\s*$/.test(semOpcional);
			const palavras = semOpcional.split(/\s+/).length;
			const ehLinhaDeValor = temReal || (terminaComNumero && palavras <= 8);
			if (!ehLinhaDeValor) {
				descricaoPendente = l;
				continue;
			}
			const v = lerValor(semOpcional.replace(/\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/g, "").replace(/^.*?(?=r\$)/i, ""));
			let descricao = semOpcional
				.replace(/\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/g, "")
				.replace(/(?:r\$\s*)?\d[\d.,]*\s*$/i, "")
				.replace(/r\$\s*$/i, "")
				.replace(/[-—–:]+\s*$/, "")
				.trim();
			if (!descricao) descricao = descricaoPendente;
			descricaoPendente = "";
			if (!v || !descricao) continue;
			itens.push({
				id: novoId(),
				descricao: descricao.length > 90 ? `${descricao.slice(0, 87).trim()}...` : descricao,
				valorTotal: v,
				dataCompra: lerData(l),
				parcelas: null,
				divisao: null,
				valorOutro: null,
				percentualOutro: null,
				opcional,
			});
		}
		return itens;
	};

	/** Sem IA: "coloca tudo com a data de hoje, divido entre eu e Fulana, 6x, vence todo dia 29". */
	const instrucoesGerais = (texto: string, r: Rascunho): Rascunho => {
		const t = semAcento(texto);
		let x = r;
		if (/\bhoje\b/.test(t)) x = aplicarEmTodos(x, "dataCompra", hojeISO());
		else if (/\bontem\b/.test(t)) x = aplicarEmTodos(x, "dataCompra", ontemISO());
		const n = t.match(/(?:parcelad[oa]\s+(?:em|de)\s+)?(\d{1,2})\s*(?:x|vezes)\b/);
		if (n && Number(n[1]) >= 1 && Number(n[1]) <= 48) x = aplicarEmTodos(x, "parcelas", Number(n[1]));
		else if (/\ba vista\b/.test(t)) x = aplicarEmTodos(x, "parcelas", 1);
		const venc = t.match(/vence\w*\s+(?:todo\s+)?(?:o\s+)?dia\s+(\d{1,2})/);
		if (venc && Number(venc[1]) <= 31) x = { ...x, diaVencimento: Number(venc[1]) };
		if (/meio a meio|metade|divid\w*\s+entre\s+(?:eu|mim)/.test(t)) x = aplicarEmTodos(x, "divisao", "IGUAL");
		if (/\b(eu paguei|paguei)\b/.test(t)) x = { ...x, quemPagou: "EU" };
		if (!x.pessoaNome) {
			const g = encontrarGrupo(texto);
			if (g) x = definirGrupo(x, g, texto);
			else {
				const c = encontrarContato(texto);
				if (c) x = { ...x, contatoId: c.id, pessoaNome: c.nome };
				else {
					const m = texto.match(/entre\s+(?:eu|mim)\s+e\s+(?:a\s+|o\s+)?([A-ZÀ-Ý][\wÀ-ÿ]+(?:\s+(?:de|da|do|dos|das|e)?\s*[A-ZÀ-Ý][\wÀ-ÿ]+)*)/);
					if (m) x = { ...x, pessoaNome: m[1].trim() };
				}
			}
		}
		if (x.itens.some((i) => i.opcional)) x = { ...x, opcionaisDecididos: true };
		return x;
	};

	/* ------------------------------- fluxo ------------------------------- */

	const reiniciar = () => {
		let r = rascunhoVazio();
		if (grupoInicial) r = definirGrupo(r, grupoInicial);
		setRascunho(r);
		setPergunta("itens");
		setMarcados(new Set());
		const contexto = grupoInicial
			? `Vamos lançar no grupo **${grupoInicial.nome}**${r.pessoaNome ? ` (com ${r.pessoaNome})` : ""}. `
			: "";
		setMensagens([
			{
				id: novoId(),
				autor: "ai",
				hora: agora(),
				texto: `Olá! Sou seu assistente de divisão de contas. ${contexto}Vou te perguntando o que faltar e, no fim, mostro um resumo para você confirmar antes de lançar.\n\n${montarPergunta("itens", r).texto}`,
			},
		]);
	};

	useEffect(() => {
		if (isOpen) reiniciar();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	useEffect(() => {
		if (isOpen) setTimeout(() => fimRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
	}, [isOpen, mensagens, pensando]);

	if (!isOpen) return null;

	const ultimaAi = [...mensagens].reverse().find((m) => m.autor === "ai");

	const usarChip = (chip: Chip) => {
		if (pensando || salvando) return;
		setMensagens((prev) => [...prev, { id: novoId(), autor: "user", texto: chip.rotulo, hora: agora() }]);
		const resultado = chip.aplicar(rascunho);
		if (resultado === "MARCAR_OPCIONAIS") {
			setMarcados(new Set(rascunho.itens.filter((i) => i.opcional).map((i) => i.id)));
			enviarAi(`Marque os itens que ${primeiroNome} poderá recusar:`, { widget: "opcionais" });
			return;
		}
		avancar(resultado);
	};

	const salvarOpcionais = () => {
		const r = { ...rascunho, opcionaisDecididos: true, itens: rascunho.itens.map((i) => ({ ...i, opcional: marcados.has(i.id) })) };
		const qtd = marcados.size;
		setMensagens((prev) => [...prev, { id: novoId(), autor: "user", texto: qtd ? `${qtd} item(ns) opcional(is)` : "Nenhum opcional", hora: agora() }]);
		avancar(r);
	};

	const enviar = async () => {
		const texto = input.trim();
		if (!texto || pensando || salvando) return;
		setMensagens((prev) => [...prev, { id: novoId(), autor: "user", texto, hora: agora() }]);
		setInput("");

		// 1) Resposta simples à pergunta pendente: resolve sem IA
		const local = ajustesPorItem(texto, rascunho) || interpretarLocal(pergunta, texto, rascunho);
		if (local) {
			avancar(local, pergunta === "confirmar" ? "Atualizei o resumo." : "");
			return;
		}

		// 2) Texto livre: IA atualiza o rascunho
		setPensando(true);
		try {
			const ia = await perguntarIa(texto, rascunho);
			if (ia) {
				const mudou = JSON.stringify(ia.rascunho) !== JSON.stringify(rascunho);
				avancar(ia.rascunho, ia.comentario || (mudou ? "" : "Não consegui tirar nada novo dessa mensagem."));
				return;
			}
			// IA fora do ar: tenta entender a lista de itens localmente
			if (pergunta === "itens") {
				// Cronograma colado: "05/12 — R$ 379,61 — Quitação celular"
				const cronograma: PagamentoAcordo[] = texto
					.split("\n")
					.map((l) => l.replace(/[*_]/g, "").trim())
					.map((l) => l.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*[:—–-]\s*(?:R\$\s*)?([\d.,]+)\s*(?:[—–-]\s*(.*))?$/i))
					.filter(Boolean)
					.map((m) => ({
						data: m![1],
						valor: lerValor(m![2]) || 0,
						observacao: m![3]?.trim() || undefined,
						pago: /pago|transferido/i.test(m![3] || ""),
					}))
					.filter((p) => p.valor > 0);
				if (cronograma.length >= 2) {
					avancar({ ...rascunho, modo: "ACORDO", cronograma });
					return;
				}
				const itens = itensLocais(texto);
				if (itens.length) {
					avancar(instrucoesGerais(texto, { ...rascunho, modo: "DIVISAO", itens }));
					return;
				}
			}
			avancar(rascunho, "Não consegui falar com a IA agora. Responda usando os botões ou de forma mais direta.");
		} finally {
			setPensando(false);
		}
	};

	/* ------------------------------- gravação ------------------------------- */

	const confirmar = async () => {
		const r = rascunho;
		const lancamentos = gerarLancamentos(r);
		if (!r.pessoaNome || lancamentos.length === 0) {
			toast.error("Faltam informações para lançar.");
			return;
		}
		setSalvando(true);
		try {
			let uid = userId;
			if (!uid) uid = (await supabase.auth.getUser()).data.user?.id || "";
			if (!uid) throw new Error("Sessão expirada.");

			// Contato: usa o existente ou cadastra
			let contatoId = r.contatoId;
			if (!contatoId) {
				const { data, error } = await supabase.from("contatos").insert([{ usuario_id: uid, nome: r.pessoaNome }]).select("id").single();
				if (error) throw error;
				contatoId = data.id;
			}
			// Liga o membro do grupo ao contato (para convite, avisos e relatórios); não troca vínculo existente
			if (r.membroId) {
				await supabase.from("grupo_membros").update({ contato_id: contatoId }).eq("id", r.membroId).is("contato_id", null);
			}

			const g = grupoAtual;
			const eu = meuMembro(g);
			const hoje = hojeISO();
			const itensPorId = new Map(r.itens.map((i) => [i.id, i]));
			const devoEu = r.modo === "ACORDO" ? r.tipoRelacao === "DEVO_PARA_ELE" : r.quemPagou === "OUTRO";

			const linhas = lancamentos.map((l) => {
				const item = l.itemId ? itensPorId.get(l.itemId) : undefined;
				// No grupo, a compra entra inteira: a parte de quem deve (l.valor) e a de quem pagou
				const parteDeQuemPagou = item?.valorTotal
					? Math.max(0, centavos(item.valorTotal / l.totalParcelas - l.valor))
					: 0;
				const eu_ = { id: eu?.id, nome: "Você", is_user: true };
				const outro_ = { id: r.membroId, nome: r.pessoaNome, contato_id: contatoId };
				const metaGrupo = g
					? {
							grupo_id: g.id,
							grupo_nome: g.nome,
							valor_total: centavos(l.valor + parteDeQuemPagou),
							pago_por_id: devoEu ? r.membroId : eu?.id,
							participantes: devoEu
								? [
										{ ...eu_, valor_devido: l.valor },
										{ ...outro_, valor_devido: parteDeQuemPagou },
									]
								: [
										{ ...outro_, valor_devido: l.valor },
										{ ...eu_, valor_devido: parteDeQuemPagou },
									],
						}
					: {};
				const meta: Record<string, any> = {
					is_split: true,
					split_tipo: "amigo",
					origem: "assistente_ia",
					descricao_original: item?.descricao || l.descricao,
					valor_total: l.valor,
					contato_id: contatoId,
					contato_nome: r.pessoaNome,
					parcela: l.parcela,
					total_parcelas: l.totalParcelas,
					...metaGrupo,
				};
				if (item) {
					meta.valor_compra = item.valorTotal;
					meta.metodo_divisao = item.divisao;
					meta.data_compra = item.dataCompra;
				}
				if (r.modo === "ACORDO") meta.acordo_ia = true;

				const base = {
					usuario_id: uid,
					tipo: "DESPESA",
					valor: l.valor,
					data: l.data,
					status: l.pago || l.data <= hoje ? "confirmada" : "pendente",
				};
				if (devoEu) {
					// Eu devo à outra pessoa: aparece em "A quem você deve"
					return {
						...base,
						descricao: `${l.descricao} - ${r.pessoaNome}`,
						terceiro: false,
						terceiro_pago: l.pago,
						observacao: JSON.stringify({ ...meta, pago_por: "AMIGO", parceria_credor_id: contatoId, parceria_credor_nome: r.pessoaNome }),
					};
				}
				// A outra pessoa me deve: aparece em "Quem te deve"
				const jaNoExtrato = r.modo === "ACORDO" ? true : r.jaNoExtrato !== false;
				return {
					...base,
					descricao: `${l.descricao} (Parte ${r.pessoaNome})`,
					considerar_soma: !jaNoExtrato,
					terceiro: true,
					terceiro_pago: l.pago,
					contato_id: contatoId,
					observacao: JSON.stringify({ ...meta, pago_por: "VOCE", ja_no_extrato: jaNoExtrato, opcional: l.opcional }),
				};
			});

			const { data: inseridas, error } = await supabase.from("transacoes").insert(linhas).select("id");
			if (error) throw error;
			notificarDivisaoPorEmail((inseridas || []).map((t: any) => t.id));

			toast.success(`${linhas.length} lançamento(s) registrado(s)!`);
			onSuccess();
			onClose();
		} catch (e) {
			console.error("Erro ao registrar divisão:", e);
			toast.error("Não foi possível salvar. Tente novamente.");
		} finally {
			setSalvando(false);
		}
	};

	/* --------------------------------- UI --------------------------------- */

	const negrito = (texto: string) =>
		texto.split(/\*\*(.+?)\*\*/g).map((parte, i) => (i % 2 === 1 ? <strong key={i}>{parte}</strong> : parte));

	const resumo = () => {
		const r = rascunho;
		const lanc = gerarLancamentos(r);
		const total = lanc.reduce((s, l) => s + l.valor, 0);
		const devoEu = r.modo === "ACORDO" ? r.tipoRelacao === "DEVO_PARA_ELE" : r.quemPagou === "OUTRO";
		const podeOpcional = r.modo === "DIVISAO" && r.quemPagou === "EU";
		return (
			<div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800/80 shadow-md space-y-4">
				<div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
					<div className="flex items-center gap-2">
						<ShieldCheck size={18} className="text-purple-600 dark:text-purple-400" />
						<h4 className="font-black text-xs sm:text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider">Resumo</h4>
					</div>
					<span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
						Com {r.pessoaNome}
						{grupoAtual ? ` · ${grupoAtual.nome}` : ""}
					</span>
				</div>

				{r.modo === "DIVISAO" && (
					<div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
						{r.itens.map((i) => (
							<div
								key={i.id}
								className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="font-bold text-slate-800 dark:text-slate-100 truncate">{i.descricao}</p>
									<p className="text-[11px] text-slate-500 dark:text-slate-400">
										{moeda(i.valorTotal || 0)} · {i.dataCompra ? dataBR(i.dataCompra) : "—"} ·{" "}
										{(i.parcelas || 1) > 1 ? `${i.parcelas}x${r.diaVencimento ? ` (dia ${r.diaVencimento})` : ""}` : "à vista"} ·{" "}
										{i.divisao === "IGUAL" ? "meio a meio" : i.divisao === "PERCENTUAL" ? `${i.percentualOutro}% para ${primeiroNome}` : `${moeda(i.valorOutro || 0)} para ${primeiroNome}`}
									</p>
								</div>
								{podeOpcional && (
									<label className="shrink-0 flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
										<input
											type="checkbox"
											className="accent-purple-600"
											checked={i.opcional}
											onChange={(e) =>
												setRascunho({ ...r, itens: r.itens.map((x) => (x.id === i.id ? { ...x, opcional: e.target.checked } : x)) })
											}
										/>
										Opcional
									</label>
								)}
							</div>
						))}
					</div>
				)}

				<div className="space-y-2">
					<div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">
						<span>{devoEu ? `Você vai pagar a ${primeiroNome}` : `${primeiroNome} vai te pagar`}</span>
						<span className="tabular-nums">{moeda(total)}</span>
					</div>
					<div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
						{porData(lanc).map((g) => (
							<div
								key={g.data}
								className="p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
								<div className="flex items-center gap-2 min-w-0">
									<span className="font-black w-18 shrink-0 text-purple-600 dark:text-purple-400 tabular-nums">{dataBR(g.data)}</span>
									<span className="truncate text-slate-600 dark:text-slate-300">
										{g.itens.length === 1 ? g.itens[0].descricao : `${g.itens.length} itens`}
									</span>
									{g.opcional > 0 && (
										<span className="shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
											{g.itens.length === 1 ? "Opcional" : `${moeda(g.opcional)} opcional`}
										</span>
									)}
								</div>
								<span className="font-black tabular-nums text-slate-800 dark:text-slate-100 shrink-0">{moeda(g.total)}</span>
							</div>
						))}
					</div>
					{r.modo === "DIVISAO" && r.quemPagou === "EU" && (
						<p className="text-[11px] text-slate-500 dark:text-slate-400">
							{r.jaNoExtrato !== false
								? "A compra já está no seu extrato/fatura: seus gastos não serão somados de novo."
								: "A parte de " + primeiroNome + " entra nos seus gastos até ser paga."}
						</p>
					)}
				</div>

				<button
					onClick={confirmar}
					disabled={salvando}
					className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer">
					{salvando ? (
						<>
							<Loader2 size={16} className="animate-spin" /> Registrando...
						</>
					) : (
						<>
							<CheckCircle2 size={16} /> Confirmar e lançar
						</>
					)}
				</button>
			</div>
		);
	};

	const seletorOpcionais = () => (
		<div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 space-y-3">
			<div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs">
				<AlertCircle size={15} />
				<span>{primeiroNome} poderá recusar os itens marcados</span>
			</div>
			<div className="space-y-1.5">
				{rascunho.itens.map((i) => (
					<label
						key={i.id}
						className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200/60 dark:border-amber-800/50 text-xs cursor-pointer">
						<span className="flex items-center gap-2 min-w-0">
							<input
								type="checkbox"
								className="accent-purple-600"
								checked={marcados.has(i.id)}
								onChange={(e) => {
									const novo = new Set(marcados);
									if (e.target.checked) novo.add(i.id);
									else novo.delete(i.id);
									setMarcados(novo);
								}}
							/>
							<span className="font-bold text-slate-800 dark:text-slate-100 truncate">{i.descricao}</span>
						</span>
						<span className="font-bold tabular-nums text-slate-600 dark:text-slate-300 shrink-0">{moeda(parteDoOutro(i))}</span>
					</label>
				))}
			</div>
			<button
				onClick={salvarOpcionais}
				className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-xs cursor-pointer">
				Salvar escolha
			</button>
		</div>
	);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
			<div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl h-[88vh] max-h-[800px] flex flex-col shadow-2xl overflow-hidden">
				{/* CABEÇALHO */}
				<div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
					<div className="flex items-center gap-3 min-w-0">
						<div className="w-10 h-10 shrink-0 rounded-xl bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center">
							<Sparkles size={20} />
						</div>
						<div className="min-w-0">
							<h3 className="font-black text-base text-slate-800 dark:text-slate-100 truncate">Assistente de Divisão</h3>
							<p className="text-xs text-slate-500 dark:text-slate-400 truncate">
								Divida compras ou registre acordos conversando — você confirma antes de lançar.
							</p>
						</div>
					</div>
					<div className="flex items-center gap-1 shrink-0">
						<button
							onClick={reiniciar}
							title="Recomeçar"
							aria-label="Recomeçar conversa"
							className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
							<RotateCcw size={17} />
						</button>
						<button
							onClick={onClose}
							aria-label="Fechar"
							className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
							<X size={18} />
						</button>
					</div>
				</div>

				{/* MENSAGENS */}
				<div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
					{mensagens.map((msg) => {
						const ativa = msg.id === ultimaAi?.id && !pensando;
						return (
							<div key={msg.id} className={`flex gap-3 ${msg.autor === "user" ? "justify-end" : "justify-start"}`}>
								{msg.autor === "ai" && (
									<div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-1">
										<Bot size={16} />
									</div>
								)}
								<div className="max-w-[88%] sm:max-w-[78%] space-y-3">
									<div
										className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
											msg.autor === "user"
												? "bg-purple-600 text-white font-medium"
												: "bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border border-slate-200/50 dark:border-slate-700/50"
										}`}>
										{negrito(msg.texto)}
									</div>

									{ativa && msg.chips && msg.chips.length > 0 && (
										<div className="flex flex-wrap gap-2">
											{msg.chips.map((c) => (
												<button
													key={c.rotulo}
													onClick={() => usarChip(c)}
													className="px-3 py-1.5 rounded-full border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1">
													{c.rotulo}
													<ChevronRight size={12} />
												</button>
											))}
										</div>
									)}

									{ativa && msg.widget === "opcionais" && seletorOpcionais()}
									{ativa && msg.widget === "resumo" && resumo()}
								</div>
								{msg.autor === "user" && (
									<div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 mt-1">
										<User size={16} />
									</div>
								)}
							</div>
						);
					})}

					{pensando && (
						<div className="flex items-center gap-2 text-xs font-bold text-purple-600 dark:text-purple-400 p-2">
							<Loader2 size={16} className="animate-spin" />
							<span>Entendendo sua mensagem...</span>
						</div>
					)}
					<div ref={fimRef} />
				</div>

				{/* ENTRADA */}
				<div className="p-3 sm:p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
					<form
						onSubmit={(e) => {
							e.preventDefault();
							enviar();
						}}
						className="flex items-end gap-2">
						<textarea
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									enviar();
								}
							}}
							placeholder="Responda aqui ou use os botões acima..."
							rows={2}
							className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-purple-500 resize-none"
						/>
						<button
							type="submit"
							disabled={!input.trim() || pensando || salvando}
							aria-label="Enviar"
							className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white flex items-center justify-center shadow-md transition-all cursor-pointer shrink-0">
							<Send size={18} />
						</button>
					</form>
				</div>
			</div>
		</div>
	);
}
