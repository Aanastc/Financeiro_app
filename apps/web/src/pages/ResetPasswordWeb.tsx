import { useState, useEffect } from "react";
import { authService } from "../../../../packages/services/auth.service";
import { supabase } from "../../../../packages/services/supabase";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Eye, EyeOff, Lock, RefreshCw } from "lucide-react";

export default function ResetPasswordWeb() {
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [loading, setLoading] = useState(false);
	const [checkingSession, setCheckingSession] = useState(true);
	const navigate = useNavigate();

	useEffect(() => {
		const verifySession = async () => {
			// Supabase pega automaticamente as credenciais do hash do link e gera a sessão
			const { data: { session } } = await supabase.auth.getSession();
			
			if (!session) {
				toast.error("Link de redefinição inválido ou expirado. Por favor, solicite um novo e-mail.");
				navigate("/forgot-password");
			} else {
				setCheckingSession(false);
			}
		};

		// Pequeno delay para garantir que o Supabase processou os fragmentos da URL hash
		const timer = setTimeout(() => {
			verifySession();
		}, 1000);

		return () => clearTimeout(timer);
	}, [navigate]);

	const handleResetPassword = async (e: React.FormEvent) => {
		e.preventDefault();
		if (password.length < 8) {
			toast.error("A senha deve ter no mínimo 8 caracteres.");
			return;
		}
		if (password !== confirmPassword) {
			toast.error("As senhas não coincidem.");
			return;
		}

		setLoading(true);
		const loadToast = toast.loading("Atualizando sua senha...");
		try {
			await authService.updatePassword(password);
			toast.success("Senha atualizada com sucesso! Redirecionando para o login...", {
				id: loadToast,
			});
			// Faz logout para garantir que a sessão antiga não persista incorretamente
			await authService.logout();
			setTimeout(() => {
				navigate("/login");
			}, 3000);
		} catch (err: any) {
			toast.error(err.message || "Erro ao atualizar a senha. Tente novamente.", {
				id: loadToast,
			});
		} finally {
			setLoading(false);
		}
	};

	if (checkingSession) {
		return (
			<div className="min-h-screen bg-slate-50 dark:bg-slate-955 flex flex-col items-center justify-center p-4 font-sans transition-colors duration-200">
				<div className="bg-white dark:bg-slate-900 p-10 rounded-3xl shadow-2xl text-center max-w-sm w-full border border-slate-100 dark:border-slate-800 transition-colors duration-200">
					<RefreshCw className="w-10 h-10 animate-spin text-[#4CAF50] dark:text-emerald-400 mx-auto mb-4" />
					<h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">Verificando Link</h3>
					<p className="text-slate-400 dark:text-slate-500 text-sm font-semibold">Validando token de segurança com o servidor...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-slate-50 dark:bg-slate-955 flex items-center justify-center p-4 font-sans transition-colors duration-200">
			<form
				onSubmit={handleResetPassword}
				className="bg-white dark:bg-slate-900 p-6 sm:p-10 md:p-14 rounded-3xl sm:rounded-[40px] md:rounded-[50px] shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-800 transition-colors duration-200 relative overflow-hidden"
			>
				{/* Top decorative gradient bar */}
				<div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-[#4CAF50] to-[#5D4037]" />

				<div className="text-center mb-10">
					<div className="relative w-16 h-16 bg-slate-50 dark:bg-slate-850 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-800 shadow-inner group">
						<Lock className="w-6 h-6 text-[#4CAF50] dark:text-emerald-400 transition-transform duration-500 group-hover:scale-110" />
					</div>
					<h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-2 tracking-tight">Nova Senha</h2>
					<p className="text-slate-400 dark:text-slate-500 font-semibold text-sm">Digite e confirme sua nova senha de acesso.</p>
				</div>

				<div className="space-y-4">
					<div className="space-y-1.5">
						<label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2">
							NOVA SENHA
						</label>
						<div className="relative">
							<input
								className="w-full p-4 pr-12 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-[#4CAF50] outline-none transition-all text-slate-700 dark:text-slate-200 font-bold text-sm"
								type={showPassword ? "text" : "password"}
								placeholder="No mínimo 8 caracteres"
								required
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
							<button
								type="button"
								onClick={() => setShowPassword(!showPassword)}
								className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 transition-colors flex items-center justify-center cursor-pointer"
							>
								{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
							</button>
						</div>
					</div>

					<div className="space-y-1.5">
						<label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2">
							CONFIRMAR NOVA SENHA
						</label>
						<div className="relative">
							<input
								className="w-full p-4 pr-12 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-[#4CAF50] outline-none transition-all text-slate-700 dark:text-slate-200 font-bold text-sm"
								type={showConfirmPassword ? "text" : "password"}
								placeholder="Repita a nova senha"
								required
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
							/>
							<button
								type="button"
								onClick={() => setShowConfirmPassword(!showConfirmPassword)}
								className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 transition-colors flex items-center justify-center cursor-pointer"
							>
								{showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
							</button>
						</div>
						{confirmPassword !== "" && password !== confirmPassword && (
							<p className="text-[10px] text-red-500 dark:text-red-400 mt-1 px-2 font-bold animate-pulse">
								As senhas não são iguais!
							</p>
						)}
					</div>
				</div>

				<button
					disabled={loading}
					className="w-full bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-50 text-white p-5 rounded-3xl font-black mt-8 transition-all transform hover:scale-[1.01] shadow-lg shadow-green-150 dark:shadow-none cursor-pointer uppercase text-sm flex items-center justify-center space-x-2"
				>
					{loading ? (
						<>
							<RefreshCw className="w-5 h-5 animate-spin" />
							<span>SALVANDO SENHA...</span>
						</>
					) : (
						<span>SALVAR NOVA SENHA</span>
					)}
				</button>
			</form>
		</div>
	);
}
