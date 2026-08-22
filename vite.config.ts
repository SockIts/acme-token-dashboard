import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const readEnv = (name: string, fallback = '') => process.env[name] ?? env[name] ?? fallback
  const apiTarget = readEnv('VITE_API_PROXY_TARGET', 'https://acme.pics/api')
  const apiOrigin = readEnv('VITE_API_PROXY_ORIGIN', new URL(apiTarget).origin)
  const adminTarget = readEnv('VITE_ADMIN_PROXY_TARGET', apiOrigin)
  const rewritePrefix = apiTarget.endsWith('/api') ? '' : '/v2'
  const acmeNetwork = readEnv('ACME_NETWORK', 'mainnet')
  const basePath = readEnv('VITE_BASE_PATH', mode === 'production' ? '/acme-token-dashboard/' : '/')

  return {
    base: basePath,
    define: {
      __ACME_NETWORK__: JSON.stringify(acmeNetwork),
    },
    plugins: [
      react(),
      nodePolyfills({
        include: ['buffer', 'process'],
        globals: { Buffer: true, process: true },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5190,
      host: '0.0.0.0',
      proxy: {
        '/api/compose': {
          target: apiOrigin,
          changeOrigin: true,
        },
        '/admin': {
          target: adminTarget,
          changeOrigin: true,
        },
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (proxyPath) => proxyPath.replace(/^\/api/, rewritePrefix),
        },
      },
    },
  }
})
