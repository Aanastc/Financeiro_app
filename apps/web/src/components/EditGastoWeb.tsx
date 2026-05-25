import { useState, useEffect, useMemo } from "react";
import {
	X,
	Trash2,
	Save,
	ShoppingBag,
	Search,
	CreditCard,
	Info,
	CalendarDays,
	Tag,
	Layers,
	ChevronRight,
	AlertCircle,
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
	"Presente",
	"Beleza",
	"Outros",
];
const TIPOS_PADRAO = ["Renda fixa (essencial)", "Renda variável", "Lazer"];

interface EditGastoWebProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess: () => void;
	dataSnapshot: any[];
}

export function EditGastoWeb({
	isOpen,
	onClose,
	onSuccess,
	dataSnapshot,
}: EditGastoWebProps) {
	const [searchTerm, setSearchTerm] = useState("");
	const [itemSelecionado, setItemSelecionado] = useState<any>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	const [cartoes, setCartoes] = useState<any[]>([]);

	// Estados do formulário
	const [formEdit, setFormEdit] = useState({
		descricao: "",
		valor: "",
		data: "",
		classificacao: "Variável",
		categoria: "Outros",
		tipo: "Renda fixa (essencial)",
		metodo_pagamento: "Débito",
		cartao_id: "",
		parcelas: "1",
		observacao: "",
	});

	const carregarCartoes = async () => {
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
			const { data } = await supabase.from("cartoes").select("*").eq("usuario_id", user.id).order("nome");
			setCartoes(data || []);
		}
	};

	// Resetar estados ao fechar/abrir
	useEffect(() => {
		if (isOpen) {
			carregarCartoes();
		} else {
			setSearchTerm("");
			setItemSelecionado(null);
		}
	}, [isOpen]);

	// Filtro de histórico lateral (busca por descrição ou categoria)
	const ocorrencias = useMemo(() => {
		return dataSnapshot
			.filter(
				(i: any) =>
					i.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
					i.categoria.toLowerCase().includes(searchTerm.toLowerCase()) ||
					(i.observacao && i.observacao.toLowerCase().includes(searchTerm.toLowerCase())),
			)
			.sort(
				(a: any, b: any) =>
					new Date(b.data).getTime() - new Date(a.data).getTime(),
			);
	}, [dataSnapshot, searchTerm]);

	const formatCurrency = (v: string) => {
		const n = v.replace(/\D/g, "");
		return new Intl.NumberFormat("pt-BR", {
			minimumFractionDigits: 2,
		}).format(parseFloat(n || "0") / 100);
	};

	// Cálculos de Parcelamento em tempo real
	const previewParcelamento = () => {
		if (formEdit.metodo_pagamento !== "Crédito") return null;
		const valorTotal = parseFloat(formEdit.valor.replace(/\./g, "").replace(",", ".")) || 0;
		const numParcelas = parseInt(formEdit.parcelas) || 1;
		if (numParcelas <= 1) return null;

		const valorParcela = valorTotal / numParcelas;
		const dataFinal = new Date(formEdit.data + "T12:00:00");
		dataFinal.setMonth(dataFinal.getMonth() + (numParcelas - 1));

		const mesFinal = dataFinal.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

		return {
			valor: valorParcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
			mesFinal: mesFinal.charAt(0).toUpperCase() + mesFinal.slice(1)
		};
	};

	const preview = previewParcelamento();

	const selecionarRegistro = (item: any) => {
		setItemSelecionado(item);
		// Inicializa o valor já formatado
		const valorStr = (item.valor * 100).toFixed(0);
		setFormEdit({
			descricao: item.descricao,
			valor: formatCurrency(valorStr),
			data: item.data,
			classificacao: item.classificacao || "Variável",
			categoria: item.categoria || "Outros",
			tipo: item.tipo || "Renda fixa (essencial)",
			metodo_pagamento: item.metodo_pagamento || "Débito",
			cartao_id: item.cartao_id || "",
			parcelas: (item.total_parcelas || 1).toString(),
			observacao: item.observacao || "",
		});
	};

	const handleUpdate = async () => {
		if (!itemSelecionado) return;
		const isCredito = formEdit.metodo_pagamento === "Crédito";
		try {
			const { error } = await supabase
				.from("gastos")
				.update({
					descricao: formEdit.descricao,
					valor: parseFloat(formEdit.valor.replace(/\./g, "").replace(",", ".")),
					data: formEdit.data,
					classificacao: formEdit.classificacao,
					categoria: formEdit.categoria,
					tipo: formEdit.tipo,
					metodo_pagamento: formEdit.metodo_pagamento,
					cartao_id: isCredito ? formEdit.cartao_id : null,
					total_parcelas: parseInt(formEdit.parcelas) || 1,
					considerar_soma: !isCredito,
					observacao: formEdit.observacao,
				})
				.eq("id", itemSelecionado.id);

			if (error) throw error;
			onSuccess();
			onClose();
		} catch (e: any) {
			alert("Erro ao atualizar: " + e.message);
		}
	};

	const handleDelete = async () => {
		if (
			!itemSelecionado ||
			!window.confirm("Apagar este lançamento definitivamente?")
		)
			return;

		setIsDeleting(true);
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
		} finally {
			setIsDeleting(false);
		}
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 bg-[#3D3030]/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
			<div className="bg-white w-full max-w-6xl rounded-[50px] shadow-2xl flex overflow-hidden h-[85vh] max-h-[800px] animate-in zoom-in-95 duration-300">
				{/* COLUNA ESQUERDA: EXPLORADOR DE LANÇAMENTOS */}
				<div className="w-80 lg:w-96 bg-[#FDFBFB] border-r border-gray-100 flex flex-col">
					<div className="p-8 pb-4">
						<h3 className="text-xl font-black text-[#3D3030] flex items-center gap-2 mb-6">
							<Search size={20} className="text-pink-500" /> Explorar
						</h3>

						<div className="relative group">
							<input
								type="text"
								placeholder="Buscar despesa..."
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								className="w-full p-4 bg-white rounded-2xl border-2 border-gray-100 text-sm font-bold text-[#3D3030] outline-none focus:border-pink-400 transition-all pl-12"
							/>
							<Search
								size={18}
								className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300"
							/>
						</div>
					</div>

					<div className="flex-1 overflow-y-auto px-6 space-y-3 pb-8 custom-scrollbar">
						{ocorrencias.length > 0 ? (
							ocorrencias.map((item: any) => (
								<button
									key={item.id}
									onClick={() => selecionarRegistro(item)}
									className={`w-full p-5 rounded-3xl flex flex-col gap-2 border-2 transition-all text-left ${
										itemSelecionado?.id === item.id
											? "border-pink-500 bg-white shadow-xl translate-x-2"
											: "border-transparent bg-white/50 hover:bg-white"
									}`}>
									<div className="flex justify-between items-start">
										<span className="font-black text-[#3D3030] truncate max-w-[150px]">
											{item.descricao}
										</span>
										<div className="text-right">
											<span className="text-pink-500 font-black text-sm block">
												R$ {Number(item.valor).toLocaleString()}
											</span>
											{item.total_parcelas > 1 && (
												<span className="text-[9px] bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full font-black">
													{item.parcela_atual}/{item.total_parcelas}
												</span>
											)}
										</div>
									</div>
									<div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase">
										<span>
											{new Date(item.data + "T12:00:00").toLocaleDateString(
												"pt-BR",
											)}
										</span>
										<span className="bg-gray-100 px-2 py-0.5 rounded-lg">
											{item.categoria}
										</span>
									</div>
								</button>
							))
						) : (
							<div className="py-20 text-center opacity-30">
								<AlertCircle
									size={40}
									className="mx-auto mb-2 text-[#3D3030]"
								/>
								<p className="text-xs font-bold uppercase">Nenhum registro</p>
							</div>
						)}
					</div>
				</div>

				{/* COLUNA DIREITA: FORMULÁRIO DE EDIÇÃO */}
				<div className="flex-1 p-12 relative flex flex-col bg-white overflow-y-auto">
					<button
						onClick={onClose}
						className="absolute top-8 right-8 text-gray-300 hover:text-pink-500 transition-transform hover:rotate-90">
						<X size={32} />
					</button>

					{!itemSelecionado ? (
						<div className="h-full flex flex-col items-center justify-center text-center">
							<div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6">
								<ShoppingBag size={40} className="text-gray-200" />
							</div>
							<h2 className="text-2xl font-black text-[#3D3030]">
								Selecione um lançamento
							</h2>
							<p className="text-gray-400 font-bold text-sm uppercase tracking-widest mt-2">
								Para visualizar ou alterar os detalhes
							</p>
						</div>
					) : (
						<div className="space-y-8 animate-in fade-in slide-in-from-right-4">
							{/* HEADER DE EDIÇÃO & ALERTA DE PARCELA */}
							<div className="space-y-4">
								<div className="flex items-center gap-3">
									<span className="bg-pink-100 text-pink-500 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
										Modo de Edição
									</span>
									{itemSelecionado.total_parcelas > 1 && (
										<div className="flex items-center gap-2 bg-amber-50 text-amber-600 px-4 py-1 rounded-full text-[10px] font-black uppercase border border-amber-100">
											<CreditCard size={12} /> Parcela{" "}
											{itemSelecionado.parcela_atual} de{" "}
											{itemSelecionado.total_parcelas}
										</div>
									)}
								</div>

								{itemSelecionado.total_parcelas > 1 && (
									<div className="bg-amber-50/50 p-4 rounded-2xl flex items-start gap-3 border border-amber-100/50">
										<Info size={16} className="text-amber-500 mt-0.5" />
										<p className="text-[11px] text-amber-700 font-medium leading-relaxed">
											Este gasto faz parte de um parcelamento. Alterações feitas
											aqui afetarão{" "}
											<strong>apenas a parcela selecionada</strong> (
											{itemSelecionado.parcela_atual}).
										</p>
									</div>
								)}
							</div>

							{/* CAMPOS PRINCIPAIS */}
							<div className="space-y-6">
								<div className="space-y-2">
									<label className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-400 ml-2">
										<Tag size={12} /> Descrição do Gasto
									</label>
									<input
										type="text"
										className="w-full text-4xl font-black text-[#3D3030] outline-none border-b-4 border-transparent focus:border-pink-100 pb-2 transition-all"
										value={formEdit.descricao}
										onChange={(e) =>
											setFormEdit({ ...formEdit, descricao: e.target.value })
										}
									/>
								</div>

								<div className="grid grid-cols-2 gap-8">
									<div className="space-y-2">
										<label className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-400 ml-2">
											<ChevronRight size={12} className="text-pink-500" /> Valor
										</label>
										<div className="bg-gray-50 p-6 rounded-[30px] flex items-center gap-3 border-2 border-transparent focus-within:border-pink-200 transition-all">
											<span className="text-2xl font-black text-gray-300">
												R$
											</span>
											<input
												type="text"
												className="bg-transparent w-full text-3xl font-black text-[#3D3030] outline-none"
												value={formEdit.valor}
												onChange={(e) =>
													setFormEdit({ ...formEdit, valor: formatCurrency(e.target.value) })
												}
											/>
										</div>
									</div>

									<div className="space-y-2">
										<label className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-400 ml-2">
											<CalendarDays size={12} /> Data
										</label>
										<input
											type="date"
											className="w-full p-6 bg-gray-50 rounded-[30px] font-black text-[#3D3030] outline-none border-2 border-transparent focus:border-pink-200 transition-all"
											value={formEdit.data}
											onChange={(e) =>
												setFormEdit({ ...formEdit, data: e.target.value })
											}
										/>
									</div>
								</div>

								{/* FORMA DE PAGAMENTO */}
								<div className="space-y-2">
									<label className="text-[10px] font-black uppercase text-gray-400 ml-2">Forma de Pagamento</label>
									<div className="flex gap-2">
										{[
											{ id: "Débito", icon: <Layers size={14} /> },
											{ id: "Crédito", icon: <CreditCard size={14} /> },
										].map((m) => (
											<button
												key={m.id}
												onClick={() => setFormEdit({ ...formEdit, metodo_pagamento: m.id })}
												className={`flex-1 p-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${
													formEdit.metodo_pagamento === m.id
														? "bg-pink-500 text-white shadow-lg"
														: "bg-gray-50 text-gray-400"
												}`}>
												{m.icon} {m.id}
											</button>
										))}
									</div>
								</div>

								{/* CAMPOS DE CRÉDITO */}
								{formEdit.metodo_pagamento === "Crédito" && (
									<div className="grid grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-300">
										<div className="space-y-2">
											<label className="text-[10px] font-black uppercase text-gray-400 ml-2">Cartão</label>
											<select
												className="w-full p-5 bg-pink-50/50 rounded-2xl font-bold text-[#3D3030] border-2 border-transparent focus:border-pink-200 outline-none"
												value={formEdit.cartao_id}
												onChange={(e) => setFormEdit({ ...formEdit, cartao_id: e.target.value })}>
												<option value="">Qual cartão?</option>
												{cartoes.map((c) => (
													<option key={c.id} value={c.id}>{c.nome}</option>
												))}
											</select>
										</div>
										<div className="space-y-2">
											<label className="text-[10px] font-black uppercase text-gray-400 ml-2">Total de Parcelas</label>
											<input
												type="number"
												min="1"
												className="w-full p-5 bg-pink-50/50 rounded-2xl font-bold text-[#3D3030] border-2 border-transparent focus:border-pink-200 outline-none"
												value={formEdit.parcelas}
												onChange={(e) => setFormEdit({ ...formEdit, parcelas: e.target.value })}
											/>
										</div>

										{preview && (
											<div className="col-span-2 p-4 bg-white/60 rounded-2xl border border-pink-200 animate-in zoom-in duration-300">
												<div className="flex justify-between items-end">
													<div>
														<p className="text-[10px] font-bold text-gray-400 uppercase">Valor por Parcela</p>
														<p className="text-xl font-black text-pink-600">{preview.valor}</p>
													</div>
													<div className="text-right">
														<p className="text-[10px] font-bold text-gray-400 uppercase">Finaliza em</p>
														<p className="text-sm font-black text-[#3D3030]">{preview.mesFinal}</p>
													</div>
												</div>
											</div>
										)}
									</div>
								)}

								{/* CATEGORIAS E SELETORES */}
								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									<div className="space-y-2">
										<label className="text-[10px] font-black uppercase text-gray-400 ml-2">
											Categoria
										</label>
										<select
											className="w-full p-6 bg-gray-50 rounded-2xl font-bold text-[#3D3030] outline-none border-2 border-transparent focus:border-pink-400 appearance-none cursor-pointer"
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
										<label className="text-[10px] font-black uppercase text-gray-400 ml-2">
											Tipo de Orçamento
										</label>
										<select
											className="w-full p-6 bg-gray-50 rounded-2xl font-bold text-[#3D3030] outline-none border-2 border-transparent focus:border-pink-400 appearance-none cursor-pointer"
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

								{/* OBSERVAÇÃO */}
								<div className="space-y-2">
									<label className="text-[10px] font-black uppercase text-gray-400 ml-2">
										Observação / Detalhes
									</label>
									<textarea
										className="w-full p-6 bg-gray-50 rounded-[30px] font-bold text-[#3D3030] outline-none border-2 border-transparent focus:border-pink-200 transition-all resize-none h-32"
										placeholder="Detalhes adicionais ou texto bruto do banco..."
										value={formEdit.observacao}
										onChange={(e) => setFormEdit({ ...formEdit, observacao: e.target.value })}
									/>
								</div>
							</div>

							{/* AÇÕES FINAIS */}
							<div className="flex gap-4 pt-8 mt-auto">
								<button
									onClick={handleUpdate}
									className="flex-[3] bg-[#3D3030] text-white py-7 rounded-[35px] font-black text-xl hover:bg-black shadow-2xl shadow-gray-200 flex items-center justify-center gap-3 transition-all active:scale-[0.98]">
									<Save size={24} /> SALVAR ALTERAÇÕES
								</button>
								<button
									onClick={handleDelete}
									disabled={isDeleting}
									className="flex-1 bg-white text-red-400 py-7 rounded-[35px] font-black hover:bg-red-50 border-2 border-red-50 transition-all flex items-center justify-center disabled:opacity-50"
									title="Excluir Permanentemente">
									{isDeleting ? (
										<div className="w-6 h-6 border-4 border-red-200 border-t-red-500 rounded-full animate-spin" />
									) : (
										<Trash2 size={28} />
									)}
								</button>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
