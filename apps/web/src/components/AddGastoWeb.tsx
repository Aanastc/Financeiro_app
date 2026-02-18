import { useState, useEffect } from "react";
import {
	X,
	ShoppingBag,
	ChevronDown,
	CreditCard,
	Wallet,
	PlusCircle,
	CalendarDays,
} from "lucide-react";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import { AddCartaoWeb } from "./AddCartaoWeb"; // Importaremos abaixo

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
const TIPOS_PADRAO = ["Essencial", "Lazer", "Reserva"];

export function AddGastoWeb({
	isOpen,
	onClose,
	onSuccess,
	sugestoes = [],
}: any) {
	const [cartoes, setCartoes] = useState<any[]>([]);
	const [isAddCartaoOpen, setIsAddCartaoOpen] = useState(false);
	const [form, setForm] = useState({
		descricao: "",
		valor: "",
		data: new Date().toISOString().split("T")[0],
		categoria: "Outros",
		classificacao: "Variável",
		tipo: "Essencial",
		metodo_pagamento: "Débito",
		cartao_id: "",
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
		if (isOpen) carregarCartoes();
	}, [isOpen]);

	const formatCurrency = (v: string) => {
		const n = v.replace(/\D/g, "");
		return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(
			parseFloat(n) / 100,
		);
	};

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
				<div className="p-8 bg-pink-400 text-white flex justify-between items-center">
					<h3 className="text-2xl font-black flex items-center gap-2">
						<ShoppingBag /> Novo Gasto
					</h3>
					<button onClick={onClose}>
						<X />
					</button>
				</div>

				<div className="p-8 space-y-5">
					<input
						placeholder="Descrição..."
						className="w-full p-4 bg-[#FCF8F8] rounded-2xl font-bold"
						value={form.descricao}
						onChange={(e) => setForm({ ...form, descricao: e.target.value })}
					/>

					<div className="grid grid-cols-2 gap-4">
						<input
							placeholder="R$ 0,00"
							className="w-full p-4 bg-[#FCF8F8] rounded-2xl font-black text-pink-500 text-xl"
							value={form.valor}
							onChange={(e) =>
								setForm({ ...form, valor: formatCurrency(e.target.value) })
							}
						/>
						<input
							type="date"
							className="w-full p-4 bg-[#FCF8F8] rounded-2xl font-bold"
							value={form.data}
							onChange={(e) => setForm({ ...form, data: e.target.value })}
						/>
					</div>

					<div className="flex gap-2">
						{[
							{ id: "Débito", icon: <Wallet size={18} /> },
							{ id: "Crédito", icon: <CreditCard size={18} /> },
						].map((m) => (
							<button
								key={m.id}
								onClick={() => setForm({ ...form, metodo_pagamento: m.id })}
								className={`flex-1 p-4 rounded-2xl font-bold flex items-center justify-center gap-2 ${form.metodo_pagamento === m.id ? "bg-pink-500 text-white shadow-lg" : "bg-[#FCF8F8] text-gray-400"}`}>
								{m.icon} {m.id}
							</button>
						))}
					</div>

					{form.metodo_pagamento === "Crédito" && (
						<div className="p-4 bg-pink-50 rounded-3xl space-y-4">
							{cartoes.length === 0 ? (
								<button
									onClick={() => setIsAddCartaoOpen(true)}
									className="w-full p-4 border-2 border-dashed border-pink-300 rounded-2xl text-pink-500 font-bold flex items-center justify-center gap-2">
									<PlusCircle size={20} /> Cadastrar Cartão
								</button>
							) : (
								<div className="grid grid-cols-2 gap-4">
									<select
										className="p-3 rounded-xl font-bold bg-white outline-none border-2 border-transparent focus:border-pink-200"
										value={form.cartao_id}
										onChange={(e) =>
											setForm({ ...form, cartao_id: e.target.value })
										}>
										<option value="">Qual cartão?</option>
										{cartoes.map((c) => (
											<option key={c.id} value={c.id}>
												{c.nome}
											</option>
										))}
									</select>

									{/* Campo de Parcelas com ícone de quantidade (Hash) */}
									<div className="flex items-center bg-white rounded-xl px-3 border-2 border-transparent focus-within:border-pink-200">
										<span className="text-[10px] font-black text-pink-400 mr-1">
											X
										</span>
										<input
											type="number"
											min="1"
											placeholder="Parcelas"
											className="w-full p-2 font-bold outline-none bg-transparent"
											value={form.parcelas}
											onChange={(e) =>
												setForm({ ...form, parcelas: e.target.value })
											}
										/>
									</div>
								</div>
							)}
						</div>
					)}

					<div className="grid grid-cols-2 gap-4">
						<select
							className="p-4 bg-[#FCF8F8] rounded-2xl font-bold"
							value={form.categoria}
							onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
							{CATEGORIAS_PADRAO.map((c) => (
								<option key={c}>{c}</option>
							))}
						</select>
						<select
							className="p-4 bg-[#FCF8F8] rounded-2xl font-bold"
							value={form.tipo}
							onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
							{TIPOS_PADRAO.map((t) => (
								<option key={t}>{t}</option>
							))}
						</select>
					</div>

					<button
						onClick={handleSave}
						className="w-full bg-[#5D4037] text-white p-5 rounded-2xl font-black text-lg shadow-xl">
						SALVAR REGISTRO
					</button>
				</div>
			</div>
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
