import InputMoeda from "./InputMoeda";
import { useState, useEffect } from "react";
import { X, TrendingUp, Save, Target, Building2, Percent } from "lucide-react";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import {
	INDEXADORES,
	PRODUTOS_INVESTIMENTO,
	corretoraComMeta,
	instituicaoDoInvestimento,
	metaIdDoInvestimento,
	type Indexador,
} from "../../../../packages/utils/investimentos";
import { toast } from "react-hot-toast";

interface AddInvestimentoProps {
	onClose: () => void;
	onSuccess: () => void;
	/** Quando informado, o formulário edita este investimento */
	investimento?: any | null;
}

const CAMPO =
	"w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-green-500 outline-none transition-all font-bold text-slate-700 dark:text-slate-200 text-sm";
const ROTULO = "text-xs font-bold text-slate-500 dark:text-slate-400 ml-2 flex items-center gap-1";

const moedaParaNumero = (v: string) => parseFloat(String(v).replace(/\./g, "").replace(",", "."));
const numeroParaMoeda = (v: any) =>
	v === null || v === undefined || v === "" ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AddInvestimentoWeb({ onClose, onSuccess, investimento }: AddInvestimentoProps) {
	const editando = Boolean(investimento?.id);
	const [loading, setLoading] = useState(false);
	const [metas, setMetas] = useState<any[]>([]);
	const [form, setForm] = useState({
		titulo: investimento?.titulo || "",
		tipo: investimento?.tipo || "CDB",
		valor_investido: numeroParaMoeda(investimento?.valor_investido),
		valor_atual: numeroParaMoeda(investimento?.valor_atual),
		data_inicio: investimento?.data_inicio || new Date().toISOString().split("T")[0],
		corretora: instituicaoDoInvestimento(investimento?.corretora),
		meta_id: metaIdDoInvestimento(investimento?.corretora) || "",
		indexador: (investimento?.indexador || "") as Indexador | "",
		taxa: investimento?.taxa != null ? String(investimento.taxa).replace(".", ",") : "",
		vencimento: investimento?.vencimento || "",
		liquidez_diaria: Boolean(investimento?.liquidez_diaria),
	});

	useEffect(() => {
		const loadMetas = async () => {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) return;
			const { data } = await supabase.from("metas").select("id, titulo").eq("usuario_id", user.id).order("titulo");
			setMetas(data || []);
		};
		loadMetas().catch(console.error);
	}, []);

	const indexadorSel = INDEXADORES.find(i => i.valor === form.indexador);
	// Produtos de mercado não têm taxa fixa: não exibe o bloco de rentabilidade
	const rendaVariavel = ["Ações", "FIIs", "Criptomoedas"].includes(form.tipo);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const valorInvestido = moedaParaNumero(form.valor_investido);
		const valorAtual = form.valor_atual ? moedaParaNumero(form.valor_atual) : valorInvestido;
		if (!form.titulo.trim() || !Number.isFinite(valorInvestido) || valorInvestido < 0 || !form.data_inicio) {
			toast.error("Preencha nome, valor aplicado e data.");
			return;
		}
		const taxa = form.taxa ? Number(form.taxa.replace(",", ".")) : null;
		if (taxa !== null && !Number.isFinite(taxa)) {
			toast.error("Rentabilidade inválida.");
			return;
		}

		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) throw new Error("Usuário não autenticado");

			const dados: any = {
				titulo: form.titulo.trim(),
				tipo: form.tipo,
				valor_investido: valorInvestido,
				valor_atual: Number.isFinite(valorAtual) ? valorAtual : valorInvestido,
				data_inicio: form.data_inicio,
				corretora: corretoraComMeta(form.corretora, form.meta_id || null),
				indexador: rendaVariavel ? null : form.indexador || null,
				taxa: rendaVariavel || !indexadorSel?.pedeTaxa ? null : taxa,
				vencimento: form.vencimento || null,
				liquidez_diaria: form.liquidez_diaria,
			};

			if (editando) {
				await financeService.updateInvestimento(user.id, investimento.id, dados);
				toast.success("Investimento atualizado!");
			} else {
				await financeService.addInvestimento(user.id, dados);
				toast.success("Investimento adicionado!");
			}
			onSuccess();
			onClose();
		} catch (error: any) {
			toast.error("Erro ao salvar: " + (error?.message || "tente novamente"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true">
			<div className="bg-white dark:bg-slate-900 p-6 sm:p-10 rounded-3xl sm:rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-2xl w-full max-w-lg relative animate-in fade-in zoom-in duration-200 flex flex-col max-h-[95vh] sm:max-h-[90vh]">
				<button
					type="button"
					onClick={onClose}
					aria-label="Fechar"
					className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors bg-slate-50 dark:bg-slate-800 p-2 rounded-full cursor-pointer z-10"
				>
					<X size={20} />
				</button>

				<div className="flex items-center gap-4 mb-6 shrink-0">
					<div className="w-12 h-12 bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400 rounded-2xl flex items-center justify-center">
						<TrendingUp size={24} />
					</div>
					<div>
						<h2 className="text-xl font-black text-slate-800 dark:text-slate-100">{editando ? "Editar Investimento" : "Novo Investimento"}</h2>
						<p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Onde está o dinheiro e quanto rende</p>
					</div>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 pr-1 scrollbar-thin">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className={ROTULO}>Nome</label>
							<input
								type="text"
								required
								className={CAMPO}
								placeholder="Ex: CDB Liquidez Diária"
								value={form.titulo}
								onChange={e => setForm({ ...form, titulo: e.target.value })}
							/>
						</div>
						<div className="space-y-1.5">
							<label className={ROTULO}>Produto</label>
							<select className={`${CAMPO} cursor-pointer`} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
								{/* Mantém tipos antigos (ex.: "Renda Fixa") que já estejam salvos */}
								{!PRODUTOS_INVESTIMENTO.includes(form.tipo) && <option value={form.tipo}>{form.tipo}</option>}
								{PRODUTOS_INVESTIMENTO.map(p => (
									<option key={p} value={p}>{p}</option>
								))}
							</select>
						</div>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className={ROTULO}><Building2 size={12} /> Instituição</label>
							<input
								type="text"
								className={CAMPO}
								placeholder="Ex: Banco, corretora"
								value={form.corretora}
								onChange={e => setForm({ ...form, corretora: e.target.value })}
							/>
						</div>
						<div className="space-y-1.5">
							<label className={ROTULO}><Target size={12} /> Meta vinculada</label>
							<select className={`${CAMPO} cursor-pointer`} value={form.meta_id} onChange={e => setForm({ ...form, meta_id: e.target.value })}>
								<option value="">Nenhuma meta</option>
								{metas.map(m => (
									<option key={m.id} value={m.id}>{m.titulo}</option>
								))}
							</select>
						</div>
					</div>

					{!rendaVariavel && (
						<fieldset className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
							<legend className="px-2 text-xs font-black text-slate-500 dark:text-slate-400 flex items-center gap-1">
								<Percent size={12} /> Rentabilidade
							</legend>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
								<select
									className={`${CAMPO} cursor-pointer`}
									value={form.indexador}
									onChange={e => setForm({ ...form, indexador: e.target.value as Indexador | "" })}
									aria-label="Indexador"
								>
									<option value="">Não informar</option>
									{INDEXADORES.map(i => (
										<option key={i.valor} value={i.valor}>{i.rotulo}</option>
									))}
								</select>
								{indexadorSel?.pedeTaxa && (
									<div className="relative">
										<input
											type="text"
											inputMode="decimal"
											className={`${CAMPO} pr-24`}
											placeholder={form.indexador === "CDI" ? "Ex: 102" : "Ex: 6,5"}
											value={form.taxa}
											onChange={e => setForm({ ...form, taxa: e.target.value.replace(/[^\d,.]/g, "") })}
											aria-label="Taxa"
										/>
										<span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{indexadorSel.sufixoTaxa}</span>
									</div>
								)}
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
								<div className="space-y-1">
									<label className="text-[11px] font-bold text-slate-400 ml-2">Vencimento (opcional)</label>
									<input type="date" className={CAMPO} value={form.vencimento} onChange={e => setForm({ ...form, vencimento: e.target.value })} />
								</div>
								<label className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300 cursor-pointer sm:mt-5">
									<input
										type="checkbox"
										className="w-4 h-4 accent-green-600"
										checked={form.liquidez_diaria}
										onChange={e => setForm({ ...form, liquidez_diaria: e.target.checked })}
									/>
									Liquidez diária
								</label>
							</div>
						</fieldset>
					)}

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className={ROTULO}>Valor aplicado (R$)</label>
							<InputMoeda
								required
								className={`${CAMPO} text-green-700 dark:text-green-400`}
								value={form.valor_investido}
								onChange={(v) => setForm({ ...form, valor_investido: v })}
							/>
						</div>
						<div className="space-y-1.5">
							<label className={ROTULO}>Data da aplicação</label>
							<input
								type="date"
								required
								className={CAMPO}
								value={form.data_inicio}
								onChange={e => setForm({ ...form, data_inicio: e.target.value })}
							/>
						</div>
					</div>

					{editando && (
						<div className="space-y-1.5">
							<label className={ROTULO}>Saldo atual (R$)</label>
							<InputMoeda
								className={CAMPO}
								value={form.valor_atual}
								onChange={(v) => setForm({ ...form, valor_atual: v })}
							/>
						</div>
					)}

					<div className="pt-4 flex gap-4 shrink-0">
						<button
							type="button"
							onClick={onClose}
							className="flex-1 py-4 font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-colors cursor-pointer text-sm"
						>
							CANCELAR
						</button>
						<button
							type="submit"
							disabled={loading}
							className="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-100 dark:shadow-none disabled:opacity-50 cursor-pointer text-sm"
						>
							<Save size={20} />
							{loading ? "SALVANDO..." : editando ? "SALVAR" : "ADICIONAR"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
