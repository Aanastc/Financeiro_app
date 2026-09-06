import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import {
	Plus,
	AlertTriangle,
	Clock,
	TrendingUp,
	Trash2,
	HandCoins,
	Sparkles,
	Check,
	Calendar
} from "lucide-react";
import { Toaster, toast } from "react-hot-toast";
import AddDividaWeb from "../components/AddDividaWeb";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default function DividasWeb() {
	const [dividas, setDividas] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [isAddDividaOpen, setIsAddDividaOpen] = useState(false);
	
	const [simulacao, setSimulacao] = useState({
		valor: 1000,
		juros: 2.5,
		parcelas: 12,
	});

	const [insights, setInsights] = useState("");
	const [generatingInsights, setGeneratingInsights] = useState(false);

	const handlePagarParcela = async (divida: any) => {
		try {
			await financeService.pagarParcelaDivida(divida.id, divida.parcela_atual, divida.parcelas, divida.vencimento_parcela);
			toast.success("Parcela paga com sucesso!");
			loadDividas();
		} catch (error: any) {
			toast.error("Erro ao pagar parcela: " + error.message);
		}
	};

	const handleQuitarDivida = async (id: string) => {
		if (window.confirm("Deseja realmente quitar esta dívida por completo?")) {
			try {
				await financeService.quitarDivida(id);
				toast.success("Dívida quitada com sucesso!");
				loadDividas();
			} catch (error: any) {
				toast.error("Erro ao quitar dívida: " + error.message);
			}
		}
	};

	const generateInsights = async () => {
		if (dividas.length === 0) {
			setInsights("Cadastre suas dívidas para receber conselhos e estratégias de amortização da Inteligência Artificial.");
			return;
		}
		setGeneratingInsights(true);
		try {
			const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
			if (!apiKey || apiKey === "sua_chave_aqui") {
				setInsights("Chave da API do Gemini não configurada.");
				return;
			}
			const genAI = new GoogleGenerativeAI(apiKey);

			const prompt = `Você é um consultor financeiro especialista em amortização de dívidas. 
Analise as seguintes dívidas do usuário:
${dividas.map(d => `- Descrição: ${d.descricao}, Valor Total: R$ ${d.valor_total}, Juros: ${d.juros}% a.m., Parcelas: ${d.parcela_atual}/${d.parcelas}, Banco: ${d.banco || "Não informado"}, Tipo: ${d.tipo_divida || "Outro"}`).join("\n")}

Com base nesses dados:
1. Recomende qual dívida priorizar e justifique (explique brevemente os métodos Avalanche, focando nos juros mais altos, e Bola de Neve, focando no menor saldo).
2. Dê dicas práticas de amortização e como negociar para martelar/reduzir essa dívida.
Retorne o conselho em formato markdown limpo, com títulos curtos, linguagem amigável, direto ao ponto e em português do Brasil.`;

			const modelsToTry = [
				"gemini-2.5-flash", 
				"gemini-2.0-flash", 
				"gemini-1.5-flash",
				"gemini-1.5-flash-latest",
				"gemini-1.5-pro"
			];
			let result;
			let lastError;

			const callModelWithRetry = async (modelName: string, retries = 1, delay = 1500): Promise<any> => {
				const modelInstance = genAI.getGenerativeModel({ model: modelName });
				try {
					return await modelInstance.generateContent(prompt);
				} catch (error: any) {
					const errorMessage = error?.message || "";
					const isTransient = errorMessage.includes("503") || errorMessage.includes("experiencing high demand") || errorMessage.includes("429");
					if (retries > 0 && isTransient) {
						await new Promise(resolve => setTimeout(resolve, delay));
						return callModelWithRetry(modelName, retries - 1, delay * 2);
					}
					throw error;
				}
			};

			for (const modelName of modelsToTry) {
				try {
					result = await callModelWithRetry(modelName);
					break;
				} catch (err) {
					console.warn(`Falha no modelo ${modelName} em Dívidas:`, err);
					lastError = err;
				}
			}

			if (!result) {
				const errorMessage = lastError?.message || "";
				if (errorMessage.includes("404")) {
					throw new Error("Sua chave da API do Google não tem acesso aos modelos Gemini (Erro 404). Verifique no Google AI Studio se a chave está correta.");
				}
				throw lastError || new Error("Todos os modelos de IA falharam.");
			}
			setInsights(result.response.text());
		} catch (error: any) {
			setInsights("Erro ao gerar insights: " + error.message);
		} finally {
			setGeneratingInsights(false);
		}
	};

	const loadDividas = useCallback(async () => {
		setLoading(true);
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
			const { data, error } = await supabase
				.from("passivos")
				.select("*, credor:usuarios!credor_id(nome), devedor:usuarios!devedor_id(nome)")
				.or(`usuario_id.eq.${user.id},credor_id.eq.${user.id},devedor_id.eq.${user.id}`)
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
				channel = financeService.subscribeToChanges("passivos", user.id, loadDividas);
			}
		}
		setupRealtime();
		return () => { if (channel) supabase.removeChannel(channel); };
	}, [loadDividas]);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get("add") === "true") {
			setIsAddDividaOpen(true);
		}
	}, []);

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
		let total = 0;
		let saldoDevedor = 0;
		let pendentes = 0;
		
		dividas.forEach(d => {
			total += Number(d.valor_total);
			if (d.status === 'pendente' || d.status === 'ativo') {
				pendentes++;
				const valorParcela = Number(d.valor_total) / Number(d.parcelas);
				const parcelasRestantes = Number(d.parcelas) - Number(d.parcela_atual) + 1;
				saldoDevedor += parcelasRestantes * valorParcela;
			}
		});

		return { total, saldoDevedor, pendentes };
	}, [dividas]);

	const resultadoSimulacao = useMemo(() => {
		const totalJuros = simulacao.valor * (simulacao.juros / 100) * simulacao.parcelas;
		const totalPago = simulacao.valor + totalJuros;
		const percJuros = totalPago > 0 ? (totalJuros / totalPago) * 100 : 0;
		return { totalPago, totalJuros, percJuros };
	}, [simulacao]);

	return (
		<div className="space-y-6 sm:space-y-8 pb-20">
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] shadow-sm border border-purple-50 dark:border-slate-800 relative overflow-hidden transition-colors">
				<div className="absolute top-0 right-0 w-64 h-64 bg-purple-100 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/4 pointer-events-none" />
				
				<div className="space-y-1 relative z-10">
					<div className="flex items-center gap-3">
						<div className="bg-purple-100 dark:bg-purple-950/40 p-2 rounded-xl text-purple-600 dark:text-purple-400">
							<HandCoins size={24} />
						</div>
						<h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">Dívidas e Empréstimos</h1>
					</div>
					<p className="text-gray-400 dark:text-slate-500 font-medium text-sm ml-12">Gestão de compromissos, empréstimos e parcelamentos pesados</p>
				</div>

				<button 
					onClick={() => setIsAddDividaOpen(true)}
					className="px-8 py-4 bg-purple-600 text-white rounded-[25px] font-black flex items-center gap-2 hover:bg-purple-700 transition-all shadow-xl shadow-purple-200 dark:shadow-none relative z-10 w-full lg:w-auto justify-center cursor-pointer">
					<Plus size={20} /> NOVA DÍVIDA
				</button>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[35px] border border-gray-100 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-purple-200 dark:hover:border-purple-800 transition-colors">
					<div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 dark:bg-rose-955/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform" />
					<p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">Total em Dívidas</p>
					<h2 className="text-3xl font-black text-rose-500 dark:text-rose-400">R$ {stats.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
				</div>
				<div className="bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[35px] border border-gray-100 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-purple-200 dark:hover:border-purple-800 transition-colors">
					<div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 dark:bg-amber-955/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform" />
					<p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">Parcelas Pendentes</p>
					<h2 className="text-3xl font-black text-amber-500">{stats.pendentes} itens ativos</h2>
				</div>
				<div className="bg-gradient-to-br from-purple-600 to-indigo-600 p-5 sm:p-8 rounded-3xl sm:rounded-[35px] shadow-lg shadow-purple-200 dark:shadow-none text-white relative overflow-hidden flex flex-col justify-between">
					<div className="absolute bottom-0 right-0 w-40 h-40 bg-white/10 rounded-tl-full blur-xl pointer-events-none" />
					<div>
						<p className="text-[10px] font-black text-purple-200 uppercase tracking-widest mb-2">Saldo Devedor Restante</p>
						<h2 className="text-3xl font-black">R$ {stats.saldoDevedor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
					</div>
					<p className="text-[9px] text-purple-200 font-semibold mt-2 relative z-10">*Somente parcelas não pagas</p>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
				<div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[40px] shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col transition-colors">
					<div className="p-5 sm:p-8 border-b border-gray-50 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
						<h3 className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 uppercase text-sm tracking-tight">
							<AlertTriangle className="text-purple-500" size={18} /> Cronograma de Pagamentos
						</h3>
					</div>
					<div className="overflow-x-auto flex-1">
						<table className="w-full text-left">
							<thead>
								<tr className="bg-slate-50/50 dark:bg-slate-800/30 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
									<th className="p-6">Descrição</th>
									<th className="p-6 text-center">Parcelas</th>
									<th className="p-6 text-center">Juros</th>
									<th className="p-6 text-center">Período</th>
									<th className="p-6 text-right">Total</th>
									<th className="p-6 text-center">Status</th>
									<th className="p-6 text-center">Ações</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-50">
								{dividas.length > 0 ? (
									dividas.map((d) => {
										const pctQuitado = d.status === "quitada" || d.status === "pago"
											? 100
											: Math.min(100, Math.max(0, Math.round(((Number(d.parcela_atual) - 1) / Number(d.parcelas)) * 100)));
										
										const rowSaldoDevedor = d.status === "quitada" || d.status === "pago"
											? 0
											: (Number(d.parcelas) - Number(d.parcela_atual) + 1) * (Number(d.valor_total) / Number(d.parcelas));
										
										const valorParcela = Number(d.valor_total) / Number(d.parcelas);
										const parcelasRestantes = d.status === "quitada" || d.status === "pago"
											? 0
											: Number(d.parcelas) - Number(d.parcela_atual) + 1;

										return (
											<tr key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors group">
												<td className="p-6">
													<div className="font-black text-slate-800 dark:text-slate-100">{d.descricao}</div>
													<div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 flex flex-wrap gap-2">
														{d.banco && <span className="bg-slate-105 dark:bg-slate-800 text-slate-600 dark:text-slate-350 px-2 py-0.5 rounded">{d.banco}</span>}
														{d.tipo_divida && <span className="bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded">{d.tipo_divida}</span>}
														{d.credor_id && d.devedor_id && (
															<span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded flex items-center gap-1 border border-indigo-100 dark:border-indigo-900/50">
																👥 Compartilhado
															</span>
														)}
													</div>
													{/* Progress Bar */}
													<div className="mt-3.5 max-w-[200px]">
														<div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1">
															<span>Quitação ({pctQuitado}%)</span>
															<span>Restam R$ {rowSaldoDevedor.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
														</div>
														<div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
															<div 
																className="bg-purple-500 h-full transition-all duration-300"
																style={{ width: `${pctQuitado}%` }}
															/>
														</div>
													</div>
												</td>
												<td className="p-6 text-center">
													<span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-3 py-1 rounded-lg text-[10px] font-black">
														{d.parcela_atual}/{d.parcelas}
													</span>
													<div className="text-[10px] font-bold text-slate-700 dark:text-slate-300 mt-1.5">
														{valorParcela.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/parc
													</div>
													{parcelasRestantes > 0 && (
														<div className="text-[8px] font-black text-purple-500 uppercase mt-1">
															{parcelasRestantes} restante{parcelasRestantes > 1 ? "s" : ""}
														</div>
													)}
												</td>
											<td className="p-6 text-center font-bold text-rose-500 dark:text-rose-400 text-xs">{d.juros}%</td>
											<td className="p-6 text-center text-xs">
												<div className="font-medium text-slate-450 dark:text-slate-400">De {new Date(d.data_inicio + "T12:00:00").toLocaleDateString('pt-BR')}</div>
												<div className="font-bold text-slate-600 dark:text-slate-300">Até {new Date(d.vencimento_total + "T12:00:00").toLocaleDateString('pt-BR')}</div>
												<div className="font-black text-purple-600 dark:text-purple-400 text-[9px] mt-1">Próx: {new Date(d.vencimento_parcela + "T12:00:00").toLocaleDateString('pt-BR')}</div>
											</td>
											<td className="p-6 text-right font-black text-slate-800 dark:text-slate-100">
												R$ {Number(d.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
											</td>
											<td className="p-6 text-center">
												<span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase ${
													d.status === "quitada" || d.status === "pago" ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-455" : "bg-amber-100 dark:bg-amber-955/40 text-amber-600 dark:text-amber-455"
												}`}>
													{d.status}
												</span>
											</td>
											<td className="p-6 text-center">
												<div className="flex items-center justify-center gap-2">
													{d.status !== "quitada" && d.status !== "pago" && (
														<>
															{d.tipo_divida === "Consignado" ? (
																<span className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-1 rounded text-[8px] font-black uppercase">
																	Em Folha
																</span>
															) : (
																<>
																	<button 
																		onClick={() => handlePagarParcela(d)}
																		className="px-2 py-1 bg-purple-50 text-purple-600 hover:bg-purple-600 hover:text-white rounded font-bold text-[9px] uppercase transition-all"
																		title="Pagar próxima parcela"
																	>
																		Pagar Parc.
																	</button>
																	<button 
																		onClick={() => handleQuitarDivida(d.id)}
																		className="px-2 py-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded font-bold text-[9px] uppercase transition-all"
																		title="Quitar dívida"
																	>
																		Quitar
																	</button>
																</>
															)}
														</>
													)}
													<button 
														onClick={() => handleDelete(d.id)}
														className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
													>
														<Trash2 size={16} />
													</button>
												</div>
											</td>
										</tr>
									);
								})
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

				<div className="lg:col-span-4 space-y-8 flex flex-col">
					{/* AI INSIGHTS CARD */}
					<div className="bg-gradient-to-br from-indigo-900 to-slate-900 p-8 rounded-[40px] shadow-2xl text-white relative overflow-hidden">
						<div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
						
						<div className="relative z-10 flex justify-between items-start mb-6">
							<div>
								<h3 className="text-xl font-black flex items-center gap-2 text-white">
									<Sparkles size={20} className="text-indigo-400 animate-pulse" /> IA Insights
								</h3>
								<p className="text-indigo-200 font-bold text-[9px] uppercase tracking-widest mt-1">Estratégias de Amortização</p>
							</div>
							<button
								onClick={generateInsights}
								disabled={generatingInsights}
								className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-black text-xs uppercase rounded-xl transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
							>
								{generatingInsights ? "Gerando..." : "Analisar"}
							</button>
						</div>

						<div className="relative z-10 text-xs text-indigo-100 leading-relaxed font-medium max-h-[200px] overflow-y-auto pr-2 scrollbar-thin">
							{insights ? (
								<div className="prose prose-invert prose-xs whitespace-pre-line">
									{insights}
								</div>
							) : (
								<p className="italic text-slate-400 text-center py-6">
									Clique em "Analisar" para que a IA verifique qual dívida priorizar (Avalanche vs Bola de Neve) e dê dicas de negociação.
								</p>
							)}
						</div>
					</div>

					{/* SIMULATOR CARD */}
					<div className="bg-slate-900 p-8 rounded-[40px] shadow-2xl text-white flex flex-col relative overflow-hidden">
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
