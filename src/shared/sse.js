'use strict';
// Incremental Server-Sent-Events parser. Feed it decoded text chunks; it returns
// complete events as they become available.

class SSEParser {
  constructor() {
    this.buffer = '';
  }

  push(text) {
    this.buffer += text.replace(/\r\n/g, '\n');
    const events = [];
    let idx;
    while ((idx = this.buffer.indexOf('\n\n')) !== -1) {
      const raw = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const evt = parseBlock(raw);
      if (evt) events.push(evt);
    }
    return events;
  }

  flush() {
    const raw = this.buffer;
    this.buffer = '';
    const evt = raw.trim() ? parseBlock(raw) : null;
    return evt ? [evt] : [];
  }
}

function parseBlock(raw) {
  let event = 'message';
  const data = [];
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  if (!data.length) return null;
  return { event, data: data.join('\n') };
}

module.exports = { SSEParser };
