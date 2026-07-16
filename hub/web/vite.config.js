import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'

// The Integration Hub shell (host). It composes each platform's real UI as a
// Module-Federation REMOTE rendered natively (no iframe). All /api calls hit the
// hub backend (single secured origin): the hub owns auth + reverse-proxies
// /api/twin, /api/scenario, /api/agents to the real platforms with server-side
// keys. In dev, /api proxies to the hub backend on :8090.
//
// VITE_TWIN_REMOTE = URL of the NextXR remote's remoteEntry.js. Local default is
// the NextXR `vite preview` server; on AWS it is the S3/CloudFront remote path.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Local default = NextXR's own backend serving its built frontend (CORS is open
  // there). On AWS this is the S3/CloudFront remote path. Override via .env.local.
  const TWIN_REMOTE = env.VITE_TWIN_REMOTE || 'http://localhost:8080/assets/remoteEntry.js'

  return {
    plugins: [
      react(),
      federation({
        name: 'goalcertHub',
        remotes: {
          // consumed by hub/web/src/hub/remotes/TwinRemoteHost.jsx
          nextxrTwin: TWIN_REMOTE,
        },
        // React MUST be a single instance across host+remote or hooks break
        // (that's the only true singleton requirement here). three/@react-three
        // and react-router are used ONLY inside the remote's own tree, so it
        // provides its own copies — the host doesn't share them.
        shared: ['react', 'react-dom'],
      }),
    ],
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
    build: {
      target: 'esnext',   // required by module federation
    },
  }
})
