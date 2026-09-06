import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
	TrendingUp, 
	ArrowRight, 
	Shield, 
	Sparkles, 
	CreditCard, 
	Users, 
	BarChart3, 
	Download 
} from "lucide-react";
import { useEffect } from "react";
import { supabase } from "../../../../packages/services/supabase";

export default function LandingPage() {
	const navigate = useNavigate();

	useEffect(() => {
		// Se o usuário cair na Landing Page após o OAuth (por conta do redirecionamento do Supabase) 
		// ou já estiver logado, manda ele direto pra Home.
		supabase.auth.getSession().then(({ data: { session } }) => {
			if (session) {
				navigate("/home");
			}
		});

		// Também escuta por mudanças de autenticação (como o retorno do login social)
		const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
			if (session) {
				navigate("/home");
			}
		});

		return () => {
			authListener.subscription.unsubscribe();
		};
	}, [navigate]);

	const containerVariants = {
		hidden: { opacity: 0 },
		visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
	};

	const itemVariants = {
		hidden: { y: 30, opacity: 0 },
		visible: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 100 } }
	};

	return (
		<div className="min-h-screen bg-gradient-to-b from-slate-50 via-pink-50/20 to-slate-50 dark:from-slate-950 dark:via-indigo-950/20 dark:to-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans transition-colors duration-300">
			{/* NAVBAR */}
			<header className="max-w-7xl mx-auto w-full px-6 py-6 flex justify-between items-center z-10">
				<div className="flex items-center gap-2">
					<div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100 dark:shadow-indigo-900/20">
						<span className="text-white text-xl font-black">T</span>
					</div>
					<span className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">TECH FINANCE.</span>
				</div>
				<div className="flex items-center gap-4">
					<Link 
						to="/login" 
						className="px-5 py-2.5 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
					>
						Entrar
					</Link>
					<Link 
						to="/register" 
						className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md hover:shadow-lg dark:shadow-indigo-900/30"
					>
						Registrar
					</Link>
				</div>
			</header>

			{/* HERO SECTION */}
			<main className="flex-1 flex flex-col justify-center items-center px-6 text-center max-w-4xl mx-auto py-12">
				<motion.div 
					variants={containerVariants}
					initial="hidden"
					animate="visible"
					className="space-y-8"
				>
					<motion.div variants={itemVariants} className="inline-flex items-center gap-2 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-400 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest">
						<Sparkles size={14} /> Inteligência Financeira Integrada
					</motion.div>

					<motion.h1 
						variants={itemVariants}
						className="text-5xl md:text-7xl font-black text-slate-900 dark:text-white tracking-tight leading-none"
					>
						Tome o controle do seu{" "}
						<span className="bg-gradient-to-r from-indigo-600 via-pink-500 to-rose-500 dark:from-indigo-400 dark:via-pink-400 dark:to-rose-400 bg-clip-text text-transparent">
							futuro financeiro
						</span>
					</motion.h1>

					<motion.p 
						variants={itemVariants}
						className="text-slate-500 dark:text-slate-400 text-lg md:text-xl font-medium max-w-2xl mx-auto"
					>
						Uma plataforma completa e moderna para monitorar gastos, gerenciar faturas de cartões, acompanhar dívidas de terceiros e impulsionar seus investimentos com insights de IA.
					</motion.p>

					<motion.div 
						variants={itemVariants} 
						className="flex flex-col sm:flex-row justify-center items-center gap-4"
					>
						<Link 
							to="/register" 
							className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-100 dark:shadow-indigo-900/30 text-lg group"
						>
							Começar Agora <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
						</Link>
						<Link 
							to="/login" 
							className="w-full sm:w-auto flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 px-8 py-4 rounded-2xl font-bold transition-all shadow-sm text-lg"
						>
							Acessar Minha Conta
						</Link>
					</motion.div>

					{/* 🤖 ANDROID DOWNLOAD BUTTON (COMMENTED FOR FUTURE ACTIVATION)
						Caminho do Projeto Mobile: C:\Users\anale\OneDrive\Documentos\Carreira\Projetos para Portifolio\finance-app\apps\mobile
						Quando o app Android estiver pronto para compilação/distribuição final, descomente o bloco de código abaixo.
					*/}
					{/*
					<motion.div variants={itemVariants} className="pt-4 flex justify-center">
						<a 
							href="/downloads/finance-app-release.apk" 
							className="flex items-center gap-2.5 bg-slate-800 hover:bg-slate-950 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-md text-sm"
							title="Instalar App Android (C:\Users\anale\OneDrive\Documentos\Carreira\Projetos para Portifolio\finance-app\apps\mobile)"
						>
							<Download size={16} />
							<span>Baixar Aplicativo Android (.APK)</span>
						</a>
					</motion.div>
					*/}
				</motion.div>

				{/* FEATURES GRID */}
				<motion.section 
					variants={containerVariants}
					initial="hidden"
					whileInView="visible"
					viewport={{ once: true, margin: "-100px" }}
					className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mt-24 pt-12 border-t border-slate-200/60 dark:border-slate-800"
				>
					<motion.div 
						variants={itemVariants}
						className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm text-left space-y-4 hover:shadow-md transition-shadow"
					>
						<div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center">
							<Sparkles size={24} />
						</div>
						<h3 className="font-black text-xl text-slate-800 dark:text-white">Insights com IA</h3>
						<p className="text-slate-500 dark:text-slate-400 font-medium text-sm leading-relaxed">
							Previsões inteligentes e dicas personalizadas baseadas nos seus hábitos de gastos, integradas diretamente com a API do Gemini.
						</p>
					</motion.div>

					<motion.div 
						variants={itemVariants}
						className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm text-left space-y-4 hover:shadow-md transition-shadow"
					>
						<div className="w-12 h-12 bg-pink-50 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400 rounded-2xl flex items-center justify-center">
							<CreditCard size={24} />
						</div>
						<h3 className="font-black text-xl text-slate-800 dark:text-white">Faturas e Cartões</h3>
						<p className="text-slate-500 dark:text-slate-400 font-medium text-sm leading-relaxed">
							Visualize faturas mensais agrupadas, verifique o limite do cartão e busque rapidamente despesas específicas com nosso filtro de busca inteligente.
						</p>
					</motion.div>

					<motion.div 
						variants={itemVariants}
						className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm text-left space-y-4 hover:shadow-md transition-shadow"
					>
						<div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center">
							<Users size={24} />
						</div>
						<h3 className="font-black text-xl text-slate-800 dark:text-white">Cobrança de Terceiros</h3>
						<p className="text-slate-500 dark:text-slate-400 font-medium text-sm leading-relaxed">
							Gerencie despesas compartilhadas ou empréstimos. Lance pagamentos parciais, veja saldos restantes e envie lembretes estruturados via WhatsApp.
						</p>
					</motion.div>
				</motion.section>
			</main>

			{/* FOOTER */}
			<footer className="py-8 text-center text-xs text-slate-400 dark:text-slate-600 border-t border-slate-100 dark:border-slate-800 mt-20">
				<p>© {new Date().getFullYear()} ANA LETICIA TECH LTDA. Todos os direitos reservados. Projeto local seguro.</p>
			</footer>
		</div>
	);
}
