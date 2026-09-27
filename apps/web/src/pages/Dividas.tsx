import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import {
	Plus,
	HandCoins,
	CheckCircle2,
	CircleDashed,
	TrendingDown,
	Building,
    Check,
	RefreshCw
} from "lucide-react";
import { Toaster, toast } from "react-hot-toast";
import AddDividaModal from "../components/AddDividaModal";
import DividaDetalheModal from "../components/DividaDetalheModal";
import { motion } from "framer-motion";

export default function DividasWeb() {
	const [dividas, setDividas] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [userId, setUserId] = useState<string>("");
	
    const [isAddDividaOpen, setIsAddDividaOpen] = useState(false);
    const [dividaSelecionada, setDividaSelecionada] = useState<any>(null);

	const loadDividas = useCallback(async () => {
		setLoading(true);
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
            setUserId(user.id);
            try {
                const data = await financeService.getDividas(user.id);
			    setDividas(data || []);
                setDividaSelecionada((prev: any) => {
                    if (!prev) return null;
                    return (data || []).find((d: any) => d.id === prev.id) || null;
                });
            } catch (err: any) {
                toast.error("Erro ao carregar dívidas: " + err.message);
            }
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		loadDividas();
		
		let channel: any;
		async function setupRealtime() {
			const { data: { user } } = await supabase.auth.getUser();
			if (user) {
				channel = financeService.subscribeToChanges("dividas", user.id, loadDividas);
			}
		}
		setupRealtime();
		return () => { if (channel) supabase.removeChannel(channel); };
	}, [loadDividas]);


	const stats = useMemo(() => {
		let totalOriginal = 0;
		let saldoDevedor = 0;
		let parcelasPendentesCount = 0;
		
		dividas.forEach(d => {
			if (d.status !== 'quitada') {
				totalOriginal += Number(d.valor_original);
                
                // Calcular saldo devedor baseado nas parcelas pendentes
                const pendentes = (d.parcelas_divida || []).filter((p: any) => p.status === 'pendente');
                parcelasPendentesCount += pendentes.length;
                
                pendentes.forEach((p: any) => {
                    saldoDevedor += Number(p.valor_esperado);
                });
			}
		});

		return { totalOriginal, saldoDevedor, parcelasPendentesCount };
	}, [dividas]);

    const ativas = dividas.filter(d => d.status !== 'quitada');
    const quitadas = dividas.filter(d => d.status === 'quitada');

	return (
		<div className="space-y-6 sm:space-y-8 pb-20">
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] shadow-sm border border-purple-50 dark:border-slate-800 relative overflow-hidden transition-colors">
				<div className="absolute top-0 right-0 w-64 h-64 bg-purple-100 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/4 pointer-events-none" />
				
				<div className="space-y-1 relative z-10">
					<div className="flex items-center gap-3">
						<div className="bg-purple-100 dark:bg-purple-950/40 p-2 rounded-xl text-purple-600 dark:text-purple-400">
							<HandCoins size={24} />
						</div>
						<h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">Dívidas e Empréstimos</h1>
					</div>
					<p className="text-gray-400 dark:text-slate-500 font-medium text-sm ml-12">Organize e quite seus contratos, empréstimos e parcelamentos</p>
				</div>

				<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 relative z-10 w-full lg:w-auto">
					<button 
						onClick={async () => {
							toast.loading("Sincronizando com extratos...", { id: "sync-dividas" });
							await loadDividas();
							toast.success("Dívidas sincronizadas com os extratos!", { id: "sync-dividas" });
						}}
						className="px-5 py-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-[25px] font-black flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap text-sm"
						title="Cruza lançamentos e resgates de empréstimos do extrato com os contratos ativos"
					>
						<RefreshCw size={18} /> Sincronizar Extratos
					</button>

					<button 
						onClick={() => setIsAddDividaOpen(true)}
						className="px-8 py-4 bg-purple-600 text-white rounded-[25px] font-black flex items-center justify-center gap-2 hover:bg-purple-700 transition-all shadow-xl shadow-purple-200 dark:shadow-none cursor-pointer whitespace-nowrap"
					>
						<Plus size={20} /> NOVA DÍVIDA
					</button>
				</div>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[35px] border border-gray-100 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-purple-200 dark:hover:border-purple-800 transition-colors">
					<div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 dark:bg-rose-955/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform" />
					<p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">Valor Total (Original)</p>
					<h2 className="text-3xl font-black text-rose-500 dark:text-rose-400">R$ {stats.totalOriginal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
				</div>
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[35px] border border-gray-100 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-purple-200 dark:hover:border-purple-800 transition-colors">
					<div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 dark:bg-amber-955/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform" />
					<p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">Parcelas Pendentes</p>
					<h2 className="text-3xl font-black text-amber-500">{stats.parcelasPendentesCount} itens</h2>
				</div>
				<div className="bg-gradient-to-br from-purple-600 to-indigo-600 p-5 sm:p-8 rounded-3xl sm:rounded-[35px] shadow-lg shadow-purple-200 dark:shadow-none text-white relative overflow-hidden flex flex-col justify-between">
					<div className="absolute bottom-0 right-0 w-40 h-40 bg-white/10 rounded-tl-full blur-xl pointer-events-none" />
					<div>
						<p className="text-[10px] font-black text-purple-200 uppercase tracking-widest mb-2">Saldo Devedor Restante</p>
						<h2 className="text-3xl font-black">R$ {stats.saldoDevedor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
					</div>
				</div>
			</div>

            {loading ? (
                <div className="flex justify-center p-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <h3 className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <TrendingDown className="text-rose-500" /> DÍVIDAS ATIVAS
                        </h3>
                        {ativas.length === 0 ? (
                            <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-[35px] p-10 text-center text-slate-400">
                                Nenhuma dívida ativa no momento. Ufa!
                            </div>
                        ) : (
                            ativas.map(d => {
                                const parcelas = d.parcelas_divida || [];
                                const pagas = parcelas.filter((p: any) => p.status === 'paga').length;
                                const pendentes = parcelas.filter((p: any) => p.status === 'pendente');
                                const valorRestante = pendentes.reduce((acc: number, p: any) => acc + Number(p.valor_esperado || 0), 0);
                                const progresso = parcelas.length > 0 ? (pagas / parcelas.length) * 100 : 0;

                                return (
                                    <div 
                                        key={d.id} 
                                        onClick={() => setDividaSelecionada(d)}
                                        className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-[35px] cursor-pointer hover:border-purple-300 dark:hover:border-purple-700 transition-all group shadow-sm hover:shadow-md"
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h4 className="font-black text-lg text-slate-800 dark:text-slate-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{d.descricao}</h4>
                                                <p className="text-sm font-medium text-slate-500 flex items-center gap-1.5 mt-0.5">
                                                    <Building size={14}/> {d.instituicao || d.tipo.replace("_", " ").toUpperCase()}
                                                </p>
                                            </div>
                                            <div className="text-right flex flex-col items-end">
                                                <p className="text-[10px] font-black uppercase tracking-wider text-rose-500 dark:text-rose-400">
                                                    Falta pagar
                                                </p>
                                                <p className="font-black text-xl text-rose-500 dark:text-rose-400">
                                                    R$ {valorRestante.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </p>
                                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">
                                                    Total: R$ {Number(d.valor_original).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </p>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDividaSelecionada(d);
                                                    }}
                                                    className="mt-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-600 hover:text-white text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-xl text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer"
                                                >
                                                    <CheckCircle2 size={13} /> Quitar / Detalhes
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-1000 rounded-full"
                                                    style={{ width: `${progresso}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between items-center text-xs font-bold text-slate-400 dark:text-slate-500 pt-1">
                                                <span>{pagas} de {parcelas.length} parcelas pagas</span>
                                                <span className="text-purple-600 dark:text-purple-400 font-black">{progresso.toFixed(0)}%</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <Check className="text-emerald-500" /> HISTÓRICO QUITADO
                        </h3>
                        {quitadas.length === 0 ? (
                            <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-[35px] p-10 text-center text-slate-400">
                                Ainda não há dívidas quitadas.
                            </div>
                        ) : (
                            quitadas.map(d => (
                                <div 
                                    key={d.id} 
                                    onClick={() => setDividaSelecionada(d)}
                                    className="bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 p-6 rounded-[35px] cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
                                >
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <h4 className="font-black text-lg text-slate-800 dark:text-slate-100 line-through opacity-70">{d.descricao}</h4>
                                            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                                <CheckCircle2 size={14}/> Totalmente Paga
                                            </p>
                                        </div>
                                        <div className="text-right opacity-70">
                                            <p className="font-black text-slate-500 line-through">R$ {d.valor_original.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            <AddDividaModal 
                isOpen={isAddDividaOpen} 
                onClose={() => setIsAddDividaOpen(false)} 
                userId={userId} 
            />

            <DividaDetalheModal 
                isOpen={!!dividaSelecionada} 
                onClose={() => setDividaSelecionada(null)} 
                divida={dividaSelecionada}
                userId={userId}
                onPagamentoRealizado={() => {
                    loadDividas();
                }}
            />
			<Toaster position="bottom-center" />
		</div>
	);
}
