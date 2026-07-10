import { useState } from "react";
import { authService } from "../../../../packages/services/auth.service";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Mail, ArrowLeft, RefreshCw } from "lucide-react";

export default function ForgotPasswordWeb() {
	const [email, setEmail] = useState("");
	const [loading, setLoading] = useState(false);
	const navigate = useNavigate();

	const handleResetRequest = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email) return;

		setLoading(true);
		const loadToast = toast.loading("Enviando e-mail de recuperação...");
		try {
			await authService.resetPasswordForEmail(email);
			toast.success("E-mail de recuperação enviado! Verifique sua caixa de entrada.", {
				id: loadToast,
			});
			// Redireciona de volta para o login após o envio
			setTimeout(() => {
				navigate("/login");
			}, 3000);
		} catch (err: any) {
			toast.error(err.message || "Erro ao tentar enviar e-mail de recuperação. Verifique o endereço digitado.", {
				id: loadToast,
			});
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 font-sans transition-colors duration-200">
			<form
				onSubmit={handleResetRequest}
				className="bg-white dark:bg-slate-900 p-6 sm:p-10 md:p-14 rounded-3xl sm:rounded-[40px] md:rounded-[50px] shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-800 transition-colors duration-200 relative overflow-hidden"
			>
				{/* Top decorative gradient bar */}
				<div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-[#4CAF50] to-[#5D4037]" />

				<div className="text-center mb-10">
					<div className="relative w-16 h-16 bg-slate-50 dark:bg-slate-850 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-800 shadow-inner group">
						<Mail className="w-6 h-6 text-[#4CAF50] dark:text-emerald-400 transition-transform duration-500 group-hover:scale-110" />
					</div>
					<h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-2 tracking-tight">Esqueceu a Senha?</h2>
					<p className="text-slate-400 dark:text-slate-500 font-semibold text-sm">Digite seu e-mail abaixo para receber um link de redefinição.</p>
				</div>

				<div className="space-y-6">
					<div className="space-y-1.5">
						<label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2">
							E-MAIL DE CADASTRO
						</label>
						<input
							className="w-full p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 focus:border-[#4CAF50] outline-none transition-all text-slate-700 dark:text-slate-200 font-bold text-sm"
							type="email"
							placeholder="seu@email.com"
							required
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
					</div>
				</div>

				<button
					disabled={loading}
					className="w-full bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-50 text-white p-5 rounded-3xl font-black mt-8 transition-all transform hover:scale-[1.01] shadow-lg shadow-green-150 dark:shadow-none cursor-pointer uppercase text-sm flex items-center justify-center space-x-2"
				>
					{loading ? (
						<>
							<RefreshCw className="w-5 h-5 animate-spin" />
							<span>ENVIANDO...</span>
						</>
					) : (
						<span>RECUPERAR SENHA</span>
					)}
				</button>

				<div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 text-center">
					<Link
						to="/login"
						className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider hover:text-slate-700 dark:hover:text-slate-200 transition-colors inline-flex items-center space-x-1.5 mx-auto focus:outline-none cursor-pointer"
					>
						<ArrowLeft className="w-3.5 h-3.5" />
						<span>Voltar para o Login</span>
					</Link>
				</div>
			</form>
		</div>
	);
}
