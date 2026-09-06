import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Wallet, Save } from "lucide-react";
import { financeService } from "../../../../packages/services/finance.service";
import toast from "react-hot-toast";

interface EditContaModalProps {
	isOpen: boolean;
	onClose: () => void;
	conta: any;
	onUpdate: () => void;
	userId: string;
}

export default function EditContaModal({ isOpen, onClose, conta, onUpdate, userId }: EditContaModalProps) {
	const [nome, setNome] = useState("");
	const [tipo, setTipo] = useState("");
	const [temDebito, setTemDebito] = useState(true);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (isOpen && conta) {
			setNome(conta.nome || "");
			setTipo(conta.tipo || "Conta Corrente");
			setTemDebito(conta.tem_debito ?? true);
		}
	}, [isOpen, conta]);

	if (!isOpen) return null;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		try {
			await financeService.updateContaBancaria(userId, conta.id, {
				nome,
				tipo,
				tem_debito: temDebito
			});
			toast.success("Conta atualizada com sucesso!");
			onUpdate();
			onClose();
		} catch (error: any) {
			toast.error(`Erro ao atualizar conta: ${error.message}`);
		} finally {
			setLoading(false);
		}
	};

	return (
		<AnimatePresence>
			{isOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
					<motion.div
						initial={{ scale: 0.95, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						exit={{ scale: 0.95, opacity: 0 }}
						className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800"
					>
						<div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
							<div className="flex items-center gap-3">
								<div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
									<Wallet size={20} />
								</div>
								<h2 className="text-lg font-black text-slate-800 dark:text-slate-100">Editar Conta</h2>
							</div>
							<button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
								<X size={20} />
							</button>
						</div>

						<form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
							<div>
								<label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Nome da Instituição</label>
								<input 
									type="text"
									required
									value={nome}
									onChange={(e) => setNome(e.target.value)}
									className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-200 focus:border-indigo-500 outline-none transition-colors"
								/>
							</div>

							<div>
								<label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Tipo de Conta</label>
								<select 
									value={tipo}
									onChange={(e) => setTipo(e.target.value)}
									className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-200 focus:border-indigo-500 outline-none transition-colors"
								>
									<option value="Conta Corrente">Conta Corrente</option>
									<option value="Conta Poupança">Conta Poupança</option>
									<option value="Conta Pagamento">Conta de Pagamento</option>
									<option value="Carteira Digital">Carteira Digital</option>
									<option value="Outros">Outros</option>
								</select>
							</div>

							<label className="flex items-center gap-3 p-4 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors">
								<input 
									type="checkbox"
									checked={temDebito}
									onChange={(e) => setTemDebito(e.target.checked)}
									className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
								/>
								<div>
									<p className="text-sm font-bold text-slate-800 dark:text-slate-200">Função Débito</p>
									<p className="text-xs text-slate-500 dark:text-slate-450 mt-0.5">Permite lançar gastos diretos nesta conta</p>
								</div>
							</label>

							<button 
								type="submit" 
								disabled={loading}
								className="mt-2 flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-all disabled:opacity-70 disabled:cursor-not-allowed"
							>
								{loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={18} />}
								<span>{loading ? "Salvando..." : "Salvar Alterações"}</span>
							</button>
						</form>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
