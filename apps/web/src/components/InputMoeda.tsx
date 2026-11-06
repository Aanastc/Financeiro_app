import { useEffect, type InputHTMLAttributes } from "react";

/**
 * Campo de dinheiro no estilo de app de banco: a pessoa digita só números e a
 * vírgula entra sozinha ("2" → 0,02 · "20000" → 200,00 · "123456" → 1.234,56).
 *
 * - Com `value` texto, devolve texto no formato brasileiro ("1.234,56"), que é
 *   o que os formulários já sabem ler (tiram os pontos e trocam a vírgula).
 * - Com `value` número, devolve número.
 * - Valor vindo do banco no formato "5000" ou "5000.5" é convertido para
 *   "5.000,00" / "5.000,50" ao abrir, para não ser lido errado depois.
 */

const formatar = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function lerMoeda(v: string | number | null | undefined): number {
	if (typeof v === "number") return Number.isFinite(v) ? v : 0;
	const t = String(v ?? "").trim();
	if (!t) return 0;
	const n = t.includes(",") ? Number(t.replace(/[^\d,-]/g, "").replace(",", ".")) : Number(t.replace(/[^\d.-]/g, ""));
	return Number.isFinite(n) ? n : 0;
}

const ehNumeroCru = (t: string) => /^-?\d+(\.\d+)?$/.test(t.trim());

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
	value: string | number | null | undefined;
	onChange: (valor: any) => void;
	/** Valor máximo de dígitos (padrão: até 99 bilhões) */
	maxDigitos?: number;
}

export default function InputMoeda({ value, onChange, maxDigitos = 13, placeholder = "0,00", ...resto }: Props) {
	const numerico = typeof value === "number";

	// Normaliza valor cru vindo do banco ("5000.5" -> "5.000,50") uma única vez
	useEffect(() => {
		if (typeof value === "string" && value && !value.includes(",") && ehNumeroCru(value)) {
			onChange(formatar(Number(value)));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [value]);

	const exibido =
		value === null || value === undefined || value === ""
			? ""
			: numerico
				? value === 0
					? ""
					: formatar(value as number)
				: String(value).includes(",")
					? String(value)
					: ehNumeroCru(String(value))
						? formatar(Number(value))
						: String(value);

	return (
		<input
			{...resto}
			type="text"
			inputMode="numeric"
			autoComplete="off"
			placeholder={placeholder}
			value={exibido}
			onChange={(e) => {
				const digitos = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, maxDigitos);
				if (!digitos || Number(digitos) === 0) {
					onChange(numerico ? 0 : "");
					return;
				}
				const n = Number(digitos) / 100;
				onChange(numerico ? n : formatar(n));
			}}
		/>
	);
}
