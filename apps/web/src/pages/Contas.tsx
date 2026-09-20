import { useState, useEffect, useMemo } from "react";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Wallet, Pencil, Trash2, Building2, AlertCircle, TrendingUp, TrendingDown, Landmark, Search, ChevronRight, Activity } from "lucide-react";
import toast from "react-hot-toast";
import OnboardingContasModal from "../components/OnboardingContasModal";
import EditContaModal from "../components/EditContaModal";
import ContaExtratoModal from "../components/ContaExtratoModal";
import { useNavigate, Link } from "react-router-dom";

export default function Contas() {
	const navigate = useNavigate();
	const [userId, setUserId] = useState<string>("");
	const [contas, setContas] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	
	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [contaParaEditar, setContaParaEditar] = useState<any>(null);
	const [contaParaExcluir, setContaParaExcluir] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [contaParaExtrato, setContaParaExtrato] = useState<any>(null);

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

    const contasFiltradas = contas.filter(c => 
        c.nome.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (c.instituicao && c.instituicao.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const saldoTotal = contas.reduce((acc, c) => acc + (c.saldo_atual || 0), 0);
    const totalContasPositivas = contas.filter(c => (c.saldo_atual || 0) >= 0).length;
    const totalContasNegativas = contas.filter(c => (c.saldo_atual || 0) < 0).length;

	if (loading) {
		return (
			<div className="flex justify-center items-center h-64">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
			</div>
		);
	}

	return (
		<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 sm:space-y-8 pb-20">
			
            {/* CABEÇALHO */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
				<div>
					<h1 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
						<Landmark className="text-indigo-500" size={32} />
						Minhas Contas
					</h1>
					<p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
						Gerencie seu saldo disponível em bancos, carteiras digitais e espécie.
					</p>
				</div>
				<button 
					onClick={() => setIsAddModalOpen(true)}
					className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-95 cursor-pointer"
				>
					<Plus size={20} />
					<span>Nova Conta</span>
				</button>
			</div>

            {/* DASHBOARD SUMMARY */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900 dark:bg-slate-800 rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[160px] shadow-xl">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Wallet size={80} className="text-white" />
                    </div>
                    <div>
                        <p className="text-slate-400 font-bold text-sm uppercase tracking-wider">Saldo Total Consolidado</p>
                        <h2 className={`text-3xl sm:text-4xl font-black mt-2 ${saldoTotal >= 0 ? 'text-white' : 'text-rose-400'}`}>
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoTotal)}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 text-sm font-medium mt-4">
                        <Activity size={16} />
                        <span>Calculado via movimentações em tempo real</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                    <div>
                        <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-3">
                            <TrendingUp size={20} />
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">Contas no Azul</p>
                        <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">{totalContasPositivas} {totalContasPositivas === 1 ? 'conta' : 'contas'}</h3>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                    <div>
                        <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-3">
                            <TrendingDown size={20} />
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">Contas no Vermelho</p>
                        <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">{totalContasNegativas} {totalContasNegativas === 1 ? 'conta' : 'contas'}</h3>
                    </div>
                </div>
            </div>

            {/* BARRA DE PESQUISA */}
            <div className="flex items-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-3 shadow-sm">
                <Search size={20} className="text-slate-400 mr-3" />
                <input 
                    type="text" 
                    placeholder="Buscar conta por nome ou instituição..."
                    className="bg-transparent border-none outline-none flex-1 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 font-medium"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

			{/* GRID DE CONTAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{contasFiltradas.length === 0 ? (
					<div className="col-span-full py-16 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 border-dashed">
						<Building2 size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-4" />
						<h3 className="text-xl font-black text-slate-800 dark:text-slate-200">Nenhuma conta encontrada</h3>
						<p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-2 font-medium">
							Você ainda não tem contas com este nome ou não cadastrou nenhuma conta.
						</p>
						<button 
							onClick={() => setIsAddModalOpen(true)}
							className="mt-6 px-6 py-3 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors"
						>
							Cadastrar Nova Conta
						</button>
					</div>
				) : (
					contasFiltradas.map((conta) => (
						<motion.div 
							key={conta.id} 
							whileHover={{ y: -4 }}
							className="bg-white dark:bg-slate-900 rounded-3xl p-1 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-full group relative overflow-hidden"
						>
                            {/* Faixa decorativa no topo do card */}
                            <div className="h-12 w-full absolute top-0 left-0 opacity-20" style={{ backgroundColor: conta.cor_hex || "#6366f1" }} />
                            
                            <div className="p-5 flex-1 flex flex-col relative z-10">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg" style={{ backgroundColor: conta.cor_hex || "#6366f1" }}>
                                        <Building2 size={28} />
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setContaParaEditar(conta); setIsEditModalOpen(true); }}
                                            className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-colors bg-white dark:bg-slate-800 shadow-sm cursor-pointer"
                                        >
                                            <Pencil size={18} />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setContaParaExcluir(conta); }}
                                            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-xl transition-colors bg-white dark:bg-slate-800 shadow-sm cursor-pointer"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex-1">
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{conta.instituicao || conta.tipo}</p>
                                    <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1 line-clamp-1">{conta.nome}</h3>
                                    
                                    <div className="mt-4">
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Saldo Atual</p>
                                        <h4 className={`text-2xl font-black mt-1 ${
                                            (conta.saldo_atual || 0) < 0 ? 'text-rose-500' : 'text-slate-900 dark:text-white'
                                        }`}>
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(conta.saldo_atual || 0)}
                                        </h4>
                                    </div>
                                </div>
                            </div>

                            {/* Área de Extrato Rápido */}
                            <div className="border-t border-slate-100 dark:border-slate-800 p-2 relative z-10">
                                <button 
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setContaParaExtrato(conta);
                                    }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-sm transition-colors cursor-pointer"
                                >
                                    Ver Extrato
                                    <ChevronRight size={16} className="text-slate-400" />
                                </button>
                            </div>
						</motion.div>
					))
				)}
			</div>

			<OnboardingContasModal 
				isOpen={isAddModalOpen} 
				userId={userId} 
				onComplete={() => { setIsAddModalOpen(false); loadData(); }} 
				initialStep={contas.length > 0 ? "form" : "intro"}
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

            <ContaExtratoModal 
                isOpen={!!contaParaExtrato} 
                onClose={() => setContaParaExtrato(null)} 
                conta={contaParaExtrato} 
            />

			<AnimatePresence>
				{contaParaExcluir && (
					<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
						<motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-8 text-center border border-slate-200 dark:border-slate-800 shadow-2xl">
							<div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/30 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
								<AlertCircle size={32} />
							</div>
							<h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2">Excluir Conta?</h3>
							<p className="text-slate-500 dark:text-slate-400 mb-8 font-medium">Tem certeza que deseja excluir <strong>{contaParaExcluir.nome}</strong>? Esta ação não pode ser desfeita e pode falhar se houver lançamentos vinculados a esta conta.</p>
							<div className="flex gap-4">
								<button onClick={() => setContaParaExcluir(null)} className="flex-1 py-3.5 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-colors cursor-pointer">Cancelar</button>
								<button onClick={handleDelete} className="flex-1 py-3.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-2xl transition-all shadow-md shadow-rose-200 dark:shadow-none cursor-pointer">Sim, excluir</button>
							</div>
						</motion.div>
					</div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}
