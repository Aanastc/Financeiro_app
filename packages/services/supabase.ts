import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://wlqmotqxqrgzeqtufkee.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndscW1vdHF4cXJnemVxdHVma2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MjQ4NjUsImV4cCI6MjA2NDEwMDg2NX0.1HqM1JGEypAIopFHkOaedELsludXaM0aNEGVEabfoCM";

/**
 * Lógica de Storage Híbrida
 * Na Web: Usa o localStorage nativo.
 * No Mobile: Usa o AsyncStorage (carregado via try/catch para não quebrar o build Web).
 */
const getCustomStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }

  try {
    // Tenta carregar o AsyncStorage para o ambiente Mobile
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return AsyncStorage;
  } catch (e) {
    // Fallback silencioso para ambientes sem storage (SSR na Vercel)
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getCustomStorage() as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: typeof window !== 'undefined',
  },
});