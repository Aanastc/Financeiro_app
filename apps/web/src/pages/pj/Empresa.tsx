import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AlertCircle, Building2, Calculator, Calendar, FileSpreadsheet, Info, Landmark, Pencil, PiggyBank, Receipt, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import CategoryBreakdown from "../../components/CategoryBreakdown";
import { toast } from "react-hot-toast";
import ExcelJS from "exceljs";
import { supabase } from "../../../../../packages/services/supabase";
import { financeService } from "../../../../../packages/services/finance.service";
import { acrescimosPorAtraso, salarioMinimoVigente, type Acrescimos } from "../../../../../packages/services/dados-publicos.service";
import {
	dasMeiSugerido,
	definirContasDaEmpresa,
	ehImposto,
	minhasEmpresas,
	painelEmpresa,
	salvarEmpresa,
	classificarComoRetirada,
	NOME_RETIRADA,
	type Empresa,
	type PainelEmpresa,
	type TipoRetirada,
} from "../../../../../packages/services/empresa.service";
import { CORES, FMT_MOEDA, FONTE, cabecalho, linha, titulo } from "../../lib/relatorioExcel";
import PageLoader from "../../components/PageLoader";
import InputMoeda, { lerMoeda } from "../../components/InputMoeda";
import AddInvestimentoWeb from "../../components/AddInvestimentoWeb";
import { regraDaEmpresa } from "../../lib/pj/regrasImportacao";

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
	const outlet = useOutletContext<any>();
	const [loading, setLoading] = useState(true);
	const [userId, setUserId] = useState<string | null>(null);
	const [empresa, setEmpresa] = useState<Empresa | null>(null);
	const [contas, setContas] = useState<any[]>([]);
	const [painel, setPainel] = useState<PainelEmpresa | null>(null);
	const [ano, setAno] = useState(new Date().getFullYear());
	const [editando, setEditando] = useState(false);
	const [salvando, setSalvando] = useState(false);
	const [form, setForm] = useState<Form | null>(null);
	// Conta PJ nova (quem tem PF e PJ no mesmo banco precisa de duas contas no app)
	const [novaConta, setNovaConta] = useState<{ nome: string; instituicao: string; numero: string } | null>(null);
	const [criandoConta, setCriandoConta] = useState(false);
	// Dados públicos: salário mínimo vigente (DAS do MEI) e multa/juros de imposto atrasado
	const [salarioMinimo, setSalarioMinimo] = useState<number | undefined>(undefined);
	const [atraso, setAtraso] = useState<Acrescimos | null>(null);
	// Caixinha da empresa aberta para editar (tipo/rentabilidade e saldo do banco)
	const [investimentoEmEdicao, setInvestimentoEmEdicao] = useState<any | null>(null);
	const editarInvestimento = async (id: string) => {
		const { data, error } = await supabase.from("investimentos").select("*").eq("id", id).single();
		if (error || !data) return toast.error("Não foi possível abrir o investimento.");
		setInvestimentoEmEdicao(data);
	};
	useEffect(() => {
		salarioMinimoVigente().then(setSalarioMinimo).catch(() => {});
	}, []);

	const criarContaDaEmpresa = async () => {
		if (!userId || !novaConta || !form) return;
		if (!novaConta.nome.trim()) return toast.error("Dê um nome para a conta (ex.: Inter PJ).");
		setCriandoConta(true);
		try {
			const [criada] = await financeService.addContaBancaria(userId, {
				nome: novaConta.nome.trim(),
				instituicao: novaConta.instituicao.trim() || null,
				numero_conta: novaConta.numero.replace(/[^\d-]/g, "") || null,
				tipo: "Conta Corrente",
				saldo_inicial: 0,
			});
			setContas((cs) => [...cs, criada]);
			setForm({ ...form, contas: [...form.contas, criada.id] });
			setNovaConta(null);
			toast.success("Conta da empresa criada. Importe o extrato dela para trazer os lançamentos.");
		} catch (e: any) {
			toast.error(e?.message || "Não foi possível criar a conta.");
		} finally {
			setCriandoConta(false);
		}
	};

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
			// a barra do topo passa a mostrar a chave Pessoa Física / Empresa
			await outlet?.recarregarEmpresa?.();
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
		// Só meses em que algo aconteceu (sem os vazios e sem o mês atual se ainda não teve lançamento)
		const comMovimento = painel.meses.filter(
			(m) => m.faturamento || m.despesas || m.impostosPagos || m.proLabore || m.lucrosDistribuidos,
		);
		const ultimos = comMovimento.slice(-3);
		const media = (f: (m: PainelEmpresa["meses"][number]) => number) => (ultimos.length ? ultimos.reduce((s, m) => s + f(m), 0) / ultimos.length : 0);
		const despesaMedia = media((m) => m.despesas);
		// Imposto que ainda vai sair: o do mês atual e o do mês anterior (vence dia 20)
		const hoje = new Date();
		const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
		// Imposto do mês anterior ainda não pago (nenhum imposto saiu da conta neste mês)?
		const anteriorEmAberto = Boolean(anterior && anterior.imposto.valor > 0 && (atual?.impostosPagos || 0) < 0.01);
		const anteriorAtrasado = anteriorEmAberto && hojeIso > (anterior?.imposto.vencimento || "9999");
		const impostoAnteriorAberto = anteriorEmAberto ? anterior.imposto.valor : 0;
		const reservar = (atual?.imposto.valor || 0) + impostoAnteriorAberto + despesaMedia;
		const proLaboreAno = painel.meses.reduce((s, m) => s + m.proLabore, 0);
		const lucrosAno = painel.meses.reduce((s, m) => s + m.lucrosDistribuidos, 0);
		const lucroAno = painel.meses.reduce((s, m) => s + m.lucro, 0);
		// Fator R: quanto de pró-labore por mês para chegar a 28% (Anexo III em vez do V)
		const faltaFatorR =
			empresa.regime === "SIMPLES" && (empresa.anexo || "FATOR_R") === "FATOR_R" && painel.fatorR !== null && painel.fatorR < 0.28 && painel.rbt12 > 0
				? Math.max(0, (0.28 * painel.rbt12 - painel.fatorR * painel.rbt12) / 12)
				: 0;
		// Quanto a empresa deveria ter guardado, pelo que ela movimenta (médias dos últimos meses com dados)
		const faturamentoMedio = media((m) => m.faturamento);
		const impostoMedio = media((m) => m.imposto.valor);
		const retiradaMedia = media((m) => m.proLabore + m.lucrosDistribuidos);
		const guardado = painel.investimentos.reduce((s, i) => s + i.valor, 0);
		const reservaIdeal = 3 * (despesaMedia + impostoMedio); // 3 meses de despesas + impostos
		const faltaReserva = Math.max(0, reservaIdeal - guardado);
		const sobraMedia = faturamentoMedio - despesaMedia - impostoMedio - retiradaMedia;
		const aliquota = [...comMovimento].reverse().find((m) => m.faturamento > 0)?.imposto.aliquota || 0;
		const guardarPorMes =
			faltaReserva > 0 ? Math.ceil((sobraMedia > 0 ? Math.min(sobraMedia, faltaReserva / 6) : faltaReserva / 6) / 10) * 10 : 0;
		const dica = { reservaIdeal, guardado, faltaReserva, sobraMedia, faturamentoMedio, impostoMedio, retiradaMedia, aliquota, guardarPorMes, meses: ultimos.length };
		// Gráficos (só o ano escolhido)
		const doAno = (l: { data: string }) => l.data.startsWith(String(ano));
		const agrupar = (lista: { valor: number }[], chave: (l: any) => string) => {
			const mapa = new Map<string, number>();
			for (const l of lista) mapa.set(chave(l), (mapa.get(chave(l)) || 0) + Number(l.valor || 0));
			return [...mapa.entries()].map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
		};
		// Impostos ficam juntos numa categoria só; o que veio sem categoria é deduzido pela descrição (mesmas regras do importador)
		const categoriaDaDespesa = (d: { descricao: string; categoria?: string | null }) =>
			ehImposto(d.descricao, d.categoria) ? "Impostos (DAS/ISS)" : d.categoria || regraDaEmpresa(d.descricao, 0, "Gasto")?.categoria || "Sem categoria";
		const despesasPorCategoria = agrupar(painel.despesas.filter(doAno), categoriaDaDespesa);
		const retiradasDoAno = painel.retiradas.filter(doAno);
		const destinoDoDinheiro = [
			...despesasPorCategoria,
			...agrupar(retiradasDoAno, (r) => (r.tipo === "LUCROS" ? "Lucros para você" : "Pró-labore (seu salário)")),
		];
		const nomeCliente = (d: string) =>
			(d || "Sem descrição").replace(/^(pix recebido|ted recebida|transfer[eê]ncia recebida( pelo pix)?)[:\s-]*/i, "").split(" - ")[0].trim() || "Sem descrição";
		const faturamentoPorCliente = agrupar(painel.receitas.filter(doAno), (r) => nomeCliente(r.descricao));
		const graficoMeses = comMovimento.map((m) => ({
			mes: nomeMes(m.mes),
			faturamento: m.faturamento,
			custos: Math.round((m.despesas + m.impostosPagos) * 100) / 100,
			retiradas: Math.round((m.proLabore + m.lucrosDistribuidos) * 100) / 100,
		}));
		const datas = [...painel.receitas, ...painel.despesas, ...painel.retiradas, ...painel.aClassificar].map((l) => l.data).filter(Boolean).sort();
		const ultimoLancamento = datas.length ? datas[datas.length - 1] : null;
		const diasSemLancar = ultimoLancamento
			? Math.floor((new Date(`${hojeIso}T12:00:00`).getTime() - new Date(`${ultimoLancamento}T12:00:00`).getTime()) / 86400000)
			: null;
		return { atual, anterior, anteriorAtrasado, anteriorEmAberto, comMovimento, dica, hojeIso, reservar,
			despesasPorCategoria, destinoDoDinheiro, faturamentoPorCliente, graficoMeses, ultimoLancamento, diasSemLancar, disponivel: Math.max(0, saldoEmpresa - reservar), proLaboreAno, lucrosAno, lucroAno, faltaFatorR, despesaMedia };
	}, [painel, empresa, saldoEmpresa, ano]);

	// Imposto atrasado: multa (0,33%/dia, até 20%) + juros Selic do Banco Central até hoje
	useEffect(() => {
		if (!resumo?.anteriorAtrasado || !resumo.anterior) {
			setAtraso(null);
			return;
		}
		acrescimosPorAtraso(resumo.anterior.imposto.valor, resumo.anterior.imposto.vencimento, resumo.hojeIso)
			.then(setAtraso)
			.catch(() => setAtraso(null));
	}, [resumo?.anteriorAtrasado, resumo?.anterior?.imposto.valor, resumo?.anterior?.imposto.vencimento, resumo?.hojeIso]);

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
								<InputMoeda className={campo} value={form.das_mei_valor} onChange={(v) => setForm({ ...form, das_mei_valor: v })} placeholder={paraMoedaTexto(dasMeiSugerido(form.atividade, salarioMinimo))} />
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
								<label key={c.id} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer ${form.contas.includes(c.id) ? "border-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/30" : "border-slate-200 dark:border-slate-700"}`}>
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
						<p className="text-[11px] text-amber-700 dark:text-amber-400">
							Marque só contas que são do CNPJ. Se você tem conta pessoal e da empresa no mesmo banco (ex.: Inter PF e Inter PJ), são duas contas diferentes: deixe a pessoal desmarcada e crie a da empresa abaixo.
						</p>
						{novaConta ? (
							<div className="grid grid-cols-1 sm:grid-cols-4 gap-2 p-3 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-800">
								<input className={campo} value={novaConta.nome} onChange={(e) => setNovaConta({ ...novaConta, nome: e.target.value })} placeholder="Nome (ex.: Inter PJ)" aria-label="Nome da conta" />
								<input className={campo} value={novaConta.instituicao} onChange={(e) => setNovaConta({ ...novaConta, instituicao: e.target.value })} placeholder="Banco (ex.: Inter)" aria-label="Banco" />
								<input className={campo} value={novaConta.numero} onChange={(e) => setNovaConta({ ...novaConta, numero: e.target.value })} placeholder="Nº da conta (opcional)" aria-label="Número da conta" />
								<div className="flex gap-2">
									<button type="button" onClick={criarContaDaEmpresa} disabled={criandoConta} className="flex-1 px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-black cursor-pointer">
										{criandoConta ? "Criando..." : "Criar"}
									</button>
									<button type="button" onClick={() => setNovaConta(null)} className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-bold cursor-pointer">
										Cancelar
									</button>
								</div>
							</div>
						) : (
							<button type="button" onClick={() => setNovaConta({ nome: "", instituicao: "", numero: "" })} className="text-xs font-black text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer">
								+ Criar conta da empresa
							</button>
						)}
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
					{/* Última atividade (como no PF): extrato da empresa em dia? */}
					{resumo.diasSemLancar !== null && resumo.diasSemLancar > 30 ? (
						<div className="flex items-center gap-3.5 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
							<div className="p-2.5 bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl"><AlertCircle size={18} /></div>
							<div>
								<p className="text-sm font-extrabold text-amber-900 dark:text-amber-300">Faz {resumo.diasSemLancar} dias sem lançamento na conta da empresa</p>
								<p className="text-xs font-semibold text-amber-700/80 dark:text-amber-400/80">
									O último foi em <b>{dataBR(resumo.ultimoLancamento)}</b>. Importe o extrato do CNPJ para o imposto e o lucro ficarem certos.
								</p>
							</div>
						</div>
					) : (
						<div className="flex items-center gap-3.5 p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100/60 dark:border-indigo-900/20">
							<div className="p-2.5 bg-indigo-100/60 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl"><Calendar size={18} /></div>
							<div>
								<p className="text-xs font-bold text-slate-400 dark:text-slate-500">{resumo.ultimoLancamento ? "Última atividade registrada" : "Status dos lançamentos"}</p>
								<p className="text-sm font-black text-slate-700 dark:text-slate-200">
									{resumo.ultimoLancamento
										? `O último lançamento na conta da empresa foi em ${dataBR(resumo.ultimoLancamento)}.`
										: "Nenhum lançamento nas contas da empresa ainda. Importe o extrato do CNPJ."}
								</p>
							</div>
						</div>
					)}

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
							{resumo.anteriorEmAberto && resumo.anterior ? (
								<>
									{/* O boleto que vem primeiro: o do mês passado (dia 20 ou o próximo dia útil) */}
									<p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Receipt size={13} /> Próximo {empresa.regime === "PRESUMIDO" ? "imposto" : "DAS"}</p>
									<p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{moeda(resumo.anterior.imposto.valor)}</p>
									<p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
										competência {nomeMes(resumo.anterior.mes)} · vence <b>{dataBR(resumo.anterior.imposto.vencimento)}</b>
									</p>
									<p className="text-[11px] text-slate-400">
										{resumo.atual ? `${nomeMes(resumo.atual.mes)} até agora: ${moeda(resumo.atual.imposto.valor)} (vence ${dataBR(resumo.atual.imposto.vencimento)})` : ""}
									</p>
								</>
							) : (
								<>
									<p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Receipt size={13} /> Imposto deste mês</p>
									<p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{moeda(resumo.atual?.imposto.valor || 0)}</p>
									<p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
										{empresa.regime === "MEI" ? "DAS" : `${pct(resumo.atual?.imposto.aliquota || 0)} efetivo`} · vence {dataBR(resumo.atual?.imposto.vencimento)}
									</p>
									<p className="text-[11px] text-slate-400">{resumo.atual?.imposto.detalhe}</p>
								</>
							)}
							{resumo.anteriorAtrasado && resumo.anterior && (
								<p className="mt-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">
									O de {nomeMes(resumo.anterior.mes)} venceu em {dataBR(resumo.anterior.imposto.vencimento)} e não achei o pagamento.
									{atraso && atraso.diasAtraso > 0 && (
										<> Pagando hoje: ≈ {moeda(atraso.total)} (multa {moeda(atraso.multa)} + juros {moeda(atraso.juros)}).</>
									)}
								</p>
							)}
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

					{/* Gráficos: mês a mês e para onde vai / de onde vem o dinheiro */}
					{resumo.graficoMeses.length > 0 && (
						<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5 sm:p-6">
							<p className="text-sm font-black text-slate-800 dark:text-slate-100 mb-4">Entrou e saiu, mês a mês</p>
							<div className="h-64 w-full">
								<ResponsiveContainer width="100%" height="100%">
									<BarChart data={resumo.graficoMeses} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
										<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.5} />
										<XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} dy={5} />
										<YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
										<Tooltip cursor={{ fill: "rgba(148,163,184,0.1)" }} contentStyle={{ borderRadius: "12px", border: "none" }} formatter={(v: number) => moeda(v)} />
										<Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
										<Bar dataKey="faturamento" name="Faturamento" fill="#10B981" radius={[4, 4, 0, 0]} barSize={14} />
										<Bar dataKey="custos" name="Despesas + impostos pagos" fill="#F43F5E" radius={[4, 4, 0, 0]} barSize={14} />
										<Bar dataKey="retiradas" name="Retiradas (pró-labore/lucros)" fill="#6366F1" radius={[4, 4, 0, 0]} barSize={14} />
									</BarChart>
								</ResponsiveContainer>
							</div>
						</div>
					)}

					<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
						<CategoryBreakdown
							title={`Para onde foi o dinheiro em ${ano}`}
							icon={<TrendingDown className="text-rose-500" size={18} />}
							data={resumo.destinoDoDinheiro}
							barClassName="bg-rose-500"
							emptyText="Nenhuma despesa ou retirada da empresa no ano."
						/>
						<CategoryBreakdown
							title={`Faturamento por cliente em ${ano}`}
							icon={<TrendingUp className="text-emerald-500" size={18} />}
							data={resumo.faturamentoPorCliente}
							barClassName="bg-emerald-500"
							emptyText="Nenhum recebimento de cliente no ano."
						/>
					</div>

					{/* Dinheiro guardado pela empresa + quanto seria bom guardar */}
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
						<div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5 sm:p-6 space-y-3">
							<p className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2"><PiggyBank size={16} className="text-emerald-500" /> Guardado pela empresa</p>
							{painel.investimentos.length === 0 ? (
								<p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma caixinha ou aplicação nas contas da empresa ainda.</p>
							) : (
								painel.investimentos.map((i) => (
									<div key={i.id} className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 space-y-1">
										<div className="flex items-baseline justify-between gap-2">
											<span className="text-sm font-bold text-slate-700 dark:text-slate-200">{i.titulo}</span>
											<span className="flex items-center gap-1">
												<span className="text-lg font-black text-slate-800 dark:text-slate-100">{moeda(i.valor)}</span>
												<button
													onClick={() => editarInvestimento(i.id)}
													title="Editar (tipo, rentabilidade e saldo do banco)"
													aria-label={`Editar ${i.titulo}`}
													className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
												>
													<Pencil size={14} />
												</button>
											</span>
										</div>
										<p className="text-xs text-slate-500 dark:text-slate-400">
											Aplicado {moeda(i.aplicado)} · <b className="text-emerald-600 dark:text-emerald-400">rendeu {moeda(i.rendimento)}</b>
										</p>
										{i.taxaAnual != null ? (
											<p className="text-xs text-slate-500 dark:text-slate-400">
												{i.indexador === "CDI" ? `${i.taxa ?? 100}% do CDI` : i.indexador} ≈ <b>{pct(i.taxaAnual)} ao ano</b> hoje · rende ≈ <b>{moeda(i.rendeMes || 0)}/mês</b> com esse saldo
											</p>
										) : (
											<p className="text-xs text-amber-700 dark:text-amber-400">
												Clique no lápis e informe o tipo (ex.: CDB 100% do CDI) para calcular quanto rende.
											</p>
										)}
									</div>
								))
							)}
						</div>

						{resumo.dica.meses > 0 && (
							<div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-3xl border border-emerald-200 dark:border-emerald-900/40 p-5 sm:p-6 space-y-2">
								<p className="text-sm font-black text-emerald-800 dark:text-emerald-300 flex items-center gap-2"><TrendingUp size={16} /> Quanto seria bom guardar</p>
								<p className="text-xs text-slate-600 dark:text-slate-300">
									Pelos últimos {resumo.dica.meses} {resumo.dica.meses === 1 ? "mês" : "meses"} com movimento: entra ≈ {moeda(resumo.dica.faturamentoMedio)}/mês; saem ≈ {moeda(resumo.despesaMedia)} de despesas, {moeda(resumo.dica.impostoMedio)} de imposto e {moeda(resumo.dica.retiradaMedia)} para você.
								</p>
								<ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-200 list-disc pl-5">
									{resumo.dica.aliquota > 0 && (
										<li>
											A cada pagamento de cliente, separe <b>{pct(resumo.dica.aliquota)}</b> para o imposto (de {moeda(resumo.dica.faturamentoMedio)}, ≈ {moeda((resumo.dica.faturamentoMedio * resumo.dica.aliquota) / 100)}).
										</li>
									)}
									<li>
										Reserva da empresa: o ideal é ter ≈ <b>{moeda(resumo.dica.reservaIdeal)}</b> (3 meses de despesas + impostos). Hoje tem {moeda(resumo.dica.guardado)}
										{resumo.dica.faltaReserva > 0 ? <>; faltam <b>{moeda(resumo.dica.faltaReserva)}</b>.</> : ": reserva completa."}
									</li>
									{resumo.dica.faltaReserva > 0 &&
										(resumo.dica.sobraMedia > 0 ? (
											<li>
												Guardando <b>≈ {moeda(resumo.dica.guardarPorMes)}/mês</b> na caixinha, a reserva fica pronta em ≈ {Math.ceil(resumo.dica.faltaReserva / Math.max(1, resumo.dica.guardarPorMes))} meses.
											</li>
										) : (
											<li className="text-amber-800 dark:text-amber-300">
												Hoje sai mais do que entra (≈ {moeda(Math.abs(resumo.dica.sobraMedia))}/mês a mais). Para formar a reserva, retire ≈ <b>{moeda(resumo.dica.guardarPorMes)}</b> a menos por mês e deixe na caixinha.
											</li>
										))}
								</ul>
							</div>
						)}
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
									{[...resumo.comMovimento].reverse().map((m) => (
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
									{resumo.comMovimento.length === 0 && (
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
						Meses sem nenhum movimento não aparecem. Impostos estimados para planejamento ({regimeNome}{empresa.regime === "SIMPLES" ? `: alíquota efetiva sobre a receita dos 12 meses anteriores${painel.rbt12 ? ` (${moeda(painel.rbt12)})` : ""}` : ""}). O valor oficial é o
						apurado no PGDAS/pelo contador.
					</p>
				</>
			)}

			{investimentoEmEdicao && (
				<AddInvestimentoWeb investimento={investimentoEmEdicao} onClose={() => setInvestimentoEmEdicao(null)} onSuccess={carregar} />
			)}
		</div>
	);
}
