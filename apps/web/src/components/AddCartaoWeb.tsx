import { useState } from "react";
import { X, CreditCard, Save } from "lucide-react";
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
				vencimento_dia: parseInt(form.vencimento_dia),
				fechamento_dia: parseInt(form.fechamento_dia),
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
		<div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
			<div className="bg-white w-full max-w-md rounded-[30px] overflow-hidden shadow-2xl">
				{/* Header */}
				<div className="p-6 bg-[#5D4037] text-white flex justify-between items-center">
					<h3 className="font-black text-xl flex items-center gap-2">
						<CreditCard /> Novo Cartão
					</h3>
					<button
						onClick={onClose}
						className="hover:opacity-70 transition-opacity">
						<X />
					</button>
				</div>

				<div className="p-6 space-y-5">
					{/* Nome do Cartão */}
					<div className="space-y-1">
						<label className="text-[10px] font-black text-gray-400 uppercase ml-2">
							Identificação
						</label>
						<input
							placeholder="Ex: Nubank, Inter, Visa..."
							className="w-full p-4 bg-gray-50 rounded-2xl font-bold text-[#5D4037] outline-none border-2 border-transparent focus:border-pink-200"
							value={form.nome}
							onChange={(e) => setForm({ ...form, nome: e.target.value })}
						/>
					</div>

					{/* Limite Total Formatado */}
					<div className="space-y-1">
						<label className="text-[10px] font-black text-gray-400 uppercase ml-2">
							Limite Total (R$)
						</label>
						<input
							type="text"
							inputMode="numeric"
							placeholder="0,00"
							className="w-full p-4 bg-gray-50 rounded-2xl font-black text-green-600 text-2xl outline-none border-2 border-transparent focus:border-green-200"
							value={form.limite}
							onChange={(e) =>
								setForm({ ...form, limite: formatCurrency(e.target.value) })
							}
						/>
					</div>

					{/* Datas */}
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1">
							<label className="text-[10px] font-black text-gray-400 uppercase ml-2">
								Dia Vencimento
							</label>
							<input
								type="number"
								min="1"
								max="31"
								className="w-full p-4 bg-gray-50 rounded-2xl font-bold text-[#5D4037] outline-none"
								value={form.vencimento_dia}
								onChange={(e) =>
									setForm({ ...form, vencimento_dia: e.target.value })
								}
							/>
						</div>
						<div className="space-y-1">
							<label className="text-[10px] font-black text-gray-400 uppercase ml-2">
								Dia Fechamento
							</label>
							<input
								type="number"
								min="1"
								max="31"
								className="w-full p-4 bg-gray-50 rounded-2xl font-bold text-[#5D4037] outline-none"
								value={form.fechamento_dia}
								onChange={(e) =>
									setForm({ ...form, fechamento_dia: e.target.value })
								}
							/>
						</div>
					</div>

					{/* Botão Salvar */}
					<button
						onClick={handleSave}
						className="w-full bg-pink-500 text-white p-5 rounded-2xl font-black text-lg shadow-xl hover:bg-pink-600 transition-all flex items-center justify-center gap-2 mt-4">
						<Save size={22} /> SALVAR CARTÃO
					</button>
				</div>
			</div>
		</div>
	);
}
