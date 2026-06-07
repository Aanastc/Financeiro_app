import { Link } from "react-router-dom";
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

export default function LandingPage() {
	const containerVariants = {
		hidden: { opacity: 0 },
		visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
	};

	const itemVariants = {
		hidden: { y: 30, opacity: 0 },
		visible: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 100 } }
	};

	return (
		<div className="min-h-screen bg-gradient-to-b from-slate-50 via-pink-50/20 to-slate-50 text-slate-800 flex flex-col font-sans">
			{/* NAVBAR */}
			<header className="max-w-7xl mx-auto w-full px-6 py-6 flex justify-between items-center z-10">
				<div className="flex items-center gap-2">
					<div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
						<span className="text-white text-xl font-black">F</span>
					</div>
					<span className="text-2xl font-black text-slate-900 tracking-tighter">FINANCE.</span>
				</div>
				<div className="flex items-center gap-4">
					<Link 
						to="/login" 
						className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:text-slate-900 transition-colors"
					>
						Entrar
					</Link>
					<Link 
						to="/register" 
						className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md hover:shadow-lg"
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
					<motion.div variants={itemVariants} className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest">
						<Sparkles size={14} /> Inteligência Financeira Integrada
					</motion.div>

					<motion.h1 
						variants={itemVariants}
						className="text-5xl md:text-7xl font-black text-slate-900 tracking-tight leading-none"
					>
						Tome o controle do seu{" "}
						<span className="bg-gradient-to-r from-indigo-600 via-pink-500 to-rose-500 bg-clip-text text-transparent">
							futuro financeiro
						</span>
					</motion.h1>

					<motion.p 
						variants={itemVariants}
						className="text-slate-500 text-lg md:text-xl font-medium max-w-2xl mx-auto"
					>
						Uma plataforma completa e moderna para monitorar gastos, gerenciar faturas de cartões, acompanhar dívidas de terceiros e impulsionar seus investimentos com insights de IA.
					</motion.p>

					<motion.div 
						variants={itemVariants} 
						className="flex flex-col sm:flex-row justify-center items-center gap-4"
					>
						<Link 
							to="/register" 
							className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-100 text-lg group"
						>
							Começar Agora <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
						</Link>
						<Link 
							to="/login" 
							className="w-full sm:w-auto flex items-center justify-center bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-8 py-4 rounded-2xl font-bold transition-all shadow-sm text-lg"
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
					className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mt-24 pt-12 border-t border-slate-200/60"
				>
					<motion.div 
						variants={itemVariants}
						className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-left space-y-4 hover:shadow-md transition-shadow"
					>
						<div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
							<Sparkles size={24} />
						</div>
						<h3 className="font-black text-xl text-slate-800">Insights com IA</h3>
						<p className="text-slate-500 font-medium text-sm leading-relaxed">
							Previsões inteligentes e dicas personalizadas baseadas nos seus hábitos de gastos, integradas diretamente com a API do Gemini.
						</p>
					</motion.div>

					<motion.div 
						variants={itemVariants}
						className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-left space-y-4 hover:shadow-md transition-shadow"
					>
						<div className="w-12 h-12 bg-pink-50 text-pink-600 rounded-2xl flex items-center justify-center">
							<CreditCard size={24} />
						</div>
						<h3 className="font-black text-xl text-slate-800">Faturas e Cartões</h3>
						<p className="text-slate-500 font-medium text-sm leading-relaxed">
							Visualize faturas mensais agrupadas, verifique o limite do cartão e busque rapidamente despesas específicas com nosso filtro de busca inteligente.
						</p>
					</motion.div>

					<motion.div 
						variants={itemVariants}
						className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-left space-y-4 hover:shadow-md transition-shadow"
					>
						<div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
							<Users size={24} />
						</div>
						<h3 className="font-black text-xl text-slate-800">Cobrança de Terceiros</h3>
						<p className="text-slate-500 font-medium text-sm leading-relaxed">
							Gerencie despesas compartilhadas ou empréstimos. Lance pagamentos parciais, veja saldos restantes e envie lembretes estruturados via WhatsApp.
						</p>
					</motion.div>
				</motion.section>
			</main>

			{/* FOOTER */}
			<footer className="py-8 text-center text-xs text-slate-400 border-t border-slate-100 mt-20">
				<p>© {new Date().getFullYear()} FinanceApp. Todos os direitos reservados. Projeto local seguro.</p>
			</footer>
		</div>
	);
}
