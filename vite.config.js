import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import htmlInject from 'vite-plugin-html-inject'

export default defineConfig({
  build:{ minify:false },
  plugins:[
    htmlInject(),
    VitePWA({
      registerType:'autoUpdate',
      manifest:{
        id:'https://sune.planetrenox.com/',
        name:'Sune',
        short_name:'Sune',
        description:'OpenRouter GUI Frontend',
        start_url:'https://sune.planetrenox.com/',
        display:'standalone',
        orientation:'portrait',
        theme_color:'#FFFFFF',
        background_color:'#000000',
        categories:['productivity','utilities'],
        icons:[{ src:'https://sune.planetrenox.com/appstore_content/✺.png', sizes:'1024x1024', type:'image/png' }],
        screenshots:[{ src:'https://sune.planetrenox.com/appstore_content/screenshot1.jpg', sizes:'1344x2693', type:'image/jpeg' },{ src:'https://sune.planetrenox.com/appstore_content/screenshot2.jpg', sizes:'1344x2699', type:'image/jpeg' }]
      }
    })
  ]
})
