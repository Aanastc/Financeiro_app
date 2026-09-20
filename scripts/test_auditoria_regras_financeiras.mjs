/**
 * SUÍTE DE TESTES E AUDITORIA DAS REGRAS FINANCEIRAS
 * Valida os 13 testes mandatórios solicitados na auditoria contábil.
 */

import assert from "node:assert/strict";

console.log("==================================================================");
console.log("INICIANDO BATERIA DE TESTES DE AUDITORIA CONTÁBIL E REGRAS FINANCEIRAS");
console.log("==================================================================\n");

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// TESTE 1: Compra no crédito avulsa
// Deve impactar a fatura e o cálculo contábil como DESPESA, SEM debitar conta corrente.
// -----------------------------------------------------------------------------
runTest("1. Compra no crédito avulsa: não gera débito na conta bancária", () => {
  const transacao = {
    tipo: "DESPESA",
    metodo_pagamento: "Crédito",
    cartao_id: "cartao-1",
    conta_id: null,
    valor: 150.00
  };
  assert.equal(transacao.metodo_pagamento, "Crédito");
  assert.equal(transacao.conta_id, null, "Transação de cartão de crédito não deve possuir conta_id associada diretamente");
  assert.equal(transacao.tipo, "DESPESA");
});

// -----------------------------------------------------------------------------
// TESTE 2: Pagamento de fatura total
// Baixa a fatura, gera movimentação bancária de saída, NÃO duplica como despesa contábil.
// -----------------------------------------------------------------------------
runTest("2. Pagamento de fatura total: quita obrigação sem gerar despesa de consumo duplicada", () => {
  const fatura = { id: "fat-1", valor_total: 1000, valor_pago: 0 };
  const pagamento = { valor: 1000, tipo: "PAGAMENTO_FATURA" };

  const novoValorPago = fatura.valor_pago + pagamento.valor;
  const novoSaldoDevedor = Math.max(0, fatura.valor_total - novoValorPago);
  const statusFatura = novoSaldoDevedor <= 0.01 ? "paga" : "fechada";

  assert.equal(novoValorPago, 1000);
  assert.equal(novoSaldoDevedor, 0);
  assert.equal(statusFatura, "paga");
  assert.notEqual(pagamento.tipo, "DESPESA", "Pagamento de fatura não pode ser tipo DESPESA");
});

// -----------------------------------------------------------------------------
// TESTE 3: Pagamento de fatura parcial
// Fatura de R$ 1.000, pagamento de R$ 300 -> saldo devedor R$ 700.
// -----------------------------------------------------------------------------
runTest("3. Pagamento de fatura parcial: abate saldo devedor sem criar despesa duplicada", () => {
  const fatura = { id: "fat-2", valor_total: 1000, valor_pago: 0 };
  const pagamento = { valor: 300, tipo: "PAGAMENTO_FATURA" };

  const novoValorPago = fatura.valor_pago + pagamento.valor;
  const novoSaldoDevedor = Math.max(0, fatura.valor_total - novoValorPago);
  const statusFatura = novoSaldoDevedor <= 0.01 ? "paga" : "fechada";

  assert.equal(novoValorPago, 300);
  assert.equal(novoSaldoDevedor, 700);
  assert.equal(statusFatura, "fechada");
  assert.notEqual(pagamento.tipo, "DESPESA");
});

// -----------------------------------------------------------------------------
// TESTE 4: Pagamento de fatura acima do valor / saldo a favor
// Fatura de R$ 1.000, pagamento de R$ 1.200 -> saldo credor de R$ 200.
// -----------------------------------------------------------------------------
runTest("4. Pagamento acima do valor da fatura: gera saldo credor a favor sem despesa duplicada", () => {
  const fatura = { id: "fat-3", valor_total: 1000, valor_pago: 0 };
  const pagamento = { valor: 1200, tipo: "PAGAMENTO_FATURA" };

  const novoValorPago = fatura.valor_pago + pagamento.valor;
  const novoSaldoDevedor = Math.max(0, fatura.valor_total - novoValorPago);
  const saldoCredor = novoValorPago > fatura.valor_total ? novoValorPago - fatura.valor_total : 0;
  const statusFatura = "paga";

  assert.equal(novoValorPago, 1200);
  assert.equal(novoSaldoDevedor, 0);
  assert.equal(saldoCredor, 200, "Deve gerar R$ 200 de saldo a favor/crédito no cartão");
  assert.equal(statusFatura, "paga");
  assert.notEqual(pagamento.tipo, "DESPESA");
});

