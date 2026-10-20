import { useState } from "react";
import { X, UserPlus, Save, Mail, CheckCircle2, AlertCircle } from "lucide-react";
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
		email: ""
	});
	const [checouUsuario, setChecouUsuario] = useState(false);
	const [temContaNoApp, setTemContaNoApp] = useState(false);
	const [checouLoading, setChecouLoading] = useState(false);

	const verificarEmailNoSistema = async (email: string) => {
		if (!email || !email.includes("@")) {
			setChecouUsuario(false);
			setTemContaNoApp(false);
			return;
		}
		setChecouLoading(true);
		try {
			const { data } = await supabase
				.from("usuarios")
				.select("id, nome, email")
				.eq("email", email.trim().toLowerCase())
				.maybeSingle();

			setChecouUsuario(true);
			setTemContaNoApp(!!data);
		} catch (e) {
			setChecouUsuario(false);
		} finally {
			setChecouLoading(false);
		}
	};

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
				nome: form.nome.trim(),
				telefone: form.telefone.trim(),
				email: form.email.trim().toLowerCase()
			});

			toast.success("Contato cadastrado com sucesso!");
			if (data && data[0]) {
				onSuccess(data[0].id);
			} else {
				onSuccess("");
			}
			onClose();
		} catch (error: any) {
			toast.error("Erro ao cadastrar: " + error.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true">
			<div className="bg-white dark:bg-slate-900 rounded-[30px] sm:rounded-[40px] w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-800 flex flex-col max-h-[95vh] sm:max-h-[90vh] transition-colors duration-200">
				<div className="p-6 sm:p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20 shrink-0">
					<div className="flex items-center gap-4">
						<div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center">
							<UserPlus size={20} />
						</div>
						<div>
							<h2 className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-100">Novo Contato</h2>
							<p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Parceria de Contas & Splits</p>
						</div>
					</div>
					<button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full transition-colors cursor-pointer">
						<X size={20} />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5 overflow-y-auto flex-1 scrollbar-thin">
					<div className="space-y-1.5">
						<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Nome</label>
						<input 
							type="text" 
							required
							className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-colors"
							placeholder="Ex: Rafael Santos"
							value={form.nome}
							onChange={e => setForm({...form, nome: e.target.value})}
							autoFocus
						/>
					</div>

					<div className="space-y-1.5">
						<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">WhatsApp / Telefone</label>
						<input 
							type="text" 
							className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-colors"
							placeholder="(00) 00000-0000"
							value={form.telefone}
							onChange={e => setForm({...form, telefone: e.target.value})}
						/>
					</div>

					<div className="space-y-1.5">
						<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">E-mail (Para Conectar ao App)</label>
						<input 
							type="email" 
							className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-colors"
							placeholder="amigo@email.com"
							value={form.email}
							onChange={e => {
								const val = e.target.value;
								setForm({...form, email: val});
								verificarEmailNoSistema(val);
							}}
						/>
						{checouLoading ? (
							<p className="text-[10px] font-bold text-slate-400 ml-1">Verificando se já tem conta...</p>
						) : checouUsuario ? (
							temContaNoApp ? (
								<p className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1 ml-1 mt-1">
									<CheckCircle2 size={13} /> Usuário encontrado! Sincronização automática ativa.
								</p>
							) : (
								<p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 ml-1 mt-1">
									<AlertCircle size={13} /> Ainda não tem conta. Você poderá enviar um convite!
								</p>
							)
						) : null}
					</div>

					<div className="pt-3 shrink-0">
						<button type="submit" disabled={loading} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-xl shadow-indigo-100 dark:shadow-none disabled:opacity-50 cursor-pointer uppercase text-sm">
							<Save size={18} />
							{loading ? "SALVANDO..." : "SALVAR CONTATO"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
