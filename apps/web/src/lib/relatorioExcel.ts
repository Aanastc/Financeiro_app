import ExcelJS from "exceljs";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import { buscarTodasPaginas } from "../../../../packages/services/paginacao";

/**
 * Relatório financeiro completo em Excel.
 * SOMENTE LEITURA: não chama rotinas que sincronizam/alteram dados.
 *
 * Abas:
 *  - Resumo <ano>  : resultado mensal por categoria (mesmas regras do app) + movimentações patrimoniais
 *  - Lançamentos   : todas as transações, com filtro
 *  - Patrimônio    : contas, investimentos, dívidas ativas, cartões e patrimônio líquido
 *  - Metas         : progresso de cada meta
 *  - A Receber     : gastos de terceiros ainda não reembolsados
 */

// ----------------------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------------------
interface Transacao {
	id: string;
	data: string;
	descricao: string;
	valor: number;
	tipo: string;
	status: string | null;
	considerar_soma: boolean | null;
	terceiro: boolean | null;
	terceiro_pago: boolean | null;
	observacao: string | null;
	categorias: { nome: string } | null;
	contas_bancarias: { nome: string } | null;
	cartoes: { nome: string } | null;
	contatos: { nome: string } | null;
}

type Classe =
	| "RECEITA"
	| "DESPESA"
	| "ESTORNO"
	| "APORTE"
	| "RESGATE"
	| "PAGAMENTO_FATURA"
	| "PAGAMENTO_DIVIDA"
	| "RENEGOCIACAO"
	| "TERCEIRO"
	| "TRANSFERENCIA"
	| "AJUSTE";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const ROTULOS_MOVIMENTACOES: { classe: Classe; rotulo: string }[] = [
	{ classe: "APORTE", rotulo: "Aportes em investimentos / metas" },
	{ classe: "RESGATE", rotulo: "Resgates de investimentos" },
	{ classe: "PAGAMENTO_FATURA", rotulo: "Pagamentos de fatura de cartão" },
	{ classe: "PAGAMENTO_DIVIDA", rotulo: "Pagamentos de dívidas / empréstimos" },
	{ classe: "RENEGOCIACAO", rotulo: "Parcelas de renegociação (já contadas na dívida)" },
	{ classe: "TERCEIRO", rotulo: "Gastos de terceiros (a receber)" },
	{ classe: "TRANSFERENCIA", rotulo: "Transferências entre contas próprias" },
	{ classe: "AJUSTE", rotulo: "Ajustes (limite convertido etc.)" },
];

const NOME_TIPO: Record<string, string> = {
	RECEITA: "Receita",
	DESPESA: "Despesa",
	ESTORNO: "Estorno",
	APORTE: "Aporte",
	RESGATE: "Resgate",
	PAGAMENTO_FATURA: "Pagamento de fatura",
	PAGAMENTO_DIVIDA: "Pagamento de dívida",
	TRANSFERENCIA: "Transferência",
	AJUSTE: "Ajuste",
};

/** Classifica a transação com as mesmas regras do getMonthlyStats do app. */
function classificar(t: Transacao): Classe {
	switch (t.tipo) {
		case "RECEITA":
			return "RECEITA";
		case "ESTORNO":
			return "ESTORNO";
		case "DESPESA":
			if (t.terceiro) return "TERCEIRO";
			if (t.considerar_soma === false) return "RENEGOCIACAO";
			return "DESPESA";
		case "APORTE":
		case "RESGATE":
		case "PAGAMENTO_FATURA":
		case "PAGAMENTO_DIVIDA":
		case "TRANSFERENCIA":
			return t.tipo;
		default:
			return "AJUSTE";
	}
}

function categoriaDe(t: Transacao): string {
	if (t.categorias?.nome) return t.categorias.nome;
	const m = (t.observacao || "").match(/Categoria:\s*([^\n|]+)/i);
	return m ? m[1].trim() : "Outros";
}

