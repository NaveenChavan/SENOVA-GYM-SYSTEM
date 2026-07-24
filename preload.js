/**
 * preload.js — contextBridge boundary between the isolated renderer and the
 * main process.
 *
 * The renderer runs with nodeIntegration: false, contextIsolation: true (see
 * main.js's BrowserWindow webPreferences). This is what actually fixes the
 * "[face-v2/engine] Unexpected token '('" class of bug: with nodeIntegration
 * true, the renderer previously exposed real Node globals (process/require/
 * module/Buffer), so face-api / TensorFlow.js auto-detected a Node.js runtime
 * and tried to read model files from the filesystem instead of fetch()ing
 * them — hitting a JS/binary file and throwing trying to parse it as JSON.
 * With those globals genuinely absent now, face-api's own environment
 * detection correctly and permanently resolves to "browser".
 *
 * contextBridge.exposeInMainWorld only exposes the explicit surface below —
 * raw ipcRenderer is never exposed wholesale, so the renderer cannot reach
 * arbitrary Node/Electron APIs even though this preload script itself runs
 * with full Node access.
 *
 * CHANNEL ALLOW-LIST — every channel below is actually used by the renderer
 * (grep -rn "ipcRenderer\." src/ was used to build this list; see main.js for
 * the corresponding ipcMain.on/handle registrations). Add new channels here
 * FIRST before wiring them up in a renderer file, or contextBridge will
 * silently reject the call.
 *
 *   send (fire-and-forget, renderer -> main):
 *     get-members, get-trainers, get-settings, save-settings, add-member,
 *     update-member, delete-member, renew-member, add-trainer, delete-trainer,
 *     mark-attendance, get-today-attendance, get-attendance-history,
 *     save-face-descriptor, send-whatsapp-bill, request-whatsapp-status,
 *     auth-login-success, activate-subscription, export-report-pdf,
 *     export-report-csv, get-report-summary, get-report-pending-payments,
 *     get-report-expiring-members, get-report-attendance-range,
 *     get-report-revenue-summary, get-report-member-growth,
 *     get-report-trainer-load
 *
 *   on/once (main -> renderer, response/broadcast channels):
 *     get-members-response, get-trainers-response, get-settings-response,
 *     save-settings-response, add-member-response, update-member-response,
 *     delete-member-response, renew-member-response, add-trainer-response,
 *     delete-trainer-response, mark-attendance-response,
 *     get-today-attendance-response, get-attendance-history-response,
 *     save-face-descriptor-response, whatsapp-qr, whatsapp-status-update,
 *     activate-subscription-response, export-report-pdf-response,
 *     export-report-csv-response, get-report-summary-response,
 *     get-report-pending-payments-response,
 *     get-report-expiring-members-response,
 *     get-report-attendance-range-response,
 *     get-report-revenue-summary-response, get-report-member-growth-response,
 *     get-report-trainer-load-response, photo-received,
 *     camera-session-expired
 *
 *   invoke (renderer -> main, awaits a return value):
 *     start-camera-session, stop-camera-session
 */
const { contextBridge, ipcRenderer } = require("electron");

const SEND_CHANNELS = new Set([
  "get-members",
  "get-trainers",
  "get-settings",
  "save-settings",
  "add-member",
  "update-member",
  "delete-member",
  "renew-member",
  "add-trainer",
  "delete-trainer",
  "mark-attendance",
  "get-today-attendance",
  "get-attendance-history",
  "save-face-descriptor",
  "send-whatsapp-bill",
  "request-whatsapp-status",
  "auth-login-success",
  "activate-subscription",
  "export-report-pdf",
  "export-report-csv",
  "get-report-summary",
  "get-report-pending-payments",
  "get-report-expiring-members",
  "get-report-attendance-range",
  "get-report-revenue-summary",
  "get-report-member-growth",
  "get-report-trainer-load",
]);

const RECEIVE_CHANNELS = new Set([
  "get-members-response",
  "get-trainers-response",
  "get-settings-response",
  "save-settings-response",
  "add-member-response",
  "update-member-response",
  "delete-member-response",
  "renew-member-response",
  "add-trainer-response",
  "delete-trainer-response",
  "mark-attendance-response",
  "get-today-attendance-response",
  "get-attendance-history-response",
  "save-face-descriptor-response",
  "whatsapp-qr",
  "whatsapp-status-update",
  "activate-subscription-response",
  "export-report-pdf-response",
  "export-report-csv-response",
  "get-report-summary-response",
  "get-report-pending-payments-response",
  "get-report-expiring-members-response",
  "get-report-attendance-range-response",
  "get-report-revenue-summary-response",
  "get-report-member-growth-response",
  "get-report-trainer-load-response",
  "photo-received",
  "camera-session-expired",
]);

