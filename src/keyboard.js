import { el } from './dom.js';

export function kbUpdate() {
  const vv = window.visualViewport;
  const overlap = vv ? Math.max(0, (window.innerHeight - (vv.height + vv.offsetTop))) : 0;
  document.documentElement.style.setProperty('--kb', overlap + 'px');
  const fh = el.footer.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--footer-h', fh + 'px');
  el.footer.style.transform = 'translateY(' + (-overlap) + 'px)';
  el.chat.style.scrollPaddingBottom = (fh + overlap + 16) + 'px';
}

export function kbBind() {
  if (window.visualViewport) {
    ['resize', 'scroll'].forEach(ev => window.visualViewport.addEventListener(ev, () => kbUpdate(), { passive: true }));
  }
  window.$(window).on('resize orientationchange', () => setTimeout(kbUpdate, 50));
  window.$(el.input).on('focus click', () => {
    setTimeout(() => {
      kbUpdate();
      el.input.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 0);
  });
}
