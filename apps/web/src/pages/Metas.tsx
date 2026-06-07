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
	ChevronRight
} from "lucide-react";
import { Toaster, toast } from "react-hot-toast";
import AddMetaWeb from "../components/AddMetaWeb";
import AddDepositoWeb from "../components/AddDepositoWeb";

export default function MetasWeb() {
	const [metas, setMetas] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [isAddMetaOpen, setIsAddMetaOpen] = useState(false);
	const [depositoMeta, setDepositoMeta] = useState<{id: string, titulo: string} | null>(null);

	const loadMetas = useCallback(async () => {
		setLoading(true);
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
			// Busca metas e seus depósitos relacionados
			const { data: metasData, error } = await supabase
				.from("metas")
				.select(`
					*,
					metas_depositos (
						valor
					)
				`)
				.eq("usuario_id", user.id)
				.order("prazo", { ascending: true });
			
			if (error) toast.error("Erro ao carregar metas");
			else {
				const metasComTotal = metasData?.map(m => ({
					...m,
					totalDepositado: m.metas_depositos.reduce((acc: number, d: any) => acc + Number(d.valor), 0)
				})) || [];
				setMetas(metasComTotal);
			}
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		loadMetas();
		
		// Realtime
		let channel: any;
		async function setupRealtime() {
			const { data: { user } } = await supabase.auth.getUser();
			if (user) {
				channel = financeService.subscribeToChanges("metas", user.id, loadMetas);
			}
		}
		setupRealtime();
		return () => { if (channel) supabase.removeChannel(channel); };
	}, [loadMetas]);

	return (
		<div className="p-8 space-y-10 bg-[#FDFBFB] min-h-screen">
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
				<div className="space-y-1">
					<div className="flex items-center gap-3">
						<div className="bg-pink-100 p-2 rounded-xl text-pink-600">
							<Target size={24} />
						</div>
						<h1 className="text-3xl font-black text-[#3D3030]">Metas de Economia</h1>
					</div>
					<p className="text-gray-400 font-medium text-sm ml-12">Transforme seus sonhos em objetivos alcançáveis</p>
				</div>

				<button 
					onClick={() => setIsAddMetaOpen(true)}
					className="px-8 py-4 bg-pink-500 text-white rounded-[25px] font-black flex items-center gap-2 hover:bg-pink-600 transition-all shadow-xl shadow-pink-100">
					<Plus size={20} /> NOVA META
				</button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
				{metas.length > 0 ? metas.map((meta) => {
					const progresso = (meta.totalDepositado / meta.valor) * 100;
					return (
						<div key={meta.id} className="bg-white p-8 rounded-[50px] shadow-sm border border-gray-100 space-y-6 hover:shadow-md transition-shadow relative overflow-hidden group">
							<div className="flex justify-between items-start">
								<div className="bg-gray-50 p-4 rounded-3xl group-hover:bg-pink-50 transition-colors">
									<PiggyBank size={24} className="text-pink-500" />
								</div>
								<div className="text-right">
									<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Até {new Date(meta.prazo).toLocaleDateString('pt-BR')}</p>
									<h3 className="text-xl font-black text-[#3D3030] mt-1">{meta.titulo}</h3>
								</div>
							</div>

							<div className="space-y-2">
								<div className="flex justify-between items-end">
									<p className="text-[10px] font-black text-gray-400 uppercase">Progresso</p>
									<p className="text-2xl font-black text-pink-500">{progresso.toFixed(0)}%</p>
								</div>
								<div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
									<div 
										className="h-full bg-pink-500 rounded-full transition-all duration-1000" 
										style={{ width: `${Math.min(progresso, 100)}%` }}
									/>
								</div>
							</div>

							<div className="flex justify-between items-center pt-4 border-t border-dashed border-gray-100">
								<div>
									<p className="text-[9px] font-bold text-gray-400 uppercase">Depositado</p>
									<p className="font-black text-[#3D3030]">R$ {meta.totalDepositado.toLocaleString()}</p>
								</div>
								<div className="text-right">
									<p className="text-[9px] font-bold text-gray-400 uppercase">Objetivo</p>
									<p className="font-black text-gray-300">R$ {Number(meta.valor).toLocaleString()}</p>
								</div>
							</div>

							<button 
								onClick={() => setDepositoMeta({ id: meta.id, titulo: meta.titulo })}
								className="w-full py-4 bg-gray-50 rounded-2xl font-black text-[10px] text-gray-400 uppercase hover:bg-pink-500 hover:text-white transition-all flex items-center justify-center gap-2"
							>
								Adicionar Depósito <ArrowUpRight size={14} />
							</button>
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
		</div>
	);
}
