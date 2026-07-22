import React, { useState, useEffect } from "react";
const windowElectron = window.electron || null;

const ReportSummaryCards = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!windowElectron) return;
    const handleResponse = (_e, arg) => {
      setLoading(false);
      if (arg.success) setSummary(arg.data);
    };
    windowElectron.ipcRenderer.on("get-report-summary-response", handleResponse);
    windowElectron.ipcRenderer.send("get-report-summary");
    return () => {
      windowElectron.ipcRenderer.removeListener("get-report-summary-response", handleResponse);
    };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm animate-pulse">
            <div className="h-2 bg-slate-200 rounded w-16 mb-2"></div>
            <div className="h-5 bg-slate-100 rounded w-12"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const cards = [
    { label: "Total Revenue", value: `₹${summary.totalRevenue || 0}`, color: "text-emerald-600", bg: "bg-emerald-50", icon: "💰" },
    { label: "Pending Amount", value: `₹${summary.totalPending || 0}`, color: "text-rose-500", bg: "bg-rose-50", icon: "⚠️" },
    { label: "Active Members", value: summary.activeMembers || 0, color: "text-blue-600", bg: "bg-blue-50", icon: "👥" },
    { label: "Expiring (7 Days)", value: summary.expiringMembers || 0, color: "text-amber-500", bg: "bg-amber-50", icon: "⏰" },
    { label: "Today's Attendance", value: summary.todayAttendance || 0, color: "text-purple-600", bg: "bg-purple-50", icon: "📋" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-6 h-6 ${card.bg} rounded-lg flex items-center justify-center text-xs`}>{card.icon}</span>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-tight">{card.label}</p>
          </div>
          <h3 className={`text-lg font-black ${card.color} mt-1 font-mono`}>{card.value}</h3>
        </div>
      ))}
    </div>
  );
};

export default ReportSummaryCards;
