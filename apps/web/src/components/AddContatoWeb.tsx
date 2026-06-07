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
		<div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
			<div className="bg-white rounded-[40px] w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
				<div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
							<UserPlus size={24} />
						</div>
						<div>
							<h2 className="text-xl font-black text-[#2D2424]">Novo Devedor</h2>
							<p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Adicionar aos contatos</p>
						</div>
					</div>
					<button onClick={onClose} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
						<X size={24} />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="p-8 space-y-6">
					<div className="space-y-2">
						<label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nome do Devedor</label>
						<input 
							type="text" 
							required
							className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 font-bold text-[#2D2424] outline-none focus:ring-2 focus:ring-amber-500"
							placeholder="Ex: João Silva"
							value={form.nome}
							onChange={e => setForm({...form, nome: e.target.value})}
							autoFocus
						/>
					</div>

					<div className="space-y-2">
						<label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Telefone / WhatsApp (Opcional)</label>
						<input 
							type="text" 
							className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 font-bold text-[#2D2424] outline-none focus:ring-2 focus:ring-amber-500"
							placeholder="(00) 00000-0000"
							value={form.telefone}
							onChange={e => setForm({...form, telefone: e.target.value})}
						/>
					</div>

					<div className="pt-4">
						<button type="submit" disabled={loading} className="w-full py-4 bg-amber-500 text-white rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-amber-600 transition-all shadow-xl shadow-amber-100 disabled:opacity-50">
							<Save size={20} />
							{loading ? "SALVANDO..." : "CADASTRAR DEVEDOR"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
