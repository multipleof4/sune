import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import htmlPlugin from 'vite-plugin-html-config'

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
    categories: ['productivity', 'utilities'],
    icons: [{ src: 'https://sune.planetrenox.com/appstore_content/✺.png', sizes: '1024x1024', type: 'image/png' }],
    screenshots: [
      { src: 'https://sune.planetrenox.com/appstore_content/screenshot1.jpg', sizes: '1344x2693', type: 'image/jpeg' },
      { src: 'https://sune.planetrenox.com/appstore_content/screenshot2.jpg', sizes: '1344x2699', type: 'image/jpeg' }
    ]
  }
})

const html = htmlPlugin({
  title: 'Sune',
  metas: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }],
  links: [{ rel: 'icon', type: 'image/avif', href: 'https://sune.planetrenox.com/✺.avif' }],
  headScripts: [{ src: 'https://cdn.jsdelivr.net/npm/tiny-ripple@0.2.0' }]
})

export default defineConfig({
  build: { outDir: 'docs' },
  plugins: [html, pwa]
})
