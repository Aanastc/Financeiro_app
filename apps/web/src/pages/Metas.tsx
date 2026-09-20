import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import {
	Plus,
	Target,
	TrendingUp,
	Calendar,
	ArrowUpRight,
	Wallet,
	PiggyBank,
	ChevronRight,
	FileText
} from "lucide-react";
import { Toaster, toast } from "react-hot-toast";
import AddMetaWeb from "../components/AddMetaWeb";
import AddDepositoWeb from "../components/AddDepositoWeb";
import MetaExtratoModal from "../components/MetaExtratoModal";

export default function MetasWeb() {
	const [metas, setMetas] = useState<any[]>([]);
	const [investimentos, setInvestimentos] = useState<any[]>([]);
	const [transacoesPatrimoniais, setTransacoesPatrimoniais] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [isAddMetaOpen, setIsAddMetaOpen] = useState(false);
	const [depositoMeta, setDepositoMeta] = useState<{id: string, titulo: string} | null>(null);
	const [extratoMeta, setExtratoMeta] = useState<any | null>(null);

	const loadMetas = useCallback(async () => {
		setLoading(true);
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
			// Sincroniza vínculos entre metas, investimentos e transações de RDB
			await financeService.syncMetasInvestimentos(user.id).catch(() => {});

			const [resMetas, resInv, resTx] = await Promise.all([
				supabase
					.from("metas")
					.select(`
						*,
						metas_depositos (
							id,
							valor,
							data_deposito
						)
					`)
					.eq("usuario_id", user.id)
					.order("prazo", { ascending: true }),
				financeService.getInvestimentos(user.id),
				supabase
					.from("transacoes")
					.select("id, valor, tipo, descricao, data, conta_id")
					.eq("usuario_id", user.id)
					.in("tipo", ["APORTE", "RESGATE"])
			]);
			
			if (resMetas.error) toast.error("Erro ao carregar metas");
			else {
				setMetas(resMetas.data || []);
			}
			setInvestimentos(resInv || []);
			setTransacoesPatrimoniais(resTx.data || []);
		}
		setLoading(false);
	}, []);

	const parseMetaId = (corretora: string) => {
		const match = corretora?.match(/\[Meta:\s*([^\]]+)\]/);
		return match ? match[1] : null;
	};

	useEffect(() => {
		loadMetas();
		
		// Realtime
		let channelMetas: any;
		let channelDepositos: any;
		let channelInvestimentos: any;
		let channelTransacoes: any;
		async function setupRealtime() {
			const { data: { user } } = await supabase.auth.getUser();
			if (user) {
				channelMetas = financeService.subscribeToChanges("metas", user.id, loadMetas);
				channelDepositos = financeService.subscribeToChanges("metas_depositos", user.id, loadMetas);
				channelInvestimentos = financeService.subscribeToChanges("investimentos", user.id, loadMetas);
				channelTransacoes = financeService.subscribeToChanges("transacoes", user.id, loadMetas);
			}
		}
		setupRealtime();
		return () => { 
			if (channelMetas) supabase.removeChannel(channelMetas); 
			if (channelDepositos) supabase.removeChannel(channelDepositos); 
			if (channelInvestimentos) supabase.removeChannel(channelInvestimentos); 
			if (channelTransacoes) supabase.removeChannel(channelTransacoes);
		};
	}, [loadMetas]);

	return (
		<div className="space-y-6 sm:space-y-8 pb-20">
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
				<div className="space-y-1">
					<div className="flex items-center gap-3">
						<div className="bg-pink-100 dark:bg-pink-955/40 p-2 rounded-xl text-pink-600 dark:text-pink-400">
							<Target size={24} />
						</div>
						<h1 className="text-3xl font-black text-[#3D3030] dark:text-slate-100">Metas de Economia</h1>
					</div>
					<p className="text-gray-400 dark:text-slate-500 font-medium text-sm ml-12">Transforme seus sonhos em objetivos alcançáveis</p>
				</div>
 
				<button 
					onClick={() => setIsAddMetaOpen(true)}
					className="px-8 py-4 bg-pink-500 text-white rounded-[25px] font-black flex items-center justify-center gap-2 hover:bg-pink-600 transition-all shadow-xl shadow-pink-100 dark:shadow-none w-full lg:w-auto cursor-pointer">
					<Plus size={20} /> NOVA META
				</button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
				{metas.length > 0 ? metas.map((meta) => {
					const totalDepositado = meta.metas_depositos?.reduce((acc: number, d: any) => acc + Number(d.valor), 0) || 0;
					const isReservaMeta = /reserva(\s+de)?\s+emerg[eê]ncia|caixinha/i.test(meta.titulo);

					const invVinculados = investimentos.filter(inv => {
						const mId = parseMetaId(inv.corretora);
						if (mId === meta.id) return true;
						return isReservaMeta && (/rdb|reserva|caixinha/i.test(inv.titulo || "") || /rdb|caixinha/i.test(inv.corretora || "")) && !mId;
					});
					const totalInvestidoInvs = invVinculados.reduce((acc, inv) => acc + Number(inv.valor_atual), 0);

					// Calcula o saldo das transações da tabela transacoes (APORTE e RESGATE RDB)
					const txVinculadas = transacoesPatrimoniais.filter(t => {
						const desc = (t.descricao || "").toLowerCase();
						return isReservaMeta && (desc.includes("rdb") || desc.includes("caixinha") || desc.includes("reserva") || t.tipo === "APORTE" || t.tipo === "RESGATE");
					});
					const saldoTx = txVinculadas.reduce((acc, t) => {
						const val = Number(t.valor || 0);
						const isResgate = t.tipo === "RESGATE" || (t.descricao || "").toLowerCase().includes("resgate");
						return isResgate ? acc - val : acc + val;
					}, 0);

					const totalInvestido = Math.max(totalInvestidoInvs, Math.max(0, saldoTx));
					const totalAcumulado = totalDepositado + totalInvestido;
					const progresso = (totalAcumulado / meta.valor) * 100;
					
					return (
						<div key={meta.id} className="bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] shadow-sm border border-gray-100 dark:border-slate-800 space-y-6 hover:shadow-md transition-shadow relative overflow-hidden group transition-colors flex flex-col justify-between">
							<div className="space-y-4">
								<div className="flex justify-between items-start">
									<div 
										onClick={() => setExtratoMeta(meta)}
										title="Clique para ver o extrato"
										className="bg-gray-50 dark:bg-slate-800 p-4 rounded-3xl group-hover:bg-pink-50 dark:group-hover:bg-pink-955/40 transition-colors shrink-0 cursor-pointer"
									>
										<PiggyBank size={24} className="text-pink-500 dark:text-pink-400" />
									</div>
									<div className="text-right min-w-0 flex-1 ml-4">
										<p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Até {new Date(meta.prazo).toLocaleDateString('pt-BR')}</p>
										<h3 
											className="text-xl font-black text-[#3D3030] dark:text-slate-100 mt-1 break-words leading-tight" 
											title={meta.titulo}
										>
											{meta.titulo}
										</h3>
										{meta.debito_automatico && (
											<span className="inline-block mt-2 bg-pink-50 dark:bg-pink-955/20 text-pink-600 dark:text-pink-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider truncate max-w-full">
												🔄 Débito: Dia {meta.debito_dia} (R$ {Number(meta.debito_valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
											</span>
										)}
									</div>
								</div>

								<div className="space-y-2">
									<div className="flex justify-between items-end">
										<p className="text-[10px] font-black text-gray-400 uppercase">Progresso</p>
										<p className="text-2xl font-black text-pink-500">{progresso.toFixed(0)}%</p>
									</div>
									<div className="w-full bg-gray-150 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
										<div 
											className="h-full bg-pink-500 rounded-full transition-all duration-1000" 
											style={{ width: `${Math.min(progresso, 100)}%` }}
										/>
									</div>
								</div>

								{invVinculados.length > 0 && (
									<div className="pt-3 border-t border-slate-150 dark:border-slate-800 space-y-1.5 text-left">
										<p className="text-[9px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-wider">Investimentos Vinculados</p>
										<div className="space-y-1 max-h-24 overflow-y-auto no-scrollbar">
											{invVinculados.map(inv => (
												<div key={inv.id} className="flex justify-between items-center text-[10px] text-slate-600 dark:text-slate-400">
													<span className="font-semibold truncate max-w-[150px]">{inv.titulo}</span>
													<span className="font-black text-slate-700 dark:text-slate-200">
														R$ {Number(inv.valor_atual).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
													</span>
												</div>
											))}
										</div>
									</div>
								)}
							</div>

							<div className="space-y-4 pt-4">
								<div 
									onClick={() => setExtratoMeta(meta)}
									className="flex justify-between items-start pt-4 border-t border-dashed border-gray-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/30 p-2 rounded-2xl transition-colors group/cardacc"
									title="Clique para ver o extrato detalhado"
								>
									<div className="text-left">
										<div className="flex items-center gap-1">
											<p className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase">Total Acumulado</p>
											<FileText size={11} className="text-pink-500 opacity-0 group-hover/cardacc:opacity-100 transition-opacity" />
										</div>
										<p className="font-black text-[#3D3030] dark:text-slate-200 text-sm">R$ {totalAcumulado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
										<p className="text-[8px] text-slate-400 dark:text-slate-550 font-bold mt-0.5">
											Dep: R$ {totalDepositado.toLocaleString()} • Inv: R$ {totalInvestido.toLocaleString()}
										</p>
									</div>
									<div className="text-right">
										<p className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase">Objetivo</p>
										<p className="font-black text-gray-300 dark:text-slate-700 text-sm">R$ {Number(meta.valor).toLocaleString()}</p>
									</div>
								</div>
	 
								<div className="grid grid-cols-2 gap-2">
									<button 
										onClick={() => setExtratoMeta(meta)}
										className="py-3.5 px-3 bg-pink-50 dark:bg-pink-955/20 text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-900/40 rounded-2xl font-black text-[10px] uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
										title="Visualizar histórico e excluir lançamentos incorretos"
									>
										<FileText size={14} /> Extrato
									</button>

									<button 
										onClick={() => setDepositoMeta({ id: meta.id, titulo: meta.titulo })}
										className="py-3.5 px-3 bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-pink-500 hover:text-white dark:hover:bg-pink-500 dark:hover:text-white rounded-2xl font-black text-[10px] uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
									>
										Depositar <ArrowUpRight size={14} />
									</button>
								</div>
							</div>
						</div>
					);
				}) : (
					<div className="col-span-full py-20 text-center opacity-20">
						<div className="flex flex-col items-center gap-2">
							<Target size={64} />
							<p className="font-black uppercase text-xs tracking-widest">Nenhuma meta ativa no momento</p>
						</div>
					</div>
				)}
			</div>

			{isAddMetaOpen && (
				<AddMetaWeb 
					onClose={() => setIsAddMetaOpen(false)} 
					onSuccess={loadMetas} 
				/>
			)}

			{depositoMeta && (
				<AddDepositoWeb 
					metaId={depositoMeta.id}
					metaTitulo={depositoMeta.titulo}
					onClose={() => setDepositoMeta(null)} 
					onSuccess={loadMetas} 
				/>
			)}

			{extratoMeta && (
				<MetaExtratoModal 
					isOpen={Boolean(extratoMeta)} 
					onClose={() => setExtratoMeta(null)} 
					meta={extratoMeta} 
					investimentosVinculados={investimentos.filter(inv => {
						const mId = parseMetaId(inv.corretora);
						if (mId === extratoMeta.id) return true;
						const isReserva = /reserva(\s+de)?\s+emerg[eê]ncia|caixinha/i.test(extratoMeta.titulo);
						return isReserva && (/rdb|reserva|caixinha/i.test(inv.titulo || "") || /rdb|caixinha/i.test(inv.corretora || "")) && !mId;
					})} 
					onSuccess={loadMetas} 
				/>
			)}
		</div>
	);
}
