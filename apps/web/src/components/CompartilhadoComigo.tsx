import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, Users, X } from "lucide-react";
import toast from "react-hot-toast";
import ListaPorData from "./ListaPorData";
import { conviteService, type DespesaCompartilhadaComigo } from "../../../../packages/services/convite.service";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Despesas que outras pessoas dividiram com você.
 * Aparece para quem foi vinculado a um contato por convite — inclusive convidados.
 * Só altera algo quando a cobrança é opcional: aí você pode aceitar ou recusar.
 */
export default function CompartilhadoComigo() {
	const [itens, setItens] = useState<DespesaCompartilhadaComigo[] | null>(null);
	const [respondendo, setRespondendo] = useState<string | null>(null);

	const carregar = () => conviteService.compartilhadasComigo().then(setItens);

	useEffect(() => {
		carregar();
	}, []);

	const responder = async (item: DespesaCompartilhadaComigo, aceitar: boolean) => {
		if (!aceitar && !window.confirm(`Recusar a cobrança "${item.descricao}" (${moeda(Number(item.valor))})?`)) return;
		setRespondendo(item.id);
		const r = await conviteService.responderCobranca(item.id, aceitar);
		setRespondendo(null);
		if (!r.ok) {
			toast.error(r.motivo === "ja_quitado" ? "Essa cobrança já foi quitada." : "Não foi possível responder agora.");
			return;
		}
		toast.success(aceitar ? "Cobrança aceita." : "Cobrança recusada.");
		carregar();
	};

	const porPessoa = useMemo(() => {
		const mapa = new Map<string, { voceDeve: number; teDevem: number; itens: DespesaCompartilhadaComigo[] }>();
		for (const i of itens || []) {
			const grupo = mapa.get(i.pessoa) || { voceDeve: 0, teDevem: 0, itens: [] };
			const aberto = Math.max(0, Number(i.valor) - Number(i.valor_pago || 0));
			if (!i.quitado && i.resposta !== "recusada") {
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
			</header>

			{porPessoa.map(([pessoa, g]) => {
				const saldo = g.teDevem - g.voceDeve;
				return (
					<div key={pessoa} className="space-y-3">
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<p className="font-black text-slate-800 dark:text-slate-100">{pessoa}</p>
							<p className={`text-sm font-black tabular-nums ${saldo > 0 ? "text-emerald-600 dark:text-emerald-400" : saldo < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}>
								{saldo > 0 ? `te deve ${moeda(saldo)}` : saldo < 0 ? `você deve ${moeda(-saldo)}` : "tudo acertado"}
							</p>
						</div>
						<ListaPorData
							compacto
							limite={4}
							itens={g.itens}
							dataDe={(i) => i.data}
							resumo={(lista) => ({
								total: lista
									.filter((i) => i.resposta !== "recusada")
									.reduce((s, i) => s + Math.max(0, Number(i.valor) - Number(i.valor_pago || 0)), 0),
								quitado: lista.every((i) => i.quitado),
								detalhe: lista.some((i) => i.opcional && !i.resposta && !i.quitado)
									? `${lista.filter((i) => i.opcional && !i.resposta && !i.quitado).length} opcional(is) para responder`
									: undefined,
							})}
							renderItem={(i) => {
								const aberto = Math.max(0, Number(i.valor) - Number(i.valor_pago || 0));
								const recusada = i.resposta === "recusada";
								const podeResponder = i.opcional && i.direcao === "VOCE_DEVE" && !i.quitado && !i.resposta;
								return (
									<div className="py-2.5 space-y-2">
										<div className="flex items-center gap-3">
											<span className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${i.direcao === "VOCE_DEVE" ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"}`}>
												{i.direcao === "VOCE_DEVE" ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
											</span>
											<div className="min-w-0 flex-1">
												<p className={`text-sm font-semibold truncate ${recusada ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"}`}>
													{i.descricao}
												</p>
												<p className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
													{new Date(i.data + "T12:00:00").toLocaleDateString("pt-BR")} · {i.direcao === "VOCE_DEVE" ? "você deve" : "te devem"}
													{i.opcional && (
														<span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 text-[9px] font-black uppercase">
															Opcional
														</span>
													)}
												</p>
											</div>
											<div className="text-right shrink-0">
												<p className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{moeda(Number(i.valor))}</p>
												<p className={`text-[11px] font-semibold ${i.quitado ? "text-emerald-600 dark:text-emerald-400" : recusada ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}>
													{i.quitado ? "quitado" : recusada ? "recusada" : i.resposta === "aceita" ? "aceita" : i.valor_pago > 0 ? `resta ${moeda(aberto)}` : "em aberto"}
												</p>
											</div>
										</div>
										{podeResponder && (
											<div className="flex gap-2 pl-11">
												<button
													onClick={() => responder(i, true)}
													disabled={respondendo === i.id}
													className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer">
													<Check size={13} /> Aceitar
												</button>
												<button
													onClick={() => responder(i, false)}
													disabled={respondendo === i.id}
													className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer">
													<X size={13} /> Recusar
												</button>
											</div>
										)}
									</div>
								);
							}}
						/>
					</div>
				);
			})}
		</section>
	);
}
