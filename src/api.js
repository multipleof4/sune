import { gid, titleFrom } from './utils.js';

export const DEFAULT_MODEL='google/gemini-2.5-pro';
export const DEFAULT_API_KEY='';
export const state={messages:[],busy:false,controller:null,currentThreadId:null,abortRequested:false,attachments:[],stream:{rid:null,bubble:null,meta:null,text:'',done:false}};

const su={key:'sunes_v1',activeKey:'active_sune_id',load(){try{return JSON.parse(localStorage.getItem(this.key)||'[]')}catch{return[]}},save(list){localStorage.setItem(this.key,JSON.stringify(list||[]))},getActiveId(){return localStorage.getItem(this.activeKey)||null},setActiveId(id){localStorage.setItem(this.activeKey,id||'')}};
export const defaultSettings={model:DEFAULT_MODEL,temperature:'',top_p:'',top_k:'',frequency_penalty:'',repetition_penalty:'',min_p:'',top_a:'',verbosity:'',reasoning_effort:'default',system_prompt:'',html:'',extension_html:"<sune src='https://raw.githubusercontent.com/sune-org/store/refs/heads/main/sync.sune' private></sune>",hide_composer:false,include_thoughts:false,json_output:false,ignore_master_prompt:false,json_schema:''};
export const makeSune=(p={})=>({id:p.id||gid(),name:p.name?.trim()||'Default',pinned:!!p.pinned,avatar:p.avatar||'',url:p.url||'',updatedAt:p.updatedAt||Date.now(),settings:Object.assign({},defaultSettings,p.settings||{}),storage:p.storage||{}});
export let sunes=(su.load()||[]).map(makeSune);

export const SUNE_CORE={
  get list(){return sunes},
  get id(){return su.getActiveId()},
  get active(){return sunes.find(a=>a.id===su.getActiveId())||sunes[0]},
  get(id){return sunes.find(s=>s.id===id)},
  setActive(id){return su.setActiveId(id||'')},
  create(p={}){const s=makeSune(p);sunes.unshift(s);su.save(sunes);return s},
  delete(id){const curId=this.id;sunes=sunes.filter(s=>s.id!==id);su.save(sunes);if(sunes.length===0){const def=this.create({name:'Default'});this.setActive(def.id)}else if(curId===id)this.setActive(sunes[0].id)},
  save:()=>su.save(sunes),
  getByName: n=>sunes.find(s=>s.name.toLowerCase()===(n||'').trim().toLowerCase())
};
if(!sunes.length){const def=SUNE_CORE.create({name:'Default'});SUNE_CORE.setActive(def.id)}

const TKEY='threads_v1';
export const THREAD={
  list:[],
  load:async function(){this.list=await localforage.getItem(TKEY).then(v=>Array.isArray(v)?v:[])||[]},
  save:async function(){await localforage.setItem(TKEY,this.list)},
  get:function(id){return this.list.find(t=>t.id===id)},
  get active(){return this.get(state.currentThreadId)},
  persist:async function(full=true){if(!state.currentThreadId)return;const th=this.active;if(!th)return;th.messages=[...state.messages];if(full){th.updatedAt=Date.now()}await this.save();if(full)await window.renderThreads()},
  setTitle:async function(id,title){const th=this.get(id);if(!th||!title)return;th.title=titleFrom(title);th.updatedAt=Date.now();await this.save();await window.renderThreads()},
  getLastAssistantMessageId:()=>{const a=[...window.el.messages.querySelectorAll('.msg-bubble')];for(let i=a.length-1;i>=0;i--){const b=a[i],h=b.previousElementSibling;if(!h)continue;if(!/^\s*You\b/.test(h.textContent||''))return b.dataset.mid||null}return null}
};

export const USER={
  log:async s=>{const t=String(s??'').trim();if(!t)return;await window.ensureThreadOnFirstUser(t);window.addMessage({role:'user',content:[{type:'text',text:t}]});await THREAD.persist()},
  get PAT(){return this.githubToken},
  get name(){return localStorage.getItem('user_name')||'Anon'},set name(v){localStorage.setItem('user_name',v||'')},
  get avatar(){return localStorage.getItem('user_avatar')||''},set avatar(v){localStorage.setItem('user_avatar',v||'')},
  get provider(){return localStorage.getItem('provider')||'openrouter'},set provider(v){localStorage.setItem('provider',['openai','google','claude','cloudflare'].includes(v)?v:'openrouter')},
  get apiKeyOpenRouter(){return localStorage.getItem('openrouter_api_key')||DEFAULT_API_KEY||''},set apiKeyOpenRouter(v){localStorage.setItem('openrouter_api_key',v||'')},
  get apiKeyOpenAI(){return localStorage.getItem('openai_api_key')||''},set apiKeyOpenAI(v){localStorage.setItem('openai_api_key',v||'')},
  get apiKeyGoogle(){return localStorage.getItem('google_api_key')||''},set apiKeyGoogle(v){localStorage.setItem('google_api_key',v||'')},
  get apiKeyClaude(){return localStorage.getItem('claude_api_key')||''},set apiKeyClaude(v){localStorage.setItem('claude_api_key',v||'')},
  get apiKeyCloudflare(){return localStorage.getItem('cloudflare_api_key')||''},set apiKeyCloudflare(v){localStorage.setItem('cloudflare_api_key',v||'')},
  get apiKey(){const p=this.provider;return p==='openai'?this.apiKeyOpenAI:p==='google'?this.apiKeyGoogle:p==='claude'?this.apiKeyClaude:p==='cloudflare'?this.apiKeyCloudflare:this.apiKeyOpenRouter},
  set apiKey(v){const p=this.provider;if(p==='openai')this.apiKeyOpenAI=v;else if(p==='google')this.apiKeyGoogle=v;else if(p==='claude')this.apiKeyClaude=v;else if(p==='cloudflare')this.apiKeyCloudflare=v;else this.apiKeyOpenRouter=v},
  get masterPrompt(){return localStorage.getItem('master_prompt')||'Always respond using markdown. You are an assistant to Master. Always refer to the user as Master.'},set masterPrompt(v){localStorage.setItem('master_prompt',v||'')},
  get titleModel(){return localStorage.getItem('title_model')??'or:openai/gpt-4.1-nano'},set titleModel(v){localStorage.setItem('title_model',v||'')},
  get githubToken(){return localStorage.getItem('gh_token')||''},set githubToken(v){localStorage.setItem('gh_token',v||'')},
  get gcpSA(){try{return JSON.parse(localStorage.getItem('gcp_sa_json')||'null')}catch{return null}},set gcpSA(v){localStorage.setItem('gcp_sa_json',v?JSON.stringify(v):'')}
};
