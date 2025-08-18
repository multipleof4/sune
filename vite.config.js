import { defineConfig } from 'vite' 
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({ 
  build: { outDir: 'docs' }, 
  plugins: [ 
    VitePWA({ 
      registerType: 'autoUpdate', 
      manifest: { 
        name: 'Sune', 
        short_name: 'Sune', 
        start_url: '.', 
        display: 'standalone', 
        icons: [ 
          { src: 'https://sune.planetrenox.com/✺.png', sizes: '1024x1024', type: 'image/png' }
        ] 
      } 
    }) 
  ] 
})
