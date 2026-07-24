import React, { useState } from "react";

/**
 * ConfirmDialog component — replaces native window.confirm().
 * Renders a modal overlay with Confirm/Cancel buttons.
 */
const ConfirmDialog = ({ message, onConfirm, onCancel }) => {
  // BUG FIX: disable both buttons the instant either is clicked, so a fast
  // double/triple click (or two click events arriving in the same tick)
  // cannot invoke onConfirm/onCancel more than once before this dialog is
  // removed from the DOM by the parent's state update — each extra
  // invocation would otherwise re-send the underlying action (e.g.
  // "delete-member"), and each send gets its own legitimate, correctly-fired
  // response toast from main.js, stacking up as duplicate notifications.
  const [isResolved, setIsResolved] = useState(false);

  const handleConfirmClick = () => {
    if (isResolved) return;
    setIsResolved(true);
    onConfirm();
  };

  const handleCancelClick = () => {
    if (isResolved) return;
    setIsResolved(true);
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
        onClick={handleCancelClick}
      ></div>

      {/* Dialog */}
      <div className="relative bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="text-xl flex-shrink-0">⚠️</span>
          <p className="text-sm font-semibold text-slate-700 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={handleCancelClick}
            disabled={isResolved}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmClick}
            disabled={isResolved}
            className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
