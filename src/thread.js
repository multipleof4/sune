import { state } from './state.js'
import { titleFrom } from './utils.js'
import { renderThreads } from './ui.js'
import { el } from './dom.js'

const TKEY='threads_v1'
export const THREAD={
  list:[],
  load:async function(){this.list=await localforage.getItem(TKEY).then(v=>Array.isArray(v)?v:[])||[]},
  save:async function(){await localforage.setItem(TKEY,this.list)},
  get:function(id){return this.list.find(t=>t.id===id)},
  get active(){return this.get(state.currentThreadId)},
  persist:async function(full=true){if(!state.currentThreadId)return;const th=this.active;if(!th)return;th.messages=[...state.messages];if(full){th.updatedAt=Date.now()}await this.save();if(full)await renderThreads()},
  setTitle:async function(id,title){const th=this.get(id);if(!th||!title)return;th.title=titleFrom(title);th.updatedAt=Date.now();await this.save();await renderThreads()},
  getLastAssistantMessageId:()=>{const a=[...el.messages.querySelectorAll('.msg-bubble')];for(let i=a.length-1;i>=0;i--){const b=a[i],h=b.previousElementSibling;if(!h)continue;if(!/^\s*You\b/.test(h.textContent||''))return b.dataset.mid||null}return null}
}
