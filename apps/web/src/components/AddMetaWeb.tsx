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
		<div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
			<div className="bg-white rounded-[40px] w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
				<div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 bg-pink-100 text-pink-600 rounded-2xl flex items-center justify-center">
							<Target size={24} />
						</div>
						<div>
							<h2 className="text-xl font-black text-[#2D2424]">Nova Meta</h2>
							<p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Qual o seu próximo sonho?</p>
						</div>
					</div>
					<button onClick={onClose} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
						<X size={24} />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="p-8 space-y-6">
					<div className="space-y-2">
						<label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">O que você quer alcançar?</label>
						<input 
							type="text" 
							required
							className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 font-bold text-[#2D2424] outline-none focus:ring-2 focus:ring-pink-500"
							placeholder="Ex: Viagem para Paris"
							value={form.titulo}
							onChange={e => setForm({...form, titulo: e.target.value})}
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor Objetivo (R$)</label>
							<input 
								type="text" 
								required
								className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 font-black text-pink-500 outline-none focus:ring-2 focus:ring-pink-500"
								placeholder="0,00"
								value={form.valor}
								onChange={e => setForm({...form, valor: e.target.value})}
							/>
						</div>
						<div className="space-y-2">
							<label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data Limite</label>
							<input 
								type="date" 
								required
								className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 font-bold text-[#2D2424] outline-none focus:ring-2 focus:ring-pink-500"
								value={form.prazo}
								onChange={e => setForm({...form, prazo: e.target.value})}
							/>
						</div>
					</div>

					<div className="space-y-4 border-t border-gray-100 pt-4">
						<div className="flex items-center gap-3">
							<input 
								type="checkbox" 
								id="debito_automatico"
								className="w-5 h-5 text-pink-500 border-gray-300 rounded focus:ring-pink-500 cursor-pointer"
								checked={form.debito_automatico}
								onChange={e => setForm({...form, debito_automatico: e.target.checked})}
							/>
							<label htmlFor="debito_automatico" className="text-xs font-black text-gray-500 uppercase tracking-wide cursor-pointer select-none">
								Possui Débito Automático em Conta?
							</label>
						</div>

						{form.debito_automatico && (
							<div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
								<div className="space-y-2">
									<label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Dia do Débito (1-31)</label>
									<input 
										type="number" 
										min="1"
										max="31"
										required
										className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 font-bold text-[#2D2424] outline-none focus:ring-2 focus:ring-pink-500"
										placeholder="Ex: 10"
										value={form.debito_dia}
										onChange={e => setForm({...form, debito_dia: e.target.value})}
									/>
								</div>
								<div className="space-y-2">
									<label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor do Débito (R$)</label>
									<input 
										type="text" 
										required
										className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 font-black text-pink-500 outline-none focus:ring-2 focus:ring-pink-500"
										placeholder="0,00"
										value={form.debito_valor}
										onChange={e => setForm({...form, debito_valor: e.target.value})}
									/>
								</div>
							</div>
						)}
					</div>

					<div className="pt-4 flex gap-4">
						<button type="button" onClick={onClose} className="flex-1 py-4 font-bold text-gray-400 hover:bg-gray-50 rounded-2xl transition-colors">
							CANCELAR
						</button>
						<button type="submit" disabled={loading} className="flex-1 py-4 bg-pink-500 text-white rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-pink-600 transition-all shadow-xl shadow-pink-100 disabled:opacity-50">
							<Save size={20} />
							{loading ? "SALVANDO..." : "CRIAR META"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
