'use strict';
const fs = require('fs');
const path = require('path');

const ID_RE = /^[a-zA-Z0-9_-]+$/;

/** Stores meeting sessions as one JSON file each. */
class SessionStore {
  constructor(dir) {
    this.dir = dir;
  }

  _file(id) {
    if (!ID_RE.test(String(id))) throw new Error('Invalid session id');
    return path.join(this.dir, `${id}.json`);
  }

  save(session) {
    fs.mkdirSync(this.dir, { recursive: true });
    const id = session.id || `s${Date.now()}`;
    const data = { ...session, id };
    fs.writeFileSync(this._file(id), JSON.stringify(data, null, 2));
    return data;
  }

  read(id) {
    try {
      return JSON.parse(fs.readFileSync(this._file(id), 'utf8'));
    } catch {
      return null;
    }
  }

  list() {
    let files;
    try {
      files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.json'));
    } catch {
      return [];
    }
    const out = [];
    for (const f of files) {
      const s = this.read(f.slice(0, -5));
      if (!s) continue;
      out.push({
        id: s.id,
        title: s.title || 'Untitled meeting',
        startedAt: s.startedAt || 0,
        endedAt: s.endedAt || 0,
        entryCount: (s.entries || []).length,
        hasSummary: !!s.summary,
      });
    }
    return out.sort((a, b) => b.startedAt - a.startedAt);
  }

  delete(id) {
    try {
      fs.unlinkSync(this._file(id));
      return true;
    } catch {
      return false;
    }
  }
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Renders a session as a Markdown document for export. */
function toMarkdown(session) {
  const started = new Date(session.startedAt || Date.now());
  const stamp = `${started.getFullYear()}-${pad(started.getMonth() + 1)}-${pad(started.getDate())} ${pad(
    started.getHours()
  )}:${pad(started.getMinutes())}`;
  const lines = [`# ${session.title || 'Meeting'}`, '', `_${stamp}_`, ''];
  if (session.summary) lines.push(session.summary.trim(), '');
  lines.push('## Transcript', '');
  for (const e of session.entries || []) {
    const t = new Date(e.ts);
    lines.push(`**${e.speaker === 'me' ? 'You' : 'Them'}** (${pad(t.getHours())}:${pad(t.getMinutes())}): ${e.text}`, '');
  }
  if ((session.answers || []).length) {
    lines.push('## AI answers', '');
    for (const a of session.answers) lines.push(`**Q:** ${a.question}`, '', a.answer.trim(), '');
  }
  return lines.join('\n');
}

module.exports = { SessionStore, toMarkdown };
