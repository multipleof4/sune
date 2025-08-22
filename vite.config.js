import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { createHtmlPlugin } from 'vite-plugin-html'

const pwa = VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    id: 'https://sune.planetrenox.com/',
    name: 'Sune',
    short_name: 'Sune',
    description: 'OpenRouter GUI Frontend',
    start_url: 'https://sune.planetrenox.com/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#FFFFFF',
    background_color: '#000000',
    categories: ['productivity','utilities'],
    icons: [{ src: 'https://sune.planetrenox.com/appstore_content/✺.png', sizes: '1024x1024', type: 'image/png' }],
    screenshots: [
      { src: 'https://sune.planetrenox.com/appstore_content/screenshot1.jpg', sizes: '1344x2693', type: 'image/jpeg' },
      { src: 'https://sune.planetrenox.com/appstore_content/screenshot2.jpg', sizes: '1344x2699', type: 'image/jpeg' }
    ]
  }
})

const html = createHtmlPlugin({
  inject: {
    tags: [
      { tag: 'title', children: 'Sune', injectTo: 'head' },
      { tag: 'link', attrs: { rel: 'icon', type: 'image/avif', href: 'https://sune.planetrenox.com/✺.avif' }, injectTo: 'head' },
      { tag: 'script', attrs: { src: 'https://cdn.jsdelivr.net/npm/tiny-ripple@0.2.0' }, injectTo: 'head' },
      { tag: 'style', children: ':root{--safe-bottom:env(safe-area-inset-bottom)}::-webkit-scrollbar{height:8px;width:8px}::-webkit-scrollbar-thumb{background:#e5e7eb;border-radius:999px}.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}', injectTo: 'head' }
    ]
  }
})

export default defineConfig({ build: { outDir: 'docs' }, plugins: [pwa, html] })
