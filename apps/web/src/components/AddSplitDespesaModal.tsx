import { useState, useEffect } from "react";
import { X, DollarSign, Split, Users, Calendar, CreditCard, Wallet, Check, AlertCircle, Sparkles, MessageSquare, Plus } from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";
import { financeService } from "../../../../packages/services/finance.service";
import toast from "react-hot-toast";

interface AddSplitDespesaModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess: () => void;
	onOpenAddContato: () => void;
}

export default function AddSplitDespesaModal({ isOpen, onClose, onSuccess, onOpenAddContato }: AddSplitDespesaModalProps) {
	const [loading, setLoading] = useState(false);
	const [userId, setUserId] = useState<string>("");
	const [contatos, setContatos] = useState<any[]>([]);
	const [cartoes, setCartoes] = useState<any[]>([]);
	const [contas, setContas] = useState<any[]>([]);
	const [categorias, setCategorias] = useState<any[]>([]);

	// Form
	const [descricao, setDescricao] = useState("");
	const [valorTotalStr, setValorTotalStr] = useState("");
	const [data, setData] = useState(() => new Date().toISOString().split("T")[0]);
	const [contatoId, setContatoId] = useState("");
	const [categoriaId, setCategoriaId] = useState("");
	const [formaPagamento, setFormaPagamento] = useState<"CONTA" | "CARTAO">("CONTA");
	const [contaId, setContaId] = useState("");
	const [cartaoId, setCartaoId] = useState("");

	// Splitwise settings
	const [pagoPor, setPagoPor] = useState<"VOCE" | "CONTATO">("VOCE");
	const [metodoDivisao, setMetodoDivisao] = useState<"IGUAL" | "EXATO" | "PORCENTAGEM" | "TOTAL_CONTATO" | "TOTAL_VOCE">("IGUAL");
	
	// Custom inputs
	const [minhaParteStr, setMinhaParteStr] = useState("");
	const [parteContatoStr, setParteContatoStr] = useState("");
	const [minhaPorcentagem, setMinhaPorcentagem] = useState(50);
	const [contatoPorcentagem, setContatoPorcentagem] = useState(50);

	// Dados do contato selecionado
	const [contatoSelecionado, setContatoSelecionado] = useState<any>(null);
	const [contatoTemContaNoApp, setContatoTemContaNoApp] = useState(false);

	const loadInitialData = async () => {
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) return;
			setUserId(user.id);

			const [contatosRes, cartoesRes, contasRes, categoriasRes] = await Promise.all([
				supabase.from("contatos").select("*").eq("usuario_id", user.id).order("nome"),
				financeService.getCartoes(user.id).catch(() => []),
				financeService.getContas(user.id).catch(() => []),
				financeService.getCategorias(user.id).catch(() => [])
			]);

			const cList = contatosRes.data || [];
			setContatos(cList);
			setCartoes(cartoesRes || []);
			setContas(contasRes || []);
			setCategorias(categoriasRes || []);

			if (contasRes && contasRes.length > 0) setContaId(contasRes[0].id);
			if (cartoesRes && cartoesRes.length > 0) setCartaoId(cartoesRes[0].id);
			if (cList.length > 0 && !contatoId) {
				setContatoId(cList[0].id);
			}
		} catch (e) {
			console.error(e);
		}
	};

	useEffect(() => {
		if (isOpen) {
			loadInitialData();
		}
	}, [isOpen]);

	// Atualizar status do contato quando mudar a seleção
	useEffect(() => {
		const contato = contatos.find(c => c.id === contatoId);
		setContatoSelecionado(contato || null);

		if (contato?.email) {
			supabase
				.from("usuarios")
				.select("id, nome, email")
				.eq("email", contato.email.trim().toLowerCase())
				.maybeSingle()
				.then(({ data }) => {
					setContatoTemContaNoApp(!!data);
				});
		} else {
			setContatoTemContaNoApp(false);
		}
	}, [contatoId, contatos]);

	if (!isOpen) return null;

	const valorTotal = parseFloat(valorTotalStr.replace(/\./g, "").replace(",", ".")) || 0;

	// Cálculo das cotas
	let minhaCota = 0;
	let cotaContato = 0;

	if (metodoDivisao === "IGUAL") {
		minhaCota = Math.round((valorTotal / 2) * 100) / 100;
		cotaContato = Math.round((valorTotal - minhaCota) * 100) / 100;
	} else if (metodoDivisao === "EXATO") {
		minhaCota = parseFloat(minhaParteStr.replace(/\./g, "").replace(",", ".")) || 0;
		cotaContato = parseFloat(parteContatoStr.replace(/\./g, "").replace(",", ".")) || 0;
	} else if (metodoDivisao === "PORCENTAGEM") {
		minhaCota = Math.round((valorTotal * (minhaPorcentagem / 100)) * 100) / 100;
		cotaContato = Math.round((valorTotal - minhaCota) * 100) / 100;
	} else if (metodoDivisao === "TOTAL_CONTATO") {
		minhaCota = 0;
		cotaContato = valorTotal;
	} else if (metodoDivisao === "TOTAL_VOCE") {
		minhaCota = valorTotal;
		cotaContato = 0;
	}

	const diferencaExato = Math.abs(valorTotal - (minhaCota + cotaContato));
	const somaBate = valorTotal > 0 && diferencaExato < 0.05;

	// Saldo resultante para o usuário
	// Se você pagou: o amigo te deve a cota dele (positivo a receber)
	// Se o amigo pagou: você deve a sua cota ao amigo (negativo a pagar)
	const valorAReceber = pagoPor === "VOCE" ? cotaContato : 0;
	const valorAPagar = pagoPor === "CONTATO" ? minhaCota : 0;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!descricao.trim()) {
			toast.error("Informe a descrição da despesa");
			return;
		}
		if (valorTotal <= 0) {
			toast.error("Informe um valor total válido maior que zero");
			return;
		}
		if (!contatoId) {
			toast.error("Selecione um contato para dividir");
			return;
		}
		if (metodoDivisao === "EXATO" && !somaBate) {
			toast.error(`A soma das partes (R$ ${(minhaCota + cotaContato).toFixed(2)}) não confere com o total (R$ ${valorTotal.toFixed(2)})`);
			return;
		}

		setLoading(true);
		try {
			const contatoNome = contatoSelecionado?.nome || "Contato";
			
			// Metadados Splitwise
			const splitMetadata = {
				is_split: true,
				descricao_original: descricao,
				valor_total: valorTotal,
				minha_cota: minhaCota,
				cota_contato: cotaContato,
				pago_por: pagoPor,
				metodo_divisao: metodoDivisao,
				contato_id: contatoId,
				contato_nome: contatoNome,
				contato_email: contatoSelecionado?.email || null,
				contato_tem_conta: contatoTemContaNoApp,
				criado_em: new Date().toISOString()
			};

			if (pagoPor === "VOCE") {
				// Você pagou: registra a transação com a parte que o contato deve como terceiro = true
				const { error: txError } = await supabase.from("transacoes").insert([{
					usuario_id: userId,
					tipo: "DESPESA",
					descricao: `${descricao} (Parte ${contatoNome})`,
					valor: cotaContato,
					data,
					categoria_id: categoriaId || null,
					conta_id: formaPagamento === "CONTA" ? contaId || null : null,
					cartao_id: formaPagamento === "CARTAO" ? cartaoId || null : null,
					terceiro: true,
					terceiro_pago: false,
					contato_id: contatoId,
					observacao: JSON.stringify(splitMetadata),
					status: "confirmada"
				}]);

				if (txError) throw txError;
			} else {
				// O contato pagou: você deve a sua cota ao contato
				const { error: txError } = await supabase.from("transacoes").insert([{
					usuario_id: userId,
					tipo: "DESPESA",
					descricao: `${descricao} - ${contatoNome}`,
					valor: minhaCota,
					data,
					categoria_id: categoriaId || null,
					terceiro: false,
					terceiro_pago: false,
					observacao: JSON.stringify({
						...splitMetadata,
						parceria_credor_id: contatoId,
						parceria_credor_nome: contatoNome
					}),
					status: "confirmada"
				}]);

				if (txError) throw txError;
			}

			toast.success("Despesa dividida com sucesso!");
			onSuccess();
			onClose();
		} catch (err: any) {
			console.error(err);
			toast.error("Erro ao salvar divisão: " + (err.message || "Erro desconhecido"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
			<div className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-800 flex flex-col max-h-[95vh]">
				{/* HEADER */}
				<div className="p-6 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 text-white flex justify-between items-center shrink-0">
					<div className="flex items-center gap-3">
						<div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center backdrop-blur-xs">
							<Split size={24} className="text-white" />
						</div>
						<div>
							<h2 className="text-xl font-black">Dividir Despesa (Split)</h2>
							<p className="text-emerald-100 text-xs font-semibold">Divisão inteligente de contas estilo Splitwise</p>
						</div>
					</div>
					<button onClick={onClose} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer">
						<X size={20} />
					</button>
				</div>

				{/* FORM */}
				<form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 scrollbar-thin">
					{/* Descrição e Valor */}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ml-1">Descrição</label>
							<input
								type="text"
								required
								placeholder="Ex: Jantar, Mercado, Uber"
								value={descricao}
								onChange={e => setDescricao(e.target.value)}
								className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
								autoFocus
							/>
						</div>

						<div className="space-y-1.5">
							<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ml-1">Valor Total (R$)</label>
							<input
								type="text"
								required
								placeholder="0,00"
								value={valorTotalStr}
								onChange={e => setValorTotalStr(e.target.value)}
								className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-black text-emerald-600 dark:text-emerald-400 text-lg outline-none focus:ring-2 focus:ring-emerald-500"
							/>
						</div>
					</div>

					{/* Contato & Data */}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<div className="flex justify-between items-center ml-1">
								<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Com quem dividir?</label>
								<button
									type="button"
									onClick={onOpenAddContato}
									className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
								>
									<Plus size={12} /> Novo Contato
								</button>
							</div>
							<select
								value={contatoId}
								onChange={e => setContatoId(e.target.value)}
								className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
							>
								{contatos.map(c => (
									<option key={c.id} value={c.id}>
										{c.nome} {c.email ? `(${c.email})` : ""}
									</option>
								))}
							</select>
							{contatoSelecionado && (
								<div className="text-[10px] font-bold mt-1 ml-1 flex items-center gap-1.5">
									{contatoTemContaNoApp ? (
										<span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
											<span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
											Usuário no App (Atualização Dinâmica Ativa)
										</span>
									) : (
										<span className="text-slate-400 flex items-center gap-1">
											<span className="w-2 h-2 rounded-full bg-slate-300" />
											Sem conta conectada (Poderá enviar convite)
										</span>
									)}
								</div>
							)}
						</div>

						<div className="space-y-1.5">
							<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ml-1">Data</label>
							<input
								type="date"
								required
								value={data}
								onChange={e => setData(e.target.value)}
								className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
							/>
						</div>
					</div>

					{/* Quem pagou? */}
					<div className="space-y-2">
						<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ml-1">Quem pagou a conta?</label>
						<div className="grid grid-cols-2 gap-3">
							<button
								type="button"
								onClick={() => setPagoPor("VOCE")}
								className={`p-3.5 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
									pagoPor === "VOCE"
										? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-sm"
										: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
								}`}
							>
								<Check size={16} className={pagoPor === "VOCE" ? "opacity-100 text-emerald-600" : "opacity-0"} />
								Eu paguei o total
							</button>

							<button
								type="button"
								onClick={() => setPagoPor("CONTATO")}
								className={`p-3.5 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
									pagoPor === "CONTATO"
										? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-sm"
										: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
								}`}
							>
								<Check size={16} className={pagoPor === "CONTATO" ? "opacity-100 text-indigo-600" : "opacity-0"} />
								{contatoSelecionado?.nome || "O amigo"} pagou
							</button>
						</div>
					</div>

					{/* Método de Divisão */}
					<div className="space-y-2">
						<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ml-1">Como dividir?</label>
						<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
							{[
								{ id: "IGUAL", label: "Meio a Meio (50%)" },
								{ id: "EXATO", label: "Valores Exatos" },
								{ id: "PORCENTAGEM", label: "Porcentagem %" },
								{ id: pagoPor === "VOCE" ? "TOTAL_CONTATO" : "TOTAL_VOCE", label: "100% Devedor" }
							].map(item => (
								<button
									key={item.id}
									type="button"
									onClick={() => setMetodoDivisao(item.id as any)}
									className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
										metodoDivisao === item.id
											? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 shadow-xs"
											: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
									}`}
								>
									{item.label}
								</button>
							))}
						</div>

						{/* Campos do método EXATO */}
						{metodoDivisao === "EXATO" && (
							<div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 mt-2">
								<div className="space-y-1">
									<label className="text-[10px] font-bold text-slate-400">Minha Parte (R$)</label>
									<input
										type="number"
										step="0.01"
										placeholder="0,00"
										value={minhaParteStr}
										onChange={e => setMinhaParteStr(e.target.value)}
										className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none"
									/>
								</div>
								<div className="space-y-1">
									<label className="text-[10px] font-bold text-slate-400">Parte do {contatoSelecionado?.nome || "Amigo"} (R$)</label>
									<input
										type="number"
										step="0.01"
										placeholder="0,00"
										value={parteContatoStr}
										onChange={e => setParteContatoStr(e.target.value)}
										className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none"
									/>
								</div>
								{!somaBate && valorTotal > 0 && (
									<p className="col-span-2 text-xs font-bold text-rose-500 mt-1">
										Soma atual: R$ {(minhaCota + cotaContato).toFixed(2)} de R$ {valorTotal.toFixed(2)}
									</p>
								)}
							</div>
						)}

						{/* Campos do método PORCENTAGEM */}
						{metodoDivisao === "PORCENTAGEM" && (
							<div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 mt-2">
								<div className="space-y-1">
									<label className="text-[10px] font-bold text-slate-400">Minha %</label>
									<input
										type="number"
										min="0"
										max="100"
										value={minhaPorcentagem}
										onChange={e => {
											const val = Math.max(0, Math.min(100, Number(e.target.value)));
											setMinhaPorcentagem(val);
											setContatoPorcentagem(100 - val);
										}}
										className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none"
									/>
								</div>
								<div className="space-y-1">
									<label className="text-[10px] font-bold text-slate-400">% do {contatoSelecionado?.nome || "Amigo"}</label>
									<input
										type="number"
										min="0"
										max="100"
										value={contatoPorcentagem}
										onChange={e => {
											const val = Math.max(0, Math.min(100, Number(e.target.value)));
											setContatoPorcentagem(val);
											setMinhaPorcentagem(100 - val);
										}}
										className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none"
									/>
								</div>
							</div>
						)}
					</div>

					{/* RESUMO DA DIVISÃO */}
					<div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-2">
						<p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Resumo da Partilha</p>
						<div className="flex justify-between items-center text-xs font-bold text-slate-600 dark:text-slate-300">
							<span>Sua parte no gasto:</span>
							<span className="font-black text-slate-800 dark:text-slate-100">R$ {minhaCota.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
						</div>
						<div className="flex justify-between items-center text-xs font-bold text-slate-600 dark:text-slate-300">
							<span>Parte de {contatoSelecionado?.nome || "Amigo"}:</span>
							<span className="font-black text-slate-800 dark:text-slate-100">R$ {cotaContato.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
						</div>
						<div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-sm font-black">
							{pagoPor === "VOCE" ? (
								<>
									<span className="text-emerald-600 dark:text-emerald-400">Você recebe de {contatoSelecionado?.nome || "Amigo"}:</span>
									<span className="text-emerald-600 dark:text-emerald-400 text-base">R$ {valorAReceber.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
								</>
							) : (
								<>
									<span className="text-rose-600 dark:text-rose-400">Você deve pagar a {contatoSelecionado?.nome || "Amigo"}:</span>
									<span className="text-rose-600 dark:text-rose-400 text-base">R$ {valorAPagar.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
								</>
							)}
						</div>
					</div>

					{/* BUTTON */}
					<div className="pt-2 shrink-0">
						<button
							type="submit"
							disabled={loading}
							className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-xl shadow-emerald-100 dark:shadow-none disabled:opacity-50 cursor-pointer text-sm uppercase"
						>
							<Check size={18} />
							{loading ? "SALVANDO DIVISÃO..." : "CONFIRMAR DIVISÃO"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

