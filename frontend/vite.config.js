import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('@stream-io') || id.includes('stream-chat')) return 'stream'
          if (id.includes('monaco')) return 'monaco'
          if (id.includes('@clerk')) return 'clerk'
        },
      },
    },
  },
})