/** Data ISO (YYYY-MM-DD) → Date em UTC (o ExcelJS grava datas como UTC). */
function dataExcel(iso: string): Date | string {
	const [a, m, d] = (iso || "").split("-").map(Number);
	return a && m && d ? new Date(Date.UTC(a, m - 1, d)) : iso;
}

// ----------------------------------------------------------------------------
// Estilo
// ----------------------------------------------------------------------------
const FONTE = "Segoe UI";
const FMT_MOEDA = '"R$ " #,##0.00;[Red]-"R$ " #,##0.00;"R$ " 0.00';
const FMT_PCT = "0.0%;[Red]-0.0%;0.0%";
const FMT_DATA = "dd/mm/yyyy";

const CORES = {
	titulo: "3D3030",
	cabecalho: "4E342E",
	receita: { texto: "1B5E20", fundo: "E8F5E9", total: "C8E6C9" },
	despesa: { texto: "B71C1C", fundo: "FFEBEE", total: "FFCDD2" },
	resultado: { texto: "0D47A1", fundo: "E3F2FD", total: "BBDEFB" },
	neutro: { texto: "37474F", fundo: "ECEFF1", total: "CFD8DC" },
	borda: "E0E0E0",
};

const col = (n: number) => {
	let s = "";
	while (n > 0) {
		const r = (n - 1) % 26;
		s = String.fromCharCode(65 + r) + s;
		n = Math.floor((n - 1) / 26);
	}
	return s;
};

function borda(cell: ExcelJS.Cell, cor = CORES.borda) {
	const b = { style: "thin" as const, color: { argb: cor } };
	cell.border = { top: b, bottom: b, left: b, right: b };
}

function titulo(sheet: ExcelJS.Worksheet, texto: string, ultimaColuna: number, subtitulo?: string) {
	const row = sheet.addRow([texto]);
	sheet.mergeCells(row.number, 1, row.number, ultimaColuna);
	row.height = 40;
	const c = row.getCell(1);
	c.font = { name: FONTE, size: 16, bold: true, color: { argb: "FFFFFF" } };
	c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES.titulo } };
	c.alignment = { horizontal: "center", vertical: "middle" };
	if (subtitulo) {
		const sub = sheet.addRow([subtitulo]);
		sheet.mergeCells(sub.number, 1, sub.number, ultimaColuna);
		sub.getCell(1).font = { name: FONTE, size: 10, italic: true, color: { argb: "78909C" } };
		sub.getCell(1).alignment = { horizontal: "center" };
	}
	sheet.addRow([]);
}

function secao(sheet: ExcelJS.Worksheet, texto: string, ultimaColuna: number, cor: { texto: string; fundo: string }) {
	const row = sheet.addRow([texto]);
	sheet.mergeCells(row.number, 1, row.number, ultimaColuna);
	row.height = 24;
	const c = row.getCell(1);
	c.font = { name: FONTE, size: 12, bold: true, color: { argb: cor.texto } };
	c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor.fundo } };
	c.alignment = { horizontal: "left", vertical: "middle" };
}

function cabecalho(sheet: ExcelJS.Worksheet, colunas: string[]) {
	const row = sheet.addRow(colunas);
	row.height = 26;
	row.eachCell((cell, n) => {
		cell.font = { name: FONTE, size: 11, bold: true, color: { argb: "FFFFFF" } };
		cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES.cabecalho } };
		cell.alignment = { horizontal: n === 1 ? "left" : "center", vertical: "middle", wrapText: true };
		borda(cell, "8D6E63");
	});
	return row;
}

