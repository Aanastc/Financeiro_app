import { supabase } from "../../../../packages/services/supabase";

/**
 * Aviso de lançamento possivelmente REPETIDO (lançamentos feitos à mão).
 *
 * Não bloqueia nem junta nada: duas compras iguais no mesmo dia podem ser reais
 * (dois cafés). Só encontra os parecidos para o app perguntar antes de gravar.
 * Parecido = mesmo valor (±1 centavo), data a até 3 dias e descrição semelhante.
 */

export interface Candidato {
	descricao: string;
	valor: number;
	data: string; // AAAA-MM-DD
}

export interface Parecido<T extends Candidato = Candidato> {
	candidato: T;
	existente: { descricao: string; valor: number; data: string };
}

const DIAS = 3;
const IGNORAR = new Set(["de", "da", "do", "das", "dos", "e", "com", "para", "em", "a", "o", "x", "un", "und"]);

/** Texto comparável: sem acento, sem "(2/6)", "Parcela 2/6", "(Parte Fulana)", "[Grupo]" e " - Nome" no fim. */
export function normalizarDescricao(t: string): string {
	return (t || "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/\s*\[[^\]]*\]\s*$/, "")
		.replace(/\s*\(parte [^)]*\)\s*$/, "")
		.replace(/\s*-?\s*parcela\s*\d+\s*\/\s*\d+/g, "")
		.replace(/\(\d+\/\d+\)/g, "")
		.replace(/[^a-z0-9 ]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

const palavras = (t: string) => normalizarDescricao(t).split(" ").filter((p) => p.length > 1 && !IGNORAR.has(p));

/** Descrições parecidas: uma contém o começo da outra ou dividem a maior parte das palavras. */
export function descricoesParecidas(a: string, b: string): boolean {
	const na = normalizarDescricao(a);
	const nb = normalizarDescricao(b);
	if (!na || !nb) return false;
	if (na === nb) return true;
	const ini = (s: string) => s.slice(0, 18);
	if (na.length >= 6 && nb.length >= 6 && (na.includes(ini(nb)) || nb.includes(ini(na)))) return true;
	const pa = new Set(palavras(a));
	const pb = new Set(palavras(b));
	if (pa.size === 0 || pb.size === 0) return false;
	const comuns = [...pa].filter((p) => pb.has(p)).length;
	return comuns / Math.min(pa.size, pb.size) >= 0.6;
}

const somarDias = (iso: string, dias: number) => {
	const d = new Date(`${iso}T12:00:00`);
	d.setDate(d.getDate() + dias);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const distanciaDias = (a: string, b: string) => Math.abs((new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86_400_000);

/** Procura, entre os lançamentos já gravados, os parecidos com cada candidato. */
export async function procurarParecidos<T extends Candidato>(usuarioId: string, candidatos: T[]): Promise<Parecido<T>[]> {
	const validos = candidatos.filter((c) => c.valor > 0 && /^\d{4}-\d{2}-\d{2}/.test(c.data) && c.descricao?.trim());
	if (!usuarioId || validos.length === 0) return [];
	const datas = validos.map((c) => c.data.slice(0, 10)).sort();
	const valores = [...new Set(validos.map((c) => Math.round(c.valor * 100) / 100))];

	const { data, error } = await supabase
		.from("transacoes")
		.select("descricao, valor, data, observacao")
		.eq("usuario_id", usuarioId)
		.in("tipo", ["DESPESA", "RECEITA"])
		.gte("data", somarDias(datas[0], -DIAS))
		.lte("data", somarDias(datas[datas.length - 1], DIAS))
		.gte("valor", Math.min(...valores) - 0.01)
		.lte("valor", Math.max(...valores) + 0.01)
		.limit(2000);
	if (error || !data) return [];

	const descricoesDe = (t: any) => {
		const lista = [String(t.descricao || "")];
		try {
			const meta = t.observacao?.trim().startsWith("{") ? JSON.parse(t.observacao) : null;
			if (meta?.descricao_original) lista.push(String(meta.descricao_original));
		} catch {
			/* observação em texto livre */
		}
		return lista;
	};

	const achados: Parecido<T>[] = [];
	for (const c of validos) {
		const ex = (data as any[]).find(
			(t) =>
				Math.abs(Number(t.valor) - c.valor) < 0.011 &&
				distanciaDias(String(t.data).slice(0, 10), c.data.slice(0, 10)) <= DIAS &&
				descricoesDe(t).some((d) => descricoesParecidas(d, c.descricao)),
		);
		if (ex) achados.push({ candidato: c, existente: { descricao: String(ex.descricao || ""), valor: Number(ex.valor), data: String(ex.data).slice(0, 10) } });
	}
	return achados;
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");

/** Texto do aviso (até 6 itens listados). */
export function textoAviso(achados: Parecido[]): string {
	const linhas = achados
		.slice(0, 6)
		.map((a) => `• ${a.candidato.descricao.slice(0, 60)} — ${moeda(a.candidato.valor)} (já existe em ${dataBR(a.existente.data)})`);
	const mais = achados.length > 6 ? `\n… e mais ${achados.length - 6}` : "";
	return `${achados.length === 1 ? "Este lançamento parece já ter sido feito" : `${achados.length} lançamentos parecem já ter sido feitos`}:\n\n${linhas.join("\n")}${mais}`;
}