const INVOKE_CHANNELS = new Set(["start-camera-session", "stop-camera-session"]);

function assertAllowed(set, channel, method) {
  if (!set.has(channel)) {
    throw new Error(
      `[preload] Blocked ipcRenderer.${method}("${channel}") — channel is not on the allow-list in preload.js. ` +
        `Add it to the appropriate Set (SEND_CHANNELS/RECEIVE_CHANNELS/INVOKE_CHANNELS) if this is a real new IPC call.`,
    );
  }
}

// Tracks, per channel, the single wrapped listener currently registered on
// the real Electron ipcRenderer (original listener -> wrapped listener).
//
// ROOT CAUSE OF THE DUPLICATE/FLICKERING TOAST BUG (multiple rounds): the
// original code kept a *separate* wrapped listener per distinct listener
// function reference, so if on(channel, listener) was ever called again
// with a NEW closure for a channel that already had a live listener — e.g.
// a component's effect re-registers with a freshly created handler function
// before its previous mount's cleanup has actually run (React StrictMode's
// double-invoke, or two overlapping mount instances of the same page for
// any other reason) — both listeners stayed alive simultaneously. Every
// component in this codebase owns its response channels exclusively (grep
// confirms e.g. "update-member-response" is only ever listened to from
// MembersList.jsx), so there is never a legitimate reason for two DIFFERENT
// listener functions to be live on the same channel at once. Enforcing "at
// most one real ipcRenderer listener per channel, full stop" — regardless of
// whether the new listener function is the same reference as the old one —
// closes this bug class structurally, independent of component lifecycle
// timing, instead of relying on cleanup always running before the next
// registration.
const listenerByChannel = new Map(); // channel -> { original, wrapped }

function rememberWrapped(channel, listener, wrapped) {
  const existing = listenerByChannel.get(channel);
  if (existing) {
    // Some listener (same or different closure) is already registered on
    // this channel — detach it before installing the new one, so there is
    // never more than one real listener alive on a given channel.
    ipcRenderer.removeListener(channel, existing.wrapped);
  }
  listenerByChannel.set(channel, { original: listener, wrapped });
}

function takeWrapped(channel, listener) {
  const existing = listenerByChannel.get(channel);
  if (!existing || existing.original !== listener) return undefined;
  listenerByChannel.delete(channel);
  return existing.wrapped;
}

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send(channel, ...args) {
      assertAllowed(SEND_CHANNELS, channel, "send");
      ipcRenderer.send(channel, ...args);
    },

    invoke(channel, ...args) {
      assertAllowed(INVOKE_CHANNELS, channel, "invoke");
      return ipcRenderer.invoke(channel, ...args);
    },

    // Mirrors ipcRenderer.on's listener signature (event, ...args) exactly —
    // existing renderer code all destructures its listener as (_e, arg) —
    // while never leaking the real ipcRenderer/IpcRendererEvent object with
    // its Node-side internals across the isolation boundary. `event` passed
    // to the listener here is a plain, inert placeholder object (contextBridge
    // already structurally clones args, so this mainly documents the shape).
    //
    // The wrapper is tracked in listenerMap (original listener -> wrapper) so
    // removeListener(channel, originalListener) — the pre-existing codebase's
    // convention, e.g. AttendancePage.jsx's useEffect cleanup passing the same
    // handler reference to both .on and .removeListener — can find and remove
    // the exact wrapper this registered, not just any listener on the channel.
    on(channel, listener) {
      assertAllowed(RECEIVE_CHANNELS, channel, "on");
      const wrapped = (_event, ...args) => listener(_event, ...args);
      rememberWrapped(channel, listener, wrapped);
      ipcRenderer.on(channel, wrapped);
      return () => {
        ipcRenderer.removeListener(channel, wrapped);
        takeWrapped(channel, listener);
      };
    },

    once(channel, listener) {
      assertAllowed(RECEIVE_CHANNELS, channel, "once");
      ipcRenderer.once(channel, (_event, ...args) => listener(_event, ...args));
    },

    // Removes the exact wrapper `on` registered for this (channel, listener)
    // pair — see rememberWrapped/takeWrapped above for why a lookup is needed
    // rather than passing the original listener straight through to
    // ipcRenderer.removeListener (which would not match the wrapped function
    // actually registered).
    removeListener(channel, listener) {
      assertAllowed(RECEIVE_CHANNELS, channel, "removeListener");
      const wrapped = takeWrapped(channel, listener);
      if (wrapped) ipcRenderer.removeListener(channel, wrapped);
    },
  },
});
