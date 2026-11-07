import InputMoeda from "./InputMoeda";
import { useEffect, useState } from "react";
import { HandCoins, Landmark, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../../../packages/services/supabase";
import { recebimentosDivisaoService } from "../../../../packages/services/recebimentos-divisao.service";
import { hojeISO } from "../../../../packages/utils/datas";

interface Props {
	isOpen: boolean;
	onClose: () => void;
	onSuccess: () => void;
	userId: string;
	contato: { id: string; nome: string } | null;
	/** Restringe a itens específicos (ex.: pagamento de um item só) */
	itemIds?: string[];
	valorSugerido?: number;
}

const CHAVE_ULTIMA_CONTA = "finance_ultima_conta_recebimento";
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const lerValor = (t: string) => {
	const limpo = t.replace(/[^\d.,]/g, "");
	const n = limpo.includes(",") ? Number(limpo.replace(/\./g, "").replace(",", ".")) : Number(limpo);
	return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/**
 * Registra dinheiro recebido de alguém que divide contas com você.
 * A conta é obrigatória: é ela que permite reconhecer o Pix quando o extrato
 * for importado (sem lançar em dobro).
 */
export default function ReceberPagamentoModal({ isOpen, onClose, onSuccess, userId, contato, itemIds, valorSugerido }: Props) {
	const [contas, setContas] = useState<{ id: string; nome: string; instituicao?: string | null }[]>([]);
	const [contaId, setContaId] = useState("");
	const [valor, setValor] = useState("");
	const [data, setData] = useState(hojeISO());
	const [totais, setTotais] = useState<{ total: number; vencido: number } | null>(null);
	const [salvando, setSalvando] = useState(false);

	useEffect(() => {
		if (!isOpen || !contato) return;
		setData(hojeISO());
		setValor(valorSugerido ? valorSugerido.toFixed(2).replace(".", ",") : "");
		supabase
			.from("contas_bancarias")
			.select("id, nome, instituicao, ativa")
			.eq("usuario_id", userId)
			.order("nome")
			.then(({ data: lista }) => {
				const ativas = (lista || []).filter((c: any) => c.ativa !== false);
				setContas(ativas);
				let ultima = "";
				try {
					ultima = localStorage.getItem(CHAVE_ULTIMA_CONTA) || "";
				} catch {
					/* sem armazenamento local */
				}
				setContaId(ativas.find((c: any) => c.id === ultima)?.id || (ativas.length === 1 ? ativas[0].id : ""));
			});
		if (!itemIds) {
			recebimentosDivisaoService.totaisEmAberto(userId, contato.id, hojeISO()).then((t) => {
				setTotais(t);
				if (!valorSugerido) setValor((t.vencido > 0 ? t.vencido : t.total).toFixed(2).replace(".", ","));
			});
		} else {
			setTotais(null);
		}
	}, [isOpen, contato?.id]);

	// Fecha com Esc
	useEffect(() => {
		if (!isOpen) return;
		const aoTeclar = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !salvando) onClose();
		};
		window.addEventListener("keydown", aoTeclar);
		return () => window.removeEventListener("keydown", aoTeclar);
	}, [isOpen, salvando, onClose]);

	if (!isOpen || !contato) return null;

	const confirmar = async () => {
		const v = lerValor(valor);
		if (!(v > 0)) return toast.error("Informe o valor recebido.");
		if (!contaId) return toast.error("Escolha em qual conta o dinheiro entrou.");
		if (totais && v > totais.total + 0.005) {
			return toast.error(`O valor passa do que ${contato.nome.split(" ")[0]} deve (${moeda(totais.total)}).`);
		}
		setSalvando(true);
		try {
			const parecido = await recebimentosDivisaoService.recebimentoParecido(userId, { contatoId: contato.id, contaId, valor: v, data });
			if (
				parecido &&
				!window.confirm(
					`Já existe um recebimento de ${moeda(v)} de ${contato.nome} nessa conta em ${new Date(parecido.data + "T12:00:00").toLocaleDateString("pt-BR")} (provavelmente do extrato).\n\nRegistrar outro mesmo assim?`,
				)
			) {
				setSalvando(false);
				return;
			}
			const r = await recebimentosDivisaoService.registrarRecebimento(userId, {
				contatoId: contato.id,
				contatoNome: contato.nome,
				valor: v,
				data,
				contaId,
				origem: "manual",
				itemIds,
			});
			try {
				localStorage.setItem(CHAVE_ULTIMA_CONTA, contaId);
			} catch {
				/* sem armazenamento local */
			}
			toast.success(
				r.sobra > 0
					? `Recebido ${moeda(v)}: ${moeda(r.aplicado)} abatidos; ${moeda(r.sobra)} ficaram como crédito na conta.`
					: `Recebido ${moeda(v)} — ${r.itensAtualizados} item(ns) abatido(s).`,
			);
			onSuccess();
			onClose();
		} catch (e) {
			console.error(e);
			toast.error("Não foi possível registrar o recebimento.");
		} finally {
			setSalvando(false);
		}
	};

	const campo =
		"w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500";

	return (
		<div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm" onClick={onClose}>
			<div
				className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-5 sm:p-6 space-y-5"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="titulo-receber">
				<div className="flex items-start justify-between gap-3">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 flex items-center justify-center">
							<HandCoins size={20} />
						</div>
						<div>
							<h3 id="titulo-receber" className="font-black text-base text-slate-800 dark:text-slate-100">
								Receber pagamento
							</h3>
							<p className="text-xs text-slate-500 dark:text-slate-400">de {contato.nome}</p>
						</div>
					</div>
					<button onClick={onClose} aria-label="Fechar" className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
						<X size={18} />
					</button>
				</div>

				{totais && (
					<div className="grid grid-cols-2 gap-2">
						{[
							{ rotulo: "Vencido até hoje", v: totais.vencido },
							{ rotulo: "Tudo em aberto", v: totais.total },
						].map((o) => (
							<button
								key={o.rotulo}
								type="button"
								onClick={() => setValor(o.v.toFixed(2).replace(".", ","))}
								disabled={o.v <= 0}
								className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-500 disabled:opacity-40 text-left cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
								<p className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">{o.rotulo}</p>
								<p className="text-sm font-black tabular-nums text-slate-800 dark:text-slate-100">{moeda(o.v)}</p>
							</button>
						))}
					</div>
				)}

				<div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
					<label className="space-y-1">
						<span className="text-xs font-bold text-slate-600 dark:text-slate-300">Valor recebido</span>
						<InputMoeda value={valor} onChange={(v) => setValor(v)} className={campo} autoFocus />
					</label>
					<label className="space-y-1">
						<span className="text-xs font-bold text-slate-600 dark:text-slate-300">Data</span>
						<input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
					</label>
				</div>

				<label className="block space-y-1">
					<span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
						<Landmark size={13} /> Em qual conta o dinheiro entrou?
					</span>
					<select value={contaId} onChange={(e) => setContaId(e.target.value)} className={campo}>
						<option value="">Selecione a conta</option>
						{contas.map((c) => (
							<option key={c.id} value={c.id}>
								{c.nome}
								{c.instituicao && c.instituicao !== c.nome ? ` (${c.instituicao})` : ""}
							</option>
						))}
					</select>
					<span className="block text-[11px] text-slate-500 dark:text-slate-400">
						Quando você importar o extrato dessa conta, o Pix é reconhecido e não entra em dobro.
					</span>
				</label>

				<button
					onClick={confirmar}
					disabled={salvando}
					className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-sm flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">
					{salvando ? <Loader2 size={16} className="animate-spin" /> : <HandCoins size={16} />}
					Registrar recebimento
				</button>
			</div>
		</div>
	);
}
