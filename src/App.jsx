import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import OverviewGrid from "./components/OverviewGrid";
import MembersPage from "./components/MembersPage";
import MembersList from "./components/MembersList";
import WhatsAppHistory from "./components/WhatsAppHistory";
import SettingsPage from "./components/SettingsPage";
import TrainerDashboard from "./components/TrainerDashboard";
import AttendancePage from "./components/AttendancePage";
import ReportsPage from "./components/ReportsPage";
import OnboardingWizard from "./components/OnboardingWizard";
import useGymStore from "./store/gymStore";
import { UIProvider } from "./context/UIContext";

function App() {
  const [activeTab, setActiveTab] = useState("members");
  const [isInitialized, setIsInitialized] = useState(false);

  // Subscribe to store
  const settings = useGymStore((state) => state.settings);
  const initializeListeners = useGymStore((state) => state.initializeListeners);
  const refreshAll = useGymStore((state) => state.refreshAll);

  // Initialize IPC listeners once on app mount
  useEffect(() => {
    initializeListeners();
  }, [initializeListeners]);

  // Check if gym is already set up (controls onboarding wizard)
  useEffect(() => {
    if (settings && settings.gymName) {
      setIsInitialized(true);
    }
  }, [settings]);

  // If the owner hasn't completed Google Login + Form + Plan Selection, block the workspace dashboard entirely
  if (!isInitialized) {
    return <UIProvider><OnboardingWizard onWizardComplete={() => { setIsInitialized(true); refreshAll(); }} /></UIProvider>;
  }

  return (
    <UIProvider>
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 antialiased font-sans">
      {/* Dynamic Deep Navy Side-Bar Layer */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="pl-64 min-h-screen bg-[#F8FAFC]">
        {activeTab === "members" && <MembersPage />}

        {activeTab === "membersList" && <MembersList />}

        {activeTab === "trainer" && <TrainerDashboard />}

        {activeTab === "attendance" && <AttendancePage />}

        {activeTab === "analysis" && <OverviewGrid />}

        {activeTab === "reports" && <ReportsPage />}

        {activeTab === "whatsapp" && <WhatsAppHistory />}

        {activeTab === "settings" && <SettingsPage />}
      </div>
    </div>
    </UIProvider>
  );
}

export default App;
