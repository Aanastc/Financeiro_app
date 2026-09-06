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
export function getFaturaCycle(mesReferencia: string, fechamentoDia: number, vencimentoDia: number): { dataInicio: string, dataFim: string } {
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
export function getFaturaMesReferencia(dataCompra: string, fechamentoDia: number, vencimentoDia: number): string {
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
