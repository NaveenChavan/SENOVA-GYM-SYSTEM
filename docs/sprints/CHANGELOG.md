# Changelog

All notable changes to SENOVA Gym Management System.

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
