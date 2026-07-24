# Sprint 6A — Camera Capture & Face-Scan Attendance

**Scope:** Member photo capture (USB + Mobile QR handoff) and face-recognition-based attendance check-in, plus supporting Electron security hardening required to make face recognition work reliably in the renderer.

**Status:** Implemented and committed (`b1fddc7 — "update"`). Working tree is clean; this sprint's code is already on `main`.

**Files touched:** 44 files, +3413 / −246 lines. Net-new modules: `src/components/CameraCapture.jsx`, `src/services/cameraServer.js`, `src/services/faceRecognition.js`, `public/models/*` (bundled face-api model weights), `scripts/sync-face-api-vendor.js`, plus test files under `src/services/__test_*`.

---

## 1. Member photo capture (`CameraCapture.jsx` + `cameraServer.js`)

A reusable capture modal was added, replacing/extending the old registration photo flow. It opens from **Members → Click Photo** and offers two tabs:

### 1.1 USB Camera tab
- Uses `navigator.mediaDevices.getUserMedia` to get a live preview.
- Lets the user pick a device when more than one camera is present, and reacts to `devicechange` events (camera unplugged mid-use → error + prompts to reconnect and **Retry Camera**).
- **Capture** grabs the current video frame, crops it to a square (`drawSquare`), and renders a 480×480 JPEG (quality 0.8) preview.
- **Retake** either keeps the existing live stream (if still active) or restarts the camera.

### 1.2 Mobile Camera tab (QR handoff) — default tab
- Desktop asks the main process (`start-camera-session` IPC `invoke`) to spin up a local HTTP server (`src/services/cameraServer.js`) and generate a **session ID + random single-use token**.
- A QR code (`qrcode.react`) is rendered encoding a pairing JSON (`sessionId`, `token`, `url`, `expiresAt`) appended as a query string to the capture URL, so stock phone camera apps can open it directly as a link.
- The phone scans the QR, opens a minimal dark-themed HTML page served by the same local server (`renderCapturePage`), picks/takes a photo, and POSTs it to `/upload/:sessionId`.
- Desktop status cycles through **Waiting for phone → Photo received → Saved**, driven by `photo-received` / `camera-session-expired` IPC events pushed from `main.js`.
- If the computer has multiple LAN IPv4 addresses, a dropdown lets the user pick which address the phone should target (regenerates the session on change).
- **Session lifetime:** 3 minutes (`SESSION_TTL_MS = 180_000`), enforced server-side with a timer; expired sessions emit `session-expired` and the UI shows **Expired** with a **Generate New QR Code** button.
- **Single-use:** each session is marked `consumed` on first successful upload; a second upload attempt is rejected (`410`).

### 1.3 Local capture server hardening (`src/services/cameraServer.js`)
- Listens on `0.0.0.0`, starting at port `47521` and probing up to 20 ports upward on `EADDRINUSE`.
- Server is started lazily on first session and torn down automatically once no sessions remain (`stopServerIfIdle`) or on app quit (`stopAllSessions`, wired to `window-all-closed`).
- Upload token comparison uses `crypto.timingSafeEqual` (avoids timing side-channel).
- Upload body size capped at 10 MB (`MAX_UPLOAD_BYTES`), streamed with early rejection once the cap is exceeded.
- `validateImageDataUrl` sniffs the actual byte signature (JPEG/PNG/WebP/GIF magic bytes) rather than trusting the declared MIME type, and re-validates base64 canonical form.
- Served HTML sets a restrictive `Content-Security-Policy` (`default-src 'none'`, no external script/style/connect) and `X-Content-Type-Options: nosniff`.
- Explicitly plain HTTP (no TLS) — documented as intentional since it's LAN-only and the token (not transport encryption) is the security boundary. Documented in the README's Security section.
- All captured photos are normalized client-side to a 480×480 JPEG before being handed to the registration form, matching the existing `members.photo` base64 storage convention — no DB schema change needed for photo storage itself.

