import React, { useState, useEffect } from "react";
import { X, User, Link as LinkIcon } from "lucide-react";
import { authService } from "../../../../packages/services/auth.service";
import toast from "react-hot-toast";

interface EditProfileModalProps {
	isOpen: boolean;
	onClose: () => void;
	onUpdate: () => void; // Triggered when profile is successfully updated
}

export default function EditProfileModal({ isOpen, onClose, onUpdate }: EditProfileModalProps) {
	const [nome, setNome] = useState("");
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (isOpen) {
			const fetchUser = async () => {
				const user = await authService.getCurrentUser();
				if (user) {
					setNome(user.nome || "");
				}
			};
			fetchUser();
		}
	}, [isOpen]);

	if (!isOpen) return null;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		try {
			await authService.updateProfile(nome);
			toast.success("Perfil atualizado com sucesso!");
			onUpdate();
			onClose();
		} catch (error: any) {
			toast.error(error.message || "Erro ao atualizar perfil");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true">
			<div className="bg-white dark:bg-slate-900 p-6 sm:p-10 rounded-3xl sm:rounded-[40px] shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-800 relative animate-in fade-in zoom-in duration-200 flex flex-col max-h-[95vh] sm:max-h-[90vh] transition-colors duration-200">
				<button
					onClick={onClose}
					className="absolute top-6 right-6 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 transition-colors bg-slate-50 dark:bg-slate-800 p-2 rounded-full cursor-pointer"
				>
					<X size={20} />
				</button>

				<div className="text-center mb-8 shrink-0">
					<h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-2">
						Editar Perfil
					</h2>
					<p className="text-slate-400 dark:text-slate-500 font-semibold text-sm">Atualize suas informações pessoais</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-6 overflow-y-auto flex-1 pr-1 scrollbar-thin">
					<div className="space-y-1.5">
						<label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2 block">
							Nome Completo
						</label>
						<input
							type="text"
							value={nome}
							onChange={(e) => setNome(e.target.value)}
							className="w-full p-4 bg-slate-50 dark:bg-slate-855 border border-slate-200 dark:border-slate-700 focus:border-emerald-500 outline-none transition-all text-slate-700 dark:text-slate-200 font-bold text-sm rounded-2xl"
							placeholder="Seu nome"
							required
						/>
					</div>

					<button
						disabled={loading}
						className="w-full bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-50 text-white p-4.5 rounded-2xl font-black mt-6 transition-all transform hover:scale-[1.01] shadow-lg shadow-green-150 dark:shadow-none cursor-pointer text-sm uppercase shrink-0"
					>
						{loading ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}
					</button>
				</form>
			</div>
		</div>
	);
}
