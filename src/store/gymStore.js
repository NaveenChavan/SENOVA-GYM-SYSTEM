import { create } from "zustand";

const windowElectron = window.require ? window.require("electron") : null;

/**
 * Centralized Zustand Store for Senova Gym System
 *
 * Single source of truth for: members, trainers, settings.
 * All IPC listeners are registered ONCE here — components simply subscribe.
 */

// Named handler references stored outside the store so cleanup can target them precisely
let _handleMembersResponse = null;
let _handleTrainersResponse = null;
let _handleSettingsResponse = null;

const useGymStore = create((set, get) => ({
  // ─── State ───────────────────────────────────────────────
  members: [],
  trainers: [],
  settings: {},

  membersLoading: false,
  trainersLoading: false,
  settingsLoading: false,

  membersError: null,
  trainersError: null,
  settingsError: null,

  initialized: false, // IPC listeners registered flag

  // ─── Actions ─────────────────────────────────────────────

  refreshMembers: () => {
    if (!windowElectron) return;
    set({ membersLoading: true, membersError: null });
    windowElectron.ipcRenderer.send("get-members");
  },

  refreshTrainers: () => {
    if (!windowElectron) return;
    set({ trainersLoading: true, trainersError: null });
    windowElectron.ipcRenderer.send("get-trainers");
  },

  refreshSettings: () => {
    if (!windowElectron) return;
    set({ settingsLoading: true, settingsError: null });
    windowElectron.ipcRenderer.send("get-settings");
  },

  refreshAll: () => {
    const { refreshMembers, refreshTrainers, refreshSettings } = get();
    refreshMembers();
    refreshTrainers();
    refreshSettings();
  },

  // ─── IPC Listener Initialization (called once at app mount) ──

  initializeListeners: () => {
    if (get().initialized) return; // Prevent duplicate registration
    if (!windowElectron) return;

    const ipc = windowElectron.ipcRenderer;

    // Members response handler
    _handleMembersResponse = (_event, arg) => {
      if (arg.success) {
        set({ members: arg.data, membersLoading: false, membersError: null });
      } else {
        set({
          membersLoading: false,
          membersError: arg.error || "Failed to fetch members",
        });
      }
    };

    // Trainers response handler
    _handleTrainersResponse = (_event, arg) => {
      if (arg.success) {
        set({ trainers: arg.data, trainersLoading: false, trainersError: null });
      } else {
        set({
          trainersLoading: false,
          trainersError: arg.error || "Failed to fetch trainers",
        });
      }
    };

    // Settings response handler
    _handleSettingsResponse = (_event, arg) => {
      if (arg.success) {
        set({ settings: arg.data, settingsLoading: false, settingsError: null });
      } else {
        set({
          settingsLoading: false,
          settingsError: arg.error || "Failed to fetch settings",
        });
      }
    };

    ipc.on("get-members-response", _handleMembersResponse);
    ipc.on("get-trainers-response", _handleTrainersResponse);
    ipc.on("get-settings-response", _handleSettingsResponse);

    set({ initialized: true });

    // Perform initial data fetch
    get().refreshAll();
  },

  // ─── Cleanup (called on app unmount if needed) ───────────

  cleanupListeners: () => {
    if (!windowElectron) return;
    const ipc = windowElectron.ipcRenderer;

    if (_handleMembersResponse) {
      ipc.removeListener("get-members-response", _handleMembersResponse);
      _handleMembersResponse = null;
    }
    if (_handleTrainersResponse) {
      ipc.removeListener("get-trainers-response", _handleTrainersResponse);
      _handleTrainersResponse = null;
    }
    if (_handleSettingsResponse) {
      ipc.removeListener("get-settings-response", _handleSettingsResponse);
      _handleSettingsResponse = null;
    }

    set({ initialized: false });
  },
}));

export default useGymStore;
