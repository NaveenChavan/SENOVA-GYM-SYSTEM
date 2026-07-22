import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import useGymStore from "../store/gymStore";
import { useUI } from "../context/UIContext";
import CameraCapture from "./CameraCapture";
const windowElectron = window.electron || null;

const getLocalDate = (date) => {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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
  const [detailsId, setDetailsId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const menuBtnRefs = useRef({});
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, openUp: false });

  // Retake-photo flow while editing: photoChanged flags update-member to also
  // touch the photo/faceDescriptor columns (see main.js update-member — most
  // edits don't include a photo and must leave the existing one untouched).
  const [isEditCaptureOpen, setIsEditCaptureOpen] = useState(false);
  const [editFaceDescriptorState, setEditFaceDescriptorState] = useState("idle"); // idle|computing|ready|no-face|error

  const MENU_HEIGHT = 180; // approximate max dropdown height in px

  const toggleMenu = useCallback((memberId) => {
    if (menuOpenId === memberId) {
      setMenuOpenId(null);
      return;
    }
    const btn = menuBtnRefs.current[memberId];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < MENU_HEIGHT;
      setMenuPos({
        top: openUp ? rect.top : rect.bottom + 4,
        left: rect.right - 160, // 160 = w-40 (10rem)
        openUp,
      });
    }
    setMenuOpenId(memberId);
  }, [menuOpenId]);

  // Renewal modal state
  const [renewMember, setRenewMember] = useState(null);
  const [renewForm, setRenewForm] = useState({
    plan: "",
    paymentMode: "Cash",
    amountPaid: "",
    amountPending: "0",
  });

  const gymPlans = settings.gymPlans || ["Monthly", "3 Months", "6 Months", "1 Year"];
  const paymentModes = ["Cash", "UPI", "Google Pay", "PhonePe", "Card", "Other"];

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

    const handleRenewResponse = (_e, arg) => {
      if (arg.success) {
        showToast("Membership renewed successfully!", "success");
        setRenewMember(null);
        refreshAll();
      } else {
        showToast(arg.error || "Failed to renew membership.", "error");
      }
    };

    windowElectron.ipcRenderer.on("update-member-response", handleUpdateResponse);
    windowElectron.ipcRenderer.on("delete-member-response", handleDeleteResponse);
    windowElectron.ipcRenderer.on("renew-member-response", handleRenewResponse);

    return () => {
      windowElectron.ipcRenderer.removeListener("update-member-response", handleUpdateResponse);
      windowElectron.ipcRenderer.removeListener("delete-member-response", handleDeleteResponse);
      windowElectron.ipcRenderer.removeListener("renew-member-response", handleRenewResponse);
    };
  }, [refreshAll, showToast]);

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
    setEditFaceDescriptorState("idle");
  };

  // Hardening 6 + DEFECT 2: recompute the descriptor immediately when a
  // member's photo is retaken during edit, instead of leaving the stale
  // descriptor (from the old photo) to linger until a later Face Scan
  // backfill. Mirrors MembersPage.computePhotoDescriptor. No Node-globals
  // hiding needed — the renderer runs with nodeIntegration: false (see
  // main.js + preload.js), so face-api/TF.js's environment auto-detection
  // correctly resolves to "browser" on its own.
  const computeEditPhotoDescriptor = async (dataUrl) => {
    setEditFaceDescriptorState("computing");
    try {
      const lib = await import("../services/faceRecognition");
      await lib.loadModels();
      await lib.warmup();
      const descriptor = await lib.computeDescriptorFromDataUrl(dataUrl);
      if (descriptor) {
        setEditForm((prev) => ({ ...prev, _newFaceDescriptor: lib.descriptorToArray(descriptor) }));
        setEditFaceDescriptorState("ready");
      } else {
        setEditForm((prev) => ({ ...prev, _newFaceDescriptor: null }));
        setEditFaceDescriptorState("no-face");
      }
    } catch (error) {
      console.error("[MembersList] Failed to compute face descriptor on photo retake:", error);
      setEditForm((prev) => ({ ...prev, _newFaceDescriptor: null }));
      setEditFaceDescriptorState("error");
    }
  };

  const handleEditPhotoCapture = (base64Photo) => {
    setEditForm((prev) => ({ ...prev, photo: base64Photo, _photoChanged: true }));
    computeEditPhotoDescriptor(base64Photo);
  };

  const handleSaveEdit = () => {
    const trimmedName = (editForm.name || "").trim();
    const trimmedPhone = (editForm.phone || "").trim().replace(/^\+91/, "");

    if (!trimmedName || !trimmedPhone)
      return showToast("Name and Mobile Number cannot be empty.", "error");

    if (!/^[A-Za-z][A-Za-z\s.-]*$/.test(trimmedName))
      return showToast("Name must contain only letters, spaces, dots or hyphens. Numbers are not allowed.", "error");

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
        joinDate: editForm.joinDate || null,
        joinTime: editForm.joinTime || null,
        photo: editForm._photoChanged ? editForm.photo : undefined,
        photoChanged: editForm._photoChanged === true,
        faceDescriptor: editFaceDescriptorState === "ready" ? editForm._newFaceDescriptor : null,
      });
    }
  };

  // ─── RENEWAL FUNCTIONS ────────────────────────────────────

  const getDaysRemaining = (expiryDate) => {
    if (!expiryDate) return null;
    const diff = Math.ceil((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getMemberStatus = (member) => {
    if (member.status === "Frozen") return "Frozen";
    const days = getDaysRemaining(member.expiryDate);
    if (days === null) return member.status;
    if (days < 0) return "Expired";
    return "Active";
  };

  const getPlanDays = (plan) => {
    if (!plan) return 30;
    if (plan.includes("3")) return 90;
    if (plan.includes("6")) return 180;
    if (plan.includes("1") || plan.toLowerCase().includes("year")) return 365;
    return 30;
  };

  const calculateExpiry = (plan, startDate) => {
    const days = getPlanDays(plan);
    const base = startDate ? new Date(startDate) : new Date();
    if (isNaN(base.getTime())) return "";
    const expiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    return getLocalDate(expiry);
  };

  const openRenewModal = (member) => {
    const today = getLocalDate();
    setRenewMember(member);
    setRenewForm({
      plan: gymPlans[0] || "Monthly",
      paymentMode: "Cash",
      amountPaid: "",
      amountPending: "0",
      startDate: today,
      notes: "",
    });
  };

  const handleRenew = () => {
    if (!renewForm.amountPaid && renewForm.amountPaid !== 0) {
      return showToast("Amount Paid is required for renewal.", "error");
    }
    if (!renewForm.startDate) {
      return showToast("Membership Start Date is required.", "error");
    }
    if (!renewForm.plan) {
      return showToast("Please select a membership plan.", "error");
    }

    // Active members: extend from current expiry. Expired members: calculate from start date.
    const daysLeft = getDaysRemaining(renewMember.expiryDate);
    const isActive = daysLeft !== null && daysLeft > 0;
    const baseDate = isActive ? renewMember.expiryDate : renewForm.startDate;
    const newExpiry = calculateExpiry(renewForm.plan, baseDate);

    if (!newExpiry) {
      return showToast("Invalid date. Please check.", "error");
    }

    if (windowElectron) {
      windowElectron.ipcRenderer.send("renew-member", {
        id: renewMember.id,
        plan: renewForm.plan,
        paymentMode: renewForm.paymentMode,
        amountPaid: renewForm.amountPaid,
        amountPending: renewForm.amountPending || "0",
        expiryDate: newExpiry,
        startDate: isActive ? renewMember.expiryDate : renewForm.startDate,
        notes: renewForm.notes || "",
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
                      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-3">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) =>
                            setEditForm({ ...editForm, name: e.target.value })
                          }
                          className="bg-white border border-slate-200 px-3 py-2 rounded-xl font-semibold w-full"
                          placeholder="Name"
                        />
                        <input
                          type="text"
                          value={editForm.phone}
                          onChange={(e) =>
                            setEditForm({ ...editForm, phone: e.target.value })
                          }
                          className="bg-white border border-slate-200 px-3 py-2 rounded-xl font-mono font-bold w-full"
                          placeholder="Phone"
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
                          type="date"
                          value={editForm.joinDate || ""}
                          onChange={(e) =>
                            setEditForm({ ...editForm, joinDate: e.target.value })
                          }
                          className="bg-white border border-slate-200 px-3 py-2 rounded-xl font-mono font-bold w-full"
                        />
                        <input
                          type="time"
                          value={editForm.joinTime || ""}
                          onChange={(e) =>
                            setEditForm({ ...editForm, joinTime: e.target.value })
                          }
                          className="bg-white border border-slate-200 px-3 py-2 rounded-xl font-mono font-bold w-full"
                        />
                        <input
                          type="number"
                          min="0"
                          value={editForm.amountPending || ""}
                          onChange={(e) =>
                            setEditForm({ ...editForm, amountPending: e.target.value })
                          }
                          className="bg-white border border-rose-200 px-3 py-2 rounded-xl font-mono font-bold w-full text-rose-600"
                          placeholder="₹ Pending"
                        />
                      </div>
                      <div className="flex items-center gap-3 mb-3">
                        <button
                          type="button"
                          onClick={() => setIsEditCaptureOpen(true)}
                          className="bg-slate-900 text-white text-[11px] font-bold px-3 py-2 rounded-lg hover:bg-slate-800 transition-all"
                        >
                          📷 Retake Photo
                        </button>
                        {editFaceDescriptorState === "computing" && (
                          <span className="text-[11px] font-bold text-blue-500 flex items-center gap-1">
                            <span className="animate-pulse">🧠</span> Analyzing new photo…
                          </span>
                        )}
                        {editFaceDescriptorState === "no-face" && (
                          <span className="text-[11px] font-bold text-amber-600">
                            ⚠ No face detected in the new photo — retake with a clear, front-facing shot.
                          </span>
                        )}
                        {editFaceDescriptorState === "ready" && (
                          <span className="text-[11px] font-bold text-emerald-600">
                            ✓ New face data captured.
                          </span>
                        )}
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
                  <React.Fragment key={member.id}>
                  <tr
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
                          {member.photo && !member.faceDescriptor && (
                            <span
                              title="No face was detected in this member's registered photo — face-scan attendance won't recognize them until the photo is retaken with a clear, front-facing shot."
                              className="inline-block mt-1 text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100 tracking-tight"
                            >
                              ⚠ No face detected — retake photo
                            </span>
                          )}
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
                        <button
                          onClick={() => setDetailsId(detailsId === member.id ? null : member.id)}
                          className="bg-slate-50 text-slate-600 hover:bg-slate-100 px-2 sm:px-2.5 py-1.5 rounded-lg border border-slate-200 text-[10px] sm:text-[11px] font-black transition-all flex items-center gap-1"
                        >
                          📋 Info
                        </button>
                        <button
                          onClick={() => openRenewModal(member)}
                          className="bg-emerald-50/60 text-emerald-600 hover:bg-emerald-100/80 px-2 sm:px-2.5 py-1.5 rounded-lg border border-emerald-100 text-[10px] sm:text-[11px] font-black transition-all flex items-center gap-1"
                        >
                          🔄 Renew
                        </button>
                        <div className="relative">
                          <button
                            ref={(el) => { menuBtnRefs.current[member.id] = el; }}
                            onClick={() => toggleMenu(member.id)}
                            className="bg-slate-50 text-slate-500 hover:bg-slate-100 w-7 h-7 rounded-lg border border-slate-200 text-sm font-black transition-all flex items-center justify-center"
                          >
                            ⋮
                          </button>
                          {menuOpenId === member.id && createPortal(
                            <>
                            <div className="fixed inset-0 z-[9998]" onClick={() => setMenuOpenId(null)}></div>
                            <div
                              className="fixed z-[9999] bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 w-40"
                              style={{
                                top: menuPos.openUp ? undefined : `${menuPos.top}px`,
                                bottom: menuPos.openUp ? `${window.innerHeight - menuPos.top + 4}px` : undefined,
                                left: `${menuPos.left}px`,
                              }}
                            >
                              {Number(member.amountPending) > 0 && (
                                <button
                                  onClick={() => { sendDuesReminder(member); setMenuOpenId(null); }}
                                  className="w-full text-left px-3.5 py-2 text-[11px] font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center gap-2"
                                >
                                  💬 Send Reminder
                                </button>
                              )}
                              <button
                                onClick={() => { startEdit(member); setMenuOpenId(null); }}
                                className="w-full text-left px-3.5 py-2 text-[11px] font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center gap-2"
                              >
                                🖊️ Edit Details
                              </button>
                              <button
                                onClick={() => { triggerFreeze(member); setMenuOpenId(null); }}
                                className="w-full text-left px-3.5 py-2 text-[11px] font-bold text-slate-700 hover:bg-orange-50 hover:text-orange-600 transition-all flex items-center gap-2"
                              >
                                ❄️ {member.status === "Frozen" ? "Unfreeze" : "Freeze"}
                              </button>
                              <button
                                onClick={() => { triggerDelete(member.id); setMenuOpenId(null); }}
                                className="w-full text-left px-3.5 py-2 text-[11px] font-bold text-rose-500 hover:bg-rose-50 transition-all flex items-center gap-2"
                              >
                                🗑️ Delete
                              </button>
                            </div>
                            </>,
                            document.body
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                  {detailsId === member.id && (
                    <tr className="bg-slate-50/50">
                      <td colSpan="5" className="px-6 py-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-xs">
                          <div>
                            <span className="text-slate-400 font-bold block">Plan</span>
                            <span className="text-slate-800 font-black">{member.plan || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-bold block">Status</span>
                            <span className={`font-black ${getMemberStatus(member) === "Expired" ? "text-rose-500" : getMemberStatus(member) === "Active" ? "text-emerald-600" : "text-slate-500"}`}>
                              {getMemberStatus(member)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-bold block">Joining Date</span>
                            <span className="text-slate-800 font-bold font-mono">{member.joinDate || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-bold block">Joining Time</span>
                            <span className="text-slate-800 font-bold font-mono">{member.joinTime || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-bold block">Expiry Date</span>
                            <span className="text-slate-800 font-bold font-mono">{member.expiryDate || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-bold block">Days Remaining</span>
                            <span className={`font-black font-mono ${(getDaysRemaining(member.expiryDate) || 0) <= 0 ? "text-rose-500" : (getDaysRemaining(member.expiryDate) || 0) <= 7 ? "text-amber-500" : "text-emerald-600"}`}>
                              {getDaysRemaining(member.expiryDate) !== null ? getDaysRemaining(member.expiryDate) : "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-bold block">Amount Paid</span>
                            <span className="text-emerald-600 font-black font-mono">₹{member.amountPaid || "0"}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-bold block">Amount Pending</span>
                            <span className={`font-black font-mono ${Number(member.amountPending) > 0 ? "text-rose-500" : "text-slate-500"}`}>₹{member.amountPending || "0"}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── RENEWAL MODAL ──────────────────────────────────── */}
      {renewMember && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg mx-4 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-slate-900">Renew Membership</h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  {renewMember.name} • {renewMember.phone}
                </p>
              </div>
              <button
                onClick={() => setRenewMember(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Current Membership Info */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Current Membership</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Plan:</span>
                  <span className="font-bold text-slate-700">{renewMember.plan || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Status:</span>
                  <span className={`font-black ${getMemberStatus(renewMember) === "Active" ? "text-emerald-600" : getMemberStatus(renewMember) === "Expired" ? "text-rose-500" : "text-slate-500"}`}>
                    {getMemberStatus(renewMember)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Joined:</span>
                  <span className="font-bold text-slate-700 font-mono">{renewMember.joinDate || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Expiry:</span>
                  <span className="font-bold text-slate-700 font-mono">{renewMember.expiryDate || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Days Left:</span>
                  <span className={`font-black font-mono ${(getDaysRemaining(renewMember.expiryDate) || 0) <= 0 ? "text-rose-500" : (getDaysRemaining(renewMember.expiryDate) || 0) <= 7 ? "text-amber-500" : "text-emerald-600"}`}>
                    {getDaysRemaining(renewMember.expiryDate) !== null ? getDaysRemaining(renewMember.expiryDate) : "—"}
                  </span>
                </div>
                {renewMember.joinTime && (
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">Join Time:</span>
                    <span className="font-bold text-slate-700 font-mono">{renewMember.joinTime}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Renewal Form */}
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-bold">New Plan</label>
                <select
                  value={renewForm.plan}
                  onChange={(e) => setRenewForm({ ...renewForm, plan: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-blue-600"
                >
                  {gymPlans.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-bold">Membership Start Date</label>
                <input
                  type="date"
                  value={renewForm.startDate}
                  onChange={(e) => setRenewForm({ ...renewForm, startDate: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold font-mono focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-[11px] font-bold text-blue-600">
                  📅 New Expiry: <span className="font-mono font-black">{(() => {
                    const daysLeft = getDaysRemaining(renewMember.expiryDate);
                    const isActive = daysLeft !== null && daysLeft > 0;
                    const baseDate = isActive ? renewMember.expiryDate : renewForm.startDate;
                    return calculateExpiry(renewForm.plan, baseDate) || "—";
                  })()}</span>
                  <span className="text-blue-400 ml-2">
                    ({getPlanDays(renewForm.plan)} days from {getDaysRemaining(renewMember.expiryDate) > 0 ? "current expiry" : "start date"})
                  </span>
                </p>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-bold">Payment Mode</label>
                <select
                  value={renewForm.paymentMode}
                  onChange={(e) => setRenewForm({ ...renewForm, paymentMode: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-blue-600"
                >
                  {paymentModes.map((mode) => (
                    <option key={mode} value={mode}>{mode}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1.5 font-bold">Amount Paid (₹)</label>
                  <input
                    type="number"
                    value={renewForm.amountPaid}
                    onChange={(e) => setRenewForm({ ...renewForm, amountPaid: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold font-mono focus:outline-none focus:border-blue-600"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1.5 font-bold">Amount Pending (₹)</label>
                  <input
                    type="number"
                    value={renewForm.amountPending}
                    onChange={(e) => setRenewForm({ ...renewForm, amountPending: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold font-mono focus:outline-none focus:border-blue-600"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-bold">Notes <span className="text-slate-300">(optional)</span></label>
                <input
                  type="text"
                  value={renewForm.notes}
                  onChange={(e) => setRenewForm({ ...renewForm, notes: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-blue-600"
                  placeholder="e.g. Discount applied, late renewal"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setRenewMember(null)}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleRenew}
                className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
              >
                Confirm Renewal
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditCaptureOpen && (
        <CameraCapture
          onCapture={(base64Photo) => {
            handleEditPhotoCapture(base64Photo);
          }}
          onClose={() => setIsEditCaptureOpen(false)}
        />
      )}
    </div>
  );
};

export default MembersList;
