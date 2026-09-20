import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Building2, CreditCard, Tag, Calendar, AlignLeft, Info } from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";
import toast from "react-hot-toast";
import { financeService } from "../../../../packages/services/finance.service";

export default function GlobalTransactionModal({ isOpen, onClose, userId }: { isOpen: boolean, onClose: () => void, userId: string }) {
    const [tipo, setTipo] = useState<"GASTO" | "ENTRADA" | "TRANSFERENCIA">("GASTO");
    
    // Formulário
    const [valor, setValor] = useState("");
    const [descricao, setDescricao] = useState("");
    const [data, setData] = useState(() => new Date().toISOString().split("T")[0]);
    const [categoriaId, setCategoriaId] = useState("");
    const [formaPagamento, setFormaPagamento] = useState<"CONTA" | "CARTAO">("CONTA");
    const [contaId, setContaId] = useState("");
    const [cartaoId, setCartaoId] = useState("");
    const [recorrente, setRecorrente] = useState(false);
    const [parcelas, setParcelas] = useState("1");
    const [observacao, setObservacao] = useState("");

    // Transferência
    const [contaDestinoId, setContaDestinoId] = useState("");

    // Dados de suporte
    const [contas, setContas] = useState<any[]>([]);
    const [cartoes, setCartoes] = useState<any[]>([]);
    const [categorias, setCategorias] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && userId) {
            loadSupportData();
            // Reset state on open
            setValor("");
            setDescricao("");
            setObservacao("");
            setParcelas("1");
        }
    }, [isOpen, userId]);

    const loadSupportData = async () => {
        try {
            const [resContas, resCartoes, resCategorias] = await Promise.all([
                supabase.from("contas_bancarias").select("id, nome, cor_hex, instituicao").eq("usuario_id", userId),
                supabase.from("cartoes").select("id, nome, cor_hex").eq("usuario_id", userId),
                supabase.from("categorias").select("id, nome, tipo, cor_hex").eq("usuario_id", userId).eq("ativa", true)
            ]);

            setContas(resContas.data || []);
            setCartoes(resCartoes.data || []);
            setCategorias(resCategorias.data || []);
            
            if (resContas.data && resContas.data.length > 0) setContaId(resContas.data[0].id);
            if (resCartoes.data && resCartoes.data.length > 0) setCartaoId(resCartoes.data[0].id);
        } catch (error) {
            console.error("Erro ao carregar dados:", error);
        }
    };

    const formatCurrencyInput = (value: string) => {
        const v = value.replace(/\D/g, "");
        if (v === "") return "";
        const numericValue = parseInt(v, 10) / 100;
        return numericValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const numericValue = parseFloat(valor.replace(/\./g, "").replace(",", "."));
            if (isNaN(numericValue) || numericValue <= 0) {
                toast.error("Insira um valor válido");
                return;
            }

            // Integração com financeService
            await financeService.addTransacao(userId, {
                tipo,
                valor: numericValue,
                descricao,
                data,
                categoria_id: categoriaId,
                forma_pagamento: formaPagamento,
                conta_id: contaId,
                cartao_id: cartaoId,
                parcelas: parseInt(parcelas),
                observacao,
                conta_destino_id: contaDestinoId
            });
            
            toast.success("Movimentação registrada com sucesso!");
            onClose();

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const catsFiltradas = categorias.filter(c => tipo === "TRANSFERENCIA" || c.tipo === tipo || c.tipo === "AMBOS");

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm sm:p-6 overflow-y-auto">
            <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 20 }} 
                animate={{ scale: 1, opacity: 1, y: 0 }} 
                exit={{ scale: 0.95, opacity: 0, y: 20 }} 
                className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-xl flex flex-col shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 my-auto"
            >
                {/* Header Toggle */}
                <div className="flex p-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                    <button 
                        onClick={() => setTipo("GASTO")}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all ${
                            tipo === "GASTO" 
                            ? "bg-rose-500 text-white shadow-md" 
                            : "text-slate-500 hover:bg-white dark:hover:bg-slate-900"
                        }`}
                    >
                        <ArrowDownCircle size={18} /> Gasto
                    </button>
                    <button 
                        onClick={() => setTipo("ENTRADA")}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all ${
                            tipo === "ENTRADA" 
                            ? "bg-emerald-500 text-white shadow-md" 
                            : "text-slate-500 hover:bg-white dark:hover:bg-slate-900"
                        }`}
                    >
                        <ArrowUpCircle size={18} /> Entrada
                    </button>
                    <button 
                        onClick={() => setTipo("TRANSFERENCIA")}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all ${
                            tipo === "TRANSFERENCIA" 
                            ? "bg-indigo-500 text-white shadow-md" 
                            : "text-slate-500 hover:bg-white dark:hover:bg-slate-900"
                        }`}
                    >
                        <ArrowLeftRight size={18} /> Transf.
                    </button>
                    <button onClick={onClose} className="ml-2 px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Valor e Descrição */}
                    <div className="space-y-4">
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-400">R$</span>
                            <input 
                                type="text"
                                required
                                value={valor}
                                onChange={(e) => setValor(formatCurrencyInput(e.target.value))}
                                className={`w-full bg-slate-50 dark:bg-slate-800 border-none outline-none text-4xl font-black rounded-3xl py-6 pl-14 pr-6 focus:ring-4 transition-all ${
                                    tipo === "GASTO" ? "text-rose-500 focus:ring-rose-500/20" : 
                                    tipo === "ENTRADA" ? "text-emerald-500 focus:ring-emerald-500/20" : 
                                    "text-indigo-500 focus:ring-indigo-500/20"
                                }`}
                                placeholder="0,00"
                            />
                        </div>
                        <input 
                            type="text"
                            required
                            value={descricao}
                            onChange={(e) => setDescricao(e.target.value)}
                            placeholder={tipo === "TRANSFERENCIA" ? "Motivo da transferência..." : `Ex: ${tipo === 'GASTO' ? 'Mercado, Uber, Luz' : 'Salário, Venda, Pix'}`}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-indigo-500 rounded-2xl py-4 px-6 text-slate-800 dark:text-slate-100 font-bold placeholder:text-slate-400 placeholder:font-medium transition-all"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Data */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Calendar size={14} /> Data
                            </label>
                            <input 
                                type="date"
                                required
                                value={data}
                                onChange={(e) => setData(e.target.value)}
                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 font-medium outline-none focus:border-indigo-500"
                            />
                        </div>

                        {/* Categoria (se não for transf) */}
                        {tipo !== "TRANSFERENCIA" && (
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Tag size={14} /> Categoria
                                </label>
                                <select 
                                    required
                                    value={categoriaId}
                                    onChange={(e) => setCategoriaId(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 font-medium outline-none focus:border-indigo-500"
                                >
                                    <option value="" disabled>Selecione...</option>
                                    {catsFiltradas.map(c => (
                                        <option key={c.id} value={c.id}>{c.nome}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Forma de Pagamento (Contas e Cartões) */}
                    {tipo !== "TRANSFERENCIA" ? (
                        <div className="space-y-4 pt-2">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">Como será {tipo === "GASTO" ? "pago" : "recebido"}?</label>
                            
                            {/* Toggle Conta/Cartao só para Gastos */}
                            {tipo === "GASTO" && (
                                <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                                    <button 
                                        type="button"
                                        onClick={() => setFormaPagamento("CONTA")}
                                        className={`flex-1 py-2 font-bold text-sm rounded-lg transition-all ${formaPagamento === "CONTA" ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm" : "text-slate-500"}`}
                                    >
                                        Conta Corrente
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setFormaPagamento("CARTAO")}
                                        className={`flex-1 py-2 font-bold text-sm rounded-lg transition-all ${formaPagamento === "CARTAO" ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm" : "text-slate-500"}`}
                                    >
                                        Cartão de Crédito
                                    </button>
                                </div>
                            )}

                            {formaPagamento === "CONTA" || tipo === "ENTRADA" ? (
                                <div className="space-y-2">
                                    <div className="relative">
                                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <select 
                                            required
                                            value={contaId}
                                            onChange={(e) => setContaId(e.target.value)}
                                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-12 pr-4 py-3 text-slate-800 dark:text-slate-100 font-medium outline-none focus:border-indigo-500 appearance-none"
                                        >
                                            <option value="" disabled>Selecione a conta</option>
                                            {contas.map(c => (
                                                <option key={c.id} value={c.id}>{c.nome}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="relative">
                                        <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <select 
                                            required
                                            value={cartaoId}
                                            onChange={(e) => setCartaoId(e.target.value)}
                                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-12 pr-4 py-3 text-slate-800 dark:text-slate-100 font-medium outline-none focus:border-indigo-500 appearance-none"
                                        >
                                            <option value="" disabled>Selecione o cartão</option>
                                            {cartoes.map(c => (
                                                <option key={c.id} value={c.id}>{c.nome}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="relative">
                                        <select 
                                            value={parcelas}
                                            onChange={(e) => setParcelas(e.target.value)}
                                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 font-medium outline-none focus:border-indigo-500 appearance-none"
                                        >
                                            <option value="1">1x (À vista)</option>
                                            {[2,3,4,5,6,7,8,9,10,11,12].map(p => (
                                                <option key={p} value={p}>{p}x Parcelado</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {tipo === "ENTRADA" && (
                                <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <input 
                                        type="checkbox" 
                                        id="recorrente"
                                        checked={recorrente}
                                        onChange={(e) => setRecorrente(e.target.checked)}
                                        className="w-5 h-5 rounded text-indigo-500 focus:ring-indigo-500 border-slate-300"
                                    />
                                    <label htmlFor="recorrente" className="font-bold text-slate-700 dark:text-slate-300">
                                        Essa entrada é recorrente? (Mensal)
                                    </label>
                                </div>
                            )}

                        </div>
                    ) : (
                        // TRANSFERENCIA
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">Origem (Saiu de)</label>
                                <select 
                                    required
                                    value={contaId}
                                    onChange={(e) => setContaId(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 font-medium outline-none focus:border-rose-500 appearance-none"
                                >
                                    <option value="" disabled>Selecione...</option>
                                    {contas.map(c => (
                                        <option key={c.id} value={c.id}>{c.nome}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">Destino (Entrou em)</label>
                                <select 
                                    required
                                    value={contaDestinoId}
                                    onChange={(e) => setContaDestinoId(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 font-medium outline-none focus:border-emerald-500 appearance-none"
                                >
                                    <option value="" disabled>Selecione...</option>
                                    {contas.filter(c => c.id !== contaId).map(c => (
                                        <option key={c.id} value={c.id}>{c.nome}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Observações */}
                    <div className="relative">
                        <AlignLeft className="absolute left-4 top-4 text-slate-400" size={18} />
                        <textarea 
                            value={observacao}
                            onChange={(e) => setObservacao(e.target.value)}
                            placeholder="Observações adicionais (opcional)"
                            rows={2}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-12 pr-4 py-3 text-slate-800 dark:text-slate-100 font-medium outline-none focus:border-indigo-500 resize-none"
                        />
                    </div>

                    <button 
                        disabled={loading}
                        className={`w-full py-4 rounded-2xl font-black text-white text-lg transition-all shadow-xl disabled:opacity-70 ${
                            tipo === "GASTO" ? "bg-rose-500 hover:bg-rose-600 shadow-rose-500/30" : 
                            tipo === "ENTRADA" ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30" : 
                            "bg-indigo-500 hover:bg-indigo-600 shadow-indigo-500/30"
                        }`}
                    >
                        {loading ? "Salvando..." : `Salvar ${tipo === "GASTO" ? "Gasto" : tipo === "ENTRADA" ? "Entrada" : "Transferência"}`}
                    </button>
                </form>
            </motion.div>
        </div>
    );
}
