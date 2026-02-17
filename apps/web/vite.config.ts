import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Força o Vite a resolver o Supabase dentro da node_modules da pasta web,
      // mesmo quando o import vem de arquivos fora desta pasta (como o /packages)
      '@supabase/supabase-js': path.resolve(__dirname, 'node_modules/@supabase/supabase-js'),
    },
  },
  server: {
    fs: {
      // Permite que o Vite acesse a pasta /packages que está acima de /apps/web
      allow: ['../..'],
    },
  },
  build: {
    commonjsOptions: {
      // Garante que o build suporte pacotes CommonJS se necessário
      include: [/packages/, /node_modules/],
    },
  },
})