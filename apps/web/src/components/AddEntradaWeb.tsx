import { useState, useEffect } from "react";
import { X, Save, ArrowUpCircle, Edit3 } from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";

export function AddEntradaWeb({ isOpen, onClose, onSuccess, categorias }: any) {
	const [contas, setContas] = useState<any[]>([]);
	const [form, setForm] = useState({
		descricao: "",
		valor: "", // Ex: "1.700,06"
		data: new Date().toISOString().split("T")[0],
		conta_id: "",
	});

	const carregarContas = async () => {
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (user) {
			const contasData = await financeService.getContasBancarias(user.id);
			setContas(contasData || []);
			if (contasData && contasData.length === 1) {
				setForm(prev => ({ ...prev, conta_id: contasData[0].id }));
			}
		}
	};

	useEffect(() => {
		if (isOpen) {
			carregarContas();
		}
	}, [isOpen]);

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
				.from("receitas")
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
		if (!form.conta_id) {
			alert("Por favor, selecione uma Conta Bancária.");
			return;
		}

		const {
			data: { user },
		} = await supabase.auth.getUser();
		const descFinal = form.descricao;

		// CONVERSÃO PARA O BANCO: Remove pontos e troca vírgula por ponto
		// "1.700,06" -> "1700.06" -> 1700.06
		const valorLimpo = form.valor.replace(/\./g, "").replace(",", ".");
		const valorNumerico = parseFloat(valorLimpo);

		if (!user || !descFinal || isNaN(valorNumerico) || valorNumerico <= 0) {
			alert("Insira um valor válido e uma descrição.");
			return;
		}

		await supabase.from("receitas").insert([
			{
				usuario_id: user.id,
				descricao: descFinal,
				valor: valorNumerico,
				data: form.data,
				conta_id: form.conta_id,
			},
		]);

		setForm({
			descricao: "",
			valor: "",
			data: new Date().toISOString().split("T")[0],
			conta_id: "",
		});
		onSuccess();
		onClose();
	};

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true">
			<div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl sm:rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in duration-300 border border-slate-100 dark:border-slate-800 flex flex-col max-h-[95vh] sm:max-h-[90vh] transition-colors duration-200">
				<div className="p-6 sm:p-8 bg-emerald-600 dark:bg-slate-950 text-white relative shrink-0">
					<div className="flex items-center gap-3 mb-1">
						<ArrowUpCircle className="w-6 h-6 text-emerald-350 dark:text-emerald-400" />
						<h3 className="text-2xl sm:text-3xl font-black">Nova Entrada</h3>
					</div>
					<p className="font-bold opacity-80 text-sm">Registre um novo ganho mensal</p>
					<button
						onClick={onClose}
						className="absolute top-6 right-6 bg-white/20 p-2 rounded-full hover:bg-white/30 cursor-pointer">
						<X size={18} />
					</button>
				</div>

				<div className="p-6 sm:p-8 space-y-5 overflow-y-auto flex-1 scrollbar-thin">
					<div className="space-y-2">
						<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2 tracking-wider">
							Categoria
						</label>
						<input
							list="categorias-list"
							placeholder="Digite a categoria ou escolha da lista..."
							className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 outline-none focus:border-emerald-500 font-bold text-slate-700 dark:text-slate-200 text-sm transition-colors"
							value={form.descricao}
							onChange={(e) => setForm({ ...form, descricao: e.target.value })}
						/>
						<datalist id="categorias-list">
							{categorias.map((c: string) => (
								<option key={c} value={c} />
							))}
						</datalist>

						{/* LIST OF CATEGORIES WITH EDIT BUTTONS */}
						<div className="space-y-1.5">
							<span className="text-[9px] font-black uppercase text-slate-450 dark:text-slate-500 ml-2">Categorias Existentes</span>
							<div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-100 dark:border-slate-800 custom-scrollbar">
								{categorias.length === 0 ? (
									<span className="text-xs text-slate-400 dark:text-slate-500 italic font-medium p-1">Nenhuma categoria registrada</span>
								) : (
									categorias.map((c: string) => (
										<div
											key={c}
											className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
												form.descricao === c
													? "bg-emerald-600 text-white"
													: "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750"
											}`}
											onClick={() => setForm({ ...form, descricao: c })}
										>
											<span>{c}</span>
											<button
												type="button"
												className={`p-0.5 rounded-full hover:bg-black/10 transition-colors ${
													form.descricao === c ? "text-white" : "text-slate-400 hover:text-slate-200"
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

					<div className="space-y-1.5 mt-4">
						<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2 tracking-wider">
							Conta de Destino
						</label>
						<select
							className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl font-bold text-slate-700 dark:text-slate-200 outline-none border border-slate-200 dark:border-slate-700 focus:border-emerald-500 cursor-pointer text-sm"
							value={form.conta_id}
							onChange={(e) => setForm({ ...form, conta_id: e.target.value })}>
							<option value="">Selecione onde o dinheiro entrou...</option>
							{contas.map((c) => (
								<option key={c.id} value={c.id}>{c.nome}</option>
							))}
						</select>
					</div>

					<div className="grid grid-cols-2 gap-4 mt-4">
						<div className="space-y-1.5">
							<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2 tracking-wider">
								Valor (R$)
							</label>
							<input
								type="text"
								inputMode="numeric"
								placeholder="0,00"
								className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl font-black text-emerald-600 dark:text-emerald-450 text-2xl outline-none border border-slate-200 dark:border-slate-700 focus:border-emerald-500 transition-colors"
								value={form.valor}
								onChange={(e) =>
									setForm({ ...form, valor: formatCurrency(e.target.value) })
								}
							/>
						</div>
						<div className="space-y-1.5">
							<label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2 tracking-wider">
								Data
							</label>
							<input
								type="date"
								className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl font-bold text-slate-650 dark:text-slate-200 outline-none border border-slate-200 dark:border-slate-700 focus:border-emerald-500 transition-colors text-sm"
								value={form.data}
								onChange={(e) => setForm({ ...form, data: e.target.value })}
							/>
						</div>
					</div>

					<button
						onClick={handleSave}
						className="w-full bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white p-4.5 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer uppercase shrink-0">
						<Save size={18} /> SALVAR REGISTRO
					</button>
				</div>
			</div>
		</div>
	);
}