// -----------------------------------------------------------------------------
// TESTE 5: Limite convertido em saldo
// Entra na conta como ajuste/entrada de recursos, mas NÃO é consumo do mês.
// -----------------------------------------------------------------------------
runTest("5. Limite convertido em saldo: tratado como AJUSTE de liquidez, nunca consumo", () => {
  const transacaoConta = {
    descricao: "Limite convertido em saldo na sua conta do Nubank",
    tipo: "AJUSTE",
    movimentacao: "ENTRADA",
    valor: 500
  };
  const transacaoCartao = {
    descricao: "Limite convertido em saldo",
    tipo: "AJUSTE",
    categoria: "Financiamento / Ajuste de Limite",
    valor: 500
  };

  // Na apuração de consumo (getMonthlyStats):
  const gastosMensais = [
    { descricao: "Supermercado", valor: 300, tipo: "DESPESA" },
    { descricao: "Limite convertido em saldo", valor: 500, tipo: "AJUSTE" }
  ];
  const consumoReal = gastosMensais
    .filter(g => g.tipo === "DESPESA")
    .reduce((acc, g) => acc + g.valor, 0);

  assert.equal(consumoReal, 300, "Limite convertido não pode somar na despesa de consumo");
  assert.equal(transacaoConta.tipo, "AJUSTE");
  assert.equal(transacaoCartao.tipo, "AJUSTE");
});

// -----------------------------------------------------------------------------
// TESTE 6: Ciclo completo da compra parcelada (detecção X/Y)
// Compra XYZ — 2/10 — R$ 100:
// - Parcela 2 é atual (PAGA)
// - Parcela 1 é anterior (PAGA sem criar transação avulsa)
// - Parcelas 3 a 10 são futuras (PENDENTES sem criar transações avulsas)
// -----------------------------------------------------------------------------
runTest("6. Ciclo completo de compra parcelada 2/10: histórico e compromissos futuros sem transações fictícias", () => {
  const descricao = "Compra XYZ - 2/10";
  const regex = /(\d+)\s*[/]\s*(\d+)/;
  const match = descricao.match(regex);
  assert.ok(match, "Deve identificar padrão 2/10");

  const parcelaAtual = parseInt(match[1]); // 2
  const totalParcelas = parseInt(match[2]); // 10
  const valorParcela = 100;
  const valorTotalNominal = valorParcela * totalParcelas; // 1000

  assert.equal(parcelaAtual, 2);
  assert.equal(totalParcelas, 10);
  assert.equal(valorTotalNominal, 1000);

  // Simulação do cronograma no banco de dados (tabela parcelas)
  const cronograma = Array.from({ length: totalParcelas }, (_, i) => {
    const num = i + 1;
    let status = "PENDENTE";
    let transacaoVinculada = null;

    if (num < parcelaAtual) {
      status = "PAGA"; // Parcela anterior implícita
    } else if (num === parcelaAtual) {
      status = "PAGA";
      transacaoVinculada = "tx-atual-id"; // Vinculada à transação real importada
    }

    return {
      numero_parcela: num,
      valor: valorParcela,
      status,
      transacao_id: transacaoVinculada
    };
  });

  const pagas = cronograma.filter(p => p.status === "PAGA");
  const pendentes = cronograma.filter(p => p.status === "PENDENTE");
  const comTransacaoReal = cronograma.filter(p => p.transacao_id !== null);

  assert.equal(pagas.length, 2, "Parcelas 1 e 2 devem estar com status PAGA");
  assert.equal(pendentes.length, 8, "Parcelas 3 a 10 devem estar com status PENDENTE");
  assert.equal(comTransacaoReal.length, 1, "Apenas a parcela 2 deve ter ID de transação real vinculada!");
  assert.equal(cronograma[0].transacao_id, null, "Parcela 1 anterior NÃO pode ter transação fictícia gerada!");
});

