import ExcelJS from "exceljs";
import { CORES, FMT_DATA, FMT_MOEDA, cabecalho, dataExcel, linha, secao, titulo } from "./relatorioExcel";

/**
 * Planilhas da divisão de contas (por pessoa e por grupo).
 * Só lê os dados já carregados na tela. Uma compra parcelada aparece:
 *   - por mês (quanto vence em cada data),
 *   - por compra (uma linha por item comprado),
 *   - e em detalhe (cada parcela).
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

const hojeISO = () => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const centavos = (v: number) => Math.round(v * 100) / 100;
const letra = (n: number) => {
	let s = "";
	while (n > 0) {
		const r = (n - 1) % 26;
		s = String.fromCharCode(65 + r) + s;
		n = Math.floor((n - 1) / 26);
	}
	return s;
};

/** "Projetor HY300 (2/6) (Parte Julia) [69]" -> "Projetor HY300" */
const limparDescricao = (texto: string, nomes: string[] = []) => {
	let t = String(texto || "");
	t = t.replace(/\s*\[[^\]]*\]\s*$/, "");
	t = t.replace(/\s*\(Parte [^)]*\)\s*$/i, "");
	for (const n of nomes) if (n) t = t.replace(new RegExp(`\\s*-\\s*${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "");
	t = t.replace(/\s*\(\d+\/\d+\)\s*$/, "");
	return t.trim();
};

interface ItemNormalizado {
	data: string;
	compra: string;
	parcela: number;
	totalParcelas: number;
	valor: number;
	pago: number;
	aberto: number;
	opcional: boolean;
	recusado: boolean;
	situacao: string;
	dataCompra: string | null;
	valorCompra: number | null;
	grupo: string;
	meta: any;
	original: any;
}

function normalizar(i: any, nomes: string[]): ItemNormalizado {
	const meta = lerMeta(i.observacao);
	const valor = Number(i.valor) || 0;
	const pago = i.terceiro_pago ? valor : Math.min(valor, Number(meta.valor_pago) || 0);
	const recusado = meta.resposta_cobranca === "recusada";
	const aberto = i.terceiro_pago || recusado ? 0 : centavos(Math.max(0, valor - pago));
	const parcelaTexto = String(i.descricao || "").match(/\((\d+)\/(\d+)\)/);
	const parcela = Number(meta.parcela) || (parcelaTexto ? Number(parcelaTexto[1]) : 1);
	const totalParcelas = Number(meta.total_parcelas) || (parcelaTexto ? Number(parcelaTexto[2]) : 1);
	const situacao = i.terceiro_pago
		? "Quitado"
		: recusado
			? "Recusado"
			: pago > 0
				? "Parcial"
				: i.data <= hojeISO()
					? "Vencido"
					: "A vencer";
	return {
		data: i.data,
		compra: limparDescricao(meta.descricao_original || i.descricao, nomes),
		parcela,
		totalParcelas,
		valor,
		pago,
		aberto,
		opcional: Boolean(meta.opcional),
		recusado,
		situacao,
		dataCompra: meta.data_compra || null,
		valorCompra: Number(meta.valor_compra) || null,
		grupo: meta.grupo_nome || "",
		meta,
		original: i,
	};
}

const agrupar = <T>(lista: T[], chave: (x: T) => string) => {
	const mapa = new Map<string, T[]>();
	for (const x of lista) mapa.set(chave(x), [...(mapa.get(chave(x)) || []), x]);
	return mapa;
};

const corSituacao = (s: string) =>
	s === "Quitado" ? CORES.receita.texto : s === "Vencido" || s === "Recusado" ? CORES.despesa.texto : undefined;

/** Linha "Total" com SOMA nas colunas indicadas. */
function linhaTotal(aba: ExcelJS.Worksheet, colunas: number, somar: number[], inicio: number, fim: number, cor = CORES.resultado.total) {
	const tot = linha(aba, ["Total", ...Array(colunas - 1).fill(null)], {}, { negrito: true, fundo: cor });
	for (const c of somar) {
		tot.getCell(c).value = fim >= inicio ? { formula: `SUM(${letra(c)}${inicio}:${letra(c)}${fim})` } : 0;
		tot.getCell(c).numFmt = FMT_MOEDA;
		tot.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
	}
}

function chaveValor(aba: ExcelJS.Worksheet, rotulo: string, valor: number | string, destaque?: string) {
	const r = linha(aba, [rotulo, valor], typeof valor === "number" ? { 2: FMT_MOEDA } : {}, { corTexto: destaque });
	r.getCell(1).font = { ...r.getCell(1).font, bold: true };
	return r;
}

// ============================================================================
// PESSOA
// ============================================================================
export async function exportarExcelPessoa(params: { nome: string; itens: any[] }) {
	const { nome, itens: brutos } = params;
	const itens = brutos.map((i) => normalizar(i, [nome])).sort((a, b) => a.data.localeCompare(b.data) || a.compra.localeCompare(b.compra));
	const primeiro = nome.split(" ")[0];
	const wb = new ExcelJS.Workbook();
	wb.creator = "Tech Finance";
	const hoje = hojeISO();

	// --- Resumo
	const resumo = wb.addWorksheet("Resumo");
	resumo.columns = [{ width: 34 }, { width: 20 }, { width: 14 }, { width: 18 }];
	titulo(resumo, `DIVISÃO DE CONTAS COM ${nome.toUpperCase()}`, 4, `Gerado em ${new Date().toLocaleString("pt-BR")}`);
	const soma = (f: (i: ItemNormalizado) => number) => centavos(itens.reduce((s, i) => s + f(i), 0));
	secao(resumo, "SITUAÇÃO", 4, CORES.resultado);
	chaveValor(resumo, "Total lançado", soma((i) => i.valor));
	chaveValor(resumo, "Já recebido", soma((i) => i.pago), CORES.receita.texto);
	chaveValor(resumo, `Em aberto (${primeiro} te deve)`, soma((i) => i.aberto), CORES.resultado.texto);
	chaveValor(resumo, "   vencido até hoje", soma((i) => (i.data <= hoje ? i.aberto : 0)), CORES.despesa.texto);
	chaveValor(resumo, "   desse total, opcional", soma((i) => (i.opcional ? i.aberto : 0)));
	chaveValor(resumo, "Recusado (não cobra mais)", soma((i) => (i.recusado ? i.valor - i.pago : 0)));
	chaveValor(resumo, "Compras", String(new Set(itens.map((i) => i.compra)).size));

	resumo.addRow([]);
	secao(resumo, "PRÓXIMOS VENCIMENTOS", 4, CORES.receita);
	cabecalho(resumo, ["Vencimento", "Em aberto", "Itens", "Situação"]);
	const proximos = [...agrupar(itens.filter((i) => i.aberto > 0), (i) => i.data).entries()].slice(0, 12);
	if (proximos.length === 0) linha(resumo, ["Nada em aberto", "", "", ""]);
	for (const [data, lista] of proximos) {
		const vencido = data <= hoje;
		linha(resumo, [dataExcel(data), centavos(lista.reduce((s, i) => s + i.aberto, 0)), lista.length, vencido ? "Vencido" : "A vencer"], { 1: FMT_DATA, 2: FMT_MOEDA }, { corTexto: vencido ? CORES.despesa.texto : undefined });
	}

	// --- Por mês
	const mes = wb.addWorksheet("Por mês", { views: [{ state: "frozen", ySplit: 1 }] });
	mes.columns = [{ width: 13 }, { width: 8 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 13 }];
	cabecalho(mes, ["Vencimento", "Itens", "Valor", "Recebido", "Em aberto", "Opcional", "Situação"]);
	let inicio = mes.rowCount + 1;
	for (const [data, lista] of agrupar(itens, (i) => i.data)) {
		const aberto = lista.reduce((s, i) => s + i.aberto, 0);
		const pago = lista.reduce((s, i) => s + i.pago, 0);
		const situacao = aberto <= 0 ? (lista.every((i) => i.recusado) ? "Recusado" : "Quitado") : pago > 0 ? "Parcial" : data <= hoje ? "Vencido" : "A vencer";
		linha(
			mes,
			[dataExcel(data), lista.length, centavos(lista.reduce((s, i) => s + i.valor, 0)), centavos(pago), centavos(aberto), centavos(lista.filter((i) => i.opcional).reduce((s, i) => s + i.aberto, 0)), situacao],
			{ 1: FMT_DATA, 3: FMT_MOEDA, 4: FMT_MOEDA, 5: FMT_MOEDA, 6: FMT_MOEDA },
			{ corTexto: corSituacao(situacao) },
		);
	}
	linhaTotal(mes, 7, [3, 4, 5, 6], inicio, mes.rowCount, CORES.receita.total);

	// --- Compras (uma linha por item comprado)
	const compras = wb.addWorksheet("Compras", { views: [{ state: "frozen", ySplit: 1 }] });
	compras.columns = [{ width: 46 }, { width: 13 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 15 }, { width: 15 }, { width: 10 }, { width: 14 }];
	cabecalho(compras, ["Compra", "Data da compra", "Parcelas", "Valor da compra", `Parte de ${primeiro}`, "Recebido", "Em aberto", "Opcional", "Grupo"]);
	inicio = compras.rowCount + 1;
	for (const [compra, lista] of agrupar(itens, (i) => `${i.compra}|${i.dataCompra || ""}`)) {
		const p = lista[0];
		linha(
			compras,
			[
				compra.split("|")[0],
				p.dataCompra ? dataExcel(p.dataCompra) : dataExcel(p.data),
				p.totalParcelas > 1 ? `${p.totalParcelas}x` : "à vista",
				p.valorCompra,
				centavos(lista.reduce((s, i) => s + i.valor, 0)),
				centavos(lista.reduce((s, i) => s + i.pago, 0)),
				centavos(lista.reduce((s, i) => s + i.aberto, 0)),
				p.opcional ? (lista.some((i) => i.recusado) ? "Recusado" : "Sim") : "",
				p.grupo,
			],
			{ 2: FMT_DATA, 4: FMT_MOEDA, 5: FMT_MOEDA, 6: FMT_MOEDA, 7: FMT_MOEDA },
		);
	}
	linhaTotal(compras, 9, [5, 6, 7], inicio, compras.rowCount, CORES.receita.total);
	compras.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };

	// --- Parcelas (detalhe)
	const det = wb.addWorksheet("Parcelas", { views: [{ state: "frozen", ySplit: 1 }] });
	det.columns = [{ width: 13 }, { width: 46 }, { width: 9 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 12 }];
	cabecalho(det, ["Vencimento", "Compra", "Parcela", "Valor", "Recebido", "Em aberto", "Opcional", "Situação"]);
	inicio = det.rowCount + 1;
	for (const i of itens) {
		linha(
			det,
			[dataExcel(i.data), i.compra, i.totalParcelas > 1 ? `${i.parcela}/${i.totalParcelas}` : "única", i.valor, i.pago, i.aberto, i.opcional ? "Sim" : "", i.situacao],
			{ 1: FMT_DATA, 4: FMT_MOEDA, 5: FMT_MOEDA, 6: FMT_MOEDA },
			{ corTexto: corSituacao(i.situacao) },
		);
	}
	linhaTotal(det, 8, [4, 5, 6], inicio, det.rowCount, CORES.receita.total);
	det.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };

	// --- Recebimentos (o que já foi pago)
	const rec = wb.addWorksheet("Recebimentos");
	rec.columns = [{ width: 13 }, { width: 16 }, { width: 14 }];
	cabecalho(rec, ["Data", "Valor", "Itens abatidos"]);
	const recebimentos = new Map<string, { data: string; valor: number; itens: number }>();
	for (const i of itens) {
		const pagamentos: any[] = Array.isArray(i.meta.pagamentos) ? i.meta.pagamentos : i.original.terceiro_pago ? [{ data: i.meta.data_pagamento || i.data, valor: i.valor }] : [];
		for (const p of pagamentos) {
			const chave = p.recebimento_id || `${p.data}|${i.original.id}`;
			const atual = recebimentos.get(chave) || { data: p.data, valor: 0, itens: 0 };
			atual.valor = centavos(atual.valor + (Number(p.valor) || 0));
			atual.itens += 1;
			recebimentos.set(chave, atual);
		}
	}
	inicio = rec.rowCount + 1;
	const listaRec = [...recebimentos.values()].sort((a, b) => String(a.data).localeCompare(String(b.data)));
	if (listaRec.length === 0) linha(rec, ["Nenhum pagamento registrado", "", ""]);
	for (const r of listaRec) linha(rec, [r.data ? dataExcel(r.data) : "", r.valor, r.itens], { 1: FMT_DATA, 2: FMT_MOEDA });
	if (listaRec.length) linhaTotal(rec, 3, [2], inicio, rec.rowCount, CORES.receita.total);

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
	const nomeMembro = (m?: { nome: string; is_user?: boolean }) => (m ? (m.is_user ? `${m.nome} (você)` : m.nome) : "");
	const nomes = membros.map((m) => m.nome);
	const hoje = hojeISO();

	const despesas = params.despesas
		.map((d) => {
			const n = normalizar(d, nomes);
			const pagador = membros.find((m) => m.id === n.meta.pago_por_id);
			const total = Number(n.meta.valor_total ?? d.valor) || 0;
			const partes = membros.map((m) => {
				const p = (n.meta.participantes || []).find((x: any) => x.id === m.id || (x.is_user && m.is_user));
				return Number(p?.valor_devido) || 0;
			});
			const pagoPor = pagador ? nomeMembro(pagador) : n.meta.voce_pagou ? nomeMembro(membros.find((m) => m.is_user)) : n.meta.pago_por_nome || "";
			return { ...n, total, partes, pagoPor };
		})
		.sort((a, b) => a.data.localeCompare(b.data) || a.compra.localeCompare(b.compra));

	const wb = new ExcelJS.Workbook();
	wb.creator = "Tech Finance";
	const colsMembros = membros.map((m) => `Parte ${nomeMembro(m)}`);

	// --- Resumo
	const resumo = wb.addWorksheet("Resumo");
	resumo.columns = [{ width: 32 }, { width: 18 }, { width: 18 }, { width: 22 }];
	titulo(resumo, `GRUPO ${grupo.nome.toUpperCase()}`, 4, `${membros.map(nomeMembro).join(", ")} · gerado em ${new Date().toLocaleString("pt-BR")}`);
	secao(resumo, "VISÃO GERAL", 4, CORES.resultado);
	chaveValor(resumo, "Total gasto no grupo", centavos(despesas.reduce((s, d) => s + d.total, 0)));
	chaveValor(resumo, "Compras", String(new Set(despesas.map((d) => d.compra)).size));
	chaveValor(resumo, "Vencimentos", String(new Set(despesas.map((d) => d.data)).size));
	chaveValor(resumo, "Em aberto (ainda não acertado)", centavos(despesas.reduce((s, d) => s + d.aberto, 0)), CORES.despesa.texto);

	resumo.addRow([]);
	secao(resumo, "BALANÇO DOS MEMBROS", 4, CORES.resultado);
	cabecalho(resumo, ["Membro", "Pagou", "Parte dele(a)", "Situação"]);
	for (const b of balancos) {
		const m = membros.find((x) => x.id === b.membroId) || membros.find((x) => x.nome === b.nome);
		const situacao = b.saldoLiquido > 0.01 ? `recebe ${b.saldoLiquido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : b.saldoLiquido < -0.01 ? `deve ${Math.abs(b.saldoLiquido).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : "em dia";
		linha(resumo, [nomeMembro(m) || b.nome, b.totalPago, b.totalDevido, situacao], { 2: FMT_MOEDA, 3: FMT_MOEDA }, { corTexto: b.saldoLiquido < -0.01 ? CORES.despesa.texto : b.saldoLiquido > 0.01 ? CORES.receita.texto : undefined });
	}
	resumo.addRow([]);
	secao(resumo, "QUEM PAGA QUEM", 4, CORES.receita);
	cabecalho(resumo, ["Quem paga", "Para quem", "Valor", ""]);
	if (acertos.length === 0) linha(resumo, ["Tudo acertado", "", "", ""]);
	for (const a of acertos) linha(resumo, [a.devedorNome, a.credorNome, a.valor, ""], { 3: FMT_MOEDA });

	// --- Por mês
	const mes = wb.addWorksheet("Por mês", { views: [{ state: "frozen", ySplit: 1 }] });
	mes.columns = [{ width: 13 }, { width: 8 }, { width: 15 }, ...membros.map(() => ({ width: 18 })), { width: 15 }, { width: 12 }];
	cabecalho(mes, ["Vencimento", "Itens", "Total", ...colsMembros, "Em aberto", "Situação"]);
	let inicio = mes.rowCount + 1;
	for (const [data, lista] of agrupar(despesas, (d) => d.data)) {
		const aberto = lista.reduce((s, d) => s + d.aberto, 0);
		const situacao = aberto <= 0 ? "Quitado" : lista.some((d) => d.pago > 0) ? "Parcial" : data <= hoje ? "Vencido" : "A vencer";
		const formatos: Record<number, string> = { 1: FMT_DATA, 3: FMT_MOEDA, [4 + membros.length]: FMT_MOEDA };
		membros.forEach((_, k) => (formatos[4 + k] = FMT_MOEDA));
		linha(
			mes,
			[dataExcel(data), lista.length, centavos(lista.reduce((s, d) => s + d.total, 0)), ...membros.map((_, k) => centavos(lista.reduce((s, d) => s + d.partes[k], 0))), centavos(aberto), situacao],
			formatos,
			{ corTexto: corSituacao(situacao) },
		);
	}
	linhaTotal(mes, 5 + membros.length, [3, ...membros.map((_, k) => 4 + k), 4 + membros.length], inicio, mes.rowCount);

	// --- Compras
	const compras = wb.addWorksheet("Compras", { views: [{ state: "frozen", ySplit: 1 }] });
	compras.columns = [{ width: 46 }, { width: 13 }, { width: 10 }, { width: 22 }, { width: 15 }, ...membros.map(() => ({ width: 18 })), { width: 10 }];
	cabecalho(compras, ["Compra", "Data da compra", "Parcelas", "Pago por", "Total", ...colsMembros, "Opcional"]);
	inicio = compras.rowCount + 1;
	for (const [, lista] of agrupar(despesas, (d) => `${d.compra}|${d.dataCompra || ""}|${d.pagoPor}`)) {
		const p = lista[0];
		const formatos: Record<number, string> = { 2: FMT_DATA, 5: FMT_MOEDA };
		membros.forEach((_, k) => (formatos[6 + k] = FMT_MOEDA));
		linha(
			compras,
			[
				p.compra,
				dataExcel(p.dataCompra || p.data),
				p.totalParcelas > 1 ? `${p.totalParcelas}x` : "à vista",
				p.pagoPor,
				centavos(lista.reduce((s, d) => s + d.total, 0)),
				...membros.map((_, k) => centavos(lista.reduce((s, d) => s + d.partes[k], 0))),
				p.opcional ? (lista.some((d) => d.recusado) ? "Recusado" : "Sim") : "",
			],
			formatos,
		);
	}
	linhaTotal(compras, 6 + membros.length, [5, ...membros.map((_, k) => 6 + k)], inicio, compras.rowCount);
	compras.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 + membros.length } };

	// --- Lançamentos (detalhe)
	const det = wb.addWorksheet("Lançamentos", { views: [{ state: "frozen", ySplit: 1 }] });
	det.columns = [{ width: 13 }, { width: 46 }, { width: 9 }, { width: 22 }, { width: 14 }, ...membros.map(() => ({ width: 18 })), { width: 10 }, { width: 12 }];
	cabecalho(det, ["Vencimento", "Compra", "Parcela", "Pago por", "Total", ...colsMembros, "Opcional", "Situação"]);
	inicio = det.rowCount + 1;
	for (const d of despesas) {
		const formatos: Record<number, string> = { 1: FMT_DATA, 5: FMT_MOEDA };
		membros.forEach((_, k) => (formatos[6 + k] = FMT_MOEDA));
		linha(
			det,
			[dataExcel(d.data), d.compra, d.totalParcelas > 1 ? `${d.parcela}/${d.totalParcelas}` : "única", d.pagoPor, d.total, ...d.partes, d.opcional ? "Sim" : "", d.situacao],
			formatos,
			{ corTexto: corSituacao(d.situacao) },
		);
	}
	linhaTotal(det, 7 + membros.length, [5, ...membros.map((_, k) => 6 + k)], inicio, det.rowCount);
	det.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 + membros.length } };

	await baixar(wb, `grupo_${slug(grupo.nome)}_${hoje}.xlsx`);
}