### 1.4 Electron IPC additions (`main.js`, `preload.js`)
- New `ipcMain.handle`: `start-camera-session`, `stop-camera-session` (both awaited by the renderer via `invoke`).
- New event relays: `cameraServer.events` (`photo-received`, `session-expired`, `server-error`) are forwarded to the renderer as `photo-received` / `camera-session-expired` IPC pushes.
- `preload.js`'s channel allow-lists were extended (`SEND_CHANNELS`, `RECEIVE_CHANNELS`, `INVOKE_CHANNELS`) to include all camera and face-descriptor channels — any channel not explicitly listed is rejected by `assertAllowed`.

---

## 2. Face-scan attendance (`AttendancePage.jsx` + `faceRecognition.js`)

The Attendance page gained a second check-in method alongside the existing phone-number flow.

### 2.1 New service module: `src/services/faceRecognition.js`
Wraps `@vladmandic/face-api` (TensorFlow.js-based) with:
- `loadModels()` — loads `tinyFaceDetector`, `faceLandmark68Net`, `faceRecognitionNet` from `public/models` (bundled, offline, no CDN).
- `computeDescriptor(input)` / `computeDescriptorFromDataUrl(dataUrl)` — produces a 128-number face embedding from a live video frame or a stored photo.
- `detectAllFaceBoxes(input)` — cheap multi-face detection (no descriptor extraction) used for the live bounding-box overlay and the multi-face guard.
- `descriptorToArray` / `arrayToDescriptor` — conversion between `Float32Array` and JSON-storable `number[]`.
- `buildMatcher(labeled, threshold)` / `matchDescriptor(matcher, descriptor)` — nearest-neighbour face matching via `faceapi.FaceMatcher`.
- `MATCH_THRESHOLD = 0.5` default Euclidean-distance cutoff for a confident match.
- `warmup()` — runs one throwaway detection to force TensorFlow.js backend init (webgl, falling back to cpu) ahead of the first real scan.

### 2.2 Attendance page changes (`AttendancePage.jsx`)
- Device Terminal now has a **Phone Number** / **Face Scan** tab switch (`mode` state).
- Entering Face Scan mode: starts the webcam, lazy-loads `faceRecognition.js` (heavy TF.js module, only imported on demand), loads models, then **prepares member face data**:
  - For each member with a stored photo, reuses their cached `members.faceDescriptor` if present; otherwise computes it from the photo and immediately persists it back via the `save-face-descriptor` IPC channel (self-healing backfill for members registered before this feature).
  - Builds a `FaceMatcher` from all resulting labeled descriptors.
- **Scan Face & Mark Attendance** button: captures the current frame, runs the multi-face guard, computes a descriptor, matches it against the matcher, and on a confident match runs the same `evaluateAndMark` logic used by phone check-in (active/expiry checks + `mark-attendance` IPC), showing the member's card with photo.
- On no confident match, reports the closest distance found so staff can retry or fall back to phone entry.
- **Resync Faces** button: force-recomputes and re-saves every member's descriptor from their stored photo, ignoring any cache — for use after a bulk photo re-upload or after changing the match threshold.
- **Live bounding-box overlay**: draws a green box around a detected face (mirrored to match the mirrored video preview), turning red when more than one face is in frame, previewing the multi-face guard before the user even presses Scan.
- **Scan cooldown**: after a successful match + attendance mark, a ~6-second cooldown blocks repeat scan attempts so a lingering member doesn't retrigger detection repeatedly (server-side duplicate-day check already existed independently in `mark-attendance`).
- **Configurable match threshold**: reads `settings.faceMatchThreshold` (persisted via existing `save-settings`/`get-settings` IPC) and rebuilds the matcher automatically if the threshold changes while Face Scan is open — no app restart required.
- Distinct error prefixes (`[face-v2/import]`, `[face-v2/models]`, `[face-v2/warmup]`, `[face-v2/matcher]`, `[face-v2/camera]`) so failures are diagnosable by stage instead of one generic error message.
- Both today's attendance log and attendance history rows now render the member's registered photo (looked up from the members store by `memberId`/`phone`) for visual gate confirmation, falling back to an initial-letter avatar if no photo exists.

### 2.3 Settings page addition (`SettingsPage.jsx`)
New **Face-Scan Attendance Tuning** panel with a slider (range 0.30–0.70, step 0.01) for `faceMatchThreshold`, defaulting to 0.50. Lower = stricter matching (fewer false accepts, more false rejects); higher = looser. Saved through the existing gym-settings persistence path.

