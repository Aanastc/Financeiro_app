import InputMoeda from "./InputMoeda";
import React, { useState, useEffect } from "react";
import { X,  Calendar, Palette, Edit3, Info } from "lucide-react";
import { financeService } from "../../../../packages/services/finance.service";
import toast from "react-hot-toast";
import { supabase } from "../../../../packages/services/supabase";
import { getFaturaMesReferencia } from "../../../../packages/utils/cartao.utils";

/** Primeiro dia de compra que já cai na fatura seguinte à que está aberta hoje (dias atuais do cartão). */
function inicioDaProximaFatura(cartao: any): string {
	const f = Number(cartao?.fechamento_dia || 1);
	const v = Number(cartao?.vencimento_dia || 1);
	const hoje = new Date();
	const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	const aberta = getFaturaMesReferencia(iso(hoje), f, v, cartao);
	const d = new Date(hoje);
	for (let i = 0; i < 62; i++) {
		d.setDate(d.getDate() + 1);
		if (getFaturaMesReferencia(iso(d), f, v, cartao) !== aberta) return iso(d);
	}
	return iso(d);
}

interface EditCartaoModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess: () => void;
	cartao: any;
}

export default function EditCartaoModal({ isOpen, onClose, onSuccess, cartao }: EditCartaoModalProps) {
	const [loading, setLoading] = useState(false);
	// Mudou o fechamento/vencimento: vale para as próximas faturas, a partir de uma data, ou para tudo?
	const [aplicarDias, setAplicarDias] = useState<"proximas" | "data" | "tudo">("proximas");
	const [dataMudanca, setDataMudanca] = useState("");
	const [form, setForm] = useState({
		nome: "",
		limite: "",
		vencimento_dia: "10",
		fechamento_dia: "3",
		cor_hex: "#6366f1",
	});

	useEffect(() => {
		if (cartao && isOpen) {
			setForm({
				nome: cartao.nome || "",
				limite: formatCurrency(String((cartao.limite || 0) * 100)), // Converts back to display format
				vencimento_dia: String(cartao.vencimento_dia || 10),
				fechamento_dia: String(cartao.fechamento_dia || 3),
				cor_hex: cartao.cor_hex || "#6366f1",
			});
			setAplicarDias("proximas");
			setDataMudanca(inicioDaProximaFatura(cartao));
		}
	}, [cartao, isOpen]);

	if (!isOpen || !cartao) return null;

	const diasMudaram =
		(parseInt(form.vencimento_dia) || 1) !== Number(cartao.vencimento_dia) ||
		(parseInt(form.fechamento_dia) || 1) !== Number(cartao.fechamento_dia);
	const inicioProxima = inicioDaProximaFatura(cartao);
	const dataBr = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

	const formatCurrency = (v: string) => {
		const n = v.replace(/\D/g, "");
		const result = new Intl.NumberFormat("pt-BR", {
			minimumFractionDigits: 2,
		}).format(parseFloat(n || "0") / 100);
		return result === "NaN" ? "" : result;
	};

    const handleDayChange = (field: "vencimento_dia" | "fechamento_dia", value: string) => {
        let numericValue = value.replace(/\D/g, "");
        if (numericValue !== "") {
            const num = parseInt(numericValue, 10);
            numericValue = num > 31 ? "31" : (num < 1 ? "1" : num.toString());
        }
        setForm(prev => ({ ...prev, [field]: numericValue }));
    };

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) throw new Error("Usuário não autenticado");

			const limiteNumerico = parseFloat(form.limite.replace(/\./g, "").replace(",", "."));

			// Dias novos só daqui para frente: guarda os antigos e a data da troca, para as faturas
			// passadas continuarem como o banco fechou. "Em tudo" recalcula o histórico com os dias novos.
			let ciclo: Record<string, any> = {};
			if (diasMudaram) {
				if (aplicarDias === "tudo") {
					ciclo = { ciclo_anterior_fechamento: null, ciclo_anterior_vencimento: null, ciclo_mudou_em: null };
				} else {
					const desde = aplicarDias === "data" ? dataMudanca : inicioProxima;
					if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || "")) throw new Error("Escolha a data a partir da qual valem os novos dias.");
					ciclo = {
						ciclo_anterior_fechamento: Number(cartao.fechamento_dia) || null,
						ciclo_anterior_vencimento: Number(cartao.vencimento_dia) || null,
						ciclo_mudou_em: desde,
					};
				}
			}

			await financeService.updateCartao(user.id, cartao.id, {
				nome: form.nome,
				limite: limiteNumerico,
				vencimento_dia: parseInt(form.vencimento_dia) || 1,
				fechamento_dia: parseInt(form.fechamento_dia) || 1,
				cor_hex: form.cor_hex,
				...ciclo,
			});

			toast.success("Cartão atualizado com sucesso!");
			onSuccess();
			onClose();
		} catch (error: any) {
			console.error(error);
			toast.error(error?.message?.startsWith("Escolha") ? error.message : "Erro ao atualizar cartão.");
		} finally {
			setLoading(false);
		}
	};

	const PREDEFINED_COLORS = [
		"#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", 
		"#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#1e293b"
	];

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true">
			<div className="bg-white dark:bg-slate-900 p-6 sm:p-10 rounded-3xl sm:rounded-[40px] shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-800 relative animate-in fade-in zoom-in duration-200 flex flex-col max-h-[95vh] sm:max-h-[90vh]">
				<button
					type="button"
					onClick={onClose}
					className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors bg-slate-50 dark:bg-slate-800 p-2 rounded-full cursor-pointer"
				>
					<X size={20} />
				</button>

				<div className="text-center mb-8 shrink-0">
					<div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-3">
						<Edit3 size={28} />
					</div>
					<h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Editar Cartão</h2>
					<p className="text-slate-500 dark:text-slate-400 mt-1 font-medium text-sm">Atualize as informações do seu cartão</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-5 overflow-y-auto flex-1 pr-1 scrollbar-thin">
					<div className="space-y-1.5">
						<label className="text-xs font-bold text-slate-600 dark:text-slate-300 ml-2">Nome do Cartão</label>
						<input
							type="text"
							required
							value={form.nome}
							onChange={e => setForm({...form, nome: e.target.value})}
							className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 dark:text-slate-200 text-sm"
							placeholder="Ex: Nubank, Itaú..."
						/>
					</div>

					<div className="space-y-1.5">
						<label className="text-xs font-bold text-slate-600 dark:text-slate-300 ml-2">Limite Total (R$)</label>
						<InputMoeda
							required
							value={form.limite}
							onChange={(v) => setForm({...form, limite: v})}
							className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-indigo-500 outline-none transition-all font-bold text-emerald-600 dark:text-emerald-400 text-2xl"
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className="text-xs font-bold text-slate-600 dark:text-slate-300 ml-2 flex items-center gap-1">
								<Calendar size={12} /> Vencimento (Dia)
							</label>
							<input
								type="number"
								required
								min="1"
								max="31"
								value={form.vencimento_dia}
								onChange={e => handleDayChange("vencimento_dia", e.target.value)}
								className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 dark:text-slate-200 text-center text-sm"
							/>
						</div>
						<div className="space-y-1.5">
							<label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2 flex items-center gap-1">
								<Calendar size={12} /> Fechamento (Dia)
							</label>
							<input
								type="number"
								min="1"
								max="31"
								value={form.fechamento_dia}
								onChange={e => handleDayChange("fechamento_dia", e.target.value)}
								className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 text-center text-sm outline-none focus:border-indigo-500 transition-colors"
							/>
						</div>
					</div>

					{diasMudaram && (
						<fieldset className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/40 space-y-2">
							<legend className="sr-only">A partir de quando valem os novos dias</legend>
							<p className="text-xs font-black text-amber-800 dark:text-amber-300">
								Você mudou o fechamento/vencimento ({cartao.fechamento_dia}/{cartao.vencimento_dia} → {form.fechamento_dia || "?"}/{form.vencimento_dia || "?"}). A partir de quando vale?
							</p>
							<label className="flex items-start gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
								<input type="radio" name="aplicarDias" checked={aplicarDias === "proximas"} onChange={() => setAplicarDias("proximas")} className="mt-0.5 accent-indigo-600" />
								<span>Das próximas faturas <span className="font-medium text-slate-500 dark:text-slate-400">(compras a partir de {dataBr(inicioProxima)}; as faturas já fechadas ficam como estão)</span></span>
							</label>
							<label className="flex items-start gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
								<input type="radio" name="aplicarDias" checked={aplicarDias === "data"} onChange={() => setAplicarDias("data")} className="mt-0.5 accent-indigo-600" />
								<span className="flex flex-wrap items-center gap-2">
									De uma data específica
									{aplicarDias === "data" && (
										<input
											type="date"
											value={dataMudanca}
											onChange={(e) => setDataMudanca(e.target.value)}
											className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-100"
											aria-label="Compras a partir desta data usam os novos dias"
										/>
									)}
								</span>
							</label>
							<label className="flex items-start gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
								<input type="radio" name="aplicarDias" checked={aplicarDias === "tudo"} onChange={() => setAplicarDias("tudo")} className="mt-0.5 accent-indigo-600" />
								<span>De tudo <span className="font-medium text-slate-500 dark:text-slate-400">(eu tinha cadastrado errado: recalcula também as faturas passadas)</span></span>
							</label>
							{cartao.ciclo_mudou_em && aplicarDias !== "tudo" && (
								<p className="text-[11px] text-amber-700 dark:text-amber-400">
									Este cartão já tinha uma troca em {dataBr(String(cartao.ciclo_mudou_em).slice(0, 10))}; ela será substituída por esta.
								</p>
							)}
						</fieldset>
					)}

					{/* Explicação de Fechamento vs Vencimento */}
					<div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed font-semibold transition-colors duration-200">
						<div className="flex gap-2">
							<Info size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
							<p>
								<strong className="text-slate-800 dark:text-slate-100">Fechamento:</strong> Dia em que a fatura fecha. Compras a partir desse dia entram na fatura do mês seguinte.
							</p>
						</div>
						<div className="flex gap-2 border-t border-slate-200/50 dark:border-slate-700/40 pt-2.5">
							<Info size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
							<p>
								<strong className="text-slate-800 dark:text-slate-100">Vencimento:</strong> Dia limite para realizar o pagamento da fatura do mês.
							</p>
						</div>
					</div>

					<div className="space-y-2">
						<label className="text-xs font-bold text-slate-600 dark:text-slate-300 ml-2 flex items-center gap-1">
							<Palette size={12} /> Cor do Cartão
						</label>
						<div className="flex flex-wrap gap-2.5 p-1.5 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
							{PREDEFINED_COLORS.map(color => (
								<button
									key={color}
									type="button"
									onClick={() => setForm({...form, cor_hex: color})}
									className={`w-8 h-8 rounded-full shadow-sm border-2 transition-transform cursor-pointer ${form.cor_hex === color ? 'border-slate-800 dark:border-white scale-110' : 'border-transparent hover:scale-105'}`}
									style={{ backgroundColor: color }}
								/>
							))}
						</div>
					</div>

					<button
						disabled={loading}
						className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-4.5 rounded-2xl font-black mt-4 transition-all transform hover:scale-[1.01] shadow-lg shadow-indigo-100 dark:shadow-none cursor-pointer text-sm uppercase shrink-0"
					>
						{loading ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}
					</button>
				</form>
			</div>
		</div>
	);
}
