import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Integration Hub shell. In production it is served statically and every /api
// call hits the hub backend (FastAPI) as the single secured origin: the hub owns
// auth + org/user administration and hive, and reverse-proxies /api/twin,
// /api/scenario and /api/agents onward to the real platforms with server-side keys.
// In dev, everything under /api proxies to the hub backend on :8090.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.HUB_API || 'http://localhost:8090',
        changeOrigin: true,
      },
    },
  },
})
