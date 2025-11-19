export const gid=()=>Math.random().toString(36).slice(2,9)
export const sid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6)
export const esc=s=>String(s).replace(/[&<>'"`]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;","`":"&#96;"}[c]))
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v))
export const num=(v,d)=>v==null||v===''||isNaN(+v)?d:+v
export const int=(v,d)=>v==null||v===''||isNaN(parseInt(v))?d:parseInt(v)
export const haptic=()=>/android/i.test(navigator.userAgent)&&navigator.vibrate?.(1)
export const fmtSize=b=>{const u=['B','KB','MB','GB','TB'];let i=0,x=b;while(x>=1024&&i<u.length-1){x/=1024;i++}return (x>=10?Math.round(x):Math.round(x*10)/10)+' '+u[i]}
export const asDataURL=f=>new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(String(fr.result||''));fr.readAsDataURL(f)})
export const imgToWebp=(f,D=128,q=80)=>new Promise((r,j)=>{if(!f)return j();const i=new Image;i.onload=()=>{const c=document.createElement('canvas'),x=c.getContext('2d');let w=i.width,h=i.height;if(D>0&&Math.max(w,h)>D)w>h?(h=D*h/w,w=D):(w=D*w/h,h=D);c.width=w;c.height=h;x.drawImage(i,0,0,w,h);r(c.toDataURL('image/webp',clamp(q,0,100)/100));URL.revokeObjectURL(i.src)};i.onerror=j;i.src=URL.createObjectURL(f)})
export const b64=x=>x.split(',')[1]||''
export const dl=(name,obj)=>{const blob=new Blob([JSON.stringify(obj,null,2)],{type:name.endsWith('.sune')?'application/octet-stream':'application/json'}),url=URL.createObjectURL(blob),a=$('<a>').prop({href:url,download:name}).appendTo('body');a.get(0).click();a.remove();URL.revokeObjectURL(url)}
export const ts=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`}
export const positionPopover=(a,p)=>{const r=a.getBoundingClientRect();p.style.top=`${r.bottom+p.offsetHeight+4>window.innerHeight?r.top-p.offsetHeight-4:r.bottom+4}px`;p.style.left=`${Math.max(8,Math.min(r.right-p.offsetWidth,window.innerWidth-p.offsetWidth-8))}px`}
export const titleFrom=t=>(t||'').replace(/\s+/g,' ').trim().slice(0,60)||'Untitled'
export const partsToText=parts=>{if(!parts)return'';if(Array.isArray(parts))return parts.map(p=>p?.type==='text'?p.text:(p?.type==='image_url'?`![](${p.image_url?.url||''})`:(p?.type==='file'?`[${p.file?.filename||'file'}]`:(p?.type==='input_audio'?`(audio:${p.input_audio?.format||''})`:'')))).join('\n');return String(parts)}
