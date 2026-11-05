import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";

const moeda = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");

export interface ResumoGrupoData {
	total: number;
	detalhe?: ReactNode;
	quitado?: boolean;
}

interface Props<T> {
	itens: T[];
	/** Data AAAA-MM-DD do item */
	dataDe: (item: T) => string;
	resumo: (itens: T[]) => ResumoGrupoData;
	/** `dentroDoGrupo` = item listado sob o cabeçalho de uma data (a ação já está no cabeçalho) */
	renderItem: (item: T, dentroDoGrupo: boolean) => ReactNode;
	/** Botão/selo à direita do cabeçalho do grupo (ex.: "Registrar pagamento") */
	acao?: (itens: T[]) => ReactNode;
	ordem?: "asc" | "desc";
	/** Quantos grupos mostrar antes do "ver mais" */
	limite?: number;
	compacto?: boolean;
}

/**
 * Agrupa lançamentos pela data de vencimento: uma compra de 30 itens em 6x vira
 * 6 linhas (uma por mês) em vez de 180. Cada linha abre os itens daquele mês.
 * Um grupo com um item só é mostrado direto, sem cabeçalho.
 */
export default function ListaPorData<T>({ itens, dataDe, resumo, renderItem, acao, ordem = "asc", limite, compacto }: Props<T>) {
	const [abertos, setAbertos] = useState<Set<string>>(new Set());
	const [verTudo, setVerTudo] = useState(false);

	const grupos = useMemo(() => {
		const mapa = new Map<string, T[]>();
		for (const i of itens) {
			const d = dataDe(i);
			mapa.set(d, [...(mapa.get(d) || []), i]);
		}
		const lista = [...mapa.entries()].map(([data, lista]) => ({ data, itens: lista }));
		lista.sort((a, b) => (ordem === "asc" ? a.data.localeCompare(b.data) : b.data.localeCompare(a.data)));
		return lista;
	}, [itens, dataDe, ordem]);

	const visiveis = limite && !verTudo ? grupos.slice(0, limite) : grupos;
	const alternar = (d: string) =>
		setAbertos((prev) => {
			const novo = new Set(prev);
			if (novo.has(d)) novo.delete(d);
			else novo.add(d);
			return novo;
		});

	return (
		<div className={compacto ? "space-y-1.5" : "divide-y divide-slate-100 dark:divide-slate-800"}>
			{visiveis.map((g) => {
				if (g.itens.length === 1) return <div key={g.data}>{renderItem(g.itens[0], false)}</div>;
				const r = resumo(g.itens);
				const aberto = abertos.has(g.data);
				return (
					<div key={g.data} className={compacto ? "rounded-xl border border-slate-200/70 dark:border-slate-700/60" : "py-2"}>
						<div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${compacto ? "p-2" : "py-1.5"}`}>
							<button
								type="button"
								onClick={() => alternar(g.data)}
								aria-expanded={aberto}
								className="flex items-center gap-3 min-w-0 text-left cursor-pointer group">
								{!compacto && (
									<span className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
										<CalendarDays size={18} />
									</span>
								)}
								<span className="min-w-0">
									<span className={`block font-black text-slate-800 dark:text-slate-100 ${compacto ? "text-[11px]" : "text-sm"}`}>
										{dataBR(g.data)} · {g.itens.length} itens
										{r.quitado && <span className="ml-2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">quitado</span>}
									</span>
									{r.detalhe && <span className="block text-[11px] text-slate-500 dark:text-slate-400">{r.detalhe}</span>}
								</span>
								<ChevronDown
									size={16}
									className={`shrink-0 text-slate-400 transition-transform group-hover:text-slate-600 dark:group-hover:text-slate-200 ${aberto ? "rotate-180" : ""}`}
								/>
							</button>
							<div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
								<span className={`font-black tabular-nums text-slate-900 dark:text-slate-100 ${compacto ? "text-[11px]" : "text-sm"}`}>
									{moeda(r.total)}
								</span>
								{acao?.(g.itens)}
							</div>
						</div>
						{aberto && (
							<div className={`border-l-2 border-purple-200 dark:border-purple-900/60 ${compacto ? "mx-2 mb-2 pl-2" : "ml-5 pl-4"}`}>
								{g.itens.map((i, idx) => (
									<div key={idx}>{renderItem(i, Boolean(acao))}</div>
								))}
							</div>
						)}
					</div>
				);
			})}
			{limite && grupos.length > limite && (
				<button
					type="button"
					onClick={() => setVerTudo((v) => !v)}
					className="w-full pt-2 text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer">
					{verTudo ? "Mostrar menos" : `Ver mais ${grupos.length - limite} data(s)`}
				</button>
			)}
		</div>
	);
}
