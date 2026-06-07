import React, { useState } from "react";
import { X, CreditCard, Calendar, Palette } from "lucide-react";
import { financeService } from "../../../../packages/services/finance.service";
import toast from "react-hot-toast";
import { supabase } from "../../../../packages/services/supabase";

interface AddCartaoModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess: () => void;
}

export default function AddCartaoModal({ isOpen, onClose, onSuccess }: AddCartaoModalProps) {
	const [loading, setLoading] = useState(false);
	const [form, setForm] = useState({
		nome: "",
		limite: "",
		vencimento_dia: 10,
		fechamento_dia: 3,
		cor_hex: "#6366f1", // indigo-500
	});

	if (!isOpen) return null;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) throw new Error("Usuário não autenticado");

			await financeService.addCartao(user.id, {
				nome: form.nome,
				limite: Number(form.limite),
				vencimento_dia: Number(form.vencimento_dia),
				fechamento_dia: Number(form.fechamento_dia),
				cor_hex: form.cor_hex
			});

			toast.success("Cartão cadastrado com sucesso!");
			onSuccess();
			onClose();
			
			// Reset form
			setForm({
				nome: "",
				limite: "",
				vencimento_dia: 10,
				fechamento_dia: 3,
				cor_hex: "#6366f1",
			});
		} catch (error) {
			console.error(error);
			toast.error("Erro ao cadastrar cartão.");
		} finally {
			setLoading(false);
		}
	};

	const PREDEFINED_COLORS = [
		"#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", 
		"#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#1e293b"
	];

	return (
		<div className="fixed inset-0 bg-[#5D4037]/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
			<div className="bg-white p-10 md:p-14 rounded-[50px] shadow-2xl w-full max-w-md border border-gray-100 relative animate-in fade-in zoom-in duration-200">
				<button
					type="button"
					onClick={onClose}
					className="absolute top-8 right-8 text-gray-400 hover:text-gray-600 transition-colors bg-gray-50 p-2 rounded-full"
				>
					<X size={24} />
				</button>

				<div className="text-center mb-10">
					<div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
						<CreditCard size={32} />
					</div>
					<h2 className="text-3xl font-black text-slate-800 tracking-tight">Novo Cartão</h2>
					<p className="text-slate-500 mt-1 font-medium">Cadastre um novo cartão de crédito</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-6">
					<div className="space-y-1">
						<label className="text-sm font-bold text-slate-600 ml-2">Nome do Cartão</label>
						<input
							type="text"
							required
							value={form.nome}
							onChange={e => setForm({...form, nome: e.target.value})}
							className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700"
							placeholder="Ex: Nubank, Itaú..."
						/>
					</div>

					<div className="space-y-1">
						<label className="text-sm font-bold text-slate-600 ml-2">Limite (R$)</label>
						<input
							type="number"
							required
							step="0.01"
							value={form.limite}
							onChange={e => setForm({...form, limite: e.target.value})}
							className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700"
							placeholder="5000.00"
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1">
							<label className="text-sm font-bold text-slate-600 ml-2 flex items-center gap-1">
								<Calendar size={14} /> Vencimento
							</label>
							<input
								type="number"
								required
								min="1"
								max="31"
								value={form.vencimento_dia}
								onChange={e => setForm({...form, vencimento_dia: Number(e.target.value)})}
								className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 text-center"
							/>
						</div>
						<div className="space-y-1">
							<label className="text-sm font-bold text-slate-600 ml-2 flex items-center gap-1">
								<Calendar size={14} /> Fechamento
							</label>
							<input
								type="number"
								required
								min="1"
								max="31"
								value={form.fechamento_dia}
								onChange={e => setForm({...form, fechamento_dia: Number(e.target.value)})}
								className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 text-center"
							/>
						</div>
					</div>

					<div className="space-y-2">
						<label className="text-sm font-bold text-slate-600 ml-2 flex items-center gap-1">
							<Palette size={14} /> Cor do Cartão
						</label>
						<div className="flex flex-wrap gap-3 p-2">
							{PREDEFINED_COLORS.map(color => (
								<button
									key={color}
									type="button"
									onClick={() => setForm({...form, cor_hex: color})}
									className={`w-10 h-10 rounded-full shadow-sm border-2 transition-transform ${form.cor_hex === color ? 'border-slate-800 scale-110' : 'border-transparent hover:scale-105'}`}
									style={{ backgroundColor: color }}
								/>
							))}
						</div>
					</div>

					<button
						disabled={loading}
						className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-5 rounded-3xl font-black mt-8 transition-all transform hover:scale-[1.02] shadow-lg shadow-indigo-200"
					>
						{loading ? "SALVANDO..." : "CADASTRAR CARTÃO"}
					</button>
				</form>
			</div>
		</div>
	);
}
