import { supabase } from "./supabase";

export const financeService = {
  async getMonthlyStats(userId: string, firstDay: string, lastDay: string) {
    // Busca apenas entradas e gastos em paralelo
    const [entradasRes, gastosRes] = await Promise.all([
      supabase.from('entradas').select('valor').eq('usuario_id', userId).gte('data', firstDay).lte('data', lastDay),
      supabase.from('gastos').select('valor').eq('usuario_id', userId).gte('data', firstDay).lte('data', lastDay)
    ]);

    const calcTotal = (data: any[] | null) => data?.reduce((acc, item) => acc + Number(item.valor), 0) || 0;
    
    const calcMedia = (data: any[] | null) => {
      if (!data || data.length === 0) return 0;
      return calcTotal(data) / data.length;
    };

    return {
      totalEntradas: calcTotal(entradasRes.data),
      totalGastos: calcTotal(gastosRes.data),
      mediaEntradas: calcMedia(entradasRes.data),
      mediaGastos: calcMedia(gastosRes.data)
    };
  }
};