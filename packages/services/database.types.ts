export interface Entrada {
  id: string;
  usuario_id: string;
  descricao: string;
  valor: number;
  data: string;
  criado_em: string;
}

export interface Gasto {
  id: string;
  usuario_id: string;
  descricao: string;
  valor: number;
  data: string;
  criado_em: string;
  classificacao: string;
}

export interface Divida {
  id: string;
  usuario_id: string;
  descricao: string;
  valor_total: number;
  parcelas: number;
  parcela_atual: number;
  status: string;
  criado_em: string;
  vencimento_parcela: string;
  vencimento_total: string;
  Juros: number;
}
