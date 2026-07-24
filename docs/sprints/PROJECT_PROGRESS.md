# SENOVA Gym Management System – Project Progress

---

## Project Overview

| Key | Value |
|-----|-------|
| Project Name | SENOVA Gym Management System |
| Platform | Desktop (Electron + React + SQLite) |
| Frontend | React 19 + Vite + TailwindCSS |
| Backend | Electron Main Process + SQLite3 |
| State Management | Zustand |
| Messaging | WhatsApp Web.js |
| Target OS | Windows |

---

## Completed Sprints

| Sprint | Module | Status | Date |
|--------|--------|--------|------|
| Sprint 1 | Member Management | ✅ Completed | July 2026 |
| Sprint 2 | Trainer Management | ✅ Completed | July 2026 |
| Sprint 2.1 | Name Validation Hotfix (Both Modules) | ✅ Completed | July 2026 |
| Sprint 3A | Attendance Capture | ✅ Completed | July 2026 |
| Sprint 3A.1 | Scanner UX Hotfix | ✅ Completed | July 2026 |
| Sprint 3B | Attendance History | ✅ Completed | July 2026 |
| Hotfix | IST Date Bug Fix | ✅ Completed | July 2026 |
| Sprint 4 | Membership & Billing (Renewal, Inline Edit, Freeze/Unfreeze) | ✅ Completed | July 2026 |
| Sprint 5A | Reports Module | ✅ Completed | July 2026 |
| Sprint 5B | Advanced Reports (PDF/CSV export, summary cards) | ✅ Completed | July 2026 |
| Sprint 6A | Camera Capture (USB + Mobile QR) & Face-Scan Attendance | ✅ Completed | July 2026 |
| Sprint 6B | Post-6A Regression Fixes (duplicate toasts, missing profile photo) & Members Directory UX | ✅ Completed | July 2026 |

---

## Current Features

### Member Management

- Add member with photo capture (USB webcam or Mobile QR handoff)
- Edit member (inline), reachable from the "⋮" menu or directly from the profile view
- Click name/photo in Members Directory to open the full profile
- Delete member (with confirmation)
- Search by name or phone
- Filter by pending dues
- Freeze / Unfreeze member
- Trainer assignment
- Auto expiry calculation
- Duplicate phone prevention
- Name + phone validation
- Membership renewal (extends from current expiry if active, from start date if expired)
- Profile photo displayed in Members Directory list and profile view
- Face descriptor computed and cached automatically on photo save (for face-scan attendance)
- WhatsApp welcome bill on registration

### Trainer Management

- Add trainer (name, phone, specialization)
- Delete trainer (with confirmation)
- Auto-reassign clients to General Training on deletion
- Trainer cards with mapped clients
- Duplicate phone prevention
- Name + phone validation
- Specialization validation (backend)

### Attendance

- Phone-based scanner check-in
- Face-scan check-in (offline, on-device face matching against registered photos)
- Configurable face-match threshold (Settings → Face-Scan Attendance Tuning)
- Live face-guide overlay + multi-face guard during face scan
- Resync Faces (force-recompute all descriptors)
- Auto attendance mark on access granted
- Duplicate prevention (same member, same day)
- Today's attendance log with member photo
- Attendance history with date picker and member photo
- Search history by name or phone
- Total records counter
- Empty state handling
- Auto-clear input + refocus after scan

### Reports

- Revenue, member growth, attendance, pending payments, expiring members, and trainer-load reports
- Filters per report
- PDF and CSV export

### Storage

- SQLite local database
- Tables: members, trainers, attendance, settings, auth_session
- `members.faceDescriptor` column for cached face embeddings
- Data persists across restarts

### WhatsApp Integration

- Welcome bill on member registration
- Dues reminder to members with pending amounts
- Status: Connected / QR_READY / DISCONNECTED

### Dashboard & Settings

- Overview grid with stats
- Gym name configuration
- Plan configuration (Monthly, 3 Months, 6 Months, 1 Year)
- Onboarding wizard for first-time setup
- Face-scan match threshold tuning

---

## Git Status

| Key | Value |
|-----|-------|
| Current Stable Version | v0.3.0 (Sprint 6B changes in working tree, not yet tagged) |
| Branch | main |

---

## Upcoming Roadmap

| Sprint | Module | Description |
|--------|--------|-------------|
| Sprint 7 | Backup | Database backup & restore |
| Sprint 8 | WhatsApp Automation | Scheduled reminders, bulk messaging |
| Sprint 9 | Installer | Windows installer, production packaging |

---

## Known Pending Features

- Edit Trainer (only Add/Delete exists)
- Check-out mechanism for attendance
- Monthly attendance reports (beyond the existing filtered attendance report)
- Age range validation (0-100)
- UNIQUE constraint on phone columns (enforced at app level only)
- Cross-module phone duplicate check (member vs trainer)
- Face-scan liveness detection (currently a convenience check, not secure identity proof)

---

## Project Standards

### Development Workflow

```
Audit → Approval → Implementation → Testing → Documentation
```

1. **Audit First** — Inspect all related files before any change
2. **Approval Required** — Present audit report, wait for explicit approval
3. **Minimal Changes** — Modify only what is necessary
4. **Testing** — Verify build passes, verify functionality, check for regressions
5. **Documentation** — Update sprint docs after completion

### Code Standards

- Readable, clean, small functions
- No unnecessary abstractions or wrappers
- Meaningful variable names
- Comments only where they provide real value
- Preserve existing working code
- Never sacrifice stability for new features

### Database Standards

- Never modify existing schema without approval
- Use `CREATE TABLE IF NOT EXISTS` for safe re-runs
- Application-level validation before INSERT/UPDATE
- Proper error replies on all IPC handlers

### UI Standards

- Keep existing design
- Extend, do not redesign
- Custom Toast notifications (no browser alerts)
- Custom ConfirmDialog (no browser confirms)
