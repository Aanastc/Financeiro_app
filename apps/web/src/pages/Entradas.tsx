import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
    Cell,
    CartesianGrid
} from "recharts";
import {
	TrendingUp,
	CheckCircle2,
	Clock,
	Calendar,
	ArrowUpCircle,
    ChevronLeft,
    ChevronRight,
    Tag
} from "lucide-react";

const MESES = [
	"Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
	"Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

const MESES_COMPLETOS = [
	"Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
	"Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export default function EntradasWeb() {
	const [data, setData] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [year, setYear] = useState(new Date().getFullYear());
    const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'RECEBIDO' | 'A_RECEBER'>('TODOS');

	const loadData = useCallback(async () => {
		setLoading(true);
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
			const { data: list } = await supabase
				.from("transacoes")
				.select("*, categorias(nome, cor_hex), contas_bancarias(nome)")
				.eq("usuario_id", user.id)
				.eq("tipo", "RECEITA")
				.gte("data", `${year}-01-01`)
				.lte("data", `${year}-12-31`)
				.order("data", { ascending: false }); // Historico recente
			
			setData(list || []);
		}
		setLoading(false);
	}, [year]);

	useEffect(() => {
		loadData();

		// REALTIME SUBSCRIPTION
		let channel: any;
		async function setupRealtime() {
			const { data: { user } } = await supabase.auth.getUser();
			if (user) {
				channel = financeService.subscribeToChanges("transacoes", user.id, loadData);
			}
		}
		setupRealtime();

		return () => {
			if (channel) supabase.removeChannel(channel);
		};
	}, [loadData]);

    const totalRecebido = useMemo(() => {
        return data.filter(d => d.status === 'confirmada' || !d.status).reduce((acc, curr) => acc + Number(curr.valor), 0);
    }, [data]);

    const totalAReceber = useMemo(() => {
        return data.filter(d => d.status === 'pendente').reduce((acc, curr) => acc + Number(curr.valor), 0);
    }, [data]);

    const chartData = useMemo(() => {
        return MESES.map((nome, idx) => {
            const itensDoMes = data.filter(d => {
                if (!d.data) return false;
                const dateStr = String(d.data);
                const dObj = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
                return !isNaN(dObj.getTime()) && dObj.getMonth() === idx;
            });
            const sumMes = itensDoMes.reduce((acc, curr) => acc + Number(curr.valor || 0), 0);
            return {
                name: nome,
                mesCompleto: MESES_COMPLETOS[idx],
                total: sumMes,
                count: itensDoMes.length
            };
        });
    }, [data]);

    const statsAno = useMemo(() => {
        const totalAno = chartData.reduce((acc, curr) => acc + curr.total, 0);
        const mesesComDados = chartData.filter(m => m.total > 0);
        const mediaMensal = mesesComDados.length > 0 ? totalAno / mesesComDados.length : 0;
        const maiorMes = chartData.reduce((max, curr) => (curr.total > max.total ? curr : max), { name: '', mesCompleto: '', total: 0, count: 0 });
        return { totalAno, mediaMensal, maiorMes, qtdMesesAtivos: mesesComDados.length };
    }, [chartData]);

    const filtrados = useMemo(() => {
        if (filtroStatus === 'RECEBIDO') return data.filter(d => d.status === 'confirmada' || !d.status);
        if (filtroStatus === 'A_RECEBER') return data.filter(d => d.status === 'pendente');
        return data;
    }, [data, filtroStatus]);

	return (
		<div className="space-y-6 sm:space-y-8 pb-20 animate-in fade-in duration-500">
			{/* SECTION: HEADER & ACTIONS */}
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
				<div className="space-y-1">
					<div className="flex items-center gap-3">
						<div className="bg-emerald-100 dark:bg-emerald-950/40 p-2 rounded-xl text-emerald-600 dark:text-emerald-400">
							<TrendingUp size={24} />
						</div>
						<h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">
							Entradas
						</h1>
					</div>
					<p className="text-slate-500 dark:text-slate-400 font-medium text-sm ml-12">
						Acompanhe o dinheiro que entrou e o que ainda vai entrar.
					</p>
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<div className="flex items-center bg-slate-50 dark:bg-slate-800 rounded-2xl p-1 border border-slate-100 dark:border-slate-700 transition-colors">
						<button
							onClick={() => setYear(year - 1)}
							className="p-2 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-xl transition-all text-slate-600 dark:text-slate-400">
							<ChevronLeft size={20} />
						</button>
						<span className="px-4 font-black text-slate-800 dark:text-white">{year}</span>
						<button
							onClick={() => setYear(year + 1)}
							className="p-2 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-xl transition-all text-slate-600 dark:text-slate-400">
							<ChevronRight size={20} />
						</button>
					</div>
				</div>
			</div>

			{/* SECTION: KPI CARDS */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 flex items-center gap-6 shadow-sm">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-500">
                        <CheckCircle2 size={32} />
                    </div>
                    <div>
                        <p className="text-slate-500 dark:text-slate-400 font-bold text-sm uppercase tracking-wider">Total Recebido</p>
                        <h2 className="text-3xl sm:text-4xl font-black text-emerald-600 dark:text-emerald-500 mt-1">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalRecebido)}
                        </h2>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 flex items-center gap-6 shadow-sm">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-500">
                        <Clock size={32} />
                    </div>
                    <div>
                        <p className="text-slate-500 dark:text-slate-400 font-bold text-sm uppercase tracking-wider">A Receber / Previsto</p>
                        <h2 className="text-3xl sm:text-4xl font-black text-slate-800 dark:text-slate-100 mt-1">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAReceber)}
                        </h2>
                    </div>
                </div>
			</div>

            {/* LISTA & GRÁFICO */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* HISTÓRICO FILTRÁVEL */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-2 pl-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h3 className="font-black text-slate-800 dark:text-slate-100">Histórico de Receitas</h3>
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                            <button 
                                onClick={() => setFiltroStatus('TODOS')}
                                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${filtroStatus === 'TODOS' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500'}`}
                            >
                                Todas
                            </button>
                            <button 
                                onClick={() => setFiltroStatus('RECEBIDO')}
                                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${filtroStatus === 'RECEBIDO' ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm' : 'text-slate-500'}`}
                            >
                                Recebidos
                            </button>
                            <button 
                                onClick={() => setFiltroStatus('A_RECEBER')}
                                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${filtroStatus === 'A_RECEBER' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                            >
                                A Receber
                            </button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {loading ? (
                            <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>
                        ) : filtrados.length === 0 ? (
                            <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 text-center border border-slate-200 dark:border-slate-800 border-dashed">
                                <ArrowUpCircle size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-4" />
                                <h3 className="font-black text-xl text-slate-800 dark:text-slate-200">Nada por aqui!</h3>
                                <p className="text-slate-500 dark:text-slate-400 font-medium">Use o botão flutuante de "+" para registrar suas entradas de dinheiro.</p>
                            </div>
                        ) : (
                            filtrados.map(item => (
                                <div key={item.id} className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500">
                                            <ArrowUpCircle size={24} />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800 dark:text-slate-100">{item.descricao}</p>
                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                                    {item.categorias?.nome || 'Sem Categoria'}
                                                </span>
                                                <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                                                    <Calendar size={12} /> {new Date(item.data).toLocaleDateString('pt-BR')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-black text-lg ${(!item.status || item.status === 'confirmada') ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-800 dark:text-slate-100'}`}>
                                            + {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor)}
                                        </p>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                            {item.contas_bancarias?.nome || 'Em Carteira'}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* GRÁFICO RESUMO */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-fit">
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="font-black text-slate-800 dark:text-slate-100 text-lg">Volume Mensal</h3>
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                {year}
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mb-6 font-medium">
                            Receitas acumuladas por mês
                        </p>
                    </div>

                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" strokeOpacity={0.15} />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 600 }}
                                    interval={0}
                                    angle={-90}
                                    textAnchor="end"
                                    height={42}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                                    width={42}
                                    tickFormatter={(val) => {
                                        if (val === 0) return "0";
                                        if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
                                        if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
                                        return `${val}`;
                                    }}
                                />
                                <Tooltip
                                    cursor={{ fill: "rgba(148, 163, 184, 0.08)", radius: 8 }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const item = payload[0].payload;
                                            return (
                                                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-2xl shadow-xl">
                                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                                        {item.mesCompleto} • {year}
                                                    </p>
                                                    <p className="text-base font-black text-emerald-600 dark:text-emerald-400">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total)}
                                                    </p>
                                                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1">
                                                        {item.count} {item.count === 1 ? 'entrada registrada' : 'entradas registradas'}
                                                    </p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={24}>
                                    {chartData.map((entry, index) => {
                                        const isMax = statsAno.maiorMes.total > 0 && entry.total === statsAno.maiorMes.total;
                                        return (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={isMax ? "#059669" : entry.total > 0 ? "#10b981" : "transparent"}
                                            />
                                        );
                                    })}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* MINI METRICS FOOTER */}
                    <div className="space-y-2.5 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5 rounded-2xl">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Média / Mês</span>
                            <span className="text-sm font-black text-slate-800 dark:text-slate-100">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(statsAno.mediaMensal)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5 rounded-2xl">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Maior Receita</span>
                            <div className="text-right">
                                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                                    {statsAno.maiorMes.total > 0 ? (
                                        <>
                                            <span className="font-semibold text-slate-700 dark:text-slate-200 mr-1.5">{statsAno.maiorMes.mesCompleto}:</span>
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(statsAno.maiorMes.total)}
                                        </>
                                    ) : (
                                        "—"
                                    )}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
		</div>
	);
}
