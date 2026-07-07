import React, { useState, useEffect, useRef } from "react";
import useGymStore from "../store/gymStore";
import { useUI } from "../context/UIContext";
const windowElectron = window.require ? window.require("electron") : null;

const MembersPage = () => {
  // Consume from centralized store
  const settings = useGymStore((state) => state.settings);
  const trainers = useGymStore((state) => state.trainers);
  const refreshAll = useGymStore((state) => state.refreshAll);
  const { showToast } = useUI();

  const gymConfig = {
    gymName: settings.gymName || "MF FITNESS CLUB",
    gymPlans: settings.gymPlans || ["Monthly", "3 Months", "6 Months", "1 Year"],
  };
  const trainersList = trainers;

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    age: "",
    sex: "Male",
    plan: gymConfig.gymPlans[0] || "Monthly",
    paymentMode: "UPI / GooglePay",
    amountPaid: "",
    amountPending: "0",
    assignedTrainerId: "None",
    photo: null,
  });

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
  }, [settings]);

  // CAMERA STATES
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

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
        const expiryDateStr = new Date(
          new Date().getTime() + daysToAdd * 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .split("T")[0];

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
          paymentMode: "UPI / GooglePay",
          amountPaid: "",
          amountPending: "0",
          assignedTrainerId: "None",
          photo: null,
        });

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

  const handleSave = () => {
    const trimmedName = formData.name.trim();
    const trimmedPhone = formData.phone.trim().replace(/^\+91/, "");

    if (!trimmedName || !trimmedPhone)
      return showToast(
        "Member Name and Mobile Number are strictly mandatory!",
        "error",
      );

    if (!/^[A-Za-z][A-Za-z\s.\-]*$/.test(trimmedName))
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
    const expiry = new Date(
      new Date().getTime() + daysToAdd * 24 * 60 * 60 * 1000,
    );

    const payload = {
      ...formData,
      name: trimmedName,
      phone: trimmedPhone,
      joinDate: new Date().toISOString().split("T")[0],
      expiryDate: expiry.toISOString().split("T")[0],
    };
    if (windowElectron) windowElectron.ipcRenderer.send("add-member", payload);
  };

  // CAMERA CONTROLLERS
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraOpen(true);
      }
    } catch (err) {
      showToast(
        "External Dashcam or Webcam not detected. Please connect USB device.",
        "error",
      );
    }
  };

  const capturePhoto = () => {
    if (canvasRef.current && videoRef.current) {
      const context = canvasRef.current.getContext("2d");
      context.drawImage(videoRef.current, 0, 0, 300, 300);
      const photoData = canvasRef.current.toDataURL("image/jpeg", 0.8);
      setFormData((prev) => ({ ...prev, photo: photoData }));
      stopCamera();
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
    }
    setIsCameraOpen(false);
  };

  const retakePhoto = () => {
    setFormData((prev) => ({ ...prev, photo: null }));
    startCamera();
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

            {/* LIVE WEBCAM MODULE */}
            <div className="w-full aspect-square bg-slate-50 border border-slate-200/60 rounded-2xl flex flex-col items-center justify-center text-center p-3 relative overflow-hidden">
              {formData.photo ? (
                <img
                  src={formData.photo}
                  alt="Captured Profile"
                  className="w-full h-full object-cover rounded-xl shadow-sm"
                />
              ) : isCameraOpen ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover rounded-xl transform scale-x-[-1]"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center relative mb-3">
                  <div className="w-24 h-24 rounded-full bg-blue-100/50 flex items-center justify-center text-3xl">
                    🪪
                  </div>
                </div>
              )}

              {/* Optional Camera Controls Overlay */}
              <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
                {!isCameraOpen && !formData.photo && (
                  <button
                    onClick={startCamera}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-4 py-2 rounded-lg shadow-md transition-all"
                  >
                    📷 Connect Dashcam
                  </button>
                )}
                {isCameraOpen && (
                  <div className="flex gap-2">
                    <button
                      onClick={capturePhoto}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold px-4 py-2 rounded-lg shadow-md transition-all"
                    >
                      📸 Capture Face
                    </button>
                    <button
                      onClick={stopCamera}
                      className="bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-bold px-4 py-2 rounded-lg shadow-md transition-all"
                    >
                      ✖ Cancel
                    </button>
                  </div>
                )}
                {formData.photo && (
                  <button
                    onClick={retakePhoto}
                    className="bg-slate-700 hover:bg-slate-800 text-white text-[11px] font-bold px-4 py-2 rounded-lg shadow-md transition-all"
                  >
                    🔄 Retake Photo
                  </button>
                )}
              </div>
            </div>

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

      {/* Hidden Canvas for Image Processing */}
      <canvas
        ref={canvasRef}
        width="300"
        height="300"
        className="hidden"
      ></canvas>
    </div>
  );
};

export default MembersPage;
