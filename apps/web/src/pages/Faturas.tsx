import { useState, useEffect, useMemo } from "react";
import { authService } from "../../../../packages/services/auth.service";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { 
	CreditCard, 
	Calendar, 
	CheckCircle2, 
	CircleDashed, 
	ChevronLeft, 
	ChevronRight, 
	FileText, 
	AlertTriangle,
	Eye,
    TrendingUp,
	ArrowRightLeft
} from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import FaturaLancamentosModal from "../components/FaturaLancamentosModal";

export default function Faturas() {
	const { cartao_id } = useParams();
	const navigate = useNavigate();
	
	const [userId, setUserId] = useState<string>("");
	const [faturas, setFaturas] = useState<any[]>([]);
	const [cartaoNome, setCartaoNome] = useState<string>("");
	const [loading, setLoading] = useState(true);
	
	// Filtros da UI
	const [filtroStatus, setFiltroStatus] = useState<'Todas' | 'aberta' | 'fechada' | 'paga' | 'atrasada'>('Todas');
    const [faturaAbertaModal, setFaturaAbertaModal] = useState<any>(null);

	const loadData = async () => {
		setLoading(true);
		try {
			const user = await authService.getCurrentUser();
			if (!user) return navigate("/login");
			setUserId(user.id);
			
			const data = await financeService.getAllFaturas(user.id);
			setFaturas(data || []);

            if (cartao_id) {
                const { data: cartao } = await supabase.from("cartoes").select("nome").eq("id", cartao_id).maybeSingle();
                if (cartao) {
                    setCartaoNome(cartao.nome);
                }
            }
		} catch (error) {
			console.error(error);
			toast.error("Erro ao carregar faturas");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadData();
	}, []);

	const faturasFiltradas = useMemo(() => {
		let result = faturas;
		if (cartao_id) {
			result = result.filter(f => f.cartao_id === cartao_id);
		}
		if (filtroStatus !== 'Todas') {
			result = result.filter(f => f.status === filtroStatus);
		}
		return result;
	}, [faturas, cartao_id, filtroStatus]);

    const totalAberto = faturasFiltradas.filter(f => f.status === 'aberta').reduce((acc, f) => acc + Math.max(0, Number(f.valor_total || 0) - Number(f.valor_pago || 0)), 0);
    const totalFechado = faturasFiltradas.filter(f => f.status === 'fechada' || f.status === 'atrasada').reduce((acc, f) => acc + Math.max(0, Number(f.valor_total || 0) - Number(f.valor_pago || 0)), 0);

	const getStatusColor = (status: string) => {
		switch(status) {
			case 'paga': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
			case 'aberta': return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400';
			case 'fechada': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
			case 'atrasada': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
			case 'renegociada': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
			default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400';
		}
	};

	const getStatusIcon = (status: string) => {
		switch(status) {
			case 'paga': return <CheckCircle2 size={16} />;
			case 'aberta': return <CircleDashed size={16} />;
			case 'fechada': return <AlertTriangle size={16} />;
			case 'atrasada': return <AlertTriangle size={16} />;
			case 'renegociada': return <ArrowRightLeft size={16} />;
			default: return <FileText size={16} />;
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
			
            			{/* CABEÇALHO */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
				<div>
                    {cartao_id && (
                        <button onClick={() => navigate("/cartoes")} className="flex items-center text-sm font-bold text-slate-500 hover:text-indigo-600 dark:text-slate-400 mb-2 transition-colors">
                            <ChevronLeft size={16} /> Voltar para Cartões
                        </button>
                    )}
					<h1 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
						<FileText className="text-indigo-500" size={32} />
						{cartao_id ? `Faturas: ${cartaoNome || 'Carregando...'}` : "Gestão de Faturas"}
					</h1>
					<p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
						Acompanhe o ciclo de vida e pague suas faturas em dia.
					</p>
				</div>
				<button
					onClick={async () => {
						try {
							setLoading(true);
							await financeService.syncCardFaturas(userId);
							await loadData();
							toast.success("Faturas sincronizadas com sucesso!");
						} catch (e) {
							toast.error("Erro ao sincronizar faturas");
						} finally {
							setLoading(false);
						}
					}}
					className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl font-bold text-sm shadow-md transition-all cursor-pointer"
				>
					<TrendingUp size={18} />
					Sincronizar Faturas
				</button>
			</div>

            {/* DASHBOARD SUMMARY */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 flex items-center gap-6 shadow-sm">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-500">
                        <CircleDashed size={32} />
                    </div>
                    <div>
                        <p className="text-slate-500 dark:text-slate-400 font-bold text-sm uppercase tracking-wider">Total em Faturas Abertas</p>
                        <h2 className="text-3xl sm:text-4xl font-black text-slate-800 dark:text-slate-100 mt-1">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAberto)}
                        </h2>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 flex items-center gap-6 shadow-sm">
                    <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center text-amber-500">
                        <AlertTriangle size={32} />
                    </div>
                    <div>
                        <p className="text-slate-500 dark:text-slate-400 font-bold text-sm uppercase tracking-wider">Total Fechado/A Pagar</p>
                        <h2 className="text-3xl sm:text-4xl font-black text-amber-600 dark:text-amber-500 mt-1">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalFechado)}
                        </h2>
                    </div>
                </div>
            </div>

            {/* FILTROS */}
            <div className="flex overflow-x-auto custom-scrollbar gap-2 pb-2">
                {['Todas', 'aberta', 'fechada', 'atrasada', 'paga', 'renegociada'].map(status => (
                    <button
                        key={status}
                        onClick={() => setFiltroStatus(status as any)}
                        className={`px-4 py-2 rounded-xl font-bold whitespace-nowrap transition-colors ${
                            filtroStatus === status 
                            ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow-md" 
                            : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                    >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                    </button>
                ))}
            </div>

			{/* LISTA DE FATURAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{faturasFiltradas.length === 0 ? (
					<div className="col-span-full py-16 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 border-dashed">
						<CheckCircle2 size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-4" />
						<h3 className="text-xl font-black text-slate-800 dark:text-slate-200">Nenhuma fatura encontrada</h3>
						<p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-2 font-medium">
							Você não possui faturas com este status.
						</p>
						<button
							onClick={async () => {
								try {
									setLoading(true);
									await financeService.syncCardFaturas(userId);
									await loadData();
									toast.success("Faturas sincronizadas com sucesso!");
								} catch (e) {
									toast.error("Erro ao sincronizar faturas");
								} finally {
									setLoading(false);
								}
							}}
							className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm shadow-md transition-all cursor-pointer"
						>
							<TrendingUp size={18} />
							Recalcular e Gerar Faturas dos Cartões
						</button>
					</div>
				) : (
					faturasFiltradas.map((fatura) => (
						<motion.div 
							key={fatura.id} 
							whileHover={{ y: -4 }}
							className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-full overflow-hidden group"
						>
                            <div className="h-10 w-full opacity-30" style={{ backgroundColor: fatura.cartoes?.cor_hex || "#6366f1" }} />
                            
                            <div className="p-6 pt-2 flex-1 flex flex-col">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex-1">
                                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{fatura.cartoes?.nome || "Cartão Removido"}</p>
                                        <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${getStatusColor(fatura.status)}`}>
                                            {getStatusIcon(fatura.status)}
                                            {fatura.status}
                                        </div>
                                    </div>
                                    <CreditCard size={28} className="text-slate-300 dark:text-slate-700" />
                                </div>

                                <div className="mt-2 mb-4">
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Valor da Fatura</p>
                                    <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(fatura.valor_total || 0)}
                                    </h3>
                                    
                                    <div className="mt-3 flex items-center justify-between text-xs font-bold pt-2 border-t border-slate-100 dark:border-slate-800">
                                        <span className="text-slate-500 dark:text-slate-400">
                                            Pago: <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(fatura.valor_pago || 0)}</span>
                                        </span>
                                        {Number(fatura.valor_pago || 0) > Number(fatura.valor_total || 0) ? (
                                            <span className="text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/50 px-2 py-0.5 rounded-full">
                                                Crédito: +{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(fatura.valor_pago) - Number(fatura.valor_total))}
                                            </span>
                                        ) : (
                                            <span className="text-slate-600 dark:text-slate-300">
                                                Saldo: <span className={Math.max(0, Number(fatura.valor_total || 0) - Number(fatura.valor_pago || 0)) > 0 ? "text-rose-500 font-extrabold" : "text-emerald-500 font-extrabold"}>
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, Number(fatura.valor_total || 0) - Number(fatura.valor_pago || 0)))}
                                                </span>
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-3 mt-auto bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl text-sm font-medium border border-slate-100 dark:border-slate-800">
                                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                                        <span className="flex items-center gap-2"><Calendar size={16} /> Fechamento</span>
                                        <span className="font-bold">{fatura.data_fechamento ? new Date(fatura.data_fechamento).toLocaleDateString('pt-BR') : '--'}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                                        <span className="flex items-center gap-2"><Calendar size={16} className="text-rose-400" /> Vencimento</span>
                                        <span className="font-bold text-rose-500 dark:text-rose-400">{fatura.data_vencimento ? new Date(fatura.data_vencimento).toLocaleDateString('pt-BR') : '--'}</span>
                                    </div>
                                </div>

                                <button 
                                    className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3.5 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-2xl font-bold transition-colors cursor-pointer"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setFaturaAbertaModal(fatura);
                                    }}
                                >
                                    <Eye size={18} />
                                    Ver Lançamentos
                                </button>

                                {fatura.renegociacao_id && (
                                    <button 
                                        className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-2xl font-bold text-xs transition-colors cursor-pointer"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            navigate("/dividas");
                                        }}
                                    >
                                        <ArrowRightLeft size={15} />
                                        Ver Acordo de Renegociação
                                    </button>
                                )}
                            </div>
						</motion.div>
					))
				)}
			</div>
            
            <AnimatePresence>
                {faturaAbertaModal && (
                    <FaturaLancamentosModal 
                        isOpen={!!faturaAbertaModal} 
                        onClose={() => setFaturaAbertaModal(null)} 
                        fatura={faturaAbertaModal} 
                    />
                )}
            </AnimatePresence>
		</motion.div>
	);
}
