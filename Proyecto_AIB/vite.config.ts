import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
