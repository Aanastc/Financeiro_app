import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileText, Calendar, CreditCard, ShoppingBag, ArrowDownCircle, ArrowUpCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";

export default function FaturaLancamentosModal({ isOpen, onClose, fatura }: { isOpen: boolean, onClose: () => void, fatura: any }) {
    const [transacoes, setTransacoes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen && fatura) {
            loadTransacoes();
        }
    }, [isOpen, fatura]);

    const loadTransacoes = async () => {
        setLoading(true);
        try {
            // Busca transacoes atreladas a esta fatura
            const { data, error } = await supabase
                .from("transacoes")
                .select("*, parcelas(*)")
                .eq("fatura_id", fatura.id)
                .order("data", { ascending: true });
                
            if (error) throw error;
            setTransacoes(data || []);
        } catch (error) {
            console.error("Erro ao carregar transações da fatura:", error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !fatura) return null;

    const valorTotal = Number(fatura.valor_total || 0);
    const valorPago = Number(fatura.valor_pago || 0);
    const saldoRestante = Math.max(0, valorTotal - valorPago);

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
                    <div className="absolute top-0 left-0 w-full h-2" style={{ backgroundColor: fatura.cartoes?.cor_hex || "#6366f1" }} />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md" style={{ backgroundColor: fatura.cartoes?.cor_hex || "#6366f1" }}>
                            <CreditCard size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">Fatura {fatura.cartoes?.nome}</h2>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                Vencimento: {fatura.data_vencimento ? new Date(fatura.data_vencimento).toLocaleDateString('pt-BR') : '--'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors relative z-10">
                        <X size={24} />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50/50 dark:bg-slate-950/50">
                    {/* Resumo Contábil da Fatura */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Total da Fatura</p>
                            <h3 className="text-xl font-black mt-1 text-slate-800 dark:text-slate-100">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorTotal)}
                            </h3>
                        </div>
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-emerald-200 dark:border-emerald-800/40 shadow-sm bg-emerald-50/30 dark:bg-emerald-950/10">
                            <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Valor Pago</p>
                            <h3 className="text-xl font-black mt-1 text-emerald-600 dark:text-emerald-400">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorPago)}
                            </h3>
                        </div>
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Saldo Restante</p>
                            <h3 className={`text-xl font-black mt-1 ${saldoRestante > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoRestante)}
                            </h3>
                        </div>
                    </div>

                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <ShoppingBag size={16} /> Lançamentos ({transacoes.length})
                    </h4>

                    {loading ? (
                        <div className="flex justify-center items-center py-10">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : transacoes.length === 0 ? (
                        <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 border-dashed">
                            <FileText size={32} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
                            <p className="text-slate-500 dark:text-slate-400 font-medium">Nenhum lançamento nesta fatura.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {transacoes.map((t) => {
                                const parcelaAtiva = t.parcelas && t.parcelas.length > 0 ? t.parcelas[0] : null;
                                const descLower = (t.descricao || "").toLowerCase();
                                const isPagamento = t.tipo === "PAGAMENTO_FATURA" || descLower.includes("pagamento recebido") || descLower.includes("pagamento de fatura");
                                const isEstorno = t.tipo === "ESTORNO" || descLower.includes("estorno") || descLower.includes("crédito de fatura") || descLower.includes("desconto");
                                const isLimite = descLower.includes("limite convertido");
                                
                                return (
                                    <div key={t.id} className="flex flex-col p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                    isPagamento 
                                                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' 
                                                        : isEstorno
                                                        ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400'
                                                        : 'bg-rose-50 dark:bg-rose-900/20 text-rose-500'
                                                }`}>
                                                    {isPagamento ? <CheckCircle2 size={20} /> : isEstorno ? <ArrowUpCircle size={20} /> : <ArrowDownCircle size={20} />}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-slate-800 dark:text-slate-100">
                                                            {t.descricao}
                                                        </p>
                                                        {isPagamento && (
                                                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                                                Pagamento
                                                            </span>
                                                        )}
                                                        {isEstorno && (
                                                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                                                                Estorno / Crédito
                                                            </span>
                                                        )}
                                                        {isLimite && (
                                                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                                                Limite Convertido
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs font-medium text-slate-400 flex items-center gap-1 mt-0.5">
                                                        <Calendar size={12} />
                                                        {new Date(t.data).toLocaleDateString('pt-BR')}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={`font-black ${
                                                    isPagamento 
                                                        ? 'text-emerald-600 dark:text-emerald-400' 
                                                        : isEstorno
                                                        ? 'text-sky-600 dark:text-sky-400'
                                                        : 'text-slate-800 dark:text-slate-100'
                                                }`}>
                                                    {isPagamento ? "- " : isEstorno ? "- " : ""}
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parcelaAtiva ? (parcelaAtiva.valor ?? t.valor) : t.valor)}
                                                </p>
                                                {parcelaAtiva && (
                                                    <p className="text-xs font-bold text-indigo-500 dark:text-indigo-400 mt-0.5">
                                                        Parcela {parcelaAtiva.numero_parcela}
                                                    </p>
                                                )}
                                            </div>
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
