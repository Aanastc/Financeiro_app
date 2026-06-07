import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import {
	Plus,
	AlertTriangle,
	Clock,
	TrendingUp,
	Trash2,
	HandCoins
} from "lucide-react";
import { Toaster, toast } from "react-hot-toast";
import AddDividaWeb from "../components/AddDividaWeb";

export default function DividasWeb() {
	const [dividas, setDividas] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [isAddDividaOpen, setIsAddDividaOpen] = useState(false);
	
	const [simulacao, setSimulacao] = useState({
		valor: 1000,
		juros: 2.5,
		parcelas: 12,
	});

	const loadDividas = useCallback(async () => {
		setLoading(true);
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
			const { data, error } = await supabase
				.from("dividas")
				.select("*")
				.eq("usuario_id", user.id)
				.order("vencimento_parcela", { ascending: true });
			
			if (error) toast.error("Erro ao carregar dívidas");
			else setDividas(data || []);
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

	const handleDelete = async (id: string) => {
		if (window.confirm("Tem certeza que deseja excluir esta dívida?")) {
			try {
				await financeService.deleteRecord("dividas", id);
				toast.success("Dívida excluída!");
				loadDividas();
			} catch (error: any) {
				toast.error("Erro: " + error.message);
			}
		}
	};

	const stats = useMemo(() => {
		const total = dividas.reduce((acc, d) => acc + Number(d.valor_total), 0);
		const pendentes = dividas.filter(d => d.status === 'pendente').length;
		return { total, pendentes };
	}, [dividas]);

	const resultadoSimulacao = useMemo(() => {
		const totalJuros = simulacao.valor * (simulacao.juros / 100) * simulacao.parcelas;
		const totalPago = simulacao.valor + totalJuros;
		const percJuros = totalPago > 0 ? (totalJuros / totalPago) * 100 : 0;
		return { totalPago, totalJuros, percJuros };
	}, [simulacao]);

	return (
		<div className="p-4 md:p-8 space-y-8 bg-[#FDFCFB] min-h-screen">
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 rounded-[40px] shadow-sm border border-purple-50 relative overflow-hidden">
				<div className="absolute top-0 right-0 w-64 h-64 bg-purple-100 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/4 pointer-events-none" />
				
				<div className="space-y-1 relative z-10">
					<div className="flex items-center gap-3">
						<div className="bg-purple-100 p-2 rounded-xl text-purple-600">
							<HandCoins size={24} />
						</div>
						<h1 className="text-3xl font-black text-slate-800">Dívidas e Empréstimos</h1>
					</div>
					<p className="text-gray-400 font-medium text-sm ml-12">Gestão de compromissos, empréstimos e parcelamentos pesados</p>
				</div>

				<button 
					onClick={() => setIsAddDividaOpen(true)}
					className="px-8 py-4 bg-purple-600 text-white rounded-[25px] font-black flex items-center gap-2 hover:bg-purple-700 transition-all shadow-xl shadow-purple-200 relative z-10">
					<Plus size={20} /> NOVA DÍVIDA
				</button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div className="bg-white p-8 rounded-[35px] border border-gray-100 shadow-sm relative overflow-hidden group hover:border-purple-200 transition-colors">
					<div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform" />
					<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Total em Dívidas</p>
					<h2 className="text-3xl font-black text-rose-500">R$ {stats.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
				</div>
				<div className="bg-white p-8 rounded-[35px] border border-gray-100 shadow-sm relative overflow-hidden group hover:border-purple-200 transition-colors">
					<div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform" />
					<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Parcelas Pendentes</p>
					<h2 className="text-3xl font-black text-amber-500">{stats.pendentes} itens ativos</h2>
				</div>
				<div className="bg-gradient-to-br from-purple-600 to-indigo-600 p-8 rounded-[35px] shadow-lg shadow-purple-200 text-white relative overflow-hidden">
					<div className="absolute bottom-0 right-0 w-40 h-40 bg-white/10 rounded-tl-full blur-xl" />
					<p className="text-[10px] font-black text-purple-200 uppercase tracking-widest mb-2">Previsão Próxima</p>
					<div className="flex items-center gap-3">
						<Clock size={28} className="text-purple-200" />
						<h2 className="text-xl font-black leading-tight">Organize-se para os<br/>próximos vencimentos</h2>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
				<div className="lg:col-span-8 bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden flex flex-col">
					<div className="p-8 border-b border-gray-50 flex justify-between items-center">
						<h3 className="font-black text-slate-800 flex items-center gap-2 uppercase text-sm tracking-tight">
							<AlertTriangle className="text-purple-500" size={18} /> Cronograma de Pagamentos
						</h3>
					</div>
					<div className="overflow-x-auto flex-1">
						<table className="w-full text-left">
							<thead>
								<tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
									<th className="p-6">Descrição</th>
									<th className="p-6 text-center">Parcelas</th>
									<th className="p-6 text-center">Juros</th>
									<th className="p-6 text-right">Total</th>
									<th className="p-6 text-center">Status</th>
									<th className="p-6 text-center">Ações</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-50">
								{dividas.length > 0 ? (
									dividas.map((d) => (
										<tr key={d.id} className="hover:bg-slate-50/50 transition-colors group">
											<td className="p-6 font-black text-slate-700">{d.descricao}</td>
											<td className="p-6 text-center">
												<span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-lg text-[10px] font-black">
													{d.parcela_atual}/{d.parcelas}
												</span>
											</td>
											<td className="p-6 text-center font-bold text-rose-500 text-xs">{d.juros}%</td>
											<td className="p-6 text-right font-black text-slate-800">
												R$ {Number(d.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
											</td>
											<td className="p-6 text-center">
												<span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase ${
													d.status === "pago" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
												}`}>
													{d.status}
												</span>
											</td>
											<td className="p-6 text-center">
												<button 
													onClick={() => handleDelete(d.id)}
													className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
												>
													<Trash2 size={18} />
												</button>
											</td>
										</tr>
									))
								) : (
									<tr>
										<td colSpan={6} className="p-20 text-center opacity-40">
											<div className="flex flex-col items-center justify-center gap-4">
												<HandCoins size={48} className="text-slate-300" />
												<p className="font-black uppercase text-xs tracking-widest text-slate-400">Nenhuma dívida registrada no sistema</p>
											</div>
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>

				<div className="lg:col-span-4 bg-slate-900 p-8 rounded-[40px] shadow-2xl text-white flex flex-col relative overflow-hidden">
					<div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-indigo-500/20 to-purple-600/20 pointer-events-none" />
					
					<div className="relative z-10 mb-8">
						<h3 className="text-2xl font-black mb-2 flex items-center gap-2 text-white">
							<TrendingUp className="text-purple-400" /> Simulador
						</h3>
						<p className="text-indigo-200 font-bold text-[10px] uppercase tracking-widest">Descubra o custo real do seu empréstimo</p>
					</div>

					<div className="space-y-6 flex-1 relative z-10">
						<div className="space-y-2">
							<label className="text-[10px] font-black uppercase text-indigo-300 ml-2 tracking-widest">Valor do Empréstimo (R$)</label>
							<input
								type="number"
								className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl font-black text-white text-xl outline-none focus:border-purple-400 focus:bg-white/10 transition-all"
								value={simulacao.valor}
								onChange={(e) => setSimulacao({ ...simulacao, valor: Number(e.target.value) })}
							/>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<label className="text-[10px] font-black uppercase text-indigo-300 ml-2 tracking-widest">Juros (% a.m)</label>
								<input
									type="number"
									step="0.1"
									className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl font-black text-purple-400 text-lg outline-none focus:border-purple-400 focus:bg-white/10 transition-all"
									value={simulacao.juros}
									onChange={(e) => setSimulacao({ ...simulacao, juros: Number(e.target.value) })}
								/>
							</div>
							<div className="space-y-2">
								<label className="text-[10px] font-black uppercase text-indigo-300 ml-2 tracking-widest">Parcelas (Meses)</label>
								<input
									type="number"
									className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl font-black text-white text-lg outline-none focus:border-purple-400 focus:bg-white/10 transition-all"
									value={simulacao.parcelas}
									onChange={(e) => setSimulacao({ ...simulacao, parcelas: Number(e.target.value) })}
								/>
							</div>
						</div>

						<div className="mt-8 p-6 bg-white/5 rounded-[30px] border border-white/10 backdrop-blur-md space-y-4">
							<div className="flex justify-between items-center">
								<span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">Você vai pagar:</span>
								<span className="text-2xl font-black text-white">
									R$ {resultadoSimulacao.totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
								</span>
							</div>
							<div className="flex justify-between items-center text-xs opacity-80">
								<span className="font-medium text-indigo-200">Apenas de Juros:</span>
								<span className="font-black text-rose-400">R$ {resultadoSimulacao.totalJuros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({resultadoSimulacao.percJuros.toFixed(1)}%)</span>
							</div>
							<div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
								<div 
									className="h-full bg-gradient-to-r from-purple-500 to-rose-500 transition-all duration-500" 
									style={{ width: `${Math.min(resultadoSimulacao.percJuros * 2, 100)}%` }}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			{isAddDividaOpen && (
				<AddDividaWeb 
					onClose={() => setIsAddDividaOpen(false)} 
					onSuccess={loadDividas} 
				/>
			)}
		</div>
	);
}
