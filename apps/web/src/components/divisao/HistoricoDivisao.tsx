import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Pencil } from "lucide-react";

/**
 * Histórico da divisão de contas, como um extrato:
 *  - mês a mês (o que vem pela frente primeiro; meses passados depois);
 *  - cada linha em frase direta ("Você paga R$ 381,95 a Claudiney");
 *  - compras com vários itens na mesma data viram uma linha só (abre ao clicar).
 */

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const lerMeta = (obs?: string | null): any => {
	try {
		return obs && obs.trim().startsWith("{") ? JSON.parse(obs) : {};
	} catch {
		return {};
	}
};

type Filtro = "tudo" | "receber" | "pagar" | "aberto" | "pago";

interface Linha {
	chave: string;
	data: string;
	receber: boolean;
	contatoId: string | null;
	nome: string;
	grupo?: string;
	itens: { id: string; descricao: string; valor: number; aberto: number; quitado: boolean; recusado: boolean }[];
	total: number;
	aberto: number;
}

interface Props {
	transacoes: any[];
	contatos: any[];
	onEditar: (id: string) => void;
	onAbrirPessoa: (contatoId: string) => void;
}

export default function HistoricoDivisao({ transacoes, contatos, onEditar, onAbrirPessoa }: Props) {
	const [filtro, setFiltro] = useState<Filtro>("tudo");
	const [abertas, setAbertas] = useState<Set<string>>(new Set());
	const hoje = new Date().toISOString().slice(0, 10);
	const mesAtual = hoje.slice(0, 7);
	const nomeContato = (id?: string | null) => contatos.find((c) => c.id === id)?.nome || "";

	const linhas = useMemo(() => {
		const mapa = new Map<string, Linha>();
		for (const t of transacoes) {
			const meta = lerMeta(t.observacao);
			const receber = Boolean(t.terceiro);
			const contatoId: string | null = receber ? t.contato_id : meta.parceria_credor_id || null;
			if (!receber && !meta.parceria_credor_id) continue;
			const nome = nomeContato(contatoId) || meta.contato_nome || meta.parceria_credor_nome || "Contato";
			const valor = Number(t.valor) || 0;
			const recusado = meta.resposta_cobranca === "recusada";
			const pago = t.terceiro_pago ? valor : Math.min(valor, Number(meta.valor_pago) || 0);
			const aberto = t.terceiro_pago || recusado ? 0 : Math.round((valor - pago) * 100) / 100;
			const chave = `${t.data}|${receber ? "r" : "p"}|${contatoId}|${meta.grupo_id || ""}`;
			const l: Linha = mapa.get(chave) || { chave, data: t.data, receber, contatoId, nome, grupo: meta.grupo_nome, itens: [], total: 0, aberto: 0 };
			let desc = String(meta.descricao_original || t.descricao || "")
				.replace(/\s*\(Parte [^)]*\)\s*$/i, "")
				.trim();
			// "Acordo 1/6 — Celular - Claudiney" -> "Acordo 1/6 — Celular"
			const sufixo = ` - ${nome}`.toLowerCase();
			if (desc.toLowerCase().endsWith(sufixo)) desc = desc.slice(0, -sufixo.length).trim();
			l.itens.push({
				id: t.id,
				descricao: `${desc}${meta.total_parcelas > 1 && !/\(\d+\/\d+\)/.test(desc) ? ` (${meta.parcela}/${meta.total_parcelas})` : ""}`,
				valor,
				aberto,
				quitado: Boolean(t.terceiro_pago),
				recusado,
			});
			if (!recusado) l.total = Math.round((l.total + valor) * 100) / 100;
			l.aberto = Math.round((l.aberto + aberto) * 100) / 100;
			mapa.set(chave, l);
		}
		return [...mapa.values()].filter((l) =>
			filtro === "receber" ? l.receber : filtro === "pagar" ? !l.receber : filtro === "aberto" ? l.aberto > 0 : filtro === "pago" ? l.aberto <= 0 : true,
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [transacoes, contatos, filtro]);

	const meses = useMemo(() => {
		const mapa = new Map<string, Linha[]>();
		for (const l of linhas) {
			const ym = l.data.slice(0, 7);
			mapa.set(ym, [...(mapa.get(ym) || []), l]);
		}
		const todos = [...mapa.entries()].map(([ym, ls]) => ({ ym, linhas: ls.sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome)) }));
		const futuros = todos.filter((m) => m.ym >= mesAtual).sort((a, b) => a.ym.localeCompare(b.ym));
		const passados = todos.filter((m) => m.ym < mesAtual).sort((a, b) => b.ym.localeCompare(a.ym));
		return { futuros, passados };
	}, [linhas, mesAtual]);

	const situacao = (l: Linha) =>
		l.aberto <= 0
			? { texto: l.itens.every((i) => i.recusado) ? "Recusado" : "Pago", cor: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" }
			: l.aberto < l.total
				? { texto: `Falta ${moeda(l.aberto)}`, cor: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" }
				: l.data < hoje
					? { texto: "Vencido", cor: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" }
					: { texto: "A vencer", cor: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };

	const linhaUI = (l: Linha) => {
		const aberta = abertas.has(l.chave);
		const primeiro = l.nome.split(" ")[0];
		const s = situacao(l);
		const [, m, d] = l.data.split("-");
		const varios = l.itens.length > 1;
		return (
			<li key={l.chave} className="py-1">
				<div className="flex items-center gap-3 sm:gap-4 px-3 py-2.5 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
					<span className="w-11 shrink-0 text-center leading-tight">
						<span className="block text-lg font-black text-slate-800 dark:text-slate-100">{d}</span>
						<span className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">{MES_CURTO[Number(m) - 1]}</span>
					</span>
					<span
						className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
							l.receber ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
						}`}>
						{l.receber ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
					</span>
					<button
						onClick={() =>
							varios
								? setAbertas((prev) => {
										const n = new Set(prev);
										if (n.has(l.chave)) n.delete(l.chave);
										else n.add(l.chave);
										return n;
									})
								: l.contatoId && onAbrirPessoa(l.contatoId)
						}
						className="min-w-0 flex-1 text-left cursor-pointer">
						<span className="block text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
							{l.receber ? `${primeiro} te paga` : `Você paga a ${primeiro}`}
						</span>
						<span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
							{varios ? `${l.itens.length} itens` : l.itens[0].descricao}
							{l.grupo && ` · grupo ${l.grupo}`}
							{varios && <ChevronDown size={12} className={`inline ml-1 transition-transform ${aberta ? "rotate-180" : ""}`} />}
						</span>
					</button>
					<span className={`hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${s.cor}`}>{s.texto}</span>
					<span className={`text-sm sm:text-base font-black tabular-nums shrink-0 ${l.receber ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
						{l.receber ? "+" : "−"} {moeda(l.total)}
					</span>
					{!varios && (
						<button onClick={() => onEditar(l.itens[0].id)} title="Editar" aria-label="Editar" className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer shrink-0">
							<Pencil size={13} />
						</button>
					)}
				</div>
				{aberta && (
					<ul className="ml-[4.5rem] mr-3 mb-2 border-l-2 border-slate-200 dark:border-slate-700 pl-4 divide-y divide-slate-100 dark:divide-slate-800">
						{l.itens.map((i) => (
							<li key={i.id} className="py-1.5 flex items-center justify-between gap-2 text-xs">
								<span className={`truncate ${i.recusado ? "line-through text-slate-400" : "text-slate-600 dark:text-slate-300"}`}>{i.descricao}</span>
								<span className="flex items-center gap-1.5 shrink-0">
									<span className="font-bold tabular-nums text-slate-700 dark:text-slate-200">{moeda(i.valor)}</span>
									<button onClick={() => onEditar(i.id)} title="Editar" aria-label="Editar" className="p-1 rounded text-slate-400 hover:text-indigo-600 cursor-pointer">
										<Pencil size={11} />
									</button>
								</span>
							</li>
						))}
						{l.contatoId && (
							<li className="py-1.5">
								<button onClick={() => onAbrirPessoa(l.contatoId!)} className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer">
									Ver tudo com {primeiro} →
								</button>
							</li>
						)}
					</ul>
				)}
			</li>
		);
	};

	const secaoMes = ({ ym, linhas: ls }: { ym: string; linhas: Linha[] }) => {
		const entra = ls.filter((l) => l.receber).reduce((s, l) => s + l.total, 0);
		const sai = ls.filter((l) => !l.receber).reduce((s, l) => s + l.total, 0);
		const [a, m] = ym.split("-");
		return (
			<section key={ym} className="space-y-1">
				<header className="flex flex-wrap items-baseline justify-between gap-2 px-3 pt-3">
					<h4 className="font-black text-slate-800 dark:text-slate-100 capitalize">
						{MESES[Number(m) - 1]} {a !== String(new Date().getFullYear()) && a}
						{ym === mesAtual && <span className="ml-2 text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400">este mês</span>}
					</h4>
					{/* Dois sentidos: "entra · sai". Um sentido só: o total. Uma linha só: nada (já está na linha). */}
					{ls.length > 1 && (
						<p className="text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400">
							{entra > 0 && sai > 0 ? (
								<>
									<span className="text-emerald-600 dark:text-emerald-400">entra {moeda(entra)}</span>
									{" · "}
									<span className="text-rose-600 dark:text-rose-400">sai {moeda(sai)}</span>
								</>
							) : (
								<>total {moeda(entra + sai)}</>
							)}
						</p>
					)}
				</header>
				<ul>{ls.map(linhaUI)}</ul>
			</section>
		);
	};

	const filtros: { id: Filtro; rotulo: string }[] = [
		{ id: "tudo", rotulo: "Tudo" },
		{ id: "receber", rotulo: "A receber" },
		{ id: "pagar", rotulo: "A pagar" },
		{ id: "aberto", rotulo: "Em aberto" },
		{ id: "pago", rotulo: "Pagos" },
	];

	return (
		<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm p-3 sm:p-5 space-y-3">
			<div className="flex flex-wrap gap-1.5 px-2">
				{filtros.map((f) => (
					<button
						key={f.id}
						onClick={() => setFiltro(f.id)}
						className={`px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-colors ${
							filtro === f.id ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
						}`}>
						{f.rotulo}
					</button>
				))}
			</div>

			{meses.futuros.length === 0 && meses.passados.length === 0 ? (
				<p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Nada por aqui com esse filtro.</p>
			) : (
				<>
					{meses.futuros.map(secaoMes)}
					{meses.passados.length > 0 && (
						<>
							<p className="px-3 pt-4 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Meses anteriores</p>
							{meses.passados.map(secaoMes)}
						</>
					)}
				</>
			)}
		</div>
	);
}
