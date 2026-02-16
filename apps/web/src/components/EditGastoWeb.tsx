import React, { useState, useEffect } from "react";
import { X, Trash2, Save, Calendar, ShoppingBag, Search } from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";

export function EditGastoWeb({
	isOpen,
	onClose,
	onSuccess,
	dataSnapshot,
	categorias,
}: any) {
	const [filtroDesc, setFiltroDesc] = useState("");
	const [itemSelecionado, setItemSelecionado] = useState<any>(null);
	const [valorEdit, setValorEdit] = useState("");
	const [dataEdit, setDataEdit] = useState("");

	const ocorrencias = dataSnapshot
		.filter((i: any) => i.descricao === filtroDesc)
		.sort(
			(a: any, b: any) =>
				new Date(b.data).getTime() - new Date(a.data).getTime(),
		);

	useEffect(() => {
		if (!isOpen) {
			setFiltroDesc("");
			setItemSelecionado(null);
		}
	}, [isOpen]);

	const selecionarRegistro = (item: any) => {
		setItemSelecionado(item);
		setValorEdit(item.valor.toString());
		setDataEdit(item.data);
	};

	const handleUpdate = async () => {
		if (!itemSelecionado) return;
		try {
			const { error } = await supabase
				.from("gastos")
				.update({
					valor: parseFloat(valorEdit),
					data: dataEdit,
				})
				.eq("id", itemSelecionado.id);

			if (error) throw error;
			onSuccess();
			onClose();
		} catch (e: any) {
			alert(e.message);
		}
	};

	const handleDelete = async () => {
		if (
			!itemSelecionado ||
			!confirm("Deseja apagar este registro definitivamente?")
		)
			return;
		try {
			const { error } = await supabase
				.from("gastos")
				.delete()
				.eq("id", itemSelecionado.id);

			if (error) throw error;
			onSuccess();
			onClose();
		} catch (e: any) {
			alert(e.message);
		}
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 bg-[#5D4037]/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
			<div className="bg-white w-full max-w-5xl rounded-[50px] shadow-2xl flex overflow-hidden animate-in zoom-in duration-300 h-[650px]">
				{/* LADO ESQUERDO: LISTA DE BUSCA */}
				<div className="w-2/5 bg-[#FCF8F8] p-10 border-r border-gray-100 flex flex-col">
					<div className="flex items-center gap-2 mb-8">
						<Search size={20} className="text-pink-400" />
						<h3 className="text-2xl font-black text-[#5D4037]">Buscar Gasto</h3>
					</div>

					<div className="space-y-6 flex-1 flex flex-col overflow-hidden">
						<select
							className="w-full p-5 bg-white rounded-3xl shadow-sm font-bold text-[#5D4037] outline-none border-2 border-transparent focus:border-pink-200"
							value={filtroDesc}
							onChange={(e) => {
								setFiltroDesc(e.target.value);
								setItemSelecionado(null);
							}}>
							<option value="">Escolha a categoria...</option>
							{categorias.map((c: string) => (
								<option key={c} value={c}>
									{c}
								</option>
							))}
						</select>

						<div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
							{ocorrencias.length === 0 && filtroDesc && (
								<p className="text-center text-gray-400 mt-10 text-sm font-bold">
									Nenhum registro encontrado.
								</p>
							)}
							{ocorrencias.map((item: any) => (
								<button
									key={item.id}
									onClick={() => selecionarRegistro(item)}
									className={`w-full p-5 rounded-3xl flex justify-between items-center transition-all border-2 ${itemSelecionado?.id === item.id ? "border-pink-400 bg-white shadow-md scale-[1.02]" : "border-transparent hover:bg-white/50"}`}>
									<div className="text-left">
										<p className="font-black text-[#5D4037]">
											R$ {Number(item.valor).toLocaleString()}
										</p>
										<p className="text-[10px] text-gray-400 flex items-center gap-1 font-bold">
											<Calendar size={10} />{" "}
											{new Date(item.data + "T12:00:00").toLocaleDateString(
												"pt-BR",
											)}
										</p>
									</div>
								</button>
							))}
						</div>
					</div>
				</div>

				{/* LADO DIREITO: EDITOR */}
				<div className="w-3/5 p-12 relative flex flex-col justify-center">
					<button
						onClick={onClose}
						className="absolute top-10 right-10 text-gray-300 hover:text-pink-400 transition-colors">
						<X size={28} />
					</button>

					{!itemSelecionado ? (
						<div className="text-center space-y-4 opacity-20">
							<ShoppingBag size={80} className="mx-auto" />
							<p className="font-black text-xl text-[#5D4037]">
								Selecione um lançamento para editar
							</p>
						</div>
					) : (
						<div className="animate-in fade-in slide-in-from-right-8 space-y-8">
							<div>
								<span className="bg-pink-100 text-pink-500 px-4 py-1 rounded-full text-[10px] font-black uppercase">
									Editando Gasto
								</span>
								<h2 className="text-5xl font-black text-[#5D4037] mt-2">
									{itemSelecionado.descricao}
								</h2>
							</div>

							<div className="space-y-6">
								<div className="flex items-center gap-4 bg-[#FCF8F8] p-6 rounded-[35px] border border-gray-100">
									<span className="text-3xl font-black text-[#5D4037]">R$</span>
									<input
										type="number"
										className="bg-transparent w-full text-5xl font-black text-pink-400 outline-none"
										value={valorEdit}
										onChange={(e) => setValorEdit(e.target.value)}
									/>
								</div>

								<div className="space-y-2">
									<label className="text-[10px] font-black uppercase text-gray-400 ml-6">
										Data do Lançamento
									</label>
									<input
										type="date"
										className="w-full p-6 bg-[#FCF8F8] rounded-[30px] border border-gray-100 font-black text-[#5D4037] outline-none focus:border-pink-200"
										value={dataEdit}
										onChange={(e) => setDataEdit(e.target.value)}
									/>
								</div>

								<div className="flex gap-4 pt-6">
									<button
										onClick={handleUpdate}
										className="flex-1 bg-[#5D4037] text-white py-6 rounded-[30px] font-black text-xl hover:scale-[1.02] active:scale-[0.98] shadow-xl flex items-center justify-center gap-3 transition-all">
										<Save size={24} /> SALVAR ALTERAÇÕES
									</button>
									<button
										onClick={handleDelete}
										className="bg-pink-50 text-pink-400 px-10 rounded-[30px] hover:bg-pink-100 border border-pink-100 transition-colors"
										title="Excluir Gasto">
										<Trash2 size={28} />
									</button>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
