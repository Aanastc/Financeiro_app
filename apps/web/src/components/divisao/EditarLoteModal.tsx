import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarClock, Layers, Loader2, ShieldQuestion, X } from "lucide-react";
import toast from "react-hot-toast";
import { hojeISO } from "../../../../../packages/utils/datas";
import { definirOpcionalEmLote, dividirEmParcelas, mudarVencimentoEmLote, parcelarEmLote, somarMeses, type ResultadoLote } from "../../lib/loteDivisao";

type Acao = "parcelar" | "vencimento" | "opcional";

interface Props {
	/** Lançamentos a editar juntos (null = fechado) */
	itens: any[] | null;
	titulo?: string;
	onClose: () => void;
	onSalvo: () => void;
}

const moeda = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");

/** Edita vários lançamentos da divisão de contas de uma vez. */
export default function EditarLoteModal({ itens, titulo, onClose, onSalvo }: Props) {
	const [acao, setAcao] = useState<Acao>("parcelar");
	const [parcelas, setParcelas] = useState(6);
	const [data, setData] = useState(hojeISO());
	const [opcional, setOpcional] = useState(true);
	const [salvando, setSalvando] = useState(false);
	const [resultado, setResultado] = useState<ResultadoLote | null>(null);

	useEffect(() => {
		if (!itens) return;
		setResultado(null);
		setAcao("parcelar");
		setData(hojeISO());
	}, [itens]);

	const total = useMemo(() => (itens || []).reduce((s, t) => s + (Number(t.valor) || 0), 0), [itens]);
	if (!itens) return null;

	const previa =
		acao === "parcelar" && parcelas >= 2
			? `${parcelas}x de ~${moeda(dividirEmParcelas(total, parcelas)[0])} (somando os ${itens.length} itens), de ${dataBR(data)} a ${dataBR(somarMeses(data, parcelas - 1))}.`
			: acao === "vencimento"
				? `Os ${itens.length} itens passam a vencer em ${dataBR(data)}.`
				: `Os ${itens.length} itens ficam ${opcional ? "opcionais (a pessoa pode aceitar ou recusar)" : "obrigatórios"}.`;

	const salvar = async () => {
		const ids = itens.map((t) => t.id);
		if (acao === "parcelar" && !(parcelas >= 2 && parcelas <= 48)) return toast.error("Escolha de 2 a 48 parcelas.");
		if (acao !== "opcional" && !data) return toast.error("Informe a data.");
		setSalvando(true);
		try {
			const r =
				acao === "parcelar" ? await parcelarEmLote(ids, parcelas, data) : acao === "vencimento" ? await mudarVencimentoEmLote(ids, data) : await definirOpcionalEmLote(ids, opcional);
			setResultado(r);
			if (r.alterados > 0) {
				toast.success(`${r.alterados} item(ns) atualizado(s).`);
				onSalvo();
			}
			if (r.ignorados.length === 0) onClose();
		} catch (e) {
			console.error(e);
			toast.error("Não foi possível salvar.");
		} finally {
			setSalvando(false);
		}
	};

	const opcoes: { id: Acao; rotulo: string; icone: ReactNode }[] = [
		{ id: "parcelar", rotulo: "Parcelar", icone: <Layers size={15} /> },
		{ id: "vencimento", rotulo: "Mudar vencimento", icone: <CalendarClock size={15} /> },
		{ id: "opcional", rotulo: "Opcional", icone: <ShieldQuestion size={15} /> },
	];
	const campo =
		"w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500";

	return (
		<div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm" onClick={() => !salvando && onClose()}>
			<div
				className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-5 sm:p-6 space-y-4"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="titulo-lote">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h3 id="titulo-lote" className="font-black text-base text-slate-800 dark:text-slate-100">
							Editar {itens.length} itens de uma vez
						</h3>
						<p className="text-xs text-slate-500 dark:text-slate-400">
							{titulo ? `${titulo} · ` : ""}total {moeda(total)}
						</p>
					</div>
					<button onClick={onClose} aria-label="Fechar" className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
						<X size={18} />
					</button>
				</div>

				<div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
					{opcoes.map((o) => (
						<button
							key={o.id}
							onClick={() => setAcao(o.id)}
							className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
								acao === o.id ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 dark:text-slate-400"
							}`}>
							{o.icone} {o.rotulo}
						</button>
					))}
				</div>

				{acao === "parcelar" && (
					<div className="grid grid-cols-2 gap-3">
						<label className="space-y-1">
							<span className="text-xs font-bold text-slate-600 dark:text-slate-300">Número de parcelas</span>
							<input type="number" min={2} max={48} value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} className={campo} />
						</label>
						<label className="space-y-1">
							<span className="text-xs font-bold text-slate-600 dark:text-slate-300">1º vencimento</span>
							<input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
						</label>
						<p className="col-span-2 text-[11px] text-slate-500 dark:text-slate-400">
							Cada item vira {parcelas} parcelas mensais. A data atual de cada item fica guardada como data da compra.
						</p>
					</div>
				)}
				{acao === "vencimento" && (
					<label className="block space-y-1">
						<span className="text-xs font-bold text-slate-600 dark:text-slate-300">Novo vencimento</span>
						<input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
					</label>
				)}
				{acao === "opcional" && (
					<div className="grid grid-cols-2 gap-2">
						{[true, false].map((v) => (
							<button
								key={String(v)}
								onClick={() => setOpcional(v)}
								className={`p-3 rounded-xl border text-xs font-bold cursor-pointer ${
									opcional === v ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
								}`}>
								{v ? "Opcional (pode recusar)" : "Obrigatória"}
							</button>
						))}
					</div>
				)}

				<p className="text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">{previa}</p>
				<p className="text-[11px] text-slate-500 dark:text-slate-400">
					Itens já pagos, já parcelados, de cartão ou que movimentaram saldo de conta ficam como estão (o app avisa quais).
				</p>

				{resultado && resultado.ignorados.length > 0 && (
					<div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-100 space-y-1">
						<p className="font-black">{resultado.ignorados.length} item(ns) ficaram de fora:</p>
						<ul className="list-disc pl-4 space-y-0.5">
							{resultado.ignorados.map((i, k) => (
								<li key={k}>
									{i.descricao} — {i.motivo}
								</li>
							))}
						</ul>
					</div>
				)}

				<div className="flex justify-end gap-2 pt-1">
					<button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
						{resultado ? "Fechar" : "Cancelar"}
					</button>
					<button
						onClick={salvar}
						disabled={salvando}
						className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer">
						{salvando && <Loader2 size={14} className="animate-spin" />} Aplicar a todos
					</button>
				</div>
			</div>
		</div>
	);
}
