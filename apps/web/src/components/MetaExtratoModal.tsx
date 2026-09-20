import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
	X, 
	PiggyBank, 
	Calendar, 
	FileText, 
	Trash2, 
	TrendingUp, 
	TrendingDown,
	Target, 
	AlertCircle 
} from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import toast from "react-hot-toast";

interface MetaExtratoModalProps {
	isOpen: boolean;
	onClose: () => void;
	meta: any;
	investimentosVinculados?: any[];
	onSuccess: () => void;
}

interface ItemExtrato {
	id: string;
	tipo: "DEPOSITO" | "APORTE" | "RESGATE";
	descricao: string;
	valor: number;
	data: string;
	origem: "metas_depositos" | "transacoes";
}

export default function MetaExtratoModal({ 
	isOpen, 
	onClose, 
	meta, 
	investimentosVinculados = [],
	onSuccess 
}: MetaExtratoModalProps) {
	const [lancamentos, setLancamentos] = useState<ItemExtrato[]>([]);
	const [loading, setLoading] = useState(true);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	useEffect(() => {
		if (isOpen && meta) {
			loadExtrato();
		}
	}, [isOpen, meta]);

	const loadExtrato = async () => {
		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) return;

			const isReservaMeta = /reserva(\s+de)?\s+emerg[eê]ncia|caixinha/i.test(meta.titulo || "");

			const [resDeps, resTxs] = await Promise.all([
				supabase
					.from("metas_depositos")
					.select("*")
					.eq("meta_id", meta.id)
					.order("data_deposito", { ascending: false }),
				supabase
					.from("transacoes")
					.select("id, valor, tipo, descricao, data")
					.eq("usuario_id", user.id)
					.in("tipo", ["APORTE", "RESGATE"])
			]);

			if (resDeps.error) throw resDeps.error;

			const depsFormatados: ItemExtrato[] = (resDeps.data || []).map((d: any) => ({
				id: d.id,
				tipo: "DEPOSITO",
				descricao: "Depósito no Cofre",
				valor: Number(d.valor || 0),
				data: d.data_deposito || d.data || d.criado_em || "",
				origem: "metas_depositos"
			}));

			const txsFormatadas: ItemExtrato[] = (resTxs.data || [])
				.filter((t: any) => {
					const desc = (t.descricao || "").toLowerCase();
					return isReservaMeta && (
						desc.includes("rdb") || 
						desc.includes("caixinha") || 
						desc.includes("reserva") || 
						t.tipo === "APORTE" || 
						t.tipo === "RESGATE"
					);
				})
				.map((t: any) => {
					const desc = (t.descricao || "").toLowerCase();
					const isResgate = t.tipo === "RESGATE" || desc.includes("resgate");
					return {
						id: t.id,
						tipo: isResgate ? "RESGATE" : "APORTE",
						descricao: t.descricao || (isResgate ? "Resgate RDB" : "Aplicação RDB"),
						valor: Number(t.valor || 0),
						data: t.data || "",
						origem: "transacoes"
					};
				});

			const todos = [...depsFormatados, ...txsFormatadas].sort((a, b) => {
				const dateA = new Date(a.data || 0).getTime();
				const dateB = new Date(b.data || 0).getTime();
				return dateB - dateA;
			});

			setLancamentos(todos);
		} catch (error: any) {
			console.error("Erro ao carregar extrato da meta:", error);
			toast.error("Erro ao carregar lançamentos da meta");
		} finally {
			setLoading(false);
		}
	};

	const handleDeleteLancamento = async (item: ItemExtrato) => {
		if (!confirm(`Deseja realmente remover este lançamento de R$ ${Number(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}?`)) {
			return;
		}

		setDeletingId(item.id);
		try {
			if (item.origem === "metas_depositos") {
				const { error } = await supabase
					.from("metas_depositos")
					.delete()
					.eq("id", item.id);
				if (error) throw error;
			} else {
				const { error } = await supabase
					.from("transacoes")
					.delete()
					.eq("id", item.id);
				if (error) throw error;

				await supabase.from("movimentacoes").delete().eq("transacao_id", item.id).catch(() => {});

				const { data: { user } } = await supabase.auth.getUser();
				if (user) {
					await financeService.syncMetasInvestimentos(user.id).catch(() => {});
				}
			}

			toast.success(`Lançamento excluído com sucesso!`);
			setLancamentos(prev => prev.filter(d => d.id !== item.id));
			onSuccess();
		} catch (error: any) {
			console.error("Erro ao excluir lançamento:", error);
			toast.error("Não foi possível excluir o lançamento: " + (error.message || error));
		} finally {
			setDeletingId(null);
		}
	};

	if (!isOpen || !meta) return null;

	const totalDepositosDiretos = lancamentos
		.filter(l => l.origem === "metas_depositos")
		.reduce((acc, d) => acc + Number(d.valor || 0), 0);

	const totalAportesRDB = lancamentos
		.filter(l => l.origem === "transacoes" && l.tipo === "APORTE")
		.reduce((acc, d) => acc + Number(d.valor || 0), 0);

	const totalResgatesRDB = lancamentos
		.filter(l => l.origem === "transacoes" && l.tipo === "RESGATE")
		.reduce((acc, d) => acc + Number(d.valor || 0), 0);

	const saldoRDBTransacoes = Math.max(0, totalAportesRDB - totalResgatesRDB);
	const totalInvestidoInvs = investimentosVinculados.reduce((acc, inv) => acc + Number(inv.valor_atual || 0), 0);
	const totalInvestidoFinal = Math.max(totalInvestidoInvs, saldoRDBTransacoes);
	const totalGeral = totalDepositosDiretos + totalInvestidoFinal;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm">
			<motion.div 
				initial={{ scale: 0.95, opacity: 0 }} 
				animate={{ scale: 1, opacity: 1 }} 
				exit={{ scale: 0.95, opacity: 0 }} 
				className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl flex flex-col max-h-[90vh] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
			>
				{/* Modal Header */}
				<div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start relative overflow-hidden bg-slate-50/50 dark:bg-slate-950/40">
					<div className="flex items-center gap-4 relative z-10">
						<div className="w-12 h-12 rounded-2xl flex items-center justify-center text-pink-500 bg-pink-100 dark:bg-pink-950/60 border border-pink-200 dark:border-pink-800 shadow-sm shrink-0">
							<PiggyBank size={26} />
						</div>
						<div>
							<div className="flex items-center gap-2">
								<span className="text-[10px] font-black uppercase tracking-wider text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/50 px-2 py-0.5 rounded-md border border-pink-200/50 dark:border-pink-800/50">
									Extrato da Meta
								</span>
								<span className="text-xs text-slate-400">Até {new Date(meta.prazo).toLocaleDateString('pt-BR')}</span>
							</div>
							<h2 className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1">
								{meta.titulo}
							</h2>
						</div>
					</div>
					<button 
						onClick={onClose} 
						className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors relative z-10 cursor-pointer"
					>
						<X size={22} />
					</button>
				</div>

				{/* Resumo Financeiro da Meta */}
				<div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-3 gap-4 text-center">
					<div className="p-3 bg-pink-50/50 dark:bg-pink-950/20 rounded-2xl border border-pink-100 dark:border-pink-900/30">
						<p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Acumulado</p>
						<h3 className="text-lg font-black text-pink-600 dark:text-pink-400 mt-0.5">
							{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalGeral)}
						</h3>
					</div>
					<div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
						<p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">RDB / Aportes Líquidos</p>
						<h3 className="text-lg font-black text-slate-700 dark:text-slate-200 mt-0.5">
							{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalInvestidoFinal)}
						</h3>
					</div>
					<div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
						<p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Objetivo Final</p>
						<h3 className="text-lg font-black text-slate-500 dark:text-slate-400 mt-0.5">
							{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(meta.valor || 0)}
						</h3>
					</div>
				</div>

				{/* Modal Body: Lista de Lançamentos */}
				<div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50/50 dark:bg-slate-950/50 space-y-6">
					<div>
						<div className="flex items-center justify-between mb-3">
							<h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
								<FileText size={15} /> Histórico de Movimentações ({lancamentos.length})
							</h4>
							<span className="text-[11px] text-slate-400">Clique na lixeira para excluir lançamentos indevidos</span>
						</div>

						{loading ? (
							<div className="flex justify-center items-center py-12">
								<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600"></div>
							</div>
						) : lancamentos.length === 0 ? (
							<div className="text-center py-10 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 border-dashed p-6">
								<AlertCircle size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
								<p className="text-slate-500 dark:text-slate-400 font-bold text-sm">Nenhum lançamento registrado nesta meta.</p>
								<p className="text-xs text-slate-400 mt-1">Os depósitos e aplicações em RDB aparecem aqui quando você importa extratos ou adiciona manualmente.</p>
							</div>
						) : (
							<div className="space-y-2">
								{lancamentos.map((item) => {
									const dataFormatada = item.data 
										? item.data.split('T')[0].split('-').reverse().join('/') 
										: '—';

									const isResgate = item.tipo === "RESGATE";
									const isAporte = item.tipo === "APORTE";

									return (
										<div 
											key={item.id} 
											className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center justify-between gap-4 hover:border-pink-200 dark:hover:border-pink-900/50 transition-colors"
										>
											<div className="flex items-center gap-3 min-w-0">
												<div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
													isResgate 
														? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/30'
														: isAporte
															? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30'
															: 'bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 border-pink-100 dark:border-pink-900/30'
												}`}>
													{isResgate ? <TrendingDown size={18} /> : isAporte ? <TrendingUp size={18} /> : <PiggyBank size={18} />}
												</div>
												<div className="min-w-0">
													<div className="flex items-center gap-2 flex-wrap">
														<span className="font-bold text-sm text-slate-800 dark:text-slate-100">
															{item.descricao}
														</span>
														<span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${
															isResgate 
																? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border-amber-200/40 dark:border-amber-800/40'
																: isAporte
																	? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200/40 dark:border-emerald-800/40'
																	: 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/50 border-pink-200/40 dark:border-pink-800/40'
														}`}>
															{isResgate ? 'Resgate RDB' : isAporte ? 'Aplicação RDB' : 'Depósito Manual'}
														</span>
													</div>
													<div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
														<span className="flex items-center gap-1">
															<Calendar size={12} /> {dataFormatada}
														</span>
													</div>
												</div>
											</div>

											<div className="flex items-center gap-3 shrink-0">
												<span className={`font-black text-base ${
													isResgate ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
												}`}>
													{isResgate ? '- ' : '+ '}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.valor))}
												</span>
												<button
													type="button"
													disabled={deletingId === item.id}
													onClick={() => handleDeleteLancamento(item)}
													className="p-2 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer disabled:opacity-50"
													title="Excluir este lançamento"
												>
													<Trash2 size={16} />
												</button>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>

					{/* Se houver ativos de investimentos vinculados */}
					{investimentosVinculados.length > 0 && (
						<div>
							<h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
								<TrendingUp size={15} /> Ativos de Investimentos Vinculados ({investimentosVinculados.length})
							</h4>
							<div className="space-y-2">
								{investimentosVinculados.map((inv) => (
									<div 
										key={inv.id} 
										className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 flex items-center justify-between gap-4"
									>
										<div className="flex items-center gap-3 min-w-0">
											<div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
												<TrendingUp size={18} />
											</div>
											<div>
												<p className="font-bold text-sm text-slate-800 dark:text-slate-100">{inv.titulo}</p>
												<p className="text-xs text-slate-400">{inv.tipo} • {inv.corretora?.replace(/\[Meta:\s*[^\]]+\]/, '').trim() || 'Nubank'}</p>
											</div>
										</div>
										<span className="font-black text-sm text-indigo-600 dark:text-indigo-400">
											{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(inv.valor_atual))}
										</span>
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				{/* Modal Footer */}
				<div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end">
					<button 
						onClick={onClose} 
						className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
					>
						Fechar Extrato
					</button>
				</div>
			</motion.div>
		</div>
	);
}