/** Linha de dados com formatação por coluna. */
function linha(
	sheet: ExcelJS.Worksheet,
	valores: ExcelJS.CellValue[],
	formatos: Record<number, string> = {},
	opcoes: { negrito?: boolean; fundo?: string; corTexto?: string } = {}
) {
	const row = sheet.addRow(valores);
	row.height = 20;
	for (let n = 1; n <= valores.length; n++) {
		const cell = row.getCell(n);
		cell.font = { name: FONTE, size: 10.5, bold: opcoes.negrito, color: { argb: opcoes.corTexto || "263238" } };
		if (opcoes.fundo) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opcoes.fundo } };
		borda(cell);
		if (formatos[n]) {
			cell.numFmt = formatos[n];
			cell.alignment = { horizontal: "right", vertical: "middle" };
		} else {
			cell.alignment = { vertical: "middle" };
		}
	}
	return row;
}

// ----------------------------------------------------------------------------
// Carregamento de dados (somente leitura)
// ----------------------------------------------------------------------------
async function carregarDados(usuarioId: string) {
	const [transacoes, contas, invRes, divRes, metasRes, cartoesRes] = await Promise.all([
		buscarTodasPaginas<Transacao>((de, ate) =>
			supabase
				.from("transacoes")
				.select(
					"id, data, descricao, valor, tipo, status, considerar_soma, terceiro, terceiro_pago, observacao, categorias(nome), contas_bancarias(nome), cartoes(nome), contatos(nome)"
				)
				.eq("usuario_id", usuarioId)
				.order("data", { ascending: false })
				.order("id")
				.range(de, ate) as unknown as PromiseLike<{ data: Transacao[] | null; error: unknown }>
		),
		financeService.getContasBancarias(usuarioId).catch(() => [] as any[]),
		supabase.from("investimentos").select("*").eq("usuario_id", usuarioId).order("titulo"),
		supabase.from("dividas").select("*, parcelas_divida(*)").eq("usuario_id", usuarioId).neq("status", "quitada"),
		supabase.from("metas").select("*, metas_depositos(valor)").eq("usuario_id", usuarioId).order("titulo"),
		supabase.from("cartoes").select("*").eq("usuario_id", usuarioId).order("nome"),
	]);

	return {
		transacoes,
		contas: contas || [],
		investimentos: invRes.data || [],
		dividas: divRes.data || [],
		metas: metasRes.data || [],
		cartoes: cartoesRes.data || [],
	};
}

type Dados = Awaited<ReturnType<typeof carregarDados>>;

