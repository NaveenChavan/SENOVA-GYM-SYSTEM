import React, { useState } from "react";
import { useUI } from "../context/UIContext";
const windowElectron = window.require ? window.require("electron") : null;

const OnboardingWizard = ({ onWizardComplete }) => {
  const [step, setStep] = useState("GOOGLE_LOGIN");
  const [gymForm, setGymForm] = useState({
    gymName: "",
    gymPhone: "",
    trainerName: "",
    location: "",
  });
  const [includeWebsite, setIncludeWebsite] = useState(false); // Addon state selector
  const { showToast } = useUI();

  const simulateGoogleLogin = () => {
    if (windowElectron) {
      windowElectron.ipcRenderer.send("auth-login-success", {
        email: "founder@senova.in",
      });
      setStep("MANDATORY_SETUP");
    }
  };

  const handleSaveSetup = () => {
    if (
      !gymForm.gymName.trim() ||
      !gymForm.gymPhone.trim() ||
      !gymForm.trainerName.trim() ||
      !gymForm.location.trim()
    ) {
      showToast("All workspace parameters are strictly mandatory!", "error");
      return;
    }
    setStep("SUBSCRIPTION_GATE");
  };

  const selectSubscription = (planName, totalLicenseValue) => {
    if (windowElectron) {
      windowElectron.ipcRenderer.send("save-settings", {
        gymName: gymForm.gymName,
        gymPhone: gymForm.gymPhone,
        trainerName: gymForm.trainerName,
        location: gymForm.location,
        gymPlans: ["Monthly", "3 Months", "6 Months", "1 Year"],
        activatedLicense: planName,
        websiteAddonActive: includeWebsite,
        totalInvoicePaid: totalLicenseValue,
      });

      windowElectron.ipcRenderer.send("activate-subscription", planName);
      windowElectron.ipcRenderer.once("activate-subscription-response", () => {
        showToast(`SENOVA Core License Activated: ${planName}. Deployment Ready!`, "success");
        onWizardComplete();
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center font-sans p-6 text-slate-800 select-none">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-3xl p-8 shadow-xl space-y-6">
        {/* TOP PANEL BRANDING */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center font-black text-white text-xl shadow-lg shadow-blue-600/20">
            S
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            SENOVA Software Deployment Center
          </h1>
          <p className="text-xs text-slate-400">
            Branded Product Ecosystem Framework v2.6
          </p>
        </div>

        {/* STEP 1: GOOGLE INITIAL GATE */}
        {step === "GOOGLE_LOGIN" && (
          <div className="space-y-4 py-4 text-center">
            <p className="text-sm text-slate-600 font-medium">
              Link your business workspace Google profile accounts to pull cloud
              configuration charts securely.
            </p>
            <button
              onClick={simulateGoogleLogin}
              className="w-full bg-white border border-slate-200 text-slate-700 font-bold text-sm py-3 px-4 rounded-xl shadow-sm hover:bg-slate-50 transition-all flex items-center justify-center gap-3"
            >
              <span className="text-base">🌐</span> Sign in via Google Gateway
              Sec
            </button>
          </div>
        )}

        {/* STEP 2: SETUP PROFILE METRICS */}
        {step === "MANDATORY_SETUP" && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider border-b border-slate-100 pb-2">
              Configure Station Identity
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-semibold">
                  Gym Master Branding Name *
                </label>
                <input
                  type="text"
                  value={gymForm.gymName}
                  onChange={(e) =>
                    setGymForm({ ...gymForm, gymName: e.target.value })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-600 transition-all"
                  placeholder="e.g. MF Fitness Club"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-semibold">
                  WhatsApp Gateway Primary Phone *
                </label>
                <input
                  type="tel"
                  value={gymForm.gymPhone}
                  onChange={(e) =>
                    setGymForm({ ...gymForm, gymPhone: e.target.value })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-600 transition-all"
                  placeholder="9731133425"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-semibold">
                  Head Trainer Full Identity *
                </label>
                <input
                  type="text"
                  value={gymForm.trainerName}
                  onChange={(e) =>
                    setGymForm({ ...gymForm, trainerName: e.target.value })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-600 transition-all"
                  placeholder="e.g. SHAKEEL"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-semibold">
                  Physical Location Address *
                </label>
                <input
                  type="text"
                  value={gymForm.location}
                  onChange={(e) =>
                    setGymForm({ ...gymForm, location: e.target.value })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-600 transition-all"
                  placeholder="RAICHUR"
                />
              </div>
            </div>
            <button
              onClick={handleSaveSetup}
              className="w-full bg-blue-600 text-white font-bold text-sm py-3.5 rounded-xl hover:bg-blue-700 transition-all uppercase tracking-wider mt-2"
            >
              Lock Configuration Tree
            </button>
          </div>
        )}

        {/* STEP 3: REVENUE TIER CONSOLE MATRIX */}
        {step === "SUBSCRIPTION_GATE" && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider border-b border-slate-100 pb-2 text-center">
              Select Your Operational License
            </h3>

            {/* CROSS-SELL COMPONENT: Dynamic Website Addon Selector Switch */}
            <div className="bg-blue-50/60 border border-blue-100 p-4 rounded-2xl flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <span>🚀 Add Premium Gym Website Portfolio</span>
                  <span className="bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase">
                    SENOVA Special
                  </span>
                </h4>
                <p className="text-[10px] text-slate-500 max-w-[340px]">
                  Get a dedicated custom deployment domain. Drive automatic
                  local client leads for just **+₹5,000** extra flat.
                </p>
              </div>
              <input
                type="checkbox"
                checked={includeWebsite}
                onChange={(e) => setIncludeWebsite(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div
                onClick={() => selectSubscription("1_MONTH_TRIAL", 0)}
                className="border border-slate-200 rounded-xl p-4 cursor-pointer hover:border-blue-500 hover:bg-slate-50/50 transition-all"
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm text-slate-900">
                    Evaluation Free Trial
                  </span>
                  <span className="text-xs font-extrabold text-blue-600">
                    30 Days Trial
                  </span>
                </div>
              </div>

              <div
                onClick={() =>
                  selectSubscription("MONTHLY", includeWebsite ? 5700 : 700)
                }
                className="border border-slate-200 rounded-xl p-4 cursor-pointer hover:border-blue-500 hover:bg-slate-50/50 transition-all"
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm text-slate-900">
                    Standard Monthly Plan
                  </span>
                  <span className="text-xs font-bold text-slate-900">
                    ₹700 / mo {includeWebsite && "+ Website"}
                  </span>
                </div>
              </div>

              {/* UPGRADED ANNUALLY STRIP CONTAINER */}
              <div
                onClick={() =>
                  selectSubscription(
                    "ANNUAL_PLAN",
                    includeWebsite ? 12000 : 7000,
                  )
                }
                className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                  includeWebsite
                    ? "border-orange-500 bg-orange-50/10"
                    : "border-blue-600 bg-blue-50/10"
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-black text-slate-900 text-sm">
                      Professional Annual Subscription
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Core System License Duration: 1 Full Year
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-slate-900 block">
                      ₹7,000 / yr
                    </span>
                    {includeWebsite && (
                      <span className="text-[10px] text-orange-600 font-extrabold block mt-0.5">
                        + ₹5,000 Web Portfolio
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingWizard;
