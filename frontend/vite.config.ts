import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function resolveBuildId(): string {
  const fromEnv = process.env.VITE_APP_BUILD_ID?.trim() || process.env.GITHUB_SHA?.trim()
  if (fromEnv) return fromEnv.slice(0, 40)
  return `local-${Date.now().toString(36)}`
}

const buildId = resolveBuildId()

function injectBuildIdPlugin() {
  const metaTag = `<meta name="app-build-id" content="${buildId}" />`
  return {
    name: 'inject-build-id',
    transformIndexHtml(html: string) {
      if (html.includes('name="app-build-id"')) return html
      return html.replace('</head>', `  ${metaTag}\n  </head>`)
    },
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist')
      const payload = JSON.stringify(
        { buildId, builtAt: new Date().toISOString() },
        null,
        2,
      )
      fs.writeFileSync(path.join(distDir, 'version.json'), payload, 'utf8')
    },
  }
}

export default defineConfig({
  plugins: [react(), injectBuildIdPlugin()],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  build: {
    rollupOptions: {
      input: {
        admin: 'admin.html',
      },
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) return "react-vendor";
          if (id.includes("socket.io-client") || id.includes("engine.io-client")) return "socket-vendor";
          if (id.includes("chart.js") || id.includes("react-chartjs-2")) return "chart-vendor";
          if (id.includes("jspdf") || id.includes("html2canvas")) return "pdf-vendor";
        },
      },
    },
  },
  server: {
    open: '/admin.html',
    fs: {
      allow: [repoRoot],
    },
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3001',
      },
      '/uploads': {
        target: 'http://localhost:3001',
      },
      '/uploads_eras': {
        target: 'http://localhost:3001',
      },
      '/uploads_buffs': {
        target: 'http://localhost:3001',
      },
      '/uploads_personas': {
        target: 'http://localhost:3001',
      },
    },
  },
})
