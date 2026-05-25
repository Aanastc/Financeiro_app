import { useState, useEffect, useMemo } from "react";
import {
	Plus,
	CreditCard,
	ChevronLeft,
	ChevronRight,
	CheckCircle2,
	PieChart as ChartIcon,
	Calendar,
	ShoppingCart,
	Wallet,
	ArrowUpRight,
	AlertCircle,
	Clock,
	Filter,
} from "lucide-react";
import {
	PieChart,
	Pie,
	Cell,
	Tooltip,
	ResponsiveContainer,
	Legend,
} from "recharts";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import { AddCartaoWeb } from "../components/AddCartaoWeb";

export default function Cartoes() {
	const [cartoes, setCartoes] = useState<any[]>([]);
	const [todosGastosCredito, setTodosGastosCredito] = useState<any[]>([]);
	const [todosPagamentos, setTodosPagamentos] = useState<any[]>([]);
	const [selectedCartao, setSelectedCartao] = useState<string | null>(null);
	const [viewDate, setViewDate] = useState(new Date());
	const [isModalOpen, setIsModalOpen] = useState(false);

	const loadData = async () => {
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (user) {
			const [lista, gastos, pags] = await Promise.all([
				financeService.getCartoes(user.id),
				financeService.getAllGastosCredito(user.id),
				financeService.getPagamentosFaturas(user.id),
			]);
			setCartoes(lista || []);
			setTodosGastosCredito(gastos || []);
			setTodosPagamentos(pags || []);

			if (lista?.length > 0 && !selectedCartao) {
				setSelectedCartao(lista[0].id);
			}
		}
	};

	useEffect(() => {
		loadData();
	}, []);

	const cartaoAtivo = useMemo(
		() => cartoes.find((c) => c.id === selectedCartao),
		[cartoes, selectedCartao],
	);

	// Período da fatura e filtros
	const { gastosTabela, totalFaturaMes, totalFaturaProxima, ocupadoTotal, disponivelTotal } =
		useMemo(() => {
			if (!cartaoAtivo)
				return {
					gastosTabela: [],
					totalFaturaMes: 0,
					totalFaturaProxima: 0,
					ocupadoTotal: 0,
					disponivelTotal: 0,
				};

			// Cálculo de Limite Global do Cartão (Considerando todos os gastos históricos vs pagamentos)
			const totalGastoHistorico = todosGastosCredito
				.filter((g) => g.cartao_id === selectedCartao)
				.reduce((acc, curr) => acc + Number(curr.valor), 0);
			const totalPagoHistorico = todosPagamentos
				.filter((p) => p.cartao_id === selectedCartao)
				.reduce((acc, curr) => acc + Number(curr.valor), 0);

			const ocupado = totalGastoHistorico - totalPagoHistorico;

			// Cálculo da Fatura do Mês Visualizado
			const fechamentoDia = cartaoAtivo.fechamento_dia;
			const dataFimFatura = new Date(
				viewDate.getFullYear(),
				viewDate.getMonth(),
				fechamentoDia,
				23,
				59,
				59,
			);
			const dataInicioFatura = new Date(dataFimFatura);
			dataInicioFatura.setMonth(dataInicioFatura.getMonth() - 1);
			dataInicioFatura.setDate(dataInicioFatura.getDate() + 1);
			dataInicioFatura.setHours(0, 0, 0, 0);

			const filtrados = todosGastosCredito
				.filter((g) => {
					if (g.cartao_id !== selectedCartao) return false;
					const dataGasto = new Date(g.data + "T12:00:00");
					return dataGasto >= dataInicioFatura && dataGasto <= dataFimFatura;
				})
				.sort(
					(a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
				);

			// Cálculo da Próxima Fatura (Mês Seguinte)
			const dataFimProxima = new Date(dataFimFatura);
			dataFimProxima.setMonth(dataFimProxima.getMonth() + 1);
			const dataInicioProxima = new Date(dataFimProxima);
			dataInicioProxima.setMonth(dataInicioProxima.getMonth() - 1);
			dataInicioProxima.setDate(dataInicioProxima.getDate() + 1);
			dataInicioProxima.setHours(0, 0, 0, 0);

			const filtradosProximo = todosGastosCredito.filter((g) => {
				if (g.cartao_id !== selectedCartao) return false;
				const dataGasto = new Date(g.data + "T12:00:00");
				return dataGasto >= dataInicioProxima && dataGasto <= dataFimProxima;
			});

			return {
				gastosTabela: filtrados,
				totalFaturaMes: filtrados.reduce(
					(acc, curr) => acc + Number(curr.valor),
					0,
				),
				totalFaturaProxima: filtradosProximo.reduce(
					(acc, curr) => acc + Number(curr.valor),
					0,
				),
				ocupadoTotal: ocupado,
				disponivelTotal: cartaoAtivo.limite - ocupado,
			};
		}, [
			todosGastosCredito,
			todosPagamentos,
			cartaoAtivo,
			viewDate,
			selectedCartao,
		]);

	const pieData = useMemo(() => {
		const cats = gastosTabela.reduce((acc: any, curr) => {
			acc[curr.categoria] = (acc[curr.categoria] || 0) + Number(curr.valor);
			return acc;
		}, {});
		return Object.keys(cats).map((name) => ({ name, value: cats[name] }));
	}, [gastosTabela]);

	const COLORS = [
		"#EC4899",
		"#8B5CF6",
		"#3B82F6",
		"#10B981",
		"#F59E0B",
		"#64748B",
	];

	return (
		<div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 bg-[#FDFCFB] min-h-screen">
			{/* HEADER DINÂMICO */}
			<header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
				<div>
					<h1 className="text-4xl font-black text-[#3D3030] tracking-tight">
						Gestão de Crédito
					</h1>
					<div className="flex items-center gap-2 mt-1">
						<span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
						<p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">
							{cartoes.length} Cartões Ativos
						</p>
					</div>
				</div>
				<button
					onClick={() => setIsModalOpen(true)}
					className="group bg-[#3D3030] text-white px-8 py-4 rounded-3xl font-black flex items-center gap-3 shadow-2xl hover:bg-black transition-all active:scale-95">
					<Plus
						size={20}
						className="group-hover:rotate-90 transition-transform"
					/>
					ADICIONAR CARTÃO
				</button>
			</header>

			{/* SEÇÃO DE CARTÕES (CAROUSEL-LIKE) */}
			<section className="grid grid-cols-1 md:grid-cols-3 gap-6">
				{cartoes.map((cartao) => {
					const isSelected = selectedCartao === cartao.id;
					
					// Cálculo de Limite por Cartão
					const totalGastoCard = todosGastosCredito
						.filter((g) => g.cartao_id === cartao.id)
						.reduce((acc, curr) => acc + Number(curr.valor), 0);
					const totalPagoCard = todosPagamentos
						.filter((p) => p.cartao_id === cartao.id)
						.reduce((acc, curr) => acc + Number(curr.valor), 0);
					
					const ocupadoCard = totalGastoCard - totalPagoCard;
					const disponivelCard = cartao.limite - ocupadoCard;
					const percUso = (ocupadoCard / cartao.limite) * 100;

					return (
						<div
							key={cartao.id}
							onClick={() => setSelectedCartao(cartao.id)}
							className={`group p-8 rounded-[45px] cursor-pointer transition-all border-4 relative overflow-hidden ${
								isSelected
									? "border-pink-500 bg-white shadow-[0_20px_50px_rgba(236,72,153,0.15)] scale-[1.02]"
									: "border-transparent bg-white/60 opacity-70 hover:opacity-100"
							}`}>
							<div className="flex justify-between items-start mb-10">
								<div
									className={`p-3 rounded-2xl ${isSelected ? "bg-pink-500 text-white" : "bg-gray-100 text-gray-400"}`}>
									<CreditCard size={24} />
								</div>
								<div className="text-right">
									<p className="font-black text-[#3D3030] text-lg leading-none">
										{cartao.nome}
									</p>
									<p className="text-[9px] font-bold text-gray-400 uppercase mt-1 tracking-tighter">
										Final **** {cartao.id.slice(-4)}
									</p>
								</div>
							</div>

							<div className="space-y-1">
								<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
									<Wallet size={12} className="text-pink-400" /> Limite
									Disponível
								</p>
								<h2 className="text-3xl font-black text-[#3D3030]">
									R${" "}
									{disponivelCard.toLocaleString("pt-BR", {
										minimumFractionDigits: 2,
									})}
								</h2>
							</div>

							{/* Progress Bar com cores dinâmicas */}
							<div className="mt-6 mb-2">
								<div className="flex justify-between text-[9px] font-black uppercase mb-2">
									<span className="text-gray-400">Uso do Limite</span>
									<span
										className={percUso > 80 ? "text-red-500" : "text-pink-500"}>
										{percUso.toFixed(0)}%
									</span>
								</div>
								<div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
									<div
										className={`h-full transition-all duration-1000 ${percUso > 80 ? "bg-red-500" : "bg-pink-500"}`}
										style={{ width: `${Math.min(percUso, 100)}%` }}
									/>
								</div>
							</div>

							<div className="flex justify-between pt-4 border-t border-dashed border-gray-100 mt-4 font-bold text-[10px] text-gray-400">
								<span className="flex items-center gap-1">
									<Clock size={12} /> Fecha dia {cartao.fechamento_dia}
								</span>
								<span className="flex items-center gap-1 uppercase text-pink-500">
									Mastercard
								</span>
							</div>
						</div>
					);
				})}
			</section>

			{/* ÁREA DE ANÁLISE E FATURA */}
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
				{/* LADO ESQUERDO: GRÁFICO E INSIGHTS */}
				<div className="lg:col-span-4 space-y-6">
					<div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-50">
						<div className="flex items-center justify-between mb-8">
							<h3 className="font-black text-[#3D3030] flex items-center gap-2 uppercase text-sm tracking-tight">
								<ChartIcon className="text-pink-500" size={18} /> Gastos por
								Categoria
							</h3>
							<ArrowUpRight size={18} className="text-gray-300" />
						</div>

						<div className="h-[280px] w-full">
							{pieData.length > 0 ? (
								<ResponsiveContainer width="100%" height="100%">
									<PieChart>
										<Pie
											data={pieData}
											innerRadius={70}
											outerRadius={90}
											paddingAngle={8}
											dataKey="value"
											stroke="none">
											{pieData.map((_, index) => (
												<Cell
													key={`cell-${index}`}
													fill={COLORS[index % COLORS.length]}
												/>
											))}
										</Pie>
										<Tooltip
											contentStyle={{
												borderRadius: "20px",
												border: "none",
												boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
												fontWeight: "bold",
											}}
										/>
										<Legend verticalAlign="bottom" iconType="circle" />
									</PieChart>
								</ResponsiveContainer>
							) : (
								<div className="h-full flex flex-col items-center justify-center text-gray-300 gap-2">
									<AlertCircle size={32} />
									<p className="font-bold uppercase text-[10px]">
										Nenhum gasto neste ciclo
									</p>
								</div>
							)}
						</div>
					</div>

					{/* Card de Parcelas Futuras (Visual) */}
					<div className="bg-[#3D3030] p-8 rounded-[40px] text-white">
						<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
							Comprometimento
						</p>
						<h4 className="text-xl font-black">Parcelas Futuras</h4>
						<div className="mt-6 space-y-4 opacity-80">
							<div className="flex justify-between text-xs font-bold">
								<span>Próximo Ciclo</span>
								<span>R$ {totalFaturaProxima.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
							</div>
							<div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
								<div 
									className="bg-pink-500 h-full rounded-full transition-all duration-1000" 
									style={{ width: `${Math.min((totalFaturaProxima / (totalFaturaMes || 1)) * 100, 100)}%` }}
								/>
							</div>
							<p className="text-[9px] font-medium leading-tight">
								Baseado na média de parcelamentos atuais, sua fatura tende a
								manter este patamar.
							</p>
						</div>
					</div>
				</div>

				{/* LADO DIREITO: DETALHAMENTO DA FATURA */}
				<div className="lg:col-span-8 bg-white rounded-[45px] shadow-sm border border-gray-50 flex flex-col">
					{/* Seletor de Mês e Resumo Fatura */}
					<div className="p-8 bg-[#FDFBFB] flex flex-col md:flex-row justify-between items-center gap-6 rounded-t-[45px] border-b border-gray-50">
						<div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl shadow-inner border border-gray-100">
							<button
								onClick={() => {
									const d = new Date(viewDate);
									d.setMonth(d.getMonth() - 1);
									setViewDate(d);
								}}
								className="p-3 hover:bg-gray-50 rounded-xl text-gray-400 hover:text-pink-500 transition-all">
								<ChevronLeft size={20} />
							</button>
							<div className="px-6 text-center">
								<p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">
									Mês de Referência
								</p>
								<span className="font-black text-[#3D3030] uppercase text-sm">
									{viewDate.toLocaleDateString("pt-BR", {
										month: "long",
										year: "numeric",
									})}
								</span>
							</div>
							<button
								onClick={() => {
									const d = new Date(viewDate);
									d.setMonth(d.getMonth() + 1);
									setViewDate(d);
								}}
								className="p-3 hover:bg-gray-50 rounded-xl text-gray-400 hover:text-pink-500 transition-all">
								<ChevronRight size={20} />
							</button>
						</div>

						<div className="flex items-center gap-6">
							<div className="text-right">
								<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
									Total da Fatura
								</p>
								<p className="text-4xl font-black text-pink-500 tracking-tighter">
									R${" "}
									{totalFaturaMes.toLocaleString("pt-BR", {
										minimumFractionDigits: 2,
									})}
								</p>
							</div>
							<button className="bg-pink-500 text-white p-4 rounded-3xl font-black hover:bg-pink-600 shadow-lg shadow-pink-100 transition-all flex items-center gap-2">
								<CheckCircle2 size={24} />
							</button>
						</div>
					</div>

					{/* Tabela de Itens */}
					<div className="flex-1 overflow-x-auto">
						<table className="w-full">
							<thead>
								<tr className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-50">
									<th className="p-8 text-left">Lançamento</th>
									<th className="p-8 text-center">Parcela</th>
									<th className="p-8 text-center flex items-center gap-2 justify-center">
										<Filter size={12} /> Categoria
									</th>
									<th className="p-8 text-right">Valor</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-50">
								{gastosTabela.length > 0 ? (
									gastosTabela.map((g) => (
										<tr
											key={g.id}
											className="hover:bg-[#FDFCFB] transition-colors group cursor-default">
											<td className="p-8">
												<div className="flex items-center gap-4">
													<div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-pink-50 group-hover:text-pink-500 transition-colors">
														<ShoppingCart size={18} />
													</div>
													<div>
														<p className="font-black text-[#3D3030] text-sm">
															{g.descricao}
														</p>
														<p className="text-[10px] font-bold text-gray-300 uppercase tracking-tight">
															{new Date(
																g.data + "T12:00:00",
															).toLocaleDateString("pt-BR")}
														</p>
													</div>
												</div>
											</td>
											<td className="p-8 text-center">
												<span className="text-[10px] font-black text-pink-500 bg-pink-50 px-3 py-1.5 rounded-full border border-pink-100/50 uppercase">
													{g.parcela_atual || 1} de {g.total_parcelas || 1}
												</span>
											</td>
											<td className="p-8 text-center">
												<span className="text-[9px] font-black uppercase text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200/50">
													{g.categoria}
												</span>
											</td>
											<td className="p-8 text-right">
												<p className="font-black text-[#3D3030]">
													R${" "}
													{Number(g.valor).toLocaleString("pt-BR", {
														minimumFractionDigits: 2,
													})}
												</p>
											</td>
										</tr>
									))
								) : (
									<tr>
										<td colSpan={4} className="p-20 text-center">
											<div className="opacity-20 flex flex-col items-center gap-2">
												<Calendar size={48} />
												<p className="font-black uppercase text-xs">
													Nenhum lançamento neste período
												</p>
											</div>
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			</div>

			<AddCartaoWeb
				isOpen={isModalOpen}
				onClose={() => setIsModalOpen(false)}
				onSuccess={() => {
					setIsModalOpen(false);
					loadData();
				}}
			/>
		</div>
	);
}
