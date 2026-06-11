import { useState } from "react";
import { X, UserPlus, Save } from "lucide-react";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import { toast } from "react-hot-toast";

interface AddContatoProps {
	onClose: () => void;
	onSuccess: (newContatoId: string) => void;
}

export default function AddContatoWeb({ onClose, onSuccess }: AddContatoProps) {
	const [loading, setLoading] = useState(false);
	const [form, setForm] = useState({
		nome: "",
		telefone: "",
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.nome) {
			toast.error("O nome é obrigatório");
			return;
		}

		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) throw new Error("Usuário não autenticado");

			const data = await financeService.addContato(user.id, {
				nome: form.nome,
				telefone: form.telefone
			});

			toast.success("Devedor cadastrado com sucesso!");
			onSuccess(data[0].id); // Retorna o ID criado para vincular automaticamente
			onClose();
		} catch (error: any) {
			toast.error("Erro ao cadastrar: " + error.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true">
			<div className="bg-white dark:bg-slate-900 rounded-[30px] sm:rounded-[40px] w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-850 flex flex-col max-h-[95vh] sm:max-h-[90vh] transition-colors duration-200">
				<div className="p-6 sm:p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20 shrink-0">
					<div className="flex items-center gap-4">
						<div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-105 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center">
							<UserPlus size={20} />
						</div>
						<div>
							<h2 className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-100">Novo Devedor</h2>
							<p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Adicionar aos contatos</p>
						</div>
					</div>
					<button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full transition-colors cursor-pointer">
						<X size={20} />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1 scrollbar-thin">
					<div className="space-y-2">
						<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Nome do Devedor</label>
						<input 
							type="text" 
							required
							className="w-full bg-slate-55 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3.5 font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-amber-55 text-sm transition-colors"
							placeholder="Ex: João Silva"
							value={form.nome}
							onChange={e => setForm({...form, nome: e.target.value})}
							autoFocus
						/>
					</div>

					<div className="space-y-2">
						<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Telefone / WhatsApp (Opcional)</label>
						<input 
							type="text" 
							className="w-full bg-slate-55 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3.5 font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-amber-55 text-sm transition-colors"
							placeholder="(00) 00000-0000"
							value={form.telefone}
							onChange={e => setForm({...form, telefone: e.target.value})}
						/>
					</div>

					<div className="pt-4 shrink-0">
						<button type="submit" disabled={loading} className="w-full py-4 bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-705 text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-xl shadow-amber-100 dark:shadow-none disabled:opacity-50 cursor-pointer uppercase text-sm">
							<Save size={18} />
							{loading ? "SALVANDO..." : "CADASTRAR DEVEDOR"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
