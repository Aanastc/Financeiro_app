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
				className="bg-white dark:bg-slate-900 p-6 sm:p-10 md:p-14 rounded-3xl sm:rounded-[40px] md:rounded-[50px] shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-800 transition-colors duration-200"
			>
				<div className="text-center mb-10">
					<h2 className="text-4xl font-black text-slate-800 dark:text-slate-100 mb-2 tracking-tight">
						Criar Perfil
					</h2>
					<p className="text-slate-400 dark:text-slate-500 font-semibold text-sm">Organize suas finanças hoje 💸</p>
				</div>

				<div className="space-y-4">
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
