import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://wlqmotqxqrgzeqtufkee.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndscW1vdHF4cXJnemVxdHVma2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MjQ4NjUsImV4cCI6MjA2NDEwMDg2NX0.1HqM1JGEypAIopFHkOaedELsludXaM0aNEGVEabfoCM";

// Função para detectar e retornar o storage correto sem quebrar o build
const getStorage = () => {
  if (typeof window !== 'undefined') {
    // Ambiente Web: Usa o localStorage do navegador
    return window.localStorage;
  } else {
    // Ambiente Mobile: Tenta carregar o AsyncStorage
    try {
      // O uso de 'module.require' ou um check de plataforma evita que o bundler web trave
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      return AsyncStorage;
    } catch (e) {
      // Fallback para evitar erro de undefined
      return undefined;
    }
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorage() as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: typeof window !== 'undefined',
  },
});