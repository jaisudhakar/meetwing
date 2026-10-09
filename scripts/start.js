'use strict';
// Dev launcher. On Linux, a freshly installed Electron cannot use its SUID sandbox
// helper (npm cannot chown to root), which makes Electron abort at startup. If the
// helper is not configured, fall back to --no-sandbox for local development only.
// Packaged .deb installs configure the helper properly and do not need this.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const electron = require('electron'); // path to the electron binary
const args = ['.', ...process.argv.slice(2)];

if (process.platform === 'linux' && !args.includes('--no-sandbox')) {
  const helper = path.join(path.dirname(electron), 'chrome-sandbox');
  let ok = false;
  try {
    const st = fs.statSync(helper);
    ok = st.uid === 0 && (st.mode & 0o4000) !== 0 && !(process.getuid && process.getuid() === 0);
  } catch {
    /* helper missing: Electron will report it */
  }
  if (!ok) {
    console.warn(
      '[meetwing] chrome-sandbox is not set up (needs root:root, mode 4755); starting with --no-sandbox.\n' +
        `          To enable the sandbox: sudo chown root:root "${helper}" && sudo chmod 4755 "${helper}"`
    );
    args.push('--no-sandbox');
  }
}

const child = spawn(electron, args, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));
