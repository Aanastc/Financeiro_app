import { useState } from "react";
import { X, CreditCard, Save, Info, Calendar } from "lucide-react";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";

export function AddCartaoWeb({ isOpen, onClose, onSuccess }: any) {
	const [form, setForm] = useState({
		nome: "",
		limite: "", // Armazena a string formatada "R$ 0,00"
		vencimento_dia: "10",
		fechamento_dia: "3",
	});

	// Função de formatação idêntica à do Gasto para manter consistência
	const formatCurrency = (value: string) => {
		const onlyNumbers = value.replace(/\D/g, "");
		const options = { minimumFractionDigits: 2 };
		const result = new Intl.NumberFormat("pt-BR", options).format(
			parseFloat(onlyNumbers) / 100,
		);
		return result === "NaN" ? "" : result;
	};

    const handleDayChange = (field: "vencimento_dia" | "fechamento_dia", value: string) => {
        let numericValue = value.replace(/\D/g, "");
        if (numericValue !== "") {
            const num = parseInt(numericValue, 10);
            numericValue = num > 31 ? "31" : (num < 1 ? "1" : num.toString());
        }
        setForm(prev => {
            const updated = { ...prev, [field]: numericValue };
            
            // Calcula o fechamento automaticamente (10 dias antes) ao mudar o vencimento
            if (field === "vencimento_dia" && numericValue !== "") {
                const vencNum = parseInt(numericValue, 10);
                let fechNum = vencNum - 10;
                if (fechNum <= 0) {
                    fechNum += 30;
                }
                updated.fechamento_dia = fechNum.toString();
            }
            
            return updated;
        });
    };

	const handleSave = async () => {
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (!user) return;

		// Limpa a formatação "R$ 1.200,00" -> "1200.00" antes de enviar ao banco
		const limiteNumerico = parseFloat(
			form.limite.replace(/\./g, "").replace(",", "."),
		);

		if (!form.nome || isNaN(limiteNumerico) || limiteNumerico <= 0) {
			return alert("Preencha o nome e um limite válido!");
		}

		try {
			await financeService.addCartao(user.id, {
				nome: form.nome,
				limite: limiteNumerico,
				vencimento_dia: parseInt(form.vencimento_dia) || 1,
				fechamento_dia: parseInt(form.fechamento_dia) || 1,
			});

			// Limpa o formulário após o sucesso
			setForm({
				nome: "",
				limite: "",
				vencimento_dia: "10",
				fechamento_dia: "3",
			});
			onSuccess();
		} catch (e: any) {
			alert(e.message);
		}
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true">
			<div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col max-h-[95vh] sm:max-h-[90vh] transition-colors duration-200">
				{/* Header */}
				<div className="p-5 sm:p-6 bg-slate-800 dark:bg-slate-950 text-white flex justify-between items-center shrink-0">
					<h3 className="font-black text-lg sm:text-xl flex items-center gap-2">
						<CreditCard className="w-5 h-5 text-indigo-400" /> Novo Cartão
					</h3>
					<button
						onClick={onClose}
						className="hover:bg-slate-700 dark:hover:bg-slate-800 p-1.5 rounded-full transition-colors cursor-pointer">
						<X className="w-5 h-5" />
					</button>
				</div>

				<div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 scrollbar-thin">
					{/* Nome do Cartão */}
					<div className="space-y-1.5">
						<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase ml-2 tracking-wider">
							Identificação
						</label>
						<input
							placeholder="Ex: Nubank, Inter, Visa..."
							className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl font-bold text-slate-700 dark:text-slate-200 outline-none border border-slate-200 dark:border-slate-750 focus:border-indigo-500 transition-colors text-sm"
							value={form.nome}
							onChange={(e) => setForm({ ...form, nome: e.target.value })}
						/>
					</div>

					{/* Limite Total Formatado */}
					<div className="space-y-1.5">
						<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase ml-2 tracking-wider">
							Limite Total (R$)
						</label>
						<input
							type="text"
							inputMode="numeric"
							placeholder="0,00"
							className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl font-black text-emerald-600 dark:text-emerald-450 text-2xl outline-none border border-slate-200 dark:border-slate-750 focus:border-emerald-500 transition-colors"
							value={form.limite}
							onChange={(e) =>
								setForm({ ...form, limite: formatCurrency(e.target.value) })
							}
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase ml-2 tracking-wider flex items-center gap-1">
								<Calendar size={11} /> Vencimento (Dia)
							</label>
							<input
								type="number"
								min="1"
								max="31"
								className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl font-bold text-slate-700 dark:text-slate-200 outline-none border border-slate-200 dark:border-slate-750 focus:border-indigo-500 transition-colors text-sm text-center"
								value={form.vencimento_dia}
								onChange={(e) => handleDayChange("vencimento_dia", e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase ml-2 tracking-wider flex items-center gap-1">
								<Calendar size={11} /> Fechamento (Automático)
							</label>
							<input
								type="number"
								readOnly
								value={form.fechamento_dia}
								className="w-full p-4 bg-slate-100 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-750 font-bold text-slate-400 dark:text-slate-500 text-center text-sm cursor-not-allowed outline-none"
							/>
						</div>
					</div>

					{/* Explicação de Fechamento vs Vencimento */}
					<div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed font-semibold transition-colors duration-200">
						<div className="flex gap-2">
							<Info size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
							<p>
								<strong className="text-slate-800 dark:text-slate-100">Fechamento:</strong> Dia em que a fatura fecha. Compras a partir desse dia entram na fatura do mês seguinte (calculado automaticamente como 10 dias antes do vencimento).
							</p>
						</div>
						<div className="flex gap-2 border-t border-slate-200/50 dark:border-slate-700/40 pt-2.5">
							<Info size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
							<p>
								<strong className="text-slate-800 dark:text-slate-100">Vencimento:</strong> Dia limite para realizar o pagamento da fatura do mês.
							</p>
						</div>
					</div>

					{/* Botão Salvar */}
					<button
						onClick={handleSave}
						className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-4.5 rounded-2xl font-black text-sm shadow-xl hover:shadow-indigo-200/30 dark:shadow-none transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer uppercase">
						<Save size={18} /> SALVAR CARTÃO
					</button>
				</div>
			</div>
		</div>
	);
}
