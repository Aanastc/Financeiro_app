import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "./layouts/DashboardLayout";
import HomeWeb from "./HomeWeb";
import LoginWeb from "./pages/LoginWeb";
import VerifyWeb from "./pages/VerifyWeb";
import EntradasWeb from "./pages/Entradas";
import GastosWeb from "./pages/Gastos";
import RegisterWeb from "./pages/RegisterWeb";
import Cartoes from "./pages/Cartoes";

export default function App() {
	return (
		<BrowserRouter>
			<Routes>
				{/* Rota Inicial: Cadastro */}
				<Route path="/register" element={<RegisterWeb />} />

				{/* Outras Rotas Públicas */}
				<Route path="/login" element={<LoginWeb />} />
				<Route path="/verify" element={<VerifyWeb />} />

				{/* Rotas Protegidas (Dashboard) */}
				<Route element={<DashboardLayout />}>
					<Route path="/home" element={<HomeWeb />} />
					<Route path="/entradas" element={<EntradasWeb />} />
					<Route path="/gastos" element={<GastosWeb />} />
					<Route path="/cartoes" element={<Cartoes />} />
				</Route>

				{/* Redirecionamento para Cadastro se a rota não for encontrada */}
				<Route path="/" element={<Navigate to="/register" replace />} />
				<Route path="*" element={<Navigate to="/register" replace />} />
			</Routes>
		</BrowserRouter>
	);
}
