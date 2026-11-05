import { supabase } from "./supabase";

export interface GrupoMembro {
  id: string;
  grupo_id: string;
  contato_id?: string | null;
  usuario_id?: string | null;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  is_user?: boolean;
}

export interface Grupo {
  id: string;
  usuario_id: string;
  nome: string;
  tipo: "viagem" | "casa" | "casal" | "role" | "outro";
  descricao?: string;
  icone?: string;
  cor_hex?: string;
  criado_em: string;
  membros?: GrupoMembro[];
}

export interface TransacaoSplit {
  id: string;
  descricao: string;
  valor_total: number;
  data: string;
  pago_por_id: string;
  pago_por_nome: string;
  metodo_divisao: "IGUAL" | "EXATO" | "PORCENTAGEM" | "COTAS";
  grupo_id?: string | null;
  grupo_nome?: string | null;
  participantes: {
    id: string;
    nome: string;
    valor_devido: number;
    valor_pago?: number;
    percentual?: number;
    cotas?: number;
  }[];
  observacao?: string;
}

export interface BalancoMembro {
  membroId: string;
  nome: string;
  totalPago: number;
  totalDevido: number;
  saldoLiquido: number; // positivo = tem a receber, negativo = deve
}

export interface SimplificacaoDivida {
  devedorId: string;
  devedorNome: string;
  credorId: string;
  credorNome: string;
  valor: number;
}

// Exportações de compatibilidade para bundlers ESM em dev (Vite)
export const Grupo = {} as any;
export const GrupoMembro = {} as any;
export const BalancoMembro = {} as any;
export const SimplificacaoDivida = {} as any;
export const TransacaoSplit = {} as any;

class DespesasCompartilhadasService {
  private getLocalStorageKey(userId: string) {
    // Chave mantida por compatibilidade: renomear apagaria os grupos já salvos no navegador
    return `finance_splitwise_grupos_${userId}`;
  }

