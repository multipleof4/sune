export const HTTP_BASE='https://us.proxy.sune.chat/ws'

export const buildBody=()=>{
  const {USER,SUNE,state,payloadWithSampling}=window;
  const msgs=[];
  
  const mPrompt = (USER.masterPrompt || '').trim();
  if(mPrompt && !SUNE.ignore_master_prompt) {
    msgs.push({role:'system', content: mPrompt});
  }
  
  const sPrompt = (SUNE.system_prompt || '').trim();
  if(sPrompt) {
    msgs.push({role:'system', content: sPrompt});
  }

  state.messages.filter(m=>m.role!=='system').forEach(m=>{
    let content = Array.isArray(m.content) ? [...m.content] : [{type:'text',text:String(m.content||'')}];
    
    // Filter out empty text parts which cause 400 errors on strict providers like Moonshot
    content = content.filter(p => p.type !== 'text' || (p.text && p.text.trim().length > 0));
    
    msgs.push({
      role: m.role,
      content: content,
      ...(m.images?.length ? {images: m.images} : {})
    });
  });

  // Strip trailing empty assistant message (prevents 400 on models without prefill support)
  // We keep the UI bubble in main.js, but the API never sees the empty placeholder.
  if (msgs.length > 0) {
    const last = msgs[msgs.length - 1];
    if (last.role === 'assistant' && last.content.length === 0 && (!last.images || last.images.length === 0)) {
      msgs.pop();
    }
  }

  const b=payloadWithSampling({model:SUNE.model.replace(/^(or:|oai:|g:|cla:|cf:)/,''),messages:msgs,stream:true});
  b.reasoning={...(SUNE.reasoning_effort&&SUNE.reasoning_effort!=='default'?{effort:SUNE.reasoning_effort}:{}),exclude:!SUNE.include_thoughts};
  if(SUNE.verbosity)b.verbosity=SUNE.verbosity;
  if(SUNE.img_output){b.modalities=['image'];b.image_config={aspect_ratio:SUNE.aspect_ratio||'1:1',image_size:SUNE.image_size||'1K'}}
  return b
}

async function streamORP(body,onDelta,streamId){
  const {USER,SUNE,state,gid,cacheStore}=window;
  const model=SUNE.model,provider=model.startsWith('oai:')?'openai':model.startsWith('g:')?'google':model.startsWith('cla:')?'claude':model.startsWith('cf:')?'cloudflare':model.startsWith('or:')?'openrouter':USER.provider;
  const apiKey=provider==='openai'?USER.apiKeyOpenAI:provider==='google'?USER.apiKeyGoogle:provider==='claude'?USER.apiKeyClaude:provider==='cloudflare'?USER.apiKeyCloudflare:USER.apiKeyOpenRouter;
  if(!apiKey){onDelta(window.localDemoReply(),true);return {ok:true,rid:streamId||null}}
  const r={rid:streamId||gid(),seq:-1,done:false,signaled:false,ws:null};
  await cacheStore.setItem(r.rid,'busy');
  const signal=t=>{if(!r.signaled){r.signaled=true;onDelta(t||'',true)}};
  const ws=new WebSocket(HTTP_BASE.replace('https','wss')+'?uid='+encodeURIComponent(r.rid));
  r.ws=ws;
  ws.onopen=()=>ws.send(JSON.stringify({type:'begin',rid:r.rid,provider,apiKey,or_body:body}));
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}if(m.type==='delta'&&typeof m.seq==='number'&&m.seq>r.seq){r.seq=m.seq;onDelta(m.text||'',false,m.images)}else if(m.type==='done'||m.type==='err'){r.done=true;cacheStore.setItem(r.rid,'done');signal(m.type==='err'?'\n\n'+(m.message||'error'):'');ws.close()}};
  ws.onclose=()=>{};ws.onerror=()=>{};
  state.controller={abort:()=>{r.done=true;cacheStore.setItem(r.rid,'done');try{if(ws.readyState===1)ws.send(JSON.stringify({type:'stop',rid:r.rid}))}catch{};signal('')},disconnect:()=>ws.close()};
  return {ok:true,rid:r.rid}
}

export async function streamChat(onDelta,streamId){
  const body=buildBody();
  return await streamORP(body,onDelta,streamId)
}
