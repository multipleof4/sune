export const HTTP_BASE='https://orp.aww.4ev.link/ws'

export const buildBody=()=>{
  const {USER,SUNE,state,payloadWithSampling}=window;
  const msgs=[];
  if(USER.masterPrompt&&!SUNE.ignore_master_prompt)msgs.push({role:'system',content:[{type:'text',text:USER.masterPrompt}]});
  if(SUNE.system_prompt)msgs.push({role:'system',content:[{type:'text',text:SUNE.system_prompt}]});
  msgs.push(...state.messages.filter(m=>m.role!=='system').map(m=>({role:m.role,content:m.content})));
  const b=payloadWithSampling({model:SUNE.model.replace(/^(or:|oai:|g:|cla:|cf:)/,''),messages:msgs,stream:true});
  if(SUNE.json_output){let s;try{s=JSON.parse(SUNE.json_schema||'null')}catch{s=null}if(s&&typeof s==='object'&&Object.keys(s).length>0){b.response_format={type:'json_schema',json_schema:s}}else{b.response_format={type:'json_object'}}}
  b.reasoning={...(SUNE.reasoning_effort&&SUNE.reasoning_effort!=='default'?{effort:SUNE.reasoning_effort}:{}),exclude:!SUNE.include_thoughts};
  if(Array.isArray(SUNE.quantizations)&&SUNE.quantizations.length)b.provider={...(b.provider||{}),quantizations:[...new Set(SUNE.quantizations.map(String))]};
  if(SUNE.img_output&&!USER.donor){b.modalities=['text','image'];b.image_config={aspect_ratio:'1:1'}}
  return b
}

async function streamLocal(body,onDelta,signal){
  const {USER,localDemoReply}=window;
  const apiKey=USER.apiKeyOpenRouter;
  if(!apiKey){onDelta(localDemoReply(),true);return}
  try{
    const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:'POST',headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json','HTTP-Referer':'https://sune.chat','X-Title':'Sune'},body:JSON.stringify(body),signal});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const reader=r.body.getReader(),dec=new TextDecoder();
    let buf='';
    while(true){
      const{done,value}=await reader.read();
      if(done)break;
      buf+=dec.decode(value,{stream:true});
      const lines=buf.split('\n');
      buf=lines.pop();
      for(const line of lines){
        if(line.startsWith('data: ')){
          const d=line.slice(6);
          if(d==='[DONE]')return;
          try{
            const j=JSON.parse(d);
            const delta=j.choices?.[0]?.delta?.content||'';
            const reasoning=j.choices?.[0]?.delta?.reasoning;
            const imgs=j.choices?.[0]?.delta?.images;
            if(reasoning&&body.reasoning?.exclude!==true)onDelta(reasoning,false);
            if(delta)onDelta(delta,false);
            if(imgs)imgs.forEach(i=>onDelta(`\n![](${i.image_url.url})\n`,false));
          }catch{}
        }
      }
    }
    onDelta('',true)
  }catch(e){
    if(e.name!=='AbortError')onDelta(`\n\nError: ${e.message}`,true)
  }
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
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}if(m.type==='delta'&&typeof m.seq==='number'&&m.seq>r.seq){r.seq=m.seq;onDelta(m.text||'',false)}else if(m.type==='done'||m.type==='err'){r.done=true;cacheStore.setItem(r.rid,'done');signal(m.type==='err'?'\n\n'+(m.message||'error'):'');ws.close()}};
  ws.onclose=()=>{};ws.onerror=()=>{};
  state.controller={abort:()=>{r.done=true;cacheStore.setItem(r.rid,'done');try{if(ws.readyState===1)ws.send(JSON.stringify({type:'stop',rid:r.rid}))}catch{};signal('')},disconnect:()=>ws.close()};
  return {ok:true,rid:r.rid}
}

export async function streamChat(onDelta,streamId){
  const {USER,state}=window;
  const body=buildBody();
  if(!USER.donor){
    const c=new AbortController();
    state.controller=c;
    await streamLocal(body,onDelta,c.signal);
    state.controller=null;
    return {ok:true,rid:null}
  }
  return await streamORP(body,onDelta,streamId)
}

