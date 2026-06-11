import { useState, useEffect } from "react";
import { X, TrendingUp, Save, Target, Building2 } from "lucide-react";
import { financeService } from "../../../../packages/services/finance.service";
import { authService } from "../../../../packages/services/auth.service";
import { supabase } from "../../../../packages/services/supabase";
import { toast } from "react-hot-toast";

interface AddInvestimentoProps {
	onClose: () => void;
	onSuccess: () => void;
}

export default function AddInvestimentoWeb({ onClose, onSuccess }: AddInvestimentoProps) {
	const [loading, setLoading] = useState(false);
	const [metas, setMetas] = useState<any[]>([]);
	const [form, setForm] = useState({
		titulo: "",
		tipo: "Renda Fixa",
		valor_investido: "",
		data_inicio: new Date().toISOString().split('T')[0],
		corretora: "",
		meta_id: ""
	});

	useEffect(() => {
		const loadMetas = async () => {
			try {
				const user = await authService.getCurrentUser();
				if (user) {
					const { data } = await supabase.from('metas').select('*').eq('usuario_id', user.id);
					setMetas(data || []);
				}
			} catch (e) {
				console.error(e);
			}
		};
		loadMetas();
	}, []);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.titulo || !form.valor_investido || !form.data_inicio) {
			toast.error("Preencha todos os campos obrigatórios");
			return;
		}

		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) throw new Error("Usuário não autenticado");

			// Salva o ID da meta no campo corretora usando o padrão [Meta: meta_id] se houver vínculo
			const corretoraFinal = form.meta_id 
				? `[Meta: ${form.meta_id}] ${form.corretora}`.trim()
				: form.corretora;

			const valorNumerico = parseFloat(form.valor_investido.replace(/\./g, "").replace(",", "."));

			await financeService.addInvestimento(user.id, {
				titulo: form.titulo,
				tipo: form.tipo,
				valor_investido: valorNumerico,
				valor_atual: valorNumerico, // Inicializa com o mesmo valor investido
				data_inicio: form.data_inicio,
				corretora: corretoraFinal || null,
				status: "Ativo"
			});

			toast.success("Investimento adicionado com sucesso!");
			onSuccess();
			onClose();
		} catch (error: any) {
			toast.error("Erro ao adicionar: " + error.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true">
			<div className="bg-white dark:bg-slate-900 p-6 sm:p-10 rounded-3xl sm:rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-2xl w-full max-w-lg relative animate-in fade-in zoom-in duration-200 flex flex-col max-h-[95vh] sm:max-h-[90vh]">
				<button 
					type="button"
					onClick={onClose} 
					className="absolute top-6 right-6 text-slate-400 hover:text-slate-655 dark:hover:text-slate-200 transition-colors bg-slate-50 dark:bg-slate-800 p-2 rounded-full cursor-pointer z-10"
				>
					<X size={20} />
				</button>

				<div className="flex items-center gap-4 mb-6 shrink-0">
					<div className="w-12 h-12 bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400 rounded-2xl flex items-center justify-center">
						<TrendingUp size={24} />
					</div>
					<div>
						<h2 className="text-xl font-black text-slate-800 dark:text-slate-100">Novo Ativo</h2>
						<p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Aumente seu patrimônio</p>
					</div>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 pr-1 scrollbar-thin">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2">Nome do Ativo</label>
							<input 
								type="text" 
								required
								className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-green-500 outline-none transition-all font-bold text-slate-700 dark:text-slate-200 text-sm"
								placeholder="Ex: Tesouro Selic, PETR4"
								value={form.titulo}
								onChange={e => setForm({...form, titulo: e.target.value})}
							/>
						</div>
						
						<div className="space-y-1.5">
							<label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2">Categoria</label>
							<select 
								className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-green-500 outline-none transition-all font-bold text-slate-700 dark:text-slate-200 text-sm cursor-pointer"
								value={form.tipo}
								onChange={e => setForm({...form, tipo: e.target.value})}
							>
								<option value="Renda Fixa">Renda Fixa</option>
								<option value="Ações">Ações</option>
								<option value="FIIs">FIIs</option>
								<option value="Criptomoedas">Criptomoedas</option>
								<option value="Fundos">Fundos de Investimento</option>
							</select>
						</div>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2 flex items-center gap-1">
								<Building2 size={12} /> Corretora / Instituição
							</label>
							<input 
								type="text" 
								className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-green-500 outline-none transition-all font-bold text-slate-700 dark:text-slate-200 text-sm"
								placeholder="Ex: XP, Rico, NuInvest"
								value={form.corretora}
								onChange={e => setForm({...form, corretora: e.target.value})}
							/>
						</div>

						<div className="space-y-1.5">
							<label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2 flex items-center gap-1">
								<Target size={12} /> Vincular a uma Meta (Opcional)
							</label>
							<select 
								className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-green-500 outline-none transition-all font-bold text-slate-700 dark:text-slate-200 text-sm cursor-pointer"
								value={form.meta_id}
								onChange={e => setForm({...form, meta_id: e.target.value})}
							>
								<option value="">Nenhuma meta vinculada</option>
								{metas.map(m => (
									<option key={m.id} value={m.id}>{m.titulo}</option>
								))}
							</select>
						</div>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2">Valor Aplicado (R$)</label>
							<input 
								type="text" 
								required
								className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-green-500 outline-none transition-all font-black text-green-650 dark:text-green-400 text-sm"
								placeholder="0,00"
								value={form.valor_investido}
								onChange={e => setForm({...form, valor_investido: e.target.value})}
							/>
						</div>
						
						<div className="space-y-1.5">
							<label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2">Data da Aplicação</label>
							<input 
								type="date" 
								required
								className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-green-500 outline-none transition-all font-bold text-slate-700 dark:text-slate-200 text-sm"
								value={form.data_inicio}
								onChange={e => setForm({...form, data_inicio: e.target.value})}
							/>
						</div>
					</div>

					<div className="pt-4 flex gap-4 shrink-0">
						<button 
							type="button" 
							onClick={onClose} 
							className="flex-1 py-4 font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-colors cursor-pointer text-sm"
						>
							CANCELAR
						</button>
						<button 
							type="submit" 
							disabled={loading} 
							className="flex-1 py-4 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-100 dark:shadow-none disabled:opacity-50 cursor-pointer text-sm"
						>
							<Save size={20} />
							{loading ? "SALVANDO..." : "ADICIONAR ATIVO"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
