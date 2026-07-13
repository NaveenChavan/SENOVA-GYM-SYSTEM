# Sprint 3 – Attendance Management

## Sprint Objective

Build a complete attendance tracking system with persistence, duplicate prevention, history viewing, and date filtering.

---

## Sprint 3A – Attendance Capture

### Features Implemented

| Feature | Status |
|---------|--------|
| `attendance` SQLite table (id, memberId, memberName, phone, checkInTime, date) | ✅ Working |
| `mark-attendance` IPC handler | ✅ Working |
| `get-today-attendance` IPC handler | ✅ Working |
| Auto-mark attendance when access is granted | ✅ Working |
| Duplicate prevention (same member, same day) | ✅ Working |
| "Attendance already marked for today." toast on duplicate | ✅ Working |
| Today's attendance log display | ✅ Working |
| Proper error/success toasts | ✅ Working |

### Attendance Capture Flow

```
User enters phone → Clicks Scan / presses Enter
    ├── Member found + Active + Not Expired
    │   → ACCESS GRANTED
    │   → mark-attendance IPC sent
    │   → If first scan today → Attendance saved + success toast
    │   → If already scanned → No duplicate record + warning toast
    ├── Member found + Frozen
    │   → ACCESS DENIED: Account is Frozen
    │   → No attendance recorded
    ├── Member found + Expired
    │   → ACCESS DENIED: Membership Expired
    │   → No attendance recorded
    └── Member not found
        → ACCESS DENIED: Record Missing
        → No attendance recorded
```

### Duplicate Prevention

- Backend checks `SELECT id FROM attendance WHERE memberId = ? AND date = ?`
- If record exists → replies with `{ duplicate: true }`
- Frontend shows warning toast: "Attendance already marked for today."
- No duplicate row written to database

### Today's Attendance Display

- Fetched on page load via `get-today-attendance` IPC
- Refreshes after each successful attendance mark
- Shows: Member Name, Phone, Check-In Time
- Newest entries first (ORDER BY id DESC)
- Empty state: "No attendance records for today yet."

### Scanner UX (Sprint 3A.1 Hotfix)

- Input clears automatically after every scan attempt
- Cursor returns to input field for immediate next scan
- Works on all outcomes: success, duplicate, denied, not found

---

## Sprint 3B – Attendance History

### Features Implemented

| Feature | Status |
|---------|--------|
| `get-attendance-history` IPC handler (date param) | ✅ Working |
| Date picker for history (defaults to today) | ✅ Working |
| Search within selected date (by name or phone) | ✅ Working |
| Total Records counter | ✅ Working |
| History list with name, phone, time, date | ✅ Working |
| Empty state for dates with no records | ✅ Working |
| History auto-refreshes after attendance mark | ✅ Working |

### Date Filter

- Date picker input defaults to today's date
- User can select any past date
- On date change → fetches records from SQLite for that specific date
- Results displayed immediately

### Search

- Filters within the currently selected date's records
- Matches against member name (case-insensitive) or phone number
- Client-side filtering (no additional IPC calls)
- Total Records counter updates to reflect filtered count

### History Counter

- Displays "Total Records: X" above the history list
- Updates when date changes or search is applied

### Empty State

- When no records exist for selected date: "No attendance records found for this date."

---

## IST Date Bug Fix

### Problem

`new Date().toISOString().split("T")[0]` returns UTC date. For IST users scanning between 12:00 AM – 5:30 AM, the stored date was one day behind.

### Root Cause

`toISOString()` always produces UTC. A scan at `2026-07-08 03:45 AM IST` resulted in `"2026-07-07"` being stored.

### Fix Applied

Replaced with locale-independent local date generation:

```js
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
```

### Lines Fixed

- `mark-attendance` handler: date used for duplicate check + INSERT
- `get-today-attendance` handler: date used for SELECT

---

## Bugs Fixed

| Bug | Sprint | Resolution |
|-----|--------|-----------|
| No attendance persistence (data lost on restart) | 3A | SQLite `attendance` table + IPC handlers |
| Same member could be marked multiple times per day | 3A | Duplicate check before INSERT |
| No user feedback on attendance operations | 3A | Success/duplicate/error toasts |
| Input retained after scan (slow workflow) | 3A.1 | Auto-clear + auto-focus |
| Wrong date stored for IST late-night scans | 3B | Local date generation (not UTC) |

---

## Files Modified

| File | Sprint | Changes |
|------|--------|---------|
| `main.js` | 3A | attendance table, mark-attendance IPC, get-today-attendance IPC |
| `main.js` | 3B | get-attendance-history IPC, IST date fix |
| `frontend/src/components/AttendancePage.jsx` | 3A | IPC integration, today's log, toasts |
| `frontend/src/components/AttendancePage.jsx` | 3A.1 | Auto-clear input + refocus |
| `frontend/src/components/AttendancePage.jsx` | 3B | History section, date picker, search, filtered list |

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memberId INTEGER NOT NULL,
  memberName TEXT NOT NULL,
  phone TEXT NOT NULL,
  checkInTime TEXT NOT NULL,
  date TEXT NOT NULL
)
```

- `date`: Local date in `YYYY-MM-DD` format
- `checkInTime`: Full ISO timestamp (UTC, converted to local on display)
- No foreign key constraints (safe if member is later deleted)

---

## IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `mark-attendance` | Renderer → Main | Mark check-in for a member |
| `mark-attendance-response` | Main → Renderer | Success / duplicate / error reply |
| `get-today-attendance` | Renderer → Main | Fetch today's records |
| `get-today-attendance-response` | Main → Renderer | Today's attendance data |
| `get-attendance-history` | Renderer → Main | Fetch records for a specific date |
| `get-attendance-history-response` | Main → Renderer | History data for requested date |

---

## Manual Testing

- [ ] Scan active member → Attendance marked + success toast
- [ ] Scan same member again → "Already marked" warning toast + no duplicate
- [ ] Scan frozen member → Access Denied + no record
- [ ] Scan expired member → Access Denied + no record
- [ ] Scan unknown phone → Record Missing + no record
- [ ] Input clears after scan → Cursor returns to input
- [ ] Today's log shows all entries for today
- [ ] Change date in history → Records update
- [ ] Search by name in history → Filters correctly
- [ ] Search by phone in history → Filters correctly
- [ ] Total Records counter matches visible entries
- [ ] Empty date shows "No attendance records found"
- [ ] Restart app → All attendance data persists
- [ ] Scan at 12:30 AM IST → Correct local date stored
- [ ] Member module still works
- [ ] Trainer module still works

---

## Known Limitations

- No check-out mechanism (only check-in recorded)
- No attendance export/download
- No monthly/weekly attendance reports
- No analytics or charts
- No QR-based attendance

---

## Sprint Status

✅ **COMPLETED** — Sprint 3A + 3A.1 + 3B all QA passed
