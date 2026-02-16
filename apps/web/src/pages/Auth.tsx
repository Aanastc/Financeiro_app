import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../../../../packages/services/auth.service";
import { Mail, Lock, User, ArrowRight, Loader2 } from "lucide-react";

export default function Auth() {
	const [isLogin, setIsLogin] = useState(true);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const navigate = useNavigate();

	// Estados dos inputs
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [nome, setNome] = useState("");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setLoading(true);

		try {
			if (isLogin) {
				await authService.login(email, password);
			} else {
				await authService.register(email, password, nome);
			}
			navigate("/home");
		} catch (err: any) {
			setError(err.message || "Erro ao processar requisição");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4">
			<div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
				<div className="p-8">
					<div className="text-center mb-10">
						<h1 className="text-3xl font-black text-red-600 tracking-tighter">
							Fluxo<span className="text-slate-900">Me</span>
						</h1>
						<p className="text-gray-400 mt-2 font-medium">
							{isLogin ? "Bem-vindo de volta!" : "Crie sua conta gratuita"}
						</p>
					</div>

					<form onSubmit={handleSubmit} className="space-y-4">
						{error && (
							<div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium border border-red-100">
								{error}
							</div>
						)}

						{!isLogin && (
							<div className="relative">
								<User
									className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
									size={20}
								/>
								<input
									type="text"
									placeholder="Nome completo"
									value={nome}
									onChange={(e) => setNome(e.target.value)}
									className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-red-500 transition-colors"
									required
								/>
							</div>
						)}

						<div className="relative">
							<Mail
								className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
								size={20}
							/>
							<input
								type="email"
								placeholder="E-mail"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-red-500 transition-colors"
								required
							/>
						</div>

						<div className="relative">
							<Lock
								className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
								size={20}
							/>
							<input
								type="password"
								placeholder="Senha"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-red-500 transition-colors"
								required
							/>
						</div>

						<button
							type="submit"
							disabled={loading}
							className="w-full bg-slate-900 hover:bg-black text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 group shadow-lg shadow-slate-200">
							{loading ? (
								<Loader2 className="animate-spin" size={20} />
							) : (
								<>
									{isLogin ? "Entrar" : "Cadastrar"}
									<ArrowRight
										size={18}
										className="group-hover:translate-x-1 transition-transform"
									/>
								</>
							)}
						</button>
					</form>

					<div className="mt-8 text-center">
						<button
							onClick={() => setIsLogin(!isLogin)}
							className="text-gray-500 text-sm font-medium hover:text-red-600 transition-colors">
							{isLogin
								? "Não tem uma conta? Cadastre-se"
								: "Já tem uma conta? Faça login"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
