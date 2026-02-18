import React, { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import {
	LayoutDashboard,
	ArrowUpCircle,
	ArrowDownCircle,
	CreditCard, // Ícone para Cartões
	LogOut,
} from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";

export default function DashboardLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const checkUser = async () => {
			const {
				data: { session },
			} = await supabase.auth.getSession();
			if (!session) {
				navigate("/login");
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
	];

	return (
		<div className="flex h-screen bg-[#FCF8F8]">
			{/* Sidebar */}
			<aside className="w-64 bg-white border-r border-gray-100 flex flex-col p-6">
				<div className="mb-10 px-4">
					<h2 className="text-2xl font-black text-pink-500 italic">FINANCE.</h2>
				</div>

				<nav className="flex-1 space-y-2">
					{menuItems.map((item) => (
						<Link
							key={item.path}
							to={item.path}
							className={`flex items-center gap-3 p-4 rounded-2xl font-bold transition-all ${
								location.pathname === item.path
									? "bg-pink-500 text-white shadow-lg shadow-pink-100"
									: "text-gray-400 hover:bg-pink-50 hover:text-pink-500"
							}`}>
							{item.icon}
							{item.label}
						</Link>
					))}
				</nav>

				<button
					onClick={handleLogout}
					className="flex items-center gap-3 p-4 rounded-2xl font-bold text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all">
					<LogOut size={20} />
					Sair
				</button>
			</aside>

			{/* Main Content */}
			<main className="flex-1 overflow-y-auto">
				<Outlet />
			</main>
		</div>
	);
}
