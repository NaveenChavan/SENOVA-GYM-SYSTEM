import React, { useEffect } from "react";

/**
 * Toast notification component — replaces native alert().
 * Auto-dismisses after a configurable duration.
 */
const Toast = ({ id, message, type = "success", duration = 3000, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(id);
    }, duration);
    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  const styles = {
    success: "bg-emerald-50 border-emerald-200 text-emerald-800",
    error: "bg-rose-50 border-rose-200 text-rose-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    info: "bg-blue-50 border-blue-200 text-blue-800",
  };

  const icons = {
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg ${styles[type] || styles.info} animate-slide-in`}
    >
      <span className="text-base flex-shrink-0">{icons[type] || icons.info}</span>
      <p className="text-xs font-bold flex-1">{message}</p>
      <button
        onClick={() => onDismiss(id)}
        className="text-current opacity-50 hover:opacity-100 font-bold text-sm ml-2 flex-shrink-0"
      >
        ✕
      </button>
    </div>
  );
};

export default Toast;
