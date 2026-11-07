import InputMoeda from "./InputMoeda";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, Download, Layers, Users, X } from "lucide-react";
import { exportarExcelPessoa } from "../lib/relatorioDivisao";
import toast from "react-hot-toast";
import ListaPorData from "./ListaPorData";
import { notificacoesService } from "../../../../packages/services/notificacoes.service";
import { conviteService, type DespesaCompartilhadaComigo, type GrupoQueParticipo } from "../../../../packages/services/convite.service";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Despesas que outras pessoas dividiram com você.
 * Aparece para quem foi vinculado a um contato por convite — inclusive convidados.
 * Só altera algo quando a cobrança é opcional: aí você pode aceitar ou recusar.
 */
export default function CompartilhadoComigo() {
	const [itens, setItens] = useState<DespesaCompartilhadaComigo[] | null>(null);
	const [respondendo, setRespondendo] = useState<string | null>(null);
	// "Paguei" de um item/parcela: id do item e valor digitado
	const [avisando, setAvisando] = useState<{ id: string; valor: string } | null>(null);
	const [enviandoAviso, setEnviandoAviso] = useState(false);

	const avisarPagamento = async (item: DespesaCompartilhadaComigo) => {
		if (!avisando) return;
		const valor = Number(avisando.valor.replace(/\./g, "").replace(",", "."));
		if (!(valor > 0)) return toast.error("Informe o valor que você pagou.");
		setEnviandoAviso(true);
		const r: any = await notificacoesService.informarPagamento(item.id, valor);
		setEnviandoAviso(false);
		if (!r.ok) {
			const motivos: Record<string, string> = {
				valor_maior: `O valor passa do que falta nesse item (${moeda(Number(r.aberto) || 0)}).`,
				responder_antes: "Aceite a cobrança antes de avisar o pagamento.",
				ja_quitado: "Esse item já está quitado.",
				recusada: "Você recusou essa cobrança.",
			};
			return toast.error(motivos[r.motivo] || "Não foi possível avisar agora.");
		}
		toast.success(r.repetido ? "Você já tinha avisado esse pagamento." : `${item.pessoa.split(" ")[0]} foi avisada(o) e vai confirmar o recebimento.`);
		setAvisando(null);
		carregar();
	};

	/** Mesma planilha de quem lançou, vista do seu lado: o que você deve e o que te devem. */
	const baixarExcel = (pessoa: string, lista: DespesaCompartilhadaComigo[]) => {
		const comoLancamento = (i: DespesaCompartilhadaComigo) => ({
			data: i.data,
			valor: Number(i.valor),
			descricao: i.descricao,
			terceiro_pago: i.quitado,
			quitado: i.quitado,
			observacao: JSON.stringify({
				valor_pago: Number(i.valor_pago) || 0,
				opcional: Boolean(i.opcional),
				resposta_cobranca: i.resposta || undefined,
				parcela: i.parcela || undefined,
				total_parcelas: i.total_parcelas || undefined,
			}),
		});
		exportarExcelPessoa({
			nome: pessoa,
			itens: lista.filter((i) => i.direcao === "TE_DEVEM").map(comoLancamento),
			itensPagar: lista.filter((i) => i.direcao === "VOCE_DEVE").map(comoLancamento),
		}).catch(() => toast.error("Não foi possível gerar a planilha."));
	};

	const [gruposRemotos, setGruposRemotos] = useState<GrupoQueParticipo[]>([]);
	const carregar = () => {
		conviteService.compartilhadasComigo().then(setItens);
		conviteService.gruposQueParticipo().then(setGruposRemotos);
	};

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
		const seguintes = Number(r.parcelas_seguintes) || 0;
		toast.success(
			!aceitar
				? "Cobrança recusada."
				: seguintes > 0
					? `Cobrança aceita — e as próximas ${seguintes} parcela(s) também.`
					: "Cobrança aceita.",
		);
		carregar();
	};

	// Grupos de que você participa: os que o banco devolve + os que aparecem nos lançamentos
	const grupos = useMemo(() => {
		const mapa = new Map<string, { id: string; nome: string; criadoPor: string; membros: string[]; cor?: string | null; voceDeve: number; teDevem: number }>();
		for (const g of gruposRemotos) {
			mapa.set(g.id, { id: g.id, nome: g.nome, criadoPor: g.criado_por, membros: g.membros || [], cor: g.cor_hex, voceDeve: 0, teDevem: 0 });
		}
		for (const i of itens || []) {
			if (!i.grupo_id) continue;
			const g = mapa.get(i.grupo_id) || { id: i.grupo_id, nome: i.grupo_nome || "Grupo", criadoPor: i.pessoa, membros: [], voceDeve: 0, teDevem: 0 };
			if (!i.quitado && i.resposta !== "recusada") {
				const aberto = Math.max(0, Number(i.valor) - Number(i.valor_pago || 0));
				if (i.direcao === "VOCE_DEVE") g.voceDeve += aberto;
				else g.teDevem += aberto;
			}
			mapa.set(i.grupo_id, g);
		}
		return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
	}, [gruposRemotos, itens]);

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

	if ((!itens || itens.length === 0) && grupos.length === 0) return null;

	return (
		<section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5 sm:p-6 space-y-5">
			<header className="flex items-center gap-2">
				<Users size={18} className="text-indigo-500" />
				<h2 className="text-base font-black text-slate-800 dark:text-slate-100">Compartilhado comigo</h2>
			</header>

			{grupos.length > 0 && (
				<div className="space-y-2">
					<p className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Grupos de que você participa</p>
					<div className="grid gap-2 sm:grid-cols-2">
						{grupos.map((g) => {
							const saldo = g.teDevem - g.voceDeve;
							return (
								<div key={g.id} className="flex items-start gap-3 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
									<span
										className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white"
										style={{ backgroundColor: g.cor || "#8b5cf6" }}>
										<Layers size={16} />
									</span>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">{g.nome}</p>
										<p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
											criado por {g.criadoPor.split(" ")[0]}
											{g.membros.length > 0 && ` · ${g.membros.length} membros`}
										</p>
										{g.membros.length > 0 && (
											<p className="text-[11px] text-slate-400 dark:text-slate-500 truncate" title={g.membros.join(", ")}>
												{g.membros.join(", ")}
											</p>
										)}
									</div>
									<p className={`shrink-0 text-xs font-black tabular-nums ${saldo > 0 ? "text-emerald-600 dark:text-emerald-400" : saldo < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400"}`}>
										{saldo > 0 ? `te devem ${moeda(saldo)}` : saldo < 0 ? `você deve ${moeda(-saldo)}` : "em dia"}
									</p>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{porPessoa.map(([pessoa, g]) => {
				const saldo = g.teDevem - g.voceDeve;
				return (
					<div key={pessoa} className="space-y-3">
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<p className="font-black text-slate-800 dark:text-slate-100">{pessoa}</p>
							<div className="flex items-center gap-2">
								<p className={`text-sm font-black tabular-nums ${saldo > 0 ? "text-emerald-600 dark:text-emerald-400" : saldo < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}>
									{saldo > 0 ? `te deve ${moeda(saldo)}` : saldo < 0 ? `você deve ${moeda(-saldo)}` : "tudo acertado"}
								</p>
								<button
									onClick={() => baixarExcel(pessoa, g.itens)}
									title={`Baixar planilha com ${pessoa.split(" ")[0]}`}
									className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer">
									<Download size={12} /> Excel
								</button>
							</div>
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
								const aguardando = i.direcao === "VOCE_DEVE" && !i.quitado && i.pagamento_informado;
								const podePagar =
									i.direcao === "VOCE_DEVE" && !i.quitado && !recusada && !aguardando && aberto > 0 && (!i.opcional || i.resposta === "aceita");
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
													{Number(i.total_parcelas) > 1 && i.parcela && (
														<span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[9px] font-black">
															{i.parcela}/{i.total_parcelas}
														</span>
													)}
													{i.grupo_nome && (
														<span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 text-[9px] font-black">
															<Layers size={9} /> {i.grupo_nome}
														</span>
													)}
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
										{aguardando && (
											<p className="pl-11 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
												⏳ Você avisou que pagou {moeda(Number(i.pagamento_informado?.valor) || 0)} · aguardando {i.pessoa.split(" ")[0]} confirmar
											</p>
										)}
										{podePagar &&
											(avisando?.id === i.id ? (
												<div className="ml-11 flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50">
													<span className="text-xs font-bold text-emerald-800 dark:text-emerald-200">Quanto você pagou?</span>
													<InputMoeda
														autoFocus
														value={avisando.valor}
														onChange={(v) => setAvisando({ id: i.id, valor: v })}
														className="w-28 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-lg px-2 py-1 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
													/>
													<button
														onClick={() => avisarPagamento(i)}
														disabled={enviandoAviso}
														className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer">
														Avisar {i.pessoa.split(" ")[0]}
													</button>
													<button onClick={() => setAvisando(null)} className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:underline cursor-pointer">
														Cancelar
													</button>
												</div>
											) : (
												<div className="pl-11">
													<button
														onClick={() => setAvisando({ id: i.id, valor: aberto.toFixed(2).replace(".", ",") })}
														className="px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-bold flex items-center gap-1 cursor-pointer">
														<Check size={13} /> Paguei
													</button>
												</div>
											))}
										{podeResponder && Number(i.total_parcelas) > 1 && Number(i.parcela) < Number(i.total_parcelas) && (
											<p className="pl-11 text-[10px] text-slate-500 dark:text-slate-400">
												Ao aceitar, as próximas parcelas desta compra também ficam aceitas.
											</p>
										)}
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
