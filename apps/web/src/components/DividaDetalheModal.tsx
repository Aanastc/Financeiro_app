import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Calendar, CheckCircle2, CircleDashed, AlertTriangle, CreditCard, ChevronRight, DollarSign, Trash2, Zap } from "lucide-react";
import { financeService } from "../../../../packages/services/finance.service";
import toast from "react-hot-toast";
import { supabase } from "../../../../packages/services/supabase";

export default function DividaDetalheModal({ isOpen, onClose, divida, userId, onPagamentoRealizado }: any) {
    const [isPagarModalOpen, setIsPagarModalOpen] = useState(false);
    const [parcelaSelecionada, setParcelaSelecionada] = useState<any>(null);
    const [contas, setContas] = useState<any[]>([]);
    const [contaId, setContaId] = useState("");
    const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split("T")[0]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
    const [isSyncingGastos, setIsSyncingGastos] = useState(false);

    useEffect(() => {
        if (isOpen && userId) {
            financeService.getContasBancarias(userId).then(data => {
                setContas(data || []);
                if (data && data.length > 0) setContaId(data[0].id);
            });
        }
        setConfirmandoExclusao(false);
    }, [isOpen, userId]);

    if (!isOpen || !divida) return null;

    const parcelas = divida.parcelas_divida || [];
    const hojeStr = new Date().toISOString().split("T")[0];
    const parcelasVencidasPendentes = parcelas.filter((p: any) => p.status === 'pendente' && p.data_vencimento < hojeStr);

    const handleAbrirPagamento = (parcela: any) => {
        setParcelaSelecionada(parcela);
        setDataPagamento(new Date().toISOString().split("T")[0]);
        setIsPagarModalOpen(true);
    };

    const handleConfirmarPagamento = async () => {
        if (!contaId) {
            toast.error("Selecione uma conta para debitar o valor.");
            return;
        }

        setIsSubmitting(true);
        try {
            await financeService.pagarParcelaDivida(
                userId,
                parcelaSelecionada.id,
                divida.id,
                parcelaSelecionada.valor_esperado,
                contaId,
                dataPagamento
            );
            toast.success("Pagamento registrado com sucesso!");
            setIsPagarModalOpen(false);
            onPagamentoRealizado();
        } catch (error: any) {
            toast.error("Erro ao pagar: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleParcelaStatus = async (parcela: any) => {
        const novoStatus = parcela.status === 'paga' ? 'pendente' : 'paga';
        try {
            await financeService.toggleParcelaStatus(parcela.id, divida.id, novoStatus);
            toast.success(`Parcela #${parcela.numero_parcela} alterada para ${novoStatus === 'paga' ? 'Paga' : 'Pendente'}`);
            onPagamentoRealizado();
        } catch (err: any) {
            toast.error("Erro ao alterar status: " + err.message);
        }
    };

    const handleMarcarVencidasComoPagas = async () => {
        if (parcelasVencidasPendentes.length === 0) return;
        setIsSubmitting(true);
        try {
            await financeService.marcarParcelasVencidasPagas(divida.id);
            toast.success(`${parcelasVencidasPendentes.length} parcelas vencidas marcadas como pagas!`);
            onPagamentoRealizado();
        } catch (err: any) {
            toast.error("Erro ao atualizar parcelas: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSincronizarGastos = async () => {
        setIsSyncingGastos(true);
        try {
            const res = await financeService.sincronizarGastosParcelasPagas(userId, divida.id, contaId);
            if (res.inseridos > 0) {
                toast.success(`${res.inseridos} pagamentos de parcelas quitadas foram lançados no fluxo de caixa!`);
            } else {
                toast("Os pagamentos dessas parcelas já estão registrados no fluxo de caixa.", { icon: "ℹ️" });
            }
            onPagamentoRealizado();
        } catch (err: any) {
            toast.error("Erro ao lançar saídas no fluxo de caixa: " + err.message);
        } finally {
            setIsSyncingGastos(false);
        }
    };

    const handleExcluirDivida = async () => {
        if (!confirmandoExclusao) {
            setConfirmandoExclusao(true);
            return;
        }
        setIsSubmitting(true);
        try {
            await financeService.deleteDivida(divida.id, userId);
            toast.success("Dívida excluída com sucesso!");
            onClose();
            onPagamentoRealizado();
        } catch (err: any) {
            toast.error("Erro ao excluir dívida: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-[35px] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]"
            >
                <div className="p-6 sm:p-8 flex justify-between items-center border-b border-slate-100 dark:border-slate-800">
                    <div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">{divida.descricao}</h3>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{divida.instituicao || "Sem Instituição"} • {divida.tipo.replace("_", " ").toUpperCase()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleExcluirDivida}
                            disabled={isSubmitting}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                                confirmandoExclusao 
                                    ? 'bg-rose-600 text-white animate-pulse' 
                                    : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                            }`}
                            title="Excluir este contrato de dívida"
                        >
                            <Trash2 size={15} />
                            {confirmandoExclusao ? "Confirmar exclusão?" : "Excluir"}
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
                    {(() => {
                        const pendentes = parcelas.filter((p: any) => p.status === 'pendente');
                        const valorRestante = pendentes.reduce((acc: number, p: any) => acc + Number(p.valor_esperado || 0), 0);
                        const pagasCount = parcelas.filter((p: any) => p.status === 'paga').length;

                        return (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-800/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-800">
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor Original</p>
                                    <p className="text-xl font-black text-slate-800 dark:text-slate-100">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(divida.valor_original)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Falta Pagar</p>
                                    <p className="text-xl font-black text-rose-500">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorRestante)}
                                    </p>
                                </div>
                                <div className="sm:text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Progresso</p>
                                    <p className="text-xl font-black text-purple-600 dark:text-purple-400">
                                        {pagasCount} / {parcelas.length} ({parcelas.length > 0 ? ((pagasCount / parcelas.length) * 100).toFixed(0) : 0}%)
                                    </p>
                                </div>
                            </div>
                        );
                    })()}

                    {/* BOTÃO RÁPIDO SE HOUVER PARCELAS ANTERIORES PENDENTES */}
                    {parcelasVencidasPendentes.length > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-black text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                    <Zap size={16} /> {parcelasVencidasPendentes.length} parcelas vencidas constam como pendentes
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    Já pagou essas parcelas anteriormente? Marque-as em lote com 1 clique.
                                </p>
                            </div>
                            <button
                                onClick={handleMarcarVencidasComoPagas}
                                disabled={isSubmitting}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl transition-all shadow-md shadow-emerald-600/20 whitespace-nowrap cursor-pointer"
                            >
                                ✓ Marcar vencidas como pagas
                            </button>
                        </div>
                    )}

                    {/* BOTÃO PARA LANÇAR SAÍDAS DAS PARCELAS QUITADAS NO FLUXO DE CAIXA */}
                    {parcelas.some((p: any) => p.status === 'paga') && (
                        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                                    <DollarSign size={16} /> Lançar Saídas de Pagamento no Fluxo de Caixa
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    Gera os lançamentos de saída na sua conta ({contas.find(c => c.id === contaId)?.nome || "Santander"}) para refletir as quitações no fluxo de caixa bancário sem duplicar despesas de consumo.
                                </p>
                            </div>
                            <button
                                onClick={handleSincronizarGastos}
                                disabled={isSubmitting || isSyncingGastos}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl transition-all shadow-md shadow-indigo-600/20 whitespace-nowrap cursor-pointer flex items-center gap-1.5"
                            >
                                {isSyncingGastos ? "Lançando..." : "💸 Lançar Saídas no Fluxo de Caixa"}
                            </button>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">Cronograma de Parcelas</h4>
                            <span className="text-[11px] text-slate-400">Clique no ícone de status para alternar</span>
                        </div>
                        
                        {parcelas.map((parcela: any) => (
                            <div key={parcela.id} className={`p-4 rounded-2xl border flex items-center justify-between transition-colors ${
                                parcela.status === 'paga' 
                                    ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/40' 
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                            }`}>
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={() => handleToggleParcelaStatus(parcela)}
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                                            parcela.status === 'paga' 
                                                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 hover:scale-105' 
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-emerald-500 hover:scale-105'
                                        }`}
                                        title={`Clique para marcar como ${parcela.status === 'paga' ? 'Pendente' : 'Paga'}`}
                                    >
                                        {parcela.status === 'paga' ? <CheckCircle2 size={20} /> : <CircleDashed size={20} />}
                                    </button>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-slate-800 dark:text-slate-100">Parcela #{parcela.numero_parcela}</p>
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                                                parcela.status === 'paga' 
                                                    ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300' 
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                            }`}>
                                                {parcela.status === 'paga' ? "PAGA" : "PENDENTE"}
                                            </span>
                                        </div>
                                        <p className="text-xs font-medium text-slate-400 flex items-center gap-1 mt-0.5">
                                            <Calendar size={12} /> Vencimento em {new Date(parcela.data_vencimento).toLocaleDateString('pt-BR')}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <p className={`font-black ${parcela.status === 'paga' ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-800 dark:text-slate-100'}`}>
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parcela.valor_esperado)}
                                    </p>
                                    {parcela.status !== 'paga' && (
                                        <button 
                                            onClick={() => handleAbrirPagamento(parcela)}
                                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                        >
                                            Pagar
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </motion.div>

            {isPagarModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsPagarModalOpen(false)} />
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800"
                    >
                        <h4 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                            <DollarSign className="text-purple-500" />
                            Pagar Parcela {parcelaSelecionada?.numero_parcela}
                        </h4>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Conta para Débito</label>
                                <select 
                                    value={contaId} 
                                    onChange={(e) => setContaId(e.target.value)}
                                    className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
                                >
                                    <option value="" disabled>Selecione uma conta</option>
                                    {contas.map(c => (
                                        <option key={c.id} value={c.id}>{c.nome}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Data do Pagamento</label>
                                <input 
                                    type="date" 
                                    value={dataPagamento}
                                    onChange={(e) => setDataPagamento(e.target.value)}
                                    className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                            </div>

                            <button 
                                onClick={handleConfirmarPagamento}
                                disabled={isSubmitting}
                                className="w-full py-3 mt-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl font-black transition-colors"
                            >
                                {isSubmitting ? "Processando..." : "Confirmar Pagamento"}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
