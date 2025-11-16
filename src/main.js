import * as utils from './utils.js'
import {SUNE,THREAD,USER,state} from './state.js'
import * as api from './api.js'
import * as ui from './ui.js'

(()=>{let k,v=visualViewport;const f=()=>{removeEventListener('popstate',f),document.activeElement?.blur()};v.onresize=()=>{let o=v.height<innerHeight;o!=k&&((k=o)?(history.pushState({k:1},''),addEventListener('popstate',f)):(removeEventListener('popstate',f),history.state?.k&&history.back()))}})()

Object.assign(window,utils,{SUNE,THREAD,USER,state,el:ui.el,...api,...ui})

async function init(){await SUNE.fetchDotSune('sune-org/store@main/marketplace.sune');await THREAD.load();await ui.renderThreads();ui.renderSidebar();await ui.reflectActiveSune();ui.clearChat();utils.icons();ui.setupEventListeners()}

init()
