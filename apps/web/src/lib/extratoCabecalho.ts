/**
 * Leitura local (sem IA) do que o próprio arquivo do extrato já diz:
 *  - agência e número da conta → qual conta cadastrada é essa;
 *  - coluna "Saldo" → saldo do banco no fim do extrato (para conferir com o app).
 * Só funciona para arquivos de texto (CSV, OFX, TXT); PDF e imagem voltam vazio.
 */

export type CabecalhoConta = { agencia?: string; conta?: string };
export type SaldoDoExtrato = { data: string; saldo: number };

const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export async function lerTextoSePlano(arquivo: File): Promise<string | null> {
	if (!/\.(csv|txt|ofx)$/i.test(arquivo.name)) return null;
	try {
		return await arquivo.text();
	} catch {
		return null;
	}
}

export function lerCabecalhoConta(texto: string): CabecalhoConta | null {
	const topo = texto.slice(0, 4000);
	// OFX
	const branch = topo.match(/<BRANCHID>\s*([^<\r\n]+)/i)?.[1];
	const acct = topo.match(/<ACCTID>\s*([^<\r\n]+)/i)?.[1];
	// CSV/TXT: "Agência;2082" / "Conta;01.053665.0" (aceita ; , : ou tab)
	const agencia = branch || topo.match(/ag[eê]ncia\s*["']?\s*[;,:\t]\s*["']?\s*([\d.\-]+)/i)?.[1];
	const conta = acct || topo.match(/(?:^|\n)\s*["']?(?:n[uú]mero da )?conta(?: corrente)?\s*["']?\s*[;,:\t]\s*["']?\s*([\d.\-/]+)/i)?.[1];
	const a = soDigitos(agencia);
	const c = soDigitos(conta);
	if (!a && !c) return null;
	return { agencia: a || undefined, conta: c || undefined };
}

/** Conta cadastrada com a mesma agência/número (ignora pontos, traços e zeros à esquerda). */
export function contaPeloCabecalho<T extends { agencia?: string | null; numero_conta?: string | null }>(
	cab: CabecalhoConta | null,
	contas: T[],
): T | undefined {
	if (!cab?.conta) return undefined;
	const alvo = cab.conta.replace(/^0+/, "");
	if (alvo.length < 4) return undefined;
	return contas.find((c) => {
		const num = soDigitos(c.numero_conta).replace(/^0+/, "");
		if (num.length < 4) return false;
		const mesmaConta = num === alvo || alvo.startsWith(num) || num.startsWith(alvo);
		if (!mesmaConta) return false;
		const ag = soDigitos(c.agencia).replace(/^0+/, "");
		return !ag || !cab.agencia || ag === cab.agencia.replace(/^0+/, "");
	});
}

const CHAVE_MEMORIA = "extrato-conta:";

/** Lembra (neste navegador) qual conta a pessoa escolheu para essa agência/conta. */
export function lembrarContaDoCabecalho(cab: CabecalhoConta | null, contaId: string) {
	if (!cab?.conta || !contaId) return;
	try {
		localStorage.setItem(`${CHAVE_MEMORIA}${cab.agencia || ""}|${cab.conta}`, contaId);
	} catch {
		/* sem localStorage: tudo bem */
	}
}

export function contaLembrada(cab: CabecalhoConta | null): string | null {
	if (!cab?.conta) return null;
	try {
		return localStorage.getItem(`${CHAVE_MEMORIA}${cab.agencia || ""}|${cab.conta}`);
	} catch {
		return null;
	}
}

/** Divide CSV respeitando aspas (campos com quebra de linha, como no Santander). */
function linhasCsv(texto: string, sep: string): string[][] {
	const linhas: string[][] = [];
	let campo = "";
	let linha: string[] = [];
	let aspas = false;
	for (let i = 0; i < texto.length; i++) {
		const ch = texto[i];
		if (aspas) {
			if (ch === '"' && texto[i + 1] === '"') {
				campo += '"';
				i++;
			} else if (ch === '"') aspas = false;
			else campo += ch;
			continue;
		}
		if (ch === '"') aspas = true;
		else if (ch === sep) {
			linha.push(campo);
			campo = "";
		} else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && texto[i + 1] === "\n") i++;
			linha.push(campo);
			linhas.push(linha);
			linha = [];
			campo = "";
		} else campo += ch;
	}
	if (campo || linha.length) {
		linha.push(campo);
		linhas.push(linha);
	}
	return linhas;
}

function numeroBr(v: string): number | null {
	const s = String(v || "").replace(/[R$\s]/g, "");
	if (!/\d/.test(s)) return null;
	const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
	return Number.isFinite(n) ? n : null;
}

function dataIso(v: string): string | null {
	const s = String(v || "").trim();
	let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
	if (m) return `${m[3]}-${m[2]}-${m[1]}`;
	m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
	return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Saldo no fim do extrato, quando o CSV traz a coluna "Saldo" (ou o OFX traz LEDGERBAL). */
export function saldoFinalDoExtrato(texto: string): SaldoDoExtrato | null {
	const ofxSaldo = texto.match(/<LEDGERBAL>[\s\S]*?<BALAMT>\s*([-\d.,]+)[\s\S]*?<DTASOF>\s*(\d{8})/i);
	if (ofxSaldo) {
		const saldo = numeroBr(ofxSaldo[1]);
		const d = ofxSaldo[2];
		if (saldo !== null) return { saldo, data: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` };
	}

	// "Data;..." (Santander) ou "Data Lançamento;..." (Inter PJ)
	const inicio = texto.search(/(^|\n)\s*"?data[^;,\n]{0,20}"?\s*[;,]/i);
	if (inicio < 0) return null;
	const corpo = texto.slice(inicio).replace(/^\s*\n/, "");
	const primeira = corpo.split(/\r?\n/)[0] || "";
	const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ";" : ",";
	const linhas = linhasCsv(corpo, sep);
	const cab = (linhas[0] || []).map((c) => c.trim().toLowerCase());
	const iData = cab.findIndex((c) => c === "data" || c.startsWith("data "));
	const iSaldo = cab.findIndex((c) => c.startsWith("saldo"));
	if (iData < 0 || iSaldo < 0) return null;

	const registros = linhas
		.slice(1)
		.map((l) => ({ data: dataIso(l[iData]), saldo: numeroBr(l[iSaldo] ?? "") }))
		.filter((r): r is SaldoDoExtrato => Boolean(r.data) && r.saldo !== null);
	if (!registros.length) return null;

	// Extrato do mais novo para o mais antigo (Santander) → o primeiro é o saldo final; senão, o último.
	const decrescente = registros[0].data > registros[registros.length - 1].data;
	return decrescente ? registros[0] : registros[registros.length - 1];
}
