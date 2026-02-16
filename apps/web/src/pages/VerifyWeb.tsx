import React, { useState } from "react";
import { authService } from "../../../packages/services/auth.service";
import { useNavigate, useLocation } from "react-router-dom";

export default function VerifyWeb() {
	const [token, setToken] = useState("");
	const [loading, setLoading] = useState(false);
	const navigate = useNavigate();
	const location = useLocation();

	// Recupera o email vindo da tela de cadastro
	const email = location.state?.email || "seu e-mail";

	const handleVerify = async (e: React.FormEvent) => {
		e.preventDefault();

		if (token.length < 6) {
			return alert("O código de verificação deve ter 6 dígitos.");
		}

		setLoading(true);
		try {
			// 1. Valida o token no Supabase
			await authService.verifyOtp(email, token);

			// 2. Se der certo, o usuário já está logado.
			alert("Conta ativada com sucesso! Bem-vinda! 🎉");
			navigate("/home");
		} catch (err: any) {
			alert("Código inválido ou expirado. Verifique sua caixa de entrada.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-[#FCF8F8] flex items-center justify-center p-4 font-sans">
			<div className="bg-white p-10 md:p-14 rounded-[50px] shadow-2xl w-full max-w-md border border-gray-100 text-center">
				{/* Ícone Decorativo */}
				<div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-8">
					<span className="text-4xl text-[#4CAF50]">✉️</span>
				</div>

				<h2 className="text-3xl font-black text-[#5D4037] mb-2">
					Verifique seu E-mail
				</h2>
				<p className="text-gray-400 mb-8 leading-relaxed">
					Digitie o código de 6 dígitos que enviamos para:
					<br />
					<strong className="text-[#5D4037]">{email}</strong>
				</p>

				<form onSubmit={handleVerify} className="space-y-8">
					<div className="relative">
						<input
							className="w-full p-6 bg-[#FCF8F8] rounded-3xl text-center text-5xl font-black tracking-[12px] border-2 border-dashed border-gray-200 focus:border-[#4CAF50] focus:bg-white outline-none text-[#4CAF50] transition-all"
							placeholder="000000"
							maxLength={6}
							value={token}
							required
							onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))} // Apenas números
						/>
					</div>

					<button
						disabled={loading}
						className="w-full bg-[#5D4037] hover:bg-[#4a332c] text-white p-5 rounded-3xl font-black transition-all transform hover:scale-[1.02] shadow-lg shadow-gray-200">
						{loading ? "VERIFICANDO..." : "CONFIRMAR E ENTRAR"}
					</button>
				</form>

				<div className="mt-10 space-y-4">
					<p className="text-sm text-gray-500">
						Não recebeu o código?{" "}
						<button
							onClick={() =>
								alert("Aguarde alguns minutos ou verifique o Spam.")
							}
							className="text-[#4CAF50] font-black hover:underline">
							Reenviar
						</button>
					</p>

					<button
						onClick={() => navigate("/register")}
						className="text-xs text-gray-400 font-bold uppercase tracking-wider hover:text-[#5D4037] transition-colors">
						← Voltar para o Cadastro
					</button>
				</div>
			</div>
		</div>
	);
}
