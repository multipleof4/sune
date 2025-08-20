import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: { outDir: 'docs' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        id: 'https://sune.planetrenox.com/',
        name: 'Sune',
        short_name: 'Sune',
        description: 'OpenRouter GUI Frontend',
        start_url: 'https://sune.planetrenox.com/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: 'white',
        background_color: 'black',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'https://sune.planetrenox.com/appstore_content/✺.png', sizes: '1024x1024', type: 'image/png' }
        ],
        screenshots: [
          { src: 'https://sune.planetrenox.com/appstore_content/screenshot1.jpg', sizes: '1344x2693', type: 'image/jpeg' },
          { src: 'https://sune.planetrenox.com/appstore_content/screenshot2.jpg', sizes: '1344x2699', type: 'image/jpeg' }
        ]
      }
    })
  ]
})
