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
	const [isAddCartaoOpen, setIsAddCartaoOpen] = useState(false);

	const [form, setForm] = useState({
		descricao: "",
		valor: "",
		data: new Date().toISOString().split("T")[0],
		categoria: "Outros",
		classificacao: "Variável",
		tipo: "", // Optional
		metodo_pagamento: initialCartaoId ? "Crédito" : "Débito",
		cartao_id: initialCartaoId,
		parcelas: "1",
	});

	const carregarCartoes = async () => {
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (user) {
			const data = await financeService.getCartoes(user.id);
			setCartoes(data || []);
		}
	};

	useEffect(() => {
		if (isOpen) {
			carregarCartoes();
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
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (!user) return;

		try {
			await financeService.addGasto(user.id, form);

			setForm({
				...form,
				descricao: "",
				valor: "",
				metodo_pagamento: "Débito",
			});

			onSuccess();
			onClose();
		} catch (e: any) {
			alert(e.message);
		}
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 bg-[#5D4037]/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
			<div className="bg-white w-full max-w-xl rounded-[40px] shadow-2xl overflow-hidden">
				{/* HEADER */}
				<div className="p-8 bg-pink-400 text-white flex justify-between items-center">
					<h3 className="text-2xl font-black flex items-center gap-2">
						<ShoppingBag /> Novo Gasto
					</h3>
					<button onClick={onClose}>
						<X />
					</button>
				</div>

				<div className="p-8 space-y-5">
					{/* 1. INFORMAÇÕES BÁSICAS */}
					<div className="space-y-4">
						<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">1. Informações Básicas</p>
						<input
							list="descricao-sugestoes"
							placeholder="O que você comprou?"
							className="w-full p-4 bg-[#FCF8F8] rounded-2xl font-bold border-2 border-transparent focus:border-pink-200 transition-all outline-none"
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
							className="w-full p-4 bg-[#FCF8F8] rounded-2xl font-bold border-2 border-transparent focus:border-pink-200 transition-all outline-none"
							value={form.data}
							onChange={(e) => setForm({ ...form, data: e.target.value })}
						/>
					</div>

					{/* 2. FORMA DE PAGAMENTO */}
					<div className="space-y-4">
						<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">2. Forma de Pagamento</p>
						<div className="flex gap-2">
							{[
								{ id: "Débito", icon: <Wallet size={18} /> },
								{ id: "Crédito", icon: <CreditCard size={18} /> },
								{ id: "Pix", icon: <Zap size={18} /> },
							].map((m) => (
								<button
									type="button"
									key={m.id}
									onClick={() => setForm({ ...form, metodo_pagamento: m.id })}
									className={`flex-1 p-3 sm:p-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${
										form.metodo_pagamento === m.id
											? "bg-pink-500 text-white shadow-lg scale-[1.02]"
											: "bg-[#FCF8F8] text-gray-400 hover:bg-pink-50 hover:text-pink-600"
									}`}>
									{m.icon} <span className="hidden sm:inline">{m.id}</span><span className="sm:hidden text-xs">{m.id}</span>
								</button>
							))}
						</div>
					</div>

					{/* 3. DETALHES DO VALOR (DINÂMICO) */}
					<div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
						<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">3. Detalhes do Gasto</p>
						
						{form.metodo_pagamento === "Crédito" ? (
							<div className="p-5 bg-pink-50 rounded-[32px] space-y-4 border border-pink-100">
								<div className="grid grid-cols-2 gap-3">
									<select
										className="p-4 rounded-2xl font-bold bg-white outline-none border-2 border-transparent focus:border-pink-300"
										value={form.cartao_id}
										onChange={(e) => setForm({ ...form, cartao_id: e.target.value })}>
										<option value="">Selecione o Cartão</option>
										{cartoes.map((c) => (
											<option key={c.id} value={c.id}>{c.nome}</option>
										))}
									</select>

									<input
										type="number"
										min="1"
										placeholder="Parcelas"
										className="p-4 rounded-2xl font-bold bg-white outline-none border-2 border-transparent focus:border-pink-300"
										value={form.parcelas}
										onChange={(e) => setForm({ ...form, parcelas: e.target.value })}
									/>
								</div>

								<input
									placeholder="Valor Total R$ 0,00"
									className="w-full p-5 bg-white rounded-2xl font-black text-pink-500 text-2xl border-2 border-transparent focus:border-pink-300 outline-none shadow-inner"
									value={form.valor}
									onChange={(e) => setForm({ ...form, valor: formatCurrency(e.target.value) })}
								/>

								{preview && (
									<div className="p-4 bg-white/80 rounded-2xl border border-pink-200 animate-in zoom-in duration-300">
										<div className="flex justify-between items-end">
											<div>
												<p className="text-[10px] font-bold text-gray-400 uppercase">Valor por Parcela</p>
												<p className="text-xl font-black text-pink-600">{preview.valor}</p>
											</div>
											<div className="text-right">
												<p className="text-[10px] font-bold text-gray-400 uppercase">Fim do Pagamento</p>
												<p className="text-sm font-black text-[#3D3030]">{preview.mesFinal}</p>
											</div>
										</div>
									</div>
								)}
							</div>
						) : (
							<input
								placeholder="Valor R$ 0,00"
								className="w-full p-6 bg-[#FCF8F8] rounded-3xl font-black text-pink-500 text-3xl border-2 border-transparent focus:border-pink-200 outline-none text-center"
								value={form.valor}
								onChange={(e) => setForm({ ...form, valor: formatCurrency(e.target.value) })}
							/>
						)}
					</div>

					{/* 4. CLASSIFICAÇÃO */}
					<div className="space-y-4">
						<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">4. Categorização</p>
						<div className="grid grid-cols-2 gap-3">
							<select
								className="p-4 bg-[#FCF8F8] rounded-2xl font-bold text-slate-700 outline-none border-2 border-transparent focus:border-pink-200 cursor-pointer"
								value={form.categoria}
								onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
								<option value="Outros">Categoria (Opcional)</option>
								{CATEGORIAS_PADRAO.map((c) => (
									<option key={c} value={c}>{c}</option>
								))}
							</select>

							<select
								className="p-4 bg-[#FCF8F8] rounded-2xl font-bold text-slate-700 outline-none border-2 border-transparent focus:border-pink-200 cursor-pointer"
								value={form.tipo}
								onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
								<option value="">Tipo do Gasto (Opcional)</option>
								{TIPOS_PADRAO.map((t) => (
									<option key={t} value={t}>{t}</option>
								))}
							</select>
						</div>
					</div>

					{/* BOTÃO FINAL */}
					<button
						onClick={handleSave}
						className="w-full bg-[#3D3030] text-white p-6 rounded-[30px] font-black text-xl shadow-2xl hover:bg-black transition-all active:scale-95 mt-4">
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
