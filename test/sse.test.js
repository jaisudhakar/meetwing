const test = require('node:test');
const assert = require('node:assert');
const { SSEParser } = require('../src/shared/sse');

test('parses events split across chunks', () => {
  const p = new SSEParser();
  assert.deepStrictEqual(p.push('data: {"a":1}\n'), []);
  assert.deepStrictEqual(p.push('\ndata: two\n\n'), [
    { event: 'message', data: '{"a":1}' },
    { event: 'message', data: 'two' },
  ]);
});

test('handles named events, CRLF and comments', () => {
  const p = new SSEParser();
  const evts = p.push(': keepalive\r\nevent: content_block_delta\r\ndata: x\r\n\r\n');
  assert.deepStrictEqual(evts, [{ event: 'content_block_delta', data: 'x' }]);
});

test('flush returns a trailing event with no blank line', () => {
  const p = new SSEParser();
  p.push('data: tail');
  assert.deepStrictEqual(p.flush(), [{ event: 'message', data: 'tail' }]);
});
