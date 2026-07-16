import React from "react";

const Sidebar = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    {
      id: "members",
      label: "Register Member",
      subLabel: "Member Onboarding",
      icon: "👤",
    },
    {
      id: "membersList",
      label: "Members Directory",
      subLabel: "View All Members",
      icon: "📇",
    },
    {
      id: "trainer",
      label: "Trainer Dashboard",
      subLabel: "Trainer Management",
      icon: "🏋️‍♂️",
    },
    {
      id: "attendance",
      label: "Attendance Gate",
      subLabel: "Check-in System",
      icon: "🛃",
    },
    {
      id: "analysis",
      label: "Analysis & Reports",
      subLabel: "Performance Analytics",
      icon: "📊",
    },
    {
      id: "reports",
      label: "Reports & Export",
      subLabel: "Generate CSV Reports",
      icon: "📑",
    },
    {
      id: "whatsapp",
      label: "WhatsApp History",
      subLabel: "Communication Logs",
      icon: "💬",
    },
    {
      id: "settings",
      label: "App Setup",
      subLabel: "System Configuration",
      icon: "⚙️",
    },
  ];

  return (
    <div className="w-64 h-screen bg-white border-r border-slate-200/80 flex flex-col justify-between p-4 fixed left-0 top-0 select-none font-sans text-slate-700 shadow-sm">
      <div className="space-y-6">
        {/* BRANDING: SENOVA Digital Labs Header Block */}
        <div className="flex flex-col space-y-1 px-3 py-4 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center font-black text-white text-base shadow-md shadow-blue-600/20">
              SD
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 tracking-tight leading-tight">
                SENOVA Digital Labs
              </h2>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wide">
                Core System Provider
              </p>
            </div>
          </div>
        </div>

        {/* NAVIGATION MENUS LINKS */}
        <nav className="space-y-1 px-1">
          {menuItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl transition-all relative border ${
                  isActive
                    ? "bg-blue-50/50 text-blue-600 border-blue-100 shadow-sm font-bold"
                    : "text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                {/* Active Indicator Border Line */}
                {isActive && (
                  <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-600 rounded-r-md"></div>
                )}

                {/* Icon Wrapper Matrix */}
                <span
                  className={`text-base flex-shrink-0 ${isActive ? "text-blue-600" : "text-slate-400"}`}
                >
                  {item.icon}
                </span>

                {/* Double Text Mapping Structure */}
                <div className="text-left leading-tight">
                  <p
                    className={`text-xs ${isActive ? "font-black text-blue-600" : "font-bold text-slate-700"}`}
                  >
                    {item.label}
                  </p>
                  <p className="text-[9px] text-slate-400 font-medium mt-0.5">
                    {item.subLabel}
                  </p>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* FOOTER LICENSING METRICS STRIP */}
      <div className="px-1">
        <div className="bg-slate-50 border border-slate-200/60 p-3 rounded-2xl flex items-center justify-between shadow-sm cursor-pointer hover:bg-slate-100/70 transition-all">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-emerald-100 border border-emerald-200 text-emerald-600 rounded-full flex items-center justify-center text-xs">
              ✓
            </div>
            <div className="text-left">
              <p className="text-[10px] font-bold text-slate-700">
                Active Engine
              </p>
              <p className="text-[9px] text-emerald-600 font-black tracking-wide uppercase">
                License Verified
              </p>
            </div>
          </div>
          <span className="text-slate-300 text-xs font-bold font-mono">›</span>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
