const test = require('node:test');
const assert = require('node:assert');
const { render } = require('../src/shared/markdown');

test('escapes HTML from model output', () => {
  const html = render('<img src=x onerror=alert(1)> **bold**');
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('<strong>bold</strong>'));
});

test('renders lists, headings, checkboxes and code fences', () => {
  const html = render('## Title\n- a\n- [x] done\n- [ ] todo\n\n1. one\n2. two\n\n```js\nconst x = <b>;\n```');
  assert.ok(html.includes('<h4>Title</h4>'));
  assert.ok(html.includes('<ul>') && html.includes('<ol>'));
  assert.ok(html.includes('&#9745; done') && html.includes('&#9744; todo'));
  assert.ok(html.includes('<pre><code>const x = &lt;b&gt;;</code></pre>'));
});

test('unterminated code fence is closed', () => {
  assert.ok(render('```\nabc').endsWith('</code></pre>'));
});
