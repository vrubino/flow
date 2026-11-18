# Setting up Flow (about 30 minutes, once)

Flow is a local-first app: everything is saved on the device first and synced
through a hidden app folder in **your own Google Drive**. Appointments go to
**your Google Calendar**. Nothing else is involved.

You need: a Google account, a free GitHub account, your Android phone.

---

## 1 · Google Cloud project (≈15 min)

1. Open <https://console.cloud.google.com/projectcreate>, name the project **Flow**, click **Create**, and make sure it is selected at the top.
2. **Turn on the two APIs.** Go to *APIs & Services → Library*, search **Google Calendar API** → **Enable**. Back to Library, search **Google Drive API** → **Enable**.
3. **Consent screen.** Go to *Google Auth Platform* (search “Google Auth Platform” in the top bar) → **Get started**:
   - App name **Flow**, user support email = your Gmail → Next
   - Audience **External** → Next
   - Contact email = your Gmail → Next → agree → **Create**
4. **Permissions.** *Google Auth Platform → Data access → Add or remove scopes*. In “Manually add scopes” paste these two lines, click **Add to table**, then **Update** and **Save**:
   ```
   https://www.googleapis.com/auth/calendar.events
   https://www.googleapis.com/auth/drive.appdata
   ```
   (`drive.appdata` only lets Flow see its own hidden folder — not your files.)
5. **Publish.** *Google Auth Platform → Audience* → **Publish app** → Confirm.
   This matters: in “Testing” mode Google signs you out every 7 days. Published-but-unverified is fine for personal use; you’ll just see a “Google hasn’t verified this app” screen the first time (→ *Advanced* → *Go to Flow*).
6. **Android client.** *Google Auth Platform → Clients → Create client*:
   - Application type **Android**
   - Package name `com.valerio.flow`
   - SHA-1 certificate fingerprint:
     ```
     72:FE:29:EF:24:61:BC:46:76:F2:7E:6E:B6:02:F8:6F:31:64:31:0E
     ```
   - **Create**. (Nothing to copy — Android finds it by package name + fingerprint.)
7. **Web client** (for the laptop version). *Clients → Create client*:
   - Application type **Web application**, name “Flow web”
   - Authorized JavaScript origins → **Add URI** → `https://YOUR-GITHUB-NAME.github.io` (no path, no trailing slash)
   - **Create**, then copy the **Client ID** (ends in `.apps.googleusercontent.com`).

## 2 · GitHub repository (≈5 min)

1. Sign in at <https://github.com> (create a free account if needed).
2. **New repository** → name `flow` → **Public** (needed for free GitHub Pages) → don’t add a README → **Create repository**.
3. Put the project in it — either:
   - **Easiest:** connect GitHub to Claude (claude.ai → Settings → Connectors → GitHub) and tell Claude the repo name; Claude pushes it for you and can fix any build error directly; **or**
   - **By hand:** on the empty repo page click **uploading an existing file**, drag in *everything inside* the unzipped `flow` folder — including the `.github` folder (on a Mac press ⌘⇧. in Finder to show it) — and **Commit changes**.

## 3 · Signing key secrets (≈2 min)

The Android app is signed with a key that matches the SHA-1 above. In the repo:
*Settings → Secrets and variables → Actions → New repository secret*, twice:

| Name | Value |
|---|---|
| `KEYSTORE_B64` | the long text from `github-secrets.txt` |
| `KEYSTORE_PASSWORD` | the password from `github-secrets.txt` |

Keep `flow-release.keystore` and `github-secrets.txt` somewhere safe (not in the repo): updates must be signed with the same key.

## 4 · Configure and build (≈5 min + build time)

1. Repo → *Settings → Pages* → Source: **GitHub Actions**.
2. Repo → open `www/config.js` → pencil icon → paste your **Web client ID** and set `appUrl` to `https://YOUR-GITHUB-NAME.github.io/flow/` → **Commit changes**.
3. That commit starts the build: *Actions* tab → “Build Flow” (about 5 minutes). Green tick = done.

## 5 · Install on your phone

1. On the phone open `https://github.com/YOUR-GITHUB-NAME/flow/releases/latest` and tap **Flow.apk**.
2. Android asks to allow installs from Chrome/Files → allow → **Install** (if Play Protect warns about an unknown developer, choose *Install anyway* — the developer is you).
3. Open Flow → tap the two dots at the top → **Connect Google** → pick your account → *Advanced → Go to Flow* → **Allow**.
4. Finish a morning review once and tap **Remind me every morning** on the last screen.

Every later change rebuilds automatically; install the new `Flow.apk` from the same link and it updates in place, keeping your data.

## 6 · Laptop

Open `https://YOUR-GITHUB-NAME.github.io/flow/` in Chrome → **Connect Google**. Use the install icon in the address bar to get Flow as its own window. (On the laptop Google sometimes asks you to tap **Reconnect** at the start of a session — your data is safe meanwhile.)

---

### If something goes wrong
- **Build fails at “Restore signing key”** → the two secrets are missing or misspelled.
- **Phone: “Google authorization failed: 10”** → the Android client’s package name or SHA-1 doesn’t match step 1.6.
- **Laptop: “origin not allowed”** → the JavaScript origin in step 1.7 must be exactly `https://YOUR-GITHUB-NAME.github.io`.
- **Calendar says access refused** → check step 1.4 and reconnect.
