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
		<div className="fixed inset-0 bg-[#5D4037]/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
			<div className="bg-white p-10 md:p-14 rounded-[50px] shadow-2xl w-full max-w-md border border-gray-100 relative animate-in fade-in zoom-in duration-200">
				<button
					onClick={onClose}
					className="absolute top-8 right-8 text-gray-400 hover:text-gray-600 transition-colors bg-gray-50 p-2 rounded-full"
				>
					<X size={24} />
				</button>

				<div className="text-center mb-10">
					<h2 className="text-4xl font-black text-[#5D4037] mb-2">
						Editar Perfil
					</h2>
					<p className="text-gray-400">Atualize suas informações pessoais</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-6">
					<div className="space-y-1">
						<label className="text-sm font-bold text-[#5D4037] ml-2">
							Nome Completo
						</label>
						<input
							type="text"
							value={nome}
							onChange={(e) => setNome(e.target.value)}
							className="w-full p-4 bg-[#FCF8F8] rounded-2xl border border-gray-100 focus:border-[#4CAF50] outline-none transition-all text-[#5D4037]"
							placeholder="Seu nome"
							required
						/>
					</div>

					<button
						disabled={loading}
						className="w-full bg-[#4CAF50] hover:bg-[#43a047] text-white p-5 rounded-3xl font-black mt-8 transition-all transform hover:scale-[1.02] shadow-lg shadow-green-100"
					>
						{loading ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}
					</button>
				</form>
			</div>
		</div>
	);
}
