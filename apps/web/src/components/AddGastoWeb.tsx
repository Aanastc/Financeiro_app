import { useState } from "react";
import { X, ShoppingBag, ChevronDown } from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";

const CATEGORIAS_PADRAO = [
	"Moradia",
	"Alimentação",
	"Transporte",
	"Saúde",
	"Lazer",
	"Educação",
	"Assinaturas",
	"Outros",
];
const TIPOS_PADRAO = ["Essencial", "Lazer", "Reserva"];

export function AddGastoWeb({
	isOpen,
	onClose,
	onSuccess,
	sugestoes = [],
}: any) {
	const [form, setForm] = useState({
		descricao: "",
		valor: "",
		data: new Date().toISOString().split("T")[0],
		categoria: "Outros",
		classificacao: "Variável",
		tipo: "Essencial",
	});
	const [showSugestoes, setShowSugestoes] = useState(false);

	if (!isOpen) return null;

	const handleSave = async () => {
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (!user || !form.descricao || !form.valor)
			return alert("Preencha descrição e valor!");

		try {
			const { error } = await supabase.from("gastos").insert([
				{
					usuario_id: user.id,
					descricao: form.descricao,
					valor: parseFloat(form.valor.replace(",", ".")),
					data: form.data,
					categoria: form.categoria,
					classificacao: form.classificacao,
					tipo: form.tipo,
				},
			]);
			if (error) throw error;
			setForm({ ...form, descricao: "", valor: "" });
			onSuccess();
			onClose();
		} catch (e: any) {
			alert(e.message);
		}
	};

	return (
		<div className="fixed inset-0 bg-[#5D4037]/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
			<div className="bg-white w-full max-w-xl rounded-[40px] shadow-2xl overflow-hidden">
				<div className="p-8 bg-pink-400 text-white flex justify-between items-center">
					<h3 className="text-2xl font-black flex items-center gap-2">
						<ShoppingBag /> Novo Gasto
					</h3>
					<button
						onClick={onClose}
						className="hover:rotate-90 transition-transform">
						<X />
					</button>
				</div>

				<div className="p-8 space-y-5">
					{/* CAMPO DE DESCRIÇÃO COM LISTA REAL */}
					<div className="relative space-y-1">
						<label className="text-[10px] font-black text-gray-400 uppercase ml-2">
							Descrição
						</label>
						<div className="relative">
							<input
								placeholder="Digite ou escolha uma existente..."
								className="w-full p-4 bg-[#FCF8F8] rounded-2xl border-2 border-transparent focus:border-pink-200 outline-none font-bold text-[#5D4037]"
								value={form.descricao}
								onFocus={() => setShowSugestoes(true)}
								onBlur={() => setTimeout(() => setShowSugestoes(false), 200)}
								onChange={(e) =>
									setForm({ ...form, descricao: e.target.value })
								}
							/>
							<ChevronDown
								size={20}
								className="absolute right-4 top-4 text-gray-400"
							/>
						</div>

						{/* LISTA SUSPENSA DE DESCRIÇÕES DO USUÁRIO */}
						{showSugestoes && sugestoes && sugestoes.length > 0 && (
							<div className="absolute z-[110] w-full bg-white border-2 border-pink-100 rounded-2xl shadow-xl max-h-48 overflow-y-auto mt-1">
								{sugestoes.map((item: string, index: number) => (
									<div
										key={index}
										className="w-full text-left p-4 hover:bg-pink-50 cursor-pointer font-bold text-[#5D4037] border-b border-gray-50 last:border-0"
										onMouseDown={() => {
											setForm({ ...form, descricao: item });
											setShowSugestoes(false);
										}}>
										{item}
									</div>
								))}
							</div>
						)}
					</div>

					<div className="grid grid-cols-2 gap-4">
						<input
							type="number"
							placeholder="Valor"
							className="w-full p-4 bg-[#FCF8F8] rounded-2xl font-black text-pink-500 text-xl outline-none"
							value={form.valor}
							onChange={(e) => setForm({ ...form, valor: e.target.value })}
						/>
						<input
							type="date"
							className="w-full p-4 bg-[#FCF8F8] rounded-2xl font-bold text-[#5D4037] outline-none"
							value={form.data}
							onChange={(e) => setForm({ ...form, data: e.target.value })}
						/>
					</div>

					{/* Classificação / Categoria / Tipo - Mesma lógica anterior */}
					<div className="flex gap-2">
						{["Fixo", "Variável"].map((opt) => (
							<button
								key={opt}
								type="button"
								onClick={() => setForm({ ...form, classificacao: opt })}
								className={`flex-1 p-3 rounded-xl font-bold ${form.classificacao === opt ? "bg-[#5D4037] text-white" : "bg-gray-100 text-gray-400"}`}>
								{opt}
							</button>
						))}
					</div>

					<div className="grid grid-cols-2 gap-4">
						<select
							className="p-4 bg-[#FCF8F8] rounded-2xl font-bold text-[#5D4037]"
							value={form.categoria}
							onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
							{CATEGORIAS_PADRAO.map((c) => (
								<option key={c} value={c}>
									{c}
								</option>
							))}
						</select>
						<select
							className="p-4 bg-[#FCF8F8] rounded-2xl font-bold text-[#5D4037]"
							value={form.tipo}
							onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
							{TIPOS_PADRAO.map((t) => (
								<option key={t} value={t}>
									{t}
								</option>
							))}
						</select>
					</div>

					<button
						onClick={handleSave}
						className="w-full bg-[#5D4037] text-white p-5 rounded-2xl font-black text-lg shadow-xl hover:bg-black transition-all">
						SALVAR REGISTRO
					</button>
				</div>
			</div>
		</div>
	);
}
