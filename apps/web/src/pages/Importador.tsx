import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
	ArrowRightLeft,
	AlertCircle, 
	Users, 
	UserPlus, 
	CreditCard, 
	Building, 
	ShieldCheck, 
	AlertTriangle, 
	Calendar, 
	DollarSign, 
	Clock,
	ChevronDown,
	Plus,
	Check
} from "lucide-react";
import AddContatoWeb from "../components/AddContatoWeb";
import { motion } from "framer-motion";
import { useImportar, CATEGORIAS_PADRAO } from "../contexts/ImportarContext";

function CurrencyTableInput({ 
	value, 
	onChange, 
	textColorClass,
	badgeColorClass
}: { 
	value: number; 
	onChange: (val: number) => void; 
	textColorClass: string;
	badgeColorClass: string;
}) {
	const [isFocused, setIsFocused] = useState(false);
	const [localText, setLocalText] = useState("");

	const formatBRL = (val: number) => {
		return new Intl.NumberFormat("pt-BR", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(val || 0);
	};

	return (
		<div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 focus-within:border-indigo-500 dark:focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all min-w-[130px] max-w-[155px] shadow-2xs">
			<span className={`text-[11px] font-black select-none px-1.5 py-0.5 rounded-md ${badgeColorClass}`}>
				R$
			</span>
			<input 
				type="text" 
				inputMode="decimal"
				className={`w-full bg-transparent border-none outline-none font-black text-sm p-0 transition-colors ${textColorClass}`}
				value={isFocused ? localText : formatBRL(value)}
				onFocus={() => {
					setIsFocused(true);
					setLocalText(value ? value.toFixed(2).replace(".", ",") : "");
				}}
				onChange={(e) => {
					const text = e.target.value;
					setLocalText(text);
					const clean = text.replace(/[^\d,\.-]/g, "").replace(/\./g, "").replace(",", ".");
					const parsed = parseFloat(clean);
					if (!isNaN(parsed)) {
						onChange(parsed);
					} else if (text.trim() === "") {
						onChange(0);
					}
				}}
				onBlur={() => {
					setIsFocused(false);
				}}
			/>
		</div>
	);
}

function CategoryCreatableSelect({ 
	value, 
	onChange, 
	availableCategories,
	onAddCategory
}: { 
	value: string; 
	onChange: (val: string) => void; 
	availableCategories: string[];
	onAddCategory?: (val: string) => void;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [isTyping, setIsTyping] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number; openUp: boolean }>({
		top: 0,
		left: 0,
		width: 220,
		openUp: false
	});

	const updateDropdownPos = () => {
		if (containerRef.current) {
			const rect = containerRef.current.getBoundingClientRect();
			const spaceBelow = window.innerHeight - rect.bottom;
			const openUp = spaceBelow < 230 && rect.top > 230;
			setDropdownPos({
				top: openUp ? rect.top - 4 : rect.bottom + 4,
				left: rect.left,
				width: Math.max(rect.width, 224),
				openUp
			});
		}
	};

	useEffect(() => {
		if (isOpen) {
			updateDropdownPos();
			const handleScrollResize = () => updateDropdownPos();
			window.addEventListener("scroll", handleScrollResize, true);
			window.addEventListener("resize", handleScrollResize);
			return () => {
				window.removeEventListener("scroll", handleScrollResize, true);
				window.removeEventListener("resize", handleScrollResize);
			};
		}
	}, [isOpen]);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				containerRef.current && !containerRef.current.contains(e.target as Node) &&
				dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
			) {
				setIsOpen(false);
				setIsTyping(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const currentSearch = isTyping ? search : "";
	const filtered = availableCategories.filter(c => 
		c.toLowerCase().includes(currentSearch.toLowerCase().trim())
	);

	const exactMatch = availableCategories.some(
		c => c.toLowerCase() === (isTyping ? search : value).toLowerCase().trim()
	);

	const handleSelect = (cat: string) => {
		onChange(cat);
		setSearch(cat);
		setIsOpen(false);
		setIsTyping(false);
	};

	const handleCreateNew = (newCat: string) => {
		const trimmed = newCat.trim();
		if (!trimmed) return;
		if (onAddCategory) {
			onAddCategory(trimmed);
		}
		onChange(trimmed);
		setSearch(trimmed);
		setIsOpen(false);
		setIsTyping(false);
	};

	return (
		<div className="relative w-full min-w-[140px]" ref={containerRef}>
			<div className="relative flex items-center">
				<input
					type="text"
					value={isTyping ? search : value}
					onFocus={() => {
						setSearch(value);
						setIsTyping(true);
						setIsOpen(true);
					}}
					onChange={(e) => {
						setSearch(e.target.value);
						setIsTyping(true);
						setIsOpen(true);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							if (isTyping && search.trim()) {
								if (exactMatch) {
									const exact = availableCategories.find(c => c.toLowerCase() === search.toLowerCase().trim());
									handleSelect(exact || search.trim());
								} else if (filtered.length > 0 && filtered[0].toLowerCase().startsWith(search.toLowerCase().trim())) {
									handleSelect(filtered[0]);
								} else {
									handleCreateNew(search);
								}
							}
						} else if (e.key === "Escape") {
							setIsOpen(false);
							setIsTyping(false);
						}
					}}
					placeholder="Digitar categoria..."
					className="w-full bg-slate-50 dark:bg-slate-800 dark:text-slate-100 outline-none font-bold text-xs px-2.5 py-1.5 pr-6 rounded-xl border border-gray-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 cursor-text shadow-2xs transition-all"
				/>
				<button
					type="button"
					tabIndex={-1}
					onClick={() => {
						if (!isOpen) {
							setSearch("");
							setIsTyping(false);
						}
						setIsOpen(prev => !prev);
					}}
					className="absolute right-1.5 p-0.5 text-slate-400 hover:text-indigo-500 cursor-pointer"
				>
					<ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
				</button>
			</div>

			{isOpen && typeof document !== "undefined" && createPortal(
				<div 
					ref={dropdownRef}
					style={{
						position: "fixed",
						top: dropdownPos.openUp ? "auto" : `${dropdownPos.top}px`,
						bottom: dropdownPos.openUp ? `${window.innerHeight - dropdownPos.top}px` : "auto",
						left: `${dropdownPos.left}px`,
						width: `${dropdownPos.width}px`,
						zIndex: 99999
					}}
					className="max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-1 flex flex-col gap-0.5 animate-in fade-in duration-150"
				>
					{isTyping && search.trim() && !exactMatch && (
						<button
							type="button"
							onMouseDown={(e) => {
								e.preventDefault();
								handleCreateNew(search);
							}}
							className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-black bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 flex items-center gap-1.5 transition-colors cursor-pointer border border-indigo-200/50 dark:border-indigo-800/40"
						>
							<Plus size={13} />
							<span>Criar nova: "{search.trim()}"</span>
						</button>
					)}

					{filtered.map(cat => (
						<button
							key={cat}
							type="button"
							onMouseDown={(e) => {
								e.preventDefault();
								handleSelect(cat);
							}}
							className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-between ${
								cat.toLowerCase() === value.toLowerCase()
									? 'bg-indigo-500 text-white font-bold'
									: 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
							}`}
						>
							<span>{cat}</span>
							{cat.toLowerCase() === value.toLowerCase() && <Check size={12} />}
						</button>
					))}

					{filtered.length === 0 && (!isTyping || !search.trim()) && (
						<div className="px-2.5 py-2 text-[11px] text-slate-400 dark:text-slate-550 text-center italic">
							Nenhuma categoria encontrada
						</div>
					)}
				</div>,
				document.body
			)}
		</div>
	);
}

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
		dividasAtivas,
		globalConta,
		globalCartao,
		globalMetodoPagamento,
		dragActive,
		isAddContatoOpen,
		tipoDocumento,
		confiancaIA,
		resumoIA,
		dadosExtraidos,
		precisaConfirmacao,
		isDuplicateWarning,
		duplicateExistingDoc,
		categorias,
		adicionarCategoria,
		setGlobalConta,
		setGlobalCartao,
		setGlobalMetodoPagamento,
		applyGlobalConta,
		applyGlobalCartao,
		setDragActive,
		setIsAddContatoOpen,
		carregarDadosBase,
		processarArquivo,
		updateItem,
		removeItem,
		handleSaveAll,
		confirmarOperacaoEspecial,
		cancelarOperacaoEspecial,
		resetImport
	} = useImportar();

	// Estados locais para edição rápida na confirmação de dívidas/renegociações
	const [editPayload, setEditPayload] = useState<any>(null);

	// Atualizar os dados base ao montar (garante sincronia)
	useEffect(() => {
		carregarDadosBase();
	}, [carregarDadosBase]);

	useEffect(() => {
		if (dadosExtraidos) {
			setEditPayload({ ...dadosExtraidos });
		}
	}, [dadosExtraidos]);

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

	// Formatação amigável do tipo de documento
	const getTipoDocumentoLabel = (tipo: string | null) => {
		switch (tipo) {
			case "contrato_emprestimo": return "Contrato de Empréstimo";
			case "contrato_financiamento": return "Contrato de Financiamento";
			case "renegociacao_cartao": return "Renegociação de Cartão";
			case "fatura_cartao": return "Fatura de Cartão de Crédito";
			case "extrato_bancario": return "Extrato de Conta Corrente";
			case "comprovante_pagamento": return "Comprovante de Pagamento";
			case "comprovante_transferencia": return "Comprovante de Transferência";
			case "documento_investimento": return "Documento de Investimento";
			default: return "Documento Financeiro";
		}
	};

	return (
		<div className="space-y-6 sm:space-y-8 pb-20 transition-colors duration-250">
			{/* HEADER */}
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl sm:rounded-[40px] shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
				<div className="space-y-1">
					<div className="flex items-center gap-3">
						<div className="bg-indigo-100 dark:bg-indigo-950 p-2 rounded-xl text-indigo-600 dark:text-indigo-400">
							<Sparkles size={24} />
						</div>
						<h1 className="text-3xl font-black text-[#2D2424] dark:text-slate-100">Importador Inteligente com IA</h1>
					</div>
					<p className="text-gray-400 dark:text-slate-400 font-medium text-sm ml-12">
						Envie extratos, faturas, contratos de empréstimo ou renegociações para leitura e validação contábil automática.
					</p>
				</div>
			</div>

			{/* ALERTA DE IDEMPOTÊNCIA (DUPLICIDADE) */}
			{isDuplicateWarning && (
				<div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-2xl flex items-center justify-between gap-3 text-amber-800 dark:text-amber-300 animate-in fade-in">
					<div className="flex items-center gap-3">
						<AlertTriangle size={22} className="text-amber-600 dark:text-amber-400 shrink-0" />
						<div>
							<span className="font-black text-sm">Atenção: Idempotência de Arquivo Detectada</span>
							<p className="text-xs opacity-90">
								Este arquivo já foi importado com sucesso anteriormente{duplicateExistingDoc?.processado_em ? ` em ${new Date(duplicateExistingDoc.processado_em).toLocaleDateString('pt-BR')}` : ''}. O reprocessamento foi permitido para sua conferência.
							</p>
						</div>
					</div>
				</div>
			)}

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
						accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.xls,.ofx"
					/>
					
					<div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-950/30 rounded-full flex items-center justify-center text-indigo-500 dark:text-indigo-400 animate-bounce">
						<FileSearch size={40} />
					</div>
					
					<div className="text-center space-y-2">
						<h3 className="text-xl font-black text-[#2D2424] dark:text-slate-100">Arraste seu documento financeiro aqui</h3>
						<p className="text-gray-400 dark:text-slate-550 font-bold uppercase text-[10px] tracking-widest px-4">
							Extratos bancários, faturas de cartão, contratos de empréstimo e renegociação (PDF, PNG, JPG, CSV, OFX, EXCEL)
						</p>
					</div>

					<button className="px-8 py-3 bg-indigo-500 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 dark:shadow-none pointer-events-none">
						SELECIONAR ARQUIVO
					</button>
				</div>
			) : (
				<div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
					{/* BARRA SUPERIOR DO ARQUIVO CARREGADO COM CLASSIFICAÇÃO DA IA */}
					<div className="bg-white dark:bg-slate-900 p-6 rounded-[35px] border border-gray-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
						<div className="flex items-center gap-4">
							<div className="w-12 h-12 bg-indigo-500 text-white rounded-2xl flex items-center justify-center shrink-0">
								<FileCode size={24} />
							</div>
							<div>
								<h4 className="font-black text-[#2D2424] dark:text-slate-150 text-base">{file.name}</h4>
								<div className="flex flex-wrap items-center gap-2 mt-1">
									{tipoDocumento && (
										<span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-black text-[11px] px-2.5 py-1 rounded-lg border border-indigo-150 dark:border-indigo-900">
											📋 {getTipoDocumentoLabel(tipoDocumento)}
										</span>
									)}
									{confiancaIA > 0 && (
										<span className={`font-black text-[11px] px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
											confiancaIA >= 0.85 
												? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-150 dark:border-emerald-900' 
												: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-150 dark:border-amber-900'
										}`}>
											<ShieldCheck size={13} /> {Math.round(confiancaIA * 100)}% de Confiança
										</span>
									)}
									<span className="text-xs font-bold text-gray-400 dark:text-slate-550">
										{loading ? "Processando e validando..." : (resumoIA || `${preview.length} Lançamentos detectados`)}
									</span>
								</div>
							</div>
						</div>
						<button 
							onClick={resetImport}
							className="p-3 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-full text-gray-400 cursor-pointer self-end md:self-auto"
							title="Cancelar importação"
						>
							<X size={20} />
						</button>
					</div>

					{/* SPINNER DE LEITURA */}
					{loading ? (
						<div className="bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[40px] shadow-sm border border-gray-100 dark:border-slate-800 p-10 sm:p-20 flex flex-col items-center justify-center gap-4 transition-colors">
							<div className="relative w-48 h-48 flex items-center justify-center">
								<svg className="w-full h-full transform -rotate-90">
									<circle 
										cx="96" cy="96" r="80" 
										className="stroke-slate-100 dark:stroke-slate-800 fill-none" 
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
								<h3 className="text-lg font-black text-[#2D2424] dark:text-slate-150 animate-pulse">Classificando e Validando com IA</h3>
								<p className="text-xs text-gray-400 dark:text-slate-400 font-medium leading-relaxed">
									A IA está extraindo as informações e aplicando as regras de validação do domínio financeiro.
								</p>
							</div>
						</div>
					) : precisaConfirmacao && (tipoDocumento === "contrato_emprestimo" || tipoDocumento === "contrato_financiamento" || tipoDocumento === "renegociacao_cartao") ? (
						/* CARD ESPECIAL DE CONFIRMAÇÃO DE DÍVIDAS / EMPRÉSTIMOS / RENEGOCIAÇÃO */
						<div className="bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[40px] shadow-sm border border-gray-100 dark:border-slate-800 p-6 sm:p-10 transition-colors animate-in fade-in duration-300 space-y-6">
							<div className="flex items-start justify-between border-b border-gray-100 dark:border-slate-800 pb-6">
								<div className="space-y-1">
									<span className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">
										Confirmação de Obrigação Futura
									</span>
									<h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">
										{tipoDocumento === "renegociacao_cartao" ? "Renegociação de Cartão de Crédito" : "Contrato de Empréstimo / Financiamento"}
									</h2>
									<p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
										O sistema cadastrará a dívida e o cronograma de parcelas futuras. 
										<strong className="text-emerald-600 dark:text-emerald-400"> Nenhuma transação de saída imediata será criada no saldo da conta</strong>.
									</p>
								</div>
								<div className="bg-purple-50 dark:bg-purple-950/40 p-3 rounded-2xl text-purple-600 dark:text-purple-400">
									<DollarSign size={28} />
								</div>
							</div>

							{editPayload && (
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
									<div>
										<label className="text-xs font-black uppercase text-slate-400 dark:text-slate-500">Descrição</label>
										<input 
											type="text" 
											className="w-full mt-1 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold p-3 rounded-xl border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
											value={editPayload.descricao || ""}
											onChange={(e) => setEditPayload({ ...editPayload, descricao: e.target.value })}
										/>
									</div>

									<div>
										<label className="text-xs font-black uppercase text-slate-400 dark:text-slate-500">Instituição</label>
										<input 
											type="text" 
											className="w-full mt-1 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold p-3 rounded-xl border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
											value={editPayload.instituicao || ""}
											onChange={(e) => setEditPayload({ ...editPayload, instituicao: e.target.value })}
										/>
									</div>

									<div>
										<label className="text-xs font-black uppercase text-slate-400 dark:text-slate-500">Valor Original (Financiado)</label>
										<div className="relative mt-1">
											<span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-xs text-slate-400 dark:text-slate-500 select-none">
												R$
											</span>
											<input 
												type="number" 
												step="0.01"
												className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold pl-10 pr-3 py-3 rounded-xl border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
												value={editPayload.valor_original || 0}
												onChange={(e) => setEditPayload({ ...editPayload, valor_original: parseFloat(e.target.value) || 0 })}
											/>
										</div>
										{editPayload.valor_original > 0 && (
											<span className="text-[10px] font-bold text-slate-400 mt-1 block">
												{Number(editPayload.valor_original).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
											</span>
										)}
									</div>

									<div>
										<label className="text-xs font-black uppercase text-slate-400 dark:text-slate-500">Valor Total com Juros / CET</label>
										<div className="relative mt-1">
											<span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-xs text-slate-400 dark:text-slate-500 select-none">
												R$
											</span>
											<input 
												type="number" 
												step="0.01"
												className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold pl-10 pr-3 py-3 rounded-xl border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
												value={editPayload.valor_total_com_juros || editPayload.valor_original || 0}
												onChange={(e) => setEditPayload({ ...editPayload, valor_total_com_juros: parseFloat(e.target.value) || 0 })}
											/>
										</div>
										{(editPayload.valor_total_com_juros || editPayload.valor_original) > 0 && (
											<span className="text-[10px] font-bold text-slate-400 mt-1 block">
												{Number(editPayload.valor_total_com_juros || editPayload.valor_original).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
											</span>
										)}
									</div>

									<div>
										<label className="text-xs font-black uppercase text-slate-400 dark:text-slate-500">Quantidade de Parcelas</label>
										<input 
											type="number" 
											className="w-full mt-1 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold p-3 rounded-xl border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
											value={editPayload.quantidade_parcelas || 1}
											onChange={(e) => {
												const qtd = parseInt(e.target.value) || 1;
												setEditPayload({ ...editPayload, quantidade_parcelas: qtd });
											}}
										/>
									</div>

									<div>
										<label className="text-xs font-black uppercase text-slate-400 dark:text-slate-500">Valor da Parcela</label>
										<div className="relative mt-1">
											<span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-xs text-slate-400 dark:text-slate-500 select-none">
												R$
											</span>
											<input 
												type="number" 
												step="0.01"
												className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold pl-10 pr-3 py-3 rounded-xl border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
												value={editPayload.valor_parcela || 0}
												onChange={(e) => setEditPayload({ ...editPayload, valor_parcela: parseFloat(e.target.value) || 0 })}
											/>
										</div>
										{editPayload.valor_parcela > 0 && (
											<span className="text-[10px] font-bold text-slate-400 mt-1 block">
												{Number(editPayload.valor_parcela).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
											</span>
										)}
									</div>

									<div>
										<label className="text-xs font-black uppercase text-slate-400 dark:text-slate-500">Primeiro Vencimento</label>
										<input 
											type="date" 
											className="w-full mt-1 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold p-3 rounded-xl border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 text-sm cursor-pointer"
											value={editPayload.data_primeira_parcela || editPayload.data_contratacao || ""}
											onChange={(e) => setEditPayload({ ...editPayload, data_primeira_parcela: e.target.value })}
										/>
									</div>

									{/* Se for renegociação de cartão, seleciona cartão ou fatura de origem */}
									{tipoDocumento === "renegociacao_cartao" && cartoes.length > 0 && (
										<div>
											<label className="text-xs font-black uppercase text-slate-400 dark:text-slate-500">Cartão de Origem (Opcional)</label>
											<select 
												value={globalCartao || ""}
												onChange={(e) => applyGlobalCartao(e.target.value)}
												className="w-full mt-1 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold p-3 rounded-xl border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 text-sm cursor-pointer"
											>
												<option value="">Selecione o Cartão Renegociado</option>
												{cartoes.map(c => <option key={c.id} value={c.id}>💳 {c.nome}</option>)}
											</select>
										</div>
									)}
								</div>
							)}

							{/* CRONOGRAMA DE PARCELAS DETECTADO COM CORES DISTINTAS PARA PAGAS E PENDENTES */}
							{editPayload?.parcelas && editPayload.parcelas.length > 0 && (() => {
								const hojeStr = new Date().toISOString().split("T")[0];
								const totalPagas = editPayload.parcelas.filter((p: any) => p.status === "paga" || (!p.status && p.data_vencimento < hojeStr)).length;
								const totalPendentes = editPayload.parcelas.length - totalPagas;

								return (
									<div className="space-y-3 pt-4 border-t border-gray-100 dark:border-slate-800">
										<div className="flex flex-wrap items-center justify-between gap-3">
											<div>
												<h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
													Cronograma de Parcelas ({editPayload.parcelas.length} parcelas)
												</h4>
												<p className="text-[11px] text-slate-400 mt-0.5">
													Clique em qualquer parcela para alternar entre Paga e Pendente.
												</p>
											</div>

											{/* LEGENDA E CONTADORES */}
											<div className="flex items-center gap-3 text-xs font-bold">
												<span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800/60">
													<span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
													{totalPagas} Pagas (Anteriores)
												</span>
												<span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800/60">
													<span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block"></span>
													{totalPendentes} Pendentes (Futuras)
												</span>
											</div>
										</div>

										<div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
											{editPayload.parcelas.map((p: any, idx: number) => {
												const isPaga = p.status === "paga" || (!p.status && p.data_vencimento < hojeStr);

												return (
													<div 
														key={idx} 
														onClick={() => {
															const updatedParcelas = editPayload.parcelas.map((item: any, i: number) => {
																if (i === idx) {
																	const newStatus = isPaga ? "pendente" : "paga";
																	return { ...item, status: newStatus };
																}
																return item;
															});
															setEditPayload({ ...editPayload, parcelas: updatedParcelas });
														}}
														className={`p-3 rounded-2xl border transition-all cursor-pointer text-center select-none ${
															isPaga 
																? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700/60 shadow-sm shadow-emerald-500/10 hover:border-emerald-400' 
																: 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600'
														}`}
														title="Clique para alternar entre Paga e Pendente"
													>
														<div className="flex items-center justify-between gap-1 mb-1">
															<span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-550">
																#{p.numero_parcela}
															</span>
															<span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
																isPaga 
																	? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300' 
																	: 'bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400'
															}`}>
																{isPaga ? "✓ Paga" : "⏳ Pendente"}
															</span>
														</div>
														<span className={`block font-black text-xs ${isPaga ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-100'}`}>
															R$ {Number(p.valor).toFixed(2)}
														</span>
														<span className="block text-[10px] font-bold text-slate-400 mt-0.5">
															{p.data_vencimento}
														</span>
													</div>
												);
											})}
										</div>
									</div>
								);
							})()}

							{/* BOTÕES DE CONFIRMAÇÃO */}
							<div className="flex flex-wrap items-center justify-end gap-3 pt-6 border-t border-gray-100 dark:border-slate-800">
								<button 
									onClick={cancelarOperacaoEspecial}
									className="px-6 py-3 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-black text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
								>
									CANCELAR
								</button>
								<button 
									onClick={() => confirmarOperacaoEspecial(editPayload)}
									className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-sm shadow-lg shadow-indigo-600/20 transition-all cursor-pointer flex items-center gap-2"
								>
									<CheckCircle2 size={18} /> CONFIRMAR E CADASTRAR OBRIGAÇÃO
								</button>
							</div>
						</div>
					) : (
						/* TABELA REGULAR DE TRANSAÇÕES AUDITADAS (EXTRATO / FATURA) */
						<div className="bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[40px] shadow-sm border border-gray-100 dark:border-slate-800 transition-colors animate-in fade-in duration-300">
							{/* BARRA DE CONFIGURAÇÃO DE CONTA DO DOCUMENTO */}
							<div className="p-4 sm:p-6 border-b border-gray-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
								<div className="flex flex-wrap items-center gap-4 flex-1">
									<div className="flex items-center gap-2">
										<Building size={18} className="text-indigo-600 dark:text-indigo-400" />
										<span className="text-xs font-black uppercase text-slate-700 dark:text-slate-200 tracking-wider">Conta do Documento:</span>
									</div>
									<select 
										value={globalConta || ""}
										onChange={(e) => applyGlobalConta(e.target.value)}
										className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500 shadow-sm"
									>
										<option value="">Selecione a Conta Bancária</option>
										{contas.map(c => (
											<option key={c.id} value={c.id}>🏦 {c.nome} ({c.tipo_conta || 'Corrente'})</option>
										))}
									</select>

									{cartoes.length > 0 && (
										<div className="flex items-center gap-2">
											<CreditCard size={18} className="text-purple-600 dark:text-purple-400" />
											<span className="text-xs font-black uppercase text-slate-700 dark:text-slate-200 tracking-wider">Cartão (se fatura):</span>
											<select 
												value={globalCartao || ""}
												onChange={(e) => applyGlobalCartao(e.target.value)}
												className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-purple-500 shadow-sm"
											>
												<option value="">Nenhum (Extrato Bancário / Débito)</option>
												{cartoes.map(c => (
													<option key={c.id} value={c.id}>💳 {c.nome}</option>
												))}
											</select>
										</div>
									)}
								</div>

								<button 
									onClick={handleSaveAll}
									className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-sm flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20 cursor-pointer whitespace-nowrap"
								>
									<Save size={18} /> SALVAR IMPORTAÇÃO ({preview.filter(i => !i.ignorar).length})
								</button>
							</div>

							<div className="overflow-x-auto">
								<table className="w-full text-left">
									<thead className="bg-slate-50 dark:bg-slate-950">
										<tr className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase">
											<th className="p-3 w-24">Tipo</th>
											<th className="p-3 w-28">Data</th>
											<th className="p-3 min-w-[200px]">Descrição</th>
											<th className="p-3 w-32">Valor (R$)</th>
											<th className="p-3 min-w-[160px]">Categoria / Destino</th>
											<th className="p-3 min-w-[150px]">Conta / Cartão</th>
											<th className="p-3 min-w-[130px]">Terceiros (Dívida)</th>
											<th className="p-3 text-center w-12">Ação</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-gray-100 dark:divide-slate-800">
										{preview.map((item) => {
											if (item.ignorar) {
												const isTransfPropria = item.ignoredReason?.toLowerCase().includes("transferência") || item.tipo_transacao === "Transferencia";
												const isRepetido = item.ignoredReason?.startsWith("⚠️") || item.ignoredReason?.toLowerCase().includes("já lançado") || item.ignoredReason?.toLowerCase().includes("duplicad");

												return (
													<tr key={item.id} className={`transition-colors ${
														isRepetido 
															? 'bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-amber-500' 
															: isTransfPropria 
																? 'bg-indigo-50/40 dark:bg-indigo-950/20' 
																: 'bg-slate-50/50 dark:bg-slate-900/20 opacity-70'
													}`}>
														<td className="p-3" colSpan={6}>
															<div className="flex items-center justify-between gap-4">
																<div className="flex items-center gap-3">
																	<div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
																		isRepetido
																			? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
																			: isTransfPropria 
																				? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800' 
																				: 'bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400'
																	}`}>
																		{isRepetido ? <AlertTriangle size={16} /> : isTransfPropria ? <ArrowRightLeft size={16} /> : <CheckCircle2 size={16} />}
																	</div>
																	<div>
																		<div className="flex items-center gap-2 flex-wrap">
																			<span className="font-bold text-sm text-slate-800 dark:text-slate-200 line-through decoration-slate-400 break-words whitespace-normal">{item.descricao}</span>
																			<span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wide ${
																				isRepetido
																					? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/50'
																					: isTransfPropria 
																						? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-700/50' 
																						: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
																			}`}>
																				{isRepetido ? <AlertTriangle size={12} /> : isTransfPropria ? <ArrowRightLeft size={12} /> : "✅"} {item.ignoredReason}
																			</span>
																		</div>
																		<div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
																			<span>{item.data}</span>
																			<span>•</span>
																			<span className="font-bold text-slate-700 dark:text-slate-300">
																				R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
																			</span>
																			{isTransfPropria && (
																				<>
																					<span>•</span>
																					<span className="text-indigo-600 dark:text-indigo-400 font-medium italic">Mudança de conta (sem impacto no patrimônio líquido)</span>
																				</>
																			)}
																			{isRepetido && (
																				<>
																					<span>•</span>
																					<span className="text-amber-600 dark:text-amber-400 font-bold italic">Item já cadastrado no banco de dados (protegido contra duplicação)</span>
																				</>
																			)}
																		</div>
																	</div>
																</div>
																<div className="flex items-center gap-2 pr-2 shrink-0">
																	<button
																		type="button"
																		onClick={() => {
																			updateItem(item.id, "ignorar", false);
																			updateItem(item.id, "manualOverride", true);
																		}}
																		className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
																			isRepetido
																				? 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/50'
																				: 'border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50'
																		}`}
																		title={isRepetido ? "Restaurar mesmo já existindo no sistema" : "Restaurar e incluir lançamento no extrato"}
																	>
																		{isRepetido ? "Restaurar mesmo assim" : "Restaurar no Extrato"}
																	</button>
																</div>
															</div>
														</td>
														<td className="p-3 text-center">
															<button onClick={() => removeItem(item.id)} className="p-2 text-slate-300 hover:text-rose-500 rounded-xl transition-colors cursor-pointer" title="Remover da lista">
																<X size={18} />
															</button>
														</td>
													</tr>
												);
											}

											return (
												<tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
													{/* TIPO */}
													<td className="p-3">
														<div className="flex items-center gap-2">
															<button 
																onClick={() => {
																	const types: ('Gasto' | 'Entrada' | 'Meta' | 'Resgate' | 'Fatura' | 'PagamentoFatura' | 'Transferencia')[] = ['Gasto', 'Entrada', 'Meta', 'Resgate', 'Fatura', 'PagamentoFatura', 'Transferencia'];
																	let currIndex = types.indexOf(item.tipo_transacao as any);
																	if (currIndex === -1) currIndex = 0;
																	const nextType = types[(currIndex + 1) % types.length];
																	updateItem(item.id, "tipo_transacao", nextType);
																	if (nextType === "Fatura") {
																		updateItem(item.id, "metodo_pagamento", "Crédito");
																		if (!item.cartao_id && cartoes.length > 0) updateItem(item.id, "cartao_id", cartoes[0].id);
																	} else if (nextType === "Gasto" || nextType === "Entrada" || nextType === "Resgate" || nextType === "Meta" || nextType === "Transferencia") {
																		updateItem(item.id, "metodo_pagamento", "Débito");
																		updateItem(item.id, "cartao_id", "");
																		if (!item.conta_id && contas.length > 0) updateItem(item.id, "conta_id", contas[0].id);
																		if (nextType === "Transferencia") {
																			updateItem(item.id, "categoria", "Transferência Interna");
																			updateItem(item.id, "ignorar", true);
																			updateItem(item.id, "ignoredReason", "Transferência entre contas próprias (não altera patrimônio)");
																		}
																	}
																}}
																className={`p-2 rounded-xl flex items-center gap-1 font-bold text-xs transition-colors cursor-pointer ${
																	item.tipo_transacao === "Gasto" 
																		? 'bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400' 
																		: item.tipo_transacao === "Entrada" 
																			? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' 
																			: item.tipo_transacao === "Meta" 
																				? 'bg-pink-100 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400' 
																				: item.tipo_transacao === "Resgate" 
																					? 'bg-cyan-100 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400' 
																					: item.tipo_transacao === "Transferencia" 
																						? 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400' 
																						: item.tipo_transacao === "PagamentoFatura" 
																							? 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400' 
																							: 'bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400'
																}`}
															>
																{item.tipo_transacao === "Gasto" ? (
																	<ArrowDownRight size={14}/>
																) : item.tipo_transacao === "Entrada" || item.tipo_transacao === "Resgate" ? (
																	<ArrowUpRight size={14}/>
																) : item.tipo_transacao === "Meta" ? (
																	<CheckCircle2 size={14}/>
																) : item.tipo_transacao === "Transferencia" ? (
																	<ArrowRightLeft size={14}/>
																) : (
																	<CreditCard size={14}/>
																)}
																{item.tipo_transacao === "PagamentoFatura" 
																	? "Pgto Fatura" 
																	: item.tipo_transacao === "Fatura" 
																		? "Fatura" 
																		: item.tipo_transacao === "Transferencia" 
																			? "Transferência" 
																			: item.tipo_transacao === "Meta"
																				? "Aplicação / Meta"
																				: item.tipo_transacao === "Resgate"
																					? "Resgate RDB"
																					: item.tipo_transacao}
															</button>
														</div>
													</td>

													{/* DATA */}
													<td className="p-3">
														<input 
															type="date" 
															className="bg-transparent border-none outline-none font-bold text-xs text-slate-700 dark:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 transition-colors"
															value={item.data}
															onChange={(e) => updateItem(item.id, "data", e.target.value)}
														/>
													</td>

													{/* DESCRIÇÃO */}
													<td className="p-3">
														<div className="flex flex-col gap-1 max-w-[280px]">
															<textarea 
																rows={1}
																className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-2 font-bold text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 break-words whitespace-normal resize-none overflow-hidden"
																value={item.descricao}
																onChange={(e) => {
																	updateItem(item.id, "descricao", e.target.value);
																	e.target.style.height = "auto";
																	e.target.style.height = `${e.target.scrollHeight}px`;
																}}
																onFocus={(e) => {
																	e.target.style.height = "auto";
																	e.target.style.height = `${e.target.scrollHeight}px`;
																}}
															/>
															{item.total_parcelas > 1 && (
																<span className="text-[10px] font-black text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800/50 inline-flex items-center gap-1 w-fit">
																	💳 Parcela {item.parcela_atual || 1}/{item.total_parcelas} (gerará ciclo completo)
																</span>
															)}
															{item.nome_terceiro && (
																<span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
																	Favorecido: {item.nome_terceiro}
																</span>
															)}
														</div>
													</td>

													{/* VALOR */}
													<td className="p-3">
														<CurrencyTableInput 
															value={item.valor}
															onChange={(val) => updateItem(item.id, "valor", val)}
															badgeColorClass={
																item.tipo_transacao === 'Entrada' 
																	? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' 
																	: item.tipo_transacao === 'Meta' 
																		? 'bg-pink-100 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300' 
																		: (item.tipo_transacao === 'PagamentoFatura' || item.tipo_transacao === 'Fatura')
																			? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
																			: item.tipo_transacao === 'Transferencia'
																				? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
																				: 'bg-slate-200 dark:bg-slate-700/80 text-slate-700 dark:text-slate-300'
															}
															textColorClass={
																item.tipo_transacao === 'Entrada' 
																	? 'text-emerald-600 dark:text-emerald-400' 
																	: item.tipo_transacao === 'Meta' 
																		? 'text-pink-600 dark:text-pink-400' 
																		: (item.tipo_transacao === 'PagamentoFatura' || item.tipo_transacao === 'Fatura')
																			? 'text-purple-600 dark:text-purple-400'
																			: item.tipo_transacao === 'Transferencia'
																				? 'text-indigo-600 dark:text-indigo-400'
																				: 'text-slate-800 dark:text-slate-100'
															}
														/>
													</td>

													{/* CATEGORIA / DESTINO */}
													<td className="p-3 min-w-[150px]">
														{item.tipo_transacao === "Meta" ? (
															<select 
																className="w-full bg-pink-50 dark:bg-pink-950/20 border border-pink-100 dark:border-pink-900/30 outline-none font-bold text-xs text-pink-700 dark:text-pink-400 p-2 rounded-lg cursor-pointer animate-in fade-in duration-200"
																value={item.meta_id || ""}
																onChange={(e) => updateItem(item.id, "meta_id", e.target.value)}
															>
																<option value="">🎯 Selecionar Meta</option>
																{metas.map(m => <option key={m.id} value={m.id}>🎯 {m.titulo}</option>)}
															</select>
														) : (
															<CategoryCreatableSelect 
																value={item.categoria}
																onChange={(val) => updateItem(item.id, "categoria", val)}
																availableCategories={categorias || CATEGORIAS_PADRAO}
																onAddCategory={(newCat) => adicionarCategoria(newCat)}
															/>
														)}
													</td>

													{/* CONTA / CARTÃO */}
													<td className="p-3 min-w-[140px]">
														{item.tipo_transacao !== "Transferencia" && (item.tipo_transacao === "Fatura" || item.tipo_transacao === "PagamentoFatura" || item.metodo_pagamento === "Crédito" || (tipoDocumento === "fatura_cartao" && item.cartao_id)) ? (
															<div className="flex flex-col gap-1">
																<div className="flex items-center justify-between">
																	<span className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-tight flex items-center gap-1">
																		<CreditCard size={12} /> Cartão
																	</span>
																	<button 
																		type="button" 
																		onClick={() => {
																			updateItem(item.id, "tipo_transacao", "Gasto");
																			updateItem(item.id, "metodo_pagamento", "Débito");
																			updateItem(item.id, "cartao_id", "");
																			if (contas.length > 0) updateItem(item.id, "conta_id", contas[0].id);
																		}}
																		className="text-[9px] text-slate-400 hover:text-indigo-500 font-bold cursor-pointer underline"
																		title="Mudar para Conta Bancária"
																	>
																		p/ Conta
																	</button>
																</div>
																<select
																	className="w-full bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 outline-none font-bold text-xs p-1.5 rounded-lg border border-purple-200 dark:border-purple-800 cursor-pointer"
																	value={item.cartao_id || ""}
																	onChange={(e) => {
																		updateItem(item.id, "cartao_id", e.target.value);
																		if (e.target.value) {
																			updateItem(item.id, "metodo_pagamento", "Crédito");
																			updateItem(item.id, "conta_id", "");
																		}
																	}}
																>
																	<option value="">Selecionar Cartão</option>
																	{cartoes.map(c => <option key={c.id} value={c.id}>💳 {c.nome}</option>)}
																</select>
															</div>
														) : (
															<div className="flex flex-col gap-1">
																<div className="flex items-center justify-between">
																	<span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-tight flex items-center gap-1">
																		<Building size={12} /> Conta
																	</span>
																	{cartoes.length > 0 && item.tipo_transacao !== "Transferencia" && (
																		<button 
																			type="button" 
																			onClick={() => {
																				updateItem(item.id, "metodo_pagamento", "Crédito");
																				updateItem(item.id, "conta_id", "");
																				if (cartoes.length > 0) updateItem(item.id, "cartao_id", cartoes[0].id);
																			}}
																			className="text-[9px] text-slate-400 hover:text-purple-500 font-bold cursor-pointer underline"
																			title="Mudar para Cartão de Crédito"
																		>
																			p/ Cartão
																		</button>
																	)}
																</div>
																<select
																	className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none font-bold text-xs p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 cursor-pointer"
																	value={item.conta_id || ""}
																	onChange={(e) => {
																		updateItem(item.id, "conta_id", e.target.value);
																		if (e.target.value) {
																			updateItem(item.id, "metodo_pagamento", "Débito");
																			updateItem(item.id, "cartao_id", "");
																		}
																	}}
																>
																	<option value="">Selecione Conta</option>
																	{contas.map(c => <option key={c.id} value={c.id}>🏦 {c.nome}</option>)}
																</select>
															</div>
														)}
													</td>

													{/* TERCEIROS */}
													<td className="p-3 min-w-[130px]">
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
