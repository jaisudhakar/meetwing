# Meetwing

An AI meeting copilot that lives in a small always-on-top overlay. It transcribes the call
(the other side and your microphone), answers questions from the live transcript, and can
look at your screen. Desktop app for **Windows, macOS and Ubuntu/Linux** (Electron).

> Bring your own keys: OpenAI, Anthropic (Claude), a local Ollama model, or any
> OpenAI-compatible endpoint. Nothing is sent anywhere except the providers you configure.

## Features

- **Live transcription** - meeting audio ("Them") and your mic ("You") are transcribed in short
  chunks through any OpenAI-compatible `/audio/transcriptions` endpoint (OpenAI Whisper, Groq, ...).
  Silence is gated locally so you only pay for speech.
- **Instant answers** - streaming responses from the model of your choice, grounded in the live
  transcript. Quick actions: *Answer*, *What should I say?*, *Follow-ups*, *Explain*, *Recap*.
- **Screen understanding** - one shortcut sends a screenshot to a vision model.
- **Modes** - Meeting assistant, Interview coach, Sales call, Note taker, plus your own
  context/instructions (resume, product facts, ...).
- **Stealth overlay** - frameless, translucent, always on top, excluded from screen sharing and
  recordings on Windows and macOS, click-through mode, keyboard-only control.
- **Sessions** - transcripts and answers are saved locally; generate structured notes and export
  to Markdown.
- **Private by default** - API keys are encrypted with the OS keychain (Electron `safeStorage`),
  all data stays on your machine.

## Shortcuts

| Shortcut (Ctrl on Windows/Linux, Cmd on macOS) | Action |
| --- | --- |
| `Ctrl/Cmd+Shift+Space` | Show / hide Meetwing |
| `Ctrl/Cmd+Enter` | Ask AI (uses the text box, or answers the last question) |
| `Ctrl/Cmd+Shift+S` | Ask about your screen |
| `Ctrl/Cmd+Shift+L` | Start / stop listening |
| `Ctrl/Cmd+Shift+M` | Toggle click-through |
| `Ctrl/Cmd+Alt+Arrows` | Move the window |

## Run from source

Requires Node.js 20+.

```bash
npm install
npm start
```

Open **Settings**, paste an API key, and press **Listen**.

**Linux:** if Electron aborts with `The SUID sandbox helper binary was found, but is not configured
correctly`, `npm start` already handles it by falling back to `--no-sandbox` for development. To keep
the sandbox on, run
`sudo chown root:root node_modules/electron/dist/chrome-sandbox && sudo chmod 4755 node_modules/electron/dist/chrome-sandbox`.
The `.deb` package configures this for you. On Ubuntu 23.10+/24.04 the AppImage may need
`./Meetwing-*.AppImage --no-sandbox` because of AppArmor's unprivileged-userns restriction; prefer the `.deb`.

## Build installers

Build on the OS you are targeting (electron-builder does not cross-compile native installers
reliably):

| Platform | Command | Output in `dist/` |
| --- | --- | --- |
| Ubuntu / Linux | `npm run dist:linux` | `.AppImage`, `.deb` |
| macOS | `npm run dist:mac` | `.dmg`, `.zip` (x64 + arm64) |
| Windows | `npm run dist:win` | NSIS installer `.exe`, portable `.exe` |

Install the Linux package with `sudo apt install ./dist/Meetwing-*-linux-amd64.deb`
(the exact filename is printed by the build), or `chmod +x` the AppImage and run it.

### CI

`.github/workflows/build.yml` runs the tests, then builds all three platforms in a matrix and
uploads the installers as workflow artifacts. Pushing a tag like `v0.1.0` also attaches them to a
GitHub Release.

Builds are **unsigned**. macOS will show a Gatekeeper warning (right-click -> Open) and Windows
SmartScreen may warn until you add signing certificates (`CSC_LINK`, `CSC_KEY_PASSWORD`, and
`APPLE_*` for notarization as repository secrets).

## Platform notes

- **Capturing the other side of a call**
  - *Windows*: system audio loopback works out of the box.
  - *macOS*: loopback needs a recent macOS and Screen Recording permission. If Meetwing reports
    that no audio track was provided, install a virtual device such as BlackHole and choose it as
    the microphone in Settings.
  - *Linux*: pick a "Monitor of ..." input (PulseAudio/PipeWire) as the microphone in Settings.
- **Hidden from screen share**: supported on Windows and macOS. Linux compositors do not offer
  this, so Meetwing hides itself for the instant it takes a screenshot but is otherwise visible
  to screen capture. Use headphones so your mic does not re-capture the other side.
- **macOS permissions**: Microphone and Screen Recording (System Settings -> Privacy & Security).

## Project layout

```
src/main/       Electron main process: window, shortcuts, AI streaming, STT, settings, sessions
src/preload/    contextBridge API exposed to the UI
src/renderer/   Overlay UI (HTML/CSS/JS) and audio capture
src/shared/     Pure logic shared by UI and tests: prompts, transcript, markdown, SSE parser
test/           node:test unit tests (npm test)
scripts/        make-icon.js generates build/icon.png
```

## Use responsibly

Recording or transcribing other people may require their consent depending on where you live,
and many interviews, exams and employers prohibit AI assistance. You are responsible for
following the rules that apply to you.
