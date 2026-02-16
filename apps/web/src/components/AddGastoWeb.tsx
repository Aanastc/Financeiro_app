import React, { useState } from "react";
import { X, Save, ShoppingCart } from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";

export function AddGastoWeb({ isOpen, onClose, onSuccess, categorias }: any) {
	const [form, setForm] = useState({
		descricao: "",
		nova: "",
		valor: "",
		data: new Date().toISOString().split("T")[0],
	});

	if (!isOpen) return null;

	const handleSave = async () => {
		const {
			data: { user },
		} = await supabase.auth.getUser();
		const descFinal = form.nova || form.descricao;
		if (!user || !descFinal || !form.valor) return;

		await supabase.from("gastos").insert([
			{
				usuario_id: user.id,
				descricao: descFinal,
				valor: parseFloat(form.valor),
				data: form.data,
				classificacao: "Geral", // Padrão conforme sua tabela
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
				<div className="p-10 bg-pink-400 text-white relative">
					<div className="flex items-center gap-3 mb-2">
						<ShoppingCart size={24} />
						<h3 className="text-3xl font-black">Novo Gasto</h3>
					</div>
					<button
						onClick={onClose}
						className="absolute top-8 right-8 bg-white/20 p-2 rounded-full hover:bg-white/40">
						<X size={20} />
					</button>
				</div>

				<div className="p-10 space-y-6">
					<div className="space-y-2">
						<label className="text-[10px] font-black uppercase text-gray-400 ml-2">
							Categoria de Gasto
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
							placeholder="Ou descreva o gasto..."
							className="w-full p-5 bg-[#FCF8F8] rounded-3xl border-dashed border-2 border-gray-200 outline-none focus:border-pink-400"
							value={form.nova}
							onChange={(e) => setForm({ ...form, nova: e.target.value })}
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<input
							type="number"
							placeholder="Valor"
							className="w-full p-5 bg-[#FCF8F8] rounded-3xl font-black text-pink-400 text-2xl outline-none"
							value={form.valor}
							onChange={(e) => setForm({ ...form, valor: e.target.value })}
						/>
						<input
							type="date"
							className="w-full p-5 bg-[#FCF8F8] rounded-3xl font-bold text-gray-500 outline-none"
							value={form.data}
							onChange={(e) => setForm({ ...form, data: e.target.value })}
						/>
					</div>

					<button
						onClick={handleSave}
						className="w-full bg-[#5D4037] text-white p-6 rounded-[30px] font-black text-xl hover:bg-[#4a332c] transition-all flex items-center justify-center gap-3">
						<Save size={24} /> REGISTRAR GASTO
					</button>
				</div>
			</div>
		</div>
	);
}