// ----------------------------------------------------------------------------
// Aba: Resumo anual
// ----------------------------------------------------------------------------
function abaResumoAnual(wb: ExcelJS.Workbook, ano: string, transacoes: Transacao[]) {
	const sheet = wb.addWorksheet(`Resumo ${ano}`, { views: [{ state: "frozen", ySplit: 4, xSplit: 1 }] });
	sheet.columns = [{ width: 44 }, ...MESES.map(() => ({ width: 13 })), { width: 16 }];
	const ULT = 14;
	const fmtMeses: Record<number, string> = {};
	for (let n = 2; n <= ULT; n++) fmtMeses[n] = FMT_MOEDA;

	// Agrega por classe/categoria/mês
	const porCategoria = { RECEITA: new Map<string, number[]>(), DESPESA: new Map<string, number[]>() };
	const porClasse = new Map<Classe, number[]>();
	const somar = (mapa: Map<any, number[]>, chave: any, mes: number, v: number) => {
		if (!mapa.has(chave)) mapa.set(chave, Array(12).fill(0));
		mapa.get(chave)![mes] += v;
	};
	for (const t of transacoes) {
		const mes = Number(t.data.slice(5, 7)) - 1;
		if (mes < 0 || mes > 11) continue;
		const v = Number(t.valor) || 0;
		const classe = classificar(t);
		if (classe === "RECEITA" || classe === "DESPESA") somar(porCategoria[classe], categoriaDe(t), mes, v);
		else somar(porClasse, classe, mes, v);
	}

	titulo(sheet, `RESUMO FINANCEIRO ${ano}`, ULT, `Gerado em ${new Date().toLocaleString("pt-BR")}`);
	cabecalho(sheet, ["Categoria", ...MESES, "Total"]);

	const blocoCategorias = (
		rotulo: string,
		mapa: Map<string, number[]>,
		cor: { texto: string; fundo: string; total: string },
		extra?: { rotulo: string; valores: number[] }
	) => {
		secao(sheet, rotulo, ULT, cor);
		const inicio = sheet.rowCount + 1;
		const cats = [...mapa.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));
		if (cats.length === 0) cats.push("—");
		cats.forEach((cat, i) => {
			const valores = mapa.get(cat) || Array(12).fill(0);
			const row = linha(sheet, [cat, ...valores, null], fmtMeses, { fundo: i % 2 ? "FAFAFA" : "FFFFFF" });
			row.getCell(ULT).value = { formula: `SUM(B${row.number}:M${row.number})` };
			row.getCell(ULT).font = { name: FONTE, size: 10.5, bold: true };
		});
		if (extra) {
			const row = linha(sheet, [extra.rotulo, ...extra.valores.map(v => -v), null], fmtMeses, { corTexto: "2E7D32" });
			row.getCell(ULT).value = { formula: `SUM(B${row.number}:M${row.number})` };
		}
		const fim = sheet.rowCount;
		const total = linha(sheet, [`Total ${rotulo.split(" ")[0].toLowerCase()}`, ...Array(13).fill(null)], fmtMeses, {
			negrito: true,
			fundo: cor.total,
			corTexto: cor.texto,
		});
		for (let n = 2; n <= ULT; n++) total.getCell(n).value = { formula: `SUM(${col(n)}${inicio}:${col(n)}${fim})` };
		sheet.addRow([]);
		return total.number;
	};

	const linhaReceitas = blocoCategorias("RECEITAS", porCategoria.RECEITA, CORES.receita);
	const linhaDespesas = blocoCategorias("DESPESAS (consumo real)", porCategoria.DESPESA, CORES.despesa, {
		rotulo: "(-) Estornos",
		valores: porClasse.get("ESTORNO") || Array(12).fill(0),
	});

	// Resultado
	secao(sheet, "RESULTADO", ULT, CORES.resultado);
	const saldo = linha(sheet, ["Resultado do mês (receitas - despesas)", ...Array(13).fill(null)], fmtMeses, {
		negrito: true,
		fundo: CORES.resultado.fundo,
		corTexto: CORES.resultado.texto,
	});
	for (let n = 2; n <= ULT; n++) saldo.getCell(n).value = { formula: `${col(n)}${linhaReceitas}-${col(n)}${linhaDespesas}` };

	const acumulado = linha(sheet, ["Resultado acumulado no ano", ...Array(13).fill(null)], fmtMeses, {
		negrito: true,
		fundo: CORES.resultado.total,
		corTexto: CORES.resultado.texto,
	});
	for (let n = 2; n <= 13; n++) {
		acumulado.getCell(n).value = { formula: n === 2 ? `B${saldo.number}` : `${col(n - 1)}${acumulado.number}+${col(n)}${saldo.number}` };
	}
	acumulado.getCell(ULT).value = { formula: `M${acumulado.number}` };

	const fmtPct: Record<number, string> = {};
	for (let n = 2; n <= ULT; n++) fmtPct[n] = FMT_PCT;
	const poupanca = linha(sheet, ["Taxa de poupança (resultado ÷ receitas)", ...Array(13).fill(null)], fmtPct, {
		corTexto: CORES.resultado.texto,
	});
	for (let n = 2; n <= ULT; n++) {
		poupanca.getCell(n).value = { formula: `IFERROR(${col(n)}${saldo.number}/${col(n)}${linhaReceitas},0)` };
	}
	sheet.addRow([]);

	// Movimentações patrimoniais
	secao(sheet, "MOVIMENTAÇÕES QUE NÃO ENTRAM NO RESULTADO", ULT, CORES.neutro);
	for (const { classe, rotulo } of ROTULOS_MOVIMENTACOES) {
		const valores = porClasse.get(classe) || Array(12).fill(0);
		const row = linha(sheet, [rotulo, ...valores, null], fmtMeses);
		row.getCell(ULT).value = { formula: `SUM(B${row.number}:M${row.number})` };
	}
	const nota = sheet.addRow([
		"Estas movimentações mudam onde o dinheiro está (contas, investimentos, dívidas), mas não são consumo nem renda.",
	]);
	sheet.mergeCells(nota.number, 1, nota.number, ULT);
	nota.getCell(1).font = { name: FONTE, size: 9, italic: true, color: { argb: "78909C" } };
}

