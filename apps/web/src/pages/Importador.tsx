import { useState, useEffect } from "react";
import { 
	Upload, 
	CheckCircle2, 
	X, 
	FileCode,
	FileSearch,
	Save,
	Sparkles,
	ArrowUpRight,
	ArrowDownRight,
	AlertCircle,
	Users,
	UserPlus,
	CreditCard
} from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";
import AddContatoWeb from "../components/AddContatoWeb";
import { motion } from "framer-motion";
import { useImportar, CATEGORIAS_PADRAO } from "../contexts/ImportarContext";

export default function ImportadorWeb() {
	const {
		file,
		preview,
		loading,
		progress,
		cartoes,
		contatos,
		metas,
		contas,
		globalCartao,
		globalMetodoPagamento,
		dragActive,
		isAddContatoOpen,
		setGlobalCartao,
		setGlobalMetodoPagamento,
		setDragActive,
		setIsAddContatoOpen,
		carregarDadosBase,
		processarArquivo,
		updateItem,
		removeItem,
		handleSaveAll,
		resetImport
	} = useImportar();

	// Atualizar os dados base ao montar (garante sincronia)
	useEffect(() => {
		carregarDadosBase();
	}, [carregarDadosBase]);

	const handleDrag = (e: any) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
		else if (e.type === "dragleave") setDragActive(false);
	};

	const handleDrop = (e: any) => {
		e.preventDefault();
		e.stopPropagation();
		setDragActive(false);
		
		const droppedFile = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
		if (!droppedFile) return;
		processarArquivo(droppedFile);
	};

	return (
		<div className="space-y-6 sm:space-y-8 pb-20 transition-colors duration-250">
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
				<div className="space-y-1">
					<div className="flex items-center gap-3">
						<div className="bg-indigo-100 dark:bg-indigo-950 p-2 rounded-xl text-indigo-600 dark:text-indigo-400">
							<Sparkles size={24} />
						</div>
						<h1 className="text-3xl font-black text-[#2D2424] dark:text-slate-100">Importador IA (Gemini)</h1>
					</div>
					<p className="text-gray-400 dark:text-slate-400 font-medium text-sm ml-12">Arraste seu extrato (PDF, Imagem, Excel ou CSV) para leitura automática</p>
				</div>
			</div>

			{!file ? (
				<div 
					onDragEnter={handleDrag}
					onDragLeave={handleDrag}
					onDragOver={handleDrag}
					onDrop={handleDrop}
					className={`
						relative h-[400px] rounded-3xl sm:rounded-[50px] border-4 border-dashed transition-all flex flex-col items-center justify-center gap-6
						${dragActive ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]' : 'border-gray-150 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-indigo-50/20 dark:hover:bg-indigo-950/20'}
					`}
				>
					<input 
						type="file" 
						className="absolute inset-0 opacity-0 cursor-pointer" 
						onChange={(e) => {
							if (e.target.files && e.target.files.length > 0) {
								processarArquivo(e.target.files[0]);
							}
						}}
						accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.xls"
					/>
					
					<div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-950/30 rounded-full flex items-center justify-center text-indigo-500 dark:text-indigo-400 animate-bounce">
						<FileSearch size={40} />
					</div>
					
					<div className="text-center space-y-2">
						<h3 className="text-xl font-black text-[#2D2424] dark:text-slate-100">Arraste seu extrato aqui</h3>
						<p className="text-gray-400 dark:text-slate-550 font-bold uppercase text-[10px] tracking-widest px-4">Processamento automático (PDF, PNG, JPG, EXCEL, CSV) com Gemini 2.0 / 2.5 Flash</p>
					</div>

					<button className="px-8 py-3 bg-indigo-500 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 dark:shadow-none">
						SELECIONAR ARQUIVO
					</button>
				</div>
			) : (
				<div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
					<div className="bg-white dark:bg-slate-900 p-6 rounded-[35px] border border-gray-100 dark:border-slate-800 flex items-center justify-between transition-colors">
						<div className="flex items-center gap-4">
							<div className="w-12 h-12 bg-indigo-500 text-white rounded-2xl flex items-center justify-center">
								<FileCode size={24} />
							</div>
							<div>
								<h4 className="font-black text-[#2D2424] dark:text-slate-150">{file.name}</h4>
								<p className="text-xs font-bold text-gray-400 dark:text-slate-550 uppercase tracking-tighter">
									{loading ? "Processando com IA..." : `${preview.length} Lançamentos detectados`}
								</p>
							</div>
						</div>
						<button 
							onClick={resetImport}
							className="p-3 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-full text-gray-400 cursor-pointer"
						>
							<X size={20} />
						</button>
					</div>

					{loading ? (
						<div className="bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[40px] shadow-sm border border-gray-100 dark:border-slate-800 p-10 sm:p-20 flex flex-col items-center justify-center gap-4 transition-colors">
							<div className="relative w-48 h-48 flex items-center justify-center">
								<svg className="w-full h-full transform -rotate-90">
									<circle 
										cx="96" cy="96" r="80" 
										className="stroke-slate-100 dark:stroke-slate-850 fill-none" 
										strokeWidth="12" 
									/>
									<circle 
										cx="96" cy="96" r="80" 
										className="stroke-indigo-600 fill-none transition-all duration-300" 
										strokeWidth="12" 
										strokeDasharray={502.4}
										strokeDashoffset={502.4 - (502.4 * progress) / 100}
										strokeLinecap="round"
									/>
								</svg>
								<div className="absolute flex flex-col items-center">
									<span className="text-4xl font-black text-[#2D2424] dark:text-slate-100">{progress}%</span>
									<span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mt-1">Lendo Dados</span>
								</div>
							</div>
							
							<div className="text-center max-w-sm mt-4 space-y-2">
								<h3 className="text-lg font-black text-[#2D2424] dark:text-slate-150 animate-pulse">Lendo seu extrato com IA</h3>
								<p className="text-xs text-gray-400 dark:text-slate-400 font-medium leading-relaxed">Isso pode levar alguns segundos dependendo do tamanho do arquivo. Por favor, aguarde.</p>
							</div>
						</div>
					) : (
						<div className="bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[40px] shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden transition-colors animate-in fade-in duration-300">
							<div className="p-5 sm:p-8 border-b border-gray-50 dark:border-slate-800 flex justify-end">
								<button 
									onClick={handleSaveAll}
									className="px-6 py-3 bg-green-500 text-white rounded-xl font-black text-sm flex items-center gap-2 hover:bg-green-600 transition-all shadow-lg shadow-green-100 dark:shadow-none cursor-pointer"
								>
									<Save size={18} /> SALVAR IMPORTAÇÃO
								</button>
							</div>

							<div className="overflow-x-auto">
								<table className="w-full text-left min-w-[1000px]">
									<thead className="bg-slate-50 dark:bg-slate-950">
										<tr className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase">
											<th className="p-4">Tipo</th>
											<th className="p-4">Data</th>
											<th className="p-4">Descrição</th>
											<th className="p-4">Valor (R$)</th>
											<th className="p-4">Categoria / Destino</th>
											<th className="p-4">Terceiros (Dívida)</th>
											<th className="p-4 text-center">Ação</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-gray-100 dark:divide-slate-800">
										{preview.map((item) => {
											if (item.ignorar) {
												return (
													<tr key={item.id} className="bg-slate-50/50 dark:bg-slate-900/20 opacity-60">
														<td className="p-4" colSpan={6}>
															<div className="flex items-center gap-3">
																<div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400 flex items-center justify-center">
																	<CheckCircle2 size={16} />
																</div>
																<div>
																	<span className="font-black text-slate-850 dark:text-slate-300 line-through">{item.descricao}</span>
																	<span className="ml-3 font-bold text-xs text-green-650 dark:text-green-400 uppercase tracking-wide">✅ {item.ignoredReason}</span>
																</div>
															</div>
														</td>
														<td className="p-4 text-center">
															<button onClick={() => removeItem(item.id)} className="p-2 text-slate-300 hover:text-rose-500 rounded-xl transition-colors cursor-pointer">
																<X size={18} />
															</button>
														</td>
													</tr>
												);
											}

											return (
												<tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-colors">
													{/* TIPO */}
													<td className="p-4">
														<div className="flex items-center gap-2">
															<button 
																onClick={() => {
																	const types: ('Gasto' | 'Entrada' | 'Meta' | 'PagamentoFatura')[] = ['Gasto', 'Entrada', 'Meta', 'PagamentoFatura'];
																	const currIndex = types.indexOf(item.tipo_transacao);
																	const nextType = types[(currIndex + 1) % types.length];
																	updateItem(item.id, "tipo_transacao", nextType);
																}}
																className={`p-2 rounded-xl flex items-center gap-1 font-bold text-xs transition-colors cursor-pointer ${
																	item.tipo_transacao === "Gasto" 
																		? 'bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400' 
																		: item.tipo_transacao === "Entrada" 
																			? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' 
																			: item.tipo_transacao === "Meta"
																				? 'bg-pink-100 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400'
																				: 'bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400'
																}`}
															>
																{item.tipo_transacao === "Gasto" ? (
																	<ArrowDownRight size={14}/>
																) : item.tipo_transacao === "Entrada" ? (
																	<ArrowUpRight size={14}/>
																) : item.tipo_transacao === "Meta" ? (
																	<CheckCircle2 size={14}/>
																) : (
																	<CreditCard size={14}/>
																)}
																{item.tipo_transacao === "PagamentoFatura" ? "Fatura" : item.tipo_transacao}
															</button>
														</div>
													</td>

													{/* DATA */}
													<td className="p-4">
														<input 
															type="date" 
															className="bg-transparent border-none outline-none font-bold text-sm text-slate-700 dark:text-slate-200 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 transition-colors"
															value={item.data}
															onChange={(e) => updateItem(item.id, "data", e.target.value)}
														/>
													</td>

													{/* DESCRIÇÃO */}
													<td className="p-4">
														<div className="flex flex-col">
															<div className="flex items-center">
																<input 
																	type="text" 
																	className="w-full bg-transparent border-none outline-none font-black text-sm text-slate-700 dark:text-slate-200 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 transition-colors"
																	value={item.descricao}
																	onChange={(e) => updateItem(item.id, "descricao", e.target.value)}
																/>
																{item.vinculo_id && (
																	<span className="text-[9px] font-bold text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/50 ml-2 whitespace-nowrap">
																		🔗 Auto-Conciliado
																	</span>
																)}
															</div>
															{item.total_parcelas > 1 && (
																<span className="text-[10px] font-bold text-slate-400 dark:text-slate-550 px-2 uppercase tracking-wide">
																	Parcela {item.parcela_atual} de {item.total_parcelas}
																</span>
															)}
														</div>
													</td>

													{/* VALOR */}
													<td className="p-4">
														<input 
															type="number" 
															step="0.01"
															className={`w-28 bg-transparent border-none outline-none font-black text-sm p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 transition-colors ${
																item.tipo_transacao === 'Entrada' 
																	? 'text-emerald-600 dark:text-emerald-400' 
																	: item.tipo_transacao === 'Meta' 
																		? 'text-pink-600 dark:text-pink-400' 
																		: item.tipo_transacao === 'PagamentoFatura'
																			? 'text-purple-600 dark:text-purple-400'
																			: 'text-slate-800 dark:text-slate-200'
															}`}
															value={item.valor}
															onChange={(e) => updateItem(item.id, "valor", parseFloat(e.target.value) || 0)}
														/>
													</td>

													{/* CATEGORIA / DESTINO */}
													<td className="p-4">
														{item.tipo_transacao === "Meta" ? (
															<select 
																className="w-full bg-pink-50 dark:bg-pink-950/20 border border-pink-100 dark:border-pink-900/30 outline-none font-bold text-xs text-pink-700 dark:text-pink-400 p-2 rounded-lg cursor-pointer animate-in fade-in duration-200"
																value={item.meta_id || ""}
																onChange={(e) => updateItem(item.id, "meta_id", e.target.value)}
															>
																<option value="">Selecionar Meta</option>
																{metas.map(m => <option key={m.id} value={m.id}>{m.titulo}</option>)}
															</select>
														) : item.tipo_transacao === "PagamentoFatura" ? (
															<select 
																className="w-full bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 outline-none font-bold text-xs text-purple-700 dark:text-purple-400 p-2 rounded-lg cursor-pointer animate-in fade-in duration-200"
																value={item.cartao_id || ""}
																onChange={(e) => updateItem(item.id, "cartao_id", e.target.value)}
															>
																<option value="">Selecionar Cartão</option>
																{cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
															</select>
														) : (
															<div className="flex flex-col gap-1.5">
																<select 
																	className="w-full bg-slate-50 dark:bg-slate-800 dark:text-slate-200 outline-none font-bold text-xs p-2 rounded-lg border border-gray-100 dark:border-slate-800 focus:ring-2 focus:ring-indigo-300 cursor-pointer"
																	value={item.categoria}
																	onChange={(e) => updateItem(item.id, "categoria", e.target.value)}
																>
																	{CATEGORIAS_PADRAO.map(cat => <option key={cat} value={cat}>{cat}</option>)}
																	{!CATEGORIAS_PADRAO.includes(item.categoria) && (
																		<option value={item.categoria}>{item.categoria}</option>
																	)}
																</select>
																
																{item.tipo_transacao === "Gasto" && (
																	<select 
																		className="w-full bg-slate-50 dark:bg-slate-800 dark:text-slate-200 outline-none font-bold text-[10px] p-2 rounded-lg border border-gray-100 dark:border-slate-800 cursor-pointer"
																		value={item.metodo_pagamento === "Crédito" ? `cartao-${item.cartao_id}` : item.metodo_pagamento}
																		onChange={(e) => {
																			const val = e.target.value;
																			if (val.startsWith("cartao-")) {
																				updateItem(item.id, "metodo_pagamento", "Crédito");
																				updateItem(item.id, "cartao_id", val.replace("cartao-", ""));
																			} else {
																				updateItem(item.id, "metodo_pagamento", val);
																				updateItem(item.id, "cartao_id", "");
																			}
																		}}
																	>
																		<option value="Débito">💵 Débito (Conta)</option>
																		<option value="Pix">📱 Pix</option>
																		<optgroup label="Cartões de Crédito">
																			{cartoes.map(c => (
																				<option key={c.id} value={`cartao-${c.id}`}>💳 {c.nome}</option>
																			))}
																		</optgroup>
																	</select>
																)}

																{/* Seletor de Conta Bancária para receitas ou gastos com Débito/Pix */}
																{((item.tipo_transacao === "Gasto" && item.metodo_pagamento !== "Crédito") || item.tipo_transacao === "Entrada") && contas.length > 0 && (
																	<select 
																		className="w-full bg-slate-50 dark:bg-slate-800 dark:text-slate-200 outline-none font-bold text-[10px] p-2 rounded-lg border border-gray-100 dark:border-slate-800 cursor-pointer"
																		value={item.conta_id || ""}
																		onChange={(e) => updateItem(item.id, "conta_id", e.target.value)}
																	>
																		<option value="">Selecionar Conta</option>
																		{contas.map(c => (
																			<option key={c.id} value={c.id}>🏦 {c.nome}</option>
																		))}
																	</select>
																)}
															</div>
														)}
													</td>

													{/* TERCEIROS */}
													<td className="p-4">
														{item.tipo_transacao === "PagamentoFatura" ? (
															<div className="text-xs font-bold text-slate-400 dark:text-slate-550 italic text-center">-</div>
														) : (
															<div className="flex flex-col gap-2">
																<div className="flex items-center gap-2">
																	<button 
																		onClick={() => updateItem(item.id, "terceiro", !item.terceiro)}
																		className={`px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-colors flex-1 cursor-pointer ${item.terceiro ? 'bg-amber-100 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-450 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
																	>
																		<Users size={14} /> 
																		{item.tipo_transacao === "Entrada" 
																			? (item.terceiro ? "Recebido de Terceiro" : "Pessoal")
																			: (item.terceiro ? "Para Terceiro" : "Meu Gasto")
																		}
																	</button>
																	{item.terceiro && (
																		<button
																			onClick={() => {
																				updateItem(item.id, "terceiro", true);
																				setIsAddContatoOpen(item.id);
																			}}
																			className="p-2 text-slate-400 hover:text-[#D97706] hover:bg-amber-50 dark:hover:bg-amber-950/20 rounded-xl transition-all border border-slate-100 dark:border-slate-800 hover:border-amber-200 cursor-pointer"
																			title="Cadastrar Novo Devedor"
																		>
																			<UserPlus size={14} />
																		</button>
																	)}
																</div>
																
																{item.terceiro && (
																	<select
																		className="w-full bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-450 outline-none font-bold text-xs p-2 rounded-lg focus:ring-2 focus:ring-amber-300 cursor-pointer"
																		value={item.contato_id}
																		onChange={(e) => {
																			if (e.target.value === "NOVO_DEVEDOR") {
																				setIsAddContatoOpen(item.id);
																			} else {
																				updateItem(item.id, "contato_id", e.target.value);
																			}
																		}}
																	>
																		<option value="">
																			{item.tipo_transacao === "Entrada" 
																				? "Selecione quem pagou" 
																				: "Selecione quem deve"
																			}
																		</option>
																		{contatos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
																		<option value="NOVO_DEVEDOR" className="font-black text-amber-600 dark:text-amber-400">+ Cadastrar Novo Devedor</option>
																	</select>
																)}

																{item.terceiro && item.terceiro_pago && item.vinculo_id && (
																	<div className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-1 rounded-lg text-center border border-emerald-100 dark:border-emerald-900/30 whitespace-nowrap mt-1">
																		✓ Pago (Auto-Conciliado)
																	</div>
																)}
															</div>
														)}
													</td>

													{/* REMOVER */}
													<td className="p-4 text-center">
														<button 
															onClick={() => removeItem(item.id)}
															className="p-2 text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-500 rounded-xl transition-colors cursor-pointer"
														>
															<X size={18} />
														</button>
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						</div>
					)}
				</div>
			)}



			{isAddContatoOpen && (
				<AddContatoWeb 
					onClose={() => setIsAddContatoOpen(null)}
					onSuccess={async (newId) => {
						await carregarDadosBase();
						updateItem(isAddContatoOpen, "contato_id", newId);
						setIsAddContatoOpen(null);
					}}
				/>
			)}
		</div>
	);
}
