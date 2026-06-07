import { useState } from "react";
import { X, Save, ArrowUpCircle, Edit3 } from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";

export function AddEntradaWeb({ isOpen, onClose, onSuccess, categorias }: any) {
	const [form, setForm] = useState({
		descricao: "",
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

	const handleRenameCategory = async (oldName: string) => {
		const newName = prompt(`Renomear categoria "${oldName}" para:`, oldName);
		if (!newName || newName.trim() === "" || newName.trim() === oldName) return;

		const { data: { user } } = await supabase.auth.getUser();
		if (!user) return;

		try {
			const { error } = await supabase
				.from("entradas")
				.update({ descricao: newName.trim() })
				.eq("usuario_id", user.id)
				.eq("descricao", oldName);

			if (error) throw error;

			if (form.descricao === oldName) {
				setForm(f => ({ ...f, descricao: newName.trim() }));
			}

			onSuccess(); // Recarrega do banco
		} catch (err) {
			console.error(err);
			alert("Erro ao renomear categoria.");
		}
	};

	const handleSave = async () => {
		const {
			data: { user },
		} = await supabase.auth.getUser();
		const descFinal = form.descricao;

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
					<div className="space-y-3">
						<label className="text-[10px] font-black uppercase text-gray-400 ml-2">
							Categoria
						</label>
						<input
							list="categorias-list"
							placeholder="Digite a categoria ou escolha da lista..."
							className="w-full p-5 bg-[#FCF8F8] rounded-3xl border border-gray-100 outline-none focus:border-[#4CAF50] font-bold text-[#5D4037]"
							value={form.descricao}
							onChange={(e) => setForm({ ...form, descricao: e.target.value })}
						/>
						<datalist id="categorias-list">
							{categorias.map((c: string) => (
								<option key={c} value={c} />
							))}
						</datalist>

						{/* LIST OF CATEGORIES WITH EDIT BUTTONS */}
						<div className="space-y-1">
							<span className="text-[9px] font-black uppercase text-gray-400 ml-2">Categorias Existentes</span>
							<div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 bg-[#FCF8F8] rounded-2xl border border-gray-100/50 custom-scrollbar">
								{categorias.length === 0 ? (
									<span className="text-xs text-gray-400 italic font-medium p-1">Nenhuma categoria registrada</span>
								) : (
									categorias.map((c: string) => (
										<div
											key={c}
											className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
												form.descricao === c
													? "bg-[#4CAF50] text-white"
													: "bg-white text-[#5D4037] border border-gray-100 hover:bg-gray-50"
											}`}
											onClick={() => setForm({ ...form, descricao: c })}
										>
											<span>{c}</span>
											<button
												type="button"
												className={`p-0.5 rounded-full hover:bg-black/10 transition-colors ${
													form.descricao === c ? "text-white" : "text-gray-400 hover:text-[#5D4037]"
												}`}
												onClick={(e) => {
													e.stopPropagation();
													handleRenameCategory(c);
												}}
												title={`Renomear categoria ${c}`}
											>
												<Edit3 size={10} />
											</button>
										</div>
									))
								)}
							</div>
						</div>
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
