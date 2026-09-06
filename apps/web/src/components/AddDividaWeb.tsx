import { useState } from "react";
import { X, HandCoins, Save } from "lucide-react";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import { toast } from "react-hot-toast";

interface AddDividaProps {
	onClose: () => void;
	onSuccess: () => void;
}

export default function AddDividaWeb({ onClose, onSuccess }: AddDividaProps) {
	const [loading, setLoading] = useState(false);
	const [emailAmigo, setEmailAmigo] = useState("");
	const [form, setForm] = useState({
		descricao: "",
		valor_total: "",
		parcelas: "1",
		juros: "0",
		vencimento_parcela: new Date().toISOString().split('T')[0],
		vencimento_total: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
		banco: "",
		tipo_divida: "Outros",
		data_inicio: new Date().toISOString().split('T')[0]
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.descricao || !form.valor_total || !form.vencimento_parcela) {
			toast.error("Preencha todos os campos obrigatórios");
			return;
		}

		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) throw new Error("Usuário não autenticado");

			// Lógica de vínculo com outro usuário
			let devedor_id = null;
			let credor_id = null;
			if (emailAmigo.trim()) {
				const amigoId = await financeService.getUserIdByEmail(emailAmigo.trim());
				if (!amigoId) {
					toast.error("Nenhum usuário encontrado com esse e-mail.");
					setLoading(false);
					return;
				}
				if (amigoId === user.id) {
					toast.error("Você não pode colocar você mesmo como devedor.");
					setLoading(false);
					return;
				}
				devedor_id = amigoId;
				credor_id = user.id; // O usuário atual é o credor (quem recebe)
			}

			// Calcula vencimento total baseado no início + parcelas
			const date = new Date(form.data_inicio + "T12:00:00");
			date.setMonth(date.getMonth() + (parseInt(form.parcelas) || 1));
			const vencimentoTotalCalculado = date.toISOString().split("T")[0];

			await financeService.addDivida(user.id, {
				descricao: form.descricao,
				valor_total: parseFloat(form.valor_total.replace(/\./g, "").replace(",", ".")),
				parcelas: parseInt(form.parcelas) || 1,
				parcela_atual: 1,
				juros: parseFloat(form.juros.replace(/\./g, "").replace(",", ".")) || 0,
				vencimento_parcela: form.vencimento_parcela,
				vencimento_total: vencimentoTotalCalculado,
				status: "pendente",
				banco: form.banco || null,
				tipo_divida: form.tipo_divida,
				data_inicio: form.data_inicio,
				credor_id,
				devedor_id
			});

			toast.success("Dívida registrada com sucesso!");
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
			<div className="bg-white dark:bg-slate-900 rounded-[30px] sm:rounded-[40px] w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-slate-105 dark:border-slate-850 flex flex-col max-h-[95vh] sm:max-h-[90vh] transition-colors duration-200">
				<div className="p-6 sm:p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20 shrink-0">
					<div className="flex items-center gap-4">
						<div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-100 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 rounded-2xl flex items-center justify-center">
							<HandCoins size={20} />
						</div>
						<div>
							<h2 className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-100">Nova Dívida</h2>
							<p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Registre e organize seus débitos</p>
						</div>
					</div>
					<button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full transition-colors cursor-pointer">
						<X size={20} />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5 overflow-y-auto flex-1 scrollbar-thin">
					<div className="space-y-1.5">
						<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Descrição</label>
						<input 
							type="text" 
							required
							className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3.5 font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500 text-sm transition-colors"
							placeholder="Ex: Empréstimo Nubank, Carro"
							value={form.descricao}
							onChange={e => setForm({...form, descricao: e.target.value})}
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Banco / Credor</label>
							<input 
								type="text" 
								className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3.5 font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500 text-sm transition-colors"
								placeholder="Ex: Nubank, Itaú"
								value={form.banco}
								onChange={e => setForm({...form, banco: e.target.value})}
							/>
						</div>
						<div className="space-y-1.5">
							<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Origem / Tipo</label>
							<select 
								className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3.5 font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500 text-sm transition-colors cursor-pointer"
								value={form.tipo_divida}
								onChange={e => setForm({...form, tipo_divida: e.target.value})}
							>
								<option value="Empréstimo">Empréstimo</option>
								<option value="Consignado">Consignado</option>
								<option value="Renegociação de Cartão">Renegociação de Cartão</option>
								<option value="Multa">Multa</option>
								<option value="Juros">Juros</option>
								<option value="Outros">Outros</option>
							</select>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Valor Total (R$)</label>
							<input 
								type="text" 
								required
								className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-205 dark:border-slate-700 rounded-2xl px-5 py-3.5 font-black text-purple-600 dark:text-purple-400 outline-none focus:ring-2 focus:ring-purple-500 text-sm transition-colors"
								placeholder="0,00"
								value={form.valor_total}
								onChange={e => setForm({...form, valor_total: e.target.value})}
							/>
						</div>
						<div className="space-y-1.5">
							<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Juros (%)</label>
							<input 
								type="text" 
								className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3.5 font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500 text-sm transition-colors"
								placeholder="Ex: 1,5"
								value={form.juros}
								onChange={e => setForm({...form, juros: e.target.value})}
							/>
						</div>
					</div>

					<div className="space-y-1.5 pt-2">
						<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1 flex items-center justify-between">
							<span>Vincular Amigo (E-mail do Devedor)</span>
							<span className="text-[9px] opacity-60">(opcional)</span>
						</label>
						<input 
							type="email" 
							className="w-full bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl px-5 py-3.5 font-bold text-indigo-700 dark:text-indigo-400 outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-colors"
							placeholder="e-mail do amigo que te deve"
							value={emailAmigo}
							onChange={e => setEmailAmigo(e.target.value)}
						/>
						<p className="text-[10px] text-slate-400 ml-1">Se preenchido, a dívida aparecerá automaticamente para o seu amigo pagar.</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
						<div className="space-y-1.5">
							<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Parcelas</label>
							<input 
								type="number" 
								min="1"
								required
								className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3.5 font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500 text-sm transition-colors"
								value={form.parcelas}
								onChange={e => setForm({...form, parcelas: e.target.value})}
							/>
						</div>
						<div className="space-y-1.5">
							<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Data de Início</label>
							<input 
								type="date" 
								required
								className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3.5 font-bold text-slate-705 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500 text-xs transition-colors"
								value={form.data_inicio}
								onChange={e => setForm({...form, data_inicio: e.target.value})}
							/>
						</div>
						<div className="space-y-1.5">
							<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">Venc. Próx. Parcela</label>
							<input 
								type="date" 
								required
								className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3.5 font-bold text-slate-705 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500 text-xs transition-colors"
								value={form.vencimento_parcela}
								onChange={e => setForm({...form, vencimento_parcela: e.target.value})}
							/>
						</div>
					</div>

					<div className="pt-4 flex flex-col sm:flex-row gap-3 shrink-0">
						<button type="button" onClick={onClose} className="flex-1 py-3.5 font-bold text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-colors cursor-pointer text-sm order-2 sm:order-1">
							CANCELAR
						</button>
						<button type="submit" disabled={loading} className="flex-1 py-3.5 bg-purple-500 hover:bg-purple-650 dark:bg-purple-600 dark:hover:bg-purple-700 text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-xl shadow-purple-100 dark:shadow-none disabled:opacity-50 cursor-pointer uppercase text-sm order-1 sm:order-2">
							<Save size={18} />
							{loading ? "SALVANDO..." : "ADICIONAR DÍVIDA"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
