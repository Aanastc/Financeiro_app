/**
 * O Supabase (PostgREST) devolve no máximo 1000 linhas por consulta.
 * Para cálculos que precisam de TODOS os registros (saldos, relatórios),
 * use buscarTodasPaginas — ela pagina com .range() até acabar.
 *
 * A consulta precisa ter uma ordenação estável (ex.: .order("id")) para que
 * as páginas não se sobreponham.
 *
 * Exemplo:
 *   const movs = await buscarTodasPaginas((de, ate) =>
 *     supabase.from("movimentacoes").select("conta_id, valor, tipo")
 *       .eq("usuario_id", uid).order("id").range(de, ate));
 */
export async function buscarTodasPaginas<T>(
  montarConsulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  tamanhoPagina = 1000,
  limiteSeguranca = 200_000
): Promise<T[]> {
  const resultado: T[] = [];
  for (let de = 0; de < limiteSeguranca; de += tamanhoPagina) {
    const { data, error } = await montarConsulta(de, de + tamanhoPagina - 1);
    if (error) throw error;
    const pagina = data || [];
    resultado.push(...pagina);
    if (pagina.length < tamanhoPagina) break;
  }
  return resultado;
}
