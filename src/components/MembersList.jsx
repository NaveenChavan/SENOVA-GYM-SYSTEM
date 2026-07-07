import React, { useState, useEffect } from "react";
import useGymStore from "../store/gymStore";
import { useUI } from "../context/UIContext";
const windowElectron = window.require ? window.require("electron") : null;

const MembersList = () => {
  // Consume from centralized store
  const members = useGymStore((state) => state.members);
  const trainers = useGymStore((state) => state.trainers);
  const settings = useGymStore((state) => state.settings);
  const refreshAll = useGymStore((state) => state.refreshAll);
  const { showToast, showConfirm } = useUI();

  const gymName = settings.gymName || "SENOVA GYM";

  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyPending, setShowOnlyPending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const getAvatarStyles = (name) => {
    const firstLetter = name ? name.trim().charAt(0).toUpperCase() : "M";
    const bgColors = [
      "bg-blue-50 text-blue-600",
      "bg-purple-50 text-purple-600",
      "bg-amber-50 text-amber-600",
      "bg-rose-50 text-rose-600",
      "bg-emerald-50 text-emerald-600",
      "bg-cyan-50 text-cyan-600",
    ];
    const charCode = firstLetter.charCodeAt(0);
    return {
      letter: firstLetter,
      colorClass: bgColors[charCode % bgColors.length],
    };
  };

  // Listen for mutation responses (update/delete) — these are component-specific actions
  useEffect(() => {
    if (!windowElectron) return;

    const handleUpdateResponse = (_e, arg) => {
      if (arg.success) {
        showToast("Member updated successfully!", "success");
        setEditingId(null);
        refreshAll();
      } else {
        showToast(arg.error || "Failed to update member.", "error");
      }
    };

    const handleDeleteResponse = (_e, arg) => {
      if (arg.success) {
        showToast("Member deleted successfully.", "success");
        refreshAll();
      } else {
        showToast(arg.error || "Failed to delete member.", "error");
      }
    };

    windowElectron.ipcRenderer.on("update-member-response", handleUpdateResponse);
    windowElectron.ipcRenderer.on("delete-member-response", handleDeleteResponse);

    return () => {
      windowElectron.ipcRenderer.removeListener("update-member-response", handleUpdateResponse);
      windowElectron.ipcRenderer.removeListener("delete-member-response", handleDeleteResponse);
    };
  }, [refreshAll]);

  const getTrainerBadge = (id) => {
    if (!id || id === "None")
      return {
        name: "GENERAL",
        sub: "TRAINING",
        style: "bg-slate-100 text-slate-500 border-slate-200",
      };
    const match = trainers.find((t) => String(t.id) === String(id));
    if (!match)
      return {
        name: "GENERAL",
        sub: "TRAINING",
        style: "bg-slate-100 text-slate-500 border-slate-200",
      };

    const parts = match.name.toUpperCase().split(" ");
    return {
      name: parts[0] || "EXPERT",
      sub: parts[1] || "",
      style: "bg-purple-50 text-purple-600 border-purple-100",
    };
  };

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.phone.includes(searchTerm);
    const matchesPending = showOnlyPending ? Number(m.amountPending) > 0 : true;
    return matchesSearch && matchesPending;
  });

  const sendDuesReminder = (member) => {
    if (!windowElectron) return;
    windowElectron.ipcRenderer.send("send-whatsapp-bill", {
      type: "reminder",
      phone: member.phone,
      name: member.name,
      plan: member.plan,
      amountPaid: member.amountPaid,
      amountPending: member.amountPending || "0",
      expiryDate: member.expiryDate,
      gymName: gymName,
    });
    showToast(`Dues notification sent to ${member.name}!`, "success");
  };

  const triggerDelete = async (id) => {
    const confirmed = await showConfirm("Delete this record permanently?");
    if (confirmed) {
      if (windowElectron) windowElectron.ipcRenderer.send("delete-member", id);
    }
  };

  const triggerFreeze = (member) => {
    const newStatus = member.status === "Frozen" ? "Active" : "Frozen";
    if (windowElectron)
      windowElectron.ipcRenderer.send("update-member", {
        ...member,
        status: newStatus,
      });
  };

  const startEdit = (member) => {
    setEditingId(member.id);
    setEditForm({
      ...member,
      assignedTrainerId: member.assignedTrainerId || "None",
    });
  };

  const handleSaveEdit = () => {
    const trimmedName = (editForm.name || "").trim();
    const trimmedPhone = (editForm.phone || "").trim().replace(/^\+91/, "");

    if (!trimmedName || !trimmedPhone)
      return showToast("Name and Mobile Number cannot be empty.", "error");

    if (!/^\d{10}$/.test(trimmedPhone))
      return showToast("Mobile number must be exactly 10 digits (numeric only).", "error");

    if (windowElectron) {
      windowElectron.ipcRenderer.send("update-member", {
        id: editForm.id,
        name: trimmedName,
        phone: trimmedPhone,
        age: editForm.age,
        sex: editForm.sex,
        plan: editForm.plan,
        paymentMode: editForm.paymentMode,
        amountPaid: editForm.amountPaid,
        amountPending: editForm.amountPending,
        status: editForm.status,
        assignedTrainerId: editForm.assignedTrainerId || "None",
      });
    }
  };

  return (
    <div className="p-8 space-y-6 bg-[#F8FAFC] min-h-screen font-sans text-slate-800">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-[#F8FAFC] pb-2">
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Registered Client Directories
          </h2>
          <p className="text-xs text-slate-400 font-medium">
            Execute modifications, track udhaari logs, or trigger instant
            notification alerts.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <button
            onClick={() => setShowOnlyPending(!showOnlyPending)}
            className={`font-bold text-xs py-2.5 px-4 rounded-xl shadow-sm transition-all flex items-center gap-2 border ${
              showOnlyPending
                ? "bg-rose-50 text-rose-600 border-rose-200"
                : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
            }`}
          >
            <span>🎛️</span> Filter By Pending Dues
          </button>

          <div className="relative w-full lg:w-72">
            <span className="absolute left-3.5 top-3.5 text-slate-400 text-xs">
              🔍
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search Name or Mobile..."
              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-semibold focus:outline-none focus:border-blue-600 transition-all shadow-sm text-slate-800"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest bg-[#F8FAFC]/60 select-none">
                <th className="py-4 px-4 sm:px-6 font-bold text-slate-400">
                  Client Identity
                </th>
                <th className="py-4 px-4 sm:px-6 font-bold text-slate-400">
                  Assigned Trainer
                </th>
                <th className="py-4 px-4 sm:px-6 font-bold text-slate-400">
                  Ledger Statement
                </th>
                <th className="py-4 px-4 sm:px-6 font-bold text-slate-400">
                  Account Status
                </th>
                <th className="py-4 px-4 sm:px-6 text-right font-bold text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="text-xs font-semibold divide-y divide-slate-100 text-slate-700">
              {filteredMembers.map((member) => {
                const avatar = getAvatarStyles(member.name);
                const coach = getTrainerBadge(member.assignedTrainerId);
                const isEditing = editingId === member.id;

                return isEditing ? (
                  <tr key={member.id} className="bg-blue-50/20">
                    <td colSpan="5" className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) =>
                            setEditForm({ ...editForm, name: e.target.value })
                          }
                          className="bg-white border border-slate-200 px-3 py-2 rounded-xl font-semibold w-full"
                        />
                        <input
                          type="text"
                          value={editForm.phone}
                          onChange={(e) =>
                            setEditForm({ ...editForm, phone: e.target.value })
                          }
                          className="bg-white border border-slate-200 px-3 py-2 rounded-xl font-mono font-bold w-full"
                        />
                        <select
                          value={editForm.assignedTrainerId}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              assignedTrainerId: e.target.value,
                            })
                          }
                          className="bg-white border border-slate-200 px-3 py-2 rounded-xl font-bold w-full"
                        >
                          <option value="None">None (General Training)</option>
                          {trainers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={editForm.amountPaid}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              amountPaid: e.target.value,
                            })
                          }
                          className="bg-white border border-slate-200 px-3 py-2 rounded-xl font-bold w-full"
                          placeholder="Paid"
                        />
                        <input
                          type="number"
                          value={editForm.amountPending}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              amountPending: e.target.value,
                            })
                          }
                          className="bg-white border border-slate-200 px-3 py-2 rounded-xl font-bold w-full"
                          placeholder="Pending"
                        />
                      </div>
                      <div className="flex justify-end gap-2 font-bold">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all"
                        >
                          Save Changes
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={member.id}
                    className="hover:bg-slate-50/30 transition-all"
                  >
                    <td className="py-4 px-4 sm:px-6">
                      <div className="flex items-center space-x-3.5">
                        <div
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-black text-xs shadow-inner ${avatar.colorClass}`}
                        >
                          {avatar.letter}
                        </div>
                        <div>
                          <p className="font-extrabold text-slate-900 text-sm truncate max-w-[120px]">
                            {member.name}
                          </p>
                          <p className="text-[11px] text-slate-400 font-bold font-mono tracking-wide mt-0.5">
                            {member.phone}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-4 sm:px-6">
                      <div className="flex flex-col space-y-0.5 items-start">
                        <span
                          className={`text-[9px] font-black px-2 py-0.5 rounded border tracking-wider text-center min-w-[70px] ${coach.style}`}
                        >
                          {coach.name}
                        </span>
                        {coach.sub && (
                          <span
                            className={`text-[9px] font-black px-2 py-0.5 rounded border tracking-wider text-center min-w-[70px] ${coach.style}`}
                          >
                            {coach.sub}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-4 px-4 sm:px-6 font-sans">
                      <p className="text-slate-500 font-bold">
                        Paid:{" "}
                        <span className="text-emerald-500 font-extrabold font-mono">
                          ₹{member.amountPaid || "0"}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-400 font-bold font-mono mt-0.5">
                        Pending:{" "}
                        <span
                          className={
                            Number(member.amountPending) > 0
                              ? "text-rose-500 font-black"
                              : "text-slate-400 font-bold"
                          }
                        >
                          ₹{member.amountPending || "0"}
                        </span>
                      </p>
                    </td>

                    <td className="py-4 px-4 sm:px-6">
                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${member.status === "Active" ? "bg-emerald-500" : "bg-slate-400"}`}
                        ></span>
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider ${member.status === "Active" ? "text-emerald-600" : "text-slate-500"}`}
                        >
                          {member.status}
                        </span>
                      </div>
                    </td>

                    <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                        {Number(member.amountPending) > 0 && (
                          <button
                            onClick={() => sendDuesReminder(member)}
                            className="bg-blue-50/60 text-blue-600 hover:bg-blue-100/80 px-2 sm:px-2.5 py-1.5 rounded-lg border border-blue-100 text-[10px] sm:text-[11px] font-black transition-all flex items-center gap-1"
                          >
                            💬 Remind
                          </button>
                        )}
                        <button
                          onClick={() => triggerFreeze(member)}
                          className="bg-orange-50/40 text-orange-500 hover:bg-orange-100/60 px-2 sm:px-2.5 py-1.5 rounded-lg border border-orange-100 text-[10px] sm:text-[11px] font-black transition-all flex items-center gap-1"
                        >
                          ❄️{" "}
                          {member.status === "Frozen" ? "Unfreeze" : "Freeze"}
                        </button>
                        <button
                          onClick={() => startEdit(member)}
                          className="bg-blue-50/60 text-blue-600 hover:bg-blue-100/80 px-2 sm:px-2.5 py-1.5 rounded-lg border border-blue-100 text-[10px] sm:text-[11px] font-black transition-all flex items-center gap-1"
                        >
                          🖊️ Edit
                        </button>
                        <button
                          onClick={() => triggerDelete(member.id)}
                          className="bg-rose-50 text-rose-500 hover:bg-rose-100 px-2 sm:px-2.5 py-1.5 rounded-lg border border-rose-100 text-[10px] sm:text-[11px] font-black transition-all flex items-center gap-1"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MembersList;