### 2.4 Member registration/list integration (`MembersPage.jsx`, `MembersList.jsx`)
- On photo save (registration), the renderer computes the face descriptor immediately (`computeDescriptorFromDataUrl`) and sends it alongside the new member (`faceDescriptor` field on `add-member`), avoiding a separate round-trip later.
- On photo edit (`MembersList.jsx`), the same computation runs and is sent via `update-member`'s `photoChanged`/`faceDescriptor` fields.
- Members with a photo but no detectable face are flagged in the list with a **"⚠ No face detected — retake photo"** badge, and the edit-photo panel shows an equivalent inline warning — these members remain checkable only by phone number until a usable photo is captured.

### 2.5 Database changes (`main.js`)
- New column: `members.faceDescriptor TEXT DEFAULT NULL` (added via a safe `ALTER TABLE ... ADD COLUMN`, no-op if already present — backward compatible with existing databases).
- New IPC handler `save-face-descriptor` — persists a computed 128-length descriptor for a given member ID; used both by the registration/edit flow and by Attendance's lazy backfill/Resync Faces.
- `add-member` and `update-member` handlers extended to accept and store `faceDescriptor` JSON. Critically, `update-member` only touches the `photo`/`faceDescriptor` columns when the caller explicitly signals `photoChanged: true` — routine edits (name change, freeze/unfreeze, etc.) never overwrite the existing photo, and when a photo *does* change, any old descriptor is explicitly nulled out or replaced rather than left stale against the new photo.

---

## 3. Electron security hardening (required prerequisite for face recognition)

The renderer's Electron configuration was changed from `nodeIntegration: true` / `contextIsolation: false` to `nodeIntegration: false` / `contextIsolation: true` (`main.js`'s `BrowserWindow` webPreferences), with a new `preload.js` acting as the sole bridge.

**Why this was necessary:** with `nodeIntegration: true`, the renderer exposed real Node globals (`process`, `require`, `module`, `Buffer`). `face-api`/TensorFlow.js's runtime auto-detection saw those globals and concluded it was running in Node, so it tried to read model files from the filesystem instead of `fetch()`-ing them as browser assets — corrupting the load and throwing `Unexpected token '('` errors. Switching to a properly isolated renderer removes those globals for real, so face-api's own environment detection permanently and correctly resolves to "browser," eliminating a class of runtime patches that previously had to hide Node globals manually inside `AttendancePage.jsx` / `MembersPage.jsx` / `MembersList.jsx` (all removed as no longer needed).

**`preload.js`** now exposes a single `window.electron.ipcRenderer` object via `contextBridge.exposeInMainWorld`, with:
- Explicit allow-lists (`SEND_CHANNELS`, `RECEIVE_CHANNELS`, `INVOKE_CHANNELS`) — any channel not listed throws immediately rather than silently passing through.
- A listener-wrapping scheme that enforces **at most one live real Electron `ipcRenderer` listener per channel at a time** (see Sprint 6B below for why the original per-listener-reference version of this scheme was replaced), so `removeListener(channel, originalListener)` can find and detach exactly the wrapped listener currently registered for that channel, preserving the codebase's existing `on`/`removeListener` cleanup pattern used throughout the renderer (e.g. `AttendancePage.jsx`'s effect cleanups) without ever leaking the raw `ipcRenderer`/`IpcRendererEvent` object across the isolation boundary.

**Vite/bundler workaround (`faceRecognition.js`, `scripts/sync-face-api-vendor.js`):** `@vladmandic/face-api`'s TensorFlow.js internals define a method literally named `import` (on its `HashTable` class). Vite 8's Rolldown-based dev/build transform textually mis-rewrites any `identifier(` that looks like a dynamic import call, corrupting that method into a broken `import()` call and producing invalid JS. The fix: `@vladmandic/face-api`'s prebuilt, fully self-contained ESM bundle is vendored as a static asset at `public/vendor/face-api.esm.js` (kept in sync automatically by the new `postinstall` script `scripts/sync-face-api-vendor.js`) and loaded at runtime via a resolved-URL `import()` rather than a bare module specifier Vite's transform would ever touch.

**Model URI resolution:** model weight URLs are resolved against `document.baseURI` (`new URL("models", document.baseURI)`) rather than a hardcoded root-relative `/models`, so loading works identically under the Vite dev server, the packaged app's `file://` protocol, and any future custom protocol.

