import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "./layouts/DashboardLayout";
import HomeWeb from "./HomeWeb";
import Auth from "./pages/Auth";
import EntradasWeb from "./pages/Entradas";
import GastosWeb from "./pages/Gastos";

export default function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/login" element={<Auth />} />

				<Route element={<DashboardLayout />}>
					<Route path="/home" element={<HomeWeb />} />
					<Route path="/entradas" element={<EntradasWeb />} />
					<Route path="/gastos" element={<GastosWeb />} />
					<Route path="/" element={<Navigate to="/home" />} />
				</Route>

				<Route path="*" element={<Navigate to="/login" />} />
			</Routes>
		</BrowserRouter>
	);
}
