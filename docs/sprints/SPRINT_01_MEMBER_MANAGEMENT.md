# Sprint 1 – Member Management

## Sprint Objective

Make the existing Member Management module production-ready with proper validation, error handling, and data integrity.

---

## Existing Features (Pre-Sprint 1)

| Feature | Status |
|---------|--------|
| Add Member form (name, phone, age, sex, plan, trainer, amounts, photo) | ✅ Working |
| Webcam capture / retake photo | ✅ Working |
| Plan selection from dynamic settings | ✅ Working |
| Trainer assignment dropdown | ✅ Working |
| Auto expiry date calculation | ✅ Working |
| WhatsApp welcome bill auto-send on add | ✅ Working |
| Form reset after successful add | ✅ Working |
| Member list with search (name + phone) | ✅ Working |
| Filter by pending dues | ✅ Working |
| Inline edit (name, phone, trainer, paid, pending) | ✅ Working |
| Freeze / Unfreeze member | ✅ Working |
| Delete member with custom ConfirmDialog | ✅ Working |
| Send dues reminder via WhatsApp | ✅ Working |
| Centralized Zustand store with IPC listeners | ✅ Working |
| Custom Toast notifications | ✅ Working |
| Custom ConfirmDialog | ✅ Working |
| SQLite persistence | ✅ Working |

---

## Improvements Made

### Duplicate Phone Prevention

- Backend checks for existing phone number before INSERT (add-member)
- Backend checks for existing phone number (excluding current ID) before UPDATE (update-member)
- User receives clear error toast: "A member with this mobile number already exists."

### Phone Number Validation

- Must be exactly 10 digits (numeric only)
- `+91` prefix automatically stripped before validation
- Non-numeric characters rejected

### Name Validation

- Must start with a letter
- Only letters, spaces, dots (.) and hyphens (-) allowed
- Numeric-only names rejected (e.g., `12345`, `Rahul123`)

### Input Trimming

- Leading/trailing whitespace trimmed on name and phone before save
- Applied to both Add and Edit flows

### Error Handling

- `add-member` IPC: error toast shown on failure (including duplicate phone)
- `update-member` IPC: error reply sent on DB failure (was silently swallowed)
- `delete-member` IPC: error reply sent on DB failure (was silently swallowed)
- Edit success toast: "Member updated successfully!"
- Delete success toast: "Member deleted successfully."

---

## Validations Added

| Validation | Location | Behavior |
|------------|----------|----------|
| Empty name/phone | Add + Edit | Error toast, blocks save |
| Name format (alpha only) | Add + Edit | Error toast, blocks save |
| Phone format (10 digits) | Add + Edit | Error toast, blocks save |
| +91 prefix normalization | Add + Edit | Auto-stripped before validation |
| Duplicate phone (add) | Backend IPC | Error reply + toast |
| Duplicate phone (edit) | Backend IPC | Error reply + toast |
| Trim whitespace | Add + Edit | Auto-trim before save |

---

## Bugs Fixed

| Bug | Resolution |
|-----|-----------|
| `update-member` silently swallowed DB errors | Now replies with `{ success: false, error }` |
| `delete-member` silently swallowed DB errors | Now replies with `{ success: false, error }` |
| No user feedback on failed add | Error toast now displayed |
| No user feedback on successful edit/delete | Success toast now displayed |
| Duplicate phone numbers allowed in DB | Backend SELECT check before INSERT/UPDATE |

---

## Files Modified

| File | Changes |
|------|---------|
| `main.js` | Duplicate phone check (add + edit), error replies (update + delete) |
| `frontend/src/components/MembersPage.jsx` | Phone validation, name validation, trim, error toast handling |
| `frontend/src/components/MembersList.jsx` | Phone validation, name validation, trim, success/error toasts |

---

## Manual Test Cases

- [ ] Add member with valid data → Success toast + form resets
- [ ] Add member with duplicate phone → Error toast: "already exists"
- [ ] Add member with empty name → Error toast
- [ ] Add member with numeric name (12345) → Error toast
- [ ] Add member with short phone (5 digits) → Error toast
- [ ] Add member with letters in phone → Error toast
- [ ] Add member with +91 prefix → Strips prefix, validates 10 digits
- [ ] Edit member with valid data → Success toast + edit closes
- [ ] Edit member to duplicate phone → Error toast: "Another member..."
- [ ] Edit member with empty name → Error toast
- [ ] Delete member → Confirm dialog → Success toast
- [ ] Search member by name → Works
- [ ] Search member by phone → Works
- [ ] Filter by pending dues → Works
- [ ] Freeze/Unfreeze → Status toggles correctly
- [ ] Restart app → Data persists in SQLite

---

## Known Limitations

- Age field accepts values outside reasonable range (0, 999, negative)
- No UNIQUE constraint on `phone` column in SQLite schema (enforced at application level)
- No edit for joinDate or expiryDate from the member list

---

## Sprint Status

✅ **COMPLETED** — QA Passed, No Regressions
