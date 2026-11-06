import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../../../packages/services/supabase";
import { conviteService } from "../../../packages/services/convite.service";

// Guarda ?convite= da URL para vincular a conta depois do cadastro/login
conviteService.capturarDaUrl();
import { Toaster } from "react-hot-toast";
import PageLoader from "./components/PageLoader";
import LandingPage from "./pages/LandingPage";

// Páginas carregadas sob demanda: a landing não baixa ExcelJS, Recharts, Gemini etc.
const DashboardLayout = lazy(() => import("./layouts/DashboardLayout"));
const HomeWeb = lazy(() => import("./HomeWeb"));
const LoginWeb = lazy(() => import("./pages/LoginWeb"));
const VerifyWeb = lazy(() => import("./pages/VerifyWeb"));
const ForgotPasswordWeb = lazy(() => import("./pages/ForgotPasswordWeb"));
const ResetPasswordWeb = lazy(() => import("./pages/ResetPasswordWeb"));
const EntradasWeb = lazy(() => import("./pages/Entradas"));
const GastosWeb = lazy(() => import("./pages/Gastos"));
const RegisterWeb = lazy(() => import("./pages/RegisterWeb"));
const Cartoes = lazy(() => import("./pages/Cartoes"));
const DividasWeb = lazy(() => import("./pages/Dividas"));
const MetasWeb = lazy(() => import("./pages/Metas"));
const InvestimentosWeb = lazy(() => import("./pages/Investimentos"));
const EmpresaPage = lazy(() => import("./pages/Empresa"));
const Contas = lazy(() => import("./pages/Contas"));
const ImportadorWeb = lazy(() => import("./pages/Importador"));
const Devedores = lazy(() => import("./pages/Devedores"));
const Faturas = lazy(() => import("./pages/Faturas"));
const ConsultorInteligente = lazy(() => import("./pages/ConsultorInteligente"));

/**
 * Se o link de recuperação de senha cair em qualquer rota (ex.: Redirect URL não
 * configurada no Supabase), leva o usuário para a tela de nova senha em vez de
 * deixá-lo logado sem trocar a senha.
 */
function RecuperacaoSenhaListener() {
	const navigate = useNavigate();
	useEffect(() => {
		const { data } = supabase.auth.onAuthStateChange((event) => {
			if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/reset-password") {
				navigate("/reset-password", { replace: true });
			}
		});
		return () => data.subscription.unsubscribe();
	}, [navigate]);
	return null;
}

export default function App() {
	return (
		<BrowserRouter>
			<RecuperacaoSenhaListener />
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
			<Suspense fallback={<PageLoader fullScreen />}>
			<Routes>
				{/* Landing Page Inicial */}
				<Route path="/" element={<LandingPage />} />

				{/* Rota Inicial: Cadastro */}
				<Route path="/register" element={<RegisterWeb />} />

				{/* Outras Rotas Públicas */}
				<Route path="/login" element={<LoginWeb />} />
				<Route path="/verify" element={<VerifyWeb />} />
				<Route path="/forgot-password" element={<ForgotPasswordWeb />} />
				<Route path="/reset-password" element={<ResetPasswordWeb />} />

				{/* Rotas Protegidas (Dashboard) */}
				<Route element={<DashboardLayout />}>
					<Route path="/home" element={<HomeWeb />} />
					<Route path="/entradas" element={<EntradasWeb />} />
					<Route path="/gastos" element={<GastosWeb />} />
					<Route path="/contas" element={<Contas />} />
					<Route path="/cartoes" element={<Cartoes />} />
					<Route path="/faturas" element={<Faturas />} />
					<Route path="/faturas/:cartao_id" element={<Faturas />} />
					<Route path="/devedores" element={<Devedores />} />
					<Route path="/dividas" element={<DividasWeb />} />
					<Route path="/metas" element={<MetasWeb />} />
					<Route path="/investimentos" element={<InvestimentosWeb />} />
					<Route path="/empresa" element={<EmpresaPage />} />
					<Route path="/importar" element={<ImportadorWeb />} />
					<Route path="/consultor" element={<ConsultorInteligente />} />
				</Route>

				{/* Redirecionamento se a rota não for encontrada */}
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
			</Suspense>
		</BrowserRouter>
	);
}
