import { useState, useEffect } from "react";
import { authService } from "../../../../packages/services/auth.service";
import { financeService } from "../../../../packages/services/finance.service";
import { motion } from "framer-motion";
import { CreditCard, Calendar, CheckCircle2, CircleDashed, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

export default function Faturas() {
	const { cartao_id } = useParams();
	const navigate = useNavigate();
	
	const [fatura, setFatura] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	
	// Default to current month
	const [mesSelecionado, setMesSelecionado] = useState(() => {
		const hoje = new Date();
		return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
	});

	const loadFatura = async (mes: string) => {
		setLoading(true);
		try {
			const user = await authService.getCurrentUser();
			if (!user || !cartao_id) return;
			const data = await financeService.getFaturaMensal(user.id, cartao_id, mes);
			setFatura(data);
		} catch (error) {
			console.error(error);
			toast.error("Erro ao carregar fatura");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (cartao_id) {
			loadFatura(mesSelecionado);
		}
	}, [cartao_id, mesSelecionado]);

	const handleMudarMes = (direcao: number) => {
		const [ano, mes] = mesSelecionado.split("-").map(Number);
		const data = new Date(ano, mes - 1 + direcao, 1);
		const novoMes = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
		setMesSelecionado(novoMes);
	};

	const nomeMes = (mesStr: string) => {
		const [ano, mes] = mesStr.split("-").map(Number);
		const data = new Date(ano, mes - 1, 1);
		const nome = data.toLocaleString("pt-BR", { month: "long" });
		return `${nome.charAt(0).toUpperCase() + nome.slice(1)} ${ano}`;
	};

	const containerVariants = {
		hidden: { opacity: 0 },
		visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
	};

	const itemVariants = {
		hidden: { y: 20, opacity: 0 },
		visible: { y: 0, opacity: 1 }
	};

	if (loading && !fatura) {
		return (
			<div className="flex justify-center items-center h-full">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
			</div>
		);
	}

	return (
		<motion.div 
			className="max-w-5xl mx-auto space-y-8 pb-20 p-6 sm:p-10"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			{/* HEADER */}
			<motion.div variants={itemVariants} className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
				<div>
					<button onClick={() => navigate("/cartoes")} className="text-indigo-600 font-bold flex items-center gap-1 mb-2 hover:underline">
						<ChevronLeft size={16} /> Voltar para Cartões
					</button>
					<h2 className="text-4xl font-black text-slate-800 tracking-tight flex items-center gap-3">
						<FileText className="text-indigo-600" size={40} />
						Fatura do Cartão
					</h2>
					<p className="text-slate-500 font-medium text-lg mt-1 flex items-center gap-2">
						<span 
							className="w-4 h-4 rounded-full inline-block" 
							style={{ backgroundColor: fatura?.cartao?.cor_hex || "#ccc" }} 
						/>
						{fatura?.cartao?.nome || "Carregando..."}
						
						{fatura && (
							<span className={`ml-4 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${fatura.totalFatura === 0 ? 'bg-slate-100 text-slate-500' : fatura.pendente <= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
								{fatura.totalFatura === 0 ? 'Sem Gastos' : fatura.pendente <= 0 ? 'Fatura Paga' : 'Fatura Aberta'}
							</span>
						)}
					</p>
				</div>

				<div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl border border-slate-100 shadow-sm">
					<button onClick={() => handleMudarMes(-1)} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors">
						<ChevronLeft size={24} />
					</button>
					<div className="flex items-center gap-2 font-bold text-lg text-slate-800 min-w-[150px] justify-center">
						<Calendar size={20} className="text-indigo-500" />
						{nomeMes(mesSelecionado)}
					</div>
					<button onClick={() => handleMudarMes(1)} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors">
						<ChevronRight size={24} />
					</button>
				</div>
			</motion.div>

			{/* SUMMARY CARDS */}
			{fatura && (
				<motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
					<div className="bg-slate-800 p-6 rounded-3xl shadow-md text-white">
						<p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1">Total da Fatura</p>
						<p className="text-3xl font-black mb-4">R$ {fatura.totalFatura.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
						<div className="text-xs font-medium text-slate-300 flex items-center gap-2">
							<CreditCard size={14} /> Vencimento: Dia {fatura.cartao.vencimento_dia}
						</div>
					</div>
					<div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
						<p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1 flex items-center gap-1">
							<CheckCircle2 size={14} className="text-emerald-500" /> Total Pago
						</p>
						<p className="text-3xl font-black text-emerald-500">R$ {fatura.totalPago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
					</div>
					<div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
						<p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1 flex items-center gap-1">
							<CircleDashed size={14} className="text-rose-500" /> Pendente
						</p>
						<p className="text-3xl font-black text-rose-500">R$ {fatura.pendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
					</div>
				</motion.div>
			)}

			{/* TRANSACTIONS LIST */}
			{fatura && (
				<motion.div variants={itemVariants} className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
					<div className="p-8 border-b border-slate-100">
						<h3 className="font-black text-slate-800 text-xl tracking-tight">Lançamentos da Fatura</h3>
					</div>
					<div className="p-4">
						{fatura.itens.length === 0 ? (
							<div className="text-center py-10 text-slate-400 italic">
								Nenhum lançamento encontrado para esta fatura.
							</div>
						) : (
							<div className="space-y-2">
								{fatura.itens.map((item: any) => (
									<div key={item.id} className="flex justify-between items-center p-4 hover:bg-slate-50 rounded-2xl transition-colors">
										<div>
											<p className="font-bold text-slate-800 text-lg">{item.descricao}</p>
											<div className="flex gap-3 text-xs font-medium text-slate-400 mt-1">
												<span>{new Date(item.data).toLocaleDateString("pt-BR")}</span>
												{item.total_parcelas > 1 && (
													<span className="text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
														Parcela {item.parcela_atual}/{item.total_parcelas}
													</span>
												)}
												{item.terceiro && (
													<span className="text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full">
														Compra para Terceiro
													</span>
												)}
											</div>
										</div>
										<p className="font-black text-slate-700 text-lg">
											R$ {Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
										</p>
									</div>
								))}
							</div>
						)}
					</div>
				</motion.div>
			)}
		</motion.div>
	);
}
