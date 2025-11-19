const DEFAULT_API_KEY=''
export const USER={
  log:async function(s){const t=String(s??'').trim();if(!t)return;await window.ensureThreadOnFirstUser(t);window.addMessage({role:'user',content:[{type:'text',text:t}]});await window.THREAD.persist()},
  logMany:async function(msgs){if(!Array.isArray(msgs)||!msgs.length)return;const clean=msgs.map(s=>String(s??'').trim()).filter(Boolean);if(!clean.length)return;await window.ensureThreadOnFirstUser(clean[0]);const newMsgs=clean.map(t=>({id:window.gid(),role:'user',content:[{type:'text',text:t}]}));window.state.messages.push(...newMsgs);const frag=document.createDocumentFragment();const newEls=newMsgs.map(m=>{const $row=window._createMessageRow(m),bubble=$row.find('.msg-bubble')[0];bubble.dataset.mid=m.id;return{rowEl:$row[0],bubbleEl:bubble,message:m}});newEls.forEach(item=>frag.appendChild(item.rowEl));window.el.messages.appendChild(frag);queueMicrotask(()=>{newEls.forEach(item=>{window.renderMarkdown(item.bubbleEl,window.partsToText(item.message.content))});window.el.chat.scrollTo({top:window.el.chat.scrollHeight,behavior:'smooth'});window.icons()});await window.THREAD.persist()},
  get PAT(){return this.githubToken},
  get name(){return localStorage.getItem('user_name')||'Anon'},set name(v){localStorage.setItem('user_name',v||'')},
  get avatar(){return localStorage.getItem('user_avatar')||''},set avatar(v){localStorage.setItem('user_avatar',v||'')},
  get provider(){return localStorage.getItem('provider')||'openrouter'},set provider(v){localStorage.setItem('provider',['openai','google','claude','cloudflare'].includes(v)?v:'openrouter')},
  get apiKeyOpenRouter(){return localStorage.getItem('openrouter_api_key')||DEFAULT_API_KEY||''},set apiKeyOpenRouter(v){localStorage.setItem('openrouter_api_key',v||'')},
  get apiKeyOpenAI(){return localStorage.getItem('openai_api_key')||''},set apiKeyOpenAI(v){localStorage.setItem('openai_api_key',v||'')},
  get apiKeyGoogle(){return localStorage.getItem('google_api_key')||''},set apiKeyGoogle(v){localStorage.setItem('google_api_key',v||'')},
  get apiKeyClaude(){return localStorage.getItem('claude_api_key')||''},set apiKeyClaude(v){localStorage.setItem('claude_api_key',v||'')},
  get apiKeyCloudflare(){return localStorage.getItem('cloudflare_api_key')||''},set apiKeyCloudflare(v){localStorage.setItem('cloudflare_api_key',v||'')},
  get apiKey(){const p=this.provider;return p==='openai'?this.apiKeyOpenAI:p==='google'?this.apiKeyGoogle:p==='claude'?this.apiKeyClaude:p==='cloudflare'?this.apiKeyCloudflare:this.apiKeyOpenRouter},set apiKey(v){const p=this.provider;if(p==='openai')this.apiKeyOpenAI=v;else if(p==='google')this.apiKeyGoogle=v;else if(p==='claude')this.apiKeyClaude=v;else if(p==='cloudflare')this.apiKeyCloudflare=v;else this.apiKeyOpenRouter=v},
  get masterPrompt(){return localStorage.getItem('master_prompt')||'Always respond using markdown.'},set masterPrompt(v){localStorage.setItem('master_prompt',v||'')},
  get donor(){return localStorage.getItem('user_donor')!=='false'},set donor(v){localStorage.setItem('user_donor',String(!!v))},
  get titleModel(){return localStorage.getItem('title_model')??'or:openai/gpt-4.1-nano'},set titleModel(v){localStorage.setItem('title_model',v||'')},
  get githubToken(){return localStorage.getItem('gh_token')||''},set githubToken(v){localStorage.setItem('gh_token',v||'')},
  get gcpSA(){try{return JSON.parse(localStorage.getItem('gcp_sa_json')||'null')}catch{return null}},set gcpSA(v){localStorage.setItem('gcp_sa_json',v?JSON.stringify(v):'')}
}
