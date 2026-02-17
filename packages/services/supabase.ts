import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://wlqmotqxqrgzeqtufkee.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndscW1vdHF4cXJnemVxdHVma2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MjQ4NjUsImV4cCI6MjA2NDEwMDg2NX0.1HqM1JGEypAIopFHkOaedELsludXaM0aNEGVEabfoCM";

// Função para selecionar o storage sem quebrar o build do EAS ou da Vercel
const getStorage = () => {
  // 1. Verifica se está no Browser (Web)
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }

  // 2. Tenta carregar o AsyncStorage para o Mobile
  // Usamos um bloco try/catch e verificamos se o ambiente NÃO é Node (process)
  // para evitar erros durante a fase de "Read app config" do EAS.
  try {
    if (typeof process === 'undefined' || process.release?.name !== 'node') {
       const AsyncStorage = require('@react-native-async-storage/async-storage').default;
       return AsyncStorage;
    }
  } catch (e) {
    // Falha silenciosa se o módulo não existir no ambiente atual
  }

  // 3. Fallback Mock (Essencial para não dar undefined durante o Build)
  return {
    getItem: () => Promise.resolve(null),
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
  };
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorage() as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: typeof window !== 'undefined',
  },
});