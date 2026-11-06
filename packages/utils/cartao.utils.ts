/**
 * Utilitários para cálculos matemáticos de ciclos de cartão de crédito.
 */

/**
 * Retorna as datas de início e fim do ciclo de uma fatura, com base no mês de referência (mês do vencimento).
 * @param mesReferencia Mês de referência no formato "YYYY-MM" (representa o mês em que a fatura VENCE)
 * @param fechamentoDia Dia em que a fatura fecha
 * @param vencimentoDia Dia em que a fatura vence
 * @returns Objeto com { dataInicio: string, dataFim: string } no formato "YYYY-MM-DD"
 */
function cicloPorDias(mesReferencia: string, fechamentoDia: number, vencimentoDia: number): { dataInicio: string, dataFim: string } {
    const [ano, mes] = mesReferencia.split("-").map(Number);
    
    let closingMonth = mes;
    let closingYear = ano;

    // Se o fechamento é maior que o vencimento, significa que a fatura fecha no mês anterior ao do vencimento.
    if (fechamentoDia > vencimentoDia) {
        closingMonth -= 1;
        if (closingMonth < 1) {
            closingMonth = 12;
            closingYear -= 1;
        }
    }

    // A data de fim do ciclo é exatamente o dia de fechamento
    const lastDayOfClosingMonth = new Date(closingYear, closingMonth, 0).getDate();
    const actualFechamentoDia = Math.min(fechamentoDia, lastDayOfClosingMonth);
    
    const dataFimStr = `${closingYear}-${String(closingMonth).padStart(2, '0')}-${String(actualFechamentoDia).padStart(2, '0')}`;

    // A data de início do ciclo é o dia seguinte ao fechamento do mês anterior
    let startMonth = closingMonth - 1;
    let startYear = closingYear;
    if (startMonth < 1) {
        startMonth = 12;
        startYear -= 1;
    }

    const lastDayOfStartMonth = new Date(startYear, startMonth, 0).getDate();
    const actualPrevFechamentoDia = Math.min(fechamentoDia, lastDayOfStartMonth);
    
    // O ciclo inicia no dia seguinte ao fechamento anterior
    const dataInicioDate = new Date(startYear, startMonth - 1, actualPrevFechamentoDia);
    dataInicioDate.setDate(dataInicioDate.getDate() + 1);

    const dataInicioStr = `${dataInicioDate.getFullYear()}-${String(dataInicioDate.getMonth() + 1).padStart(2, '0')}-${String(dataInicioDate.getDate()).padStart(2, '0')}`;

    return { dataInicio: dataInicioStr, dataFim: dataFimStr };
}

/**
 * Dada a data de uma compra, retorna o Mês de Referência da fatura (mês do vencimento) em que ela cairá.
 * @param dataCompra Data da compra no formato "YYYY-MM-DD"
 * @param fechamentoDia Dia em que a fatura fecha
 * @param vencimentoDia Dia em que a fatura vence
 * @returns Mês de referência no formato "YYYY-MM"
 */
function mesReferenciaPorDias(dataCompra: string, fechamentoDia: number, vencimentoDia: number): string {
    const [year, month, day] = dataCompra.split("-").map(Number);
    let refMonth = month;
    let refYear = year;

    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const actualFechamentoDia = Math.min(fechamentoDia, lastDayOfMonth);

    // Se o dia da compra for >= dia do fechamento efetivo, 
    // a compra só entra na fatura que fechará no MÊS SEGUINTE.
    if (day >= actualFechamentoDia) {
        refMonth += 1;
        if (refMonth > 12) {
            refMonth = 1;
            refYear += 1;
        }
    }

    // refMonth/refYear agora apontam para o mês em que a fatura FECHA.
    // Mas o vencimento da fatura pode cair no mês seguinte se fechamento > vencimento.
    if (fechamentoDia > vencimentoDia) {
        refMonth += 1;
        if (refMonth > 12) {
            refMonth = 1;
            refYear += 1;
        }
    }

    return `${refYear}-${String(refMonth).padStart(2, '0')}`;
}

/**
 * Banco que muda o vencimento do cartão (ex.: Nubank de "vence 19" para "vence 4"):
 * compras ANTES de `ciclo_mudou_em` seguem os dias antigos; a partir dela, os novos.
 * Sem esses campos, tudo funciona como antes (um par de dias só).
 */
export type MudancaDeCiclo = {
    ciclo_anterior_fechamento?: number | null;
    ciclo_anterior_vencimento?: number | null;
    ciclo_mudou_em?: string | null;
};

function temMudanca(c?: MudancaDeCiclo | null): c is Required<MudancaDeCiclo> {
    return Boolean(c && c.ciclo_mudou_em && Number(c.ciclo_anterior_fechamento) > 0 && Number(c.ciclo_anterior_vencimento) > 0);
}

/** Mês de referência (mês do vencimento) da fatura em que a compra cai. */
export function getFaturaMesReferencia(dataCompra: string, fechamentoDia: number, vencimentoDia: number, mudanca?: MudancaDeCiclo | null): string {
    if (temMudanca(mudanca) && String(dataCompra).slice(0, 10) < String(mudanca.ciclo_mudou_em).slice(0, 10)) {
        return mesReferenciaPorDias(dataCompra, Number(mudanca.ciclo_anterior_fechamento), Number(mudanca.ciclo_anterior_vencimento));
    }
    return mesReferenciaPorDias(dataCompra, fechamentoDia, vencimentoDia);
}

/** Período de compras da fatura que vence no mês informado (a fatura da troca começa no dia da mudança). */
export function getFaturaCycle(mesReferencia: string, fechamentoDia: number, vencimentoDia: number, mudanca?: MudancaDeCiclo | null): { dataInicio: string, dataFim: string } {
    const novo = cicloPorDias(mesReferencia, fechamentoDia, vencimentoDia);
    if (!temMudanca(mudanca)) return novo;
    const virada = String(mudanca.ciclo_mudou_em).slice(0, 10);
    if (novo.dataInicio >= virada) return novo;
    const antigo = cicloPorDias(mesReferencia, Number(mudanca.ciclo_anterior_fechamento), Number(mudanca.ciclo_anterior_vencimento));
    if (antigo.dataFim < virada) return antigo;
    return { dataInicio: virada, dataFim: novo.dataFim };
}

/** Dia do vencimento da fatura daquele mês (o antigo, para faturas antes da troca). */
export function getVencimentoDiaDoMes(mesReferencia: string, fechamentoDia: number, vencimentoDia: number, mudanca?: MudancaDeCiclo | null): number {
    if (!temMudanca(mudanca)) return vencimentoDia;
    const virada = String(mudanca.ciclo_mudou_em).slice(0, 10);
    const novo = cicloPorDias(mesReferencia, fechamentoDia, vencimentoDia);
    if (novo.dataInicio >= virada) return vencimentoDia;
    const antigo = cicloPorDias(mesReferencia, Number(mudanca.ciclo_anterior_fechamento), Number(mudanca.ciclo_anterior_vencimento));
    return antigo.dataFim < virada ? Number(mudanca.ciclo_anterior_vencimento) : vencimentoDia;
}
