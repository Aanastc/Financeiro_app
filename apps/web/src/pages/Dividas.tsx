import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import {
	Plus,
	HandCoins,
	CheckCircle2,
	TrendingDown,
	Building,
	Check,
	RefreshCw,
	CreditCard,
	Calendar,
	Filter,
	AlertTriangle,
	Banknote,
	ShieldAlert
} from "lucide-react";
import { Toaster, toast } from "react-hot-toast";
import AddDividaModal from "../components/AddDividaModal";
import DividaDetalheModal from "../components/DividaDetalheModal";
import { motion } from "framer-motion";

export default function DividasWeb() {
	const [dividas, setDividas] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [userId, setUserId] = useState<string>("");
	
	const [abaAtiva, setAbaAtiva] = useState<'todas' | 'emprestimos' | 'renegociacoes' | 'quitadas'>('todas');
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
		let totalEmprestimos = 0;
		let totalRenegociacoes = 0;
		
		dividas.forEach(d => {
			const dDesc = (d.descricao || "").toLowerCase();
			const tipo = (d.tipo || "").toLowerCase();
			const isReneg = tipo === 'renegociacao_cartao' || dDesc.includes("renegocia") || dDesc.includes("acordo");

			if (d.status !== 'quitada') {
				totalOriginal += Number(d.valor_original || 0);
				
				const pendentes = (d.parcelas_divida || []).filter((p: any) => p.status === 'pendente');
				parcelasPendentesCount += pendentes.length;
				
				const saldoItem = pendentes.reduce((acc: number, p: any) => acc + Number(p.valor_esperado || 0), 0) || Number(d.valor_atual || d.valor_original || 0);
				saldoDevedor += saldoItem;

				if (isReneg) {
					totalRenegociacoes += saldoItem;
				} else {
					totalEmprestimos += saldoItem;
				}
			}
		});

		return { totalOriginal, saldoDevedor, parcelasPendentesCount, totalEmprestimos, totalRenegociacoes };
	}, [dividas]);

	const ativas = useMemo(() => dividas.filter(d => d.status !== 'quitada'), [dividas]);
	const quitadas = useMemo(() => dividas.filter(d => d.status === 'quitada'), [dividas]);

	const getTipoInfo = (d: any) => {
		const tipo = (d.tipo || "").toLowerCase();
		const desc = (d.descricao || "").toLowerCase();

		if (tipo === "renegociacao_cartao" || desc.includes("renegocia") || desc.includes("acordo")) {
			return {
				label: "Renegociação de Cartão",
				icon: <CreditCard size={14} />,
				badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
			};
		}
		if (tipo === "consignado" || desc.includes("consignado")) {
			return {
				label: "Empréstimo Consignado",
				icon: <Banknote size={14} />,
				badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
			};
		}
		if (tipo === "financiamento" || desc.includes("financiamento")) {
			return {
				label: "Financiamento",
				icon: <Building size={14} />,
				badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
			};
		}
		return {
			label: "Empréstimo Pessoal",
			icon: <HandCoins size={14} />,
			badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
		};
	};

	const dividasExibidas = useMemo(() => {
		if (abaAtiva === 'quitadas') return quitadas;
		
		let list = ativas;
		if (abaAtiva === 'emprestimos') {
			list = list.filter(d => {
				const desc = (d.descricao || "").toLowerCase();
				const tipo = (d.tipo || "").toLowerCase();
				return tipo !== 'renegociacao_cartao' && !desc.includes("renegocia") && !desc.includes("acordo");
			});
		} else if (abaAtiva === 'renegociacoes') {
			list = list.filter(d => {
				const desc = (d.descricao || "").toLowerCase();
				const tipo = (d.tipo || "").toLowerCase();
				return tipo === 'renegociacao_cartao' || desc.includes("renegocia") || desc.includes("acordo");
			});
		}
		return list;
	}, [abaAtiva, ativas, quitadas]);

	return (
		<div className="space-y-6 sm:space-y-8 pb-20">
			{/* CABEÇALHO */}
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] shadow-sm border border-purple-50 dark:border-slate-800 relative overflow-hidden transition-colors">
				<div className="absolute top-0 right-0 w-64 h-64 bg-purple-100 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/4 pointer-events-none" />
				
				<div className="space-y-1 relative z-10">
					<div className="flex items-center gap-3">
						<div className="bg-purple-100 dark:bg-purple-950/40 p-2 rounded-xl text-purple-600 dark:text-purple-400">
							<HandCoins size={24} />
						</div>
						<h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">Dívidas, Empréstimos & Renegociações</h1>
					</div>
					<p className="text-gray-400 dark:text-slate-500 font-medium text-sm ml-12">
						Controle completo de contratos ativos, empréstimos consignados e acordos de cartão
					</p>
				</div>

				<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 relative z-10 w-full lg:w-auto">
					<button 
						onClick={async () => {
							toast.loading("Sincronizando contratos e parcelas...", { id: "sync-dividas" });
							await loadDividas();
							toast.success("Dívidas sincronizadas com sucesso!", { id: "sync-dividas" });
						}}
						className="px-5 py-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-[25px] font-black flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap text-sm"
						title="Atualiza o status dos contratos e parcelas pendentes"
					>
						<RefreshCw size={18} /> Sincronizar Contratos
					</button>

					<button 
						onClick={() => setIsAddDividaOpen(true)}
						className="px-8 py-4 bg-purple-600 text-white rounded-[25px] font-black flex items-center justify-center gap-2 hover:bg-purple-700 transition-all shadow-xl shadow-purple-200 dark:shadow-none cursor-pointer whitespace-nowrap"
					>
						<Plus size={20} /> NOVA DÍVIDA / ACORDO
					</button>
				</div>
			</div>

			{/* KPIS GERAIS */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
					<p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1">Valor Total (Original)</p>
					<h2 className="text-2xl sm:text-3xl font-black text-rose-500 dark:text-rose-400">
						R$ {stats.totalOriginal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
					</h2>
					<span className="text-xs text-slate-400 mt-1 block font-medium">Contratos contratados</span>
				</div>

				<div className="bg-gradient-to-br from-purple-600 to-indigo-600 p-5 sm:p-6 rounded-3xl shadow-lg shadow-purple-200 dark:shadow-none text-white relative overflow-hidden flex flex-col justify-between">
					<div>
						<p className="text-[10px] font-black text-purple-200 uppercase tracking-widest mb-1">Saldo Devedor Restante</p>
						<h2 className="text-2xl sm:text-3xl font-black">
							R$ {stats.saldoDevedor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
						</h2>
					</div>
					<span className="text-xs text-purple-200 mt-1 font-medium">{stats.parcelasPendentesCount} parcelas pendentes</span>
				</div>

				<div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm">
					<p className="text-[10px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-widest mb-1">Empréstimos / Consignados</p>
					<h2 className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">
						R$ {stats.totalEmprestimos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
					</h2>
					<span className="text-xs text-slate-400 mt-1 block font-medium">Saldo devedor em empréstimos</span>
				</div>

				<div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm">
					<p className="text-[10px] font-black text-purple-500 dark:text-purple-400 uppercase tracking-widest mb-1">Acordos de Cartão</p>
					<h2 className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400">
						R$ {stats.totalRenegociacoes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
					</h2>
					<span className="text-xs text-slate-400 mt-1 block font-medium">Saldo devedor renegociado</span>
				</div>
			</div>

			{/* ABAS DE CATEGORIZAÇÃO */}
			<div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-x-auto gap-1">
				<button
					onClick={() => setAbaAtiva('todas')}
					className={`px-5 py-3 rounded-xl font-black text-xs transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
						abaAtiva === 'todas'
							? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-sm'
							: 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
					}`}
				>
					<TrendingDown size={16} /> Todas as Ativas ({ativas.length})
				</button>

				<button
					onClick={() => setAbaAtiva('emprestimos')}
					className={`px-5 py-3 rounded-xl font-black text-xs transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
						abaAtiva === 'emprestimos'
							? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
							: 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
					}`}
				>
					<Banknote size={16} /> Empréstimos & Consignados ({ativas.filter(d => !(d.tipo === 'renegociacao_cartao' || (d.descricao || "").toLowerCase().includes("renegocia"))).length})
				</button>

				<button
					onClick={() => setAbaAtiva('renegociacoes')}
					className={`px-5 py-3 rounded-xl font-black text-xs transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
						abaAtiva === 'renegociacoes'
							? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-sm'
							: 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
					}`}
				>
					<CreditCard size={16} /> Renegociações de Cartão ({ativas.filter(d => d.tipo === 'renegociacao_cartao' || (d.descricao || "").toLowerCase().includes("renegocia")).length})
				</button>

				<button
					onClick={() => setAbaAtiva('quitadas')}
					className={`px-5 py-3 rounded-xl font-black text-xs transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
						abaAtiva === 'quitadas'
							? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
							: 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
					}`}
				>
					<Check size={16} /> Quitadas ({quitadas.length})
				</button>
			</div>

			{/* CONTEÚDO DAS DÍVIDAS */}
			{loading ? (
				<div className="flex justify-center p-20">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
				</div>
			) : dividasExibidas.length === 0 ? (
				<div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center text-slate-400">
					<CheckCircle2 size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
					<h4 className="text-lg font-black text-slate-700 dark:text-slate-200">Nenhum contrato encontrado nesta aba</h4>
					<p className="text-sm mt-1">Todos os seus contratos estão em dia ou não há dívidas cadastradas nesta categoria.</p>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					{dividasExibidas.map(d => {
						const tipoInfo = getTipoInfo(d);
						const parcelas = d.parcelas_divida || [];
						const pagas = parcelas.filter((p: any) => p.status === 'paga').length;
						const pendentes = parcelas.filter((p: any) => p.status === 'pendente');
						const proximaParcela = pendentes[0] || null;
						const valorRestante = pendentes.reduce((acc: number, p: any) => acc + Number(p.valor_esperado || 0), 0) || Number(d.valor_atual || d.valor_original || 0);
						const progresso = parcelas.length > 0 ? (pagas / parcelas.length) * 100 : 0;
						const isQuitada = d.status === 'quitada';

						return (
							<div 
								key={d.id} 
								onClick={() => setDividaSelecionada(d)}
								className={`bg-white dark:bg-slate-900 border p-6 rounded-3xl cursor-pointer transition-all group shadow-sm hover:shadow-md flex flex-col justify-between ${
									isQuitada 
										? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/20' 
										: 'border-slate-200/90 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-700'
								}`}
							>
								<div>
									<div className="flex justify-between items-start mb-3">
										<div>
											<span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${tipoInfo.badgeClass}`}>
												{tipoInfo.icon}
												{tipoInfo.label}
											</span>
											<h4 className={`font-black text-xl mt-2 text-slate-800 dark:text-slate-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors ${isQuitada ? 'line-through opacity-80' : ''}`}>
												{d.descricao}
											</h4>
											<p className="text-sm font-medium text-slate-500 flex items-center gap-1.5 mt-1">
												<Building size={14}/> {d.instituicao || "Banco / Instituição Financeira"}
											</p>
										</div>

										<div className="text-right">
											<p className="text-[10px] font-black uppercase tracking-wider text-rose-500 dark:text-rose-400">
												{isQuitada ? "Status" : "Falta pagar"}
											</p>
											<p className={`font-black text-2xl ${isQuitada ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
												{isQuitada ? "Quitada" : `R$ ${valorRestante.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
											</p>
											<p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-0.5">
												Original: R$ {Number(d.valor_original).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
											</p>
										</div>
									</div>

									{/* Informações da Próxima Parcela */}
									{proximaParcela && !isQuitada && (
										<div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl mb-4 text-xs font-bold flex items-center justify-between text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800">
											<span className="flex items-center gap-1.5">
												<Calendar size={14} className="text-indigo-500" />
												Próxima parcela ({proximaParcela.numero_parcela}/{parcelas.length})
											</span>
											<span className="text-indigo-600 dark:text-indigo-400 font-black">
												R$ {Number(proximaParcela.valor_esperado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
												{proximaParcela.data_vencimento && ` (Vence ${new Date(proximaParcela.data_vencimento + "T12:00:00").toLocaleDateString('pt-BR')})`}
											</span>
										</div>
									)}
								</div>

								<div className="space-y-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
									<div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
										<div 
											className={`h-full transition-all duration-1000 rounded-full ${isQuitada ? 'bg-emerald-500' : 'bg-gradient-to-r from-purple-500 to-indigo-500'}`}
											style={{ width: `${Math.min(100, Math.max(0, progresso))}%` }}
										/>
									</div>
									<div className="flex justify-between items-center text-xs font-bold text-slate-400 dark:text-slate-500 pt-1">
										<span>{pagas} de {parcelas.length || d.parcelas_totais || 1} parcelas pagas</span>
										<span className="text-purple-600 dark:text-purple-400 font-black">{progresso.toFixed(0)}%</span>
									</div>
								</div>
							</div>
						);
					})}
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
