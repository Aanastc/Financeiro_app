import { useEffect, useState } from "react";
import { Loader2, MessageSquare, X } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../../../packages/services/supabase";
import { telefoneWhatsApp } from "../../../../packages/services/convite.service";

/** "85999998888" -> "(85) 99999-8888" enquanto digita */
export const mascaraCelular = (valor: string) => {
	const d = valor.replace(/\D/g, "").slice(0, 11);
	if (d.length <= 2) return d ? `(${d}` : "";
	if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
	if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
	return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

/** Salva o celular no contato (só o do próprio usuário — RLS). Devolve o número salvo ou null. */
export async function salvarTelefoneContato(contatoId: string, telefone: string): Promise<string | null> {
	if (!telefoneWhatsApp(telefone)) {
		toast.error("Informe um celular válido com DDD.");
		return null;
	}
	const formatado = mascaraCelular(telefone);
	const { error } = await supabase.from("contatos").update({ telefone: formatado }).eq("id", contatoId);
	if (error) {
		toast.error("Não foi possível salvar o celular.");
		return null;
	}
	return formatado;
}

interface Props {
	isOpen: boolean;
	contato: { id: string; nome: string } | null;
	titulo?: string;
	onClose: () => void;
	/** Chamado com o número salvo (ou null se a pessoa preferir escolher no WhatsApp) */
	onContinuar: (telefone: string | null) => void;
}

/** Pede o celular quando o contato não tem: salva e segue para o WhatsApp. */
export default function PedirTelefoneModal({ isOpen, contato, titulo, onClose, onContinuar }: Props) {
	const [telefone, setTelefone] = useState("");
	const [salvando, setSalvando] = useState(false);

	useEffect(() => {
		if (isOpen) setTelefone("");
	}, [isOpen]);

	if (!isOpen || !contato) return null;
	const primeiro = contato.nome.split(" ")[0];

	const salvar = async () => {
		setSalvando(true);
		const salvo = await salvarTelefoneContato(contato.id, telefone);
		setSalvando(false);
		if (salvo) {
			toast.success(`Celular de ${primeiro} salvo.`);
			onContinuar(salvo);
		}
	};

	return (
		<div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm" onClick={onClose}>
			<div
				className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-5 space-y-4"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="titulo-telefone">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h3 id="titulo-telefone" className="font-black text-base text-slate-800 dark:text-slate-100">
							{titulo || `Qual o celular de ${primeiro}?`}
						</h3>
						<p className="text-xs text-slate-500 dark:text-slate-400">
							Fica salvo no contato para as próximas cobranças e convites.
						</p>
					</div>
					<button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
						<X size={18} />
					</button>
				</div>
				<input
					autoFocus
					value={telefone}
					onChange={(e) => setTelefone(mascaraCelular(e.target.value))}
					onKeyDown={(e) => e.key === "Enter" && salvar()}
					inputMode="tel"
					placeholder="(85) 99999-8888"
					className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
				/>
				<button
					onClick={salvar}
					disabled={salvando}
					className="w-full py-3 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] disabled:opacity-50 text-white font-black text-sm flex items-center justify-center gap-2 cursor-pointer">
					{salvando ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
					Salvar e abrir WhatsApp
				</button>
				<button
					onClick={() => onContinuar(null)}
					className="w-full text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 underline cursor-pointer">
					Não sei o número — escolher a conversa no WhatsApp
				</button>
			</div>
		</div>
	);
}