---

## 4. Testing added

New Node-based unit test files under `src/services/`:
- `__test_cameraServer_lifecycle.js` — session start/stop/expiry and idle server shutdown behavior.
- `__test_expiry_timing.js` — session TTL timing correctness.
- `__test_http_routes.js` — `/capture/:id` and `/upload/:id` route validation (token check, expired/consumed session handling, malformed payload handling).
- `__test_race_cleanup.js` — concurrent session start/stop race conditions.
- `__test_faceRecognition.mjs` / `__test_faceRecognition_resolver.mjs` — descriptor/matcher behavior against a mock (`__mock_face-api.mjs`) standing in for `@vladmandic/face-api`'s `LabeledFaceDescriptors`/`FaceMatcher`, since real face-api requires a browser environment.

---

## 5. Documentation

`README.md` was substantially expanded (+326 lines) to cover: feature overview updates (camera capture, face-scan attendance), the full user guide for photo capture (Mobile QR + USB) and face-scan attendance, camera capture troubleshooting, updated security/data notes, and a new "Renderer security (context isolation)" section explaining the `nodeIntegration`/`contextIsolation` change and its relationship to the face-api vendoring workaround.

---

## 6. Known limitations (carried into product docs, not follow-up bugs)

- Face matching only works for members registered with a clear, front-facing photo; members without a detectable face must check in by phone until the photo is retaken.
- No liveness detection — a printed photo or phone screen can defeat the face match. This is documented as a known, accepted limitation for this release, not a defect; a fingerprint/liveness upgrade is noted as the real fix if stronger verification is needed later.
- The mobile capture server is plain HTTP by design (LAN-only, token-secured, not transport-encrypted) to avoid certificate-warning friction on phone browsers.

---

# Sprint 6B — Post-6A Regression Fixes & Members Directory UX

**Scope:** Two regressions surfaced after the Sprint 6A `contextIsolation` rework (duplicate/flickering toast notifications; missing profile photo in the Members Directory), plus a Members Directory usability improvement requested afterward.

**Status:** Implemented. Not yet committed as a numbered git commit — changes are in the working tree on top of `b1fddc7`.

**Files touched:** `preload.js`, `main.js`, `src/context/UIContext.jsx`, `src/components/ui/ConfirmDialog.jsx`, `src/components/MembersPage.jsx`, `src/components/MembersList.jsx`.

---

## 1. Bug 1 — Duplicate / flickering toast notifications

Reported symptom: a single action (add member, delete member, freeze/unfreeze, etc.) sometimes popped up the same success toast multiple times in the top-right corner (observed at various points as 4, 5, then 2 stacked identical toasts across iterations of the fix).

### Root cause (found in three layers, fixed incrementally as each was uncovered)

**Layer 1 — `preload.js`'s IPC listener bridge (structural, affects every response channel).**
Sprint 6A's `contextIsolation` rework replaced direct `window.require("electron")` access with a `contextBridge`-wrapped `window.electron` from a new `preload.js`. That bridge's `on()`/`removeListener()` implementation tracked wrapped listeners **keyed by listener function reference** in a `Map`. If `on(channel, listener)` was ever called again for the same channel with a **different** closure before the previous registration's `removeListener` had run (e.g. a component's response-listener `useEffect` re-registering with a freshly created handler before its previous mount's cleanup fires — React StrictMode's dev-only double-invoke of effects being the most common trigger), the old and new listeners coexisted: both fired on the next event, each independently calling `showToast()`.
- **Fix:** `preload.js` now enforces **at most one live real `ipcRenderer` listener per channel, full stop** — a new `on()` call for a channel always detaches whatever listener (same reference or not) is currently registered for that channel before installing the new one. Every response channel in this app is owned by exactly one component, so this is a safe, permanent invariant rather than a per-case patch. Verified with a standalone Node simulation: two different closures registering back-to-back on the same channel with no cleanup in between now leave exactly one live listener.

