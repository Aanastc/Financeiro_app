import { formatarMoeda } from "../../../../packages/services/moeda.service";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, ArrowDownCircle, ArrowUpCircle, Building2, Calendar, FileText, Landmark } from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import { toast } from "react-hot-toast";
import InputMoeda, { lerMoeda } from "./InputMoeda";

/** "2026-10-07" → "07/10/2026" sem passar por fuso horário (new Date() mostrava um dia antes) */
const dataBR = (iso: string) => {
    const [a, m, d] = String(iso || "").slice(0, 10).split("-");
    return a && m && d ? `${d}/${m}/${a}` : iso;
};

export default function ContaExtratoModal({ isOpen, onClose, conta, onSaldoAjustado }: { isOpen: boolean, onClose: () => void, conta: any, onSaldoAjustado?: () => void }) {
    const [movimentacoes, setMovimentacoes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [ajustando, setAjustando] = useState(false);
    const [saldoReal, setSaldoReal] = useState("");
    const [salvandoAjuste, setSalvandoAjuste] = useState(false);
    const [saldoExibido, setSaldoExibido] = useState<number | null>(null);
    // Transferência que na verdade foi entrada (ex.: salário vindo da conta do CNPJ)
    const [reclassificando, setReclassificando] = useState<string | null>(null);
    const [categoriaEntrada, setCategoriaEntrada] = useState("Salário");
    const [salvandoReclass, setSalvandoReclass] = useState(false);

    const salvarReclassificacao = async (transacaoId: string) => {
        setSalvandoReclass(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Sessão expirada. Entre de novo.");
            await financeService.reclassificarTransferenciaComoEntrada(user.id, transacaoId, categoriaEntrada);
            toast.success(`Agora é uma entrada (${categoriaEntrada}). O saldo da conta não muda.`);
            setReclassificando(null);
            await loadExtrato();
            onSaldoAjustado?.();
        } catch (e: any) {
            toast.error(e?.message || "Não foi possível alterar.");
        } finally {
            setSalvandoReclass(false);
        }
    };

    useEffect(() => {
        setAjustando(false);
        setSaldoReal("");
        setSaldoExibido(null);
    }, [conta?.id]);

    const salvarAjuste = async () => {
        const valor = lerMoeda(saldoReal);
        setSalvandoAjuste(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Sessão expirada. Entre de novo.");
            await financeService.ajustarSaldoConta(user.id, conta.id, valor);
            setSaldoExibido(valor);
            setAjustando(false);
            toast.success("Saldo ajustado. As movimentações continuam as mesmas.");
            onSaldoAjustado?.();
        } catch (e: any) {
            toast.error(e?.message || "Não foi possível ajustar o saldo.");
        } finally {
            setSalvandoAjuste(false);
        }
    };

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

    const saldoAtual = saldoExibido ?? (conta.saldo_atual || 0);

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
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 mb-6 shadow-sm flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Saldo Atual</p>
                            <h3 className={`text-2xl font-black mt-1 ${saldoAtual < 0 ? 'text-rose-500' : 'text-slate-800 dark:text-slate-100'}`}>
                                {formatarMoeda(saldoAtual, conta.moeda)}
                            </h3>
                            {(conta.outras_moedas || []).map((o: any) => (
                                <p key={o.moeda} className="text-sm font-black text-slate-600 dark:text-slate-300 mt-1">
                                    + {formatarMoeda(o.valor, o.moeda)}
                                    {o.reais !== null && <span className="ml-1 text-xs font-semibold text-slate-400">≈ {formatarMoeda(o.reais, "BRL")}</span>}
                                </p>
                            ))}
                        </div>
                        {ajustando ? (
                            <div className="flex flex-col gap-2 w-full sm:w-auto">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                    Quanto o app do banco mostra agora? ({conta.moeda || "BRL"})
                                </label>
                                <div className="flex gap-2">
                                    <InputMoeda
                                        value={saldoReal}
                                        onChange={setSaldoReal}
                                        className="w-36 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                                        autoFocus
                                    />
                                    <button
                                        onClick={salvarAjuste}
                                        disabled={salvandoAjuste || !saldoReal}
                                        className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black"
                                    >
                                        {salvandoAjuste ? "Salvando..." : "Salvar"}
                                    </button>
                                    <button onClick={() => setAjustando(false)} className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                                        Cancelar
                                    </button>
                                </div>
                                <p className="text-[11px] text-slate-400 max-w-xs">
                                    Use quando havia dinheiro na conta antes do primeiro extrato importado. Só o saldo inicial muda; nenhum lançamento é apagado.
                                </p>
                            </div>
                        ) : (
                            <button
                                onClick={() => setAjustando(true)}
                                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                                Saldo diferente do banco? Ajustar
                            </button>
                        )}
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
                                                    {dataBR(mov.data)}
                                                    {mov.transacoes?.tipo === "TRANSFERENCIA" && <span className="ml-1">· transferência</span>}
                                                </p>
                                                {isEntrada && mov.transacoes?.tipo === "TRANSFERENCIA" && mov.transacao_id && (
                                                    reclassificando === mov.id ? (
                                                        <div className="flex flex-wrap items-center gap-2 mt-2">
                                                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Foi uma entrada de:</span>
                                                            <input
                                                                list="categorias-entrada"
                                                                value={categoriaEntrada}
                                                                onChange={(e) => setCategoriaEntrada(e.target.value)}
                                                                className="w-36 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none"
                                                            />
                                                            <datalist id="categorias-entrada">
                                                                <option value="Salário" />
                                                                <option value="Pró-labore" />
                                                                <option value="Distribuição de lucros" />
                                                                <option value="Freelance" />
                                                                <option value="Outros" />
                                                            </datalist>
                                                            <button
                                                                onClick={() => salvarReclassificacao(mov.transacao_id)}
                                                                disabled={salvandoReclass || !categoriaEntrada.trim()}
                                                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black"
                                                            >
                                                                {salvandoReclass ? "Salvando..." : "Confirmar"}
                                                            </button>
                                                            <button onClick={() => setReclassificando(null)} className="text-xs font-bold text-slate-400 hover:text-slate-600">
                                                                Cancelar
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => { setReclassificando(mov.id); setCategoriaEntrada("Salário"); }}
                                                            className="mt-1 text-[11px] font-bold text-indigo-500 hover:text-indigo-600 underline"
                                                        >
                                                            Não foi transferência entre contas minhas? Marcar como entrada
                                                        </button>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-black ${colorClass}`}>
                                                {isEntrada ? "+" : "-"} {formatarMoeda(mov.valor, mov.moeda || conta.moeda)}
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
