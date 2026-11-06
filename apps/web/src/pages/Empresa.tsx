import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Calculator, FileSpreadsheet, Info, Landmark, Pencil, Receipt, TrendingUp, Wallet } from "lucide-react";
import { toast } from "react-hot-toast";
import ExcelJS from "exceljs";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import {
	dasMeiSugerido,
	definirContasDaEmpresa,
	minhasEmpresas,
	painelEmpresa,
	salvarEmpresa,
	classificarComoRetirada,
	NOME_RETIRADA,
	type Empresa,
	type PainelEmpresa,
	type TipoRetirada,
} from "../../../../packages/services/empresa.service";
import { CORES, FMT_MOEDA, FONTE, cabecalho, linha, titulo } from "../lib/relatorioExcel";
import PageLoader from "../components/PageLoader";
import InputMoeda, { lerMoeda } from "../components/InputMoeda";

const moeda = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const dataBR = (iso?: string | null) => {
	const [a, m, d] = String(iso || "").slice(0, 10).split("-");
	return a && m && d ? `${d}/${m}/${a}` : "";
};
const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nomeMes = (ym: string) => `${NOMES_MES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const paraMoedaTexto = (v: any) => (v === null || v === undefined || v === "" ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

type Form = {
	nome: string;
	cnpj: string;
	regime: Empresa["regime"];
	anexo: NonNullable<Empresa["anexo"]>;
	atividade: NonNullable<Empresa["atividade"]>;
	das_mei_valor: string;
	iss_aliquota: string;
	rbt12_manual: string;
	retirada_padrao: TipoRetirada;
	pro_labore_valor: string;
	inicio_atividade: string;
	contas: string[];
};

export default function EmpresaPage() {
	const [loading, setLoading] = useState(true);
	const [userId, setUserId] = useState<string | null>(null);
	const [empresa, setEmpresa] = useState<Empresa | null>(null);
	const [contas, setContas] = useState<any[]>([]);
	const [painel, setPainel] = useState<PainelEmpresa | null>(null);
	const [ano, setAno] = useState(new Date().getFullYear());
	const [editando, setEditando] = useState(false);
	const [salvando, setSalvando] = useState(false);
	const [form, setForm] = useState<Form | null>(null);

	const carregar = useCallback(async () => {
		const { data: { user } } = await supabase.auth.getUser();
		if (!user) return;
		setUserId(user.id);
		const [emps, cs] = await Promise.all([minhasEmpresas(user.id), financeService.getContasBancarias(user.id)]);
		setContas(cs || []);
		const emp = emps[0] || null;
		setEmpresa(emp);
		if (emp) setPainel(await painelEmpresa(user.id, emp, ano).catch(() => null));
		setLoading(false);
	}, [ano]);

	useEffect(() => {
		carregar();
	}, [carregar]);

	const abrirForm = () => {
		setForm({
			nome: empresa?.nome || "",
			cnpj: empresa?.cnpj || "",
			regime: empresa?.regime || "SIMPLES",
			anexo: (empresa?.anexo || "FATOR_R") as any,
			atividade: (empresa?.atividade || "SERVICOS") as any,
			das_mei_valor: paraMoedaTexto(empresa?.das_mei_valor),
			iss_aliquota: String(empresa?.iss_aliquota ?? 5),
			rbt12_manual: paraMoedaTexto(empresa?.rbt12_manual),
			retirada_padrao: empresa?.retirada_padrao || "PRO_LABORE",
			pro_labore_valor: paraMoedaTexto(empresa?.pro_labore_valor),
			inicio_atividade: empresa?.inicio_atividade || "",
			contas: contas.filter((c) => c.empresa_id && c.empresa_id === empresa?.id).map((c) => c.id),
		});
		setEditando(true);
	};

	const salvar = async () => {
		if (!userId || !form) return;
		if (!form.nome.trim()) return toast.error("Informe o nome da empresa.");
		if (form.contas.length === 0) return toast.error("Escolha pelo menos uma conta da empresa.");
		setSalvando(true);
		try {
			const salva = await salvarEmpresa(userId, {
				id: empresa?.id,
				nome: form.nome.trim(),
				cnpj: form.cnpj.replace(/\D/g, "") || null,
				regime: form.regime,
				anexo: form.regime === "SIMPLES" ? form.anexo : null,
				atividade: form.regime === "MEI" ? form.atividade : null,
				das_mei_valor: form.regime === "MEI" && form.das_mei_valor ? lerMoeda(form.das_mei_valor) : null,
				iss_aliquota: form.regime === "PRESUMIDO" ? Number(form.iss_aliquota.replace(",", ".")) || 5 : null,
				rbt12_manual: form.regime === "SIMPLES" && form.rbt12_manual ? lerMoeda(form.rbt12_manual) : null,
				retirada_padrao: form.retirada_padrao,
				pro_labore_valor: form.pro_labore_valor ? lerMoeda(form.pro_labore_valor) : null,
				inicio_atividade: form.inicio_atividade || null,
			});
			await definirContasDaEmpresa(userId, salva.id, form.contas);
			toast.success("Empresa salva.");
			setEditando(false);
			setLoading(true);
			await carregar();
		} catch (e: any) {
			toast.error(e?.message || "Não foi possível salvar.");
		} finally {
			setSalvando(false);
		}
	};

	const contasEmpresa = useMemo(() => contas.filter((c) => empresa && c.empresa_id === empresa.id), [contas, empresa]);
	const saldoEmpresa = contasEmpresa.reduce((s, c) => s + Number(c.saldo_reais ?? c.saldo_atual ?? 0), 0);

	const resumo = useMemo(() => {
		if (!painel || !empresa) return null;
		const atual = painel.meses[painel.meses.length - 1];
		const anterior = painel.meses[painel.meses.length - 2];
		const despesaMedia = painel.meses.length ? painel.meses.slice(-3).reduce((s, m) => s + m.despesas, 0) / Math.min(3, painel.meses.length) : 0;
		// Imposto que ainda vai sair: o do mês atual e o do mês anterior (vence dia 20)
		const hoje = new Date();
		const impostoAnteriorAberto = anterior && hoje.getDate() <= 20 ? anterior.imposto.valor : 0;
		const reservar = (atual?.imposto.valor || 0) + impostoAnteriorAberto + despesaMedia;
		const proLaboreAno = painel.meses.reduce((s, m) => s + m.proLabore, 0);
		const lucrosAno = painel.meses.reduce((s, m) => s + m.lucrosDistribuidos, 0);
		const lucroAno = painel.meses.reduce((s, m) => s + m.lucro, 0);
		// Fator R: quanto de pró-labore por mês para chegar a 28% (Anexo III em vez do V)
		const faltaFatorR =
			empresa.regime === "SIMPLES" && (empresa.anexo || "FATOR_R") === "FATOR_R" && painel.fatorR !== null && painel.fatorR < 0.28 && painel.rbt12 > 0
				? Math.max(0, (0.28 * painel.rbt12 - painel.fatorR * painel.rbt12) / 12)
				: 0;
		return { atual, anterior, reservar, disponivel: Math.max(0, saldoEmpresa - reservar), proLaboreAno, lucrosAno, lucroAno, faltaFatorR, despesaMedia };
	}, [painel, empresa, saldoEmpresa]);

	const classificar = async (item: PainelEmpresa["aClassificar"][number], tipo: TipoRetirada) => {
		if (!userId) return;
		try {
			await classificarComoRetirada(userId, item.transacao_id, tipo, item.conta_pessoal_id, item.conta_id);
			toast.success(`Marcado como ${NOME_RETIRADA[tipo].toLowerCase()}.`);
			await carregar();
		} catch (e: any) {
			toast.error(e?.message || "Não foi possível classificar.");
		}
	};

	const exportarContador = async () => {
		if (!painel || !empresa) return;
		const wb = new ExcelJS.Workbook();
		wb.creator = "Tech Finance";
		const res = wb.addWorksheet("Resumo");
		res.columns = [{ width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
		titulo(res, `${empresa.nome} — ${ano}`, 7, `${empresa.cnpj ? `CNPJ ${empresa.cnpj} · ` : ""}${empresa.regime === "MEI" ? "MEI" : empresa.regime === "SIMPLES" ? "Simples Nacional" : "Lucro Presumido"} · gerado em ${new Date().toLocaleString("pt-BR")}`);
		cabecalho(res, ["Mês", "Faturamento", "Despesas", "Impostos pagos", "Imposto estimado", "Pró-labore", "Lucros distribuídos"]);
		for (const m of painel.meses) {
			linha(res, [nomeMes(m.mes), m.faturamento, m.despesas, m.impostosPagos, m.imposto.valor, m.proLabore, m.lucrosDistribuidos], { 2: FMT_MOEDA, 3: FMT_MOEDA, 4: FMT_MOEDA, 5: FMT_MOEDA, 6: FMT_MOEDA, 7: FMT_MOEDA });
		}
		const soma = (k: keyof (typeof painel.meses)[number]) => painel.meses.reduce((s, m) => s + Number((m as any)[k] || 0), 0);
		linha(res, ["TOTAL", soma("faturamento"), soma("despesas"), soma("impostosPagos"), painel.meses.reduce((s, m) => s + m.imposto.valor, 0), soma("proLabore"), soma("lucrosDistribuidos")], { 2: FMT_MOEDA, 3: FMT_MOEDA, 4: FMT_MOEDA, 5: FMT_MOEDA, 6: FMT_MOEDA, 7: FMT_MOEDA }, { negrito: true, fundo: CORES.resultado.fundo });
		res.addRow([]);
		const n = res.addRow(["Imposto estimado = cálculo do app para planejamento. O valor oficial é o apurado no PGDAS/pelo contador."]);
		n.getCell(1).font = { name: FONTE, size: 9, italic: true, color: { argb: "78909C" } };

		const aba = (nome: string, linhas: { data: string; descricao: string; categoria?: string | null; valor: number; extra?: string }[], extraTitulo?: string) => {
			const ws = wb.addWorksheet(nome);
			ws.columns = [{ width: 13 }, { width: 50 }, { width: 22 }, { width: 16 }, ...(extraTitulo ? [{ width: 22 }] : [])];
			titulo(ws, `${nome} — ${ano}`, extraTitulo ? 5 : 4);
			cabecalho(ws, ["Data", "Descrição", "Categoria", "Valor", ...(extraTitulo ? [extraTitulo] : [])]);
			for (const l of [...linhas].filter((x) => x.data.startsWith(String(ano))).sort((a, b) => a.data.localeCompare(b.data))) {
				linha(ws, [dataBR(l.data), l.descricao, l.categoria || "", l.valor, ...(extraTitulo ? [l.extra || ""] : [])], { 4: FMT_MOEDA });
			}
		};
		aba("Receitas", painel.receitas);
		aba("Despesas", painel.despesas);
		aba("Retiradas", painel.retiradas.map((r) => ({ ...r, extra: NOME_RETIRADA[r.tipo] })), "Tipo");

		const { saveAs } = await import("file-saver");
		const buffer = await wb.xlsx.writeBuffer();
		const slug = empresa.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "_").toLowerCase();
		saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `empresa_${slug}_${ano}.xlsx`);
	};

	if (loading) return <PageLoader />;

	// ------------------------------------------------------------------ formulário
	if (editando && form) {
		const campo = "w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500";
		const rotulo = "text-xs font-bold text-slate-500 dark:text-slate-400";
		return (
			<div className="max-w-3xl space-y-6 pb-20">
				<div>
					<h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">{empresa ? "Editar empresa" : "Cadastrar empresa"}</h1>
					<p className="text-sm text-slate-500 dark:text-slate-400">As contas da empresa saem das suas finanças pessoais e passam a aparecer aqui.</p>
				</div>
				<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
					<label className="space-y-1 sm:col-span-2">
						<span className={rotulo}>Nome da empresa</span>
						<input className={campo} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Ana Letícia Tech LTDA" />
					</label>
					<label className="space-y-1">
						<span className={rotulo}>CNPJ (opcional)</span>
						<input className={campo} value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
					</label>
					<label className="space-y-1">
						<span className={rotulo}>Início da atividade (opcional)</span>
						<input type="date" className={campo} value={form.inicio_atividade} onChange={(e) => setForm({ ...form, inicio_atividade: e.target.value })} />
					</label>
					<label className="space-y-1 sm:col-span-2">
						<span className={rotulo}>Regime</span>
						<div className="grid grid-cols-3 gap-2">
							{(["MEI", "SIMPLES", "PRESUMIDO"] as const).map((r) => (
								<button
									key={r}
									type="button"
									onClick={() => setForm({ ...form, regime: r })}
									className={`py-2.5 rounded-xl text-sm font-black border cursor-pointer ${form.regime === r ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"}`}
								>
									{r === "MEI" ? "MEI" : r === "SIMPLES" ? "Simples Nacional" : "Lucro Presumido"}
								</button>
							))}
						</div>
					</label>

					{form.regime === "MEI" && (
						<>
							<label className="space-y-1">
								<span className={rotulo}>Atividade</span>
								<select className={campo} value={form.atividade} onChange={(e) => setForm({ ...form, atividade: e.target.value as any })}>
									<option value="SERVICOS">Serviços</option>
									<option value="COMERCIO">Comércio</option>
									<option value="INDUSTRIA">Indústria</option>
									<option value="COMERCIO_SERVICOS">Comércio e serviços</option>
								</select>
							</label>
							<label className="space-y-1">
								<span className={rotulo}>Valor do DAS (boleto do mês)</span>
								<InputMoeda className={campo} value={form.das_mei_valor} onChange={(v) => setForm({ ...form, das_mei_valor: v })} placeholder={paraMoedaTexto(dasMeiSugerido(form.atividade))} />
							</label>
						</>
					)}

					{form.regime === "SIMPLES" && (
						<>
							<label className="space-y-1">
								<span className={rotulo}>Anexo</span>
								<select className={campo} value={form.anexo} onChange={(e) => setForm({ ...form, anexo: e.target.value as any })}>
									<option value="FATOR_R">Fator R (III ou V — serviços como TI, consultoria)</option>
									<option value="III">Anexo III (serviços)</option>
									<option value="V">Anexo V (serviços)</option>
									<option value="I">Anexo I (comércio)</option>
									<option value="II">Anexo II (indústria)</option>
									<option value="IV">Anexo IV (construção, limpeza, advocacia)</option>
								</select>
							</label>
							<label className="space-y-1">
								<span className={rotulo}>Faturamento dos últimos 12 meses antes do app (opcional)</span>
								<InputMoeda className={campo} value={form.rbt12_manual} onChange={(v) => setForm({ ...form, rbt12_manual: v })} placeholder="0,00" />
							</label>
						</>
					)}

					{form.regime === "PRESUMIDO" && (
						<label className="space-y-1">
							<span className={rotulo}>ISS do seu município (%)</span>
							<input className={campo} value={form.iss_aliquota} onChange={(e) => setForm({ ...form, iss_aliquota: e.target.value })} placeholder="5" />
						</label>
					)}

					<label className="space-y-1">
						<span className={rotulo}>Pix da empresa para você é, por padrão</span>
						<select className={campo} value={form.retirada_padrao} onChange={(e) => setForm({ ...form, retirada_padrao: e.target.value as TipoRetirada })}>
							<option value="PRO_LABORE">Pró-labore</option>
							<option value="LUCROS">Distribuição de lucros</option>
						</select>
					</label>
					<label className="space-y-1">
						<span className={rotulo}>Pró-labore mensal combinado (opcional)</span>
						<InputMoeda className={campo} value={form.pro_labore_valor} onChange={(v) => setForm({ ...form, pro_labore_valor: v })} placeholder="0,00" />
					</label>

					<div className="space-y-2 sm:col-span-2">
						<span className={rotulo}>Contas da empresa</span>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
							{contas.map((c) => (
								<label key={c.id} className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
									<input
										type="checkbox"
										className="w-4 h-4 accent-indigo-600"
										checked={form.contas.includes(c.id)}
										onChange={(e) => setForm({ ...form, contas: e.target.checked ? [...form.contas, c.id] : form.contas.filter((x) => x !== c.id) })}
									/>
									<span className="text-sm font-bold text-slate-700 dark:text-slate-200">{c.nome}</span>
									<span className="ml-auto text-xs text-slate-400">{c.instituicao || ""}</span>
								</label>
							))}
						</div>
						<p className="text-[11px] text-slate-400">Não achou a conta do CNPJ? Cadastre em Contas (ex.: "Inter PJ") e volte aqui.</p>
					</div>
				</div>
				<div className="flex gap-2">
					<button onClick={salvar} disabled={salvando} className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-sm cursor-pointer">
						{salvando ? "Salvando..." : "Salvar"}
					</button>
					{empresa && (
						<button onClick={() => setEditando(false)} className="px-5 py-3 rounded-2xl text-slate-500 font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
							Cancelar
						</button>
					)}
				</div>
			</div>
		);
	}

	// ------------------------------------------------------------------ sem empresa
	if (!empresa) {
		return (
			<div className="max-w-2xl space-y-6 pb-20">
				<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-8 text-center space-y-4">
					<Building2 size={40} className="mx-auto text-indigo-500" />
					<h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">Sua empresa (CNPJ)</h1>
					<p className="text-sm text-slate-500 dark:text-slate-400">
						Separe as contas da empresa das pessoais e acompanhe faturamento, impostos (MEI, Simples ou Presumido), pró-labore, lucro e o relatório
						para o contador.
					</p>
					<button onClick={abrirForm} className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm cursor-pointer">
						Cadastrar empresa
					</button>
				</div>
			</div>
		);
	}

	// ------------------------------------------------------------------ painel
	const regimeNome = empresa.regime === "MEI" ? "MEI" : empresa.regime === "SIMPLES" ? "Simples Nacional" : "Lucro Presumido";
	const usoLimite = painel && painel.limite.valor > 0 ? (painel.limite.usado / painel.limite.valor) * 100 : 0;
	return (
		<div className="space-y-6 pb-20">
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<div className="bg-indigo-100 dark:bg-indigo-950/40 p-2.5 rounded-2xl text-indigo-600 dark:text-indigo-400">
						<Building2 size={22} />
					</div>
					<div>
						<h1 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100">{empresa.nome}</h1>
						<p className="text-sm font-medium text-slate-500 dark:text-slate-400">
							{regimeNome}
							{painel?.anexoEfetivo ? ` · Anexo ${painel.anexoEfetivo}` : ""} · {contasEmpresa.map((c) => c.nome).join(", ") || "sem contas"}
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<select value={ano} onChange={(e) => { setLoading(true); setAno(Number(e.target.value)); }} className="px-3 py-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-bold">
						{[0, 1, 2].map((i) => new Date().getFullYear() - i).map((a) => <option key={a} value={a}>{a}</option>)}
					</select>
					<button onClick={exportarContador} className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center gap-2 cursor-pointer">
						<FileSpreadsheet size={16} /> Relatório p/ contador
					</button>
					<button onClick={abrirForm} className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm flex items-center gap-2 cursor-pointer">
						<Pencil size={15} /> Configurar
					</button>
				</div>
			</div>

			{painel && resumo && (
				<>
					<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
						<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5">
							<p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><TrendingUp size={13} /> Faturamento {ano}</p>
							<p className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">{moeda(painel.faturamentoAno)}</p>
							<div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
								<div className={`h-full rounded-full ${usoLimite > 90 ? "bg-rose-500" : usoLimite > 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, usoLimite)}%` }} />
							</div>
							<p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
								{pct(usoLimite)} do {painel.limite.nome.toLowerCase()} ({moeda(painel.limite.valor)})
							</p>
						</div>
						<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5">
							<p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Receipt size={13} /> Imposto deste mês</p>
							<p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{moeda(resumo.atual?.imposto.valor || 0)}</p>
							<p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
								{empresa.regime === "MEI" ? "DAS" : `${pct(resumo.atual?.imposto.aliquota || 0)} efetivo`} · vence {dataBR(resumo.atual?.imposto.vencimento)}
							</p>
							<p className="text-[11px] text-slate-400">{resumo.atual?.imposto.detalhe}</p>
						</div>
						<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5">
							<p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Calculator size={13} /> Lucro no ano</p>
							<p className={`text-2xl font-black mt-1 ${resumo.lucroAno >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{moeda(resumo.lucroAno)}</p>
							<p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">faturamento − despesas − imposto estimado</p>
						</div>
						<div className="bg-indigo-600 rounded-3xl p-5 text-white">
							<p className="text-xs font-bold text-indigo-200 uppercase tracking-wider flex items-center gap-1"><Wallet size={13} /> Dá para retirar agora</p>
							<p className="text-2xl font-black mt-1">≈ {moeda(resumo.disponivel)}</p>
							<p className="text-[11px] font-semibold text-indigo-100 mt-1">
								saldo {moeda(saldoEmpresa)} − impostos a pagar e 1 mês de despesas ({moeda(resumo.reservar)})
							</p>
							{painel.investimentos.length > 0 && (
								<p className="text-[11px] font-semibold text-indigo-100 mt-1">
									+ {moeda(painel.investimentos.reduce((s, i) => s + i.valor, 0))} guardado pela empresa ({painel.investimentos.map((i) => i.titulo).join(", ")})
								</p>
							)}
						</div>
					</div>

					{/* Educação: o que fazer */}
					<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5 sm:p-6 space-y-3">
						<p className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2"><Info size={16} className="text-indigo-500" /> O que olhar este mês</p>
						<ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300 list-disc pl-5">
							{resumo.atual && resumo.atual.imposto.valor > 0 && (
								<li>Guarde <b>{moeda(resumo.atual.imposto.valor)}</b> para o {empresa.regime === "PRESUMIDO" ? "imposto" : "DAS"} que vence em <b>{dataBR(resumo.atual.imposto.vencimento)}</b>.</li>
							)}
							{resumo.faltaFatorR > 0 && (
								<li>
									Seu fator R está em <b>{pct((painel.fatorR || 0) * 100)}</b> (abaixo de 28%), então o imposto é calculado no <b>Anexo V</b>. Com cerca de{" "}
									<b>{moeda(resumo.faltaFatorR)}</b> a mais de pró-labore por mês, ele vai para o <b>Anexo III</b>, que costuma sair mais barato. Confirme com o contador.
								</li>
							)}
							<li>Pró-labore tem INSS (11%) e entra no seu imposto de renda; distribuição de lucros é isenta de IR, desde que a empresa tenha lucro apurado.</li>
							{usoLimite > 80 && <li className="text-rose-600 dark:text-rose-400">Você já usou {pct(usoLimite)} do {painel.limite.nome.toLowerCase()}. Converse com o contador antes de passar.</li>}
							{empresa.regime === "MEI" && <li>O DAS do MEI é fixo, faturando ou não. Em maio entregue a declaração anual (DASN-SIMEI).</li>}
						</ul>
					</div>

					{painel.aClassificar.length > 0 && (
						<div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-3xl p-5 space-y-3">
							<p className="text-sm font-black text-amber-800 dark:text-amber-200">Pix da empresa para você: é pró-labore ou lucro?</p>
							{painel.aClassificar.map((r) => (
								<div key={r.transacao_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
									<span className="text-slate-700 dark:text-slate-200">
										{dataBR(r.data)} · <b>{moeda(r.valor)}</b> · {r.descricao}
									</span>
									<div className="flex gap-2">
										<button onClick={() => classificar(r, "PRO_LABORE")} className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 text-xs font-black cursor-pointer">Pró-labore</button>
										<button onClick={() => classificar(r, "LUCROS")} className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 text-xs font-black cursor-pointer">Lucros</button>
									</div>
								</div>
							))}
						</div>
					)}

					<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden">
						<div className="p-5 flex items-center gap-2">
							<Landmark size={16} className="text-indigo-500" />
							<p className="text-sm font-black text-slate-800 dark:text-slate-100">Mês a mês</p>
						</div>
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="text-[11px] font-black uppercase text-slate-400 text-right">
										<th className="px-4 py-2 text-left">Mês</th>
										<th className="px-4 py-2">Faturamento</th>
										<th className="px-4 py-2">Despesas</th>
										<th className="px-4 py-2">Imposto estimado</th>
										<th className="px-4 py-2">Pró-labore</th>
										<th className="px-4 py-2">Lucros</th>
										<th className="px-4 py-2">Lucro</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100 dark:divide-slate-800">
									{[...painel.meses].reverse().map((m) => (
										<tr key={m.mes} className="text-right text-slate-700 dark:text-slate-200">
											<td className="px-4 py-2.5 text-left font-bold">{nomeMes(m.mes)}</td>
											<td className="px-4 py-2.5 font-semibold">{moeda(m.faturamento)}</td>
											<td className="px-4 py-2.5">{moeda(m.despesas)}</td>
											<td className="px-4 py-2.5 text-amber-600 dark:text-amber-400" title={m.imposto.detalhe}>{moeda(m.imposto.valor)}</td>
											<td className="px-4 py-2.5">{moeda(m.proLabore)}</td>
											<td className="px-4 py-2.5">{moeda(m.lucrosDistribuidos)}</td>
											<td className={`px-4 py-2.5 font-black ${m.lucro >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{moeda(m.lucro)}</td>
										</tr>
									))}
									{painel.meses.length === 0 && (
										<tr>
											<td colSpan={7} className="px-4 py-8 text-center text-slate-400">
												Nada lançado nas contas da empresa em {ano}. Importe o extrato da conta PJ para começar.
											</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>
					</div>

					<p className="text-[11px] text-slate-400 dark:text-slate-500">
						Impostos estimados para planejamento ({regimeNome}{empresa.regime === "SIMPLES" ? `: alíquota efetiva sobre a receita dos 12 meses anteriores${painel.rbt12 ? ` (${moeda(painel.rbt12)})` : ""}` : ""}). O valor oficial é o
						apurado no PGDAS/pelo contador.
					</p>
				</>
			)}
		</div>
	);
}