// ----------------------------------------------------------------------------
// Aba: Lançamentos
// ----------------------------------------------------------------------------
function abaLancamentos(wb: ExcelJS.Workbook, transacoes: Transacao[]) {
	const sheet = wb.addWorksheet("Lançamentos", { views: [{ state: "frozen", ySplit: 1 }] });
	sheet.columns = [
		{ width: 12 }, { width: 46 }, { width: 20 }, { width: 24 }, { width: 15 },
		{ width: 20 }, { width: 20 }, { width: 22 }, { width: 13 }, { width: 14 },
	];
	cabecalho(sheet, ["Data", "Descrição", "Tipo", "Categoria", "Valor", "Conta", "Cartão", "Terceiro / Contato", "Status", "No resultado?"]);

	for (const t of transacoes) {
		const classe = classificar(t);
		const noResultado = classe === "RECEITA" || classe === "DESPESA" || classe === "ESTORNO";
		const terceiro = t.terceiro ? `${t.contatos?.nome || "Sim"}${t.terceiro_pago ? " (pago)" : ""}` : t.contatos?.nome || "";
		linha(
			sheet,
			[
				dataExcel(t.data),
				t.descricao,
				NOME_TIPO[t.tipo] || t.tipo,
				categoriaDe(t),
				Number(t.valor) || 0,
				t.contas_bancarias?.nome || "",
				t.cartoes?.nome || "",
				terceiro,
				t.status || "",
				noResultado ? "Sim" : "Não",
			],
			{ 1: FMT_DATA, 5: FMT_MOEDA },
			{ corTexto: t.tipo === "RECEITA" ? "1B5E20" : undefined }
		);
	}
	sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: 10 } };
}

