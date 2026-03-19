import mathjax3 from 'https://esm.sh/markdown-it-mathjax3';

export const md = window.md = window.markdownit({ html: false, linkify: true, typographer: true, breaks: true }).use(mathjax3);

export function enhanceCodeBlocks(root, doHL = true) {
  window.$(root).find('pre>code').each((i, code) => {
    if (code.textContent.length > 200000) return;
    const $pre = window.$(code).parent().addClass('relative rounded-xl border border-gray-200');
    if (!$pre.find('.code-actions').length) {
      const len = code.textContent.length, countText = len >= 1e3 ? (len / 1e3).toFixed(1) + 'K' : len;
      const $btn = window.$('<button class="bg-slate-900 text-white rounded-lg py-1 px-2 text-xs opacity-85">Copy</button>').on('click', async e => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(code.innerText);
          $btn.text('Copied');
          setTimeout(() => $btn.text('Copy'), 1200);
        } catch { }
      });
      const $container = window.$('<div class="code-actions absolute top-2 right-2 flex items-center gap-2"></div>');
      $container.append(window.$(`<span class="text-xs text-gray-500">${countText} chars</span>`), $btn);
      $pre.append($container);
    }
    if (doHL && window.hljs && code.textContent.length < 100000) window.hljs.highlightElement(code);
  });
}

export const renderMarkdown = window.renderMarkdown = function (node, text, opt = { enhance: true, highlight: true }) {
  node.innerHTML = md.render(text);
  if (opt.enhance) enhanceCodeBlocks(node, opt.highlight);
};
