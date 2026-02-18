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
import { AddCartaoWeb } from "../components/AddCartaoWeb"; // Importando seu modal

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

			// Seleciona o primeiro cartão automaticamente se nenhum estiver selecionado
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

	// LÓGICA DE CORTE: Define o período da fatura baseado no dia de fechamento
	const { gastosTabela, totalFaturaMes } = useMemo(() => {
		if (!cartaoAtivo) return { gastosTabela: [], totalFaturaMes: 0 };

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
			.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

		return {
			gastosTabela: filtrados,
			totalFaturaMes: filtrados.reduce(
				(acc, curr) => acc + Number(curr.valor),
				0,
			),
		};
	}, [todosGastosCredito, cartaoAtivo, viewDate, selectedCartao]);

	const pieData = useMemo(() => {
		const cats = gastosTabela.reduce((acc: any, curr) => {
			acc[curr.categoria] = (acc[curr.categoria] || 0) + Number(curr.valor);
			return acc;
		}, {});
		return Object.keys(cats).map((name) => ({ name, value: cats[name] }));
	}, [gastosTabela]);

	const COLORS = [
		"#EC4899",
		"#5D4037",
		"#FF8042",
		"#00C49F",
		"#FFBB28",
		"#8884d8",
	];

	return (
		<div className="p-8 max-w-7xl mx-auto space-y-8 bg-[#FDFCFB] min-h-screen">
			{/* HEADER */}
			<div className="flex justify-between items-center">
				<div>
					<h1 className="text-4xl font-black text-[#3E2723]">Meus Cartões</h1>
					<p className="text-gray-400 font-bold uppercase text-[10px] tracking-[0.2em]">
						Controle de Faturas e Limites
					</p>
				</div>
				<button
					onClick={() => setIsModalOpen(true)}
					className="bg-pink-500 text-white px-8 py-4 rounded-[2rem] font-black flex items-center gap-2 shadow-xl hover:bg-pink-600 hover:scale-105 transition-all">
					<Plus size={20} /> NOVO CARTÃO
				</button>
			</div>

			{/* LISTAGEM DE CARDS ESTILO BANCO DIGITAL */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				{cartoes.map((cartao) => {
					const gastoTotal = todosGastosCredito
						.filter((g) => g.cartao_id === cartao.id)
						.reduce((acc, curr) => acc + Number(curr.valor), 0);
					const pagoTotal = todosPagamentos
						.filter((p) => p.cartao_id === cartao.id)
						.reduce((acc, curr) => acc + Number(curr.valor), 0);
					const ocupado = gastoTotal - pagoTotal;
					const disponivel = cartao.limite - ocupado;

					return (
						<div
							key={cartao.id}
							onClick={() => setSelectedCartao(cartao.id)}
							className={`p-8 rounded-[40px] cursor-pointer transition-all border-4 relative ${selectedCartao === cartao.id ? "border-pink-400 bg-white shadow-2xl scale-[1.02]" : "border-transparent bg-white/50 opacity-60"}`}>
							<div className="flex justify-between mb-6">
								<CreditCard
									size={32}
									className={
										selectedCartao === cartao.id
											? "text-pink-500"
											: "text-gray-300"
									}
								/>
								<span className="font-black italic opacity-20 text-xl tracking-tighter uppercase">
									{cartao.nome}
								</span>
							</div>

							<div className="mb-6">
								<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
									<Wallet size={10} /> Limite Disponível
								</p>
								<p className="text-3xl font-black text-[#3E2723]">
									R${" "}
									{disponivel.toLocaleString("pt-BR", {
										minimumFractionDigits: 2,
									})}
								</p>
							</div>

							<div className="grid grid-cols-2 gap-4 mb-4">
								<div>
									<p className="text-[9px] font-black text-gray-400 uppercase text-left">
										Total
									</p>
									<p className="text-sm font-black text-gray-500 text-left">
										R$ {cartao.limite.toLocaleString("pt-BR")}
									</p>
								</div>
								<div>
									<p className="text-[9px] font-black text-gray-400 uppercase text-right">
										Ocupado
									</p>
									<p className="text-sm font-black text-pink-500 text-right">
										R$ {ocupado.toLocaleString("pt-BR")}
									</p>
								</div>
							</div>

							<div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden mb-6">
								<div
									className="bg-pink-500 h-full transition-all"
									style={{
										width: `${Math.min((ocupado / cartao.limite) * 100, 100)}%`,
									}}
								/>
							</div>

							<div className="grid grid-cols-2 border-t border-dashed border-gray-100 pt-4 text-[10px] font-bold text-gray-400 uppercase">
								<div className="flex items-center gap-1">
									<Calendar size={12} /> Vencimento: {cartao.vencimento_dia}
								</div>
								<div className="flex items-center gap-1 justify-end">
									<ShoppingCart size={12} /> Fechamento: {cartao.fechamento_dia}
								</div>
							</div>
						</div>
					);
				})}
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
				{/* GRÁFICO DE PIZZA */}
				<div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-50 flex flex-col items-center">
					<h3 className="text-lg font-black text-[#3E2723] mb-4 w-full flex items-center gap-2 uppercase tracking-tight">
						<ChartIcon className="text-pink-500" size={18} /> Resumo do Ciclo
					</h3>
					<div className="h-[300px] w-full">
						{pieData.length > 0 ? (
							<ResponsiveContainer width="100%" height="100%">
								<PieChart>
									<Pie
										data={pieData}
										innerRadius={60}
										outerRadius={80}
										paddingAngle={5}
										dataKey="value">
										{pieData.map((_, index) => (
											<Cell
												key={`cell-${index}`}
												fill={COLORS[index % COLORS.length]}
											/>
										))}
									</Pie>
									<Tooltip />
									<Legend
										iconType="circle"
										wrapperStyle={{
											fontSize: "10px",
											fontWeight: "900",
											textTransform: "uppercase",
											paddingTop: "20px",
										}}
									/>
								</PieChart>
							</ResponsiveContainer>
						) : (
							<div className="h-full flex items-center justify-center text-gray-300 font-bold italic uppercase text-xs">
								Sem dados
							</div>
						)}
					</div>
				</div>

				{/* TABELA DE FATURA */}
				<div className="lg:col-span-2 bg-white rounded-[40px] shadow-sm border border-gray-50 overflow-hidden">
					<div className="p-8 bg-[#FCF8F8] flex flex-col md:flex-row justify-between items-center gap-6 border-b border-gray-100">
						<div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-gray-200 shadow-sm">
							<button
								onClick={() => {
									const d = new Date(viewDate);
									d.setMonth(d.getMonth() - 1);
									setViewDate(d);
								}}
								className="p-2 hover:text-pink-500 transition-colors">
								<ChevronLeft size={20} />
							</button>
							<span className="font-black text-[#3E2723] uppercase text-xs w-32 text-center">
								{viewDate.toLocaleDateString("pt-BR", {
									month: "long",
									year: "numeric",
								})}
							</span>
							<button
								onClick={() => {
									const d = new Date(viewDate);
									d.setMonth(d.getMonth() + 1);
									setViewDate(d);
								}}
								className="p-2 hover:text-pink-500 transition-colors">
								<ChevronRight size={20} />
							</button>
						</div>

						<div className="flex items-center gap-8 text-right">
							<div>
								<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
									Valor da Fatura
								</p>
								<p className="text-3xl font-black text-pink-500">
									R${" "}
									{totalFaturaMes.toLocaleString("pt-BR", {
										minimumFractionDigits: 2,
									})}
								</p>
							</div>
							<button className="bg-[#3E2723] text-white px-8 py-4 rounded-2xl font-black text-xs hover:bg-black transition-all flex items-center gap-2 shadow-lg shadow-gray-200">
								<CheckCircle2 size={18} /> PAGAR FATURA
							</button>
						</div>
					</div>

					<div className="overflow-x-auto px-4 pb-4">
						<table className="w-full">
							<thead>
								<tr className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-50">
									<th className="p-6 text-left">Data</th>
									<th className="p-6 text-left">Item / Cartão</th>
									<th className="p-6 text-left">Parcela</th>
									<th className="p-6 text-left">Categoria</th>
									<th className="p-6 text-right">Valor</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-50">
								{gastosTabela.map((g) => (
									<tr
										key={g.id}
										className="hover:bg-pink-50/20 transition-colors group">
										<td className="p-6 text-xs font-bold text-gray-400">
											{new Date(g.data + "T12:00:00").toLocaleDateString(
												"pt-BR",
											)}
										</td>
										<td className="p-6">
											<p className="font-black text-[#3E2723] text-sm">
												{g.descricao.replace(/\(\d+\/\d+\)/, "").trim()}
											</p>
											<p className="text-[9px] text-gray-300 font-bold uppercase tracking-tighter">
												{cartaoAtivo?.nome}
											</p>
										</td>
										<td className="p-6">
											<span className="text-xs font-black text-pink-500 bg-pink-50 px-3 py-1 rounded-full border border-pink-100">
												{g.parcela_atual || 1}/{g.total_parcelas || 1}
											</span>
										</td>
										<td className="p-6">
											<span className="text-[9px] font-black uppercase text-gray-400 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
												{g.categoria}
											</span>
										</td>
										<td className="p-6 text-right font-black text-[#3E2723]">
											R${" "}
											{Number(g.valor).toLocaleString("pt-BR", {
												minimumFractionDigits: 2,
											})}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</div>

			{/* MODAL DE ADICIONAR CARTÃO */}
			<AddCartaoWeb
				isOpen={isModalOpen}
				onClose={() => setIsModalOpen(false)}
				onSuccess={() => {
					setIsModalOpen(false);
					loadData(); // Recarrega os dados após salvar
				}}
			/>
		</div>
	);
}
