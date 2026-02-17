import { supabase } from "./supabase";

export const financeService = {
  // ... suas funções existentes (insert, update, delete)

  // Função para assinar mudanças
  subscribeToChanges: (table: string, userId: string, callback: () => void) => {
    const channel = supabase
      .channel(`db-changes-${table}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: table,
          filter: `usuario_id=eq.${userId}`,
        },
        () => {
          callback(); // Executa a função de recarregar dados
        }
      )
      .subscribe();

    return channel;
  }
};