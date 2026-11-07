interface CopyrightProps {
	className?: string;
}

/** Selo de direitos reservados da empresa, usado em todas as áreas do app. */
export default function Copyright({ className = "" }: CopyrightProps) {
	return (
		<p className={`text-[11px] text-slate-500 dark:text-slate-400 text-center ${className}`}>
			© {new Date().getFullYear()} ANA LETICIA TECH. Todos os direitos reservados.
		</p>
	);
}
