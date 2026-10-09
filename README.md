# Meetwing

**Nudge. Fly. Rest.** A little jet flies across your screen before every meeting, towing a card
that says what is starting and from which calendar:

> **Starting in 10 min** - Product sync with the team - *Google Calendar*

It lives in your menu bar / system tray, never steals focus or clicks, and works on **Windows,
macOS and Ubuntu/Linux** (Electron).

## Features

- **Flying reminders** - the jet glides in, hovers so you can read the card, and leaves. Pick how
  long it stays, how big it is, which direction it flies, and which screen it appears on.
- **Simple reminders, no calendar needed** - type what to remember, pick a time, and optionally
  repeat it every day, on weekdays or weekly. The jet flies at that time (or ahead of it, like a
  meeting). A calendar link is never required.
- **Your calendars (optional)** - add any iCalendar (`.ics` / `webcal://`) feed: Google Calendar, Outlook /
  Microsoft 365, iCloud, Fastmail, Proton, ... Recurring events, time zones, exceptions and
  cancellations are handled. Meetings booked through **Calendly** (or Cal.com) are labelled as such.
- **Reminder times** - default 10 and 5 minutes before; use any list you like, plus optionally
  "when it starts".
- **Nudge** (`Ctrl/Cmd+Shift+N`) - fly the next meeting's reminder right now.
- **Join** (`Ctrl/Cmd+Shift+J`) - open the next meeting's Zoom / Meet / Teams / Webex link.
- **Rest** - pause reminders for an hour, until tomorrow, or until you resume. Reminders that come
  due while resting are skipped, not replayed afterwards.
- **Private** - calendar links work like passwords, so they are stored encrypted with your OS
  keychain (Electron `safeStorage`). The app only talks to your calendar servers.
- Optional soft whoosh sound and start-at-login.

## Adding a calendar (optional)

You only need this to get reminders for meetings that already live in a calendar. Open **Settings** (tray icon -> *Settings...*, or it opens on first run) and paste the feed link:

| Calendar | Where to find the link |
| --- | --- |
| Google Calendar | Settings -> your calendar -> *Integrate calendar* -> **Secret address in iCal format** |
| Outlook / Microsoft 365 | Calendar settings -> Shared calendars -> Publish a calendar -> **ICS link** |
| Apple iCloud | Share the calendar as a *Public Calendar* and copy the `webcal://` link |
| Calendly | Connect your Google/Outlook calendar in Calendly; bookings appear in that feed |

Skip this section entirely if you only want simple reminders. Meetwing does not use OAuth, so there is no sign-in and no account: just a read-only link.

## Run from source

Requires Node.js 20+.

```bash
npm install
npm start          # add --settings to force the settings window open
npm test
```

**Linux:** if Electron aborts with `The SUID sandbox helper binary was found, but is not configured
correctly`, `npm start` already falls back to `--no-sandbox` for development. To keep the sandbox on,
run `sudo chown root:root node_modules/electron/dist/chrome-sandbox && sudo chmod 4755 node_modules/electron/dist/chrome-sandbox`.
The `.deb` package configures this for you. On Ubuntu 23.10+/24.04 the AppImage may need
`--no-sandbox` because of AppArmor's unprivileged-userns restriction; prefer the `.deb`.

GNOME needs the *AppIndicator* extension to show tray icons. Without a tray, launching Meetwing
again opens the settings window.

## Build installers

Build on the OS you are targeting:

| Platform | Command | Output in `dist/` |
| --- | --- | --- |
| Ubuntu / Linux | `npm run dist:linux` | `.AppImage`, `.deb` |
| macOS | `npm run dist:mac` | `.dmg`, `.zip` (x64 + arm64) |
| Windows | `npm run dist:win` | NSIS installer `.exe`, portable `.exe` |

Install the `.deb` with `sudo apt install ./dist/Meetwing-*-linux-amd64.deb`.

### CI

`.github/workflows/build.yml` runs the tests, then builds all three platforms and uploads the
installers as workflow artifacts. Pushing a tag like `v0.1.0` attaches them to a GitHub Release.
Builds are **unsigned**: macOS shows a Gatekeeper warning (right-click -> Open) and Windows
SmartScreen may warn until you add signing certificates (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_*`).

## How it works

```
src/main/       main process: tray, flights, scheduler wiring, settings IPC
  ics.js          ICS parsing + recurrence expansion (ical.js)
  calendar.js     feed fetching, merging and de-duplication
  settings.js     settings store; calendar links encrypted
src/shared/     scheduler.js: which reminders are due (pure, unit tested)
src/renderer/   overlay.* (the jet animation) and settings.* (the settings window)
src/preload/    minimal contextBridge APIs, one per window
test/           node:test unit tests (npm test)
scripts/        make-icon.js generates build/icon.png; start.js is the dev launcher
```

Each flight is a transparent, click-through, always-on-top window covering one display. It is
created for the flight and destroyed afterwards, so nothing sits on your screen the rest of the day.
Calendars refresh every 5 minutes and after waking from sleep; the scheduler checks every 15 seconds.
