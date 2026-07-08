import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Integration Hub shell. Runs standalone (no backend) on :5180 using the
// self-contained frontend twin simulator + zero-token stub agents. When the real
// platform microservices land, each module's panel becomes a micro-frontend and
// /api/{twin,scenario,agents,drone} calls proxy through to the owning service.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      // NextXR Digital Twin — strip /api/twin, forward to /api/v1/
      '/api/twin': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/twin/, '/api/v1'),
      },
      // AUTOMIND Agentic AI — strip /api/agents, forward to /api/
      '/api/agents': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/agents/, '/api'),
      },
      // GoalCert Simulation Engine — strip /api/scenario, forward to /api/
      '/api/scenario': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/scenario/, '/api'),
      },
      // DroneForce — strip /api/drone, forward to /api/
      '/api/drone': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/drone/, '/api'),
      },
    },
  },
})
