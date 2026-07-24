# Changelog

All notable changes to SENOVA Gym Management System.

---

## Unreleased — Sprint 6B (July 2026)

### Fixed

- Duplicate/flickering toast notifications on member add, delete, freeze/unfreeze, update, and renew actions:
  - `preload.js`'s IPC listener bridge now enforces at most one live real `ipcRenderer` listener per channel (previously, a channel could end up with two live listeners if a component's response-listener effect re-registered with a new handler before its previous mount's cleanup ran — most commonly under React StrictMode's dev-only double-invoke of effects)
  - Added in-flight guards to `add-member` (`MembersPage.jsx`) and `delete-member` / `update-member` / `renew-member` (`MembersList.jsx`) sends so a repeat click while a request is still outstanding is a no-op instead of sending a second, independently-replied-to IPC message
  - `triggerFreeze` (Freeze/Unfreeze) previously had no in-flight guard at all — fixed
  - `ConfirmDialog.jsx`'s Confirm/Cancel buttons now disable themselves after the first click
  - `UIContext.jsx`'s `showConfirm()` now ignores a second call while a confirmation is already pending instead of silently overwriting the previous one
- Missing profile photo in Members Directory: `MembersList.jsx` never rendered `member.photo` as an image (only checked it for the "no face detected" badge) — added a `MemberAvatar` component that renders the photo when present, falling back to the initial-letter avatar otherwise, used in both the table row and the profile details panel

### Improved

- Members Directory: clicking a member's name/photo now opens their profile (previously only the separate "Info" button or the "⋮" menu did this)
- Members Directory: the profile details panel now has a direct "Edit Details" button, so the flow is click name → view profile → edit, without needing the "⋮" dropdown menu

---

## v0.4.0 — Sprint 6A (July 2026)

### Added

- Member photo capture via USB webcam or Mobile QR handoff (`CameraCapture.jsx`, `src/services/cameraServer.js`) — local HTTP server with single-use, 3-minute-expiring, token-secured capture sessions
- Face-scan attendance check-in (`src/services/faceRecognition.js`, `AttendancePage.jsx`) using `@vladmandic/face-api` (TensorFlow.js), fully offline/on-device
- `members.faceDescriptor` column caching each member's 128-d face embedding, computed automatically at photo save time and backfilled lazily/via "Resync Faces"
- Configurable face-match threshold (Settings → Face-Scan Attendance Tuning)
- Live face-guide overlay and multi-face guard during face scan; short cooldown after a successful match
- Member photo displayed in attendance log/history for visual gate confirmation
- "⚠ No face detected — retake photo" badge for members whose registered photo has no detectable face

### Changed

- Electron renderer switched from `nodeIntegration: true` / `contextIsolation: false` to `nodeIntegration: false` / `contextIsolation: true`, with a new `preload.js` as the sole, allow-listed IPC bridge (`window.electron.ipcRenderer`) — required so face-api/TensorFlow.js's runtime environment detection correctly resolves to "browser" instead of misdetecting Node.js
- `@vladmandic/face-api` is loaded from a vendored static bundle (`public/vendor/face-api.esm.js`, synced via `postinstall`) instead of a bare import, working around a Vite 8/Rolldown transform bug that corrupted one of the package's internal methods

### Fixed

- N/A (net-new feature sprint; see Sprint 6B above for regressions this sprint introduced and their fixes)

---

## v0.3.0 — Sprint 3 (July 2026)

### Added

- Attendance SQLite table with persistent storage
- `mark-attendance` IPC handler with duplicate prevention
- `get-today-attendance` IPC handler
- `get-attendance-history` IPC handler with date filter
- Auto attendance mark on successful gate access
- Today's attendance log display
- Attendance history section with date picker
- Search attendance by name or phone
- Total records counter for history
- Empty state for dates with no records
- Auto-clear scanner input after scan
- Auto-focus cursor back to input for rapid scanning

### Fixed

- IST date bug: attendance stored as UTC date instead of local date
- Scanner input retained after scan (slow workflow for receptionists)

---

## v0.2.0 — Sprint 2 (July 2026)

### Added

- Duplicate trainer phone prevention (backend check before INSERT)
- Backend specialization validation (only allowed values accepted)
- Error toast on add trainer failure
- Error toast on delete trainer failure
- Name validation for trainers (alpha only, no numeric names)

### Fixed

- `add-trainer` IPC silently swallowed DB errors
- `delete-trainer` IPC silently swallowed DB errors
- Any text accepted as trainer phone number
- Any text accepted as trainer name
- Untrimmed data sent to database

### Improved

- Trainer phone normalized (+91 stripped, trimmed)
- Trainer name trimmed before save
- Proper success/error feedback on all operations

---

## v0.1.0 — Sprint 1 (July 2026)

### Added

- Duplicate member phone prevention (backend check before INSERT and UPDATE)
- Phone number validation (10-digit numeric, +91 normalization)
- Name validation (alpha only, no numeric names)
- Input trimming for name and phone (add + edit)
- Error toast on add member failure
- Success toast on edit member
- Success toast on delete member
- Error toast on edit/delete failure

### Fixed

- `update-member` IPC silently swallowed DB errors
- `delete-member` IPC silently swallowed DB errors
- No user feedback on failed member add
- No user feedback on successful edit/delete
- Duplicate phone numbers could be inserted into database
- Leading/trailing whitespace stored in database

### Improved

- Member phone normalized (+91 stripped, trimmed)
- Member name trimmed before save
- Proper error messages for all validation failures
