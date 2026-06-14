import React, { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import {
	LayoutDashboard,
	ArrowUpCircle,
	ArrowDownCircle,
	CreditCard,
	AlertTriangle, // Para Dívidas
	Target, // Para Metas
	Briefcase, // Para Investimentos
	Upload, // Para Importador
	LogOut,
	Users, // Para Devedores
	Sun,
	Moon,
	ChevronDown,
} from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";
import { authService } from "../../../../packages/services/auth.service";
import EditProfileModal from "../components/EditProfileModal";
import { ImportarProvider } from "../contexts/ImportarContext";

export default function DashboardLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const [loading, setLoading] = useState(true);
	const [userProfile, setUserProfile] = useState<any>(null);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [theme, setTheme] = useState(() => {
		return localStorage.getItem("theme") || "light";
	});

	useEffect(() => {
		if (theme === "dark") {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}
		localStorage.setItem("theme", theme);
	}, [theme]);

	const toggleTheme = () => {
		setTheme((prev) => (prev === "light" ? "dark" : "light"));
	};

	const fetchUser = async () => {
		const user = await authService.getCurrentUser();
		setUserProfile(user);
	};

	useEffect(() => {
		const checkUser = async () => {
			const {
				data: { session },
			} = await supabase.auth.getSession();
			if (!session) {
				navigate("/login");
			} else {
				await fetchUser();
			}
			setLoading(false);
		};
		checkUser();
	}, [navigate]);

	const handleLogout = async () => {
		await supabase.auth.signOut();
		navigate("/login");
	};
	const fluxoPaths = ["/entradas", "/gastos", "/cartoes", "/devedores"];
	const planejamentoPaths = ["/dividas", "/metas", "/investimentos"];

	const isGroupActive = (paths: string[]) => paths.includes(location.pathname);

	const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		if (e.target.value) {
			navigate(e.target.value);
		}
	};

	if (loading) {
		return (
			<div className="min-h-screen bg-slate-50 dark:bg-slate-955 flex items-center justify-center">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
			</div>
		);
	}

	return (
		<ImportarProvider>
			<div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-250 flex flex-col">
				{/* Header / Navbar superior */}
				<header className="sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-50 transition-colors duration-200">
					{/* Primeira Linha: Marca, Modo Escuro e Perfil */}
					<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200 dark:shadow-none">
								<span className="text-white text-lg font-black">F</span>
							</div>
							<h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">
								FINANCE.
							</h2>
						</div>

						<div className="flex items-center gap-3">
							{/* Botão de Tema */}
							<button
								onClick={toggleTheme}
								className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-450 transition-all outline-none cursor-pointer"
								title={theme === "light" ? "Modo Escuro" : "Modo Claro"}
							>
								{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
							</button>

							<div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />

							{/* Dropdown do Perfil */}
							{userProfile && (
								<div className="relative">
									<button
										onClick={() => setIsDropdownOpen(!isDropdownOpen)}
										className="flex items-center gap-2 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all outline-none cursor-pointer"
									>
										{userProfile.avatar_url ? (
											<img src={userProfile.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full object-cover shadow-sm" />
										) : (
											<div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold shadow-sm text-sm">
												{userProfile.nome ? userProfile.nome.charAt(0).toUpperCase() : "U"}
											</div>
										)}
										<span className="hidden sm:inline font-bold text-sm text-slate-700 dark:text-slate-300 pr-1">{userProfile.nome}</span>
										<ChevronDown size={14} className="text-slate-400 hidden sm:inline" />
									</button>

									{isDropdownOpen && (
										<>
											<div className="fixed inset-0 z-30" onClick={() => setIsDropdownOpen(false)} />
											
											<div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl py-3 z-40 animate-in fade-in slide-in-from-top-2 duration-150">
												<div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800/80 mb-2">
													<p className="text-[10px] font-black text-slate-455 uppercase tracking-wider">Conta</p>
													<p className="font-bold text-slate-800 dark:text-slate-200 truncate">{userProfile.nome}</p>
													{userProfile.email && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{userProfile.email}</p>}
												</div>

												<button
													onClick={() => {
														setIsDropdownOpen(false);
														setIsEditModalOpen(true);
													}}
													className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-left cursor-pointer"
												>
													Editar perfil
												</button>

												<button
													onClick={handleLogout}
													className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all text-left cursor-pointer"
												>
													<LogOut size={16} />
													Sair
												</button>
											</div>
										</>
									)}
								</div>
							)}
						</div>
					</div>

					{/* Segunda Linha: Abas de navegação (rolagem horizontal suave em telas menores) */}
					<div className="border-t border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
						<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
							<nav className="flex items-center gap-3 py-3 overflow-x-auto no-scrollbar scroll-smooth flex-nowrap w-full">
								{/* Link: Dashboard */}
								<Link
									to="/home"
									className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
										location.pathname === "/home"
											? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100 dark:shadow-none"
											: "text-slate-500 dark:text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-800 dark:hover:text-slate-200"
									}`}>
									<LayoutDashboard size={14} />
									Dashboard
								</Link>

								{/* Select: Fluxo de Caixa */}
								<div className="relative">
									<select
										value={fluxoPaths.includes(location.pathname) ? location.pathname : ""}
										onChange={handleSelectChange}
										className={`appearance-none pr-8 pl-4 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer outline-none ${
											isGroupActive(fluxoPaths)
												? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100 dark:shadow-none"
												: "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850"
										}`}
									>
										<option value="" disabled className="text-slate-450 dark:text-slate-500">Fluxo de Caixa</option>
										<option value="/entradas" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold">📈 Entradas</option>
										<option value="/gastos" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold">📉 Gastos</option>
										<option value="/cartoes" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold">💳 Cartões</option>
										<option value="/devedores" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold">👥 Devedores</option>
									</select>
									<div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 ${isGroupActive(fluxoPaths) ? "text-white" : "text-slate-400"}`}>
										<ChevronDown size={12} />
									</div>
								</div>

								{/* Select: Planejamento */}
								<div className="relative">
									<select
										value={planejamentoPaths.includes(location.pathname) ? location.pathname : ""}
										onChange={handleSelectChange}
										className={`appearance-none pr-8 pl-4 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer outline-none ${
											isGroupActive(planejamentoPaths)
												? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100 dark:shadow-none"
												: "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850"
										}`}
									>
										<option value="" disabled className="text-slate-450 dark:text-slate-500">Planejamento</option>
										<option value="/dividas" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold">⚠️ Dívidas</option>
										<option value="/metas" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold">🎯 Metas</option>
										<option value="/investimentos" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold">💼 Investimentos</option>
									</select>
									<div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 ${isGroupActive(planejamentoPaths) ? "text-white" : "text-slate-400"}`}>
										<ChevronDown size={12} />
									</div>
								</div>

								{/* Link: Importar */}
								<Link
									to="/importar"
									className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
										location.pathname === "/importar"
											? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100 dark:shadow-none"
											: "text-slate-500 dark:text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-800 dark:hover:text-slate-200"
									}`}>
									<Upload size={14} />
									Importar
								</Link>
							</nav>
						</div>
					</div>
				</header>

				{/* Conteúdo Principal */}
				<main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
					<div className="w-full h-full relative" id="main-outlet-wrapper">
						<Outlet />
					</div>
				</main>

				<EditProfileModal 
					isOpen={isEditModalOpen} 
					onClose={() => setIsEditModalOpen(false)} 
					onUpdate={fetchUser} 
				/>
			</div>
		</ImportarProvider>
	);
}
