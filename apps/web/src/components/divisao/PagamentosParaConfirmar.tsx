import { useMemo, useState } from "react";
import { Check, HandCoins, Loader2, X } from "lucide-react";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const lerMeta = (obs?: string | null): Record<string, any> => {
	try {
		return obs && obs.trim().startsWith("{") ? JSON.parse(obs) : {};
	} catch {
		return {};
	}
};

export interface PagamentoInformado {
	item: any;
	contato: { id: string; nome: string };
	valor: number;
	informadoEm: string;
	descricao: string;
	parcela?: string;
}

interface Props {
	/** Devedores como vêm de financeService.getDevedores (contato + itens) */
	devedores: any[];
	/** Abre o registro do recebimento (conta, data) já com o valor avisado */
	onConfirmar: (p: PagamentoInformado) => void;
	onNaoRecebi: (p: PagamentoInformado) => Promise<void>;
}

/**
 * "Fulana avisou que pagou": cada item/parcela em que a outra pessoa apertou
 * "Paguei" e que ainda espera você confirmar. Confirmar registra o recebimento
 * (entrada na conta + baixa no item); "Não recebi" devolve o item para em aberto.
 */
export default function PagamentosParaConfirmar({ devedores, onConfirmar, onNaoRecebi }: Props) {
	const [recusando, setRecusando] = useState<string | null>(null);

	const pendentes = useMemo(() => {
		const lista: PagamentoInformado[] = [];
		for (const d of devedores || []) {
			for (const item of d.itens || []) {
				if (item.terceiro_pago) continue;
				const meta = lerMeta(item.observacao);
				const aviso = meta.pagamento_informado;
				if (!aviso) continue;
				const total = Number(meta.total_parcelas || meta.total_meses) || 0;
				const atual = Number(meta.parcela || meta.mes_numero) || 0;
				lista.push({
					item,
					contato: { id: d.contato.id, nome: d.contato.nome },
					valor: Number(aviso.valor) || 0,
					informadoEm: aviso.informado_em,
					descricao: String(meta.descricao_original || item.descricao || ""),
					parcela: total > 1 && atual ? `${atual}/${total}` : undefined,
				});
			}
		}
		return lista.sort((a, b) => String(a.item.data).localeCompare(String(b.item.data)));
	}, [devedores]);

	if (pendentes.length === 0) return null;

	return (
		<section className="rounded-3xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-4 sm:p-5 space-y-3">
			<header className="flex items-center gap-2">
				<HandCoins size={18} className="text-amber-600 dark:text-amber-400" />
				<h2 className="text-sm font-black text-amber-900 dark:text-amber-100">
					Pagamentos para confirmar ({pendentes.length})
				</h2>
			</header>
			<p className="text-xs text-amber-800/80 dark:text-amber-200/80">
				A pessoa avisou que pagou. Confira na sua conta: ao confirmar, o recebimento é registrado e o item sai do em aberto.
			</p>
			<ul className="divide-y divide-amber-200/70 dark:divide-amber-900/40">
				{pendentes.map((p) => (
					<li key={p.item.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
						<div className="min-w-0 flex-1">
							<p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
								{p.contato.nome.split(" ")[0]} pagou {moeda(p.valor)}
							</p>
							<p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
								{p.descricao}
								{p.parcela && ` · parcela ${p.parcela}`}
								{" · "}vence {new Date(p.item.data + "T12:00:00").toLocaleDateString("pt-BR")}
								{p.informadoEm && ` · avisou em ${new Date(p.informadoEm).toLocaleDateString("pt-BR")}`}
							</p>
						</div>
						<div className="flex gap-2 shrink-0">
							<button
								onClick={() => onConfirmar(p)}
								className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer">
								<Check size={13} /> Confirmar
							</button>
							<button
								onClick={async () => {
									if (!window.confirm(`Dizer a ${p.contato.nome.split(" ")[0]} que você não recebeu ${moeda(p.valor)}?`)) return;
									setRecusando(p.item.id);
									await onNaoRecebi(p);
									setRecusando(null);
								}}
								disabled={recusando === p.item.id}
								className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer">
								{recusando === p.item.id ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} Não recebi
							</button>
						</div>
					</li>
				))}
			</ul>
		</section>
	);
}
