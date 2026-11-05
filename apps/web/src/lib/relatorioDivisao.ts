import ExcelJS from "exceljs";
import { CORES, FMT_DATA, FMT_MOEDA, cabecalho, dataExcel, linha, secao, titulo } from "./relatorioExcel";

/** Planilhas da divisão de contas: por grupo e por pessoa (somente leitura dos dados já carregados). */

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
	saveAs(
		new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
		nomeArquivo
	);
}

const slug = (t: string) =>
	(t || "planilha").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "").toLowerCase();

const hoje = () => new Date().toISOString().slice(0, 10);

// ----------------------------------------------------------------------------
// Grupo
// ----------------------------------------------------------------------------
export async function exportarExcelGrupo(params: {
	grupo: { nome: string; membros?: { id: string; nome: string }[] };
	despesas: any[];
	balancos?: { nome: string; totalPago: number; totalDevido: number; saldoLiquido: number }[];
	acertos?: { devedorNome: string; credorNome: string; valor: number }[];
}) {
	const { grupo, despesas, balancos = [], acertos = [] } = params;
	const membros = grupo.membros || [];
	const wb = new ExcelJS.Workbook();
	wb.creator = "Tech Finance";

	// Aba 1: Resumo (balanço + quem paga quem)
	const resumo = wb.addWorksheet("Resumo");
	resumo.columns = [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }];
	titulo(resumo, `GRUPO: ${grupo.nome.toUpperCase()}`, 4, `Gerado em ${new Date().toLocaleString("pt-BR")}`);
	secao(resumo, "BALANÇO DOS MEMBROS", 4, CORES.resultado);
	cabecalho(resumo, ["Membro", "Pagou", "Consumiu", "Saldo"]);
	for (const b of balancos) {
		linha(resumo, [b.nome, b.totalPago, b.totalDevido, b.saldoLiquido], { 2: FMT_MOEDA, 3: FMT_MOEDA, 4: FMT_MOEDA });
	}
	resumo.addRow([]);
	secao(resumo, "COMO ACERTAR AS CONTAS", 4, CORES.receita);
	cabecalho(resumo, ["Quem paga", "Para quem", "Valor"]);
	if (acertos.length === 0) linha(resumo, ["Tudo acertado", "", 0], { 3: FMT_MOEDA });
	for (const a of acertos) linha(resumo, [a.devedorNome, a.credorNome, a.valor], { 3: FMT_MOEDA });

	// Aba 2: Despesas, com a parte de cada membro em colunas
	const aba = wb.addWorksheet("Despesas", { views: [{ state: "frozen", ySplit: 1 }] });
	aba.columns = [{ width: 12 }, { width: 40 }, { width: 22 }, { width: 15 }, ...membros.map(() => ({ width: 15 }))];
	cabecalho(aba, ["Data", "Descrição", "Pago por", "Total", ...membros.map(m => `Parte ${m.nome}`)]);
	const inicio = aba.rowCount + 1;
	for (const d of [...despesas].sort((a, b) => String(a.data).localeCompare(String(b.data)))) {
		const meta = lerMeta(d.observacao);
		const partes = membros.map(m => {
			const p = (meta.participantes || []).find((x: any) => x.id === m.id || x.nome === m.nome);
			return Number(p?.valor_devido) || 0;
		});
		const formatos: Record<number, string> = { 1: FMT_DATA, 4: FMT_MOEDA };
		membros.forEach((_, i) => (formatos[5 + i] = FMT_MOEDA));
		linha(aba, [dataExcel(d.data), meta.descricao_original || d.descricao, meta.pago_por_nome || "", Number(meta.valor_total ?? d.valor) || 0, ...partes], formatos);
	}
	const fim = aba.rowCount;
	if (fim >= inicio) {
		const tot = linha(aba, ["Total", "", "", null, ...membros.map(() => null)], {}, { negrito: true, fundo: CORES.resultado.total });
		for (let c = 4; c <= 4 + membros.length; c++) {
			const letra = String.fromCharCode(64 + c);
			tot.getCell(c).value = { formula: `SUM(${letra}${inicio}:${letra}${fim})` };
			tot.getCell(c).numFmt = FMT_MOEDA;
		}
	}
	aba.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, aba.rowCount), column: 4 + membros.length } };

	await baixar(wb, `grupo_${slug(grupo.nome)}_${hoje()}.xlsx`);
}

// ----------------------------------------------------------------------------
// Pessoa
// ----------------------------------------------------------------------------
export async function exportarExcelPessoa(params: { nome: string; itens: any[] }) {
	const { nome, itens } = params;
	const wb = new ExcelJS.Workbook();
	wb.creator = "Tech Finance";
	const aba = wb.addWorksheet("Despesas", { views: [{ state: "frozen", ySplit: 4 }] });
	aba.columns = [{ width: 12 }, { width: 44 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 13 }];
	titulo(aba, `DESPESAS COM ${nome.toUpperCase()}`, 6, `Gerado em ${new Date().toLocaleString("pt-BR")}`);
	cabecalho(aba, ["Data", "Descrição", "Valor", "Já pago", "Restante", "Situação"]);
	const inicio = aba.rowCount + 1;
	for (const i of [...itens].sort((a, b) => String(a.data).localeCompare(String(b.data)))) {
		const meta = lerMeta(i.observacao);
		const valor = Number(i.valor) || 0;
		const pago = i.terceiro_pago ? valor : Number(meta.valor_pago) || 0;
		const row = linha(aba, [dataExcel(i.data), i.descricao, valor, pago, null, i.terceiro_pago ? "Quitado" : pago > 0 ? "Parcial" : "Em aberto"], {
			1: FMT_DATA, 3: FMT_MOEDA, 4: FMT_MOEDA, 5: FMT_MOEDA,
		});
		row.getCell(5).value = { formula: `MAX(C${row.number}-D${row.number},0)` };
	}
	const fim = aba.rowCount;
	const tot = linha(aba, ["Total", "", null, null, null, ""], { 3: FMT_MOEDA, 4: FMT_MOEDA, 5: FMT_MOEDA }, { negrito: true, fundo: CORES.receita.total });
	for (const c of [3, 4, 5]) {
		const letra = String.fromCharCode(64 + c);
		tot.getCell(c).value = fim >= inicio ? { formula: `SUM(${letra}${inicio}:${letra}${fim})` } : 0;
	}
	await baixar(wb, `despesas_${slug(nome)}_${hoje()}.xlsx`);
}
