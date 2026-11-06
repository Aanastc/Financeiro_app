import { useEffect, useState } from "react";

/** true quando o app está no modo escuro (classe "dark" no <html>); atualiza ao trocar o tema. */
export function useTheme(): boolean {
	const ler = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");
	const [escuro, setEscuro] = useState(ler);
	useEffect(() => {
		const obs = new MutationObserver(() => setEscuro(ler()));
		obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
		return () => obs.disconnect();
	}, []);
	return escuro;
}
