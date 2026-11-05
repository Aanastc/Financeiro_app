import { useState } from "react";
import { saveAs } from "file-saver";
import { toast } from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";

export function ExportExcelButton() {
	const [gerando, setGerando] = useState(false);

	const handleExportExcel = async () => {
		if (gerando) return;
		setGerando(true);
		const aviso = toast.loading("Gerando relatório...");
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) throw new Error("Sessão expirada. Faça login novamente.");

			// Carregado sob demanda: o ExcelJS é grande e só é necessário aqui
			const { gerarRelatorioExcel } = await import("../lib/relatorioExcel");
			const blob = await gerarRelatorioExcel(user.id);

			const hoje = new Date().toISOString().slice(0, 10);
			saveAs(blob, `relatorio_financeiro_${hoje}.xlsx`);
			toast.success("Relatório gerado!", { id: aviso });
		} catch (error: any) {
			console.error("Erro ao exportar Excel:", error);
			toast.error(error?.message || "Erro ao exportar Excel.", { id: aviso });
		} finally {
			setGerando(false);
		}
	};

	return (
		<button
			onClick={handleExportExcel}
			disabled={gerando}
			className="w-full sm:w-auto bg-pink-500 hover:bg-pink-600 disabled:opacity-60 disabled:cursor-wait text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer text-center flex items-center justify-center gap-2">
			{gerando && <Loader2 size={14} className="animate-spin" />}
			{gerando ? "Gerando..." : "Baixar Resumo Excel"}
		</button>
	);
}
