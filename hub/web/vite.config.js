import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Integration Hub shell. Runs standalone (no backend) on :5180 using the
// self-contained frontend twin simulator + zero-token stub agents. When the real
// platform microservices land, each module's panel becomes a micro-frontend and
// /api/{twin,scenario,agents} calls proxy through to the owning service.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
})
