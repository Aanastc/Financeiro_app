import { useState } from "react";
import { X, Copy, Check, MessageSquare, Sparkles, Mail } from "lucide-react";
import { conviteService } from "../../../../packages/services/convite.service";
import toast from "react-hot-toast";

interface ConviteAmigoModalProps {
	isOpen: boolean;
	onClose: () => void;
	contato: {
		id: string;
		nome: string;
		telefone?: string;
		email?: string;
		temConta?: boolean;
	} | null;
	userName?: string;
}

export default function ConviteAmigoModal({ isOpen, onClose, contato, userName }: ConviteAmigoModalProps) {
	const [copiado, setCopiado] = useState(false);

	if (!isOpen || !contato) return null;

	const linkConvite = conviteService.linkConvite(contato);

	const handleCopiarLink = async () => {
		try {
			await navigator.clipboard.writeText(linkConvite);
			setCopiado(true);
			toast.success("Link de convite copiado para a área de transferência!");
			setTimeout(() => setCopiado(false), 2500);
		} catch (e) {
			toast.error("Não foi possível copiar o link.");
		}
	};

	// Sem telefone válido, o WhatsApp abre para escolher o contato manualmente
	const handleEnviarWhatsApp = () => {
		window.open(conviteService.urlWhatsApp(contato, userName), "_blank", "noopener");
	};

	const handleEnviarEmail = () => {
		window.location.href = conviteService.urlEmail(contato, userName);
	};

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
			<div className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-800">
				{/* HEADER */}
				<div className="p-6 bg-gradient-to-br from-indigo-600 to-purple-600 text-white relative">
					<div className="flex items-center gap-3">
						<div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-xs">
							<Sparkles size={24} className="text-amber-300" />
						</div>
						<div>
							<h3 className="text-xl font-black">Convidar para o App</h3>
							<p className="text-indigo-100 text-xs font-semibold mt-0.5">Despesas compartilhadas</p>
						</div>
					</div>
					<button 
						onClick={onClose}
						className="absolute top-5 right-5 p-2 rounded-full hover:bg-white/20 transition-colors text-white cursor-pointer"
					>
						<X size={20} />
					</button>
				</div>

				{/* BODY */}
				<div className="p-6 space-y-5">
					<div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1">
						<p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Contato Selecionado</p>
						<h4 className="font-black text-lg text-slate-800 dark:text-slate-100">{contato.nome}</h4>
						<p className="text-xs text-slate-500 dark:text-slate-400">
							{contato.email || "Sem e-mail cadastrado"} • {contato.telefone || "Sem telefone"}
						</p>
					</div>

					<div className="space-y-3">
						<p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
							Quando {contato.nome} criar a conta por este link{contato.email ? " (com o e-mail cadastrado no contato)" : ""}, o contato fica vinculado à conta no app.
						</p>

						{/* LINK BOX */}
						<div className="space-y-1.5">
							<label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Link de Convite</label>
							<div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-2 pl-3">
								<input 
									type="text" 
									readOnly 
									value={linkConvite} 
									className="bg-transparent text-xs text-slate-600 dark:text-slate-300 font-mono flex-1 outline-none truncate"
								/>
								<button
									onClick={handleCopiarLink}
									className="px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
								>
									{copiado ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
									{copiado ? "Copiado!" : "Copiar"}
								</button>
							</div>
						</div>
					</div>

					{/* ACTIONS */}
					<div className="pt-2 space-y-2.5">
						<button
							onClick={handleEnviarWhatsApp}
							className="w-full py-4 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 dark:shadow-none transition-all cursor-pointer text-sm"
						>
							<MessageSquare size={18} />
							Enviar Convite no WhatsApp
						</button>

						<button
							onClick={handleEnviarEmail}
							className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-all cursor-pointer text-sm"
						>
							<Mail size={16} />
							{contato.email ? `Enviar por E-mail (${contato.email})` : "Enviar por E-mail"}
						</button>

						<button
							onClick={handleCopiarLink}
							className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all cursor-pointer text-sm"
						>
							<Copy size={16} />
							Copiar Link do Convite
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

