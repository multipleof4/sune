import{el}from'./dom.js';
(()=>{let k,v=visualViewport;const f=()=>{removeEventListener('popstate',f),document.activeElement?.blur()};v.onresize=()=>{let o=v.height<innerHeight;o!=k&&((k=o)?(history.pushState({k:1},''),addEventListener('popstate',f)):(removeEventListener('popstate',f),history.state?.k&&history.back()))}})()
export const haptic=()=>/android/i.test(navigator.userAgent)&&navigator.vibrate?.(1)
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v))
export const num=(v,d)=>v==null||v===''||isNaN(+v)?d:+v
export const int=(v,d)=>v==null||v===''||isNaN(parseInt(v))?d:parseInt(v)
export const gid=()=>Math.random().toString(36).slice(2,9)
export const sid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6)
export const esc=s=>String(s).replace(/[&<>'"`]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;","`":"&#96;"}[c]))
export const fmtSize=b=>{const u=['B','KB','MB','GB','TB'];let i=0,x=b;while(x>=1024&&i<u.length-1){x/=1024;i++}return (x>=10?Math.round(x):Math.round(x*10)/10)+' '+u[i]}
export const asDataURL=f=>new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(String(fr.result||''));fr.readAsDataURL(f)})
export const imgToWebp=(f,D=128,q=80)=>new Promise((r,j)=>{if(!f)return j();const i=new Image;i.onload=()=>{const c=document.createElement('canvas'),x=c.getContext('2d');let w=i.width,h=i.height;if(D>0&&Math.max(w,h)>D)w>h?(h=D*h/w,w=D):(w=D*w/h,h=D);c.width=w;c.height=h;x.drawImage(i,0,0,w,h);r(c.toDataURL('image/webp',clamp(q,0,100)/100));URL.revokeObjectURL(i.src)};i.onerror=j;i.src=URL.createObjectURL(f)});
export const b64=x=>x.split(',')[1]||''
export const ts=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}${p(d.getMonth()+1)}$p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`}
export const dl=(name,obj)=>{const blob=new Blob([JSON.stringify(obj,null,2)],{type:name.endsWith('.sune')?'application/octet-stream':'application/json'}),url=URL.createObjectURL(blob),a=$('<a>').prop({href:url,download:name}).appendTo('body');a.get(0).click();a.remove();URL.revokeObjectURL(url)}
export const getModelShort=m=>{const mm=m||'';return mm.includes('/')?mm.split('/').pop():mm}
export function kbUpdate(){const vv=window.visualViewport;const overlap=vv?Math.max(0,(window.innerHeight-(vv.height+vv.offsetTop))):0;document.documentElement.style.setProperty('--kb',overlap+'px');const fh=el.footer.getBoundingClientRect().height;document.documentElement.style.setProperty('--footer-h',fh+'px');el.footer.style.transform='translateY('+(-overlap)+'px)';el.chat.style.scrollPaddingBottom=(fh+overlap+16)+'px'}
export function kbBind(){if(window.visualViewport){['resize','scroll'].forEach(ev=>visualViewport.addEventListener(ev,()=>kbUpdate(),{passive:true}))}$(window).on('resize orientationchange',()=>setTimeout(kbUpdate,50));$(el.input).on('focus click',()=>{setTimeout(()=>{kbUpdate();el.input.scrollIntoView({block:'nearest',behavior:'smooth'})},0)})}