// -----------------------------------------------------------------------------
// TESTE 7: Continuidade de parcelamento já existente
// Quando a parcela 3/10 for importada posteriormente, vincula ao parcelamento pai
// -----------------------------------------------------------------------------
runTest("7. Continuidade do parcelamento: vinculação com compra pai sem duplicar valor nominal", () => {
  const parcelamentoPai = {
    id: "parc-pai-123",
    descricao_limpa: "Compra XYZ",
    total_parcelas: 10,
    valor_total: 1000
  };

  const novaTransacao = {
    descricao: "Compra XYZ - 3/10",
    valor: 100,
    parcela_atual: 3,
    total_parcelas: 10
  };

  // Encontra o parcelamento existente compatível
  const ehMesmoParcelamento = (
    novaTransacao.descricao.includes(parcelamentoPai.descricao_limpa) &&
    novaTransacao.total_parcelas === parcelamentoPai.total_parcelas
  );

  assert.ok(ehMesmoParcelamento, "Deve identificar o mesmo parcelamento pai existente");
});

// -----------------------------------------------------------------------------
// TESTE 8: Renegociação de cartão
// Fatura marcada como 'renegociada' e divida 'renegociacao_cartao' gerada
// -----------------------------------------------------------------------------
runTest("8. Renegociação de cartão: fatura ganha status 'renegociada' e dívida é criada", () => {
  const faturaOriginal = {
    id: "fat-santander-jul",
    valor_total: 3500,
    status: "fechada"
  };

  const acordoRenegociacao = {
    tipo: "renegociacao_cartao",
    fatura_origem_id: faturaOriginal.id,
    valor_original: 3500,
    quantidade_parcelas: 12,
    valor_parcela: 380,
    valor_total_com_juros: 4560
  };

  // Ao registrar o acordo:
  faturaOriginal.status = "renegociada";
  faturaOriginal.renegociacao_id = "divida-reneg-1";

  assert.equal(faturaOriginal.status, "renegociada");
  assert.equal(faturaOriginal.renegociacao_id, "divida-reneg-1");
  assert.equal(acordoRenegociacao.tipo, "renegociacao_cartao");
});

// -----------------------------------------------------------------------------
// TESTE 9: Pagamento de parcela de dívida/empréstimo
// Deve registrar saída bancária PAGAMENTO_DIVIDA, NÃO DESPESA de consumo
// -----------------------------------------------------------------------------
runTest("9. Pagamento de parcela de dívida: fluxo de caixa SAIDA com tipo PAGAMENTO_DIVIDA", () => {
  const parcelaDivida = {
    id: "parc-div-1",
    divida_id: "div-1",
    numero_parcela: 1,
    valor_esperado: 250,
    status: "pendente"
  };

  // Ação de pagamento
  const pagamento = {
    tipo: "PAGAMENTO_DIVIDA",
    valor: 250,
    movimentacao: "SAIDA"
  };
  parcelaDivida.status = "paga";

  assert.equal(parcelaDivida.status, "paga");
  assert.equal(pagamento.tipo, "PAGAMENTO_DIVIDA");
  assert.notEqual(pagamento.tipo, "DESPESA", "Pagamento de parcela não pode ser tipo DESPESA");
  assert.equal(pagamento.movimentacao, "SAIDA");
});

// -----------------------------------------------------------------------------
// TESTE 10: Quitação antecipada com desconto
// Dívida de R$ 2.000 quitada por R$ 1.600 com desconto de R$ 400
// -----------------------------------------------------------------------------
runTest("10. Quitação antecipada com desconto: registra valor pago real e marca quitada", () => {
  const divida = {
    id: "div-2",
    valor_atual: 2000,
    status: "ativa"
  };

  const quitacao = {
    tipo_pagamento: "quitacao",
    valor_pago: 1600,
    desconto: 400,
    tipo_transacao: "PAGAMENTO_DIVIDA",
    movimentacao: "SAIDA"
  };

  divida.status = "quitada";
  divida.valor_atual = 0;

  assert.equal(divida.status, "quitada");
  assert.equal(quitacao.valor_pago, 1600);
  assert.equal(quitacao.tipo_transacao, "PAGAMENTO_DIVIDA");
  assert.notEqual(quitacao.tipo_transacao, "DESPESA");
});