  private getLocalGrupos(userId: string): Grupo[] {
    try {
      if (typeof window === "undefined" || !window.localStorage) return [];
      const data = localStorage.getItem(this.getLocalStorageKey(userId));
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveLocalGrupos(userId: string, grupos: Grupo[]) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(this.getLocalStorageKey(userId), JSON.stringify(grupos));
      }
    } catch (e) {
      console.warn("Erro ao salvar grupos no localStorage:", e);
    }
  }

  // 1. LISTAR GRUPOS
  async getGrupos(userId: string): Promise<Grupo[]> {
    try {
      // Tenta buscar no Supabase
      const { data: remoteGrupos, error } = await supabase
        .from("grupos")
        .select("*, grupo_membros(*)")
        .eq("usuario_id", userId)
        .order("criado_em", { ascending: false });

      if (!error && remoteGrupos) {
        const { data: perfil } = await supabase.from("usuarios").select("nome").eq("id", userId).maybeSingle();
        return remoteGrupos.map((g: any) => ({
          ...g,
          membros: this.marcarMembroUsuario(g.grupo_membros || [], userId, perfil?.nome)
        }));
      }
    } catch (err) {
      console.log("Fallback para storage local de grupos");
    }

    // Fallback para localStorage
    return this.getLocalGrupos(userId);
  }

  /**
   * O banco não tem coluna is_user: o membro "você" é identificado pelo usuario_id.
   * Grupos antigos foram salvos sem esse campo; para eles a identificação é feita
   * só na leitura (nada é regravado): único membro sem contato vinculado ou, havendo
   * mais de um, o que tem o mesmo nome do perfil.
   */
  private marcarMembroUsuario(membros: GrupoMembro[], userId: string, nomePerfil?: string | null): GrupoMembro[] {
    const norm = (t?: string | null) => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    let euId = membros.find(m => m.usuario_id === userId)?.id;
    if (!euId) {
      const semContato = membros.filter(m => !m.contato_id && !m.usuario_id);
      euId =
        semContato.length === 1
          ? semContato[0].id
          : semContato.find(m => nomePerfil && norm(m.nome) === norm(nomePerfil))?.id ||
            semContato.find(m => nomePerfil && norm(m.nome).split(" ")[0] === norm(nomePerfil).split(" ")[0])?.id;
    }
    return membros.map(m => ({ ...m, is_user: m.id === euId }));
  }

  // 2. CRIAR GRUPO
  async criarGrupo(
    userId: string,
    dados: {
      nome: string;
      tipo: "viagem" | "casa" | "casal" | "role" | "outro";
      descricao?: string;
      icone?: string;
      cor_hex?: string;
    },
    membros: {
      nome: string;
      email?: string;
      telefone?: string;
      contato_id?: string;
      usuario_id?: string;
      is_user?: boolean;
    }[]
  ): Promise<Grupo> {
    const grupoId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `grupo_${Date.now()}`;
    const agora = new Date().toISOString();

    const novoGrupo: Grupo = {
      id: grupoId,
      usuario_id: userId,
      nome: dados.nome,
      tipo: dados.tipo || "outro",
      descricao: dados.descricao || "",
      icone: dados.icone || "Users",
      cor_hex: dados.cor_hex || "#8b5cf6",
      criado_em: agora,
      membros: membros.map((m, idx) => ({
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `membro_${Date.now()}_${idx}`,
        grupo_id: grupoId,
        contato_id: m.contato_id || null,
        usuario_id: m.usuario_id || (m.is_user ? userId : null),
        nome: m.nome,
        email: m.email || null,
        telefone: m.telefone || null,
        is_user: m.is_user || false
      }))
    };

    // Tenta persistir no Supabase
    try {
      const { data: gData, error: gError } = await supabase
        .from("grupos")
        .insert([{
          id: grupoId,
          usuario_id: userId,
          nome: dados.nome,
          tipo: dados.tipo,
          descricao: dados.descricao,
          icone: dados.icone,
          cor_hex: dados.cor_hex
        }])
        .select()
        .single();

      if (!gError && gData) {
        if (novoGrupo.membros && novoGrupo.membros.length > 0) {
          const membrosParaInserir = novoGrupo.membros.map(m => ({
            id: m.id,
            grupo_id: grupoId,
            contato_id: m.contato_id,
            usuario_id: m.usuario_id,
            nome: m.nome,
            email: m.email,
            telefone: m.telefone
          }));
          await supabase.from("grupo_membros").insert(membrosParaInserir);
        }
      }
    } catch (err) {
      console.log("Salvando grupo em fallback local");
    }

    // Salva sempre no fallback local
    const locais = this.getLocalGrupos(userId);
    locais.unshift(novoGrupo);
    this.saveLocalGrupos(userId, locais);

    return novoGrupo;
  }

  // 3. EXCLUIR GRUPO
  async excluirGrupo(userId: string, grupoId: string): Promise<boolean> {
    try {
      await supabase.from("grupos").delete().eq("id", grupoId).eq("usuario_id", userId);
    } catch {}

    const locais = this.getLocalGrupos(userId).filter(g => g.id !== grupoId);
    this.saveLocalGrupos(userId, locais);
    return true;
  }

  // 4. ADICIONAR MEMBRO
  async adicionarMembro(
    userId: string,
    grupoId: string,
    membro: {
      nome: string;
      email?: string;
      telefone?: string;
      contato_id?: string;
    }
  ): Promise<GrupoMembro> {
    const novoMembro: GrupoMembro = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `membro_${Date.now()}`,
      grupo_id: grupoId,
      contato_id: membro.contato_id || null,
      nome: membro.nome,
      email: membro.email || null,
      telefone: membro.telefone || null
    };

    try {
      await supabase.from("grupo_membros").insert([{
        id: novoMembro.id,
        grupo_id: grupoId,
        contato_id: novoMembro.contato_id,
        nome: novoMembro.nome,
        email: novoMembro.email,
        telefone: novoMembro.telefone
      }]);
    } catch {}

    const locais = this.getLocalGrupos(userId);
    const grupo = locais.find(g => g.id === grupoId);
    if (grupo) {
      if (!grupo.membros) grupo.membros = [];
      grupo.membros.push(novoMembro);
      this.saveLocalGrupos(userId, locais);
    }

    return novoMembro;
  }

  // 5. CALCULAR BALANÇO E SIMPLIFICAÇÃO DE DÍVIDAS (SIMPLIFICAÇÃO DE DÍVIDAS)
  calcularBalancoGrupo(
    membros: GrupoMembro[],
    despesas: any[]
  ): {
    balancos: BalancoMembro[];
    simplificacao: SimplificacaoDivida[];
    totalGastoGrupo: number;
  } {
    const mapaBalancos = new Map<string, { nome: string; pago: number; devido: number }>();

    // Inicializa balanços para todos os membros
    membros.forEach(m => {
      mapaBalancos.set(m.id, {
        nome: m.nome,
        pago: 0,
        devido: 0
      });
    });

    let totalGastoGrupo = 0;
    // Pagamentos já feitos entre membros (acertos): quem devia transferiu para quem pagou
    const acertos = new Map<string, number>();
    const somarAcerto = (id: string, v: number) => acertos.set(id, (acertos.get(id) || 0) + v);

    despesas.forEach(d => {
      let meta: any = null;
      if (d.observacao) {
        try {
          if (typeof d.observacao === "string" && d.observacao.trim().startsWith("{")) {
            meta = JSON.parse(d.observacao);
          }
        } catch {}
      }

      const valorTotal = Number(meta?.valor_total || d.valor || 0);
      totalGastoGrupo += valorTotal;

      // Quem pagou
      const pagadorId = meta?.pago_por_id;

      if (pagadorId && mapaBalancos.has(pagadorId)) {
        mapaBalancos.get(pagadorId)!.pago += valorTotal;
      } else {
        // Se foi o usuário que pagou
        const primeiroMembro = membros.find(m => m.is_user) || membros[0];
        if (primeiroMembro && mapaBalancos.has(primeiroMembro.id)) {
          mapaBalancos.get(primeiroMembro.id)!.pago += valorTotal;
        }
      }

      // Já pago (total ou parcial): desconta do saldo de quem devia e de quem recebeu
      const quemPagouCompra = pagadorId && mapaBalancos.has(pagadorId) ? pagadorId : (membros.find(m => m.is_user) || membros[0])?.id;
      const jaAcertado = d.terceiro_pago ? Number(d.valor) || 0 : Number(meta?.valor_pago) || 0;
      if (jaAcertado > 0 && quemPagouCompra) {
        let devedores: { id: string; peso: number }[] = [];
        if (d.terceiro) {
          // Você pagou: quem te devia eram os outros participantes
          devedores = (Array.isArray(meta?.participantes) ? meta.participantes : [])
            .filter((p: any) => p.id !== quemPagouCompra && !p.is_user && mapaBalancos.has(p.id))
            .map((p: any) => ({ id: p.id, peso: Number(p.valor_devido) || 0 }));
        } else {
          // Outra pessoa pagou: quem devia era você
          const eu = membros.find(m => m.is_user);
          if (eu && eu.id !== quemPagouCompra) devedores = [{ id: eu.id, peso: 1 }];
        }
        const somaPesos = devedores.reduce((s, x) => s + x.peso, 0);
        if (devedores.length && somaPesos > 0) {
          devedores.forEach(x => {
            const parte = (jaAcertado * x.peso) / somaPesos;
            somarAcerto(x.id, parte);
            somarAcerto(quemPagouCompra, -parte);
          });
        }
      }

      // Distribuição entre participantes
      if (meta?.participantes && Array.isArray(meta.participantes)) {
        meta.participantes.forEach((p: any) => {
          const alvo = mapaBalancos.get(p.id);
          if (alvo) {
            alvo.devido += Number(p.valor_devido || 0);
          }
        });
      } else {
        // Divisão igual entre todos os membros se não houver detalhe
        const parte = membros.length > 0 ? valorTotal / membros.length : 0;
        membros.forEach(m => {
          const b = mapaBalancos.get(m.id);
          if (b) b.devido += parte;
        });
      }
    });

    const balancos: BalancoMembro[] = Array.from(mapaBalancos.entries()).map(([membroId, data]) => ({
      membroId,
      nome: data.nome,
      totalPago: Math.round(data.pago * 100) / 100,
      totalDevido: Math.round(data.devido * 100) / 100,
      saldoLiquido: Math.round((data.pago - data.devido + (acertos.get(membroId) || 0)) * 100) / 100
    }));

    // ALGORITMO DE SIMPLIFICAÇÃO DE DÍVIDAS
    // Separa devedores (saldo < 0) e credores (saldo > 0)
    const devedores: { id: string; nome: string; valor: number }[] = [];
    const credores: { id: string; nome: string; valor: number }[] = [];

    balancos.forEach(b => {
      if (b.saldoLiquido < -0.01) {
        devedores.push({ id: b.membroId, nome: b.nome, valor: Math.abs(b.saldoLiquido) });
      } else if (b.saldoLiquido > 0.01) {
        credores.push({ id: b.membroId, nome: b.nome, valor: b.saldoLiquido });
      }
    });

    // Ordena decrescente
    devedores.sort((a, b) => b.valor - a.valor);
    credores.sort((a, b) => b.valor - a.valor);

    const simplificacao: SimplificacaoDivida[] = [];
    let i = 0;
    let j = 0;

    while (i < devedores.length && j < credores.length) {
      const devedor = devedores[i];
      const credor = credores[j];

      const montante = Math.min(devedor.valor, credor.valor);
      if (montante > 0.01) {
        simplificacao.push({
          devedorId: devedor.id,
          devedorNome: devedor.nome,
          credorId: credor.id,
          credorNome: credor.nome,
          valor: Math.round(montante * 100) / 100
        });
      }

      devedor.valor -= montante;
      credor.valor -= montante;

      if (devedor.valor < 0.01) i++;
      if (credor.valor < 0.01) j++;
    }

    return {
      balancos,
      simplificacao,
      totalGastoGrupo: Math.round(totalGastoGrupo * 100) / 100
    };
  }
}

export const despesasCompartilhadasService = new DespesasCompartilhadasService();

