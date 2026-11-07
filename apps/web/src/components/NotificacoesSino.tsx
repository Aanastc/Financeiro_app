import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CalendarClock, CheckCheck, CreditCard, HandCoins, Landmark, UserCheck, Users, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { notificacoesService, type Notificacao } from "../../../../packages/services/notificacoes.service";

const ICONES: Record<string, { icone: typeof Bell; cor: string }> = {
	convite_aceito: { icone: UserCheck, cor: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40" },
	divisao_nova: { icone: Users, cor: "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40" },
	cobranca_aceita: { icone: CheckCheck, cor: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40" },
	cobranca_recusada: { icone: XCircle, cor: "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/40" },
	pagamento_informado: { icone: HandCoins, cor: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40" },
	pagamento_confirmado: { icone: CheckCheck, cor: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40" },
	pagamento_nao_recebido: { icone: XCircle, cor: "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/40" },
	pagamento_recebido: { icone: HandCoins, cor: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40" },
	vencimento_fatura: { icone: CreditCard, cor: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40" },
	vencimento_divida: { icone: Landmark, cor: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40" },
	vencimento_receber: { icone: CalendarClock, cor: "text-sky-600 bg-sky-50 dark:text-sky-400 dark:bg-sky-950/40" },
	vencimento_pagar: { icone: CalendarClock, cor: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40" },
};

const tempo = (isoData: string) => {
	const d = new Date(isoData);
	const min = Math.round((Date.now() - d.getTime()) / 60000);
	if (min < 1) return "agora";
	if (min < 60) return `há ${min} min`;
	const h = Math.round(min / 60);
	if (h < 24) return `há ${h} h`;
	const dias = Math.round(h / 24);
	return dias < 7 ? `há ${dias} d` : d.toLocaleDateString("pt-BR");
};

/** Sino do topo: avisos (convites, divisões, pagamentos) + lembretes de vencimento. */
export default function NotificacoesSino({ usuarioId }: { usuarioId?: string | null }) {
	const navigate = useNavigate();
	const [aberto, setAberto] = useState(false);
	const [avisos, setAvisos] = useState<Notificacao[]>([]);
	const [lembretes, setLembretes] = useState<Notificacao[]>([]);
	const painelRef = useRef<HTMLDivElement>(null);

	const carregar = useCallback(async () => {
		if (!usuarioId) return;
		const [a, l] = await Promise.all([
			notificacoesService.listar(usuarioId),
			notificacoesService.lembretes(usuarioId).catch(() => [] as Notificacao[]),
		]);
		setAvisos(a);
		setLembretes(l);
	}, [usuarioId]);

	useEffect(() => {
		if (!usuarioId) return;
		carregar();
		const parar = notificacoesService.ouvir(usuarioId, (n) => {
			setAvisos((prev) => [n, ...prev.filter((x) => x.id !== n.id)]);
			toast(n.titulo, { icon: "🔔" });
		});
		const intervalo = window.setInterval(carregar, 5 * 60_000);
		const aoFocar = () => carregar();
		window.addEventListener("focus", aoFocar);
		return () => {
			parar();
			window.clearInterval(intervalo);
			window.removeEventListener("focus", aoFocar);
		};
	}, [usuarioId, carregar]);

	// Fecha com Esc
	useEffect(() => {
		if (!aberto) return;
		const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
		window.addEventListener("keydown", tecla);
		return () => window.removeEventListener("keydown", tecla);
	}, [aberto]);

	const naoLidas = useMemo(() => [...lembretes, ...avisos].filter((n) => !n.lida).length, [avisos, lembretes]);

	const marcar = async (itens: Notificacao[]) => {
		if (!usuarioId || itens.length === 0) return;
		const ids = new Set(itens.map((i) => i.id));
		setAvisos((prev) => prev.map((n) => (ids.has(n.id) ? { ...n, lida: true } : n)));
		setLembretes((prev) => prev.map((n) => (ids.has(n.id) ? { ...n, lida: true } : n)));
		await notificacoesService.marcarLidas(usuarioId, itens);
	};

	const abrir = (n: Notificacao) => {
		marcar([n]);
		setAberto(false);
		if (n.link) navigate(n.link);
	};

	const item = (n: Notificacao) => {
		const conf = ICONES[n.tipo] || { icone: Bell, cor: "text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800" };
		const Icone = conf.icone;
		return (
			<li key={n.id}>
				<button
					onClick={() => abrir(n)}
					className={`w-full text-left flex gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer ${n.lida ? "" : "bg-indigo-50/40 dark:bg-indigo-950/20"}`}>
					<span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${conf.cor}`}>
						<Icone size={17} />
					</span>
					<span className="min-w-0 flex-1">
						<span className={`block text-[13px] leading-snug ${n.lida ? "font-semibold text-slate-600 dark:text-slate-300" : "font-black text-slate-800 dark:text-slate-100"}`}>
							{n.titulo}
						</span>
						{n.mensagem && <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.mensagem}</span>}
						{!n.lembrete && <span className="block text-[11px] text-slate-400 dark:text-slate-500 mt-1">{tempo(n.criado_em)}</span>}
					</span>
					{!n.lida && <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" aria-label="não lida" />}
				</button>
			</li>
		);
	};

	const vencidos = lembretes.filter((l) => l.urgente);
	const proximos = lembretes.filter((l) => !l.urgente);

	return (
		<div className="relative" ref={painelRef}>
			<button
				onClick={() => {
					setAberto((v) => !v);
					if (!aberto) carregar();
				}}
				className="relative p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-all outline-none cursor-pointer"
				title="Notificações"
				aria-label={naoLidas ? `Notificações: ${naoLidas} não lidas` : "Notificações"}
				aria-expanded={aberto}>
				<Bell size={18} />
				{naoLidas > 0 && (
					<span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
						{naoLidas > 9 ? "9+" : naoLidas}
					</span>
				)}
			</button>

			{aberto && (
				<>
					<div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
					<div className="fixed sm:absolute inset-x-2 sm:inset-x-auto top-16 sm:top-auto sm:right-0 sm:mt-2 sm:w-[380px] max-h-[75vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-40 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
						<div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
							<p className="font-black text-sm text-slate-800 dark:text-slate-100">Notificações</p>
							{naoLidas > 0 && (
								<button
									onClick={() => marcar([...lembretes, ...avisos].filter((n) => !n.lida))}
									className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer">
									Marcar tudo como lido
								</button>
							)}
						</div>

						<div className="overflow-y-auto custom-scrollbar">
							{lembretes.length === 0 && avisos.length === 0 && (
								<div className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
									<Bell size={28} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
									Nada por aqui. Avisos de convites, pagamentos e vencimentos aparecem neste sino.
								</div>
							)}

							{vencidos.length > 0 && (
								<>
									<p className="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">Vencido / vence hoje</p>
									<ul>{vencidos.map(item)}</ul>
								</>
							)}
							{avisos.length > 0 && (
								<>
									<p className="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Avisos de pessoas</p>
									<ul>{avisos.map(item)}</ul>
								</>
							)}
							{proximos.length > 0 && (
								<>
									<p className="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Próximos dias</p>
									<ul className="pb-2">{proximos.map(item)}</ul>
								</>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
