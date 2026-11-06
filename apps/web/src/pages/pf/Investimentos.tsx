import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../../../packages/services/supabase";
import { financeService } from "../../../../../packages/services/finance.service";
import { taxaAnualAtual } from "../../../../../packages/services/rendimento.service";
import { Plus, TrendingUp, Briefcase, PiggyBank, Coins, Trash2, Pencil, AlertTriangle, Target, Info } from "lucide-react";
import { toast } from "react-hot-toast";
import AddInvestimentoWeb from "../../components/AddInvestimentoWeb";
import PageLoader from "../../components/PageLoader";
import { descreverRentabilidade, instituicaoDoInvestimento, metaIdDoInvestimento } from "../../../../../packages/utils/investimentos";

const moeda = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number, casas = 2) => `${v >= 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const dataBR = (iso?: string | null) => {
	const [a, m, d] = String(iso || "").slice(0, 10).split("-");
	return a && m && d ? `${d}/${m}/${a}` : "";
};
const ehCaixinha = (inv: any) => Boolean(inv.conta_id) || /^caixinha\s+\S/i.test((inv.titulo || "").trim());
const RENDA_VARIAVEL = ["Ações", "FIIs", "Criptomoedas"];

export default function InvestimentosWeb() {
	const [investimentos, setInvestimentos] = useState<any[]>([]);
	const [metas, setMetas] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [isAddInvestimentoOpen, setIsAddInvestimentoOpen] = useState(false);
	const [investimentoEmEdicao, setInvestimentoEmEdicao] = useState<any | null>(null);
	// Taxa ao ano de hoje por investimento (ex.: 100% do CDI ≈ 13,6% a.a.)
	const [taxasAno, setTaxasAno] = useState<Record<string, number | null>>({});

	// O loader só aparece no primeiro carregamento (recargas em tempo real não piscam a tela)
	const loadInvestimentos = useCallback(async () => {
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
			try {
				const [data, { data: metasData }] = await Promise.all([
					financeService.getInvestimentos(user.id),
					supabase.from("metas").select("*").eq("usuario_id", user.id),
				]);
				setInvestimentos(data || []);
				setMetas(metasData || []);
			} catch {
				toast.error("Erro ao carregar investimentos");
			}
		}
		setLoading(false);
	}, []);

	const handleExcluir = async (inv: any) => {
		const aviso = ehCaixinha(inv)
			? `Apagar a "${inv.titulo}"?\n\nEla não será recriada pelas aplicações desta conta. O histórico de valores dela também será removido.`
			: `Excluir o investimento "${inv.titulo}"? O histórico de valores dele também será removido.`;
		if (!window.confirm(aviso)) return;
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) return;
			await financeService.deleteInvestimento(user.id, inv.id);
			toast.success("Investimento excluído.");
			loadInvestimentos();
		} catch (e: any) {
			toast.error(e?.message || "Erro ao excluir investimento.");
		}
	};

	// Caixinhas por banco + rendimento do dia (Banco Central); recarrega quando termina
	useEffect(() => {
		supabase.auth.getUser().then(({ data: { user } }) => {
			if (!user) return;
			financeService.syncMetasInvestimentos(user.id).then(() => loadInvestimentos()).catch(() => {});
		});
	}, [loadInvestimentos]);

	useEffect(() => {
		loadInvestimentos();
		let channel: any;
		async function setupRealtime() {
			const { data: { user } } = await supabase.auth.getUser();
			if (user) channel = financeService.subscribeToChanges("investimentos", user.id, loadInvestimentos);
		}
		setupRealtime();
		return () => {
			if (channel) supabase.removeChannel(channel);
		};
	}, [loadInvestimentos]);

	useEffect(() => {
		let ativo = true;
		Promise.all(
			investimentos.map(async (inv) => [inv.id, inv.indexador ? await taxaAnualAtual(inv.indexador, inv.taxa).catch(() => null) : null] as const),
		).then((pares) => ativo && setTaxasAno(Object.fromEntries(pares)));
		return () => {
			ativo = false;
		};
	}, [investimentos]);

	const resumo = useMemo(() => {
		const aplicado = investimentos.reduce((s, i) => s + Number(i.valor_investido || 0), 0);
		const atual = investimentos.reduce((s, i) => s + Number(i.valor_atual || 0), 0);
		const rendimento = atual - aplicado;
		// Quanto a carteira rende por dia hoje (só o que tem taxa informada)
		const porDia = investimentos.reduce((s, i) => {
			const a = taxasAno[i.id];
			return a ? s + Number(i.valor_atual || 0) * (Math.pow(1 + a / 100, 1 / 252) - 1) : s;
		}, 0);
		// Taxa média ponderada pelo saldo
		const comTaxa = investimentos.filter((i) => taxasAno[i.id]);
		const baseTaxa = comTaxa.reduce((s, i) => s + Number(i.valor_atual || 0), 0);
		const taxaMedia = baseTaxa > 0 ? comTaxa.reduce((s, i) => s + Number(i.valor_atual || 0) * (taxasAno[i.id] || 0), 0) / baseTaxa : null;
		const semTaxa = investimentos.filter((i) => !i.indexador && !RENDA_VARIAVEL.includes(i.tipo));
		return { aplicado, atual, rendimento, perc: aplicado > 0 ? (rendimento / aplicado) * 100 : 0, porDia, taxaMedia, semTaxa };
	}, [investimentos, taxasAno]);

	const alocacao = useMemo(() => {
		const porTipo = new Map<string, number>();
		for (const i of investimentos) porTipo.set(i.tipo || "Outros", (porTipo.get(i.tipo || "Outros") || 0) + Number(i.valor_atual || 0));
		const total = [...porTipo.values()].reduce((s, v) => s + v, 0);
		return [...porTipo.entries()].sort((a, b) => b[1] - a[1]).map(([tipo, valor]) => ({ tipo, valor, parte: total > 0 ? (valor / total) * 100 : 0 }));
	}, [investimentos]);

	const caixinhas = investimentos.filter(ehCaixinha);
	const outros = investimentos.filter((i) => !ehCaixinha(i));

	if (loading) return <PageLoader />;

	const Cartao = ({ inv }: { inv: any }) => {
		const aplicado = Number(inv.valor_investido || 0);
		const atual = Number(inv.valor_atual || 0);
		const rend = atual - aplicado;
		const rendPct = aplicado > 0 ? (rend / aplicado) * 100 : 0;
		const meta = metas.find((m) => m.id === metaIdDoInvestimento(inv.corretora));
		const banco = instituicaoDoInvestimento(inv.corretora);
		const taxaTexto = descreverRentabilidade(inv.indexador, inv.taxa);
		const anual = taxasAno[inv.id];
		const variavel = RENDA_VARIAVEL.includes(inv.tipo);
		return (
			<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5 flex flex-col gap-4">
				<div className="flex items-start justify-between gap-3">
					<div className="flex items-center gap-3 min-w-0">
						<div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 flex items-center justify-center shrink-0">
							{ehCaixinha(inv) ? <PiggyBank size={18} /> : <Coins size={18} />}
						</div>
						<div className="min-w-0">
							<p className="font-black text-slate-800 dark:text-slate-100 truncate">{inv.titulo}</p>
							<p className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">
								{[inv.tipo, banco].filter(Boolean).join(" · ")}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-1 shrink-0">
						<button
							onClick={() => setInvestimentoEmEdicao(inv)}
							title="Editar (rentabilidade, valor do banco, meta)"
							aria-label={`Editar ${inv.titulo}`}
							className="p-2 rounded-xl text-slate-400 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
						>
							<Pencil size={16} />
						</button>
						<button
							onClick={() => handleExcluir(inv)}
							title="Apagar"
							aria-label={`Apagar ${inv.titulo}`}
							className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
						>
							<Trash2 size={16} />
						</button>
					</div>
				</div>

				<div className="flex items-end justify-between gap-3">
					<div>
						<p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Saldo hoje</p>
						<p className="text-2xl font-black text-slate-800 dark:text-slate-100">{moeda(atual)}</p>
						<p className="text-xs font-semibold text-slate-500 dark:text-slate-400">aplicado {moeda(aplicado)}</p>
					</div>
					<div className="text-right">
						<p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Rendeu</p>
						<p className={`text-lg font-black ${rend >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
							{rend >= 0 ? "+" : "−"}
							{moeda(Math.abs(rend))}
						</p>
						<p className={`text-xs font-bold ${rend >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{pct(rendPct)}</p>
					</div>
				</div>

				{taxaTexto ? (
					<div className="flex flex-wrap items-center gap-2 text-xs">
						<span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-black">{taxaTexto}</span>
						{anual != null && <span className="font-semibold text-slate-500 dark:text-slate-400">≈ {anual.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% ao ano hoje</span>}
					</div>
				) : variavel ? (
					<p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Renda variável: atualize o saldo pelo valor da corretora.</p>
				) : (
					<button
						onClick={() => setInvestimentoEmEdicao(inv)}
						className="flex items-center gap-1.5 text-xs font-black text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-2 rounded-xl w-fit cursor-pointer"
					>
						<AlertTriangle size={13} /> Informe quanto rende (ex.: 100% do CDI) para calcular o rendimento
					</button>
				)}

				<div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
					<span className="flex items-center gap-1">
						{meta ? (
							<>
								<Target size={12} className="text-pink-500" /> Meta: {meta.titulo}
							</>
						) : (
							"Sem meta"
						)}
					</span>
					<span>
						{inv.indexador
							? inv.ajuste_data
								? `calculado desde o valor do banco em ${dataBR(inv.ajuste_data)}`
								: "calculado com as taxas do Banco Central"
							: ehCaixinha(inv)
								? "soma das aplicações e resgates da conta"
								: ""}
					</span>
				</div>
			</div>
		);
	};

	return (
		<div className="space-y-6 pb-20">
			{/* Cabeçalho */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<div className="bg-indigo-100 dark:bg-indigo-950/40 p-2.5 rounded-2xl text-indigo-600 dark:text-indigo-400">
						<Briefcase size={22} />
					</div>
					<div>
						<h1 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100">Investimentos</h1>
						<p className="text-sm font-medium text-slate-500 dark:text-slate-400">Caixinhas dos bancos e demais aplicações, com o rendimento de verdade</p>
					</div>
				</div>
				<button
					onClick={() => setIsAddInvestimentoOpen(true)}
					className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 cursor-pointer"
				>
					<Plus size={18} /> Novo investimento
				</button>
			</div>

			{/* Resumo */}
			<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5 sm:p-7 grid grid-cols-1 md:grid-cols-3 gap-6">
				<div className="md:col-span-1">
					<p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Você tem investido</p>
					<p className="text-3xl sm:text-4xl font-black text-slate-800 dark:text-slate-100 mt-1">{moeda(resumo.atual)}</p>
					<p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-1">aplicado {moeda(resumo.aplicado)}</p>
				</div>
				<div className="grid grid-cols-2 md:col-span-2 gap-4">
					<div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 p-4">
						<p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
							<TrendingUp size={13} /> Rendeu até hoje
						</p>
						<p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
							{resumo.rendimento >= 0 ? "+" : "−"}
							{moeda(Math.abs(resumo.rendimento))}
						</p>
						<p className="text-xs font-bold text-emerald-700/80 dark:text-emerald-300/80">{pct(resumo.perc)} sobre o aplicado</p>
					</div>
					<div className="rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 p-4">
						<p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">Rendendo agora</p>
						<p className="text-xl font-black text-indigo-700 dark:text-indigo-300 mt-1">
							{resumo.porDia > 0 ? `≈ ${moeda(resumo.porDia)} por dia útil` : "—"}
						</p>
						<p className="text-xs font-bold text-indigo-700/80 dark:text-indigo-300/80">
							{resumo.taxaMedia != null
								? `média de ${resumo.taxaMedia.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% ao ano`
								: "informe a rentabilidade para ver"}
						</p>
					</div>
				</div>
			</div>

			{resumo.semTaxa.length > 0 && (
				<div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4 text-sm text-amber-800 dark:text-amber-200">
					<Info size={16} className="shrink-0 mt-0.5" />
					<p>
						<b>{resumo.semTaxa.length}</b> {resumo.semTaxa.length === 1 ? "investimento está" : "investimentos estão"} sem rentabilidade informada (
						{resumo.semTaxa.map((i) => i.titulo).join(", ")}). Clique em <b>"Informe quanto rende"</b> e o app calcula o rendimento com o CDI/Selic de
						cada dia. Se o valor não bater com o banco, edite e coloque o saldo que o banco mostra.
					</p>
				</div>
			)}

			{/* Onde está o dinheiro */}
			{alocacao.length > 1 && (
				<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5 sm:p-6">
					<p className="text-sm font-black text-slate-800 dark:text-slate-100 mb-4">Onde está o dinheiro</p>
					<div className="space-y-3">
						{alocacao.map((a) => (
							<div key={a.tipo}>
								<div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
									<span>{a.tipo}</span>
									<span>
										{moeda(a.valor)} · {a.parte.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
									</span>
								</div>
								<div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
									<div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(2, a.parte)}%` }} />
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{investimentos.length === 0 ? (
				<div className="bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 p-10 text-center">
					<PiggyBank size={36} className="mx-auto text-slate-300 dark:text-slate-600" />
					<p className="mt-3 font-black text-slate-700 dark:text-slate-200">Nenhum investimento ainda</p>
					<p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
						Ao importar um extrato com aplicações (caixinha, porquinho, CDB...), a caixinha do banco aparece aqui sozinha.
					</p>
				</div>
			) : (
				<>
					{caixinhas.length > 0 && (
						<section className="space-y-3">
							<h2 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Caixinhas dos bancos</h2>
							<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
								{caixinhas.map((inv) => (
									<Cartao key={inv.id} inv={inv} />
								))}
							</div>
						</section>
					)}
					{outros.length > 0 && (
						<section className="space-y-3">
							<h2 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Outros investimentos</h2>
							<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
								{outros.map((inv) => (
									<Cartao key={inv.id} inv={inv} />
								))}
							</div>
						</section>
					)}
				</>
			)}

			<p className="text-[11px] text-slate-400 dark:text-slate-500">
				Rendimento bruto (antes de IR/IOF), calculado com o CDI/Selic de cada dia útil divulgado pelo Banco Central, a partir do dia seguinte a cada
				aplicação. Pequenas diferenças para o banco são normais; para acertar, edite e informe o saldo que o banco mostra.
			</p>

			{(isAddInvestimentoOpen || investimentoEmEdicao) && (
				<AddInvestimentoWeb
					investimento={investimentoEmEdicao}
					onClose={() => {
						setIsAddInvestimentoOpen(false);
						setInvestimentoEmEdicao(null);
					}}
					onSuccess={loadInvestimentos}
				/>
			)}
		</div>
	);
}
