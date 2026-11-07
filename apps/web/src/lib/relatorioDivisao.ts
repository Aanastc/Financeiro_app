import ExcelJS from "exceljs";
import { CORES, FMT_MOEDA, FONTE } from "./relatorioExcel";
import { hojeISO } from "../../../../packages/utils/datas";

/**
 * Planilhas da divisão de contas:
 *   aba "Resumo": quanto foi, quanto já pagaram, quanto falta e uma linha por mês
 *   (clicando no mês abre a aba dele);
 *   uma aba por mês com os itens daquele mês.
 * Só lê os dados já carregados na tela.
 */

const lerMeta = (obs?: string | null): any => {
	try {
		return obs && obs.trim().startsWith("{") ? JSON.parse(obs) : {};
	} catch {
		return {};
	}
};

async function baixar(wb: ExcelJS.Workbook, nomeArquivo: string) {
	const { saveAs } = await import("file-saver");
	const buffer = await wb.xlsx.writeBuffer();
	saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nomeArquivo);
}

const slug = (t: string) =>
	(t || "planilha").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "").toLowerCase();
const centavos = (v: number) => Math.round(v * 100) / 100;
const dataBR = (iso: string) => {
	const [a, m, d] = iso.split("-");
	return `${d}/${m}/${a}`;
};
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "Projetor HY300 (2/6) (Parte Julia) [69]" -> "Projetor HY300" */
const limparDescricao = (texto: string, nomes: string[] = []) => {
	let t = String(texto || "");
	t = t.replace(/\s*\[[^\]]*\]\s*$/, "").replace(/\s*\(Parte [^)]*\)\s*$/i, "");
	for (const n of nomes) if (n) t = t.replace(new RegExp(`\\s*-\\s*${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "");
	return t.replace(/\s*\(\d+\/\d+\)\s*$/, "").trim();
};

interface Item {
	data: string;
	compra: string;
	parcela: string;
	valor: number;
	pago: number;
	aberto: number;
	opcional: boolean;
	recusado: boolean;
	quitado: boolean;
	meta: any;
}

function normalizar(i: any, nomes: string[]): Item {
	const meta = lerMeta(i.observacao);
	const valor = Number(i.valor) || 0;
	const recusado = meta.resposta_cobranca === "recusada";
	const pago = i.terceiro_pago ? valor : Math.min(valor, Number(meta.valor_pago) || 0);
	const m = String(i.descricao || "").match(/\((\d+)\/(\d+)\)/);
	const p = Number(meta.parcela) || (m ? Number(m[1]) : 1);
	const t = Number(meta.total_parcelas) || (m ? Number(m[2]) : 1);
	return {
		data: i.data,
		compra: limparDescricao(meta.descricao_original || i.descricao, nomes),
		parcela: t > 1 ? `${p}/${t}` : "",
		valor,
		pago,
		aberto: i.terceiro_pago || recusado ? 0 : centavos(Math.max(0, valor - pago)),
		opcional: Boolean(meta.opcional),
		recusado,
		quitado: Boolean(i.terceiro_pago),
		meta,
	};
}

/** Situação de um mês, em português direto */
const situacaoMes = (itens: Item[], hoje: string) => {
	const aberto = centavos(itens.reduce((s, i) => s + i.aberto, 0));
	if (aberto <= 0) return { texto: "PAGO", cor: CORES.receita };
	const pago = itens.some((i) => i.pago > 0);
	if (itens[0].data <= hoje) return { texto: pago ? `VENCIDO · falta ${moeda(aberto)}` : "VENCIDO", cor: CORES.despesa };
	return { texto: pago ? `PARCIAL · falta ${moeda(aberto)}` : "A VENCER", cor: CORES.neutro };
};

// ----------------------------------------------------------------------------
// Estilos simples
// ----------------------------------------------------------------------------
const fonte = (bold = false, size = 10.5, cor = "263238", italic = false): Partial<ExcelJS.Font> => ({ name: FONTE, size, bold, italic, color: { argb: cor } });
const preencher = (cell: ExcelJS.Cell, argb: string) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } });

function tituloPlanilha(ws: ExcelJS.Worksheet, texto: string, sub: string, colunas: number) {
	const r = ws.addRow([texto]);
	ws.mergeCells(r.number, 1, r.number, colunas);
	r.height = 34;
	r.getCell(1).font = fonte(true, 15, "FFFFFF");
	r.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
	preencher(r.getCell(1), CORES.titulo);
	const s = ws.addRow([sub]);
	ws.mergeCells(s.number, 1, s.number, colunas);
	s.getCell(1).font = fonte(false, 9.5, "78909C", true);
	s.getCell(1).alignment = { indent: 1 };
	ws.addRow([]);
}

/** Bloco de números grandes: rótulos em cima, valores embaixo. */
function destaques(ws: ExcelJS.Worksheet, itens: { rotulo: string; valor: number; cor?: string }[]) {
	const r1 = ws.addRow(itens.map((i) => i.rotulo));
	const r2 = ws.addRow(itens.map((i) => i.valor));
	itens.forEach((i, k) => {
		const c1 = r1.getCell(k + 1);
		c1.font = fonte(true, 9, "607D8B");
		c1.alignment = { horizontal: "left", indent: 1 };
		preencher(c1, "F5F7F8");
		const c2 = r2.getCell(k + 1);
		c2.font = fonte(true, 14, i.cor || "263238");
		c2.numFmt = FMT_MOEDA;
		c2.alignment = { horizontal: "left", indent: 1 };
		preencher(c2, "F5F7F8");
	});
	r2.height = 26;
	ws.addRow([]);
}

function cabecalhoTabela(ws: ExcelJS.Worksheet, colunas: string[]) {
	const r = ws.addRow(colunas);
	r.height = 22;
	r.eachCell((c, n) => {
		c.font = fonte(true, 10, "FFFFFF");
		preencher(c, CORES.cabecalho);
		c.alignment = { vertical: "middle", horizontal: n === 1 ? "left" : "center", indent: n === 1 ? 1 : 0 };
	});
	return r;
}

function linhaMes(ws: ExcelJS.Worksheet, valores: ExcelJS.CellValue[], moedas: number[], cor: { texto: string; fundo: string }) {
	const r = ws.addRow(valores);
	r.height = 22;
	r.eachCell({ includeEmpty: true }, (c, n) => {
		c.font = fonte(true, 10.5, n === valores.length ? cor.texto : "263238");
		preencher(c, cor.fundo);
		c.border = { top: { style: "thin", color: { argb: "B0BEC5" } } };
		c.alignment = { vertical: "middle", horizontal: moedas.includes(n) ? "right" : n === 1 ? "left" : "center", indent: n === 1 ? 1 : 0 };
		if (moedas.includes(n)) c.numFmt = FMT_MOEDA;
	});
	return r;
}

function linhaItem(ws: ExcelJS.Worksheet, valores: ExcelJS.CellValue[], moedas: number[], apagado = false) {
	const r = ws.addRow(valores);
	r.outlineLevel = 1; // dá para recolher os itens no Excel (+/−)
	r.eachCell({ includeEmpty: true }, (c, n) => {
		c.font = { ...fonte(false, 10, apagado ? "9E9E9E" : "37474F"), strike: apagado && n === 1 };
		c.alignment = { vertical: "middle", horizontal: moedas.includes(n) ? "right" : n === 1 ? "left" : "center", indent: n === 1 ? 3 : 0 };
		if (moedas.includes(n)) c.numFmt = FMT_MOEDA;
	});
	return r;
}

function linhaTotal(ws: ExcelJS.Worksheet, valores: ExcelJS.CellValue[], moedas: number[]) {
	ws.addRow([]);
	const r = ws.addRow(valores);
	r.height = 24;
	r.eachCell({ includeEmpty: true }, (c, n) => {
		c.font = fonte(true, 11, "FFFFFF");
		preencher(c, CORES.titulo);
		c.alignment = { vertical: "middle", horizontal: moedas.includes(n) ? "right" : n === 1 ? "left" : "center", indent: n === 1 ? 1 : 0 };
		if (moedas.includes(n)) c.numFmt = FMT_MOEDA;
	});
}

function nota(ws: ExcelJS.Worksheet, texto: string, colunas: number) {
	const r = ws.addRow([texto]);
	ws.mergeCells(r.number, 1, r.number, colunas);
	r.getCell(1).font = fonte(false, 9, "78909C", true);
	r.getCell(1).alignment = { indent: 1, wrapText: true };
}

// ============================================================================
// Abas por mês
// ============================================================================
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const nomeAba = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const nomeMesLongo = (ym: string) => `${MESES_LONGOS[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;

const porMes = <T extends { data: string }>(itens: T[]) => {
	const mapa = new Map<string, T[]>();
	for (const i of [...itens].sort((a, b) => a.data.localeCompare(b.data))) {
		const ym = i.data.slice(0, 7);
		mapa.set(ym, [...(mapa.get(ym) || []), i]);
	}
	return [...mapa.entries()];
};

/** Célula com link para outra aba */
const linkAba = (texto: string, aba: string): ExcelJS.CellValue => ({ text: texto, hyperlink: `#'${aba}'!A1` });

function voltarAoResumo(ws: ExcelJS.Worksheet, colunas: number) {
	const r = ws.addRow([linkAba("← Voltar ao resumo", "Resumo")]);
	ws.mergeCells(r.number, 1, r.number, colunas);
	r.getCell(1).font = { ...fonte(true, 9.5, CORES.resultado.texto), underline: true };
	r.getCell(1).alignment = { indent: 1 };
}

// ============================================================================
// PESSOA
// ============================================================================
const AMARELO = { fundo: "FFF4CC", texto: "7A5A00" }; // linhas de itens opcionais

/** Pinta de amarelo a linha de um item opcional. */
function pintarOpcional(r: ExcelJS.Row, colunas: number) {
	for (let n = 1; n <= colunas; n++) preencher(r.getCell(n), AMARELO.fundo);
}

function legendaOpcional(ws: ExcelJS.Worksheet, colunas: number) {
	const r = ws.addRow(["Linhas em amarelo = itens OPCIONAIS (a pessoa pode recusar)"]);
	ws.mergeCells(r.number, 1, r.number, colunas);
	preencher(r.getCell(1), AMARELO.fundo);
	r.getCell(1).font = fonte(true, 9.5, AMARELO.texto);
	r.getCell(1).alignment = { indent: 1 };
}

/** Itens obrigatórios primeiro, depois os opcionais; dentro de cada parte, por data e nome */
const ordenarItens = <T extends { opcional: boolean; data: string; compra: string }>(lista: T[]) =>
	[...lista].sort((a, b) => Number(a.opcional) - Number(b.opcional) || a.data.localeCompare(b.data) || a.compra.localeCompare(b.compra));

export async function exportarExcelPessoa(params: { nome: string; itens: any[]; itensPagar?: any[] }) {
	const { nome } = params;
	const primeiro = nome.split(" ")[0];
	const hoje = hojeISO();
	// Dois sentidos: o que a pessoa te deve (itens) e o que você deve a ela (itensPagar)
	type ItemP = Item & { receber: boolean; compensado: boolean };
	const marcar = (i: Item, receber: boolean): ItemP => ({
		...i,
		receber,
		compensado: Array.isArray(i.meta?.pagamentos) && i.meta.pagamentos.some((p: any) => p.tipo === "compensacao"),
	});
	const itens: ItemP[] = [
		...params.itens.map((i) => marcar(normalizar(i, [nome]), true)),
		...(params.itensPagar || []).map((c) => {
			const raw = { ...c, valor: c.valor ?? c.valor_parcela_usuario, terceiro_pago: Boolean(c.quitado) };
			return marcar(normalizar(raw, [nome]), false);
		}),
	];
	const valorConta = (i: ItemP) => (i.recusado ? i.pago : i.valor); // recusado não conta
	const soma = (lista: ItemP[], f: (i: ItemP) => number) => centavos(lista.reduce((s, i) => s + f(i), 0));
	const teDeve = (lista: ItemP[]) => soma(lista, (i) => (i.receber ? i.aberto : 0));
	const voceDeve = (lista: ItemP[]) => soma(lista, (i) => (i.receber ? 0 : i.aberto));
	const temOpcional = itens.some((i) => i.receber && i.opcional);
	const saldoTexto = (v: number) => (v > 0.009 ? `${primeiro} te deve ${moeda(v)}` : v < -0.009 ? `você deve ${moeda(-v)}` : "tudo acertado");
	const meses = porMes(itens);

	const wb = new ExcelJS.Workbook();
	wb.creator = "Tech Finance";

	// --- RESUMO
	const resumo = wb.addWorksheet("Resumo");
	resumo.columns = [{ width: 26 }, { width: 18 }, { width: 18 }, { width: 26 }, { width: 22 }];
	tituloPlanilha(resumo, `Divisão de contas com ${nome}`, `Gerado em ${new Date().toLocaleString("pt-BR")}`, 5);
	const saldo = centavos(teDeve(itens) - voceDeve(itens));
	destaques(resumo, [
		{ rotulo: `${primeiro.toUpperCase()} TE DEVE`, valor: teDeve(itens), cor: CORES.receita.texto },
		{ rotulo: "VOCÊ DEVE", valor: voceDeve(itens), cor: CORES.despesa.texto },
		{ rotulo: saldo >= 0 ? `SALDO · ${primeiro.toUpperCase()} TE DEVE` : "SALDO · VOCÊ DEVE", valor: Math.abs(saldo), cor: saldo >= 0 ? CORES.receita.texto : CORES.despesa.texto },
		...(temOpcional ? [{ rotulo: "TE DEVE · SÓ OBRIGATÓRIOS", valor: soma(itens, (i) => (i.receber && !i.opcional ? i.aberto : 0)) }] : []),
	]);
	cabecalhoTabela(resumo, ["Mês (clique para abrir)", `${primeiro} te deve`, "Você deve", "Saldo do mês", "Situação"]);
	for (const [ym, lista] of meses) {
		const s = situacaoMes(lista, hoje);
		const saldoMes = centavos(teDeve(lista) - voceDeve(lista));
		const r = linhaMes(
			resumo,
			[linkAba(nomeMesLongo(ym), nomeAba(ym)), teDeve(lista), voceDeve(lista), saldoTexto(saldoMes), s.texto],
			[2, 3],
			s.cor,
		);
		r.getCell(1).font = { ...fonte(true, 10.5, CORES.resultado.texto), underline: true };
		r.getCell(2).font = fonte(true, 10.5, CORES.receita.texto);
		r.getCell(3).font = fonte(true, 10.5, CORES.despesa.texto);
	}
	linhaTotal(resumo, ["TOTAL EM ABERTO", teDeve(itens), voceDeve(itens), saldoTexto(saldo), ""], [2, 3]);
	resumo.addRow([]);
	const recusado = soma(itens, (i) => (i.recusado ? i.valor - i.pago : 0));
	const abatido = soma(itens, (i) => (i.compensado ? i.pago : 0)) / 2;
	nota(
		resumo,
		[
			"Cada mês tem a sua aba com os itens. Valores em aberto: o que já foi pago não entra.",
			abatido > 0 ? `${moeda(abatido)} foram abatidos entre vocês (o que um devia descontou do que o outro devia).` : "",
			temOpcional ? `"Opcional": ${primeiro} pode recusar.` : "",
			recusado > 0 ? `Recusado: ${moeda(recusado)} (não entra nos totais).` : "",
		]
			.filter(Boolean)
			.join(" "),
		5,
	);

	// --- UMA ABA POR MÊS
	for (const [ym, lista] of meses) {
		const ws = wb.addWorksheet(nomeAba(ym));
		ws.columns = [{ width: 13 }, { width: 48 }, { width: 9 }, { width: 18 }, { width: 15 }, { width: 28 }];
		tituloPlanilha(ws, `${nomeMesLongo(ym)} — ${nome}`, `${lista.length} ${lista.length === 1 ? "item" : "itens"}`, 6);
		voltarAoResumo(ws, 6);
		ws.addRow([]);
		const saldoMes = centavos(teDeve(lista) - voceDeve(lista));
		destaques(ws, [
			{ rotulo: `${primeiro.toUpperCase()} TE DEVE`, valor: teDeve(lista), cor: CORES.receita.texto },
			{ rotulo: "VOCÊ DEVE", valor: voceDeve(lista), cor: CORES.despesa.texto },
			{ rotulo: saldoMes >= 0 ? "SALDO DO MÊS · TE DEVEM" : "SALDO DO MÊS · VOCÊ DEVE", valor: Math.abs(saldoMes) },
		]);
		if (lista.some((i) => i.opcional)) legendaOpcional(ws, 6);
		cabecalhoTabela(ws, ["Vencimento", "Item", "Parcela", "Quem deve", "Valor", "Situação"]);
		const ordenados = [...lista].sort((a, b) => Number(b.receber) - Number(a.receber) || Number(a.opcional) - Number(b.opcional) || a.data.localeCompare(b.data) || a.compra.localeCompare(b.compra));
		for (const i of ordenados) {
			const situacao = [
				i.recusado
					? "recusado"
					: i.quitado
						? i.compensado ? "abatido" : "pago"
						: i.pago > 0
							? `${i.compensado ? "abatido" : "pago"} ${moeda(i.pago)} · falta ${moeda(i.aberto)}`
							: i.data <= hoje ? "vencido" : "a vencer",
				i.opcional ? "opcional" : "",
			]
				.filter(Boolean)
				.join(" · ");
			const r = linhaItem(ws, [dataBR(i.data), i.compra, i.parcela, i.receber ? `${primeiro} te deve` : "você deve", valorConta(i), situacao], [5], false);
			r.outlineLevel = 0;
			r.getCell(1).alignment = { horizontal: "left", indent: 1 };
			r.getCell(2).alignment = { horizontal: "left" };
			r.getCell(2).font = { ...fonte(false, 10, i.recusado ? "9E9E9E" : i.opcional ? AMARELO.texto : "37474F"), strike: i.recusado };
			r.getCell(4).font = fonte(true, 10, i.receber ? CORES.receita.texto : CORES.despesa.texto);
			r.getCell(5).font = fonte(true, 10, i.receber ? CORES.receita.texto : CORES.despesa.texto);
			if (i.opcional) pintarOpcional(r, 6);
			if (!i.quitado && !i.recusado && i.data <= hoje) r.getCell(6).font = fonte(true, 10, CORES.despesa.texto);
		}
		linhaTotal(ws, ["EM ABERTO NO MÊS", "", "", saldoTexto(saldoMes), Math.abs(saldoMes), ""], [5]);
		ws.views = [{ state: "frozen", ySplit: lista.some((i) => i.opcional) ? 10 : 9 }];
	}

	await baixar(wb, `divisao_${slug(nome)}_${hoje}.xlsx`);
}

// ============================================================================
// GRUPO
// ============================================================================
export async function exportarExcelGrupo(params: {
	grupo: { nome: string; membros?: { id: string; nome: string; is_user?: boolean }[] };
	despesas: any[];
	balancos?: { membroId?: string; nome: string; totalPago: number; totalDevido: number; saldoLiquido: number }[];
	acertos?: { devedorNome: string; credorNome: string; valor: number }[];
}) {
	const { grupo, balancos = [], acertos = [] } = params;
	const membros = grupo.membros || [];
	const curto = (m?: { nome: string; is_user?: boolean }) => (m ? (m.is_user ? "Você" : m.nome.split(" ")[0]) : "");
	const hoje = hojeISO();

	const despesas = params.despesas.map((d) => {
		const n = normalizar(d, membros.map((m) => m.nome));
		const total = Number(n.meta.valor_total ?? d.valor) || 0;
		const partes = membros.map((m) => {
			const p = (n.meta.participantes || []).find((x: any) => x.id === m.id || (x.is_user && m.is_user));
			return Number(p?.valor_devido) || 0;
		});
		const pagador = membros.find((m) => m.id === n.meta.pago_por_id) || (n.meta.voce_pagou ? membros.find((m) => m.is_user) : undefined);
		return { ...n, total, partes, pagoPor: pagador ? curto(pagador) : n.meta.pago_por_nome || "" };
	});
	type D = (typeof despesas)[number];
	const soma = (lista: D[], f: (d: D) => number) => centavos(lista.reduce((s, d) => s + f(d), 0));
	const comOpc = (lista: D[]) => soma(lista, (d) => d.total);
	const soObrig = (lista: D[]) => soma(lista, (d) => (d.opcional ? 0 : d.total));
	const meses = porMes(despesas);

	const wb = new ExcelJS.Workbook();
	wb.creator = "Tech Finance";

	// --- RESUMO
	const colsResumo = 4 + membros.length;
	const resumo = wb.addWorksheet("Resumo");
	resumo.columns = [{ width: 26 }, { width: 16 }, { width: 16 }, ...membros.map(() => ({ width: 16 })), { width: 26 }];
	tituloPlanilha(resumo, `Grupo ${grupo.nome}`, `${membros.map((m) => (m.is_user ? `${m.nome} (você)` : m.nome)).join(", ")} · gerado em ${new Date().toLocaleString("pt-BR")}`, colsResumo);
	destaques(resumo, [
		{ rotulo: "TOTAL COM OPCIONAIS", valor: comOpc(despesas) },
		{ rotulo: "SÓ OBRIGATÓRIOS", valor: soObrig(despesas) },
		...membros.map((m, k) => ({ rotulo: `PARTE ${curto(m).toUpperCase()}`, valor: soma(despesas, (d) => d.partes[k]) })),
		{ rotulo: "FALTA ACERTAR", valor: soma(despesas, (d) => d.aberto), cor: CORES.despesa.texto },
	]);
	const frases = acertos.length
		? acertos.map((a) => {
				const de = membros.find((m) => m.nome === a.devedorNome);
				const para = membros.find((m) => m.nome === a.credorNome);
				return `${de?.is_user ? "Você paga" : `${a.devedorNome.split(" ")[0]} paga`} ${moeda(a.valor)} para ${para?.is_user ? "você" : a.credorNome.split(" ")[0]}`;
			})
		: ["Tudo acertado neste grupo."];
	for (const f of frases) {
		const r = resumo.addRow([f]);
		resumo.mergeCells(r.number, 1, r.number, colsResumo);
		r.getCell(1).font = fonte(true, 11.5, CORES.resultado.texto);
		r.getCell(1).alignment = { indent: 1 };
	}
	if (balancos.length) {
		nota(
			resumo,
			balancos
				.map((b) => {
					const m = membros.find((x) => x.id === b.membroId) || membros.find((x) => x.nome === b.nome);
					return `${curto(m) || b.nome}: pagou ${moeda(b.totalPago)}, parte ${moeda(b.totalDevido)}`;
				})
				.join("   ·   "),
			colsResumo,
		);
	}
	resumo.addRow([]);
	const moedasResumo = [2, 3, ...membros.map((_, k) => 4 + k)];
	cabecalhoTabela(resumo, ["Mês (clique para abrir)", "Com opcionais", "Só obrigatórios", ...membros.map((m) => `Parte ${curto(m)}`), "Situação"]);
	for (const [ym, lista] of meses) {
		const s = situacaoMes(lista, hoje);
		const r = linhaMes(
			resumo,
			[linkAba(nomeMesLongo(ym), nomeAba(ym)), comOpc(lista), soObrig(lista), ...membros.map((_, k) => soma(lista, (d) => d.partes[k])), s.texto],
			moedasResumo,
			s.cor,
		);
		r.getCell(1).font = { ...fonte(true, 10.5, CORES.resultado.texto), underline: true };
	}
	linhaTotal(
		resumo,
		["TOTAL", comOpc(despesas), soObrig(despesas), ...membros.map((_, k) => soma(despesas, (d) => d.partes[k])), `falta ${moeda(soma(despesas, (d) => d.aberto))}`],
		moedasResumo,
	);

	// --- UMA ABA POR MÊS
	const colsMes = 5 + membros.length;
	const moedasMes = [4, ...membros.map((_, k) => 5 + k)];
	for (const [ym, lista] of meses) {
		const ws = wb.addWorksheet(nomeAba(ym));
		ws.columns = [{ width: 13 }, { width: 46 }, { width: 10 }, { width: 15 }, ...membros.map(() => ({ width: 15 })), { width: 28 }];
		tituloPlanilha(ws, `${nomeMesLongo(ym)} — grupo ${grupo.nome}`, `${lista.length} ${lista.length === 1 ? "item" : "itens"}`, colsMes);
		voltarAoResumo(ws, colsMes);
		ws.addRow([]);
		destaques(ws, [
			{ rotulo: "COM OPCIONAIS", valor: comOpc(lista) },
			{ rotulo: "SÓ OBRIGATÓRIOS", valor: soObrig(lista) },
			...membros.map((m, k) => ({ rotulo: `PARTE ${curto(m).toUpperCase()}`, valor: soma(lista, (d) => d.partes[k]) })),
			{ rotulo: "FALTA ACERTAR", valor: soma(lista, (d) => d.aberto), cor: CORES.despesa.texto },
		]);
		if (lista.some((d) => d.opcional)) legendaOpcional(ws, colsMes);
		cabecalhoTabela(ws, ["Vencimento", "Item", "Parcela", "Total", ...membros.map((m) => `Parte ${curto(m)}`), "Situação"]);
		for (const d of ordenarItens(lista)) {
			const situacao = [
				d.recusado ? "recusado" : d.quitado ? "acertado" : d.data <= hoje ? "vencido" : "a vencer",
				d.opcional ? "opcional" : "",
				d.pagoPor ? `pago por ${d.pagoPor === "Você" ? "você" : d.pagoPor}` : "",
			]
				.filter(Boolean)
				.join(" · ");
			const r = linhaItem(ws, [dataBR(d.data), d.compra, d.parcela, d.total, ...d.partes, situacao], moedasMes, false);
			r.outlineLevel = 0;
			r.getCell(1).alignment = { horizontal: "left", indent: 1 };
			r.getCell(2).alignment = { horizontal: "left" };
			r.getCell(2).font = { ...fonte(false, 10, d.recusado ? "9E9E9E" : d.opcional ? AMARELO.texto : "37474F"), strike: d.recusado };
			if (d.opcional) pintarOpcional(r, colsMes);
		}
		linhaTotal(
			ws,
			["TOTAL COM OPCIONAIS", "", "", comOpc(lista), ...membros.map((_, k) => soma(lista, (d) => d.partes[k])), `falta ${moeda(soma(lista, (d) => d.aberto))}`],
			moedasMes,
		);
		if (lista.some((d) => d.opcional)) {
			const r = ws.addRow([
				"TOTAL SÓ OBRIGATÓRIOS",
				"",
				"",
				soObrig(lista),
				...membros.map((_, k) => soma(lista, (d) => (d.opcional ? 0 : d.partes[k]))),
				`falta ${moeda(soma(lista, (d) => (d.opcional ? 0 : d.aberto)))}`,
			]);
			r.height = 22;
			r.eachCell({ includeEmpty: true }, (c, n) => {
				c.font = fonte(true, 10.5, "263238");
				preencher(c, "E0E0E0");
				c.alignment = { vertical: "middle", horizontal: moedasMes.includes(n) ? "right" : n === 1 ? "left" : "center", indent: n === 1 ? 1 : 0 };
				if (moedasMes.includes(n)) c.numFmt = FMT_MOEDA;
			});
		}
		ws.views = [{ state: "frozen", ySplit: lista.some((d) => d.opcional) ? 10 : 9 }];
	}

	await baixar(wb, `grupo_${slug(grupo.nome)}_${hoje}.xlsx`);
}
