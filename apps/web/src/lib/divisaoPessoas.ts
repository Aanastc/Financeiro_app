/**
 * Junta, por pessoa, o que ela te deve e o que você deve a ela (como o Splitwise):
 * uma pessoa = um saldo só.
 */

const lerMeta = (obs?: string | null): any => {
	try {
		return obs && obs.trim().startsWith("{") ? JSON.parse(obs) : {};
	} catch {
		return {};
	}
};
const centavos = (v: number) => Math.round(v * 100) / 100;

export interface ItemPessoa {
	id: string;
	data: string;
	descricao: string;
	valor: number;
	pago: number;
	aberto: number;
	quitado: boolean;
	direcao: "RECEBER" | "PAGAR";
	opcional: boolean;
	recusado: boolean;
	compensado: boolean;
	grupo?: string;
	raw: any;
}

export interface PessoaSaldo {
	contato: any;
	receber: number;
	pagar: number;
	saldo: number; // > 0: te devem · < 0: você deve
	proximo: { data: string; valor: number; receber: boolean } | null;
	itens: ItemPessoa[];
	/** formato antigo do card de devedor (WhatsApp, Excel) */
	devedor: any | null;
}

/** "Projetor (2/6) (Parte Julia) - Claudiney" -> "Projetor (2/6)" */
const limpar = (t: string, nome: string) =>
	String(t || "")
		.replace(/\s*\(Parte [^)]*\)\s*$/i, "")
		.replace(new RegExp(`\\s*-\\s*${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "")
		.replace(/\s*\[[^\]]*\]\s*$/, "")
		.trim();

export function montarPessoas(devedores: any[], credores: any[]): PessoaSaldo[] {
	const mapa = new Map<string, PessoaSaldo>();
	const pegar = (contato: any) => {
		const p = mapa.get(contato.id) || { contato, receber: 0, pagar: 0, saldo: 0, proximo: null, itens: [], devedor: null };
		mapa.set(contato.id, p);
		return p;
	};

	for (const d of devedores || []) {
		if (!d?.contato?.id) continue;
		const p = pegar(d.contato);
		p.devedor = d;
		for (const t of d.itens || []) {
			const meta = lerMeta(t.observacao);
			const valor = Number(t.valor) || 0;
			const recusado = meta.resposta_cobranca === "recusada";
			const pago = t.terceiro_pago ? valor : Math.min(valor, Number(meta.valor_pago) || 0);
			const aberto = t.terceiro_pago || recusado ? 0 : centavos(valor - pago);
			p.itens.push({
				id: t.id,
				data: t.data,
				descricao: limpar(meta.descricao_original ? `${meta.descricao_original}${meta.total_parcelas > 1 ? ` (${meta.parcela}/${meta.total_parcelas})` : ""}` : t.descricao, d.contato.nome),
				valor,
				pago,
				aberto,
				quitado: Boolean(t.terceiro_pago),
				direcao: "RECEBER",
				opcional: Boolean(meta.opcional),
				recusado,
				compensado: Array.isArray(meta.pagamentos) && meta.pagamentos.some((x: any) => x.tipo === "compensacao"),
				grupo: meta.grupo_nome,
				raw: t,
			});
			p.receber = centavos(p.receber + aberto);
		}
	}

	for (const c of credores || []) {
		if (!c?.contato?.id) continue;
		const p = pegar(c.contato);
		for (const t of c.itens || []) {
			const meta = lerMeta(t.observacao);
			const valor = Number(t.valor ?? t.valor_parcela_usuario) || 0;
			const pago = t.quitado ? valor : Math.min(valor, Number(t.valor_pago) || 0);
			const aberto = t.quitado ? 0 : centavos(valor - pago);
			p.itens.push({
				id: t.id,
				data: t.data,
				descricao: limpar(t.descricao, c.contato.nome),
				valor,
				pago,
				aberto,
				quitado: Boolean(t.quitado),
				direcao: "PAGAR",
				opcional: false,
				recusado: false,
				compensado: Array.isArray(meta.pagamentos) && meta.pagamentos.some((x: any) => x.tipo === "compensacao"),
				grupo: meta.grupo_nome,
				raw: t,
			});
			p.pagar = centavos(p.pagar + aberto);
		}
	}

	return [...mapa.values()]
		.map((p) => {
			const abertos = p.itens.filter((i) => i.aberto > 0).sort((a, b) => a.data.localeCompare(b.data));
			let proximo: PessoaSaldo["proximo"] = null;
			if (abertos.length) {
				const data = abertos[0].data;
				const doDia = abertos.filter((i) => i.data === data);
				const liquido = doDia.reduce((s, i) => s + (i.direcao === "RECEBER" ? i.aberto : -i.aberto), 0);
				proximo = { data, valor: centavos(Math.abs(liquido)), receber: liquido >= 0 };
			}
			return { ...p, saldo: centavos(p.receber - p.pagar), proximo, itens: p.itens.sort((a, b) => a.data.localeCompare(b.data)) };
		})
		.sort((a, b) => Number(Math.abs(b.saldo) > 0.009) - Number(Math.abs(a.saldo) > 0.009) || Math.abs(b.saldo) - Math.abs(a.saldo));
}
