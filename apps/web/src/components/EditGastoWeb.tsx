import { useState, useEffect } from "react";
import {
	X,
	Trash2,
	Save,
	Calendar,
	ShoppingBag,
	Search,
	ChevronDown,
} from "lucide-react";
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

export function EditGastoWeb({
	isOpen,
	onClose,
	onSuccess,
	dataSnapshot,
}: any) {
	const [filtroDesc, setFiltroDesc] = useState("");
	const [itemSelecionado, setItemSelecionado] = useState<any>(null);
	const [showSugestoes, setShowSugestoes] = useState(false);

	// Estados do formulário refletindo EXATAMENTE a tabela public.gastos
	const [formEdit, setFormEdit] = useState({
		descricao: "",
		valor: "",
		data: "",
		classificacao: "Variável",
		categoria: "Outros",
		tipo: "Essencial",
	});

	// Filtra descrições únicas para a busca lateral
	const descricoesUnicas = Array.from(
		new Set(dataSnapshot.map((i: any) => i.descricao)),
	).filter((d: any) => !d.toLowerCase().includes("ative o rls"));

	// Filtra as ocorrências da descrição selecionada
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
		setFormEdit({
			descricao: item.descricao,
			valor: item.valor.toString(),
			data: item.data,
			classificacao: item.classificacao,
			categoria: item.categoria,
			tipo: item.tipo || "Essencial",
		});
	};

	const handleUpdate = async () => {
		if (!itemSelecionado) return;
		try {
			const { error } = await supabase
				.from("gastos")
				.update({
					descricao: formEdit.descricao,
					valor: parseFloat(formEdit.valor.replace(",", ".")),
					data: formEdit.data,
					classificacao: formEdit.classificacao,
					categoria: formEdit.categoria,
					tipo: formEdit.tipo,
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
		if (!itemSelecionado || !confirm("Apagar este registro definitivamente?"))
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
			<div className="bg-white w-full max-w-6xl rounded-[50px] shadow-2xl flex overflow-hidden h-[780px]">
				{/* LADO ESQUERDO: BUSCA (FILTRO) */}
				<div className="w-1/3 bg-[#FCF8F8] p-10 border-r border-gray-100 flex flex-col">
					<div className="flex items-center gap-2 mb-8">
						<Search size={24} className="text-pink-400" />
						<h3 className="text-2xl font-black text-[#5D4037]">Buscar</h3>
					</div>

					<div className="relative mb-6">
						<button
							onClick={() => setShowSugestoes(!showSugestoes)}
							className="w-full p-5 bg-white rounded-3xl shadow-sm font-bold text-[#5D4037] flex justify-between items-center border-2 border-transparent hover:border-pink-200 transition-all">
							<span className="truncate">
								{filtroDesc || "Escolha o gasto..."}
							</span>
							<ChevronDown size={20} className="text-gray-400" />
						</button>

						{showSugestoes && (
							<div className="absolute z-[110] w-full bg-white border-2 border-pink-100 rounded-3xl shadow-xl max-h-60 overflow-y-auto mt-2">
								{descricoesUnicas.map((desc: any, index) => (
									<button
										key={index}
										className="w-full text-left p-4 hover:bg-pink-50 font-bold text-[#5D4037] border-b border-gray-50 last:border-0"
										onClick={() => {
											setFiltroDesc(desc);
											setShowSugestoes(false);
											setItemSelecionado(null);
										}}>
										{desc}
									</button>
								))}
							</div>
						)}
					</div>

					<div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
						{ocorrencias.map((item: any) => (
							<button
								key={item.id}
								onClick={() => selecionarRegistro(item)}
								className={`w-full p-5 rounded-3xl flex justify-between items-center border-2 transition-all ${itemSelecionado?.id === item.id ? "border-pink-400 bg-white shadow-md" : "border-transparent bg-white/50"}`}>
								<div className="text-left">
									<p className="font-black text-[#5D4037]">
										R${" "}
										{Number(item.valor).toLocaleString("pt-BR", {
											minimumFractionDigits: 2,
										})}
									</p>
									<p className="text-[10px] text-gray-400 font-bold uppercase">
										{new Date(item.data + "T12:00:00").toLocaleDateString(
											"pt-BR",
										)}
									</p>
								</div>
							</button>
						))}
					</div>
				</div>

				{/* LADO DIREITO: FORMULÁRIO DE EDIÇÃO COMPLETO */}
				<div className="w-2/3 p-12 relative flex flex-col bg-white overflow-y-auto">
					<button
						onClick={onClose}
						className="absolute top-8 right-8 text-gray-300 hover:text-pink-400 transition-transform hover:rotate-90">
						<X size={32} />
					</button>

					{!itemSelecionado ? (
						<div className="h-full flex flex-col items-center justify-center text-center opacity-30">
							<ShoppingBag size={80} className="mb-4 text-[#5D4037]" />
							<p className="font-black text-xl text-[#5D4037]">
								Selecione um lançamento
								<br />
								para editar
							</p>
						</div>
					) : (
						<div className="space-y-6 animate-in fade-in slide-in-from-right-4">
							<header>
								<span className="bg-pink-100 text-pink-500 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
									Editando Gasto
								</span>
								<div className="mt-4 space-y-1">
									<label className="text-[10px] font-black uppercase text-gray-400 ml-2">
										Descrição do Gasto
									</label>
									<input
										type="text"
										className="w-full text-4xl font-black text-[#5D4037] outline-none border-b-2 border-transparent focus:border-pink-200 pb-2"
										value={formEdit.descricao}
										onChange={(e) =>
											setFormEdit({ ...formEdit, descricao: e.target.value })
										}
									/>
								</div>
							</header>

							{/* VALOR E DATA */}
							<div className="grid grid-cols-2 gap-6">
								<div className="space-y-2">
									<label className="text-[10px] font-black uppercase text-gray-400 ml-4">
										Valor
									</label>
									<div className="bg-[#FCF8F8] p-6 rounded-[30px] flex items-center gap-3 border-2 border-transparent focus-within:border-pink-200 transition-all">
										<span className="text-2xl font-black text-[#5D4037]">
											R$
										</span>
										<input
											type="number"
											className="bg-transparent w-full text-4xl font-black text-pink-500 outline-none"
											value={formEdit.valor}
											onChange={(e) =>
												setFormEdit({ ...formEdit, valor: e.target.value })
											}
										/>
									</div>
								</div>
								<div className="space-y-2">
									<label className="text-[10px] font-black uppercase text-gray-400 ml-4">
										Data
									</label>
									<input
										type="date"
										className="w-full p-6 bg-[#FCF8F8] h-[88px] rounded-[30px] font-black text-[#5D4037] outline-none border-2 border-transparent focus:border-pink-200 transition-all"
										value={formEdit.data}
										onChange={(e) =>
											setFormEdit({ ...formEdit, data: e.target.value })
										}
									/>
								</div>
							</div>

							{/* CLASSIFICAÇÃO (FIXO/VARIÁVEL) */}
							<div className="space-y-2">
								<label className="text-[10px] font-black uppercase text-gray-400 ml-4">
									Classificação
								</label>
								<div className="flex gap-2">
									{["Fixo", "Variável"].map((opt) => (
										<button
											key={opt}
											onClick={() =>
												setFormEdit({ ...formEdit, classificacao: opt })
											}
											className={`flex-1 p-5 rounded-2xl font-black transition-all ${formEdit.classificacao === opt ? "bg-[#5D4037] text-white shadow-xl scale-[1.02]" : "bg-gray-100 text-gray-400 hover:bg-gray-200"}`}>
											{opt}
										</button>
									))}
								</div>
							</div>

							{/* CATEGORIA E TIPO */}
							<div className="grid grid-cols-2 gap-6">
								<div className="space-y-2">
									<label className="text-[10px] font-black uppercase text-gray-400 ml-4">
										Categoria
									</label>
									<select
										className="w-full p-6 bg-[#FCF8F8] rounded-[30px] font-black text-[#5D4037] outline-none border-2 border-transparent focus:border-pink-200"
										value={formEdit.categoria}
										onChange={(e) =>
											setFormEdit({ ...formEdit, categoria: e.target.value })
										}>
										{CATEGORIAS_PADRAO.map((c) => (
											<option key={c} value={c}>
												{c}
											</option>
										))}
									</select>
								</div>
								<div className="space-y-2">
									<label className="text-[10px] font-black uppercase text-gray-400 ml-4">
										Tipo de Gasto
									</label>
									<select
										className="w-full p-6 bg-[#FCF8F8] rounded-[30px] font-black text-[#5D4037] outline-none border-2 border-transparent focus:border-pink-200"
										value={formEdit.tipo}
										onChange={(e) =>
											setFormEdit({ ...formEdit, tipo: e.target.value })
										}>
										{TIPOS_PADRAO.map((t) => (
											<option key={t} value={t}>
												{t}
											</option>
										))}
									</select>
								</div>
							</div>

							{/* BOTÕES DE AÇÃO */}
							<div className="flex gap-4 pt-6">
								<button
									onClick={handleUpdate}
									className="flex-1 bg-[#5D4037] text-white py-7 rounded-[35px] font-black text-xl hover:bg-black shadow-2xl flex items-center justify-center gap-3 transition-all active:scale-95">
									<Save size={24} /> SALVAR ALTERAÇÕES
								</button>
								<button
									onClick={handleDelete}
									className="bg-pink-50 text-pink-400 px-10 rounded-[35px] hover:bg-pink-500 hover:text-white border-2 border-pink-100 transition-all active:scale-95"
									title="Excluir Permanentemente">
									<Trash2 size={28} />
								</button>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
