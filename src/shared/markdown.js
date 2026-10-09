'use strict';
// Tiny, safe Markdown -> HTML renderer for AI answers. Everything is HTML-escaped
// first, so model output can never inject markup.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MWMarkdown = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function inline(text) {
    let s = escapeHtml(text);
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    return s;
  }

  function render(md) {
    const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let list = null; // 'ul' | 'ol'
    let code = null; // array of lines while inside a fence
    let para = [];

    const closeList = () => {
      if (list) {
        html.push(`</${list}>`);
        list = null;
      }
    };
    const flushPara = () => {
      if (para.length) {
        html.push('<p>' + para.map(inline).join('<br>') + '</p>');
        para = [];
      }
    };

    for (const line of lines) {
      if (code) {
        if (/^```/.test(line)) {
          html.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
          code = null;
        } else code.push(line);
        continue;
      }
      if (/^```/.test(line)) {
        flushPara();
        closeList();
        code = [];
        continue;
      }
      let m;
      if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) {
        flushPara();
        closeList();
        const level = Math.min(m[1].length + 2, 6);
        html.push(`<h${level}>${inline(m[2])}</h${level}>`);
      } else if ((m = /^\s*(?:[-*+])\s+(?:\[( |x)\]\s+)?(.*)$/i.exec(line))) {
        flushPara();
        if (list !== 'ul') {
          closeList();
          html.push('<ul>');
          list = 'ul';
        }
        const box = m[1] === undefined ? '' : m[1].toLowerCase() === 'x' ? '&#9745; ' : '&#9744; ';
        html.push('<li>' + box + inline(m[2]) + '</li>');
      } else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
        flushPara();
        if (list !== 'ol') {
          closeList();
          html.push('<ol>');
          list = 'ol';
        }
        html.push('<li>' + inline(m[1]) + '</li>');
      } else if (!line.trim()) {
        flushPara();
        closeList();
      } else {
        closeList();
        para.push(line);
      }
    }
    if (code) html.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
    flushPara();
    closeList();
    return html.join('\n');
  }

  return { render, escapeHtml };
});
