import React, { useState, useEffect } from "react";
import useGymStore from "../store/gymStore";
import { useUI } from "../context/UIContext";
const windowElectron = window.require ? window.require("electron") : null;

const SettingsPage = () => {
  // Consume from centralized store
  const settings = useGymStore((state) => state.settings);
  const refreshAll = useGymStore((state) => state.refreshAll);
  const { showToast } = useUI();

  const [gymConfig, setGymConfig] = useState({
    gymName: "",
    gymPhone: "",
    trainerName: "",
    gymPlans: ["Monthly", "3 Months", "6 Months", "1 Year"],
    personalPlans: ["PT Monthly - ₹5000", "PT 3 Months - ₹12000"],
  });

  const [newPlan, setNewPlan] = useState("");
  const [newPTPlan, setNewPTPlan] = useState("");

  // Sync local form state from store settings when they load/change
  useEffect(() => {
    if (settings && settings.gymName) {
      setGymConfig({
        ...settings,
        gymPlans: settings.gymPlans || ["Monthly", "3 Months", "6 Months", "1 Year"],
        personalPlans: settings.personalPlans || ["PT Monthly - ₹5000", "PT 3 Months - ₹12000"],
      });
    }
  }, [settings]);

  const handleSave = () => {
    if (!gymConfig.gymName || !gymConfig.gymPhone) {
      showToast(
        "Gym Name and WhatsApp Number are mandatory for initial onboarding!",
        "error",
      );
      return;
    }
    if (windowElectron) {
      windowElectron.ipcRenderer.send("save-settings", gymConfig);
      windowElectron.ipcRenderer.once(
        "save-settings-response",
        (_event, arg) => {
          if (arg.success) {
            showToast("Gym Profile Configuration Saved Successfully!", "success");
            // Refresh centralized store so all pages get updated settings
            refreshAll();
          }
        },
      );
    }
  };

  const addPlan = () => {
    const trimmed = newPlan.trim();
    if (trimmed && !gymConfig.gymPlans.includes(trimmed)) {
      setGymConfig({
        ...gymConfig,
        gymPlans: [...gymConfig.gymPlans, trimmed],
      });
      setNewPlan("");
    }
  };

  const deletePlan = (planToDelete) => {
    setGymConfig({
      ...gymConfig,
      gymPlans: gymConfig.gymPlans.filter((p) => p !== planToDelete),
    });
  };

  const addPTPlan = () => {
    const trimmed = newPTPlan.trim();
    if (trimmed && !gymConfig.personalPlans.includes(trimmed)) {
      setGymConfig({
        ...gymConfig,
        personalPlans: [...gymConfig.personalPlans, trimmed],
      });
      setNewPTPlan("");
    }
  };

  const deletePTPlan = (planToDelete) => {
    setGymConfig({
      ...gymConfig,
      personalPlans: gymConfig.personalPlans.filter((p) => p !== planToDelete),
    });
  };

  return (
    <div className="p-8 space-y-6 bg-[#F8FAFC] min-h-screen font-sans text-slate-800">
      <div className="flex justify-between items-center bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl font-bold">
            ⚙️
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              SENOVA Software Setup Desk
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Configure your local business credentials and manage core systemic
              arrays.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-6 max-w-4xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1.5 font-bold">
              Gym Master Branding Name
            </label>
            <input
              type="text"
              value={gymConfig.gymName}
              onChange={(e) =>
                setGymConfig({ ...gymConfig, gymName: e.target.value })
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1.5 font-bold">
              WhatsApp Gateway Phone Number
            </label>
            <input
              type="tel"
              value={gymConfig.gymPhone}
              onChange={(e) =>
                setGymConfig({ ...gymConfig, gymPhone: e.target.value })
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold tracking-wide font-mono text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-500 block mb-1.5 font-bold">
              Head Trainer Name
            </label>
            <input
              type="text"
              value={gymConfig.trainerName}
              onChange={(e) =>
                setGymConfig({ ...gymConfig, trainerName: e.target.value })
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
          {/* STANDARD PLAN MANAGER CONTAINER */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-blue-600 uppercase tracking-widest">
              🎛️ Standard Membership Plans
            </h4>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. 3 Months"
                value={newPlan}
                onChange={(e) => setNewPlan(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPlan()}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none"
              />
              <button
                onClick={addPlan}
                className="bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded-xl"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {gymConfig.gymPlans.map((p) => (
                <span
                  key={p}
                  className="bg-slate-50 text-slate-700 text-[10px] font-bold px-2.5 py-1 rounded-md border border-slate-200 flex items-center gap-1.5 select-none"
                >
                  <span>{p}</span>
                  <button
                    onClick={() => deletePlan(p)}
                    className="text-slate-400 hover:text-rose-500 font-bold"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* DYNAMIC PERSONAL TRAINING PLANS MANAGER */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-purple-600 uppercase tracking-widest flex items-center gap-1">
              <span>🏋️‍♂️</span> PT / MENTORSHIP LEDGERS
            </h4>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. PT Monthly - ₹5000"
                value={newPTPlan}
                onChange={(e) => setNewPTPlan(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPTPlan()}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none"
              />
              <button
                onClick={addPTPlan}
                className="bg-purple-600 text-white text-xs font-bold px-3 py-2 rounded-xl whitespace-nowrap"
              >
                Add Bracket
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {gymConfig.personalPlans.map((pt) => (
                <span
                  key={pt}
                  className="bg-purple-50 text-purple-600 text-[10px] font-black px-2.5 py-1 rounded-md border border-purple-100 flex items-center gap-1.5 select-none"
                >
                  <span>{pt}</span>
                  <button
                    onClick={() => deletePTPlan(pt)}
                    className="text-purple-400 hover:text-rose-500 font-bold"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="w-full bg-blue-600 text-white font-bold text-sm py-4 rounded-xl shadow-lg shadow-blue-600/10 hover:bg-blue-700 transition-all uppercase tracking-wider"
        >
          Save Configuration & Initialize Platform
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
