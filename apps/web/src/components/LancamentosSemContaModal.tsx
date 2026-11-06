import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Landmark, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../../../packages/services/supabase";
import { lancamentosSemContaService } from "../../../../packages/services/lancamentos-sem-conta.service";

interface Props {
	isOpen: boolean;
	userId: string;
	onClose: () => void;
	/** chamado quando algo foi corrigido (para recarregar saldos) */
	onAlterado: () => void;
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");

/** Lista os lançamentos sem conta para escolher a conta (ou cartão) de cada um. */
export default function LancamentosSemContaModal({ isOpen, userId, onClose, onAlterado }: Props) {
	const [itens, setItens] = useState<any[] | null>(null);
	const [contas, setContas] = useState<any[]>([]);
	const [cartoes, setCartoes] = useState<any[]>([]);
	const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
	const [destinoEmLote, setDestinoEmLote] = useState("");
	const [salvando, setSalvando] = useState<string | null>(null);
	const [corrigidos, setCorrigidos] = useState(0);

	useEffect(() => {
		if (!isOpen || !userId) return;
		setItens(null);
		setSelecionados(new Set());
		setCorrigidos(0);
		Promise.all([
			lancamentosSemContaService.listar(userId),
			supabase.from("contas_bancarias").select("id, nome, ativa").eq("usuario_id", userId).order("nome"),
			supabase.from("cartoes").select("id, nome").eq("usuario_id", userId).order("nome"),
		]).then(([lista, c, k]) => {
			setItens(lista);
			setContas((c.data || []).filter((x: any) => x.ativa !== false));
			setCartoes(k.data || []);
		});
	}, [isOpen, userId]);

	const total = useMemo(() => (itens || []).length, [itens]);
	if (!isOpen) return null;

	const opcoes = (despesa: boolean) => (
		<>
			<option value="">Escolha a conta…</option>
			<optgroup label="Contas">
				{contas.map((c) => (
					<option key={c.id} value={`conta:${c.id}`}>
						{c.nome}
					</option>
				))}
			</optgroup>
			{despesa && cartoes.length > 0 && (
				<optgroup label="Cartões de crédito">
					{cartoes.map((c) => (
						<option key={c.id} value={`cartao:${c.id}`}>
							{c.nome}
						</option>
					))}
				</optgroup>
			)}
		</>
	);

	const vincular = async (lista: any[], destino: string) => {
		if (!destino) return;
		const [tipo, id] = destino.split(":");
		const validos = lista.filter((t) => tipo === "conta" || t.tipo === "DESPESA");
		if (validos.length < lista.length) toast("Receitas não vão para cartão: ficaram de fora.");
		setSalvando(validos.length === 1 ? validos[0].id : "lote");
		let ok = 0;
		try {
			for (const t of validos) {
				await lancamentosSemContaService.vincular(userId, t, tipo === "conta" ? { contaId: id } : { cartaoId: id });
				ok++;
			}
			if (tipo === "cartao" && ok) await lancamentosSemContaService.recalcularFaturas(userId);
		} catch (e) {
			console.error(e);
			toast.error("Alguns lançamentos não puderam ser atualizados.");
		} finally {
			setSalvando(null);
		}
		if (ok) {
			const feitos = new Set(validos.slice(0, ok).map((t) => t.id));
			setItens((prev) => (prev || []).filter((t) => !feitos.has(t.id)));
			setSelecionados((prev) => new Set([...prev].filter((x) => !feitos.has(x))));
			setCorrigidos((n) => n + ok);
			toast.success(ok === 1 ? "Lançamento atualizado." : `${ok} lançamentos atualizados.`);
			onAlterado();
		}
	};

	const marcarTodos = () =>
		setSelecionados((prev) => (prev.size === (itens || []).length ? new Set() : new Set((itens || []).map((t) => t.id))));
	const listaSelecionada = (itens || []).filter((t) => selecionados.has(t.id));
	const temDespesaSelecionada = listaSelecionada.some((t) => t.tipo === "DESPESA");
	const campo =
		"bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer";

	return (
		<div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm" onClick={onClose}>
			<div
				className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="titulo-sem-conta">
				<div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
					<div className="flex items-center gap-3">
						<span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 flex items-center justify-center">
							<Landmark size={19} />
						</span>
						<div>
							<h3 id="titulo-sem-conta" className="font-black text-base text-slate-800 dark:text-slate-100">Lançamentos sem conta</h3>
							<p className="text-xs text-slate-500 dark:text-slate-400">
								Escolha de qual conta saiu (ou em qual entrou) cada valor. Despesas também podem ir para um cartão.
							</p>
						</div>
					</div>
					<button onClick={onClose} aria-label="Fechar" className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
						<X size={18} />
					</button>
				</div>

				{itens && itens.length > 0 && (
					<div className="px-5 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 bg-slate-50/60 dark:bg-slate-800/30">
						<label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
							<input type="checkbox" className="accent-indigo-600" checked={selecionados.size === total && total > 0} onChange={marcarTodos} />
							{selecionados.size > 0 ? `${selecionados.size} selecionado(s)` : "Selecionar todos"}
						</label>
						{selecionados.size > 0 && (
							<>
								<select value={destinoEmLote} onChange={(e) => setDestinoEmLote(e.target.value)} className={campo}>
									{opcoes(temDespesaSelecionada)}
								</select>
								<button
									onClick={() => vincular(listaSelecionada, destinoEmLote)}
									disabled={!destinoEmLote || salvando === "lote"}
									className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer">
									{salvando === "lote" && <Loader2 size={13} className="animate-spin" />} Aplicar aos selecionados
								</button>
							</>
						)}
					</div>
				)}

				<div className="flex-1 overflow-y-auto custom-scrollbar">
					{itens === null ? (
						<div className="py-16 flex justify-center">
							<Loader2 className="animate-spin text-slate-400" />
						</div>
					) : itens.length === 0 ? (
						<div className="py-14 px-6 text-center">
							<CheckCircle2 size={34} className="mx-auto mb-3 text-emerald-500" />
							<p className="font-bold text-slate-800 dark:text-slate-100">
								{corrigidos > 0 ? `Pronto! ${corrigidos} lançamento(s) corrigido(s).` : "Nenhum lançamento sem conta."}
							</p>
							<p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Seus saldos já consideram todos os lançamentos.</p>
						</div>
					) : (
						<ul className="divide-y divide-slate-100 dark:divide-slate-800">
							{itens.map((t) => {
								const receita = t.tipo === "RECEITA";
								return (
									<li key={t.id} className="px-5 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
										<label className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
											<input
												type="checkbox"
												className="accent-indigo-600 shrink-0"
												checked={selecionados.has(t.id)}
												onChange={(e) =>
													setSelecionados((prev) => {
														const n = new Set(prev);
														if (e.target.checked) n.add(t.id);
														else n.delete(t.id);
														return n;
													})
												}
											/>
											<span className="min-w-0">
												<span className="block text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{t.descricao}</span>
												<span className="block text-[11px] text-slate-500 dark:text-slate-400">
													{dataBR(t.data)} · {receita ? "entrada" : "saída"}
													{t.categorias?.nome && ` · ${t.categorias.nome}`}
												</span>
											</span>
										</label>
										<span className={`text-sm font-black tabular-nums shrink-0 ${receita ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
											{receita ? "+" : "−"} {moeda(Number(t.valor))}
										</span>
										<span className="flex items-center gap-2 shrink-0">
											<select value="" onChange={(e) => vincular([t], e.target.value)} disabled={salvando === t.id} className={`${campo} w-full sm:w-48`}>
												{opcoes(!receita)}
											</select>
											{salvando === t.id && <Loader2 size={14} className="animate-spin text-slate-400" />}
										</span>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</div>
		</div>
	);
}
