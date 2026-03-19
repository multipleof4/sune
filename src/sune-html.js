import { el } from './dom.js';
import { esc } from './utils.js';

export const resolveSuneSrc = src => {
  if (!src) return null;
  if (src.startsWith('gh://')) {
    const path = src.substring(5), parts = path.split('/');
    if (parts.length < 3) return null;
    const[owner, repo, ...filePathParts] = parts;
    return `https://raw.githubusercontent.com/${owner}/${repo}/main/${filePathParts.join('/')}`;
  }
  return src;
};

export const processSuneIncludes = async (html, depth = 0) => {
  if (depth > 5) return '<!-- Sune include depth limit reached -->';
  if (!html) return '';
  
  // Bypass Sanitizer API by parsing into an inert document
  const doc = Document.parseHTMLUnsafe ? Document.parseHTMLUnsafe(html) : new DOMParser().parseFromString(html, 'text/html');
  const c = doc.body;

  for (const n of [...c.querySelectorAll('sune')]) {
    if (n.hasAttribute('src')) {
      if (n.hasAttribute('private') && depth > 0) {
        n.remove();
        continue;
      }
      const s = n.getAttribute('src'), u = resolveSuneSrc(s);
      if (!u) {
        n.replaceWith(document.createComment(` Invalid src: ${esc(s)} `));
        continue;
      }
      try {
        const r = await fetch(u);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json(), o = Array.isArray(d) ? d[0] : d, h =[o?.settings?.extension_html || '', o?.settings?.html || ''].join('\n');
        
        const subHtml = await processSuneIncludes(h, depth + 1);
        const subDoc = Document.parseHTMLUnsafe ? Document.parseHTMLUnsafe(subHtml) : new DOMParser().parseFromString(subHtml, 'text/html');
        n.replaceWith(...Array.from(subDoc.body.childNodes));
      } catch (e) {
        n.replaceWith(document.createComment(` Fetch failed: ${esc(u)} `));
      }
    } else {
      n.replaceWith(...Array.from(n.childNodes));
    }
  }
  return c.innerHTML;
};

export const renderSuneHTML = async () => {
  const SUNE = window.SUNE;
  const h = await processSuneIncludes([SUNE.extension_html, SUNE.html].map(x => (x || '').trim()).join('\n'));
  const c = el.suneHtml;
  c.innerHTML = '';
  const t = h.trim();
  c.classList.toggle('hidden', !t);
  
  if (t) {
    const doc = Document.parseHTMLUnsafe ? Document.parseHTMLUnsafe(h) : new DOMParser().parseFromString(h, 'text/html');
    c.append(...Array.from(doc.body.childNodes));
    
    // Explicitly re-create script tags so they execute, bypassing contextual fragment blocks
    c.querySelectorAll('script').forEach(oldScript => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
      newScript.textContent = oldScript.textContent;
      
      // Preserve execution order for external scripts matching standard parser behavior
      if (!newScript.hasAttribute('async')) newScript.async = false; 
      
      oldScript.replaceWith(newScript);
    });
    
    window.Alpine?.initTree(c);
  }
};
