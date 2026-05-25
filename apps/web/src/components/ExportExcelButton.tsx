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

			// 🔹 agrupar por mês
			const resumo = {};

			// ENTRADAS
			entradas?.forEach((e) => {
				const mes = e.data?.slice(0, 7); // "2026-01"

				if (!resumo[mes]) {
					resumo[mes] = { entradas: 0, gastos: 0 };
				}

				resumo[mes].entradas += Number(e.valor);
			});

			// GASTOS
			gastos?.forEach((g) => {
				const mes = g.data?.slice(0, 7);

				if (!resumo[mes]) {
					resumo[mes] = { entradas: 0, gastos: 0 };
				}

				resumo[mes].gastos += Number(g.valor);
			});

			// 🔹 criar excel
			const workbook = new ExcelJS.Workbook();
			const sheet = workbook.addWorksheet("Resumo Mensal");

			sheet.columns = [
				{ header: "Mês", key: "mes", width: 15 },
				{ header: "Entradas", key: "entradas", width: 20 },
				{ header: "Saídas", key: "gastos", width: 20 },
				{ header: "Saldo", key: "saldo", width: 20 },
			];

			let totalEntradas = 0;
			let totalGastos = 0;

			Object.keys(resumo)
				.sort()
				.forEach((mes) => {
					const entradasMes = resumo[mes].entradas;
					const gastosMes = resumo[mes].gastos;
					const saldo = entradasMes - gastosMes;

					totalEntradas += entradasMes;
					totalGastos += gastosMes;

					sheet.addRow({
						mes,
						entradas: entradasMes,
						gastos: gastosMes,
						saldo,
					});
				});

			// 🔹 linha TOTAL
			sheet.addRow({});

			sheet.addRow({
				mes: "TOTAL",
				entradas: totalEntradas,
				gastos: totalGastos,
				saldo: totalEntradas - totalGastos,
			});

			// 🔹 gerar arquivo
			const buffer = await workbook.xlsx.writeBuffer();

			const blob = new Blob([buffer], {
				type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			});

			saveAs(blob, "resumo_financeiro.xlsx");
		} catch (error) {
			console.error(error);
			alert("Erro ao exportar Excel");
		}
	};

	return (
		<button
			onClick={handleExportExcel}
			className="bg-pink-500 hover:bg-pink-600 text-white px-4 py-2 rounded-lg">
			Baixar Resumo
		</button>
	);
}
