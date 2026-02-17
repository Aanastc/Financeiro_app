import React from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
	LayoutDashboard,
	ArrowUpCircle,
	ArrowDownCircle,
	Target,
	LogOut,
} from "lucide-react";
// Importe o authService
import { authService } from "../../../../packages/services/auth.service";

export default function DashboardLayout() {
	const navigate = useNavigate();
	const location = useLocation();

	// Função para deslogar
	const handleLogout = async () => {
		try {
			await authService.logout();
			// Após deslogar no Supabase, mandamos para o login
			navigate("/login");
		} catch (error) {
			console.error("Erro ao sair:", error);
			alert("Erro ao tentar sair. Tente novamente.");
		}
	};

	const menuItems = [
		{
			label: "Visão Geral",
			icon: <LayoutDashboard size={18} />,
			path: "/home",
		},
		{ label: "Entradas", icon: <ArrowUpCircle size={18} />, path: "/entradas" },
		{ label: "Gastos", icon: <ArrowDownCircle size={18} />, path: "/gastos" },
	];

	return (
		<div className="min-h-screen w-full bg-[#FCF8F8] flex flex-col font-sans">
			{/* Navigation Top Bar */}
			<nav className="h-16 bg-white border-b border-gray-100 px-8 flex items-center justify-between sticky top-0 z-50 shadow-sm">
				<div className="flex items-center gap-8">
					<h1 className="text-2xl font-black tracking-tighter text-[#E91E63]">
						Fluxo<span className="text-[#4CAF50]">Me</span>
					</h1>

					<div className="hidden md:flex items-center gap-1">
						{menuItems.map((item) => (
							<button
								key={item.path}
								onClick={() => navigate(item.path)}
								className={`flex items-center px-4 py-2 rounded-full text-sm font-bold transition-all ${
									location.pathname === item.path
										? "bg-[#4CAF50] text-white"
										: "text-[#5D4037] hover:bg-[#FCE4EC] hover:text-[#E91E63]"
								}`}>
								<span className="mr-2">{item.icon}</span>
								{item.label}
							</button>
						))}
					</div>
				</div>

				{/* Adicionado o onClick aqui */}
				<button
					onClick={handleLogout}
					className="flex items-center gap-2 text-[#5D4037] font-bold text-sm hover:text-[#E91E63] transition-colors p-2 rounded-lg hover:bg-red-50">
					<LogOut size={18} />
					Sair
				</button>
			</nav>

			{/* Main Content Area */}
			<main className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-10">
				<Outlet />
			</main>
		</div>
	);
}
