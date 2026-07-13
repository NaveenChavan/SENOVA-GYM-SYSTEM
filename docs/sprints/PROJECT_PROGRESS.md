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

---

## Current Features

### Member Management

- Add member with photo capture
- Edit member (inline)
- Delete member (with confirmation)
- Search by name or phone
- Filter by pending dues
- Freeze / Unfreeze member
- Trainer assignment
- Auto expiry calculation
- Duplicate phone prevention
- Name + phone validation
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
- Auto attendance mark on access granted
- Duplicate prevention (same member, same day)
- Today's attendance log
- Attendance history with date picker
- Search history by name or phone
- Total records counter
- Empty state handling
- Auto-clear input + refocus after scan

### Storage

- SQLite local database
- Tables: members, trainers, attendance, settings, auth_session
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

---

## Git Status

| Key | Value |
|-----|-------|
| Current Stable Version | v0.3.0 |
| Branch | main |

---

## Upcoming Roadmap

| Sprint | Module | Description |
|--------|--------|-------------|
| Sprint 4 | Membership & Billing | Renewal flow, expiry alerts, payment tracking |
| Sprint 5 | Dashboard | Stats, charts, membership overview |
| Sprint 6 | Reports | Attendance reports, revenue reports |
| Sprint 7 | Backup | Database backup & restore |
| Sprint 8 | WhatsApp Automation | Scheduled reminders, bulk messaging |
| Sprint 9 | Installer | Windows installer, production packaging |

---

## Known Pending Features

- Edit Trainer (only Add/Delete exists)
- Check-out mechanism for attendance
- Attendance export/download
- Monthly attendance reports
- Age range validation (0-100)
- UNIQUE constraint on phone columns (enforced at app level only)
- Cross-module phone duplicate check (member vs trainer)

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
