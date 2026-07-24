import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import Toast from "../components/ui/Toast";
import ConfirmDialog from "../components/ui/ConfirmDialog";

const UIContext = createContext(null);

let toastIdCounter = 0;

/**
 * UIProvider — global manager for toast notifications and confirm dialogs.
 * Wraps the entire app. Components access via useUI() hook.
 */
export const UIProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const confirmResolveRef = useRef(null);

  // ─── Toast API ───────────────────────────────────────────
  const showToast = useCallback((message, type = "success", duration = 3000) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ─── Confirm API (Promise-based) ────────────────────────
  // BUG FIX: showConfirm previously overwrote confirmResolveRef.current on
  // every call with no guard, so calling it again while a confirmation was
  // already pending (e.g. a delete menu item clicked more than once before
  // the dialog/dropdown visually closed) silently orphaned the earlier
  // promise (it never resolved) and reset the dialog. Combined with
  // ConfirmDialog's buttons not disabling themselves after the first click,
  // a fast double/triple/quadruple click on Confirm could invoke onConfirm
  // more than once before React removed the dialog from the DOM, sending
  // the underlying IPC action (e.g. "delete-member") more than once — each
  // legitimately replied to once by main.js, producing one real toast per
  // send and stacking up exactly like duplicate notifications. Guarding both
  // ends (one confirm in flight at a time here, and disabling the dialog's
  // buttons after the first click in ConfirmDialog.jsx) closes this
  // regardless of how many extra clicks arrive.
  const confirmPendingRef = useRef(false);

  const showConfirm = useCallback((message) => {
    if (confirmPendingRef.current) {
      // A confirmation is already in flight — ignore this call rather than
      // orphaning the previous promise or resetting the visible dialog.
      return Promise.resolve(false);
    }
    confirmPendingRef.current = true;
    return new Promise((resolve) => {
      confirmResolveRef.current = (value) => {
        confirmPendingRef.current = false;
        resolve(value);
      };
      setConfirmState({ message });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (confirmResolveRef.current) confirmResolveRef.current(true);
    confirmResolveRef.current = null;
    setConfirmState(null);
  }, []);

  const handleCancel = useCallback(() => {
    if (confirmResolveRef.current) confirmResolveRef.current(false);
    confirmResolveRef.current = null;
    setConfirmState(null);
  }, []);

  return (
    <UIContext.Provider value={{ showToast, showConfirm }}>
      {children}

      {/* Toast Container — top right corner */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[9998] flex flex-col gap-2 max-w-sm w-full pointer-events-auto">
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              id={toast.id}
              message={toast.message}
              type={toast.type}
              duration={toast.duration}
              onDismiss={dismissToast}
            />
          ))}
        </div>
      )}

      {/* Confirm Dialog — centered modal */}
      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </UIContext.Provider>
  );
};

/**
 * Hook to access toast and confirm APIs from any component.
 *
 * Usage:
 *   const { showToast, showConfirm } = useUI();
 *   showToast("Success!", "success");
 *   const confirmed = await showConfirm("Delete this?");
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useUI = () => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used within UIProvider");
  return ctx;
};
