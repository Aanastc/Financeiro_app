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
				data_inicio: form.data_inicio
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
		<div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
			<div className="bg-white rounded-[40px] w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
				<div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center">
							<HandCoins size={24} />
						</div>
						<div>
							<h2 className="text-xl font-black text-[#2D2424]">Nova Dívida</h2>
							<p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Registre e organize seus débitos</p>
						</div>
					</div>
					<button onClick={onClose} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
						<X size={24} />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="p-8 space-y-6">
					<div className="space-y-2">
						<label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Descrição</label>
						<input 
							type="text" 
							required
							className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 font-bold text-[#2D2424] outline-none focus:ring-2 focus:ring-purple-500"
							placeholder="Ex: Empréstimo Nubank, Carro"
							value={form.descricao}
							onChange={e => setForm({...form, descricao: e.target.value})}
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Banco / Credor</label>
							<input 
								type="text" 
								className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 font-bold text-[#2D2424] outline-none focus:ring-2 focus:ring-purple-500"
								placeholder="Ex: Nubank, Itaú"
								value={form.banco}
								onChange={e => setForm({...form, banco: e.target.value})}
							/>
						</div>
						<div className="space-y-2">
							<label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Origem / Tipo</label>
							<select 
								className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 font-bold text-[#2D2424] outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
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
						<div className="space-y-2">
							<label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor Total (R$)</label>
							<input 
								type="text" 
								required
								className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 font-black text-purple-500 outline-none focus:ring-2 focus:ring-purple-500"
								placeholder="0,00"
								value={form.valor_total}
								onChange={e => setForm({...form, valor_total: e.target.value})}
							/>
						</div>
						<div className="space-y-2">
							<label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Juros (%)</label>
							<input 
								type="text" 
								className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 font-bold text-[#2D2424] outline-none focus:ring-2 focus:ring-purple-500"
								placeholder="Ex: 1,5"
								value={form.juros}
								onChange={e => setForm({...form, juros: e.target.value})}
							/>
						</div>
					</div>

					<div className="grid grid-cols-3 gap-4">
						<div className="space-y-2">
							<label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Parcelas</label>
							<input 
								type="number" 
								min="1"
								required
								className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 font-bold text-[#2D2424] outline-none focus:ring-2 focus:ring-purple-500"
								value={form.parcelas}
								onChange={e => setForm({...form, parcelas: e.target.value})}
							/>
						</div>
						<div className="space-y-2">
							<label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data de Início</label>
							<input 
								type="date" 
								required
								className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-4 font-bold text-[#2D2424] outline-none focus:ring-2 focus:ring-purple-500 text-xs"
								value={form.data_inicio}
								onChange={e => setForm({...form, data_inicio: e.target.value})}
							/>
						</div>
						<div className="space-y-2">
							<label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Venc. Próx. Parcela</label>
							<input 
								type="date" 
								required
								className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-4 font-bold text-[#2D2424] outline-none focus:ring-2 focus:ring-purple-500 text-xs"
								value={form.vencimento_parcela}
								onChange={e => setForm({...form, vencimento_parcela: e.target.value})}
							/>
						</div>
					</div>

					<div className="pt-4 flex gap-4">
						<button type="button" onClick={onClose} className="flex-1 py-4 font-bold text-gray-400 hover:bg-gray-50 rounded-2xl transition-colors">
							CANCELAR
						</button>
						<button type="submit" disabled={loading} className="flex-1 py-4 bg-purple-500 text-white rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-purple-600 transition-all shadow-xl shadow-purple-100 disabled:opacity-50">
							<Save size={20} />
							{loading ? "SALVANDO..." : "ADICIONAR DÍVIDA"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
