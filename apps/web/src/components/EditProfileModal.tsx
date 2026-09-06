import React, { useState, useEffect, useRef } from "react";
import { X, Camera } from "lucide-react";
import { authService } from "../../../../packages/services/auth.service";
import toast from "react-hot-toast";

interface EditProfileModalProps {
	isOpen: boolean;
	onClose: () => void;
	onUpdate: () => void; // Triggered when profile is successfully updated
}

export default function EditProfileModal({ isOpen, onClose, onUpdate }: EditProfileModalProps) {
	const [nome, setNome] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [telefone, setTelefone] = useState("");
	const [cpf, setCpf] = useState("");
	const [avatarUrl, setAvatarUrl] = useState("");
	const [avatarFile, setAvatarFile] = useState<File | null>(null);
	const [avatarPreview, setAvatarPreview] = useState("");
	
	const [loading, setLoading] = useState(false);
	const [userId, setUserId] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isOpen) {
			const fetchUser = async () => {
				const user = await authService.getCurrentUser();
				if (user) {
					setUserId(user.id);
					setNome(user.nome || "");
					setEmail(user.email || "");
					setTelefone(user.telefone || "");
					setCpf(user.cpf || "");
					setAvatarUrl(user.avatar_url || "");
					setAvatarPreview(user.avatar_url || "");
				}
			};
			fetchUser();
		}
	}, [isOpen]);

	if (!isOpen) return null;

	const formatCPF = (val: string) => {
		return val
			.replace(/\D/g, "")
			.replace(/(\d{3})(\d)/, "$1.$2")
			.replace(/(\d{3})(\d)/, "$1.$2")
			.replace(/(\d{3})(\d{1,2})/, "$1-$2")
			.replace(/(-\d{2})\d+?$/, "$1");
	};

	const formatPhone = (val: string) => {
		let v = val.replace(/\D/g, "");
		if (v.length > 11) v = v.slice(0, 11);
		if (v.length > 10) {
			v = v.replace(/^(\d\d)(\d{5})(\d{4}).*/, "($1) $2-$3");
		} else if (v.length > 5) {
			v = v.replace(/^(\d\d)(\d{4})(\d{0,4}).*/, "($1) $2-$3");
		} else if (v.length > 2) {
			v = v.replace(/^(\d\d)(\d{0,5})/, "($1) $2");
		}
		return v;
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			setAvatarFile(file);
			setAvatarPreview(URL.createObjectURL(file));
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		try {
			let finalAvatarUrl = avatarUrl;

			if (avatarFile) {
				try {
					finalAvatarUrl = await authService.uploadAvatar(avatarFile, userId);
				} catch (err: any) {
					toast.error("Erro ao fazer upload da imagem. O bucket 'avatars' foi configurado corretamente?");
					setLoading(false);
					return;
				}
			}

			await authService.updateProfile(nome, finalAvatarUrl || undefined, email, password || undefined, telefone, cpf);
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
			<div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl sm:rounded-[40px] shadow-2xl w-full max-w-lg border border-slate-100 dark:border-slate-800 relative animate-in fade-in zoom-in duration-200 flex flex-col max-h-[95vh] sm:max-h-[90vh] transition-colors duration-200">
				<button
					onClick={onClose}
					className="absolute top-6 right-6 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 transition-colors bg-slate-50 dark:bg-slate-800 p-2 rounded-full cursor-pointer z-10"
				>
					<X size={20} />
				</button>

				<div className="text-center mb-6 shrink-0 pt-2">
					<h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-1">Editar Perfil</h2>
					<p className="text-slate-500 dark:text-slate-400 font-semibold text-xs">Mantenha seus dados atualizados</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 pr-2 custom-scrollbar pb-2">
					{/* Foto de Perfil */}
					<div className="flex flex-col items-center mb-4">
						<div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
							<div className="w-24 h-24 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border-4 border-white dark:border-slate-800 shadow-md flex items-center justify-center">
								{avatarPreview ? (
									<img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
								) : (
									<span className="text-3xl font-black text-slate-400">{nome.charAt(0).toUpperCase() || "U"}</span>
								)}
							</div>
							<div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
								<Camera className="text-white" size={24} />
							</div>
							<input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
						</div>
						<span className="text-xs font-bold text-indigo-500 mt-2 cursor-pointer hover:underline" onClick={() => fileInputRef.current?.click()}>Alterar foto</span>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div className="space-y-1.5 sm:col-span-2">
							<label className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1 block">Nome Completo</label>
							<input
								type="text"
								value={nome}
								onChange={(e) => setNome(e.target.value)}
								className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 outline-none transition-all text-slate-800 dark:text-slate-100 font-bold text-sm rounded-xl"
								placeholder="Seu nome"
								required
							/>
						</div>

						<div className="space-y-1.5 sm:col-span-2">
							<label className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1 block">E-mail</label>
							<input
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 outline-none transition-all text-slate-800 dark:text-slate-100 font-bold text-sm rounded-xl"
								placeholder="seu@email.com"
								required
							/>
						</div>

						<div className="space-y-1.5">
							<label className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1 block">Telefone</label>
							<input
								type="text"
								value={telefone}
								onChange={(e) => setTelefone(formatPhone(e.target.value))}
								className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 outline-none transition-all text-slate-800 dark:text-slate-100 font-bold text-sm rounded-xl"
								placeholder="(11) 99999-9999"
							/>
						</div>

						<div className="space-y-1.5">
							<label className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1 block">CPF</label>
							<input
								type="text"
								value={cpf}
								onChange={(e) => setCpf(formatCPF(e.target.value))}
								className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 outline-none transition-all text-slate-800 dark:text-slate-100 font-bold text-sm rounded-xl"
								placeholder="000.000.000-00"
							/>
						</div>

						<div className="space-y-1.5 sm:col-span-2">
							<label className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1 flex items-center justify-between">
								<span>Nova Senha</span>
								<span className="text-[9px] font-normal opacity-70 normal-case">(opcional)</span>
							</label>
							<input
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 outline-none transition-all text-slate-800 dark:text-slate-100 font-bold text-sm rounded-xl"
								placeholder="••••••••"
							/>
						</div>
					</div>

					<button
						disabled={loading}
						className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white p-4 rounded-xl font-black mt-6 transition-all shadow-md cursor-pointer text-sm uppercase shrink-0 flex items-center justify-center"
					>
						{loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "SALVAR ALTERAÇÕES"}
					</button>
				</form>
			</div>
		</div>
	);
}
