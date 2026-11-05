import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Users } from "lucide-react";
import { conviteService, type DespesaCompartilhadaComigo } from "../../../../packages/services/convite.service";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Despesas que outras pessoas dividiram com você (somente leitura).
 * Aparece para quem foi vinculado a um contato por convite — inclusive convidados.
 */
export default function CompartilhadoComigo() {
	const [itens, setItens] = useState<DespesaCompartilhadaComigo[] | null>(null);

	useEffect(() => {
		conviteService.compartilhadasComigo().then(setItens);
	}, []);

	const porPessoa = useMemo(() => {
		const mapa = new Map<string, { voceDeve: number; teDevem: number; itens: DespesaCompartilhadaComigo[] }>();
		for (const i of itens || []) {
			const grupo = mapa.get(i.pessoa) || { voceDeve: 0, teDevem: 0, itens: [] };
			const aberto = Math.max(0, Number(i.valor) - Number(i.valor_pago || 0));
			if (!i.quitado) {
				if (i.direcao === "VOCE_DEVE") grupo.voceDeve += aberto;
				else grupo.teDevem += aberto;
			}
			grupo.itens.push(i);
			mapa.set(i.pessoa, grupo);
		}
		return [...mapa.entries()];
	}, [itens]);

	if (!itens || itens.length === 0) return null;

	return (
		<section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5 sm:p-6 space-y-5">
			<header className="flex items-center gap-2">
				<Users size={18} className="text-indigo-500" />
				<h2 className="text-base font-black text-slate-800 dark:text-slate-100">Compartilhado comigo</h2>
				<span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">somente leitura</span>
			</header>

			{porPessoa.map(([pessoa, g]) => {
				const saldo = g.teDevem - g.voceDeve;
				return (
					<div key={pessoa} className="space-y-3">
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<p className="font-black text-slate-800 dark:text-slate-100">{pessoa}</p>
							<p className={`text-sm font-black tabular-nums ${saldo > 0 ? "text-emerald-600 dark:text-emerald-400" : saldo < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-500"}`}>
								{saldo > 0 ? `te deve ${moeda(saldo)}` : saldo < 0 ? `você deve ${moeda(-saldo)}` : "tudo acertado"}
							</p>
						</div>
						<ul className="divide-y divide-slate-100 dark:divide-slate-800">
							{g.itens.map(i => {
								const aberto = Math.max(0, Number(i.valor) - Number(i.valor_pago || 0));
								return (
									<li key={i.id} className="py-2.5 flex items-center gap-3">
										<span className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${i.direcao === "VOCE_DEVE" ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"}`}>
											{i.direcao === "VOCE_DEVE" ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
										</span>
										<div className="min-w-0 flex-1">
											<p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{i.descricao}</p>
											<p className="text-[11px] text-slate-400 dark:text-slate-500">
												{new Date(i.data + "T12:00:00").toLocaleDateString("pt-BR")} · {i.direcao === "VOCE_DEVE" ? "você deve" : "te devem"}
											</p>
										</div>
										<div className="text-right shrink-0">
											<p className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{moeda(Number(i.valor))}</p>
											<p className={`text-[11px] font-semibold ${i.quitado ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`}>
												{i.quitado ? "quitado" : i.valor_pago > 0 ? `resta ${moeda(aberto)}` : "em aberto"}
											</p>
										</div>
									</li>
								);
							})}
						</ul>
					</div>
				);
			})}
		</section>
	);
}
