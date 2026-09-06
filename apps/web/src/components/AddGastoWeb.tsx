import { useState, useEffect } from "react";
import { X, ShoppingBag, CreditCard, Wallet, Zap } from "lucide-react";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import { AddCartaoWeb } from "./AddCartaoWeb";

const CATEGORIAS_PADRAO = [
	"Moradia",
	"Alimentação",
	"Transporte",
	"Saúde",
	"Lazer",
	"Educação",
	"Assinaturas",
	"Presente",
	"Estetica e Comercio",
	"Emprestimo",
	"Outros",
];

const TIPOS_PADRAO = ["Renda fixa (essencial)", "Renda variável", "Lazer"];

export function AddGastoWeb({
	isOpen,
	onClose,
	onSuccess,
	sugestoes = [],
	initialCartaoId = "",
}: any) {
	const [cartoes, setCartoes] = useState<any[]>([]);
	const [contatos, setContatos] = useState<any[]>([]);
	const [contas, setContas] = useState<any[]>([]);
	const [isAddCartaoOpen, setIsAddCartaoOpen] = useState(false);

	const [form, setForm] = useState({
		descricao: "",
		valor: "",
		data: new Date().toISOString().split("T")[0],
		categoria: "Outros",
		classificacao: "Variável",
		tipo: "", // Optional
		metodo_pagamento: initialCartaoId ? "Crédito" : "Débito/Pix",
		cartao_id: initialCartaoId,
		conta_id: "",
		parcelas: "1",
		terceiro: false,
		contato_id: "",
	});

	const carregarDados = async () => {
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (user) {
			const [cartoesData, contasData, contatosData] = await Promise.all([
				financeService.getCartoes(user.id),
				financeService.getContasBancarias(user.id),
				supabase.from("contatos").select("*").eq("usuario_id", user.id).order("nome")
			]);
			setCartoes(cartoesData || []);
			setContas(contasData || []);
			setContatos(contatosData.data || []);
			
			// Se o usuário tiver só uma conta, já seleciona ela por padrão
			if (contasData && contasData.length === 1) {
				setForm(prev => ({ ...prev, conta_id: contasData[0].id }));
			}
		}
	};

	useEffect(() => {
		if (isOpen) {
			carregarDados();
			setForm(prev => ({
				...prev,
				cartao_id: initialCartaoId || prev.cartao_id,
				metodo_pagamento: initialCartaoId ? "Crédito" : prev.metodo_pagamento
			}));
		}
	}, [isOpen, initialCartaoId]);

	const formatCurrency = (v: string) => {
		const n = v.replace(/\D/g, "");
		return new Intl.NumberFormat("pt-BR", {
			minimumFractionDigits: 2,
		}).format(parseFloat(n || "0") / 100);
	};

	// Cálculos de Parcelamento em tempo real
	const previewParcelamento = () => {
		if (form.metodo_pagamento !== "Crédito") return null;
		const valorTotal = parseFloat(form.valor.replace(/\./g, "").replace(",", ".")) || 0;
		const numParcelas = parseInt(form.parcelas) || 1;
		if (numParcelas <= 1) return null;

		const valorParcela = valorTotal / numParcelas;
		const dataFinal = new Date(form.data + "T12:00:00");
		dataFinal.setMonth(dataFinal.getMonth() + (numParcelas - 1));

		const mesFinal = dataFinal.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

		return {
			valor: valorParcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
			mesFinal: mesFinal.charAt(0).toUpperCase() + mesFinal.slice(1)
		};
	};

	const preview = previewParcelamento();

	const handleSave = async () => {
		if (form.metodo_pagamento !== "Crédito" && !form.conta_id) {
			alert("Por favor, selecione uma Conta Bancária.");
			return;
		}
		if (form.metodo_pagamento === "Crédito" && !form.cartao_id) {
			alert("Por favor, selecione um Cartão de Crédito.");
			return;
		}

		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (!user) return;

		try {
			await financeService.addGasto(user.id, {
				...form,
				terceiro: form.terceiro,
				contato_id: form.terceiro && form.contato_id ? form.contato_id : null,
			});

			setForm({
				...form,
				descricao: "",
				valor: "",
				metodo_pagamento: "Débito/Pix",
				terceiro: false,
				contato_id: "",
			});

			onSuccess();
			onClose();
		} catch (e: any) {
			alert(e.message);
		}
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-300" role="dialog" aria-modal="true">
			<div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-3xl sm:rounded-[40px] shadow-2xl overflow-hidden max-h-[95vh] sm:max-h-[90vh] flex flex-col border border-slate-100 dark:border-slate-800 transition-colors duration-200">
				{/* HEADER */}
				<div className="p-5 sm:p-6 bg-rose-500 dark:bg-slate-950 text-white flex justify-between items-center shrink-0">
					<h3 className="text-lg sm:text-xl font-black flex items-center gap-2">
						<ShoppingBag className="w-5 h-5 text-rose-300 dark:text-rose-400" /> Novo Gasto
					</h3>
					<button onClick={onClose} className="hover:bg-slate-700 dark:hover:bg-slate-800 p-1.5 rounded-full transition-colors cursor-pointer text-white">
						<X className="w-5 h-5" />
					</button>
				</div>

				<div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
					{/* 1. INFORMAÇÕES BÁSICAS */}
					<div className="space-y-3">
						<p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">1. Informações Básicas</p>
						<input
							list="descricao-sugestoes"
							placeholder="O que você comprou?"
							className="w-full p-4 bg-slate-50 dark:bg-slate-850 text-slate-700 dark:text-slate-200 rounded-2xl font-bold border border-slate-200 dark:border-slate-700 focus:border-rose-500 transition-colors outline-none text-sm"
							value={form.descricao}
							onChange={(e) => setForm({ ...form, descricao: e.target.value })}
						/>
						<datalist id="descricao-sugestoes">
							{sugestoes.map((s: string) => (
								<option key={s} value={s} />
							))}
						</datalist>

						<input
							type="date"
							className="w-full p-4 bg-slate-50 dark:bg-slate-850 text-slate-700 dark:text-slate-200 rounded-2xl font-bold border border-slate-200 dark:border-slate-700 focus:border-rose-500 transition-colors outline-none text-sm"
							value={form.data}
							onChange={(e) => setForm({ ...form, data: e.target.value })}
						/>
					</div>

					{/* 2. FORMA DE PAGAMENTO */}
					<div className="space-y-2">
						<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-2">2. Forma de Pagamento</label>
						<div className="flex gap-2">
							{[
								{ id: "Débito/Pix", icon: <Wallet size={16} /> },
								{ id: "Crédito", icon: <CreditCard size={16} /> },
							].map((m) => (
								<button
									type="button"
									key={m.id}
									onClick={() => setForm({ ...form, metodo_pagamento: m.id })}
									className={`flex-1 p-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all cursor-pointer text-sm ${
										form.metodo_pagamento === m.id
											? "bg-rose-500 text-white shadow-lg shadow-rose-200/20 dark:shadow-none scale-[1.01]"
											: "bg-slate-50 dark:bg-slate-850 text-slate-400 dark:text-slate-500 hover:bg-rose-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700"
									}`}>
									{m.icon} <span>{m.id}</span>
								</button>
							))}
						</div>
					</div>

					{/* 3. DETALHES DO VALOR (DINÂMICO) */}
					<div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
						<label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-2">3. Detalhes do Gasto</label>
						
						{form.metodo_pagamento === "Crédito" ? (
							<div className="p-4 bg-rose-500/10 dark:bg-rose-500/5 rounded-3xl space-y-4 border border-rose-500/20">
								<div className="grid grid-cols-2 gap-3">
									<div className="space-y-1.5">
										<label className="text-[9px] font-black uppercase text-rose-500 dark:text-rose-400 ml-2">Selecione o Cartão</label>
										<select
											className="w-full p-3.5 rounded-2xl font-bold bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-200 outline-none border border-slate-200 dark:border-slate-700 focus:border-rose-500 text-sm cursor-pointer"
											value={form.cartao_id}
											onChange={(e) => setForm({ ...form, cartao_id: e.target.value })}>
											<option value="">Selecione...</option>
											{cartoes.map((c) => (
												<option key={c.id} value={c.id}>{c.nome}</option>
											))}
										</select>
									</div>

									<div className="space-y-1.5">
										<label className="text-[9px] font-black uppercase text-rose-500 dark:text-rose-400 ml-2">Nº de Parcelas</label>
										<input
											type="number"
											min="1"
											placeholder="Ex: 12"
											className="w-full p-3.5 rounded-2xl font-bold bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-200 outline-none border border-slate-200 dark:border-slate-700 focus:border-rose-500 text-sm"
											value={form.parcelas}
											onChange={(e) => setForm({ ...form, parcelas: e.target.value })}
										/>
									</div>
								</div>

								<div className="space-y-1.5">
									<label className="text-[9px] font-black uppercase text-rose-500 dark:text-rose-400 ml-2">Valor Total do Gasto</label>
									<input
										placeholder="Valor Total R$ 0,00"
										className="w-full p-4.5 bg-white dark:bg-slate-850 rounded-2xl font-black text-rose-500 dark:text-rose-400 text-2xl border border-slate-200 dark:border-slate-700 focus:border-rose-500 outline-none"
										value={form.valor}
										onChange={(e) => setForm({ ...form, valor: formatCurrency(e.target.value) })}
									/>
								</div>

								{preview && (
									<div className="p-4 bg-white/80 dark:bg-slate-900/80 rounded-2xl border border-rose-500/20 animate-in zoom-in duration-300">
										<div className="flex justify-between items-end">
											<div>
												<p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Parcelamento</p>
												<p className="text-base sm:text-lg font-black text-rose-500">
													{form.parcelas}x de {preview.valor}
												</p>
											</div>
											<div className="text-right">
												<p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Fim do Pagamento</p>
												<p className="text-xs font-black text-slate-700 dark:text-slate-200">{preview.mesFinal}</p>
											</div>
										</div>
									</div>
								)}
							</div>
						) : (
							<div className="space-y-3">
								<div className="space-y-1.5">
									<label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2">Conta Bancária Origem</label>
									<select
										className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl font-bold text-slate-700 dark:text-slate-200 outline-none border border-slate-200 dark:border-slate-700 focus:border-rose-500 cursor-pointer text-sm"
										value={form.conta_id}
										onChange={(e) => setForm({ ...form, conta_id: e.target.value })}>
										<option value="">Selecione de onde saiu o dinheiro...</option>
										{contas.map((c) => (
											<option key={c.id} value={c.id}>{c.nome}</option>
										))}
									</select>
								</div>
								
								<div className="space-y-1.5">
									<label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 ml-2">Valor do Gasto</label>
									<input
										placeholder="Valor R$ 0,00"
										className="w-full p-5 bg-slate-50 dark:bg-slate-850 rounded-3xl font-black text-rose-500 dark:text-rose-400 text-3xl border border-slate-200 dark:border-slate-700 focus:border-rose-500 outline-none text-center"
										value={form.valor}
										onChange={(e) => setForm({ ...form, valor: formatCurrency(e.target.value) })}
									/>
								</div>
							</div>
						)}
					</div>

					{/* 4. CLASSIFICAÇÃO */}
					<div className="space-y-3">
						<p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">4. Categorização</p>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<select
								className="p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl font-bold text-slate-700 dark:text-slate-200 outline-none border border-slate-200 dark:border-slate-700 focus:border-rose-500 cursor-pointer text-sm"
								value={form.categoria}
								onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
								<option value="Outros">Categoria (Opcional)</option>
								{CATEGORIAS_PADRAO.map((c) => (
									<option key={c} value={c}>{c}</option>
								))}
							</select>

							<select
								className="p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl font-bold text-slate-700 dark:text-slate-200 outline-none border border-slate-200 dark:border-slate-700 focus:border-rose-500 cursor-pointer text-sm"
								value={form.tipo}
								onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
								<option value="">Tipo do Gasto (Opcional)</option>
								{TIPOS_PADRAO.map((t) => (
									<option key={t} value={t}>{t}</option>
								))}
							</select>
						</div>
					</div>

					{/* 5. RESPONSÁVEL PELO GASTO */}
					<div className="space-y-3">
						<p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">5. Responsável pelo Gasto</p>
						<div className="bg-slate-50 dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
							<label className="flex items-center gap-3 cursor-pointer">
								<input 
									type="checkbox" 
									className="w-4 h-4 rounded text-rose-500 border-slate-300 focus:ring-rose-500"
									checked={form.terceiro} 
									onChange={(e) => setForm({ ...form, terceiro: e.target.checked })} 
								/>
								<span className="font-bold text-sm text-slate-750 dark:text-slate-200">Este gasto foi de outra pessoa? (Terceiro deve)</span>
							</label>
							
							{form.terceiro && (
								<div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
									<label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 ml-1">Quem deve pagar?</label>
									<select
										className="w-full p-3.5 rounded-2xl font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 outline-none border border-slate-200 dark:border-slate-700 focus:border-rose-500 text-sm cursor-pointer"
										value={form.contato_id}
										onChange={(e) => setForm({ ...form, contato_id: e.target.value })}
									>
										<option value="">Selecione um contato...</option>
										{contatos.map((c) => (
											<option key={c.id} value={c.id}>{c.nome}</option>
										))}
									</select>
								</div>
							)}
						</div>
					</div>

					{/* BOTÃO FINAL */}
					<button
						onClick={handleSave}
						className="w-full bg-rose-500 hover:bg-rose-600 dark:bg-rose-600 dark:hover:bg-rose-700 text-white p-4.5 rounded-2xl font-black text-sm shadow-xl hover:shadow-rose-200/30 dark:shadow-none transition-all mt-4 cursor-pointer uppercase shrink-0">
						SALVAR REGISTRO
					</button>
				</div>
			</div>

			{/* MODAL CARTÃO */}
			<AddCartaoWeb
				isOpen={isAddCartaoOpen}
				onClose={() => setIsAddCartaoOpen(false)}
				onSuccess={() => {
					setIsAddCartaoOpen(false);
					carregarCartoes();
				}}
			/>
		</div>
	);
}
