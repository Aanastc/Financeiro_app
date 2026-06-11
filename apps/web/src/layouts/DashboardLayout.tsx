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

	if (loading) return null; // Ou um loading spinner bonito

	const menuItems = [
		{ path: "/home", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
		{ path: "/entradas", label: "Entradas", icon: <ArrowUpCircle size={20} /> },
		{ path: "/gastos", label: "Gastos", icon: <ArrowDownCircle size={20} /> },
		{ path: "/cartoes", label: "Cartões", icon: <CreditCard size={20} /> },
		{ path: "/devedores", label: "Devedores", icon: <Users size={20} /> },
		{ path: "/dividas", label: "Dívidas", icon: <AlertTriangle size={20} /> },
		{ path: "/metas", label: "Metas", icon: <Target size={20} /> },
		{ path: "/investimentos", label: "Investimentos", icon: <Briefcase size={20} /> },
		{ path: "/importar", label: "Importar", icon: <Upload size={20} /> },
	];

	return (
		<ImportarProvider>
			<div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-200">
				{/* Sidebar */}
				<aside className="w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-850 flex flex-col p-6 shadow-sm z-10 transition-colors duration-200">
					<div className="mb-10 px-4">
						<h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter flex items-center gap-2">
							<div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
								<span className="text-white text-lg">F</span>
							</div>
							FINANCE.
						</h2>
					</div>

					<nav className="flex-1 space-y-2 overflow-y-auto pr-1">
						{menuItems.map((item) => {
							const isActive = location.pathname === item.path;
							return (
								<Link
									key={item.path}
									to={item.path}
									className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${
										isActive
											? "bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none"
											: "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
									}`}>
									<div className={`${isActive ? "text-white" : "text-slate-400 dark:text-slate-550"}`}>
										{item.icon}
									</div>
									{item.label}
								</Link>
							);
						})}
					</nav>

					<div className="mt-auto border-t border-slate-100 dark:border-slate-800 pt-4 px-2 space-y-2">
						{userProfile && (
							<div className="flex items-center justify-between mb-2 px-2">
								<div className="flex items-center gap-3 overflow-hidden">
									{userProfile.avatar_url ? (
										<img src={userProfile.avatar_url} alt="Avatar" className="w-10 h-10 rounded-full object-cover shadow-sm" />
									) : (
										<div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold shadow-sm">
											{userProfile.nome ? userProfile.nome.charAt(0).toUpperCase() : "U"}
										</div>
									)}
									<div className="flex flex-col overflow-hidden">
										<span className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate" title={userProfile.nome}>{userProfile.nome}</span>
										<button 
											onClick={() => setIsEditModalOpen(true)}
											className="text-xs text-indigo-600 dark:text-indigo-400 text-left hover:underline"
										>
											Editar perfil
										</button>
									</div>
								</div>
							</div>
						)}
						
						{/* Dark Mode Toggle */}
						<button
							onClick={toggleTheme}
							className="flex w-full items-center gap-3 px-4 py-3 rounded-2xl font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all text-left">
							<div className="text-slate-400 dark:text-slate-550">
								{theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
							</div>
							{theme === "light" ? "Modo Escuro" : "Modo Claro"}
						</button>

						<button
							onClick={handleLogout}
							className="flex w-full items-center gap-3 px-4 py-3 rounded-2xl font-bold text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600 dark:hover:text-rose-450 transition-all text-left">
							<div className="text-slate-400 dark:text-slate-500">
								<LogOut size={20} />
							</div>
							Sair
						</button>
					</div>
				</aside>

				{/* Main Content */}
				<main className="flex-1 overflow-y-auto">
					<Outlet />
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
