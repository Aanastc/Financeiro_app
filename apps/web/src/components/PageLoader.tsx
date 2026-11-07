import { Loader2 } from "lucide-react";

interface PageLoaderProps {
	fullScreen?: boolean;
}

/** Fallback exibido enquanto uma página carregada sob demanda (React.lazy) é baixada. */
export default function PageLoader({ fullScreen = false }: PageLoaderProps) {
	return (
		<div
			role="status"
			aria-label="Carregando"
			className={`flex items-center justify-center ${fullScreen ? "min-h-screen bg-slate-50 dark:bg-slate-950" : "min-h-[50vh]"}`}
		>
			<Loader2 className="animate-spin text-indigo-500" size={32} aria-hidden="true" />
		</div>
	);
}