// ----------------------------------------------------------------------------
// Aba: Patrimônio
// ----------------------------------------------------------------------------
function abaPatrimonio(wb: ExcelJS.Workbook, d: Dados) {
	const sheet = wb.addWorksheet("Patrimônio");
	sheet.columns = [{ width: 36 }, { width: 22 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 18 }];
	const ULT = 7;
	titulo(sheet, "POSIÇÃO PATRIMONIAL", ULT, `Fotografia em ${new Date().toLocaleDateString("pt-BR")}`);

	const totalDe = (linhaInicio: number, linhaFim: number, coluna: number) =>
		linhaFim >= linhaInicio ? { formula: `SUM(${col(coluna)}${linhaInicio}:${col(coluna)}${linhaFim})` } : 0;

	// Contas
	secao(sheet, "CONTAS BANCÁRIAS", ULT, CORES.resultado);
	cabecalho(sheet, ["Conta", "Instituição", "Tipo", "Saldo atual"]);
	const iniContas = sheet.rowCount + 1;
	for (const c of d.contas.filter((c: any) => c.ativa !== false)) {
		linha(sheet, [c.nome, c.instituicao || "", c.tipo || "", Number(c.saldo_atual) || 0], { 4: FMT_MOEDA });
	}
	const totContas = linha(sheet, ["Total em contas", "", "", totalDe(iniContas, sheet.rowCount, 4)], { 4: FMT_MOEDA }, {
		negrito: true,
		fundo: CORES.resultado.total,
	});
	sheet.addRow([]);

	// Investimentos
	secao(sheet, "INVESTIMENTOS", ULT, CORES.receita);
	cabecalho(sheet, ["Investimento", "Instituição", "Tipo", "Valor investido", "Valor atual", "Rendimento", "Rentabilidade"]);
	const iniInv = sheet.rowCount + 1;
	for (const inv of d.investimentos) {
		const row = linha(
			sheet,
			[
				inv.titulo,
				(inv.corretora || "").replace(/\[Meta:\s*[^\]]+\]/, "").trim(),
				inv.tipo || "",
				Number(inv.valor_investido) || 0,
				Number(inv.valor_atual) || 0,
				null,
				null,
			],
			{ 4: FMT_MOEDA, 5: FMT_MOEDA, 6: FMT_MOEDA, 7: FMT_PCT }
		);
		row.getCell(6).value = { formula: `E${row.number}-D${row.number}` };
		row.getCell(7).value = { formula: `IFERROR(F${row.number}/D${row.number},0)` };
	}
	const fimInv = sheet.rowCount;
	const totInv = linha(
		sheet,
		["Total investido", "", "", totalDe(iniInv, fimInv, 4), totalDe(iniInv, fimInv, 5), totalDe(iniInv, fimInv, 6), null],
		{ 4: FMT_MOEDA, 5: FMT_MOEDA, 6: FMT_MOEDA },
		{ negrito: true, fundo: CORES.receita.total }
	);
	sheet.addRow([]);

	// Dívidas
	secao(sheet, "DÍVIDAS ATIVAS", ULT, CORES.despesa);
	cabecalho(sheet, ["Dívida", "Instituição", "Valor original", "Saldo devedor", "Parcelas pagas", "Total parcelas", "Próximo vencimento"]);
	const iniDiv = sheet.rowCount + 1;
	for (const div of d.dividas) {
		const parcelas = (div.parcelas_divida || []) as any[];
		const pagas = parcelas.filter(p => p.status === "paga").length;
		const proxima = parcelas
			.filter(p => p.status !== "paga")
			.map(p => p.data_vencimento as string)
			.sort()[0];
		linha(
			sheet,
			[div.descricao, div.instituicao || "", Number(div.valor_original) || 0, Number(div.valor_atual) || 0, pagas, parcelas.length, proxima ? dataExcel(proxima) : "—"],
			{ 3: FMT_MOEDA, 4: FMT_MOEDA, 7: FMT_DATA }
		);
	}
	const totDiv = linha(sheet, ["Total em dívidas", "", "", totalDe(iniDiv, sheet.rowCount, 4)], { 4: FMT_MOEDA }, {
		negrito: true,
		fundo: CORES.despesa.total,
	});
	sheet.addRow([]);

	// Cartões
	secao(sheet, "CARTÕES DE CRÉDITO", ULT, CORES.neutro);
	cabecalho(sheet, ["Cartão", "Titular / dependente", "Limite", "Dia de fechamento", "Dia de vencimento"]);
	for (const c of d.cartoes) {
		linha(sheet, [c.nome, c.dependente_nome || "Titular", Number(c.limite) || 0, c.fechamento_dia, c.vencimento_dia], { 3: FMT_MOEDA });
	}
	sheet.addRow([]);

	// Patrimônio líquido
	secao(sheet, "PATRIMÔNIO LÍQUIDO", ULT, CORES.resultado);
	linha(sheet, ["(+) Contas", "", "", { formula: `D${totContas.number}` }], { 4: FMT_MOEDA });
	linha(sheet, ["(+) Investimentos (valor atual)", "", "", { formula: `E${totInv.number}` }], { 4: FMT_MOEDA });
	linha(sheet, ["(-) Dívidas", "", "", { formula: `-D${totDiv.number}` }], { 4: FMT_MOEDA });
	const pl = linha(sheet, ["= Patrimônio líquido", "", "", null], { 4: FMT_MOEDA }, { negrito: true, fundo: CORES.resultado.total, corTexto: CORES.resultado.texto });
	pl.getCell(4).value = { formula: `SUM(D${pl.number - 3}:D${pl.number - 1})` };
}

