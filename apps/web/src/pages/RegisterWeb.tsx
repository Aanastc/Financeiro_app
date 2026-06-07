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
		<div className="min-h-screen bg-[#FCF8F8] flex items-center justify-center p-4 font-sans">
			<form
				onSubmit={handleSubmit}
				className="bg-white p-10 md:p-14 rounded-[50px] shadow-2xl w-full max-w-md border border-gray-100">
				<div className="text-center mb-10">
					<h2 className="text-4xl font-black text-[#5D4037] mb-2">
						Criar Perfil
					</h2>
					<p className="text-gray-400">Organize suas finanças hoje 💸</p>
				</div>

				<div className="space-y-4">
					<div className="space-y-1">
						<label className="text-sm font-bold text-[#5D4037] ml-2">
							Nome
						</label>
						<input
							className="w-full p-4 bg-[#FCF8F8] rounded-2xl border border-gray-100 focus:border-[#4CAF50] outline-none transition-all text-[#5D4037]"
							placeholder="Ex: João Silva"
							required
							onChange={(e) => setForm({ ...form, nome: e.target.value })}
						/>
					</div>

					<div className="space-y-1">
						<label className="text-sm font-bold text-[#5D4037] ml-2">
							E-mail
						</label>
						<input
							className="w-full p-4 bg-[#FCF8F8] rounded-2xl border border-gray-100 focus:border-[#4CAF50] outline-none transition-all text-[#5D4037]"
							type="email"
							placeholder="seu@email.com"
							required
							onChange={(e) => setForm({ ...form, email: e.target.value })}
						/>
					</div>

					<div className="space-y-1">
						<label className="text-sm font-bold text-[#5D4037] ml-2">
							Senha
						</label>
						<div className="relative">
							<input
								className="w-full p-4 pr-12 bg-[#FCF8F8] rounded-2xl border border-gray-100 focus:border-[#4CAF50] outline-none transition-all text-[#5D4037]"
								type={showPassword ? "text" : "password"}
								placeholder="No mínimo 8 dígitos"
								required
								onChange={(e) => setForm({ ...form, password: e.target.value })}
							/>
							<button
								type="button"
								onClick={() => setShowPassword(!showPassword)}
								className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center"
							>
								{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
							</button>
						</div>
						<p className="text-[10px] text-gray-400 mt-1 px-2 italic">
							Mínimo de 8 caracteres obrigatório.
						</p>
					</div>

					<div className="space-y-1">
						<label className="text-sm font-bold text-[#5D4037] ml-2">
							Confirmar Senha
						</label>
						<div className="relative">
							<input
								className="w-full p-4 pr-12 bg-[#FCF8F8] rounded-2xl border border-gray-100 focus:border-[#4CAF50] outline-none transition-all text-[#5D4037]"
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
								className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center"
							>
								{showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
							</button>
						</div>
						{form.confirmPassword !== "" &&
							form.password !== form.confirmPassword && (
								<p className="text-[10px] text-red-400 mt-1 px-2 font-bold">
									As senhas não são iguais!
								</p>
							)}
					</div>
				</div>

				<button
					disabled={loading}
					className="w-full bg-[#4CAF50] hover:bg-[#43a047] text-white p-5 rounded-3xl font-black mt-8 transition-all transform hover:scale-[1.02] shadow-lg shadow-green-100">
					{loading ? "PROCESSANDO..." : "CRIAR CONTA"}
				</button>

				<p className="text-center mt-8 text-gray-500 text-sm">
					Já tem uma conta?{" "}
					<Link
						to="/login"
						className="text-[#4CAF50] font-black hover:underline">
						Fazer Login
					</Link>
				</p>
			</form>
		</div>
	);
}
