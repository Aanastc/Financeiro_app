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
		metodo_pagamento: "Débito/Pix",
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
			metodo_pagamento: item.metodo_pagamento === "Pix" || item.metodo_pagamento === "Débito" ? "Débito/Pix" : item.metodo_pagamento || "Débito/Pix",
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
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true">
			<div className="bg-white dark:bg-slate-900 w-full max-w-6xl rounded-3xl sm:rounded-[40px] shadow-2xl flex flex-col md:flex-row overflow-hidden h-[95vh] md:h-[85vh] max-h-[95vh] md:max-h-[800px] border border-slate-105 dark:border-slate-850 transition-colors duration-200 animate-in zoom-in-95 duration-300">
				{/* COLUNA ESQUERDA: EXPLORAR DE LANÇAMENTOS */}
				<div className="w-full md:w-80 lg:w-96 bg-slate-55 dark:bg-slate-950 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 flex flex-col h-[40%] md:h-full shrink-0 overflow-hidden">
					<div className="p-6 pb-3">
						<h3 className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
							<Search size={20} className="text-rose-500" /> Explorar
						</h3>

						<div className="relative group">
							<input
								type="text"
								placeholder="Buscar despesa..."
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								className="w-full p-3.5 bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-750 dark:text-slate-200 outline-none focus:border-rose-500 transition-colors pl-10"
							/>
							<Search
								size={16}
								className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
							/>
						</div>
					</div>

					<div className="flex-1 overflow-y-auto px-5 space-y-3 pb-6 custom-scrollbar">
						{ocorrencias.length > 0 ? (
							ocorrencias.map((item: any) => (
								<button
									key={item.id}
									onClick={() => selecionarRegistro(item)}
									className={`w-full p-4 rounded-2xl flex flex-col gap-1.5 border-2 transition-all text-left cursor-pointer ${
										itemSelecionado?.id === item.id
											? "border-rose-500 bg-white dark:bg-slate-800 shadow-lg"
											: "border-transparent bg-white/40 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800"
									}`}>
									<div className="flex justify-between items-start gap-2">
										<span className="font-black text-slate-800 dark:text-slate-200 text-sm truncate max-w-[130px] sm:max-w-[160px]">
											{item.descricao}
										</span>
										<div className="text-right shrink-0">
											<span className="text-rose-500 dark:text-rose-455 font-black text-sm block">
												R$ {Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
											</span>
											{item.total_parcelas > 1 && (
												<span className="text-[9px] bg-rose-100 dark:bg-rose-955/35 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded-full font-black mt-0.5 inline-block">
													{item.parcela_atual}/{item.total_parcelas}
												</span>
											)}
										</div>
									</div>
									<div className="flex justify-between items-center text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mt-0.5">
										<span>
											{new Date(item.data + "T12:00:00").toLocaleDateString(
												"pt-BR",
											)}
										</span>
										<span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-lg">
											{item.categoria}
										</span>
									</div>
								</button>
							))
						) : (
							<div className="py-16 text-center opacity-30">
								<AlertCircle
									size={36}
									className="mx-auto mb-2 text-slate-400 dark:text-slate-500"
								/>
								<p className="text-xs font-bold uppercase text-slate-500">Nenhum registro</p>
							</div>
						)}
					</div>
				</div>

				{/* COLUNA DIREITA: FORMULÁRIO DE EDIÇÃO */}
				<div className="flex-1 p-6 md:p-10 relative flex flex-col bg-white dark:bg-slate-900 overflow-y-auto h-[60%] md:h-full">
					<button
						onClick={onClose}
						className="absolute top-6 right-6 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer">
						<X size={20} />
					</button>

					{!itemSelecionado ? (
						<div className="h-full flex flex-col items-center justify-center text-center opacity-25">
							<div className="w-20 h-20 bg-slate-50 dark:bg-slate-850 rounded-full flex items-center justify-center mb-4">
								<ShoppingBag size={36} className="text-slate-400" />
							</div>
							<h2 className="text-xl font-black text-slate-700 dark:text-slate-200">
								Selecione um lançamento
							</h2>
							<p className="text-slate-400 dark:text-slate-500 font-bold text-xs uppercase tracking-widest mt-1">
								Para visualizar ou alterar os detalhes
							</p>
						</div>
					) : (
						<div className="space-y-6 animate-in fade-in slide-in-from-right-4">
							{/* HEADER DE EDIÇÃO & ALERTA DE PARCELA */}
							<div className="space-y-3">
								<div className="flex flex-wrap items-center gap-2">
									<span className="bg-rose-100 dark:bg-rose-955/35 text-rose-650 dark:text-rose-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
										Modo de Edição
									</span>
									{itemSelecionado.total_parcelas > 1 && (
										<div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1 rounded-full text-[10px] font-black uppercase border border-amber-500/20">
											<CreditCard size={12} /> Parcela{" "}
											{itemSelecionado.parcela_atual} de{" "}
											{itemSelecionado.total_parcelas}
										</div>
									)}
								</div>

								{itemSelecionado.total_parcelas > 1 && (
									<div className="bg-amber-500/10 p-4 rounded-2xl flex items-start gap-2.5 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
										<Info size={14} className="shrink-0 mt-0.5" />
										<p>
											Este gasto faz parte de um parcelamento. Alterações feitas
											aqui afetarão <strong>apenas a parcela selecionada</strong> (
											{itemSelecionado.parcela_atual}).
										</p>
									</div>
								)}
							</div>

							{/* CAMPOS PRINCIPAIS */}
							<div className="space-y-5">
								<div className="space-y-1">
									<label className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2">
										<Tag size={12} /> Descrição do Gasto
									</label>
									<input
										type="text"
										className="w-full text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 outline-none border-b-2 border-slate-100 dark:border-slate-800 focus:border-rose-500 pb-1.5 transition-colors bg-transparent"
										value={formEdit.descricao}
										onChange={(e) =>
											setFormEdit({ ...formEdit, descricao: e.target.value })
										}
									/>
								</div>

								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
									<div className="space-y-1.5">
										<label className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2">
											<ChevronRight size={12} className="text-rose-500" /> Valor
										</label>
										<div className="bg-slate-50 dark:bg-slate-850 p-4 rounded-2xl flex items-center gap-3 border border-slate-200 dark:border-slate-700 focus-within:border-rose-500 transition-colors">
											<span className="text-lg font-black text-slate-450 dark:text-slate-500">
												R$
											</span>
											<input
												type="text"
												className="bg-transparent w-full text-2xl font-black text-slate-850 dark:text-slate-100 outline-none"
												value={formEdit.valor}
												onChange={(e) =>
													setFormEdit({ ...formEdit, valor: formatCurrency(e.target.value) })
												}
											/>
										</div>
									</div>

									<div className="space-y-1.5">
										<label className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2">
											<CalendarDays size={12} /> Data
										</label>
										<input
											type="date"
											className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl font-bold text-slate-705 dark:text-slate-200 outline-none border border-slate-205 dark:border-slate-700 focus:border-rose-500 transition-colors text-sm"
											value={formEdit.data}
											onChange={(e) =>
												setFormEdit({ ...formEdit, data: e.target.value })
											}
										/>
									</div>
								</div>

								{/* FORMA DE PAGAMENTO */}
								<div className="space-y-1.5">
									<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2 block">Forma de Pagamento</label>
									<div className="flex gap-2">
										{[
											{ id: "Débito/Pix", icon: <Layers size={14} /> },
											{ id: "Crédito", icon: <CreditCard size={14} /> },
										].map((m) => (
											<button
												key={m.id}
												type="button"
												onClick={() => setFormEdit({ ...formEdit, metodo_pagamento: m.id })}
												className={`flex-1 p-3 rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-all text-sm ${
													formEdit.metodo_pagamento === m.id
														? "bg-rose-500 text-white shadow-md shadow-rose-200/25 dark:shadow-none"
														: "bg-slate-50 dark:bg-slate-850 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700"
												}`}>
												{m.icon} {m.id}
											</button>
										))}
									</div>
								</div>

								{/* CAMPOS DE CRÉDITO */}
								{formEdit.metodo_pagamento === "Crédito" && (
									<div className="grid grid-cols-2 gap-4 bg-rose-500/10 dark:bg-rose-500/5 p-4 rounded-3xl border border-rose-500/20 animate-in slide-in-from-top-2 duration-300">
										<div className="space-y-1.5">
											<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2">Cartão</label>
											<select
												className="w-full p-3.5 bg-white dark:bg-slate-850 rounded-2xl font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 focus:border-rose-500 outline-none text-sm cursor-pointer"
												value={formEdit.cartao_id}
												onChange={(e) => setFormEdit({ ...formEdit, cartao_id: e.target.value })}>
												<option value="">Qual cartão?</option>
												{cartoes.map((c) => (
													<option key={c.id} value={c.id}>{c.nome}</option>
												))}
											</select>
										</div>
										<div className="space-y-1.5">
											<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2">Total de Parcelas</label>
											<input
												type="number"
												min="1"
												className="w-full p-3.5 bg-white dark:bg-slate-850 rounded-2xl font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 focus:border-rose-500 outline-none text-sm"
												value={formEdit.parcelas}
												onChange={(e) => setFormEdit({ ...formEdit, parcelas: e.target.value })}
											/>
										</div>

										{preview && (
											<div className="col-span-2 p-3 bg-white/80 dark:bg-slate-900/80 rounded-2xl border border-rose-500/20 animate-in zoom-in duration-300">
												<div className="flex justify-between items-end gap-4 text-xs">
													<div>
														<p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Parcelamento</p>
														<p className="text-sm sm:text-base font-black text-rose-500">
															{formEdit.parcelas}x de {preview.valor}
														</p>
													</div>
													<div className="text-right">
														<p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Finaliza em</p>
														<p className="text-xs font-black text-slate-700 dark:text-slate-200">{preview.mesFinal}</p>
													</div>
												</div>
											</div>
										)}
									</div>
								)}

								{/* CATEGORIAS E SELETORES */}
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
									<div className="space-y-1.5">
										<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2 block">
											Categoria
										</label>
										<select
											className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl font-bold text-slate-700 dark:text-slate-200 outline-none border border-slate-200 dark:border-slate-700 focus:border-rose-500 cursor-pointer text-sm"
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

									<div className="space-y-1.5">
										<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2 block">
											Tipo de Orçamento
										</label>
										<select
											className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl font-bold text-slate-705 dark:text-slate-205 outline-none border border-slate-200 dark:border-slate-700 focus:border-rose-500 cursor-pointer text-sm"
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
								<div className="space-y-1.5">
									<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2 block">
										Observação / Detalhes
									</label>
									<textarea
										className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl font-bold text-slate-700 dark:text-slate-200 outline-none border border-slate-205 dark:border-slate-700 focus:border-rose-500 transition-colors resize-none h-24 text-sm"
										placeholder="Detalhes adicionais ou texto bruto do banco..."
										value={formEdit.observacao}
										onChange={(e) => setFormEdit({ ...formEdit, observacao: e.target.value })}
									/>
								</div>
							</div>

							{/* AÇÕES FINAIS */}
							<div className="flex flex-col sm:flex-row gap-3 pt-6 shrink-0 mt-auto">
								<button
									onClick={handleUpdate}
									className="flex-[3] bg-rose-500 hover:bg-rose-600 dark:bg-rose-600 dark:hover:bg-rose-700 text-white py-4 sm:py-4.5 rounded-2xl font-black text-sm shadow-xl hover:shadow-rose-200/25 dark:shadow-none flex items-center justify-center gap-2 transition-all cursor-pointer uppercase order-1 sm:order-2">
									<Save size={18} /> SALVAR ALTERAÇÕES
								</button>
								<button
									onClick={handleDelete}
									disabled={isDeleting}
									className="flex-1 bg-white hover:bg-rose-50 dark:bg-slate-900 dark:hover:bg-rose-955/25 text-rose-500 dark:text-rose-455 py-4 sm:py-4.5 rounded-2xl font-black border border-rose-100 dark:border-rose-900/50 transition-colors flex items-center justify-center disabled:opacity-50 cursor-pointer order-2 sm:order-1"
									title="Excluir Permanentemente">
									{isDeleting ? (
										<div className="w-5 h-5 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
									) : (
										<span className="flex items-center gap-1"><Trash2 size={16} /> EXCLUIR</span>
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
