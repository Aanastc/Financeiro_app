import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { authService } from "../../../../packages/services/auth.service";
import { useNavigate, Link } from "react-router-dom";

export default function LoginWeb() {
	const [form, setForm] = useState({ email: "", password: "" });
	const [loading, setLoading] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const navigate = useNavigate();

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		try {
			await authService.login(form.email, form.password);
			navigate("/home");
		} catch (err: any) {
			alert("E-mail ou senha incorretos.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 font-sans transition-colors duration-200">
			<form
				onSubmit={handleLogin}
				className="bg-white dark:bg-slate-900 p-6 sm:p-10 md:p-14 rounded-3xl sm:rounded-[40px] md:rounded-[50px] shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-800 transition-colors duration-200"
			>
				<div className="text-center mb-10">
					<h2 className="text-4xl font-black text-slate-800 dark:text-slate-100 mb-2 tracking-tight">Entrar</h2>
					<p className="text-slate-400 dark:text-slate-500 font-semibold text-sm">Bem-vinda de volta! 😊</p>
				</div>

				<div className="space-y-6">
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
								placeholder="Sua senha"
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
					</div>
				</div>

				<button
					disabled={loading}
					className="w-full bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-50 text-white p-5 rounded-3xl font-black mt-10 transition-all transform hover:scale-[1.01] shadow-lg shadow-green-150 dark:shadow-none cursor-pointer uppercase text-sm"
				>
					{loading ? "ENTRANDO..." : "ENTRAR"}
				</button>

				<p className="text-center mt-8 text-slate-400 dark:text-slate-500 text-sm font-medium">
					Ainda não tem uma conta?{" "}
					<Link
						to="/register"
						className="text-[#4CAF50] dark:text-emerald-400 font-black hover:underline ml-1"
					>
						Cadastre-se
					</Link>
				</p>
			</form>
		</div>
	);
}
