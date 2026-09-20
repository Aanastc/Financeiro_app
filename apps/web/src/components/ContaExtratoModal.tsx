import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, ArrowDownCircle, ArrowUpCircle, Building2, Calendar, FileText, Landmark } from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";

export default function ContaExtratoModal({ isOpen, onClose, conta }: { isOpen: boolean, onClose: () => void, conta: any }) {
    const [movimentacoes, setMovimentacoes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen && conta) {
            loadExtrato();
        }
    }, [isOpen, conta]);

    const loadExtrato = async () => {
        setLoading(true);
        try {
            // Fetch movimentacoes para a conta específica
            const { data, error } = await supabase
                .from("movimentacoes")
                .select(`
                    *,
                    transacoes!movimentacoes_transacao_fkey (
                        descricao,
                        data,
                        tipo
                    )
                `)
                .eq("conta_id", conta.id)
                .order("data", { ascending: false });
                
            if (error) throw error;
            setMovimentacoes(data || []);
        } catch (error) {
            console.error("Erro ao carregar extrato:", error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const saldoAtual = conta.saldo_atual || 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm sm:p-6">
            <motion.div 
                initial={{ scale: 0.95, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.95, opacity: 0 }} 
                className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl flex flex-col max-h-[90vh] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
            >
                {/* Modal Header */}
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-2" style={{ backgroundColor: conta.cor_hex || "#6366f1" }} />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md" style={{ backgroundColor: conta.cor_hex || "#6366f1" }}>
                            <Building2 size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">{conta.nome}</h2>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <Landmark size={14} /> {conta.instituicao || conta.tipo}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors relative z-10">
                        <X size={24} />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50/50 dark:bg-slate-950/50">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 mb-6 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Saldo Atual</p>
                            <h3 className={`text-2xl font-black mt-1 ${saldoAtual < 0 ? 'text-rose-500' : 'text-slate-800 dark:text-slate-100'}`}>
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoAtual)}
                            </h3>
                        </div>
                    </div>

                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <FileText size={16} /> Histórico de Movimentações
                    </h4>

                    {loading ? (
                        <div className="flex justify-center items-center py-10">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : movimentacoes.length === 0 ? (
                        <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 border-dashed">
                            <FileText size={32} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
                            <p className="text-slate-500 dark:text-slate-400 font-medium">Nenhuma movimentação registrada nesta conta.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {movimentacoes.map((mov) => {
                                const isEntrada = mov.tipo === "ENTRADA";
                                const Icon = isEntrada ? ArrowUpCircle : ArrowDownCircle;
                                const colorClass = isEntrada ? "text-emerald-500" : "text-rose-500";
                                const bgClass = isEntrada ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-rose-50 dark:bg-rose-900/20";
                                
                                return (
                                    <div key={mov.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bgClass} ${colorClass}`}>
                                                <Icon size={20} />
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800 dark:text-slate-100">
                                                    {mov.transacoes?.descricao || "Movimentação sem descrição"}
                                                </p>
                                                <p className="text-xs font-medium text-slate-400 flex items-center gap-1 mt-0.5">
                                                    <Calendar size={12} />
                                                    {new Date(mov.data).toLocaleDateString('pt-BR')}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-black ${colorClass}`}>
                                                {isEntrada ? "+" : "-"} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(mov.valor)}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
