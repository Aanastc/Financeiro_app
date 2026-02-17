import { useState } from "react";
import { X, Save, ArrowUpCircle } from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";

export function AddEntradaWeb({ isOpen, onClose, onSuccess, categorias }: any) {
	const [form, setForm] = useState({
		descricao: "",
		nova: "",
		valor: "", // Ex: "1.700,06"
		data: new Date().toISOString().split("T")[0],
	});

	if (!isOpen) return null;

	// FUNÇÃO DE MÁSCARA: Transforma números em formato R$ 1.234,56
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
		const descFinal = form.nova || form.descricao;

		// CONVERSÃO PARA O BANCO: Remove pontos e troca vírgula por ponto
		// "1.700,06" -> "1700.06" -> 1700.06
		const valorLimpo = form.valor.replace(/\./g, "").replace(",", ".");
		const valorNumerico = parseFloat(valorLimpo);

		if (!user || !descFinal || isNaN(valorNumerico) || valorNumerico <= 0) {
			alert("Insira um valor válido.");
			return;
		}

		await supabase.from("entradas").insert([
			{
				usuario_id: user.id,
				descricao: descFinal,
				valor: valorNumerico,
				data: form.data,
			},
		]);

		setForm({
			descricao: "",
			nova: "",
			valor: "",
			data: new Date().toISOString().split("T")[0],
		});
		onSuccess();
		onClose();
	};

	return (
		<div className="fixed inset-0 bg-[#5D4037]/40 backdrop-blur-md z-[100] flex items-center justify-center p-4">
			<div className="bg-white w-full max-w-md rounded-[50px] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
				<div className="p-10 bg-[#4CAF50] text-white relative">
					<div className="flex items-center gap-3 mb-2">
						<ArrowUpCircle size={24} />
						<h3 className="text-3xl font-black">Nova Entrada</h3>
					</div>
					<p className="font-bold opacity-80">Registre um novo ganho mensal</p>
					<button
						onClick={onClose}
						className="absolute top-8 right-8 bg-white/20 p-2 rounded-full hover:bg-white/40">
						<X size={20} />
					</button>
				</div>

				<div className="p-10 space-y-6">
					<div className="space-y-2">
						<label className="text-[10px] font-black uppercase text-gray-400 ml-2">
							Categoria
						</label>
						<select
							className="w-full p-5 bg-[#FCF8F8] rounded-3xl outline-none font-bold text-[#5D4037] appearance-none"
							value={form.descricao}
							onChange={(e) => setForm({ ...form, descricao: e.target.value })}>
							<option value="">Selecione existente...</option>
							{categorias.map((c: string) => (
								<option key={c} value={c}>
									{c}
								</option>
							))}
						</select>
						<input
							placeholder="Ou digite um novo nome..."
							className="w-full p-5 bg-[#FCF8F8] rounded-3xl border-dashed border-2 border-gray-200 outline-none focus:border-[#4CAF50]"
							value={form.nova}
							onChange={(e) => setForm({ ...form, nova: e.target.value })}
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<label className="text-[10px] font-black uppercase text-gray-400 ml-2">
								Valor (R$)
							</label>
							<input
								type="text"
								inputMode="numeric"
								placeholder="0,00"
								className="w-full p-5 bg-[#FCF8F8] rounded-3xl font-black text-[#4CAF50] text-2xl outline-none"
								value={form.valor}
								onChange={(e) =>
									setForm({ ...form, valor: formatCurrency(e.target.value) })
								}
							/>
						</div>
						<div className="space-y-2">
							<label className="text-[10px] font-black uppercase text-gray-400 ml-2">
								Data
							</label>
							<input
								type="date"
								className="w-full p-5 bg-[#FCF8F8] rounded-3xl font-bold text-gray-500 outline-none"
								value={form.data}
								onChange={(e) => setForm({ ...form, data: e.target.value })}
							/>
						</div>
					</div>

					<button
						onClick={handleSave}
						className="w-full bg-[#5D4037] text-white p-6 rounded-[30px] font-black text-xl hover:bg-[#4a332c] transition-all flex items-center justify-center gap-3">
						<Save size={24} /> SALVAR REGISTRO
					</button>
				</div>
			</div>
		</div>
	);
}
