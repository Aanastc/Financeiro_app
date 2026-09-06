import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { authService } from "../../../../packages/services/auth.service";
import { useNavigate, Link } from "react-router-dom";

export default function RegisterWeb() {
	const [form, setForm] = useState({
		nome: "",
		email: "",
		password: "",
		confirmPassword: "",
	});
	const [loading, setLoading] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const navigate = useNavigate();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (form.password.length < 8)
			return alert("A senha deve ter no mínimo 8 caracteres.");
		if (form.password !== form.confirmPassword)
			return alert("As senhas não coincidem.");

		setLoading(true);
		try {
			await authService.register(form.email, form.password, form.nome);
			navigate("/verify", { state: { email: form.email } });
		} catch (err: any) {
			alert(err.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-slate-50 dark:bg-slate-955 flex items-center justify-center p-4 font-sans transition-colors duration-200">
			<form
				onSubmit={handleSubmit}
				className="bg-white dark:bg-slate-900 p-6 sm:p-10 md:p-14 rounded-3xl sm:rounded-[40px] md:rounded-[50px] shadow-2xl w-full max-w-3xl border border-slate-100 dark:border-slate-800 transition-colors duration-200"
			>
				<div className="text-center mb-10">
					<h2 className="text-4xl font-black text-slate-800 dark:text-slate-100 mb-2 tracking-tight">
						Criar Perfil
					</h2>
					<p className="text-slate-400 dark:text-slate-500 font-semibold text-sm">Organize suas finanças hoje 💸</p>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="space-y-1.5">
						<label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2">
							NOME
						</label>
						<input
							className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-[#4CAF50] outline-none transition-all text-slate-700 dark:text-slate-200 font-bold text-sm"
							placeholder="Ex: João Silva"
							required
							onChange={(e) => setForm({ ...form, nome: e.target.value })}
						/>
					</div>

					<div className="space-y-1.5">
						<label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2">
							E-MAIL
						</label>
						<input
							className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-[#4CAF50] outline-none transition-all text-slate-700 dark:text-slate-200 font-bold text-sm"
							type="email"
							placeholder="seu@email.com"
							required
							onChange={(e) => setForm({ ...form, email: e.target.value })}
						/>
					</div>

					<div className="space-y-1.5">
						<label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2">
							SENHA
						</label>
						<div className="relative">
							<input
								className="w-full p-4 pr-12 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-[#4CAF50] outline-none transition-all text-slate-700 dark:text-slate-200 font-bold text-sm"
								type={showPassword ? "text" : "password"}
								placeholder="No mínimo 8 dígitos"
								required
								onChange={(e) => setForm({ ...form, password: e.target.value })}
							/>
							<button
								type="button"
								onClick={() => setShowPassword(!showPassword)}
								className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 transition-colors flex items-center justify-center cursor-pointer"
							>
								{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
							</button>
						</div>
						<p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 px-2 italic">
							Mínimo de 8 caracteres obrigatório.
						</p>
					</div>

					<div className="space-y-1.5">
						<label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2">
							CONFIRMAR SENHA
						</label>
						<div className="relative">
							<input
								className="w-full p-4 pr-12 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-[#4CAF50] outline-none transition-all text-slate-700 dark:text-slate-200 font-bold text-sm"
								type={showConfirmPassword ? "text" : "password"}
								placeholder="Repita sua senha"
								required
								onChange={(e) =>
									setForm({ ...form, confirmPassword: e.target.value })
								}
							/>
							<button
								type="button"
								onClick={() => setShowConfirmPassword(!showConfirmPassword)}
								className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 transition-colors flex items-center justify-center cursor-pointer"
							>
								{showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
							</button>
						</div>
						{form.confirmPassword !== "" &&
							form.password !== form.confirmPassword && (
								<p className="text-[10px] text-red-500 dark:text-red-400 mt-1 px-2 font-bold animate-pulse">
									As senhas não são iguais!
								</p>
							)}
					</div>
				</div>

				<button
					disabled={loading}
					className="w-full bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-50 text-white p-5 rounded-3xl font-black mt-8 transition-all transform hover:scale-[1.01] shadow-lg shadow-green-150 dark:shadow-none cursor-pointer uppercase text-sm"
				>
					{loading ? "PROCESSANDO..." : "CRIAR CONTA"}
				</button>
				
				<div className="relative mt-6 mb-6">
					<div className="absolute inset-0 flex items-center">
						<div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
					</div>
					<div className="relative flex justify-center text-sm">
						<span className="px-2 bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500">Ou continue com</span>
					</div>
				</div>

				<button
					type="button"
					onClick={() => authService.signInWithGoogle()}
					className="w-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 p-5 rounded-3xl font-bold transition-all transform hover:scale-[1.01] flex items-center justify-center gap-3 cursor-pointer text-sm"
				>
					<svg className="w-5 h-5" viewBox="0 0 24 24">
						<path
							d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
							fill="#4285F4"
						/>
						<path
							d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
							fill="#34A853"
						/>
						<path
							d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
							fill="#FBBC05"
						/>
						<path
							d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
							fill="#EA4335"
						/>
						<path d="M1 1h22v22H1z" fill="none" />
					</svg>
					GOOGLE
				</button>

				<p className="text-center mt-8 text-slate-400 dark:text-slate-500 text-sm">
					Já tem uma conta?{" "}
					<Link
						to="/login"
						className="text-[#4CAF50] dark:text-emerald-400 font-black hover:underline ml-1"
					>
						Fazer Login
					</Link>
				</p>
			</form>
		</div>
	);
}
