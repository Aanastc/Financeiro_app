import { useState, useEffect } from "react";
import { authService } from "../../../../packages/services/auth.service";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Mail, ArrowLeft, RefreshCw, HelpCircle, Clock } from "lucide-react";

export default function VerifyWeb() {
	const [token, setToken] = useState("");
	const [loading, setLoading] = useState(false);
	const [resending, setResending] = useState(false);
	const [timeLeft, setTimeLeft] = useState(3600); // 60 minutes countdown
	const [resendTimer, setResendTimer] = useState(60); // 60 seconds resend delay
	const navigate = useNavigate();
	const location = useLocation();

	// Recupera o email vindo da tela de cadastro
	const email = location.state?.email || "seu e-mail";

	// Controla a contagem regressiva de expiração do token (3600 segundos) e reenviar (60 segundos)
	useEffect(() => {
		const interval = setInterval(() => {
			setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
			setResendTimer((prev) => (prev > 0 ? prev - 1 : 0));
		}, 1000);

		return () => clearInterval(interval);
	}, []);

	// Formata segundos em MM:SS
	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	const handleVerify = async (e: React.FormEvent) => {
		e.preventDefault();

		if (token.length < 6) {
			toast.error("O código de verificação deve ter 6 dígitos.");
			return;
		}

		if (timeLeft === 0) {
			toast.error("Este código expirou. Por favor, solicite um novo envio.");
			return;
		}

		setLoading(true);
		const loadToast = toast.loading("Verificando seu código...");
		try {
			// 1. Valida o token no Supabase
			await authService.verifyOtp(email, token);

			toast.success("Conta ativada com sucesso! Bem-vindo(a)! 🎉", {
				id: loadToast,
			});
			navigate("/home");
		} catch (err: any) {
			toast.error("Código inválido ou expirado. Verifique sua caixa de entrada.", {
				id: loadToast,
			});
		} finally {
			setLoading(false);
		}
	};

	const handleResend = async () => {
		if (resendTimer > 0 || resending) return;

		setResending(true);
		const resendToast = toast.loading("Reenviando código...");
		try {
			await authService.resendOtp(email);
			toast.success("Novo código enviado com sucesso! Verifique seu e-mail.", {
				id: resendToast,
			});
			// Reinicia os timers
			setResendTimer(60);
			setTimeLeft(3600);
		} catch (err: any) {
			toast.error(err.message || "Erro ao reenviar o código. Tente novamente.", {
				id: resendToast,
			});
		} finally {
			setResending(false);
		}
	};

	return (
		<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 font-sans transition-colors duration-200">
			<div className="bg-white dark:bg-slate-900 p-6 sm:p-10 md:p-14 rounded-3xl sm:rounded-[40px] shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-800 text-center relative overflow-hidden transition-all duration-300 hover:shadow-3xl">
				{/* Top decorative gradient bar */}
				<div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-[#4CAF50] to-[#5D4037]" />

				{/* Icon/Visual Header */}
				<div className="relative w-20 h-20 sm:w-24 sm:h-24 bg-slate-50 dark:bg-slate-850 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8 border border-slate-100 dark:border-slate-800 shadow-inner group">
					<Mail className="w-8 h-8 sm:w-10 sm:h-10 text-[#4CAF50] dark:text-emerald-400 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6" />
					<div className="absolute -top-1 -right-1 bg-slate-800 dark:bg-slate-700 text-white text-[10px] px-2 py-0.5 rounded-full font-black animate-bounce">
						Token
					</div>
				</div>

				<h2 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 mb-2 tracking-tight">
					Seu código de acesso 🚀
				</h2>
				<p className="text-slate-400 dark:text-slate-500 mb-6 font-medium text-sm">
					Use o token enviado para confirmar seu e-mail e começar a poupar.
				</p>

				{/* Email Display Card */}
				<div className="bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800 rounded-2xl py-3 px-4 mb-6 inline-flex flex-col items-center w-full max-w-sm">
					<span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
						E-mail Cadastrado
					</span>
					<strong className="text-slate-700 dark:text-slate-200 font-extrabold break-all text-base">
						{email}
					</strong>
				</div>

				{/* Form */}
				<form onSubmit={handleVerify} className="space-y-6">
					<div className="space-y-2">
						<label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block text-left ml-2">
							Código de Verificação (6 dígitos)
						</label>
						<input
							className="w-full p-4 sm:p-5 bg-slate-50 dark:bg-slate-850 rounded-2xl text-center text-3xl sm:text-4xl font-mono font-black tracking-[8px] border-2 border-dashed border-slate-200 dark:border-slate-700 focus:border-[#4CAF50] dark:focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-800 outline-none text-slate-850 dark:text-slate-100 transition-all"
							placeholder="000000"
							maxLength={6}
							value={token}
							required
							onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
						/>
						
						{/* Token Expiration Timer */}
						<div className="flex items-center justify-center space-x-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 mt-2">
							<Clock className="w-3.5 h-3.5 text-slate-450" />
							{timeLeft > 0 ? (
								<span>O token expira em: <span className="font-extrabold text-[#4CAF50] dark:text-emerald-450">{formatTime(timeLeft)}</span></span>
							) : (
								<span className="text-rose-550 dark:text-rose-450 font-extrabold">O token expirou!</span>
							)}
						</div>
					</div>

					{/* Spam Folder Advice Callout */}
					<div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-left flex items-start space-x-3">
						<HelpCircle className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
						<div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
							<span className="font-bold block text-amber-800 dark:text-amber-400">Não recebeu o código?</span>
							Verifique também a sua caixa de <strong>Spam / Lixo Eletrônico</strong>. Às vezes o e-mail de ativação pode ser classificado incorretamente pelo seu provedor.
						</div>
					</div>

					<button
						disabled={loading || timeLeft === 0}
						className="w-full bg-[#5D4037] hover:bg-[#4a332c] dark:bg-slate-750 dark:hover:bg-slate-700 disabled:opacity-50 text-white p-4 sm:p-5 rounded-3xl font-black transition-all transform hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-gray-200 dark:shadow-none flex items-center justify-center space-x-2 cursor-pointer text-sm uppercase">
						{loading ? (
							<>
								<RefreshCw className="w-5 h-5 animate-spin" />
								<span>VERIFICANDO...</span>
							</>
						) : (
							<span>CONFIRMAR E ENTRAR</span>
						)}
					</button>
				</form>

				{/* Footer Options */}
				<div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col space-y-4">
					<p className="text-sm text-slate-400 dark:text-slate-500 font-medium">
						Ainda sem o e-mail?{" "}
						{resendTimer > 0 ? (
							<span className="text-slate-400 dark:text-slate-500 font-bold">
								Reenviar em {resendTimer}s
							</span>
						) : (
							<button
								onClick={handleResend}
								disabled={resending}
								className="text-[#4CAF50] dark:text-emerald-400 font-black hover:underline focus:outline-none disabled:text-slate-500 cursor-pointer">
								{resending ? "Reenviando..." : "Reenviar Código"}
							</button>
						)}
					</p>

					<button
						onClick={() => navigate("/register")}
						className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex items-center justify-center space-x-1.5 mx-auto focus:outline-none cursor-pointer">
						<ArrowLeft className="w-3.5 h-3.5" />
						<span>Voltar para o Cadastro</span>
					</button>
				</div>
			</div>
		</div>
	);
}
