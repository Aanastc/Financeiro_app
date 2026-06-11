import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { supabase } from "../../../../packages/services/supabase";

export function ExportExcelButton() {
	const handleExportExcel = async () => {
		try {
			// 🔹 usuário logado
			const {
				data: { user },
			} = await supabase.auth.getUser();

			if (!user) {
				alert("Usuário não autenticado");
				return;
			}

			// 🔹 buscar dados
			const { data: entradas } = await supabase
				.from("entradas")
				.select("*")
				.eq("usuario_id", user.id);

			const { data: gastos } = await supabase
				.from("gastos")
				.select("*")
				.eq("usuario_id", user.id);

			// Helper para converter coluna index em letra (ex: 2 -> B, 14 -> N)
			const getColumnLetter = (colIndex: number): string => {
				return String.fromCharCode(64 + colIndex);
			};

			// 🔹 agrupar dados por ano, mês e categoria
			// Estrutura: dataByYear[ano][tipo][categoria][mesIndex] = valor
			interface YearData {
				entradas: { [category: string]: number[] };
				gastos: { [category: string]: number[] };
			}
			const dataByYear: { [year: string]: YearData } = {};

			// ENTRADAS
			entradas?.forEach((e) => {
				if (!e.data || !e.valor) return;
				const [ano, mesStr] = e.data.split("-");
				const monthIdx = parseInt(mesStr, 10) - 1; // 0 a 11
				const category = e.categoria || "Outros";

				if (!dataByYear[ano]) {
					dataByYear[ano] = { entradas: {}, gastos: {} };
				}
				if (!dataByYear[ano].entradas[category]) {
					dataByYear[ano].entradas[category] = Array(12).fill(0);
				}
				dataByYear[ano].entradas[category][monthIdx] += Number(e.valor);
			});

			// GASTOS
			gastos?.forEach((g) => {
				if (!g.data || !g.valor) return;
				const [ano, mesStr] = g.data.split("-");
				const monthIdx = parseInt(mesStr, 10) - 1; // 0 a 11
				const category = g.categoria || "Outros";

				if (!dataByYear[ano]) {
					dataByYear[ano] = { entradas: {}, gastos: {} };
				}
				if (!dataByYear[ano].gastos[category]) {
					dataByYear[ano].gastos[category] = Array(12).fill(0);
				}
				dataByYear[ano].gastos[category][monthIdx] += Number(g.valor);
			});

			// Obter anos ordenados decrescente
			let years = Object.keys(dataByYear).sort((a, b) => b.localeCompare(a));
			if (years.length === 0) {
				const currentYear = new Date().getFullYear().toString();
				years = [currentYear];
				dataByYear[currentYear] = { entradas: {}, gastos: {} };
			}

			// 🔹 criar excel
			const workbook = new ExcelJS.Workbook();

			years.forEach((year) => {
				const sheet = workbook.addWorksheet(year);
				sheet.views = [{ showGridLines: true }];

				// Definir larguras de colunas
				sheet.columns = [
					{ key: "categoria", width: 25 },
					{ key: "jan", width: 14 },
					{ key: "feb", width: 14 },
					{ key: "mar", width: 14 },
					{ key: "apr", width: 14 },
					{ key: "may", width: 14 },
					{ key: "jun", width: 14 },
					{ key: "jul", width: 14 },
					{ key: "aug", width: 14 },
					{ key: "sep", width: 14 },
					{ key: "oct", width: 14 },
					{ key: "nov", width: 14 },
					{ key: "dec", width: 14 },
					{ key: "total", width: 18 },
				];

				// 1. Cabeçalho Principal (Título)
				const titleRow = sheet.addRow(["RESUMO FINANCEIRO ANUAL - " + year]);
				sheet.mergeCells(`A1:N1`);
				titleRow.height = 45;
				const titleCell = titleRow.getCell(1);
				titleCell.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FFFFFF" } };
				titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "3D3030" } };
				titleCell.alignment = { horizontal: "center", vertical: "middle" };

				// Linha em branco
				sheet.addRow([]);

				// 2. Cabeçalho da Tabela
				const headers = [
					"Categoria",
					"Jan",
					"Fev",
					"Mar",
					"Abr",
					"Mai",
					"Jun",
					"Jul",
					"Ago",
					"Set",
					"Out",
					"Nov",
					"Dez",
					"Total Anual",
				];
				const headerRow = sheet.addRow(headers);
				headerRow.height = 28;
				headerRow.eachCell((cell, colNum) => {
					cell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FFFFFF" } };
					cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "4E342E" } };
					cell.alignment = { horizontal: colNum === 1 ? "left" : "center", vertical: "middle" };
					cell.border = {
						top: { style: "thin", color: { argb: "8D6E63" } },
						bottom: { style: "medium", color: { argb: "3D3030" } },
						left: { style: "thin", color: { argb: "8D6E63" } },
						right: { style: "thin", color: { argb: "8D6E63" } },
					};
				});

				const yearData = dataByYear[year];
				const receitasCats = Object.keys(yearData.entradas).sort();
				const gastosCats = Object.keys(yearData.gastos).sort();

				// Garantir pelo menos uma categoria padrão se estiver vazio
				if (receitasCats.length === 0) receitasCats.push("Outras Receitas");
				if (gastosCats.length === 0) gastosCats.push("Outros Gastos");

				// ----------------------------------------------------
				// SEÇÃO 1: RECEITAS (ENTRADAS)
				// ----------------------------------------------------
				const secRecRow = sheet.addRow(["RECEITAS (ENTRADAS)"]);
				sheet.mergeCells(`A${secRecRow.number}:N${secRecRow.number}`);
				secRecRow.height = 24;
				secRecRow.getCell(1).font = { name: "Segoe UI", size: 12, bold: true, color: { argb: "1B5E20" } };
				secRecRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "E8F5E9" } };
				secRecRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

				const startRecRow = sheet.rowCount + 1;
				receitasCats.forEach((cat, index) => {
					const rowValues = [cat];
					const monthlyValues = yearData.entradas[cat] || Array(12).fill(0);
					monthlyValues.forEach((val) => rowValues.push(val));

					const row = sheet.addRow(rowValues);
					row.height = 22;

					const isEven = index % 2 === 0;
					const bgHex = isEven ? "FFFFFF" : "F9FBF9";

					row.eachCell((cell, colNum) => {
						cell.font = { name: "Segoe UI", size: 11, color: { argb: "263238" } };
						cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgHex } };
						cell.border = {
							top: { style: "thin", color: { argb: "E0E0E0" } },
							bottom: { style: "thin", color: { argb: "E0E0E0" } },
							left: { style: "thin", color: { argb: "E0E0E0" } },
							right: { style: "thin", color: { argb: "E0E0E0" } },
						};

						if (colNum > 1 && colNum < 14) {
							cell.numFmt = '"R$ " #,##0.00;[Red]-"R$ " #,##0.00;"R$ " 0.00';
							cell.alignment = { horizontal: "right", vertical: "middle" };
						}
					});

					// Fórmula Total Anual da categoria
					const totalCell = row.getCell(14);
					totalCell.value = { formula: `SUM(B${row.number}:M${row.number})` };
					totalCell.numFmt = '"R$ " #,##0.00;[Red]-"R$ " #,##0.00;"R$ " 0.00';
					totalCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "263238" } };
					totalCell.alignment = { horizontal: "right", vertical: "middle" };
				});
				const endRecRow = sheet.rowCount;

				// Linha de Total das Receitas
				const totalRecRow = sheet.addRow(["Total Receitas"]);
				totalRecRow.height = 24;
				totalRecRow.eachCell((cell, colNum) => {
					cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "C8E6C9" } };
					cell.border = {
						top: { style: "thin", color: { argb: "A5D6A7" } },
						bottom: { style: "double", color: { argb: "1B5E20" } },
						left: { style: "thin", color: { argb: "A5D6A7" } },
						right: { style: "thin", color: { argb: "A5D6A7" } },
					};
					cell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "1B5E20" } };

					if (colNum === 1) {
						cell.alignment = { horizontal: "left", vertical: "middle" };
					} else {
						const colLetter = getColumnLetter(colNum);
						cell.value = { formula: `SUM(${colLetter}${startRecRow}:${colLetter}${endRecRow})` };
						cell.numFmt = '"R$ " #,##0.00;[Red]-"R$ " #,##0.00;"R$ " 0.00';
						cell.alignment = { horizontal: "right", vertical: "middle" };
					}
				});
				const totalReceitasRowNum = totalRecRow.number;

				// Linha em branco
				sheet.addRow([]);

				// ----------------------------------------------------
				// SEÇÃO 2: DESPESAS (SAÍDAS)
				// ----------------------------------------------------
				const secDesRow = sheet.addRow(["DESPESAS (SAÍDAS)"]);
				sheet.mergeCells(`A${secDesRow.number}:N${secDesRow.number}`);
				secDesRow.height = 24;
				secDesRow.getCell(1).font = { name: "Segoe UI", size: 12, bold: true, color: { argb: "B71C1C" } };
				secDesRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEBEE" } };
				secDesRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

				const startDesRow = sheet.rowCount + 1;
				gastosCats.forEach((cat, index) => {
					const rowValues = [cat];
					const monthlyValues = yearData.gastos[cat] || Array(12).fill(0);
					monthlyValues.forEach((val) => rowValues.push(val));

					const row = sheet.addRow(rowValues);
					row.height = 22;

					const isEven = index % 2 === 0;
					const bgHex = isEven ? "FFFFFF" : "FDF9F9";

					row.eachCell((cell, colNum) => {
						cell.font = { name: "Segoe UI", size: 11, color: { argb: "263238" } };
						cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgHex } };
						cell.border = {
							top: { style: "thin", color: { argb: "E0E0E0" } },
							bottom: { style: "thin", color: { argb: "E0E0E0" } },
							left: { style: "thin", color: { argb: "E0E0E0" } },
							right: { style: "thin", color: { argb: "E0E0E0" } },
						};

						if (colNum > 1 && colNum < 14) {
							cell.numFmt = '"R$ " #,##0.00;[Red]-"R$ " #,##0.00;"R$ " 0.00';
							cell.alignment = { horizontal: "right", vertical: "middle" };
						}
					});

					// Fórmula Total Anual da categoria
					const totalCell = row.getCell(14);
					totalCell.value = { formula: `SUM(B${row.number}:M${row.number})` };
					totalCell.numFmt = '"R$ " #,##0.00;[Red]-"R$ " #,##0.00;"R$ " 0.00';
					totalCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "263238" } };
					totalCell.alignment = { horizontal: "right", vertical: "middle" };
				});
				const endDesRow = sheet.rowCount;

				// Linha de Total das Despesas
				const totalDesRow = sheet.addRow(["Total Despesas"]);
				totalDesRow.height = 24;
				totalDesRow.eachCell((cell, colNum) => {
					cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCDD2" } };
					cell.border = {
						top: { style: "thin", color: { argb: "EF9A9A" } },
						bottom: { style: "double", color: { argb: "B71C1C" } },
						left: { style: "thin", color: { argb: "EF9A9A" } },
						right: { style: "thin", color: { argb: "EF9A9A" } },
					};
					cell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "B71C1C" } };

					if (colNum === 1) {
						cell.alignment = { horizontal: "left", vertical: "middle" };
					} else {
						const colLetter = getColumnLetter(colNum);
						cell.value = { formula: `SUM(${colLetter}${startDesRow}:${colLetter}${endDesRow})` };
						cell.numFmt = '"R$ " #,##0.00;[Red]-"R$ " #,##0.00;"R$ " 0.00';
						cell.alignment = { horizontal: "right", vertical: "middle" };
					}
				});
				const totalDespesasRowNum = totalDesRow.number;

				// Linha em branco
				sheet.addRow([]);

				// ----------------------------------------------------
				// SEÇÃO 3: RESUMO ANUAL
				// ----------------------------------------------------
				const secResRow = sheet.addRow(["RESUMO ANUAL"]);
				sheet.mergeCells(`A${secResRow.number}:N${secResRow.number}`);
				secResRow.height = 24;
				secResRow.getCell(1).font = { name: "Segoe UI", size: 12, bold: true, color: { argb: "0D47A1" } };
				secResRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "E3F2FD" } };
				secResRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

				// Linha Saldo Mensal
				const saldoMensalRow = sheet.addRow(["Saldo Mensal"]);
				saldoMensalRow.height = 24;
				saldoMensalRow.eachCell((cell, colNum) => {
					cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "E3F2FD" } };
					cell.border = {
						top: { style: "thin", color: { argb: "90CAF9" } },
						bottom: { style: "thin", color: { argb: "90CAF9" } },
						left: { style: "thin", color: { argb: "90CAF9" } },
						right: { style: "thin", color: { argb: "90CAF9" } },
					};
					cell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "0D47A1" } };

					if (colNum === 1) {
						cell.alignment = { horizontal: "left", vertical: "middle" };
					} else if (colNum < 14) {
						const colLetter = getColumnLetter(colNum);
						cell.value = { formula: `${colLetter}${totalReceitasRowNum}-${colLetter}${totalDespesasRowNum}` };
						cell.numFmt = '"R$ " #,##0.00;[Red]-"R$ " #,##0.00;"R$ " 0.00';
						cell.alignment = { horizontal: "right", vertical: "middle" };
					}
				});
				// Total Anual do Saldo Mensal
				const totalSaldoMensalCell = saldoMensalRow.getCell(14);
				totalSaldoMensalCell.value = { formula: `N${totalReceitasRowNum}-N${totalDespesasRowNum}` };
				totalSaldoMensalCell.numFmt = '"R$ " #,##0.00;[Red]-"R$ " #,##0.00;"R$ " 0.00';
				totalSaldoMensalCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "0D47A1" } };
				totalSaldoMensalCell.alignment = { horizontal: "right", vertical: "middle" };

				// Linha Saldo Acumulado
				const saldoAcumuladoRow = sheet.addRow(["Saldo Acumulado"]);
				saldoAcumuladoRow.height = 24;
				saldoAcumuladoRow.eachCell((cell, colNum) => {
					cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "BBDEFB" } };
					cell.border = {
						top: { style: "thin", color: { argb: "90CAF9" } },
						bottom: { style: "double", color: { argb: "0D47A1" } },
						left: { style: "thin", color: { argb: "90CAF9" } },
						right: { style: "thin", color: { argb: "90CAF9" } },
					};
					cell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "0D47A1" } };

					const rowNum = saldoAcumuladoRow.number;
					const prevRowNum = saldoMensalRow.number;

					if (colNum === 1) {
						cell.alignment = { horizontal: "left", vertical: "middle" };
					} else if (colNum === 2) {
						cell.value = { formula: `B${prevRowNum}` };
						cell.numFmt = '"R$ " #,##0.00;[Red]-"R$ " #,##0.00;"R$ " 0.00';
						cell.alignment = { horizontal: "right", vertical: "middle" };
					} else if (colNum < 14) {
						const prevColLetter = getColumnLetter(colNum - 1);
						const currentColLetter = getColumnLetter(colNum);
						cell.value = { formula: `${prevColLetter}${rowNum}+${currentColLetter}${prevRowNum}` };
						cell.numFmt = '"R$ " #,##0.00;[Red]-"R$ " #,##0.00;"R$ " 0.00';
						cell.alignment = { horizontal: "right", vertical: "middle" };
					}
				});
				// Total Anual do Saldo Acumulado
				const totalSaldoAcumCell = saldoAcumuladoRow.getCell(14);
				totalSaldoAcumCell.value = { formula: `M${saldoAcumuladoRow.number}` };
				totalSaldoAcumCell.numFmt = '"R$ " #,##0.00;[Red]-"R$ " #,##0.00;"R$ " 0.00';
				totalSaldoAcumCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "0D47A1" } };
				totalSaldoAcumCell.alignment = { horizontal: "right", vertical: "middle" };
			});

			// 🔹 gerar arquivo
			const buffer = await workbook.xlsx.writeBuffer();

			const blob = new Blob([buffer], {
				type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			});

			saveAs(blob, "resumo_financeiro_anual.xlsx");
		} catch (error) {
			console.error(error);
			alert("Erro ao exportar Excel");
		}
	};

	return (
		<button
			onClick={handleExportExcel}
			className="w-full sm:w-auto bg-pink-500 hover:bg-pink-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer text-center flex items-center justify-center">
			Baixar Resumo Excel
		</button>
	);
}
