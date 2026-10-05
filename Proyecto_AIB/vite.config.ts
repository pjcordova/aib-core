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
  // Sin manualChunks: forzar un chunk "export" (xlsx, jspdf) y otro "charts"
  // arrastraba dependencias compartidas, como React, dentro de ellos, y la
  // página de entrada acababa precargándolos (más de 800 KB que el cliente no
  // usa). Lo pesado ya se importa bajo demanda (main.tsx y
  // PrototypePreviewDiferido.tsx) y Vite lo separa solo.
})