// ----------------------------------------------------------------------------
// Aba: Metas
// ----------------------------------------------------------------------------
function abaMetas(wb: ExcelJS.Workbook, metas: any[]) {
	const sheet = wb.addWorksheet("Metas", { views: [{ state: "frozen", ySplit: 1 }] });
	sheet.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 13 }, { width: 16 }, { width: 13 }];
	cabecalho(sheet, ["Meta", "Valor alvo", "Guardado", "% atingido", "Falta", "Prazo"]);
	for (const m of metas) {
		const guardado = (m.metas_depositos || []).reduce((s: number, dep: any) => s + (Number(dep.valor) || 0), 0);
		const row = linha(sheet, [m.titulo, Number(m.valor) || 0, guardado, null, null, m.prazo ? dataExcel(m.prazo) : "—"], {
			2: FMT_MOEDA,
			3: FMT_MOEDA,
			4: FMT_PCT,
			5: FMT_MOEDA,
			6: FMT_DATA,
		});
		row.getCell(4).value = { formula: `IFERROR(MIN(C${row.number}/B${row.number},1),0)` };
		row.getCell(5).value = { formula: `MAX(B${row.number}-C${row.number},0)` };
	}
}

// ----------------------------------------------------------------------------
// Aba: A Receber
// ----------------------------------------------------------------------------
function abaAReceber(wb: ExcelJS.Workbook, transacoes: Transacao[]) {
	const sheet = wb.addWorksheet("A Receber", { views: [{ state: "frozen", ySplit: 1 }] });
	sheet.columns = [{ width: 28 }, { width: 12 }, { width: 46 }, { width: 15 }];
	cabecalho(sheet, ["Contato", "Data", "Descrição", "Valor"]);

	const pendentes = transacoes
		.filter(t => t.tipo === "DESPESA" && t.terceiro && !t.terceiro_pago)
		.sort((a, b) => (a.contatos?.nome || "").localeCompare(b.contatos?.nome || "", "pt-BR") || a.data.localeCompare(b.data));

	const inicio = sheet.rowCount + 1;
	for (const t of pendentes) {
		linha(sheet, [t.contatos?.nome || "Sem contato", dataExcel(t.data), t.descricao, Number(t.valor) || 0], { 2: FMT_DATA, 4: FMT_MOEDA });
	}
	const fim = sheet.rowCount;
	linha(sheet, ["Total a receber", "", "", fim >= inicio ? { formula: `SUM(D${inicio}:D${fim})` } : 0], { 4: FMT_MOEDA }, {
		negrito: true,
		fundo: CORES.receita.total,
	});
}

// ----------------------------------------------------------------------------
// API pública
// ----------------------------------------------------------------------------
export async function gerarRelatorioExcel(usuarioId: string): Promise<Blob> {
	const dados = await carregarDados(usuarioId);

	const wb = new ExcelJS.Workbook();
	wb.creator = "Finance App";
	wb.created = new Date();

	const porAno = new Map<string, Transacao[]>();
	for (const t of dados.transacoes) {
		const ano = (t.data || "").slice(0, 4);
		if (!/^\d{4}$/.test(ano)) continue;
		if (!porAno.has(ano)) porAno.set(ano, []);
		porAno.get(ano)!.push(t);
	}
	const anos = [...porAno.keys()].sort((a, b) => b.localeCompare(a));
	if (anos.length === 0) anos.push(String(new Date().getFullYear()));

	for (const ano of anos) abaResumoAnual(wb, ano, porAno.get(ano) || []);
	abaLancamentos(wb, dados.transacoes);
	abaPatrimonio(wb, dados);
	abaMetas(wb, dados.metas);
	abaAReceber(wb, dados.transacoes);

	const buffer = await wb.xlsx.writeBuffer();
	return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