**Layer 2 — Unguarded mutation sends in `MembersList.jsx` and `MembersPage.jsx`.**
Several actions sent their IPC mutation directly from a click handler with no protection against being invoked more than once before the first request's response arrived:
- `MembersPage.jsx`'s `handleSave` (add member) — no guard against a double-click/double-Enter submitting twice.
- `MembersList.jsx`'s `triggerDelete`, `handleSaveEdit`, `handleRenew`, and especially **`triggerFreeze`** (Freeze/Unfreeze), which had *no* in-flight guard at all — every click sent a fresh `update-member`, and since `main.js` correctly replies once per message, N clicks produced N genuinely distinct, legitimate responses, each toasted once.
- **Fix:** each of these now tracks its own in-flight state (`pendingRequestIdRef` in `MembersPage.jsx`; `pendingDeleteIdsRef`, `pendingUpdateRef`, `pendingRenewRef` in `MembersList.jsx`) and ignores a repeat send while a request for the same action is still outstanding. `triggerFreeze` was folded into the same `pendingUpdateRef` guard already used by the edit-details save flow, since both hit `update-member-response`.

**Layer 3 — `ConfirmDialog.jsx` / `UIContext.jsx`'s confirm flow.**
`ConfirmDialog`'s Confirm/Cancel buttons had no disabled state after being clicked, so a fast repeated click (or multiple click events landing before React removed the dialog from the DOM) could invoke `onConfirm` more than once, each triggering its own IPC send. Separately, `UIContext.jsx`'s `showConfirm()` overwrote `confirmResolveRef.current` on every call with no guard, silently orphaning any previous still-pending confirmation.
- **Fix:** `ConfirmDialog.jsx`'s buttons now disable themselves (`isResolved` state) on first click. `UIContext.jsx`'s `showConfirm()` now ignores a second call while one is already pending instead of overwriting the resolver.

### Files changed
`preload.js`, `main.js` (temporary diagnostic logging added and removed during investigation), `src/context/UIContext.jsx`, `src/components/ui/ConfirmDialog.jsx`, `src/components/MembersPage.jsx`, `src/components/MembersList.jsx`.

### Verification
`node --check` on `main.js`/`preload.js`, `npx oxlint` (0 warnings/errors across all touched files), `npm run build` (compiles clean) after each layer of the fix; a standalone Node script simulating the exact overlapping-listener scenario confirmed the `preload.js` fix holds.

---

## 2. Bug 2 — Missing profile photo in Members Directory

Reported symptom: after Sprint 6A, the member profile still opened with all other data present, but the profile photo was empty.

### Root cause
Sprint 6A's rework of `MembersList.jsx` (adding the face-descriptor warning badge, retake-photo button, etc.) never wired `member.photo` into an actual `<img>` anywhere in the component — the table-row avatar always rendered the initial-letter circle, and the "Info" details panel never referenced `member.photo` at all except as a truthiness check for the "⚠ no face detected" badge. This was **not** a data-flow bug: `main.js`'s `SELECT * FROM members`, the IPC response, and the Zustand store all carried `photo` through intact (confirmed by `AttendancePage.jsx`'s `MemberAvatar` rendering the same field correctly elsewhere) — the binding was simply missing in this one component's rendering.

### Fix
Added a `MemberAvatar` component in `MembersList.jsx` that renders `member.photo` as a real `<img>` when present, falling back to the existing initial-letter circle otherwise. Wired into both the table-row avatar and the profile details panel. No database, IPC, or store changes were needed.

### Files changed
`src/components/MembersList.jsx`.

---

## 3. Members Directory UX — click name to open profile, edit from profile

Requested improvement: clicking a member's name/photo should open their full profile directly (previously only the separate "📋 Info" button or the "⋮" menu did this), and the profile view should offer a direct path into editing.

### Change
- The name/avatar cell in the Members Directory table is now itself a button that toggles the same profile details panel as the existing "Info" button (`detailsId` state), with a hover highlight.
- The profile details panel gained an **"🖊️ Edit Details"** button next to the photo, which closes the panel and opens the existing inline edit row directly — so the flow is now: click name → view profile → edit, without needing the "⋮" dropdown menu.
- The "⋮" menu's own "Edit Details" / "Info" / "Renew" entries are unchanged and still work as before; this is purely an additional, faster entry point.

### Files changed
`src/components/MembersList.jsx`.

### Verification
`npx oxlint` (0 warnings/errors), `npm run build` (compiles clean).
