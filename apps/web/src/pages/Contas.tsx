import { useState, useEffect } from "react";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Wallet, Pencil, Trash2, Building2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import OnboardingContasModal from "../components/OnboardingContasModal";
import EditContaModal from "../components/EditContaModal";
import { useNavigate } from "react-router-dom";

export default function Contas() {
	const navigate = useNavigate();
	const [userId, setUserId] = useState<string>("");
	const [contas, setContas] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	
	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [contaParaEditar, setContaParaEditar] = useState<any>(null);
	const [contaParaExcluir, setContaParaExcluir] = useState<any>(null);

	const loadData = async () => {
		try {
			setLoading(true);
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				navigate("/login");
				return;
			}
			setUserId(user.id);
			const resContas = await financeService.getContasBancarias(user.id);
			setContas(resContas || []);
		} catch (error) {
			console.error("Erro ao carregar contas", error);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadData();
	}, [navigate]);

	const handleDelete = async () => {
		if (!contaParaExcluir) return;
		try {
			await financeService.deleteContaBancaria(userId, contaParaExcluir.id);
			toast.success("Conta excluída com sucesso!");
			setContaParaExcluir(null);
			loadData();
		} catch (error: any) {
			toast.error(`Erro ao excluir conta: ${error.message}. Talvez existam lançamentos vinculados a ela.`);
		}
	};

	if (loading) {
		return (
			<div className="flex justify-center items-center h-64">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
			</div>
		);
	}

	return (
		<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 sm:space-y-8 pb-20">
			<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
				<div>
					<h1 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
						<Wallet className="text-indigo-500" size={32} />
						Minhas Contas
					</h1>
					<p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
						Gerencie suas contas correntes, poupanças e carteiras digitais.
					</p>
				</div>
				<button 
					onClick={() => setIsAddModalOpen(true)}
					className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-200 dark:shadow-none transition-all"
				>
					<Plus size={20} />
					<span>Nova Conta</span>
				</button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{contas.length === 0 ? (
					<div className="col-span-full py-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 border-dashed">
						<Wallet size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-4" />
						<h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Nenhuma conta cadastrada</h3>
						<p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-2">
							Adicione suas contas bancárias para começar a controlar seu saldo e categorizar de onde o dinheiro entra e sai.
						</p>
						<button 
							onClick={() => setIsAddModalOpen(true)}
							className="mt-6 px-6 py-2.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors"
						>
							Adicionar Primeira Conta
						</button>
					</div>
				) : (
					contas.map((conta) => (
						<motion.div 
							key={conta.id} 
							whileHover={{ y: -4 }}
							className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between h-full"
						>
							<div>
								<div className="flex justify-between items-start mb-4">
									<div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white" style={{ backgroundColor: conta.cor_hex || "#6366f1" }}>
										<Building2 size={24} />
									</div>
									<div className="flex gap-2">
										<button 
											onClick={() => { setContaParaEditar(conta); setIsEditModalOpen(true); }}
											className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
										>
											<Pencil size={18} />
										</button>
										<button 
											onClick={() => setContaParaExcluir(conta)}
											className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
										>
											<Trash2 size={18} />
										</button>
									</div>
								</div>
								<h3 className="text-xl font-black text-slate-800 dark:text-slate-100">{conta.nome}</h3>
								<p className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-1">{conta.tipo}</p>
							</div>
							
							<div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
								<div className="flex justify-between items-center text-sm">
									<span className="text-slate-500 dark:text-slate-450 font-bold">Função Débito</span>
									{conta.tem_debito ? (
										<span className="px-2 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-md font-bold text-xs">
											Ativo
										</span>
									) : (
										<span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-md font-bold text-xs">
											Inativo
										</span>
									)}
								</div>
							</div>
						</motion.div>
					))
				)}
			</div>

			<OnboardingContasModal 
				isOpen={isAddModalOpen} 
				userId={userId} 
				onComplete={() => { setIsAddModalOpen(false); loadData(); }} 
			/>

			{isEditModalOpen && contaParaEditar && (
				<EditContaModal
					isOpen={isEditModalOpen}
					onClose={() => setIsEditModalOpen(false)}
					conta={contaParaEditar}
					onUpdate={loadData}
					userId={userId}
				/>
			)}

			<AnimatePresence>
				{contaParaExcluir && (
					<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
						<motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-8 text-center border border-slate-100 dark:border-slate-800 shadow-2xl">
							<div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/30 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
								<AlertCircle size={32} />
							</div>
							<h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2">Excluir Conta?</h3>
							<p className="text-slate-500 dark:text-slate-400 mb-8">Tem certeza que deseja excluir <strong>{contaParaExcluir.nome}</strong>? Esta ação não pode ser desfeita e pode falhar se houver lançamentos vinculados a esta conta.</p>
							<div className="flex gap-4">
								<button onClick={() => setContaParaExcluir(null)} className="flex-1 py-3 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors">Cancelar</button>
								<button onClick={handleDelete} className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition-all shadow-md">Sim, excluir</button>
							</div>
						</motion.div>
					</div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}
