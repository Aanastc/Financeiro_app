import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../../../packages/services/supabase";

/**
 * Seletor de categoria com as categorias do próprio usuário + "Nova categoria".
 *
 * - `tipo` "DESPESA" mostra tudo que não é de receita; "RECEITA" mostra as de receita.
 *   (Categorias antigas sem tipo aparecem nos dois.)
 * - `modo` "id" (padrão) devolve o id; "nome" devolve o nome (formulários que
 *   gravam a categoria pelo nome).
 * - `sugestoes`: nomes que aparecem mesmo se ainda não existirem no cadastro
 *   (só no modo "nome"; são criados quando a pessoa salva o lançamento).
 */

const ehReceita = (t?: string | null) => /^(receita|entrada)/i.test(String(t || ""));
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

interface Props {
	usuarioId?: string | null;
	tipo: "DESPESA" | "RECEITA";
	value: string;
	onChange: (valor: string) => void;
	modo?: "id" | "nome";
	sugestoes?: string[];
	textoVazio?: string;
	required?: boolean;
	className?: string;
}

const NOVA = "__nova_categoria__";

export default function SeletorCategoria({
	usuarioId,
	tipo,
	value,
	onChange,
	modo = "id",
	sugestoes = [],
	textoVazio = "Sem categoria (Outros)",
	required,
	className,
}: Props) {
	const [categorias, setCategorias] = useState<{ id: string; nome: string; tipo?: string | null }[]>([]);
	const [criando, setCriando] = useState(false);
	const [novoNome, setNovoNome] = useState("");
	const [salvando, setSalvando] = useState(false);
	const [uid, setUid] = useState<string | null>(usuarioId || null);

	useEffect(() => {
		let ativo = true;
		(async () => {
			const id = usuarioId || (await supabase.auth.getUser()).data.user?.id || null;
			if (!ativo || !id) return;
			setUid(id);
			const { data } = await supabase.from("categorias").select("id, nome, tipo").eq("usuario_id", id).eq("ativa", true).order("nome");
			if (ativo) setCategorias(data || []);
		})();
		return () => {
			ativo = false;
		};
	}, [usuarioId]);

	const opcoes = useMemo(() => {
		const doTipo = categorias.filter((c) => (tipo === "RECEITA" ? !c.tipo || ehReceita(c.tipo) : !ehReceita(c.tipo)));
		// sem nomes repetidos (ex.: "Mercado" cadastrada duas vezes)
		const vistos = new Set<string>();
		const lista: { valor: string; nome: string }[] = [];
		for (const c of doTipo) {
			const k = norm(c.nome);
			if (vistos.has(k)) continue;
			vistos.add(k);
			lista.push({ valor: modo === "id" ? c.id : c.nome, nome: c.nome });
		}
		if (modo === "nome") {
			for (const s of sugestoes) {
				if (!vistos.has(norm(s))) {
					vistos.add(norm(s));
					lista.push({ valor: s, nome: s });
				}
			}
		}
		return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
	}, [categorias, tipo, modo, sugestoes]);

	const criar = async () => {
		const nome = novoNome.trim().replace(/\s+/g, " ");
		if (nome.length < 2) return toast.error("Digite o nome da categoria.");
		const existente = categorias.find((c) => norm(c.nome) === norm(nome) && (tipo === "RECEITA") === ehReceita(c.tipo));
		if (existente) {
			onChange(modo === "id" ? existente.id : existente.nome);
			setCriando(false);
			setNovoNome("");
			return toast("Essa categoria já existia — selecionei ela.");
		}
		if (!uid) return toast.error("Sessão expirada.");
		setSalvando(true);
		const { data, error } = await supabase
			.from("categorias")
			.insert([{ usuario_id: uid, nome, tipo, ativa: true }])
			.select("id, nome, tipo")
			.single();
		setSalvando(false);
		if (error || !data) return toast.error("Não foi possível criar a categoria.");
		setCategorias((prev) => [...prev, data]);
		onChange(modo === "id" ? data.id : data.nome);
		setCriando(false);
		setNovoNome("");
		toast.success(`Categoria "${data.nome}" criada.`);
	};

	const base =
		className ||
		"w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500";

	if (criando) {
		return (
			<div className="flex items-center gap-2">
				<input
					autoFocus
					value={novoNome}
					onChange={(e) => setNovoNome(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							criar();
						}
						if (e.key === "Escape") setCriando(false);
					}}
					placeholder="Nome da nova categoria"
					maxLength={40}
					className={`${base} flex-1`}
				/>
				<button
					type="button"
					onClick={criar}
					disabled={salvando}
					title="Criar categoria"
					aria-label="Criar categoria"
					className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white cursor-pointer shrink-0">
					{salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
				</button>
				<button
					type="button"
					onClick={() => setCriando(false)}
					title="Cancelar"
					aria-label="Cancelar"
					className="p-3 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0">
					<X size={16} />
				</button>
			</div>
		);
	}

	return (
		<select
			required={required}
			value={value}
			onChange={(e) => {
				if (e.target.value === NOVA) {
					setCriando(true);
					return;
				}
				onChange(e.target.value);
			}}
			className={`${base} cursor-pointer`}>
			<option value="">{textoVazio}</option>
			{opcoes.map((o) => (
				<option key={o.valor} value={o.valor}>
					{o.nome}
				</option>
			))}
			<option value={NOVA}>＋ Nova categoria…</option>
		</select>
	);
}

