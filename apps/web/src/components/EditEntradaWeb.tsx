import { useState, useEffect } from "react";
import { X, Trash2, Save, Calendar, Search, Edit3, AlertCircle } from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import toast from "react-hot-toast";

export function EditEntradaWeb({
	isOpen,
	onClose,
	onSuccess,
	dataSnapshot,
	categorias,
	initialSearchTerm,
}: any) {
	const [filtroDesc, setFiltroDesc] = useState("");
	const [itemSelecionado, setItemSelecionado] = useState<any>(null);
	const [valorEdit, setValorEdit] = useState("");
	const [dataEdit, setDataEdit] = useState("");
	const [descEdit, setDescEdit] = useState("");
	const [contaEdit, setContaEdit] = useState("");
	const [novoNomeCategoria, setNovoNomeCategoria] = useState("");

	const [contas, setContas] = useState<any[]>([]);

	const ocorrencias = dataSnapshot
		.filter((i: any) => i.descricao === filtroDesc)
		.sort(
			(a: any, b: any) =>
				new Date(b.data).getTime() - new Date(a.data).getTime(),
		);

	const carregarContas = async () => {
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
			const contasData = await financeService.getContasBancarias(user.id);
			setContas(contasData || []);
		}
	};

	useEffect(() => {
		if (isOpen) {
			carregarContas();
			if (initialSearchTerm) {
				setFiltroDesc(initialSearchTerm);
			}
		} else {
			setFiltroDesc("");
			setItemSelecionado(null);
		}
	}, [isOpen, initialSearchTerm]);

	const selecionarRegistro = (item: any) => {
		setItemSelecionado(item);
		setValorEdit(item.valor.toString());
		setDataEdit(item.data);
		setDescEdit(item.descricao);
		setContaEdit(item.conta_id || "");
	};

	const handleUpdate = async () => {
		if (!itemSelecionado) return;
		if (!descEdit.trim()) {
			alert("Informe uma categoria.");
			return;
		}
		if (!contaEdit) {
			alert("Informe uma conta bancária.");
			return;
		}
		await supabase
			.from("transacoes")
			.update({
				descricao: descEdit.trim(),
				valor: parseFloat(valorEdit),
				data: dataEdit,
				conta_id: contaEdit,
			})
			.eq("id", itemSelecionado.id);
		toast.success("Lançamento atualizado!");
		onSuccess();
		onClose();
	};

	const handleRenomearCategoria = async () => {
		if (!filtroDesc || !novoNomeCategoria.trim() || filtroDesc === novoNomeCategoria.trim()) return;
		
		const { data: { user } } = await supabase.auth.getUser();
		if (!user) return;

		if (!confirm(`Deseja alterar a categoria "${filtroDesc}" para "${novoNomeCategoria.trim()}" em todos os lançamentos?`)) return;

		try {
			const { error } = await supabase
				.from("transacoes")
				.update({ descricao: novoNomeCategoria.trim() })
				.eq("usuario_id", user.id)
				.eq("descricao", filtroDesc)
				.eq("tipo", "RECEITA");

			if (error) throw error;
			
			toast.success("Categoria renomeada com sucesso!");
			setFiltroDesc(novoNomeCategoria.trim());
			onSuccess();
		} catch (err) {
			console.error(err);
			alert("Erro ao renomear categoria.");
		}
	};

	const handleDelete = async () => {
		if (
			!itemSelecionado ||
			!confirm("Deseja apagar este registro permanentemente?")
		)
			return;
		await supabase.from("transacoes").delete().eq("id", itemSelecionado.id);
		onSuccess();
		onClose();
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true">
			<div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-3xl sm:rounded-[40px] shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in zoom-in duration-300 h-[95vh] md:h-[650px] max-h-[95vh] md:max-h-[650px] border border-slate-105 dark:border-slate-850 transition-colors duration-200">
				{/* BUSCA */}
				<div className="w-full md:w-2/5 bg-slate-50 dark:bg-slate-950 p-6 md:p-10 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 flex flex-col h-[45%] md:h-full shrink-0 overflow-hidden">
					<h3 className="text-xl md:text-2xl font-black text-slate-850 dark:text-slate-100 mb-4 md:mb-8 flex items-center gap-2">
						<Search size={20} className="text-emerald-500" /> Localizar
					</h3>

					<div className="space-y-4 md:space-y-6 flex-1 flex flex-col overflow-hidden">
						<div>
							<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2 block">
								1. Escolha a Categoria
							</label>
							<select
								className="w-full mt-2 p-3.5 bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 outline-none text-sm cursor-pointer"
								value={filtroDesc}
								onChange={(e) => {
									setFiltroDesc(e.target.value);
									setItemSelecionado(null);
									setNovoNomeCategoria(e.target.value);
								}}>
								<option value="">Selecione...</option>
								{categorias.map((c: string) => (
									<option key={c} value={c}>
										{c}
									</option>
								))}
							</select>

							{filtroDesc && (
								<div className="mt-3 flex gap-2 animate-in slide-in-from-top-2 duration-300">
									<input
										type="text"
										className="flex-1 p-3 bg-white dark:bg-slate-850 rounded-2xl font-bold text-slate-700 dark:text-slate-200 outline-none border border-slate-200 dark:border-slate-700 text-sm"
										value={novoNomeCategoria}
										onChange={(e) => setNovoNomeCategoria(e.target.value)}
										placeholder="Novo nome..."
									/>
									<button
										onClick={handleRenomearCategoria}
										className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-xs cursor-pointer transition-colors"
									>
										Renomear
									</button>
								</div>
							)}
						</div>

						<div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
							<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2 block">
								2. Selecione o Lançamento
							</label>
							{ocorrencias.map((item: any) => {
								const isOrphan = !item.conta_id;
								return (
								<button
									key={item.id}
									onClick={() => selecionarRegistro(item)}
									className={`w-full p-4 rounded-2xl flex justify-between items-center transition-all border-2 cursor-pointer ${itemSelecionado?.id === item.id ? "border-emerald-500 bg-white dark:bg-slate-800 shadow-md" : "border-transparent bg-white/40 dark:bg-slate-900/40 hover:bg-white/80 dark:hover:bg-slate-800/80"}`}>
									<div className="text-left w-full">
										<p className="font-black text-slate-800 dark:text-slate-200 text-sm">
											R$ {Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
										</p>
										<div className="flex justify-between items-center mt-0.5">
											<p className="text-[10px] text-slate-400 dark:text-slate-550 flex items-center gap-1 font-bold">
												<Calendar size={10} />{" "}
												{new Date(item.data + "T12:00:00").toLocaleDateString(
													"pt-BR",
												)}
											</p>
											{isOrphan && (
												<span className="bg-rose-500/10 text-rose-500 px-1.5 py-0.5 rounded flex items-center gap-1 text-[8px]" title="Não vinculado à conta">
													<AlertCircle size={10} /> S/ CONTA
												</span>
											)}
										</div>
									</div>
								</button>
								);
							})}
						</div>
					</div>
				</div>

				{/* FORMULÁRIO */}
				<div className="w-full md:w-3/5 p-6 md:p-12 relative flex flex-col justify-center bg-white dark:bg-slate-900 overflow-y-auto h-[55%] md:h-full">
					<button
						onClick={onClose}
						className="absolute top-6 right-6 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 transition-colors cursor-pointer">
						<X size={20} />
					</button>

					{!itemSelecionado ? (
						<div className="text-center space-y-4 opacity-20">
							<Edit3 size={60} className="mx-auto text-slate-400" />
							<p className="font-black text-lg text-slate-500">
								Selecione um item para editar
							</p>
						</div>
					) : (
						<div className="animate-in fade-in slide-in-from-right-8 space-y-6">
							<div>
								<span className="bg-emerald-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
									Registro Ativo
								</span>
								<h2 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 mt-2.5">
									{itemSelecionado.descricao}
								</h2>
							</div>

							<div className="space-y-4">
								<div className="space-y-1.5">
									<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2">
										Categoria
									</label>
									<input
										list="edit-entradas-categorias-list"
										type="text"
										className="w-full p-4 bg-slate-50 dark:bg-slate-850 border border-slate-205 dark:border-slate-700 rounded-2xl font-bold text-slate-700 dark:text-slate-200 outline-none text-sm focus:border-emerald-500 transition-colors"
										value={descEdit}
										onChange={(e) => setDescEdit(e.target.value)}
										placeholder="Digite ou selecione a categoria..."
									/>
									<datalist id="edit-entradas-categorias-list">
										{categorias.map((c: string) => (
											<option key={c} value={c} />
										))}
									</datalist>
								</div>

								<div className="space-y-1.5">
									<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2">
										Novo Valor
									</label>
									<div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-850 p-4 rounded-2xl border border-slate-205 dark:border-slate-700">
										<span className="text-xl font-black text-slate-500 dark:text-slate-400">
											R$
										</span>
										<input
											type="number"
											step="0.01"
											className="bg-transparent w-full text-3xl font-black text-emerald-600 dark:text-emerald-450 outline-none"
											value={valorEdit}
											onChange={(e) => setValorEdit(e.target.value)}
										/>
									</div>
								</div>

								<div className="space-y-1.5">
									<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2">
										Data do Lançamento
									</label>
									<input
										type="date"
										className="w-full p-4 bg-slate-50 dark:bg-slate-850 border border-slate-205 dark:border-slate-700 rounded-2xl font-bold text-slate-700 dark:text-slate-200 outline-none text-sm focus:border-emerald-500 transition-colors"
										value={dataEdit}
										onChange={(e) => setDataEdit(e.target.value)}
									/>
								</div>

								<div className="space-y-1.5">
									<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2">Conta de Destino</label>
									<select
										className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl font-bold text-slate-700 dark:text-slate-200 border border-slate-205 dark:border-slate-700 focus:border-emerald-500 outline-none text-sm cursor-pointer"
										value={contaEdit}
										onChange={(e) => setContaEdit(e.target.value)}>
										<option value="">Selecione a conta...</option>
										{contas.map((c) => (
											<option key={c.id} value={c.id}>{c.nome}</option>
										))}
									</select>
								</div>

								<div className="flex gap-3 pt-4 shrink-0">
									<button
										onClick={handleUpdate}
										className="flex-1 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white py-4.5 rounded-2xl font-black text-sm hover:scale-[1.01] transition-all flex items-center justify-center gap-2 cursor-pointer uppercase">
										<Save size={18} /> ATUALIZAR
									</button>
									<button
										onClick={handleDelete}
										className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/35 text-rose-500 dark:text-rose-455 px-6 rounded-2xl transition-colors border border-rose-100 dark:border-rose-900/50 cursor-pointer">
										<Trash2 size={20} />
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
