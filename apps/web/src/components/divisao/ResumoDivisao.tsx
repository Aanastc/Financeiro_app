import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownLeft, ArrowUpRight, CalendarClock } from "lucide-react";
import { useTheme } from "../../hooks/useTema";

/**
 * Topo da divisão de contas: saldo geral (já cruzado entre as pessoas) e o
 * histórico mês a mês de quanto entra (a receber) e sai (a pagar).
 */

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const moedaCurta = (v: number) =>
	v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(v)}`;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const lerMeta = (obs?: string | null): any => {
	try {
		return obs && obs.trim().startsWith("{") ? JSON.parse(obs) : {};
	} catch {
		return {};
	}
};

export interface ProximoVencimento {
	data: string;
	valor: number;
	nome: string;
	receber: boolean;
}

interface Props {
	transacoes: any[];
	totalReceber: number;
	totalPagar: number;
	proximo: ProximoVencimento | null;
	pessoasComSaldo: number;
}

const CORES = {
	receber: { claro: "#059669", escuro: "#34d399" },
	pagar: { claro: "#e11d48", escuro: "#fb7185" },
};

export default function ResumoDivisao({ transacoes, totalReceber, totalPagar, proximo, pessoasComSaldo }: Props) {
	const escuro = useTheme();
	const saldo = Math.round((totalReceber - totalPagar) * 100) / 100;
	const hoje = new Date();
	const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

	// Janela: 5 meses para trás e 6 para frente (o que tiver lançamento)
	const dados = useMemo(() => {
		const mapa = new Map<string, { receber: number; pagar: number; receberAberto: number; pagarAberto: number }>();
		for (const t of transacoes) {
			const meta = lerMeta(t.observacao);
			if (meta.resposta_cobranca === "recusada") continue;
			const receber = Boolean(t.terceiro);
			const pagar = !t.terceiro && Boolean(meta.parceria_credor_id);
			if (!receber && !pagar) continue;
			const ym = String(t.data).slice(0, 7);
			const valor = Number(t.valor) || 0;
			const aberto = t.terceiro_pago ? 0 : Math.max(0, valor - (Number(meta.valor_pago) || 0));
			const m = mapa.get(ym) || { receber: 0, pagar: 0, receberAberto: 0, pagarAberto: 0 };
			if (receber) {
				m.receber += valor;
				m.receberAberto += aberto;
			} else {
				m.pagar += valor;
				m.pagarAberto += aberto;
			}
			mapa.set(ym, m);
		}
		const meses: string[] = [];
		for (let k = -5; k <= 6; k++) {
			const d = new Date(hoje.getFullYear(), hoje.getMonth() + k, 1);
			meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
		}
		// corta meses vazios nas pontas
		let ini = meses.findIndex((ym) => mapa.has(ym) || ym === mesAtual);
		let fim = meses.length - 1 - [...meses].reverse().findIndex((ym) => mapa.has(ym) || ym === mesAtual);
		ini = Math.max(0, Math.min(ini, meses.indexOf(mesAtual) - 2));
		fim = Math.max(fim, meses.indexOf(mesAtual) + 2);
		return meses.slice(ini, fim + 1).map((ym) => {
			const m = mapa.get(ym) || { receber: 0, pagar: 0, receberAberto: 0, pagarAberto: 0 };
			const [a, mm] = ym.split("-");
			return {
				ym,
				rotulo: `${MESES[Number(mm) - 1]}${a !== String(hoje.getFullYear()) ? `/${a.slice(2)}` : ""}`,
				receber: Math.round(m.receber * 100) / 100,
				pagar: Math.round(m.pagar * 100) / 100,
				receberAberto: Math.round(m.receberAberto * 100) / 100,
				pagarAberto: Math.round(m.pagarAberto * 100) / 100,
			};
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [transacoes, mesAtual]);

	const cor = (k: "receber" | "pagar") => (escuro ? CORES[k].escuro : CORES[k].claro);
	const temDados = dados.some((d) => d.receber || d.pagar);

	const TooltipMes = ({ active, payload }: any) => {
		if (!active || !payload?.length) return null;
		const d = payload[0].payload;
		return (
			<div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 shadow-lg text-xs space-y-1">
				<p className="font-black text-slate-800 dark:text-slate-100 capitalize">{d.rotulo}{d.ym === mesAtual ? " · este mês" : ""}</p>
				<p className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
					<span className="w-2.5 h-2.5 rounded-sm" style={{ background: cor("receber") }} />A receber: <strong>{moeda(d.receber)}</strong>
					{d.receberAberto > 0 && d.receberAberto < d.receber && <span className="text-slate-400">({moeda(d.receberAberto)} em aberto)</span>}
				</p>
				<p className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
					<span className="w-2.5 h-2.5 rounded-sm" style={{ background: cor("pagar") }} />A pagar: <strong>{moeda(d.pagar)}</strong>
					{d.pagarAberto > 0 && d.pagarAberto < d.pagar && <span className="text-slate-400">({moeda(d.pagarAberto)} em aberto)</span>}
				</p>
			</div>
		);
	};

	const diaMes = (iso: string) => {
		const [a, m, d] = iso.split("-");
		return `${d}/${m}${a !== String(hoje.getFullYear()) ? `/${a}` : ""}`;
	};

	return (
		<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
			{/* SALDO */}
			<div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col gap-5">
				<div>
					<p className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Seu saldo geral</p>
					<p
						className={`text-3xl sm:text-4xl font-black tabular-nums mt-1 ${
							saldo > 0.009 ? "text-emerald-600 dark:text-emerald-400" : saldo < -0.009 ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-200"
						}`}>
						{moeda(Math.abs(saldo))}
					</p>
					<p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
						{saldo > 0.009 ? "no total, te devem esse valor" : saldo < -0.009 ? "no total, você deve esse valor" : "tudo acertado com todo mundo"}
						{pessoasComSaldo > 0 && <span className="text-slate-400 dark:text-slate-500"> · {pessoasComSaldo} {pessoasComSaldo === 1 ? "pessoa" : "pessoas"}</span>}
					</p>
				</div>

				<div className="grid grid-cols-2 gap-3">
					<div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 p-3">
						<p className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
							<ArrowDownLeft size={12} /> Te devem
						</p>
						<p className="text-base font-black tabular-nums text-emerald-700 dark:text-emerald-300">{moeda(totalReceber)}</p>
					</div>
					<div className="rounded-2xl bg-rose-50 dark:bg-rose-950/30 p-3">
						<p className="text-[10px] font-black uppercase text-rose-700 dark:text-rose-300 flex items-center gap-1">
							<ArrowUpRight size={12} /> Você deve
						</p>
						<p className="text-base font-black tabular-nums text-rose-700 dark:text-rose-300">{moeda(totalPagar)}</p>
					</div>
				</div>

				{proximo && (
					<div className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 p-3">
						<span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 flex items-center justify-center shrink-0">
							<CalendarClock size={17} />
						</span>
						<div className="min-w-0">
							<p className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">Próximo vencimento · {diaMes(proximo.data)}</p>
							<p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
								{proximo.receber ? `${proximo.nome.split(" ")[0]} te paga ${moeda(proximo.valor)}` : `Você paga ${moeda(proximo.valor)} a ${proximo.nome.split(" ")[0]}`}
							</p>
						</div>
					</div>
				)}
			</div>

			{/* HISTÓRICO MÊS A MÊS */}
			<div className="lg:col-span-2 bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col">
				<div className="flex flex-wrap items-start justify-between gap-2 mb-3">
					<div>
						<h3 className="font-black text-base text-slate-800 dark:text-slate-100">Mês a mês</h3>
						<p className="text-xs text-slate-500 dark:text-slate-400">Quanto vence para receber e para pagar em cada mês</p>
					</div>
					<div className="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-300">
						<span className="flex items-center gap-1.5">
							<span className="w-3 h-3 rounded-sm" style={{ background: cor("receber") }} /> A receber
						</span>
						<span className="flex items-center gap-1.5">
							<span className="w-3 h-3 rounded-sm" style={{ background: cor("pagar") }} /> A pagar
						</span>
					</div>
				</div>
				{temDados ? (
					<div className="h-56 sm:h-64 -ml-2">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={dados} barGap={2} barCategoryGap="22%">
								<CartesianGrid vertical={false} stroke={escuro ? "#1e293b" : "#eef2f6"} />
								<XAxis
									dataKey="rotulo"
									tickLine={false}
									axisLine={false}
									tick={({ x, y, payload, index }: any) => (
										<text
											x={x}
											y={y + 12}
											textAnchor="middle"
											fontSize={11}
											fontWeight={dados[index]?.ym === mesAtual ? 800 : 500}
											fill={dados[index]?.ym === mesAtual ? (escuro ? "#e2e8f0" : "#0f172a") : escuro ? "#94a3b8" : "#64748b"}>
											{payload.value}
										</text>
									)}
								/>
								<YAxis tickLine={false} axisLine={false} width={64} tickFormatter={moedaCurta} tick={{ fontSize: 10, fill: escuro ? "#94a3b8" : "#64748b" }} />
								<Tooltip content={<TooltipMes />} cursor={{ fill: escuro ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.04)" }} />
								<ReferenceLine x={dados.find((d) => d.ym === mesAtual)?.rotulo} stroke={escuro ? "#475569" : "#cbd5e1"} strokeDasharray="3 3" />
								<Bar dataKey="receber" name="A receber" fill={cor("receber")} radius={[4, 4, 0, 0]} maxBarSize={22} />
								<Bar dataKey="pagar" name="A pagar" fill={cor("pagar")} radius={[4, 4, 0, 0]} maxBarSize={22} />
							</BarChart>
						</ResponsiveContainer>
					</div>
				) : (
					<div className="flex-1 min-h-40 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 text-center px-6">
						Quando você dividir despesas, o histórico de cada mês aparece aqui.
					</div>
				)}
			</div>
		</div>
	);
}
