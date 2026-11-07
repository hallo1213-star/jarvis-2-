import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Generates dist/sw.js with a precache list of the app shell (hashed JS/CSS, icons, covers).
function aurixServiceWorker() {
  let outDir = 'dist'
  return {
    name: 'aurix-sw',
    apply: 'build',
    configResolved(cfg) { outDir = cfg.build.outDir },
    writeBundle(_, bundle) {
      // Only precache what the AURIX entry needs (NOVA Drive chunks like TensorFlow stay out)
      const seen = new Set()
      const visit = (f) => {
        const c = bundle[f]
        if (!c || seen.has(f)) return
        seen.add(f)
        if (c.type !== 'chunk') return
        c.viteMetadata?.importedCss?.forEach((css) => seen.add(css))
        ;[...c.imports, ...c.dynamicImports].forEach(visit)
      }
      Object.values(bundle).filter((c) => c.type === 'chunk' && c.isEntry && c.name === 'main').forEach((c) => visit(c.fileName))
      const assets = [...seen].filter((f) => /\.(js|css)$/.test(f))
      const list = (dir) => readdirSync(join(outDir, dir)).map((f) => `${dir}/${f}`)
      const precache = ['./', 'index.html', 'manifest.webmanifest', 'favicon.svg',
        ...list('icons'), ...list('covers'), ...assets]
      const version = Date.now().toString(36)
      const sw = readFileSync('sw-template.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache))
      writeFileSync(join(outDir, 'sw.js'), sw)
    },
  }
}

// base './' → the build works from any sub-path (e.g. GitHub Pages /<repo>/) and as
// installed home-screen app on iOS.
export default defineConfig({
  base: './',
  plugins: [react(), aurixServiceWorker()],
  build: {
    target: ['es2020', 'safari15'],
    assetsInlineLimit: 0,
    // Two apps in one build: AURIX (music, /) and NOVA Drive (navigation, /navi/)
    rollupOptions: { input: { main: 'index.html', navi: 'navi/index.html' } },
  },
  server: { host: true },
})
