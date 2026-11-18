# Flow

Personal dashboard: instant capture, to-dos that check themselves (TOTE), appointments,
coloured zones with links and commands, and a morning review.

- **Android app** — Capacitor wrapper, built by GitHub Actions → `Releases → latest → Flow.apk`
- **Laptop** — the same app on GitHub Pages
- **Sync** — a JSON file in your Google Drive's hidden app folder (`drive.appdata`), merged item by item
- **Calendar** — Google Calendar API (`calendar.events`)

Setup: see [SETUP.md](SETUP.md).

Code: `src/main.js` (app), `src/platform.js` (Google sign-in, Drive sync, Calendar, notifications),
`android/app/src/main/java/com/valerio/flow/GoogleAuthPlugin.java` (native Google authorization).
Build locally: `npm ci && npm run build && npx cap sync android`, then open `android/` in Android Studio.
