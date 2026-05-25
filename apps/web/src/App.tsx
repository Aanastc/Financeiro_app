import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import DashboardLayout from "./layouts/DashboardLayout";
import HomeWeb from "./HomeWeb";
import LoginWeb from "./pages/LoginWeb";
import VerifyWeb from "./pages/VerifyWeb";
import EntradasWeb from "./pages/Entradas";
import GastosWeb from "./pages/Gastos";
import RegisterWeb from "./pages/RegisterWeb";
import Cartoes from "./pages/Cartoes";
import DividasWeb from "./pages/Dividas";
import MetasWeb from "./pages/Metas";
import InvestimentosWeb from "./pages/Investimentos";
import ImportadorWeb from "./pages/Importador";

export default function App() {
	return (
		<BrowserRouter>
			<Toaster
				position="top-right"
				toastOptions={{
					style: {
						borderRadius: "20px",
						background: "#3D3030",
						color: "#fff",
						fontWeight: "bold",
						fontSize: "14px",
						padding: "16px 24px",
					},
				}}
			/>
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
					<Route path="/dividas" element={<DividasWeb />} />
					<Route path="/metas" element={<MetasWeb />} />
					<Route path="/investimentos" element={<InvestimentosWeb />} />
					<Route path="/importar" element={<ImportadorWeb />} />
				</Route>

				{/* Redirecionamento para Cadastro se a rota não for encontrada */}
				<Route path="/" element={<Navigate to="/register" replace />} />
				<Route path="*" element={<Navigate to="/register" replace />} />
			</Routes>
		</BrowserRouter>
	);
}
