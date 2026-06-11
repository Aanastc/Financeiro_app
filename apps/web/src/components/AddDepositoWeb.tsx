import { useState } from "react";
import { X, ArrowUpRight, Save } from "lucide-react";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import { toast } from "react-hot-toast";

interface AddDepositoProps {
	metaId: string;
	metaTitulo: string;
	onClose: () => void;
	onSuccess: () => void;
}

export default function AddDepositoWeb({ metaId, metaTitulo, onClose, onSuccess }: AddDepositoProps) {
	const [loading, setLoading] = useState(false);
	const [form, setForm] = useState({
		valor: "",
		data: new Date().toISOString().split('T')[0]
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.valor || !form.data) {
			toast.error("Preencha todos os campos");
			return;
		}

		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) throw new Error("Usuário não autenticado");

			await financeService.addDepositoMeta(user.id, {
				meta_id: metaId,
				valor: parseFloat(form.valor.replace(/\./g, "").replace(",", ".")),
				data: form.data
			});

			toast.success("Depósito registrado!");
			onSuccess();
			onClose();
		} catch (error: any) {
			toast.error("Erro ao registrar: " + error.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true">
			<div className="bg-white dark:bg-slate-900 rounded-[30px] sm:rounded-[40px] w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-850 flex flex-col max-h-[95vh] sm:max-h-[90vh] transition-colors duration-200">
				<div className="p-6 sm:p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20 shrink-0">
					<div className="flex items-center gap-4">
						<div className="w-10 h-10 sm:w-12 sm:h-12 bg-pink-100 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400 rounded-2xl flex items-center justify-center">
							<ArrowUpRight size={20} />
						</div>
						<div>
							<h2 className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-100">Depositar</h2>
							<p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{metaTitulo}</p>
						</div>
					</div>
					<button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full transition-colors cursor-pointer">
						<X size={20} />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1 scrollbar-thin">
					<div className="space-y-2">
						<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Valor do Depósito (R$)</label>
						<input 
							type="text" 
							required
							className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-205 dark:border-slate-700 rounded-2xl px-5 py-3.5 font-black text-pink-500 dark:text-pink-400 outline-none focus:ring-2 focus:ring-pink-500 text-center text-3xl"
							placeholder="0,00"
							value={form.valor}
							onChange={e => setForm({...form, valor: e.target.value})}
							autoFocus
						/>
					</div>
					
					<div className="space-y-2">
						<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Data do Depósito</label>
						<input 
							type="date" 
							required
							className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-205 dark:border-slate-700 rounded-2xl px-5 py-3.5 font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-500 text-sm transition-colors"
							value={form.data}
							onChange={e => setForm({...form, data: e.target.value})}
						/>
					</div>

					<div className="pt-4 shrink-0">
						<button type="submit" disabled={loading} className="w-full py-4 bg-pink-500 hover:bg-pink-600 dark:bg-pink-600 dark:hover:bg-pink-700 text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-xl shadow-pink-100 dark:shadow-none disabled:opacity-50 cursor-pointer uppercase text-sm">
							<Save size={18} />
							{loading ? "SALVANDO..." : "CONFIRMAR DEPÓSITO"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
