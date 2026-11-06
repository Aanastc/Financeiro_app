import { useEffect, useState, type ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Download, HandCoins, MessageSquare, Pencil, Send, Undo2, X } from "lucide-react";
import ListaPorData from "../ListaPorData";
import type { ItemPessoa, PessoaSaldo } from "../../lib/divisaoPessoas";
import { corAvatar } from "./PessoasDivisao";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");

interface Props {
	pessoa: PessoaSaldo | null;
	temConta: boolean;
	onClose: () => void;
	onReceber: (itemIds?: string[], valor?: number) => void;
	onPagar: (item: ItemPessoa) => void;
	onEditar: (id: string) => void;
	onDesfazer: (id: string) => void;
	onAlternarOpcional: (item: ItemPessoa) => void;
	onCobrar: () => void;
	onExcel: () => void;
	onConvidar: () => void;
	/** Ex.: "Mover para o grupo" */
	extra?: ReactNode;
}

/**
 * Tudo com uma pessoa num lugar só: saldo cruzado, o que vence em cada data
 * (os dois sentidos juntos) e as ações. Abre como painel lateral.
 */
export default function DetalhePessoa({
	pessoa,
	temConta,
	onClose,
	onReceber,
	onPagar,
	onEditar,
	onDesfazer,
	onAlternarOpcional,
	onCobrar,
	onExcel,
	onConvidar,
	extra,
}: Props) {
	const [verAcertados, setVerAcertados] = useState(false);

	useEffect(() => {
		if (!pessoa) return;
		setVerAcertados(false);
		const tecla = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", tecla);
		return () => window.removeEventListener("keydown", tecla);
	}, [pessoa, onClose]);

	if (!pessoa) return null;
	const nome = pessoa.contato?.nome || "Contato";
	const primeiro = nome.split(" ")[0];
	const abertos = pessoa.itens.filter((i) => i.aberto > 0);
	const acertados = pessoa.itens.filter((i) => i.aberto <= 0);
	const saldo = pessoa.saldo;

	const linhaItem = (i: ItemPessoa, dentroDoGrupo: boolean) => (
		<div className="py-2.5 flex items-center gap-3">
			<span
				className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
					i.direcao === "RECEBER"
						? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
						: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
				}`}
				title={i.direcao === "RECEBER" ? `${primeiro} te deve` : `Você deve a ${primeiro}`}>
				{i.direcao === "RECEBER" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
			</span>
			<span className="min-w-0 flex-1">
				<span className={`block text-[13px] font-bold truncate ${i.recusado ? "line-through text-slate-400" : "text-slate-800 dark:text-slate-100"}`}>{i.descricao}</span>
				<span className="block text-[11px] text-slate-500 dark:text-slate-400">
					{!dentroDoGrupo && `${dataBR(i.data)} · `}
					{i.direcao === "RECEBER" ? `${primeiro} te deve` : "você deve"}
					{i.grupo && ` · grupo ${i.grupo}`}
					{i.pago > 0 && !i.quitado && ` · ${i.compensado ? "abatido" : "pago"} ${moeda(i.pago)} de ${moeda(i.valor)}`}
					{i.recusado && " · recusado"}
				</span>
			</span>
			{i.direcao === "RECEBER" && !i.quitado && !i.recusado && (
				<button
					onClick={() => onAlternarOpcional(i)}
					title={i.opcional ? "Tornar obrigatória" : "Tornar opcional (a pessoa pode recusar)"}
					className={`hidden sm:inline px-1.5 py-0.5 rounded text-[9px] font-black uppercase cursor-pointer ${
						i.opcional ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
					}`}>
					{i.opcional ? "Opcional" : "Obrigatória"}
				</button>
			)}
			<span className={`text-sm font-black tabular-nums shrink-0 ${i.direcao === "RECEBER" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
				{moeda(i.aberto > 0 ? i.aberto : i.valor)}
			</span>
			<span className="flex items-center gap-1 shrink-0">
				<button onClick={() => onEditar(i.id)} title="Editar" aria-label="Editar" className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer">
					<Pencil size={13} />
				</button>
				{i.aberto > 0 ? (
					<button
						onClick={() => (i.direcao === "RECEBER" ? onReceber([i.id], i.aberto) : onPagar(i))}
						className={`px-2 py-1 rounded-lg text-[11px] font-bold text-white cursor-pointer ${i.direcao === "RECEBER" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-500 hover:bg-rose-600"}`}>
						{i.direcao === "RECEBER" ? "Recebi" : "Paguei"}
					</button>
				) : i.quitado ? (
					<button onClick={() => onDesfazer(i.id)} title="Desfazer pagamento" aria-label="Desfazer pagamento" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer">
						<Undo2 size={13} />
					</button>
				) : null}
			</span>
		</div>
	);

	return (
		<div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/60 backdrop-blur-sm" onClick={onClose}>
			<aside
				className="h-full w-full sm:max-w-xl bg-white dark:bg-slate-900 sm:border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="titulo-pessoa">
				{/* Cabeçalho */}
				<div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 space-y-4">
					<div className="flex items-start justify-between gap-3">
						<div className="flex items-center gap-3 min-w-0">
							<span className={`w-12 h-12 rounded-2xl ${corAvatar(pessoa.contato.id)} text-white text-lg font-black flex items-center justify-center shrink-0`}>
								{nome.charAt(0).toUpperCase()}
							</span>
							<div className="min-w-0">
								<h2 id="titulo-pessoa" className="text-xl font-black text-slate-800 dark:text-slate-100 truncate">{nome}</h2>
								<p className="text-xs text-slate-500 dark:text-slate-400 truncate">
									{pessoa.contato.telefone || pessoa.contato.email || "sem celular ou e-mail"} · {temConta ? "usa o app" : "ainda não está no app"}
								</p>
							</div>
						</div>
						<button onClick={onClose} aria-label="Fechar" className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
							<X size={18} />
						</button>
					</div>

					<div className={`rounded-2xl p-4 ${saldo > 0.009 ? "bg-emerald-50 dark:bg-emerald-950/30" : saldo < -0.009 ? "bg-rose-50 dark:bg-rose-950/30" : "bg-slate-50 dark:bg-slate-800/50"}`}>
						<p className={`text-sm font-bold ${saldo > 0.009 ? "text-emerald-800 dark:text-emerald-200" : saldo < -0.009 ? "text-rose-800 dark:text-rose-200" : "text-slate-600 dark:text-slate-300"}`}>
							{saldo > 0.009 ? `${primeiro} te deve` : saldo < -0.009 ? `Você deve a ${primeiro}` : "Tudo acertado"}
						</p>
						{Math.abs(saldo) > 0.009 && (
							<p className={`text-3xl font-black tabular-nums ${saldo > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>{moeda(Math.abs(saldo))}</p>
						)}
						{pessoa.receber > 0.009 && pessoa.pagar > 0.009 && (
							<p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
								{primeiro} te deve {moeda(pessoa.receber)} e você deve {moeda(pessoa.pagar)}.
							</p>
						)}
					</div>

					<div className="flex flex-wrap gap-2">
						{pessoa.receber > 0.009 && (
							<button onClick={() => onReceber()} className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer">
								<HandCoins size={14} /> Receber pagamento
							</button>
						)}
						{pessoa.receber > 0.009 && (
							<button onClick={onCobrar} className="px-3.5 py-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer">
								<MessageSquare size={14} /> Cobrar no WhatsApp
							</button>
						)}
						<button onClick={onExcel} className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
							<Download size={14} /> Excel
						</button>
						{!temConta && (
							<button onClick={onConvidar} className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
								<Send size={14} /> Convidar para o app
							</button>
						)}
					</div>
					{extra}
				</div>

				{/* Lançamentos */}
				<div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 custom-scrollbar">
					<section className="space-y-2">
						<h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
							Em aberto {abertos.length > 0 && `· ${abertos.length}`}
						</h3>
						{abertos.length === 0 ? (
							<p className="text-sm text-slate-500 dark:text-slate-400">Nada em aberto com {primeiro}.</p>
						) : (
							<ListaPorData
								compacto
								itens={abertos}
								dataDe={(i) => i.data}
								resumo={(lista) => {
									const liquido = lista.reduce((s, i) => s + (i.direcao === "RECEBER" ? i.aberto : -i.aberto), 0);
									const receber = lista.filter((i) => i.direcao === "RECEBER").reduce((s, i) => s + i.aberto, 0);
									const pagar = lista.filter((i) => i.direcao === "PAGAR").reduce((s, i) => s + i.aberto, 0);
									return {
										total: Math.abs(liquido),
										detalhe: receber && pagar ? `${primeiro} te deve ${moeda(receber)} · você deve ${moeda(pagar)}` : liquido >= 0 ? `${primeiro} te deve` : "você deve",
									};
								}}
								acao={(lista) =>
									lista.every((i) => i.direcao === "RECEBER") ? (
										<button
											onClick={() => onReceber(lista.map((i) => i.id), Math.round(lista.reduce((s, i) => s + i.aberto, 0) * 100) / 100)}
											className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap">
											Recebi
										</button>
									) : null
								}
								renderItem={(i, dentro) => linhaItem(i, dentro)}
							/>
						)}
					</section>

					{acertados.length > 0 && (
						<section className="space-y-2">
							<button
								onClick={() => setVerAcertados((v) => !v)}
								className="w-full flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 cursor-pointer">
								<span>Já acertado · {acertados.length}</span>
								<ChevronDown size={15} className={`transition-transform ${verAcertados ? "rotate-180" : ""}`} />
							</button>
							{verAcertados && <div className="divide-y divide-slate-100 dark:divide-slate-800">{acertados.map((i) => <div key={i.id}>{linhaItem(i, false)}</div>)}</div>}
						</section>
					)}
				</div>
			</aside>
		</div>
	);
}
