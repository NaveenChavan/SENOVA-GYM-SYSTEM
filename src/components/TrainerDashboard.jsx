import React, { useState, useEffect } from "react";
import useGymStore from "../store/gymStore";
import { useUI } from "../context/UIContext";
const windowElectron = window.require ? window.require("electron") : null;

const TrainerDashboard = () => {
  // Consume from centralized store
  const trainers = useGymStore((state) => state.trainers);
  const refreshAll = useGymStore((state) => state.refreshAll);
  const { showToast, showConfirm } = useUI();

  const [form, setForm] = useState({
    name: "",
    specialization: "Bodybuilding",
    phone: "",
  });

  const showToastRef = React.useRef(showToast);
  React.useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  // Listen for mutation-specific responses (add/delete trainer)
  useEffect(() => {
    if (!windowElectron) return;

    const handleAdd = (_e, arg) => {
      if (arg.success) {
        showToastRef.current("Trainer profile injected successfully!", "success");
        setForm({ name: "", specialization: "Bodybuilding", phone: "" });
        refreshAll();
      } else {
        showToastRef.current(arg.error || "Failed to add trainer.", "error");
      }
    };
    const handleDelete = (_e, arg) => {
      if (arg.success) {
        showToastRef.current("Trainer profile successfully deleted from local system!", "success");
        refreshAll();
      } else {
        showToastRef.current(arg.error || "Failed to delete trainer.", "error");
      }
    };

    windowElectron.ipcRenderer.on("add-trainer-response", handleAdd);
    windowElectron.ipcRenderer.on("delete-trainer-response", handleDelete);

    return () => {
      windowElectron.ipcRenderer.removeListener("add-trainer-response", handleAdd);
      windowElectron.ipcRenderer.removeListener("delete-trainer-response", handleDelete);
    };
  }, [refreshAll]);

  const handleSave = () => {
    const trimmedName = form.name.trim();
    const trimmedPhone = form.phone.trim().replace(/^\+91/, "");

    if (!trimmedName || !trimmedPhone)
      return showToast("All trainer fields are mandatory!", "error");

    if (!/^[A-Za-z][A-Za-z\s.\-]*$/.test(trimmedName))
      return showToast("Name must contain only letters, spaces, dots or hyphens. Numbers are not allowed.", "error");

    if (!/^\d{10}$/.test(trimmedPhone))
      return showToast("Mobile number must be exactly 10 digits (numeric only).", "error");

    if (windowElectron)
      windowElectron.ipcRenderer.send("add-trainer", {
        name: trimmedName,
        specialization: form.specialization,
        phone: trimmedPhone,
      });
  };

  const handleDeleteTrainer = async (id) => {
    const confirmed = await showConfirm(
      "Delete this expert profile permanently? Active clients will shift to General Training.",
    );
    if (confirmed) {
      if (windowElectron) windowElectron.ipcRenderer.send("delete-trainer", id);
    }
  };

  return (
    <div className="p-8 space-y-6 bg-[#F8FAFC] min-h-screen font-sans text-slate-800">
      <div className="flex justify-between items-center bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl font-bold">
            💪
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Trainer Management Desk
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Trace specialized master tags and mapped clients allocations live.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-4 h-fit">
          <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest">
            📋 Register New Trainer
          </h3>
          <input
            type="text"
            placeholder="Trainer Full Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-600 focus:bg-white transition-all font-semibold"
          />
          <input
            type="tel"
            placeholder="Mobile Number"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-600 focus:bg-white transition-all font-mono font-bold"
          />
          <select
            value={form.specialization}
            onChange={(e) =>
              setForm({ ...form, specialization: e.target.value })
            }
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-600 focus:bg-white transition-all font-bold"
          >
            <option>Bodybuilding</option>
            <option>Powerlifting</option>
            <option>Weightlifting</option>
            <option>General Fitness & Fat Loss</option>
          </select>
          <button
            onClick={handleSave}
            className="w-full bg-blue-600 text-white font-bold text-sm py-3.5 rounded-xl hover:bg-blue-700 transition-all uppercase tracking-wider pt-3"
          >
            Add Trainer
          </button>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">
            👥 Active Trainers Roster ({trainers.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {trainers.map((t) => (
              <div
                key={t.id}
                className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-black text-slate-900 text-base">
                        {t.name}
                      </h4>
                      <p className="text-[11px] text-slate-400 font-bold font-mono tracking-wide">
                        {t.phone}
                      </p>
                    </div>
                    <span className="bg-blue-50 text-blue-600 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-blue-100 uppercase">
                      {t.specialization}
                    </span>
                  </div>

                  <div className="border-t border-slate-100 mt-3 pt-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Mapped Clients ({t.clients?.length || 0}):
                    </p>
                    {!t.clients || t.clients.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">
                        No direct clients linked under this expert track.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
                        {t.clients.map((c, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-50 border border-slate-100 p-2 rounded-xl flex justify-between items-center text-xs"
                          >
                            <span className="font-bold text-slate-800">
                              👤 {c.name}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400 font-bold">
                              {c.phone}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="bg-slate-100 text-slate-700 font-mono px-2 py-0.5 rounded-md text-[10px] font-bold">
                    {t.assignedClients || 0} Active Counter
                  </span>
                  <button
                    onClick={() => handleDeleteTrainer(t.id)}
                    className="text-rose-500 hover:text-rose-600 text-xs font-bold inline-flex items-center gap-1"
                  >
                    🗑️ Delete Trainer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainerDashboard;
