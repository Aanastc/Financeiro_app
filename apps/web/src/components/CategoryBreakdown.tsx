import { useMemo, useState } from "react";
import type { ReactNode } from "react";

interface Item {
	name: string;
	value: number;
}

interface CategoryBreakdownProps {
	title: string;
	icon: ReactNode;
	data: Item[];
	/** Cor única das barras (uma cor por card: comprimento, não cor, diferencia as categorias) */
	barClassName: string;
	/** Quantas categorias mostrar antes de agrupar o restante em "Outras" */
	maxVisiveis?: number;
	emptyText?: string;
}

const moeda = (v: number, casas = 2) =>
	v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });

const SEM_CATEGORIA = /^(outros?|sem categoria)$/i;

/**
 * Distribuição por categoria em barras horizontais ranqueadas.
 * Substitui o gráfico de rosca: comparar comprimentos numa mesma base é muito
 * mais preciso que comparar ângulos, e o texto (valor e %) fica legível.
 */
export default function CategoryBreakdown({
	title,
	icon,
	data,
	barClassName,
	maxVisiveis = 6,
	emptyText = "Sem lançamentos no período.",
}: CategoryBreakdownProps) {
	const [expandido, setExpandido] = useState(false);

	const { linhas, total, maior, ocultas } = useMemo(() => {
		const validos = data.filter(d => Number(d.value) > 0).sort((a, b) => b.value - a.value);
		const total = validos.reduce((s, d) => s + d.value, 0);

		let linhas: (Item & { agrupado?: number })[] = validos;
		let ocultas = 0;
		if (!expandido && validos.length > maxVisiveis + 1) {
			const visiveis = validos.slice(0, maxVisiveis);
			const resto = validos.slice(maxVisiveis);
			ocultas = resto.length;
			linhas = [
				...visiveis,
				{ name: `Outras ${resto.length} categorias`, value: resto.reduce((s, d) => s + d.value, 0), agrupado: resto.length },
			];
		}
		const maior = Math.max(...linhas.map(l => l.value), 0);
		return { linhas, total, maior, ocultas };
	}, [data, expandido, maxVisiveis]);

	return (
		<section className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col">
			<header className="flex items-start justify-between gap-4 mb-5">
				<h3 className="text-md font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
					{icon} {title}
				</h3>
				{total > 0 && (
					<div className="text-right shrink-0">
						<p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Total</p>
						<p className="text-lg font-black text-slate-800 dark:text-slate-100 tabular-nums">{moeda(total, 0)}</p>
					</div>
				)}
			</header>

			{linhas.length === 0 ? (
				<p className="text-slate-400 italic text-sm py-10 text-center">{emptyText}</p>
			) : (
				<ul className="space-y-3">
					{linhas.map(l => {
						const pct = total > 0 ? l.value / total : 0;
						const largura = maior > 0 ? Math.max((l.value / maior) * 100, 1.5) : 0;
						const neutra = Boolean(l.agrupado) || SEM_CATEGORIA.test(l.name.trim());
						return (
							<li
								key={l.name}
								className="group rounded-lg -mx-2 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
								title={`${l.name}: ${moeda(l.value)} (${(pct * 100).toFixed(1)}%)`}
							>
								<div className="flex items-baseline justify-between gap-3 mb-1.5">
									<span className={`text-sm font-semibold truncate ${neutra ? "text-slate-500 dark:text-slate-400" : "text-slate-700 dark:text-slate-200"}`}>
										{l.name}
									</span>
									<span className="flex items-baseline gap-2 shrink-0 tabular-nums">
										<span className="text-sm font-bold text-slate-800 dark:text-slate-100">{moeda(l.value)}</span>
										<span className="text-xs font-semibold text-slate-400 dark:text-slate-500 w-11 text-right">
											{(pct * 100).toFixed(pct < 0.1 ? 1 : 0)}%
										</span>
									</span>
								</div>
								<div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
									<div
										className={`h-full rounded-full transition-[width] duration-500 ${neutra ? "bg-slate-400 dark:bg-slate-500" : barClassName}`}
										style={{ width: `${largura}%` }}
									/>
								</div>
							</li>
						);
					})}
				</ul>
			)}

			{(ocultas > 0 || expandido) && (
				<button
					type="button"
					onClick={() => setExpandido(v => !v)}
					className="mt-4 self-start text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
				>
					{expandido ? "Mostrar menos" : `Ver todas as categorias (${linhas.length - 1 + ocultas})`}
				</button>
			)}
		</section>
	);
}
