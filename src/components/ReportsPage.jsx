import React, { useState } from "react";
import PendingPaymentsReport from "./reports/PendingPaymentsReport";
import ExpiringMembersReport from "./reports/ExpiringMembersReport";
import AttendanceReport from "./reports/AttendanceReport";
import RevenueReport from "./reports/RevenueReport";
import MemberGrowthReport from "./reports/MemberGrowthReport";
import TrainerReport from "./reports/TrainerReport";
import ReportSummaryCards from "./reports/ReportSummaryCards";

const reportTabs = [
  { id: "pending", label: "Pending Payments", icon: "💰" },
  { id: "expiring", label: "Expiring Members", icon: "⏰" },
  { id: "attendance", label: "Attendance", icon: "📋" },
  { id: "revenue", label: "Revenue Snapshot", icon: "📈" },
  { id: "growth", label: "Member Growth", icon: "🌱" },
  { id: "trainer", label: "Trainer Load", icon: "🏋️" },
];

const ReportsPage = () => {
  const [activeReport, setActiveReport] = useState("pending");

  return (
    <div className="p-8 space-y-6 bg-[#F8FAFC] min-h-screen font-sans text-slate-800">
      {/* Header */}
      <div className="flex justify-between items-center bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl font-bold">
            📊
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Reports & Analytics
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Generate data reports and export as CSV, PDF, or print.
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <ReportSummaryCards />

      {/* Report Tab Selector */}
      <div className="flex flex-wrap gap-2">
        {reportTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveReport(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
              activeReport === tab.id
                ? "bg-blue-50 text-blue-600 border-blue-200 shadow-sm"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active Report Content */}
      <div>
        {activeReport === "pending" && <PendingPaymentsReport />}
        {activeReport === "expiring" && <ExpiringMembersReport />}
        {activeReport === "attendance" && <AttendanceReport />}
        {activeReport === "revenue" && <RevenueReport />}
        {activeReport === "growth" && <MemberGrowthReport />}
        {activeReport === "trainer" && <TrainerReport />}
      </div>
    </div>
  );
};

export default ReportsPage;
