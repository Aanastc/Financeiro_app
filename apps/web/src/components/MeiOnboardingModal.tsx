import React, { useState } from "react";
import { Briefcase, User } from "lucide-react";
import { authService } from "../../../../packages/services/auth.service";
import toast from "react-hot-toast";

interface MeiOnboardingModalProps {
	isOpen: boolean;
	onClose: () => void;
	onComplete: (acompanhaMei: boolean) => void;
	userId: string;
}

export default function MeiOnboardingModal({ isOpen, onClose, onComplete, userId }: MeiOnboardingModalProps) {
	const [loading, setLoading] = useState(false);
	const [selection, setSelection] = useState<boolean | null>(null);

	if (!isOpen) return null;

	const handleSubmit = async () => {
		if (selection === null) {
			toast.error("Por favor, selecione uma opção.");
			return;
		}

		setLoading(true);
		try {
			// Busca os dados atuais para não sobrescrever nada com vazio
			const user = await authService.getCurrentUser();
			if (!user) throw new Error("Usuário não encontrado");

			await authService.updateProfile(
				user.nome,
				user.avatar_url || undefined,
				user.email,
				undefined,
				user.telefone,
				user.cpf,
				selection
			);
			
			toast.success("Preferência salva com sucesso!");
			onComplete(selection);
			onClose();
		} catch (error: any) {
			toast.error(error.message || "Erro ao salvar preferência");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
			<div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] shadow-2xl w-full max-w-lg border border-slate-100 dark:border-slate-800 relative animate-in zoom-in-95 duration-300">
				
				<div className="text-center mb-8 mt-4">
					<div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
						<Briefcase className="text-indigo-500 w-10 h-10" />
					</div>
					<h2 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 mb-3 tracking-tight">
						Novidade chegando! 🚀
					</h2>
					<p className="text-slate-500 dark:text-slate-400 font-medium">
						Agora você pode gerenciar as finanças do seu negócio junto com as suas pessoais. O que você deseja acompanhar?
					</p>
				</div>

				<div className="grid gap-4 mb-8">
					<div 
						onClick={() => setSelection(false)}
						className={`cursor-pointer p-5 border-2 rounded-2xl flex items-center gap-4 transition-all ${
							selection === false 
								? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' 
								: 'border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800'
						}`}
					>
						<div className={`p-3 rounded-xl ${selection === false ? 'bg-indigo-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
							<User size={24} />
						</div>
						<div>
							<h3 className={`font-bold text-lg ${selection === false ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>
								Apenas Pessoal (PF)
							</h3>
							<p className="text-sm text-slate-500 dark:text-slate-400">Quero focar nas minhas finanças pessoais.</p>
						</div>
					</div>

					<div 
						onClick={() => setSelection(true)}
						className={`cursor-pointer p-5 border-2 rounded-2xl flex items-center gap-4 transition-all ${
							selection === true 
								? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' 
								: 'border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800'
						}`}
					>
						<div className={`p-3 rounded-xl ${selection === true ? 'bg-indigo-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
							<Briefcase size={24} />
						</div>
						<div>
							<h3 className={`font-bold text-lg ${selection === true ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>
								Pessoal e MEI / ME
							</h3>
							<p className="text-sm text-slate-500 dark:text-slate-400">Tenho um negócio e quero gerenciar tudo aqui.</p>
						</div>
					</div>
				</div>

				<button
					onClick={handleSubmit}
					disabled={loading || selection === null}
					className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white p-5 rounded-2xl font-black transition-all shadow-lg hover:shadow-xl cursor-pointer uppercase text-sm"
				>
					{loading ? "SALVANDO..." : "CONFIRMAR ESCOLHA"}
				</button>
				
				<p className="text-center text-xs text-slate-400 mt-4">
					Não se preocupe, você pode alterar isso depois nas configurações de perfil.
				</p>
			</div>
		</div>
	);
}
