import { useState } from "react";
import { X, Target, Save } from "lucide-react";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import { toast } from "react-hot-toast";

interface AddMetaProps {
	onClose: () => void;
	onSuccess: () => void;
}

export default function AddMetaWeb({ onClose, onSuccess }: AddMetaProps) {
	const [loading, setLoading] = useState(false);
	const [form, setForm] = useState({
		titulo: "",
		valor: "",
		prazo: new Date().toISOString().split('T')[0],
		debito_automatico: false,
		debito_dia: "",
		debito_valor: ""
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.titulo || !form.valor || !form.prazo) {
			toast.error("Preencha todos os campos obrigatórios");
			return;
		}

		if (form.debito_automatico) {
			if (!form.debito_dia || !form.debito_valor) {
				toast.error("Preencha o dia e o valor para o débito automático");
				return;
			}
			const dia = parseInt(form.debito_dia);
			if (isNaN(dia) || dia < 1 || dia > 31) {
				toast.error("O dia do débito deve ser entre 1 e 31");
				return;
			}
		}

		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) throw new Error("Usuário não autenticado");

			await financeService.addMeta(user.id, {
				titulo: form.titulo,
				valor: parseFloat(form.valor.replace(/\./g, "").replace(",", ".")),
				prazo: form.prazo,
				debito_automatico: form.debito_automatico,
				debito_dia: form.debito_automatico ? parseInt(form.debito_dia) : null,
				debito_valor: form.debito_automatico ? parseFloat(form.debito_valor.replace(/\./g, "").replace(",", ".")) : null
			});

			toast.success("Meta adicionada com sucesso!");
			onSuccess();
			onClose();
		} catch (error: any) {
			toast.error("Erro ao adicionar: " + error.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true">
			<div className="bg-white dark:bg-slate-900 rounded-[30px] sm:rounded-[40px] w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-slate-105 dark:border-slate-850 flex flex-col max-h-[95vh] sm:max-h-[90vh] transition-colors duration-200">
				<div className="p-6 sm:p-8 border-b border-slate-105 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20 shrink-0">
					<div className="flex items-center gap-4">
						<div className="w-10 h-10 sm:w-12 sm:h-12 bg-pink-100 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400 rounded-2xl flex items-center justify-center">
							<Target size={20} />
						</div>
						<div>
							<h2 className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-100">Nova Meta</h2>
							<p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Qual o seu próximo sonho?</p>
						</div>
					</div>
					<button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full transition-colors cursor-pointer">
						<X size={20} />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5 overflow-y-auto flex-1 scrollbar-thin">
					<div className="space-y-1.5">
						<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">O que você quer alcançar?</label>
						<input 
							type="text" 
							required
							className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3.5 font-bold text-slate-700 dark:text-slate-205 outline-none focus:ring-2 focus:ring-pink-500 text-sm transition-colors"
							placeholder="Ex: Viagem para Paris"
							value={form.titulo}
							onChange={e => setForm({...form, titulo: e.target.value})}
						/>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Valor Objetivo (R$)</label>
							<input 
								type="text" 
								required
								className="w-full bg-slate-50 dark:bg-slate-855 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3.5 font-black text-pink-500 dark:text-pink-400 outline-none focus:ring-2 focus:ring-pink-500 text-sm transition-colors"
								placeholder="0,00"
								value={form.valor}
								onChange={e => setForm({...form, valor: e.target.value})}
							/>
						</div>
						<div className="space-y-1.5">
							<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Data Limite</label>
							<input 
								type="date" 
								required
								className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3.5 font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-500 text-sm transition-colors"
								value={form.prazo}
								onChange={e => setForm({...form, prazo: e.target.value})}
							/>
						</div>
					</div>

					<div className="space-y-4 border-t border-slate-105 dark:border-slate-800 pt-4">
						<div className="flex items-center gap-3">
							<input 
								type="checkbox" 
								id="debito_automatico"
								className="w-5 h-5 text-pink-500 dark:text-pink-600 border-slate-300 dark:border-slate-700 rounded focus:ring-pink-500 cursor-pointer"
								checked={form.debito_automatico}
								onChange={e => setForm({...form, debito_automatico: e.target.checked})}
							/>
							<label htmlFor="debito_automatico" className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide cursor-pointer select-none">
								Possui Débito Automático em Conta?
							</label>
						</div>

						{form.debito_automatico && (
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
								<div className="space-y-1.5">
									<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Dia do Débito (1-31)</label>
									<input 
										type="number" 
										min="1"
										max="31"
										required
										className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3.5 font-bold text-slate-705 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-500 text-sm transition-colors"
										placeholder="Ex: 10"
										value={form.debito_dia}
										onChange={e => setForm({...form, debito_dia: e.target.value})}
									/>
								</div>
								<div className="space-y-1.5">
									<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Valor do Débito (R$)</label>
									<input 
										type="text" 
										required
										className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3.5 font-black text-pink-500 dark:text-pink-400 outline-none focus:ring-2 focus:ring-pink-500 text-sm transition-colors"
										placeholder="0,00"
										value={form.debito_valor}
										onChange={e => setForm({...form, debito_valor: e.target.value})}
									/>
								</div>
							</div>
						)}
					</div>

					<div className="pt-4 flex flex-col sm:flex-row gap-3 shrink-0">
						<button type="button" onClick={onClose} className="flex-1 py-3.5 font-bold text-slate-400 dark:text-slate-550 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-colors cursor-pointer text-sm order-2 sm:order-1">
							CANCELAR
						</button>
						<button type="submit" disabled={loading} className="flex-1 py-3.5 bg-pink-500 hover:bg-pink-600 dark:bg-pink-600 dark:hover:bg-pink-700 text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-xl shadow-pink-100 dark:shadow-none disabled:opacity-50 cursor-pointer uppercase text-sm order-1 sm:order-2">
							<Save size={18} />
							{loading ? "SALVANDO..." : "CRIAR META"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
