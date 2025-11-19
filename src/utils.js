export const el=new Proxy({},{get:(t,p)=>document.getElementById(p)})
export const icons=()=>window.lucide&&lucide.createIcons()
export const haptic=()=>/android/i.test(navigator.userAgent)&&navigator.vibrate?.(1)
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v))
export const num=(v,d)=>v==null||v===''||isNaN(+v)?d:+v
export const int=(v,d)=>v==null||v===''||isNaN(parseInt(v))?d:parseInt(v)
export const gid=()=>Math.random().toString(36).slice(2,9)
export const esc=s=>String(s).replace(/[&<>'"`]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;","`":"&#96;"}[c]))
export const positionPopover=(a,p)=>{const r=a.getBoundingClientRect();p.style.top=`${r.bottom+p.offsetHeight+4>window.innerHeight?r.top-p.offsetHeight-4:r.bottom+4}px`;p.style.left=`${Math.max(8,Math.min(r.right-p.offsetWidth,window.innerWidth-p.offsetWidth-8))}px`}
export const sid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6)
export const fmtSize=b=>{const u=['B','KB','MB','GB','TB'];let i=0,x=b;while(x>=1024&&i<u.length-1){x/=1024;i++}return (x>=10?Math.round(x):Math.round(x*10)/10)+' '+u[i]}
export const asDataURL=f=>new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(String(fr.result||''));fr.readAsDataURL(f)})
export const imgToWebp=(f,D=128,q=80)=>new Promise((r,j)=>{if(!f)return j();const i=new Image;i.onload=()=>{const c=document.createElement('canvas'),x=c.getContext('2d');let w=i.width,h=i.height;if(D>0&&Math.max(w,h)>D)w>h?(h=D*h/w,w=D):(w=D*w/h,h=D);c.width=w;c.height=h;x.drawImage(i,0,0,w,h);r(c.toDataURL('image/webp',clamp(q,0,100)/100));URL.revokeObjectURL(i.src)};i.onerror=j;i.src=URL.createObjectURL(f)})
export const b64=x=>x.split(',')[1]||''
export const dl=(name,obj)=>{const blob=new Blob([JSON.stringify(obj,null,2)],{type:name.endsWith('.sune')?'application/octet-stream':'application/json'}),url=URL.createObjectURL(blob),a=$('<a>').prop({href:url,download:name}).appendTo('body');a.get(0).click();a.remove();URL.revokeObjectURL(url)}
export const ts=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`}
export const md=window.markdownit({html:false,linkify:true,typographer:true,breaks:true})
export const partsToText=parts=>{if(!parts)return'';if(Array.isArray(parts))return parts.map(p=>p?.type==='text'?p.text:(p?.type==='image_url'?`![](${p.image_url?.url||''})`:(p?.type==='file'?`[${p.file?.filename||'file'}]`:(p?.type==='input_audio'?`(audio:${p.input_audio?.format||''})`:'')))).join('\n');return String(parts)}
export const titleFrom=t=>(t||'').replace(/\s+/g,' ').trim().slice(0,60)||'Untitled'
export let jars={html:null,extension:null,jsonSchema:null}
export const ensureJars=async()=>{if(jars.html&&jars.extension&&jars.jsonSchema)return jars;const mod=await import('https://medv.io/codejar/codejar.js'),CodeJar=mod.CodeJar||mod.default,hl=e=>e.innerHTML=hljs.highlight(e.textContent,{language:'xml'}).value,hl_json=e=>e.innerHTML=hljs.highlight(e.textContent,{language:'json'}).value;if(!jars.html)jars.html=CodeJar(el.htmlEditor,hl,{tab:'  '});if(!jars.extension)jars.extension=CodeJar(el.extensionHtmlEditor,hl,{tab:'  '});if(!jars.jsonSchema)jars.jsonSchema=CodeJar(el.jsonSchemaEditor,hl_json,{tab:'  '});return jars}
export const kbUpdate=()=>{const vv=window.visualViewport,overlap=vv?Math.max(0,(window.innerHeight-(vv.height+vv.offsetTop))):0;document.documentElement.style.setProperty('--kb',overlap+'px');const fh=el.footer.getBoundingClientRect().height;document.documentElement.style.setProperty('--footer-h',fh+'px');el.footer.style.transform='translateY('+(-overlap)+'px)';el.chat.style.scrollPaddingBottom=(fh+overlap+16)+'px'}
export const kbBind=()=>{if(window.visualViewport){['resize','scroll'].forEach(ev=>visualViewport.addEventListener(ev,()=>kbUpdate(),{passive:true}))}$(window).on('resize orientationchange',()=>setTimeout(kbUpdate,50));$(el.input).on('focus click',()=>{setTimeout(()=>{kbUpdate();el.input.scrollIntoView({block:'nearest',behavior:'smooth'})},0)})}
export const getModelShort=m=>{const mm=m||'';return mm.includes('/')?mm.split('/').pop():mm}
