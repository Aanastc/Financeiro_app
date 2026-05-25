import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import {
	Plus,
	AlertTriangle,
	Clock,
	TrendingUp,
} from "lucide-react";
import { Toaster, toast } from "react-hot-toast";

export default function DividasWeb() {
	const [dividas, setDividas] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	
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
		<div className="p-8 space-y-8 bg-[#FDFBFB] min-h-screen">
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
				<div className="space-y-1">
					<div className="flex items-center gap-3">
						<div className="bg-amber-100 p-2 rounded-xl text-amber-600">
							<AlertTriangle size={24} />
						</div>
						<h1 className="text-3xl font-black text-[#3D3030]">Dívidas e Empréstimos</h1>
					</div>
					<p className="text-gray-400 font-medium text-sm ml-12">Gestão de compromissos e parcelamentos</p>
				</div>

				<button 
					onClick={() => toast.success("Módulo em desenvolvimento!")}
					className="px-8 py-4 bg-[#3D3030] text-white rounded-[25px] font-black flex items-center gap-2 hover:bg-black transition-all shadow-xl">
					<Plus size={20} /> NOVA DÍVIDA
				</button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div className="bg-white p-8 rounded-[35px] border border-gray-100 shadow-sm">
					<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Total em Dívidas</p>
					<h2 className="text-3xl font-black text-[#3D3030]">R$ {stats.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
				</div>
				<div className="bg-white p-8 rounded-[35px] border border-gray-100 shadow-sm">
					<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Parcelas Pendentes</p>
					<h2 className="text-3xl font-black text-amber-500">{stats.pendentes} itens</h2>
				</div>
				<div className="bg-amber-500 p-8 rounded-[35px] shadow-lg text-white">
					<p className="text-[10px] font-black text-white/70 uppercase tracking-widest mb-2">Atenção</p>
					<div className="flex items-center gap-2">
						<Clock size={24} />
						<h2 className="text-xl font-black">Próximo vencimento em breve</h2>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				<div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
					<div className="p-8 border-b border-gray-50">
						<h3 className="font-black text-[#3D3030] flex items-center gap-2 uppercase text-sm tracking-tight">
							<Clock className="text-amber-500" size={18} /> Cronograma de Pagamentos
						</h3>
					</div>
					<div className="overflow-x-auto">
						<table className="w-full text-left">
							<thead>
								<tr className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase">
									<th className="p-8">Descrição</th>
									<th className="p-8 text-center">Parcelas</th>
									<th className="p-8 text-center">Juros</th>
									<th className="p-8 text-right">Total</th>
									<th className="p-8 text-center">Status</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-50">
								{dividas.length > 0 ? (
									dividas.map((d) => (
										<tr key={d.id} className="hover:bg-gray-50 transition-colors group">
											<td className="p-8 font-bold text-[#3D3030]">{d.descricao}</td>
											<td className="p-8 text-center">
												<span className="bg-gray-100 px-3 py-1 rounded-full text-[10px] font-black">
													{d.parcela_atual}/{d.parcelas}
												</span>
											</td>
											<td className="p-8 text-center font-black text-amber-600">{d.Juros}%</td>
											<td className="p-8 text-right font-black text-[#3D3030]">
												R$ {Number(d.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
											</td>
											<td className="p-8 text-center">
												<span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${
													d.status === "pago" ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"
												}`}>
													{d.status}
												</span>
											</td>
										</tr>
									))
								) : (
									<tr>
										<td colSpan={5} className="p-20 text-center opacity-20">
											<p className="font-black uppercase text-xs">Nenhuma dívida registrada</p>
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>

				<div className="bg-[#3D3030] p-10 rounded-[50px] shadow-2xl text-white space-y-8 flex flex-col">
					<div>
						<h3 className="text-2xl font-black mb-2 flex items-center gap-2">
							<TrendingUp className="text-amber-500" /> Simulador de Juros
						</h3>
						<p className="text-gray-400 font-bold text-sm uppercase tracking-widest">Custo real do seu empréstimo</p>
					</div>

					<div className="space-y-6 flex-1">
						<div className="space-y-2">
							<label className="text-[10px] font-black uppercase text-gray-400 ml-2">Valor (R$)</label>
							<input
								type="number"
								className="w-full p-5 bg-white/5 rounded-3xl font-black text-white text-2xl outline-none"
								value={simulacao.valor}
								onChange={(e) => setSimulacao({ ...simulacao, valor: Number(e.target.value) })}
							/>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<label className="text-[10px] font-black uppercase text-gray-400 ml-2">Juros (% a.m)</label>
								<input
									type="number"
									className="w-full p-5 bg-white/5 rounded-3xl font-black text-amber-500 text-xl outline-none"
									value={simulacao.juros}
									onChange={(e) => setSimulacao({ ...simulacao, juros: Number(e.target.value) })}
								/>
							</div>
							<div className="space-y-2">
								<label className="text-[10px] font-black uppercase text-gray-400 ml-2">Parcelas</label>
								<input
									type="number"
									className="w-full p-5 bg-white/5 rounded-3xl font-black text-white text-xl outline-none"
									value={simulacao.parcelas}
									onChange={(e) => setSimulacao({ ...simulacao, parcelas: Number(e.target.value) })}
								/>
							</div>
						</div>

						<div className="p-8 bg-white/5 rounded-[40px] border border-white/10 space-y-4">
							<div className="flex justify-between items-center">
								<span className="text-sm font-bold text-gray-400 uppercase">Total Final:</span>
								<span className="text-2xl font-black text-amber-500">
									R$ {resultadoSimulacao.totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
								</span>
							</div>
							<div className="flex justify-between items-center text-xs opacity-60">
								<span>Juros Totais:</span>
								<span>R$ {resultadoSimulacao.totalJuros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({resultadoSimulacao.percJuros.toFixed(1)}%)</span>
							</div>
							<div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
								<div 
									className="h-full bg-amber-500 transition-all duration-500" 
									style={{ width: `${Math.min(resultadoSimulacao.percJuros * 2, 100)}%` }}
								/>
							</div>
						</div>
					</div>

					<button className="w-full py-6 bg-amber-500 text-white rounded-[30px] font-black text-lg hover:bg-amber-600 transition-all">
						ESTE É O CUSTO REAL
					</button>
				</div>
			</div>
		</div>
	);
}
