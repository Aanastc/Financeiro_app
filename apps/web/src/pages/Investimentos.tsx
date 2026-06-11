import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import {
	Plus,
	TrendingUp,
	ArrowUpRight,
	ArrowDownRight,
	Briefcase,
	PieChart as ChartIcon,
	Building2,
	Coins,
	Globe,
	Trash2
} from "lucide-react";
import {
	PieChart,
	Pie,
	Cell,
	ResponsiveContainer,
	Tooltip,
	Legend
} from "recharts";
import { Toaster, toast } from "react-hot-toast";
import AddInvestimentoWeb from "../components/AddInvestimentoWeb";

export default function InvestimentosWeb() {
	const [investimentos, setInvestimentos] = useState<any[]>([]);
	const [metas, setMetas] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [isAddInvestimentoOpen, setIsAddInvestimentoOpen] = useState(false);

	const loadInvestimentos = useCallback(async () => {
		setLoading(true);
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
			try {
				const [data, { data: metasData }] = await Promise.all([
					financeService.getInvestimentos(user.id),
					supabase.from('metas').select('*').eq('usuario_id', user.id)
				]);
				setInvestimentos(data || []);
				setMetas(metasData || []);
			} catch (e) {
				toast.error("Erro ao carregar investimentos");
			}
		}
		setLoading(false);
	}, []);

	const parseMetaId = (corretora: string) => {
		const match = corretora?.match(/\[Meta:\s*([^\]]+)\]/);
		return match ? match[1] : null;
	};

	const cleanCorretora = (corretora: string) => {
		if (!corretora) return "—";
		return corretora.replace(/\[Meta:\s*[^\]]+\]/, '').trim() || "—";
	};

	useEffect(() => {
		loadInvestimentos();
		
		// Realtime
		let channel: any;
		async function setupRealtime() {
			const { data: { user } } = await supabase.auth.getUser();
			if (user) {
				channel = financeService.subscribeToChanges("investimentos", user.id, loadInvestimentos);
			}
		}
		setupRealtime();
		return () => { if (channel) supabase.removeChannel(channel); };
	}, [loadInvestimentos]);

	const totals = useMemo(() => {
		const investido = investimentos.reduce((acc, i) => acc + Number(i.valor_investido), 0);
		const atual = investimentos.reduce((acc, i) => acc + Number(i.valor_atual), 0);
		const lucro = atual - investido;
		const perc = investido > 0 ? (lucro / investido) * 100 : 0;
		return { investido, atual, lucro, perc };
	}, [investimentos]);

	const chartData = useMemo(() => {
		const types = investimentos.reduce((acc: any, i) => {
			acc[i.tipo] = (acc[i.tipo] || 0) + Number(i.valor_atual);
			return acc;
		}, {});
		return Object.keys(types).map(name => ({ name, value: types[name] }));
	}, [investimentos]);

	const COLORS = ["#6366F1", "#8B5CF6", "#EC4899", "#10B981", "#F59E0B"];

	return (
		<div className="space-y-6 sm:space-y-8 pb-20">
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
				<div className="space-y-1">
					<div className="flex items-center gap-3">
						<div className="bg-indigo-100 dark:bg-indigo-950/40 p-2 rounded-xl text-indigo-600 dark:text-indigo-400">
							<Briefcase size={24} />
						</div>
						<h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">Minha Carteira</h1>
					</div>
					<p className="text-slate-400 dark:text-slate-500 font-medium text-sm ml-12">Acompanhe o crescimento do seu patrimônio</p>
				</div>
 
				<button 
					onClick={() => setIsAddInvestimentoOpen(true)}
					className="px-8 py-4 bg-green-500 text-white rounded-[25px] font-black flex items-center justify-center gap-2 hover:bg-green-600 transition-all shadow-xl shadow-green-100 dark:shadow-none w-full lg:w-auto cursor-pointer">
					<Plus size={20} /> NOVO ATIVO
				</button>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl sm:rounded-[35px] border border-gray-100 dark:border-slate-800 shadow-sm transition-colors">
					<p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Total Investido</p>
					<h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">R$ {totals.investido.toLocaleString()}</h2>
				</div>
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl sm:rounded-[35px] border border-gray-100 dark:border-slate-800 shadow-sm transition-colors">
					<p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Patrimônio Atual</p>
					<h2 className="text-2xl font-black text-indigo-600 dark:text-indigo-400">R$ {totals.atual.toLocaleString()}</h2>
				</div>
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl sm:rounded-[35px] border border-gray-100 dark:border-slate-800 shadow-sm transition-colors">
					<p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Rentabilidade Total</p>
					<div className="flex flex-wrap items-center gap-2">
						<h2 className={`text-2xl font-black ${totals.lucro >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
							R$ {Math.abs(totals.lucro).toLocaleString()}
						</h2>
						<span className={`text-xs font-bold px-2 py-1 rounded-lg ${totals.lucro >= 0 ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-955 text-rose-600 dark:text-rose-400'}`}>
							{totals.perc >= 0 ? '+' : ''}{totals.perc.toFixed(2)}%
						</span>
					</div>
				</div>
				<div className="bg-indigo-600 p-5 sm:p-6 rounded-2xl sm:rounded-[35px] shadow-lg text-white">
					<p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-2">Status</p>
					<div className="flex items-center gap-2">
						<TrendingUp size={24} />
						<h2 className="text-xl font-black">Carteira em Alta</h2>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
				<div className="lg:col-span-4 bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
					<h3 className="font-black text-slate-800 dark:text-slate-100 mb-8 flex items-center gap-2 uppercase text-sm tracking-tight">
						<ChartIcon className="text-indigo-500" size={18} /> Alocação de Ativos
					</h3>
					<div className="h-[300px] w-full">
						{chartData.length > 0 ? (
							<ResponsiveContainer width="100%" height="100%">
								<PieChart>
									<Pie
										data={chartData}
										innerRadius={60}
										outerRadius={80}
										paddingAngle={5}
										dataKey="value"
										stroke="none"
									>
										{chartData.map((_, index) => (
											<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
										))}
									</Pie>
									<Tooltip />
									<Legend />
								</PieChart>
							</ResponsiveContainer>
						) : (
							<div className="h-full flex items-center justify-center text-slate-300 italic text-sm">Sem dados</div>
						)}
					</div>
				</div>

				<div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[40px] shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden transition-colors">
					<div className="p-5 sm:p-8 border-b border-slate-50 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
						<h3 className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 uppercase text-sm tracking-tight">
							<Building2 className="text-indigo-500" size={18} /> Detalhamento de Ativos
						</h3>
					</div>
					<div className="overflow-x-auto">
						<table className="w-full text-left">
							<thead>
								<tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase">
									<th className="p-8">Ativo</th>
									<th className="p-8 text-center">Tipo</th>
									<th className="p-8 text-center">Corretora</th>
									<th className="p-8 text-right">Investido</th>
									<th className="p-8 text-right">Saldo Atual</th>
									<th className="p-8 text-center">Ações</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-55 dark:divide-slate-800/40">
								{investimentos.length > 0 ? investimentos.map((inv) => (
									<tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
										<td className="p-8">
											<div className="flex items-center gap-3">
												<div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-indigo-500 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/40 transition-colors">
													<Coins size={18} />
												</div>
												<div className="flex flex-col text-left">
													<span className="font-bold text-slate-800 dark:text-slate-200">{inv.titulo}</span>
													{(() => {
														const metaId = parseMetaId(inv.corretora);
														if (metaId) {
															const matchedMeta = metas.find(m => m.id === metaId);
															if (matchedMeta) {
																return (
																	<span className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 flex items-center gap-1 mt-0.5">
																		🎯 Objetivo: {matchedMeta.titulo}
																	</span>
																);
															}
														}
														return null;
													})()}
												</div>
											</div>
										</td>
										<td className="p-8 text-center">
											<span className="bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg text-[9px] font-black uppercase text-slate-500 dark:text-slate-400">
												{inv.tipo}
											</span>
										</td>
										<td className="p-8 text-center text-sm font-medium text-slate-500 dark:text-slate-400">{cleanCorretora(inv.corretora)}</td>
										<td className="p-8 text-right font-bold text-slate-400 dark:text-slate-500 text-sm">
											R$ {Number(inv.valor_investido).toLocaleString()}
										</td>
										<td className="p-8 text-right font-black text-indigo-600 dark:text-indigo-400">
											R$ {Number(inv.valor_atual).toLocaleString()}
										</td>
										<td className="p-8 text-center">
											<button className="text-slate-300 hover:text-rose-500 transition-colors">
												<Trash2 size={18} />
											</button>
										</td>
									</tr>
								)) : (
									<tr>
										<td colSpan={6} className="p-20 text-center opacity-20 italic">Nenhum ativo cadastrado</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			</div>

			{isAddInvestimentoOpen && (
				<AddInvestimentoWeb 
					onClose={() => setIsAddInvestimentoOpen(false)} 
					onSuccess={loadInvestimentos} 
				/>
			)}
		</div>
	);
}
