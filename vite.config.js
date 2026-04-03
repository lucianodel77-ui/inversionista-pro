import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/chat': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => '/v1/messages',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01',
        },
      },
      // Proxy ArgentinaDatos FCI histórico (evita CORS en endpoints con fecha)
      '/api/fci-history': {
        target: 'https://api.argentinadatos.com',
        changeOrigin: true,
        rewrite: (path) => {
          const qs = path.split('?')[1] || '';
          const p = new URLSearchParams(qs);
          return `/v1/finanzas/fci/${p.get('tipo')}/${p.get('fecha')}`;
        },
      },
      '/api/fci-penultimo': {
        target: 'https://api.argentinadatos.com',
        changeOrigin: true,
        rewrite: (path) => {
          const qs = path.split('?')[1] || '';
          const p = new URLSearchParams(qs);
          return `/v1/finanzas/fci/${p.get('tipo')}/penultimo`;
        },
      },
    },
  },
})
