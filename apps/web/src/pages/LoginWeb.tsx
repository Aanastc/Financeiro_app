import React, { useState } from "react";
import { authService } from "../../../../packages/services/auth.service";
import { useNavigate, Link } from "react-router-dom";

export default function LoginWeb() {
	const [form, setForm] = useState({ email: "", password: "" });
	const [loading, setLoading] = useState(false);
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
		<div className="min-h-screen bg-[#FCF8F8] flex items-center justify-center p-4 font-sans">
			<form
				onSubmit={handleLogin}
				className="bg-white p-10 md:p-14 rounded-[50px] shadow-2xl w-full max-w-md border border-gray-100">
				<div className="text-center mb-10">
					<h2 className="text-4xl font-black text-[#5D4037] mb-2">Entrar</h2>
					<p className="text-gray-400">Bem-vinda de volta! 😊</p>
				</div>

				<div className="space-y-6">
					<div className="space-y-1">
						<label className="text-sm font-bold text-[#5D4037] ml-2">
							E-MAIL
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
							SENHA
						</label>
						<input
							className="w-full p-4 bg-[#FCF8F8] rounded-2xl border border-gray-100 focus:border-[#4CAF50] outline-none transition-all text-[#5D4037]"
							type="password"
							placeholder="Sua senha"
							required
							onChange={(e) => setForm({ ...form, password: e.target.value })}
						/>
					</div>
				</div>

				<button
					disabled={loading}
					className="w-full bg-[#4CAF50] hover:bg-[#43a047] text-white p-5 rounded-3xl font-black mt-10 transition-all transform hover:scale-[1.02] shadow-lg shadow-green-100">
					{loading ? "ENTRANDO..." : "ENTRAR"}
				</button>

				<p className="text-center mt-8 text-gray-500 text-sm font-medium">
					Ainda não tem uma conta?{" "}
					<Link
						to="/register"
						className="text-[#4CAF50] font-black hover:underline">
						Cadastre-se
					</Link>
				</p>
			</form>
		</div>
	);
}
