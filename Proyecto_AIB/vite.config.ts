import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Los correos de Supabase (recuperación, magic link, confirmación) llevan
    // al Site URL del proyecto, que es http://localhost:3000. Servimos ahí para
    // que esos enlaces caigan en la app en vez de en un puerto vacío.
    port: 3000,
    strictPort: true,
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Las librerias de exportacion pesan ~1.4MB juntas y solo se usan en el
        // informe tecnico. Aisladas en su propio chunk no lastran el arranque.
        manualChunks: {
          export: ['xlsx', 'jspdf'],
          charts: ['chart.js', 'react-chartjs-2'],
        },
      },
    },
  },
})
