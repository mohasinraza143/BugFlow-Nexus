import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('plotly.js') || id.includes('react-plotly')) {
            return 'vendor-plotly';
          }
          if (id.includes('jspdf') || id.includes('jspdf-autotable') || id.includes('html2canvas')) {
            return 'vendor-pdf';
          }
          if (id.includes('recharts')) {
            return 'vendor-recharts';
          }
          if (id.includes('node_modules')) {
            return 'vendor-core';
          }
        },
      },
    },
    chunkSizeWarningLimit: 2500,
  },
})

