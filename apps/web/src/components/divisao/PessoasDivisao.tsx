import { ChevronRight, Users } from "lucide-react";
import type { PessoaSaldo } from "../../lib/divisaoPessoas";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataCurta = (iso: string) => {
	const [a, m, d] = iso.split("-");
	return `${d}/${m}${a !== String(new Date().getFullYear()) ? `/${a.slice(2)}` : ""}`;
};
const CORES_AVATAR = ["bg-violet-500", "bg-sky-500", "bg-amber-500", "bg-emerald-500", "bg-rose-500", "bg-indigo-500", "bg-teal-500", "bg-fuchsia-500"];
export const corAvatar = (id: string) => CORES_AVATAR[[...String(id)].reduce((s, c) => s + c.charCodeAt(0), 0) % CORES_AVATAR.length];

/** Lista de pessoas: uma linha por pessoa com o saldo já cruzado. */
export default function PessoasDivisao({ pessoas, onAbrir }: { pessoas: PessoaSaldo[]; onAbrir: (p: PessoaSaldo) => void }) {
	if (pessoas.length === 0) {
		return (
			<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-10 text-center">
				<Users size={30} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
				<p className="font-bold text-slate-700 dark:text-slate-200">Nenhuma divisão em aberto</p>
				<p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Use "Nova despesa" ou o assistente para dividir uma conta com alguém.</p>
			</div>
		);
	}

	return (
		<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
			<ul className="divide-y divide-slate-100 dark:divide-slate-800">
				{pessoas.map((p) => {
					const nome = p.contato?.nome || "Contato";
					const acertado = Math.abs(p.saldo) <= 0.009;
					const vencimentos = new Set(p.itens.filter((i) => i.aberto > 0).map((i) => i.data)).size;
					const totalLancado = p.itens.reduce((s, i) => s + (i.recusado ? 0 : i.valor), 0);
					const totalPago = p.itens.reduce((s, i) => s + i.pago, 0);
					const progresso = totalLancado > 0 ? Math.min(100, (totalPago / totalLancado) * 100) : 0;
					return (
						<li key={p.contato.id}>
							<button
								onClick={() => onAbrir(p)}
								className="w-full text-left px-4 sm:px-6 py-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
								<span className={`w-11 h-11 rounded-2xl ${corAvatar(p.contato.id)} text-white font-black flex items-center justify-center shrink-0`}>
									{nome.charAt(0).toUpperCase()}
								</span>
								<span className="min-w-0 flex-1">
									<span className="block font-black text-slate-800 dark:text-slate-100 truncate">{nome}</span>
									<span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
										{acertado
											? "tudo acertado"
											: `${vencimentos} ${vencimentos === 1 ? "vencimento" : "vencimentos"} em aberto${p.proximo ? ` · próximo ${dataCurta(p.proximo.data)}` : ""}`}
										{p.receber > 0.009 && p.pagar > 0.009 && " · saldos cruzados"}
									</span>
									{totalLancado > 0 && (
										<span className="mt-2 block h-1.5 w-full max-w-60 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" title={`${Math.round(progresso)}% já acertado`}>
											<span className="block h-full rounded-full bg-emerald-500" style={{ width: `${progresso}%` }} />
										</span>
									)}
								</span>
								<span className="text-right shrink-0">
									{acertado ? (
										<span className="text-xs font-bold text-slate-400 dark:text-slate-500">em dia</span>
									) : (
										<>
											<span className={`block text-[10px] font-black uppercase ${p.saldo > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
												{p.saldo > 0 ? "te deve" : "você deve"}
											</span>
											<span className={`block text-lg font-black tabular-nums ${p.saldo > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
												{moeda(Math.abs(p.saldo))}
											</span>
										</>
									)}
								</span>
								<ChevronRight size={18} className="text-slate-300 dark:text-slate-600 shrink-0" />
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
