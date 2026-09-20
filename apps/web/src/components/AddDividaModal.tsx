import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, HandCoins, Building, Calendar, DollarSign, Percent } from "lucide-react";
import { financeService } from "../../../../packages/services/finance.service";
import toast from "react-hot-toast";

export default function AddDividaModal({ isOpen, onClose, userId }: any) {
    const [tipo, setTipo] = useState("emprestimo_pessoal");
    const [descricao, setDescricao] = useState("");
    const [instituicao, setInstituicao] = useState("");
    const [valorTotal, setValorTotal] = useState("");
    const [quantidadeParcelas, setQuantidadeParcelas] = useState("12");
    const [dataPrimeiroVencimento, setDataPrimeiroVencimento] = useState(
        new Date().toISOString().split("T")[0]
    );

    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setTipo("emprestimo_pessoal");
            setDescricao("");
            setInstituicao("");
            setValorTotal("");
            setQuantidadeParcelas("12");
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const numParcelas = parseInt(quantidadeParcelas);
            const valTotal = parseFloat(valorTotal.replace(",", "."));
            const valorParcela = valTotal / numParcelas;

            const dividaPayload = {
                tipo,
                descricao,
                instituicao,
                valor_original: valTotal,
                valor_atual: valTotal,
                data_contratacao: dataPrimeiroVencimento,
                status: "ativa"
            };

            const parcelas = Array.from({ length: numParcelas }).map((_, idx) => {
                const date = new Date(dataPrimeiroVencimento + "T12:00:00");
                date.setMonth(date.getMonth() + idx);
                return {
                    numero_parcela: idx + 1,
                    valor_esperado: valorParcela,
                    data_vencimento: date.toISOString().split("T")[0],
                    status: "pendente"
                };
            });

            await financeService.addDivida(userId, {
                divida: dividaPayload,
                parcelas
            });

            toast.success("Dívida cadastrada com sucesso!");
            onClose();
        } catch (error: any) {
            toast.error("Erro ao cadastrar dívida: " + error.message);
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
                className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-[35px] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
            >
                <div className="p-6 sm:p-8 flex flex-col h-full max-h-[90vh]">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                                <HandCoins size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">Nova Dívida</h3>
                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Cadastre um empréstimo ou financiamento</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tipo da Dívida</label>
                            <select 
                                value={tipo} 
                                onChange={(e) => setTipo(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3.5 text-slate-800 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            >
                                <option value="emprestimo_pessoal">Empréstimo Pessoal</option>
                                <option value="financiamento">Financiamento</option>
                                <option value="renegociacao_cartao">Renegociação de Cartão</option>
                                <option value="cheque_especial">Cheque Especial / Limite</option>
                                <option value="outros">Outros</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Descrição</label>
                            <input 
                                type="text"
                                required
                                value={descricao}
                                onChange={(e) => setDescricao(e.target.value)}
                                placeholder="Ex: Empréstimo Nubank"
                                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3.5 text-slate-800 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Instituição / Banco</label>
                            <div className="relative">
                                <Building size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    type="text"
                                    value={instituicao}
                                    onChange={(e) => setInstituicao(e.target.value)}
                                    placeholder="Ex: Nubank, Caixa..."
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl pl-12 pr-4 py-3.5 text-slate-800 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Valor Total (R$)</label>
                                <div className="relative">
                                    <DollarSign size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input 
                                        type="number"
                                        step="0.01"
                                        required
                                        value={valorTotal}
                                        onChange={(e) => setValorTotal(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl pl-12 pr-4 py-3.5 text-slate-800 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Qtd. Parcelas</label>
                                <input 
                                    type="number"
                                    required
                                    min="1"
                                    value={quantidadeParcelas}
                                    onChange={(e) => setQuantidadeParcelas(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3.5 text-slate-800 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5 pb-4">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Primeiro Vencimento</label>
                            <div className="relative">
                                <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    type="date"
                                    required
                                    value={dataPrimeiroVencimento}
                                    onChange={(e) => setDataPrimeiroVencimento(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl pl-12 pr-4 py-3.5 text-slate-800 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                />
                            </div>
                        </div>

                        <button 
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-2xl font-black transition-colors"
                        >
                            {isSubmitting ? "Salvando..." : "Confirmar Dívida"}
                        </button>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}
