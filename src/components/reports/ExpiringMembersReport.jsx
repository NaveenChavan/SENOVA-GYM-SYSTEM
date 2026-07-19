import React, { useState, useEffect, useCallback } from "react";
import ReportFilters from "./ReportFilters";
import ReportExportBar from "./ReportExportBar";
const windowElectron = window.require ? window.require("electron") : null;

const ExpiringMembersReport = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [daysFilter, setDaysFilter] = useState(7);
  const [filters, setFilters] = useState({ plan: "", trainer: "" });

  const fetchReport = useCallback((days, activeFilters) => {
    if (!windowElectron) return;
    setLoading(true);
    const payload = { days };
    if (activeFilters.plan) payload.plan = activeFilters.plan;
    if (activeFilters.trainer) payload.trainer = activeFilters.trainer;
    windowElectron.ipcRenderer.send("get-report-expiring-members", payload);
  }, []);

  useEffect(() => {
    if (!windowElectron) return;
    const handleResponse = (_e, arg) => {
      setLoading(false);
      if (arg.success) setData(arg.data || []);
    };
    windowElectron.ipcRenderer.on("get-report-expiring-members-response", handleResponse);
    fetchReport(daysFilter, filters);
    return () => {
      windowElectron.ipcRenderer.removeListener("get-report-expiring-members-response", handleResponse);
    };
  }, []);

  const handleDaysChange = (days) => {
    setDaysFilter(days);
    fetchReport(days, filters);
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    fetchReport(daysFilter, newFilters);
  };

  // Export data preparation
  const exportHeaders = ["Name", "Phone", "Plan", "Expiry Date", "Days Left"];
  const exportRows = data.map((m) => {
    const daysLeft = Math.ceil((new Date(m.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
    return [m.name, m.phone, m.plan, m.expiryDate, daysLeft];
  });
  const summaryCards = [{ label: "Members Expiring", value: data.length }];

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <div className="w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-xs text-slate-400 mt-3 font-bold">Loading report...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls Row */}
      <div className="flex flex-wrap items-start gap-3">
        {/* Days Selector */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
          <span className="text-xs font-bold text-slate-500">Expiring within:</span>
          {[7, 15, 30].map((d) => (
            <button
              key={d}
              onClick={() => handleDaysChange(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                daysFilter === d
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {d} Days
            </button>
          ))}
        </div>
        <ReportFilters
          showPlan
          showTrainer
          filters={filters}
          onFilterChange={handleFilterChange}
        />
      </div>

      {/* Export Bar */}
      <ReportExportBar
        title="Expiring Members Report"
        subtitle={`Members expiring within ${daysFilter} days`}
        headers={exportHeaders}
        rows={exportRows}
        summaryCards={summaryCards}
        csvFilename={`expiring-members-${daysFilter}days-${new Date().toISOString().split("T")[0]}.csv`}
        pdfFilename={`expiring-members-${daysFilter}days-${new Date().toISOString().split("T")[0]}.pdf`}
        disabled={data.length === 0}
      />

      {/* Summary */}
      <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm inline-block">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Members Expiring</p>
        <h3 className="text-xl font-black text-amber-500 mt-1 font-mono">{data.length}</h3>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {data.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8 font-bold">No members expiring within {daysFilter} days.</p>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-[#F8FAFC]/60">
                <th className="py-3 px-5">Name</th>
                <th className="py-3 px-5">Phone</th>
                <th className="py-3 px-5">Plan</th>
                <th className="py-3 px-5">Expiry Date</th>
                <th className="py-3 px-5">Days Left</th>
              </tr>
            </thead>
            <tbody className="text-xs font-semibold divide-y divide-slate-100">
              {data.map((m) => {
                const daysLeft = Math.ceil((new Date(m.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
                return (
                  <tr key={m.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-5 font-bold text-slate-800">{m.name}</td>
                    <td className="py-3 px-5 font-mono text-slate-500">{m.phone}</td>
                    <td className="py-3 px-5 text-slate-600">{m.plan}</td>
                    <td className="py-3 px-5 font-mono text-slate-500">{m.expiryDate}</td>
                    <td className={`py-3 px-5 font-mono font-black ${daysLeft <= 3 ? "text-rose-500" : "text-amber-500"}`}>
                      {daysLeft} days
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ExpiringMembersReport;