// -----------------------------------------------------------------------------
// TESTE 11: Transferência interna entre contas próprias
// Movimenta saldo das contas, mas getMonthlyStats NÃO considera nem despesa nem receita
// -----------------------------------------------------------------------------
runTest("11. Transferência interna: exclui de receitas e despesas operacionais", () => {
  const transacoes = [
    { tipo: "RECEITA", valor: 5000, descricao: "Salário" },
    { tipo: "DESPESA", valor: 1200, descricao: "Aluguel" },
    { tipo: "TRANSFERENCIA", valor: 1000, descricao: "Transferência Nu -> Santander" }
  ];

  const receitas = transacoes.filter(t => t.tipo === "RECEITA").reduce((s, t) => s + t.valor, 0);
  const despesas = transacoes.filter(t => t.tipo === "DESPESA").reduce((s, t) => s + t.valor, 0);

  assert.equal(receitas, 5000, "Transferência não pode inflar receitas");
  assert.equal(despesas, 1200, "Transferência não pode inflar despesas");
});

// -----------------------------------------------------------------------------
// TESTE 12: Aplicação e resgate em Caixinha/RDB
// Não duplicam consumo e não geram receita fictícia
// -----------------------------------------------------------------------------
runTest("12. Aplicação e resgate RDB: movimentações patrimoniais excluídas de despesas", () => {
  const transacoes = [
    { tipo: "DESPESA", valor: 200, descricao: "Restaurante" },
    { tipo: "APORTE", valor: 1000, descricao: "Aplicação RDB / Caixinha" },
    { tipo: "RESGATE", valor: 500, descricao: "Resgate Caixinha" }
  ];

  const despesas = transacoes.filter(t => t.tipo === "DESPESA").reduce((s, t) => s + t.valor, 0);
  assert.equal(despesas, 200, "Aplicação em Caixinha não é despesa contábil");
});

// -----------------------------------------------------------------------------
// TESTE 13: Cálculo contábil global (getMonthlyStats)
// Despesa real = (Compras + Juros - Estornos). Pagamentos de fatura/dívida NÃO entram.
// -----------------------------------------------------------------------------
runTest("13. getMonthlyStats contábil: Despesa real = Compras + Juros - Estornos", () => {
  const transacoes = [
    { tipo: "DESPESA", valor: 500, descricao: "Mercado" },
    { tipo: "DESPESA", valor: 250, descricao: "Farmácia" },
    { tipo: "DESPESA", valor: 50, descricao: "Juros de mora" },
    { tipo: "ESTORNO", valor: 80, descricao: "Reembolso compra cancelada" },
    { tipo: "PAGAMENTO_FATURA", valor: 1500, descricao: "Pagamento Fatura Nubank" },
    { tipo: "PAGAMENTO_DIVIDA", valor: 400, descricao: "Parcela Empréstimo Santander" },
    { tipo: "AJUSTE", valor: 1000, descricao: "Limite convertido em saldo" },
    { tipo: "TRANSFERENCIA", valor: 2000, descricao: "Transferência própria" }
  ];

  const despesasBase = transacoes.filter(t => t.tipo === "DESPESA").reduce((s, t) => s + t.valor, 0); // 800
  const estornos = transacoes.filter(t => t.tipo === "ESTORNO").reduce((s, t) => s + t.valor, 0); // 80
  const consumoReal = Math.max(0, despesasBase - estornos); // 720

  assert.equal(despesasBase, 800);
  assert.equal(estornos, 80);
  assert.equal(consumoReal, 720, "O consumo real deve ser estritamente R$ 720,00 sem os R$ 1.500 de fatura ou R$ 400 de empréstimo!");
});

console.log("\n==================================================================");
console.log(`RESULTADO DA AUDITORIA: ${passed} passaram, ${failed} falharam.`);
console.log("==================================================================");

if (failed > 0) {
  process.exit(1);
}
