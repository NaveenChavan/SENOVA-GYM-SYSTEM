# SENOVA Gym Management System

SENOVA is a desktop gym management application for gym owners and front-desk
staff. It runs as an offline-first [Electron](https://www.electronjs.org/)
desktop app with a [React](https://react.dev/) + [Vite](https://vitejs.dev/)
interface and a local [SQLite](https://www.sqlite.org/) database, so member
data stays on the gym's own computer. It also includes an optional WhatsApp
integration for sending welcome bills and payment reminders.

---

## Table of contents

- [Feature overview](#feature-overview)
- [Technology stack](#technology-stack)
- [Developer setup](#developer-setup)
  - [Prerequisites](#prerequisites)
  - [Install](#install)
  - [Run in development](#run-in-development)
  - [Build for production](#build-for-production)
  - [Lint](#lint)
  - [Project structure](#project-structure)
  - [Where data is stored](#where-data-is-stored)
- [User guide](#user-guide)
  - [First-time setup (Onboarding)](#first-time-setup-onboarding)
  - [Registering a member](#registering-a-member)
  - [Capturing a member photo](#capturing-a-member-photo)
  - [Managing members](#managing-members)
  - [Trainers](#trainers)
  - [Attendance](#attendance)
  - [Reports and exports](#reports-and-exports)
  - [Settings](#settings)
  - [WhatsApp messaging](#whatsapp-messaging)
- [Camera capture troubleshooting](#camera-capture-troubleshooting)
- [Security and data notes](#security-and-data-notes)
  - [Renderer security (context isolation)](#renderer-security-context-isolation)

---

## Feature overview

- **Member registration** — Register members with plan, trainer assignment,
  payment details, join/expiry dates, and a profile photo.
- **Camera capture (USB + Mobile QR)** — Capture the member photo from a USB
  webcam, or hand off to a phone by scanning a QR code. See
  [Capturing a member photo](#capturing-a-member-photo).
- **Member list and management** — Search, edit, renew, and delete members.
- **Trainers** — Add trainers with specializations and see their assigned
  client load.
- **Attendance** — Mark daily member check-ins by mobile number or by
  **face scan** (matches the live camera against the member's registered photo),
  and review attendance history.
- **Reports** — Revenue, member growth, attendance, pending payments, expiring
  members, and trainer-load reports, each exportable to PDF and CSV.
- **Dashboard/overview** — At-a-glance summary cards.
- **WhatsApp integration** — Sends a welcome/bill message on registration and
  supports payment-reminder messages.

> Note: photos are stored as base64 JPEG text inside the SQLite `members.photo`
> column. This is unchanged by the camera feature and is intentional for this
> release.

---

## Technology stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron (isolated renderer — see [Renderer security](#renderer-security-context-isolation)) |
| UI | React 19 + Vite 8 |
| Styling | Tailwind CSS |
| State | Zustand (`src/store/gymStore.js`) |
| Database | SQLite (`sqlite3`) |
| QR generation | `qrcode.react` (`QRCodeSVG`) |
| Face recognition | `@vladmandic/face-api` (TensorFlow.js), vendored in `public/vendor/`, models in `public/models` |
| Messaging | `whatsapp-web.js` |
| Linting | Oxlint |

---

## Developer setup

### Prerequisites

- **Node.js 18+** and npm.
- Windows, macOS, or Linux desktop (the app is developed and tested on Windows).

### Install

```bash
npm install
```

### Run in development

```bash
npm run start
```

This runs Vite and Electron together (via `concurrently`): it starts the Vite
dev server on `http://localhost:5173`, waits for it, then launches the Electron
window pointed at that URL.

You can also run just the web frontend without Electron:

```bash
npm run dev
```

Note that Electron-only features (SQLite, WhatsApp, and the mobile camera
capture server) are unavailable when running the web frontend by itself.

### Build for production

```bash
npm run build
```

Outputs the bundled frontend to `dist/`.

### Lint

```bash
npm run lint
```

### Project structure

```
.
├── main.js                     # Electron main process: DB, IPC, WhatsApp, camera-session relay
├── preload.js                  # contextBridge: exposes an allow-listed IPC API to the renderer
├── scripts/
│   └── sync-face-api-vendor.js # Copies face-api's prebuilt ESM bundle into public/vendor/ (postinstall)
├── src/
│   ├── App.jsx                 # Tab router + onboarding gate
│   ├── main.jsx                # React entry
│   ├── store/gymStore.js       # Zustand store (members/trainers/settings via IPC)
│   ├── context/UIContext.jsx   # Toasts / shared UI helpers
│   ├── services/
│   │   ├── cameraServer.js     # Local HTTP capture server + session/token lifecycle
│   │   └── faceRecognition.js  # face-api wrapper: models, descriptors, matching
│   └── components/
│       ├── MembersPage.jsx     # Member registration form (opens CameraCapture)
│       ├── CameraCapture.jsx   # Reusable USB + Mobile-QR camera modal
│       ├── MembersList.jsx     # Member management
│       ├── TrainerDashboard.jsx
│       ├── AttendancePage.jsx  # Phone-number + Face Scan attendance
│       ├── ReportsPage.jsx + reports/*
│       ├── OverviewGrid.jsx
│       ├── SettingsPage.jsx
│       ├── WhatsAppHistory.jsx
│       └── OnboardingWizard.jsx
└── README.md
```

The renderer runs with `nodeIntegration: false` and `contextIsolation: true`; it
talks to the main process exclusively through `window.electron.ipcRenderer`, a
minimal API exposed by `preload.js` via `contextBridge` (see
[Renderer security](#renderer-security-context-isolation)). The Zustand store
registers the IPC response listeners once and broadcasts data to all pages.

### Where data is stored

The SQLite database lives in Electron's per-user data directory
(`app.getPath("userData")`) as `gym.db`. On Windows this is typically:

```
C:\Users\<you>\AppData\Roaming\<app-name>\gym.db
```

Tables: `members`, `trainers`, `attendance`, `settings`, `auth_session`.

---

## User guide

### First-time setup (Onboarding)

On first launch, the app shows an **Onboarding Wizard** and blocks the main
workspace until it is completed. Finish the wizard to set your gym name and
plans. After setup, the app opens directly to the workspace.

### Registering a member

1. Open the **Members** tab (the onboarding terminal).
2. Fill in the member's full name and 10-digit mobile number (both required).
   Name must contain only letters, spaces, dots, or hyphens.
3. Choose the plan, optional trainer, joining date, payment mode, and amounts.
   The expiry date is calculated automatically from the plan.
4. Optionally capture a photo — see below.
5. Click **SAVE RECORD & DISPATCH WHATSAPP BILL**. The member is saved and,
   if WhatsApp is connected, a welcome/bill message is sent.

### Capturing a member photo

Click **Click Photo** on the registration screen to open the camera window.
The registration form stays open behind it — you never lose your entry. The
window has two tabs; it opens on **Mobile Camera** by default. Saved photos are
normalized to a 480 × 480 JPEG in both modes.

**Mobile Camera (phone via QR):**

1. A QR code appears. Scan it with the phone's camera app.
2. The phone opens a simple capture page — take or choose a photo and tap
   **Upload Photo**.
3. The desktop status moves through **Waiting for phone → Photo received →
   Saved**.
4. Review the preview, then **Save Photo** (or **Retake** to start a fresh,
   new QR session).

Notes:
- The phone and the gym computer must be on the **same network**.
- Each QR is single-use and expires after **3 minutes**. After expiry the
  desktop shows **Expired** and offers **Generate New QR Code**.
- If the computer has more than one network address, a dropdown lets you pick
  which one the phone should connect to.

**USB Camera:**

1. Switch to the **USB Camera** tab.
2. If more than one camera is connected, pick one from the device dropdown.
3. A live preview appears — click **Capture**.
4. Review the square preview, then **Save Photo** (or **Retake**).

### Managing members

Open the **Members List** tab to search, edit, renew, or delete members.
Changes broadcast back to every page automatically.

### Trainers

The **Trainer** tab lets you add trainers (with a specialization and phone) and
shows how many active clients each trainer is assigned. Deleting a trainer
reassigns their clients to "General Training".

### Attendance

The **Attendance** tab marks a member's daily check-in (one per member per day)
and lets you review attendance for a chosen date. There are two ways to check a
member in:

**Phone Number** (default) — type or scan the member's 10-digit mobile number
and trigger the sensor. If an active, non-expired member matches, attendance is
marked and the gate result shows their photo for visual confirmation.

**Face Scan** — matches a live camera image against members' **registered
photos** (the ones captured during registration):

1. Switch the Device Terminal to the **Face Scan** tab. The camera starts and
   the app loads the face models, then prepares each member's face data.
   Face descriptors are normally computed once, at registration/photo-save
   time, and cached — this step only needs to (re)compute them for members
   whose descriptor is still missing (e.g. photo added before this feature
   shipped).
2. Position the member's face in the frame — a bounding-box overlay shows
   when a face is detected, and turns red if more than one face is in frame
   (only a single person can be scanned at a time).
3. Click **Scan Face & Mark Attendance**. On a confident match, the member's
   card appears (with photo), the same active/expiry checks run, and
   attendance is marked automatically.
4. If no confident match is found, the app reports the closest distance so you
   can retry with better lighting/angle or fall back to phone-number entry.
5. After a successful match, the scanner enters a short cooldown (a few
   seconds) so a member lingering in front of the camera doesn't repeatedly
   retrigger a duplicate scan attempt.

A **Resync Faces** button force-recomputes and re-saves every member's face
descriptor from their stored photo, overwriting any cached ones — use it after
a bulk photo re-upload, or after changing the match threshold in Settings.

Notes and limitations:
- Face matching works only for members who registered **with a clear,
  front-facing photo**. Members without a detectable face in their photo are
  flagged with a "⚠ no face detected — retake photo" badge in the Members
  List, and can only be checked in by phone until the photo is retaken.
- The match threshold (how strict a face match must be) is configurable from
  **Settings → Face-Scan Attendance Tuning** and takes effect immediately —
  no restart required.
- Recognition runs fully **offline and on-device** (models bundled locally,
  nothing sent to the internet).
- **Face match is a convenience, not secure identity proof** — a printed photo
  or a phone screen held up to the camera can fool it. It has no liveness
  detection. Treat it as a fast check-in aid; a fingerprint/liveness upgrade is
  the path to real verification.

### Reports and exports

The **Reports** tab provides revenue, member-growth, attendance, pending-
payments, expiring-members, and trainer-load reports with filters. Each report
can be exported to **PDF** or **CSV** via the export bar.

### Settings

The **Settings** tab manages gym configuration such as the gym name and plans.

### WhatsApp messaging

The app runs a background WhatsApp engine (`whatsapp-web.js`). On first
connection you may need to scan a WhatsApp QR code to link the account. Once
connected, registering a member dispatches a welcome/bill message, and payment
reminders can be sent for pending dues. The **WhatsApp** tab shows history.

---

## Camera capture troubleshooting

- **Phone can't reach the page after scanning:** the phone and computer must be
  on the same Wi-Fi/LAN. If the computer has multiple networks (e.g. a VPN or
  virtual adapter), use the network-address dropdown to select the correct one,
  which reissues the QR.
- **Windows Firewall prompt:** the capture server listens on a local port
  (default `47521`, or the next free port). Allow access on private networks so
  the phone can connect.
- **"Expired" status:** QR codes expire after 3 minutes and are single-use.
  Click **Generate New QR Code** (or **Retake**) to start a fresh session.
- **USB camera permission denied:** allow camera access when prompted and click
  **Retry Camera**.
- **USB camera unplugged mid-use:** the window shows an error and falls back to
  another available camera; reconnect the device and click **Retry Camera**.

---

## Security and data notes

- The mobile capture server is only running while the camera window is open,
  and every capture session uses a random session ID plus a random single-use
  token embedded in the QR. Uploads with a missing, wrong, or expired token are
  rejected, and each session accepts exactly one photo. Sessions and the HTTP
  listener are torn down when the window closes, a session expires, or the app
  quits.
- The capture server uses plain HTTP on the local network (so a phone camera
  can open it without certificate warnings). "Secure" here means the
  unguessable, single-use, short-lived token — not transport encryption. Keep
  the gym network trusted.
- Member photos are stored as base64 JPEG text in SQLite. This is intentional
  for this release; migrating photo storage to files is a possible future
  change.
- Face recognition runs entirely **on-device and offline** — the model weights
  are bundled in `public/models` and no image or face data is sent anywhere. Each
  member's face embedding (a 128-number descriptor derived from their registered
  photo) is cached in the `members.faceDescriptor` column so it isn't recomputed
  every scan. Face matching has **no liveness detection** and is not a substitute
  for secure authentication (see the Attendance section).

### Renderer security (context isolation)

The Electron renderer runs with `nodeIntegration: false` and
`contextIsolation: true`. It has no access to Node.js globals (`require`,
`process`, `Buffer`, `module`) or the raw Electron `ipcRenderer` — the only
bridge into the main process is the explicit, allow-listed API that
`preload.js` exposes via `contextBridge.exposeInMainWorld("electron", ...)`.
Every IPC channel the renderer is allowed to use is named in `preload.js`'s
channel allow-lists; a channel not on that list is rejected rather than
silently passed through. This is the standard, currently-recommended Electron
security posture and replaces an earlier `nodeIntegration: true` /
`contextIsolation: false` configuration.

> Implementation note: `@vladmandic/face-api`'s bundled TensorFlow.js internals
> define a class method literally named `import`, which some bundler dev/build
> transforms can mis-rewrite as a dynamic `import()` call and corrupt. To avoid
> that, the package's prebuilt browser bundle is vendored as a static asset in
> `public/vendor/` (kept in sync automatically via the `postinstall` script —
> see `scripts/sync-face-api-vendor.js`) and loaded at runtime by URL instead of
> as a normal module import.
