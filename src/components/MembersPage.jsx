import React, { useState, useEffect, useRef, useMemo } from "react";
import useGymStore from "../store/gymStore";
import { useUI } from "../context/UIContext";
import CameraCapture from "./CameraCapture";
const windowElectron = window.electron || null;

const getLocalDate = (date) => {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const MembersPage = () => {
  // Consume from centralized store
  const settings = useGymStore((state) => state.settings);
  const trainers = useGymStore((state) => state.trainers);
  const refreshAll = useGymStore((state) => state.refreshAll);
  const { showToast } = useUI();

  const gymConfig = useMemo(() => ({
    gymName: settings.gymName || "MF FITNESS CLUB",
    gymPlans: settings.gymPlans || ["Monthly", "3 Months", "6 Months", "1 Year"],
  }), [settings]);
  const trainersList = trainers;

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    age: "",
    sex: "Male",
    plan: gymConfig.gymPlans[0] || "Monthly",
    paymentMode: "Cash",
    amountPaid: "",
    amountPending: "0",
    assignedTrainerId: "None",
    joinDate: getLocalDate(),
    photo: null,
  });

  // DEFECT 2 fix: the face descriptor is computed as soon as a photo is
  // captured (not lazily, the first time Face Scan mode is opened), so it can
  // ride along in the add-member payload and be persisted immediately.
  // `faceDescriptorState` distinguishes "still computing" from "computed to
  // null because no face was detectable" so MembersList can flag the latter.
  const [faceDescriptor, setFaceDescriptor] = useState(null);
  const [faceDescriptorState, setFaceDescriptorState] = useState("idle"); // idle|computing|ready|no-face|error

  // Refs prevent the useEffect from rebinding and crashing the IPC thread
  const formDataRef = useRef(formData);
  const gymConfigRef = useRef(gymConfig);
  const showToastRef = useRef(showToast);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);
  useEffect(() => {
    gymConfigRef.current = gymConfig;
  }, [gymConfig]);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  // Sync form plan default when gymConfig loads
  useEffect(() => {
    if (gymConfig.gymPlans && gymConfig.gymPlans.length > 0) {
      setFormData((prev) => {
        // Only update if current plan is not in the available plans
        if (!gymConfig.gymPlans.includes(prev.plan)) {
          return { ...prev, plan: gymConfig.gymPlans[0] };
        }
        return prev;
      });
    }
  }, [gymConfig]);

  const [isCaptureOpen, setIsCaptureOpen] = useState(false);

  // 🚨 FREEZE FIX: Empty dependency array means this listener mounts EXACTLY ONCE
  useEffect(() => {
    const handleAddResponse = (event, arg) => {
      if (arg.success) {
        showToastRef.current("Member profile locked and trainer queue updated!", "success");

        const currentData = formDataRef.current;
        const currentConfig = gymConfigRef.current;

        let daysToAdd = 30;
        if (currentData.plan.includes("3")) daysToAdd = 90;
        else if (currentData.plan.includes("6")) daysToAdd = 180;
        else if (
          currentData.plan.includes("1") ||
          currentData.plan.toLowerCase().includes("year")
        )
          daysToAdd = 365;
        const baseForExpiry = currentData.joinDate ? new Date(currentData.joinDate) : new Date();
        const expiryDateStr = getLocalDate(new Date(
          baseForExpiry.getTime() + daysToAdd * 24 * 60 * 60 * 1000,
        ));

        if (windowElectron) {
          windowElectron.ipcRenderer.send("send-whatsapp-bill", {
            gymName: currentConfig.gymName,
            name: currentData.name,
            phone: currentData.phone,
            plan: currentData.plan,
            amountPaid: currentData.amountPaid || "0",
            amountPending: currentData.amountPending || "0",
            expiryDate: expiryDateStr,
          });
        }

        setFormData({
          name: "",
          phone: "",
          age: "",
          sex: "Male",
          plan: currentConfig.gymPlans[0] || "Monthly",
          paymentMode: "Cash",
          amountPaid: "",
          amountPending: "0",
          assignedTrainerId: "None",
          joinDate: getLocalDate(),
          photo: null,
        });
        setFaceDescriptor(null);
        setFaceDescriptorState("idle");

        // Refresh centralized store so all pages update
        refreshAll();
      } else {
        showToastRef.current(arg.error || "Failed to add member.", "error");
      }
    };

    if (windowElectron)
      windowElectron.ipcRenderer.on("add-member-response", handleAddResponse);
    return () => {
      if (windowElectron)
        windowElectron.ipcRenderer.removeListener(
          "add-member-response",
          handleAddResponse,
        );
    };
  }, [refreshAll]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // DEFECT 2 fix: compute the descriptor right after a photo is captured,
  // instead of waiting for Face Scan mode to lazily backfill it later. No
  // Node-globals hiding needed here — the renderer now runs with
  // nodeIntegration: false (see main.js + preload.js), so face-api/TF.js's
  // own environment auto-detection correctly resolves to "browser" already.
  const computePhotoDescriptor = async (dataUrl) => {
    setFaceDescriptorState("computing");
    try {
      const lib = await import("../services/faceRecognition");
      await lib.loadModels();
      await lib.warmup();
      const descriptor = await lib.computeDescriptorFromDataUrl(dataUrl);
      if (descriptor) {
        setFaceDescriptor(lib.descriptorToArray(descriptor));
        setFaceDescriptorState("ready");
      } else {
        setFaceDescriptor(null);
        setFaceDescriptorState("no-face");
      }
    } catch (error) {
      console.error("[MembersPage] Failed to compute face descriptor at save time:", error);
      setFaceDescriptor(null);
      setFaceDescriptorState("error");
    }
  };

  const handleSave = () => {
    const trimmedName = formData.name.trim();
    const trimmedPhone = formData.phone.trim().replace(/^\+91/, "");

    if (!trimmedName || !trimmedPhone)
      return showToast(
        "Member Name and Mobile Number are strictly mandatory!",
        "error",
      );

    if (!/^[A-Za-z][A-Za-z\s.-]*$/.test(trimmedName))
      return showToast(
        "Name must contain only letters, spaces, dots or hyphens. Numbers are not allowed.",
        "error",
      );

    if (!/^\d{10}$/.test(trimmedPhone))
      return showToast(
        "Mobile number must be exactly 10 digits (numeric only).",
        "error",
      );

    let daysToAdd = 30;
    if (formData.plan.includes("3")) daysToAdd = 90;
    else if (formData.plan.includes("6")) daysToAdd = 180;
    else if (
      formData.plan.includes("1") ||
      formData.plan.toLowerCase().includes("year")
    )
      daysToAdd = 365;

    const baseDate = formData.joinDate ? new Date(formData.joinDate) : new Date();
    const expiry = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    const now = new Date();
    const joinTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const payload = {
      ...formData,
      name: trimmedName,
      phone: trimmedPhone,
      joinDate: formData.joinDate || getLocalDate(),
      joinTime: joinTime,
      expiryDate: getLocalDate(expiry),
      faceDescriptor: faceDescriptorState === "ready" ? faceDescriptor : null,
    };
    if (windowElectron) windowElectron.ipcRenderer.send("add-member", payload);
  };

  return (
    <div className="p-8 space-y-6 bg-[#F8FAFC] min-h-screen font-sans text-slate-800">
      <div className="flex justify-between items-center bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl font-bold">
            👥
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Member Onboarding Terminal
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Active Station Instance:{" "}
              <span className="text-blue-600 font-bold uppercase">
                {gymConfig.gymName}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-5">
            <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
              <span>📄</span> PRIMARY REGISTRATION MATRIX
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-bold">
                  Member Full Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-bold">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold tracking-wide"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-bold">
                  Age
                </label>
                <input
                  type="number"
                  name="age"
                  value={formData.age}
                  onChange={handleInputChange}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-bold">
                  Sex
                </label>
                <select
                  name="sex"
                  value={formData.sex}
                  onChange={handleInputChange}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold"
                >
                  <option>Male</option>
                  <option>Female</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-5">
            <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
              <span>🎛️</span> SUBSCRIPTION & TRAINER MAPPING LEDGER
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-bold">
                  Select Target Plan
                </label>
                <select
                  name="plan"
                  value={formData.plan}
                  onChange={handleInputChange}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold"
                >
                  {gymConfig.gymPlans.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-bold">
                  Assign Personal Trainer
                </label>
                <select
                  name="assignedTrainerId"
                  value={formData.assignedTrainerId}
                  onChange={handleInputChange}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold"
                >
                  <option value="None">None (General Training)</option>
                  {trainersList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.specialization})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-bold">
                  Joining Date
                </label>
                <input
                  type="date"
                  name="joinDate"
                  value={formData.joinDate}
                  onChange={handleInputChange}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold font-mono"
                />
              </div>
              <div className="flex items-end">
                <div className="w-full bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                  <p className="text-[11px] font-bold text-blue-600">
                    📅 Expiry: <span className="font-mono font-black">{(() => {
                      let d = 30;
                      if (formData.plan.includes("3")) d = 90;
                      else if (formData.plan.includes("6")) d = 180;
                      else if (formData.plan.includes("1") || formData.plan.toLowerCase().includes("year")) d = 365;
                      const base = formData.joinDate ? new Date(formData.joinDate) : new Date();
                      return getLocalDate(new Date(base.getTime() + d * 24 * 60 * 60 * 1000));
                    })()}</span>
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-bold">
                  Payment Mode
                </label>
                <select
                  name="paymentMode"
                  value={formData.paymentMode}
                  onChange={handleInputChange}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Google Pay">Google Pay</option>
                  <option value="PhonePe">PhonePe</option>
                  <option value="Card">Card</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-bold">
                  Amount Paid (INR)
                </label>
                <input
                  type="number"
                  name="amountPaid"
                  value={formData.amountPaid}
                  onChange={handleInputChange}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-bold">
                  Amount Pending (INR)
                </label>
                <input
                  type="number"
                  name="amountPending"
                  value={formData.amountPending}
                  onChange={handleInputChange}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
              <span>🛂</span> BIOMETRIC & IDENTITY HUB
            </h3>

            {/* MEMBER PHOTO */}
            <div className="w-full aspect-square bg-slate-50 border border-slate-200/60 rounded-2xl flex flex-col items-center justify-center text-center p-3 relative overflow-hidden">
              {formData.photo ? (
                <img
                  src={formData.photo}
                  alt="Captured Profile"
                  className="w-full h-full object-cover rounded-xl shadow-sm"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center relative mb-3">
                  <div className="w-24 h-24 rounded-full bg-blue-100/50 flex items-center justify-center text-3xl">
                    🪪
                  </div>
                </div>
              )}

              <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
                <button
                  type="button"
                  onClick={() => setIsCaptureOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-4 py-2 rounded-lg shadow-md transition-all"
                >
                  {formData.photo ? "🔄 Retake Photo" : "📷 Click Photo"}
                </button>
              </div>
            </div>

            {faceDescriptorState === "computing" && (
              <p className="text-[10px] font-bold text-blue-500 flex items-center gap-1">
                <span className="animate-pulse">🧠</span> Analyzing face for attendance matching…
              </p>
            )}
            {faceDescriptorState === "no-face" && (
              <p className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                ⚠ No face detected in this photo — face-scan attendance won't work for
                this member unless retaken with a clear, front-facing photo.
              </p>
            )}
            {faceDescriptorState === "ready" && (
              <p className="text-[10px] font-bold text-emerald-600">
                ✓ Face data captured — ready for face-scan attendance.
              </p>
            )}

            {/* Thumb Scanner Readiness Placeholder */}
            <div className="flex justify-between items-center bg-emerald-50 border border-emerald-100 p-3 rounded-xl mt-2">
              <span className="text-[10px] font-black text-emerald-700 uppercase flex items-center gap-1">
                <span>👆</span> Thumb Scanner Module
              </span>
              <span className="bg-emerald-200 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded-md">
                Port Ready
              </span>
            </div>
          </div>
          <button
            onClick={handleSave}
            className="w-full bg-blue-600 text-white font-bold text-sm py-4 rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all uppercase pt-3.5"
          >
            SAVE RECORD & DISPATCH WHATSAPP BILL
          </button>
        </div>
      </div>

      {isCaptureOpen && (
        <CameraCapture
          onCapture={(base64Photo) => {
            setFormData((prev) => ({ ...prev, photo: base64Photo }));
            computePhotoDescriptor(base64Photo);
          }}
          onClose={() => setIsCaptureOpen(false)}
        />
      )}
    </div>
  );
};

export default MembersPage;
