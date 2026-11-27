import { useEffect, useState, type ReactNode } from "react";
import {
	ArrowDownLeft,
	ArrowUpRight,
	ChevronDown,
	ChevronLeft,
	Download,
	HandCoins,
	MessageSquare,
	Pencil,
	Send,
	Undo2,
} from "lucide-react";
import ListaPorData from "../ListaPorData";
import { type ItemPessoa, type PessoaSaldo } from "../../lib/divisaoPessoas";
import { corAvatar } from "./PessoasDivisao";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");

interface Props {
	pessoa: PessoaSaldo | null;
	temConta: boolean;
	/** "convite enviado há 2 dias · aguardando aceitar" */
	situacaoConvite?: string;
	convitePendente?: boolean;
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
 * Página completa da pessoa: saldo cruzado, KPIs, lançamentos agrupados por mês
 * e ações diretas — no mesmo padrão visual da página de Grupos.
 */
export default function DetalhePessoa({
	pessoa,
	temConta,
	situacaoConvite,
	convitePendente,
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

	const linhaItem = (i: ItemPessoa) => {
		const resumoOrigens =
			i.abatidoDe.length === 1
				? i.abatidoDe[0].descricao.slice(0, 42) + (i.abatidoDe[0].descricao.length > 42 ? "…" : "")
				: i.abatidoDe.length > 1
					? `${i.abatidoDe.length} itens compensados`
					: "";
		return (
			<div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
				<div className="flex items-start gap-3 min-w-0 flex-1">
					<span
						className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
							i.direcao === "RECEBER"
								? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
								: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
						}`}
						title={i.direcao === "RECEBER" ? `${primeiro} te deve` : `Você deve a ${primeiro}`}>
						{i.direcao === "RECEBER" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
					</span>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5 min-w-0">
							<span
								title={i.descricao}
								className={`text-[13px] font-bold truncate ${
									i.recusado ? "line-through text-slate-400" : "text-slate-800 dark:text-slate-100"
								}`}>
								{i.descricao}
							</span>
						</div>
						<p className="text-[11px] text-slate-500 dark:text-slate-400">
							{dataBR(i.data)} · {i.direcao === "RECEBER" ? `${primeiro} te deve` : "você deve"}
							{i.grupo && ` · grupo ${i.grupo}`}
							{i.pago > 0 && !i.quitado && ` · ${i.compensado ? "abatido" : "pago"} ${moeda(i.pago)} de ${moeda(i.valor)}`}
							{i.recusado && " · recusado"}
						</p>
						{i.abatido > 0 && (
							<div
								className="mt-1 inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10.5px]"
								title={i.abatidoDe.map((o) => `${o.descricao} (${dataBR(o.data)}): ${moeda(o.valor)}`).join("\n")}>
								<span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
									Abatido − {moeda(i.abatido)}
								</span>
								{resumoOrigens && <span className="text-slate-500 dark:text-slate-400">· {resumoOrigens}</span>}
							</div>
						)}
					</div>
				</div>

				<div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
					{i.direcao === "RECEBER" && !i.quitado && !i.recusado && (
						<button
							onClick={() => onAlternarOpcional(i)}
							title={i.opcional ? "Tornar obrigatória" : "Tornar opcional (a pessoa pode recusar)"}
							className={`px-2 py-0.5 rounded text-[9.5px] font-black uppercase cursor-pointer ${
								i.opcional && i.resposta === "aceita"
									? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
									: i.opcional
										? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
										: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
							}`}>
							{i.opcional ? (i.resposta === "aceita" ? "Opcional · aceita" : "Opcional · aguardando") : "Obrigatória"}
						</button>
					)}

					<div className="text-right leading-tight min-w-[96px]">
						<span
							className={`block text-sm font-black tabular-nums ${
								i.direcao === "RECEBER" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
							}`}>
							{i.direcao === "RECEBER" ? "+" : "−"} {moeda(i.aberto > 0 ? i.aberto : i.valor)}
						</span>
						{i.abatido > 0 && (
							<span className="block text-[10px] font-medium text-slate-400 line-through tabular-nums">
								{moeda(i.valor)}
							</span>
						)}
					</div>

					<span className="flex items-center gap-1.5 shrink-0">
						<button
							onClick={() => onEditar(i.id)}
							title="Editar"
							aria-label="Editar"
							className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer">
							<Pencil size={14} />
						</button>
						{i.aberto > 0 ? (
							<button
								onClick={() => (i.direcao === "RECEBER" ? onReceber([i.id], i.aberto) : onPagar(i))}
								className={`px-3 py-1.5 rounded-xl text-xs font-bold text-white cursor-pointer ${
									i.direcao === "RECEBER" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-500 hover:bg-rose-600"
								}`}>
								{i.direcao === "RECEBER" ? "Recebi" : "Paguei"}
							</button>
						) : i.quitado ? (
							<button
								onClick={() => onDesfazer(i.id)}
								title="Desfazer pagamento"
								aria-label="Desfazer pagamento"
								className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer">
								<Undo2 size={14} />
							</button>
						) : null}
					</span>
				</div>
			</div>
		);
	};

	return (
		<div className="space-y-6 animate-in fade-in duration-200">
			{/* Cabeçalho da página da pessoa (mesmo padrão da página de Grupo) */}
			<div className="bg-white dark:bg-slate-900 p-5 sm:p-7 rounded-3xl sm:rounded-[36px] shadow-sm border border-slate-100 dark:border-slate-800 border-t-4 border-t-emerald-500 space-y-5">
				<button
					type="button"
					onClick={onClose}
					className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 transition-colors cursor-pointer">
					<ChevronLeft size={15} /> Todas as pessoas
				</button>

				<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
					<div className="flex items-center gap-4 min-w-0">
						<span
							className={`w-14 h-14 rounded-2xl ${corAvatar(pessoa.contato.id)} text-white text-xl font-black flex items-center justify-center shrink-0 shadow-md`}>
							{nome.charAt(0).toUpperCase()}
						</span>
						<div className="min-w-0">
							<p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
								Extrato individual
							</p>
							<h1 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight truncate">
								{nome}
							</h1>
							<p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
								{pessoa.contato.telefone || pessoa.contato.email || "sem celular ou e-mail"} ·{" "}
								<span className={temConta ? "text-emerald-600 dark:text-emerald-400 font-semibold" : convitePendente ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}>
									{situacaoConvite || (temConta ? "conta ativa no app" : "ainda não está no app")}
								</span>
							</p>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2 shrink-0">
						{pessoa.receber > 0.009 && (
							<button
								onClick={() => onReceber()}
								className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer">
								<HandCoins size={15} /> Receber pagamento
							</button>
						)}
						{pessoa.receber > 0.009 && (
							<button
								onClick={onCobrar}
								className="px-4 py-2.5 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-black flex items-center gap-2 cursor-pointer">
								<MessageSquare size={15} /> WhatsApp
							</button>
						)}
						<button
							onClick={onExcel}
							className="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
							<Download size={15} /> Excel
						</button>
						{!temConta && (
							<button
								onClick={onConvidar}
								className="px-4 py-2.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
								<Send size={15} /> {convitePendente ? "Reenviar convite" : "Convidar"}
							</button>
						)}
					</div>
				</div>

				{extra}
			</div>

			{/* KPIs do relacionamento financeiro com a pessoa */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
					<p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
						{primeiro} te deve
					</p>
					<p className="text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
						{moeda(pessoa.receber)}
					</p>
					<p className="text-[11px] text-slate-400 mt-1">Total em aberto a receber</p>
				</div>
				<div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
					<p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
						Você deve a {primeiro}
					</p>
					<p className="text-2xl font-black tabular-nums text-rose-600 dark:text-rose-400 mt-1">
						{moeda(pessoa.pagar)}
					</p>
					<p className="text-[11px] text-slate-400 mt-1">Total em aberto a pagar</p>
				</div>
				<div
					className={`p-5 rounded-3xl border shadow-sm ${
						saldo > 0.009
							? "bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200/80 dark:border-emerald-900/50"
							: saldo < -0.009
								? "bg-rose-50/70 dark:bg-rose-950/25 border-rose-200/80 dark:border-rose-900/50"
								: "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800"
					}`}>
					<p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
						{saldo > 0.009 ? `Saldo líquido (${primeiro} te paga)` : saldo < -0.009 ? `Saldo líquido (você paga)` : "Saldo líquido"}
					</p>
					<p
						className={`text-2xl font-black tabular-nums mt-1 ${
							saldo > 0.009
								? "text-emerald-600 dark:text-emerald-400"
								: saldo < -0.009
									? "text-rose-600 dark:text-rose-400"
									: "text-slate-500 dark:text-slate-400"
						}`}>
						{Math.abs(saldo) > 0.009 ? moeda(Math.abs(saldo)) : "Tudo certo"}
					</p>
					<p className="text-[11px] text-slate-400 mt-1">{abertos.length} lançamento(s) em aberto</p>
				</div>
			</div>

			{/* Lançamentos em aberto agrupados por mês */}
			<div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
				<div>
					<h2 className="font-black text-base text-slate-800 dark:text-slate-100">
						Lançamentos em aberto {abertos.length > 0 && `(${abertos.length})`}
					</h2>
					<p className="text-xs text-slate-500 dark:text-slate-400">
						Agrupados por mês de vencimento · clique no mês para expandir os itens
					</p>
				</div>

				{abertos.length === 0 ? (
					<div className="p-8 text-center text-slate-500 dark:text-slate-400 text-xs font-medium bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
						Nada em aberto com {primeiro}.
					</div>
				) : (
					<ListaPorData
						itens={abertos}
						dataDe={(i) => String(i.data || "").slice(0, 7)}
						ordem="asc"
						ordenarItens={(a, b) => a.data.localeCompare(b.data) || a.descricao.localeCompare(b.descricao, "pt-BR")}
						resumo={(lista) => {
							const liquido = lista.reduce((s, i) => s + (i.direcao === "RECEBER" ? i.aberto : -i.aberto), 0);
							const receber = lista.filter((i) => i.direcao === "RECEBER").reduce((s, i) => s + i.aberto, 0);
							const pagar = lista.filter((i) => i.direcao === "PAGAR").reduce((s, i) => s + i.aberto, 0);
							return {
								total: Math.abs(liquido),
								valorRender: (
									<span
										className={`font-black text-sm tabular-nums ${
											liquido >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
										}`}>
										{liquido >= 0 ? "+" : "−"} {moeda(Math.abs(liquido))}
									</span>
								),
								detalhe:
									receber && pagar
										? `${primeiro} te deve ${moeda(receber)} · você deve ${moeda(pagar)}`
										: liquido >= 0
											? `${primeiro} te deve`
											: "você deve",
							};
						}}
						acao={(lista) =>
							lista.every((i) => i.direcao === "RECEBER") ? (
								<button
									onClick={() =>
										onReceber(
											lista.map((i) => i.id),
											Math.round(lista.reduce((s, i) => s + i.aberto, 0) * 100) / 100
										)
									}
									className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer whitespace-nowrap">
									Recebi o mês
								</button>
							) : null
						}
						renderItem={(i) => linhaItem(i)}
					/>
				)}
			</div>

			{/* Já acertado */}
			{acertados.length > 0 && (
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-3">
					<button
						type="button"
						onClick={() => setVerAcertados((v) => !v)}
						className="w-full flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 cursor-pointer">
						<span>Já acertado · {acertados.length}</span>
						<ChevronDown size={16} className={`transition-transform ${verAcertados ? "rotate-180" : ""}`} />
					</button>
					{verAcertados && (
						<div className="divide-y divide-slate-100 dark:divide-slate-800">
							{acertados.map((i) => (
								<div key={i.id}>{linhaItem(i)}</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
