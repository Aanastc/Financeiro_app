import InputMoeda from "./InputMoeda";
import { useEffect, useState } from "react";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../../../packages/services/supabase";

interface Props {
	/** id da transação a editar (null = fechado) */
	transacaoId: string | null;
	onClose: () => void;
	onSalvo: () => void;
}

const lerMeta = (obs?: string | null): Record<string, any> | null => {
	const t = (obs || "").trim();
	if (!t.startsWith("{")) return null;
	try {
		return JSON.parse(t);
	} catch {
		return null;
	}
};
const lerValor = (t: string) => {
	const limpo = t.replace(/[^\d.,]/g, "");
	const n = limpo.includes(",") ? Number(limpo.replace(/\./g, "").replace(",", ".")) : Number(limpo);
	return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Edita um lançamento de divisão de contas / acordo: descrição, valor e data
 * (ou exclui). Mantém coerentes os dados guardados junto (parte de cada um,
 * valor já pago) e não deixa o valor ficar menor que o que já foi pago.
 */
export default function EditarLancamentoModal({ transacaoId, onClose, onSalvo }: Props) {
	const [carregando, setCarregando] = useState(false);
	const [salvando, setSalvando] = useState(false);
	const [original, setOriginal] = useState<any>(null);
	const [descricao, setDescricao] = useState("");
	const [valor, setValor] = useState("");
	const [data, setData] = useState("");

	useEffect(() => {
		if (!transacaoId) return;
		setCarregando(true);
		supabase
			.from("transacoes")
			.select("id, descricao, valor, data, observacao, terceiro, terceiro_pago")
			.eq("id", transacaoId)
			.single()
			.then(({ data: t, error }) => {
				setCarregando(false);
				if (error || !t) {
					toast.error("Não foi possível abrir o lançamento.");
					onClose();
					return;
				}
				setOriginal(t);
				setDescricao(t.descricao || "");
				setValor(Number(t.valor).toFixed(2).replace(".", ","));
				setData(t.data);
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [transacaoId]);

	if (!transacaoId) return null;

	const meta = lerMeta(original?.observacao);
	const jaPago = Number(meta?.valor_pago) || 0;

	const salvar = async () => {
		if (!original) return;
		const novoValor = lerValor(valor);
		const novaDescricao = descricao.trim();
		if (!novaDescricao) return toast.error("Informe a descrição.");
		if (!(novoValor > 0)) return toast.error("Informe um valor maior que zero.");
		if (!data) return toast.error("Informe a data.");
		if (jaPago > novoValor + 0.005) {
			return toast.error(`Já foram pagos/abatidos ${moeda(jaPago)}. O valor não pode ficar menor que isso.`);
		}
		setSalvando(true);
		try {
			const valorAntigo = Number(original.valor);
			let observacao = original.observacao;
			if (meta) {
				const novo: Record<string, any> = { ...meta };
				if (novo.descricao_original) novo.descricao_original = novaDescricao.replace(/\s*\(\d+\/\d+\)\s*$/, "");
				if (Math.abs((Number(novo.valor_total) || 0) - valorAntigo) < 0.005) novo.valor_total = novoValor;
				// Parte de quem deve acompanha o novo valor
				if (Array.isArray(novo.participantes)) {
					let ajustou = false;
					novo.participantes = novo.participantes.map((p: any) => {
						if (!ajustou && Math.abs((Number(p.valor_devido) || 0) - valorAntigo) < 0.005) {
							ajustou = true;
							return { ...p, valor_devido: novoValor };
						}
						return p;
					});
					if (novo.valor_total !== undefined) {
						novo.valor_total = Math.round(novo.participantes.reduce((s: number, p: any) => s + (Number(p.valor_devido) || 0), 0) * 100) / 100 || novoValor;
					}
				}
				if (jaPago > 0) novo.total = jaPago >= novoValor - 0.005;
				observacao = JSON.stringify(novo);
			}
			const { error } = await supabase
				.from("transacoes")
				.update({
					descricao: novaDescricao,
					valor: novoValor,
					data,
					observacao,
					...(jaPago > 0 ? { terceiro_pago: jaPago >= novoValor - 0.005 } : {}),
				})
				.eq("id", original.id);
			if (error) throw error;
			toast.success("Lançamento atualizado.");
			onSalvo();
			onClose();
		} catch (e) {
			console.error(e);
			toast.error("Não foi possível salvar.");
		} finally {
			setSalvando(false);
		}
	};

	const excluir = async () => {
		if (!original) return;
		if (!window.confirm(`Excluir "${original.descricao}" (${moeda(Number(original.valor))})?\n\nIsso não pode ser desfeito.`)) return;
		setSalvando(true);
		const { error } = await supabase.from("transacoes").delete().eq("id", original.id);
		setSalvando(false);
		if (error) {
			toast.error("Não foi possível excluir.");
			return;
		}
		toast.success("Lançamento excluído.");
		onSalvo();
		onClose();
	};

	const campo =
		"w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500";

	return (
		<div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm" onClick={onClose}>
			<div
				className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-5 sm:p-6 space-y-4"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="titulo-editar">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2.5">
						<span className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 flex items-center justify-center">
							<Pencil size={17} />
						</span>
						<h3 id="titulo-editar" className="font-black text-base text-slate-800 dark:text-slate-100">
							Editar lançamento
						</h3>
					</div>
					<button onClick={onClose} aria-label="Fechar" className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
						<X size={18} />
					</button>
				</div>

				{carregando || !original ? (
					<div className="py-10 flex justify-center">
						<Loader2 className="animate-spin text-slate-400" />
					</div>
				) : (
					<>
						<label className="block space-y-1">
							<span className="text-xs font-bold text-slate-600 dark:text-slate-300">Descrição</span>
							<textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className={`${campo} resize-none`} />
						</label>
						<div className="grid grid-cols-2 gap-3">
							<label className="space-y-1">
								<span className="text-xs font-bold text-slate-600 dark:text-slate-300">Valor</span>
								<InputMoeda value={valor} onChange={(v) => setValor(v)} className={campo} />
							</label>
							<label className="space-y-1">
								<span className="text-xs font-bold text-slate-600 dark:text-slate-300">Data / vencimento</span>
								<input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
							</label>
						</div>
						{jaPago > 0 && (
							<p className="text-xs text-slate-500 dark:text-slate-400">
								Já pago/abatido: <strong>{moeda(jaPago)}</strong> — falta {moeda(Math.max(0, lerValor(valor) - jaPago))}.
							</p>
						)}
						<div className="flex items-center justify-between gap-2 pt-1">
							<button
								onClick={excluir}
								disabled={salvando}
								className="px-3 py-2.5 rounded-xl text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
								<Trash2 size={14} /> Excluir
							</button>
							<div className="flex gap-2">
								<button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
									Cancelar
								</button>
								<button
									onClick={salvar}
									disabled={salvando}
									className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer">
									{salvando && <Loader2 size={14} className="animate-spin" />} Salvar
								</button>
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
