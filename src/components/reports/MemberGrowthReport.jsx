import React, { useState, useEffect, useCallback } from "react";
import ReportFilters from "./ReportFilters";
import ReportExportBar from "./ReportExportBar";
const windowElectron = window.require ? window.require("electron") : null;

const MemberGrowthReport = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ year: "", plan: "" });

  const fetchReport = useCallback((activeFilters) => {
    if (!windowElectron) return;
    setLoading(true);
    const payload = {};
    if (activeFilters.year) payload.year = activeFilters.year;
    if (activeFilters.plan) payload.plan = activeFilters.plan;
    windowElectron.ipcRenderer.send("get-report-member-growth", Object.keys(payload).length > 0 ? payload : undefined);
  }, []);

  useEffect(() => {
    if (!windowElectron) return;
    const handleResponse = (_e, arg) => {
      setLoading(false);
      if (arg.success) setData(arg.data || []);
    };
    windowElectron.ipcRenderer.on("get-report-member-growth-response", handleResponse);
    fetchReport(filters);
    return () => {
      windowElectron.ipcRenderer.removeListener("get-report-member-growth-response", handleResponse);
    };
  }, []);

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    fetchReport(newFilters);
  };

  const totalMembers = data.reduce((acc, r) => acc + r.count, 0);
  const maxCount = Math.max(...data.map((r) => r.count), 1);

  // Export data preparation
  const exportHeaders = ["Month", "New Members"];
  const exportRows = data.map((r) => [r.month, r.count]);
  exportRows.push(["TOTAL", totalMembers]);
  const summaryCards = [
    { label: "Total Members Registered", value: totalMembers },
    { label: "Months Tracked", value: data.length },
  ];

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
      {/* Filters & Export Bar */}
      <div className="flex flex-wrap items-start gap-3">
        <ReportFilters
          showYear
          showPlan
          filters={filters}
          onFilterChange={handleFilterChange}
        />
        <ReportExportBar
          title="Member Growth Report"
          subtitle={filters.year ? `Year: ${filters.year}` : "All Time"}
          headers={exportHeaders}
          rows={exportRows}
          summaryCards={summaryCards}
          csvFilename={`member-growth-${new Date().toISOString().split("T")[0]}.csv`}
          pdfFilename={`member-growth-${new Date().toISOString().split("T")[0]}.pdf`}
          disabled={data.length === 0}
        />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Members Registered</p>
          <h3 className="text-xl font-black text-slate-900 mt-1 font-mono">{totalMembers}</h3>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Months Tracked</p>
          <h3 className="text-xl font-black text-blue-600 mt-1 font-mono">{data.length}</h3>
        </div>
      </div>

      {/* Growth Chart (Bar-style using divs) */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">Monthly Registration Trend</h4>
        {data.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">No growth data available.</p>
        ) : (
          <div className="space-y-3">
            {data.map((row) => (
              <div key={row.month} className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-600 font-mono w-20 flex-shrink-0">{row.month}</span>
                <div className="flex-1 bg-slate-100 h-6 rounded-lg overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-lg flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${Math.max((row.count / maxCount) * 100, 8)}%` }}
                  >
                    <span className="text-[10px] font-black text-white">{row.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-[#F8FAFC]/60">
              <th className="py-3 px-5">Month</th>
              <th className="py-3 px-5">New Members</th>
              <th className="py-3 px-5">Cumulative</th>
            </tr>
          </thead>
          <tbody className="text-xs font-semibold divide-y divide-slate-100">
            {data.map((row, idx) => {
              const cumulative = data.slice(0, idx + 1).reduce((acc, r) => acc + r.count, 0);
              return (
                <tr key={row.month} className="hover:bg-slate-50/50">
                  <td className="py-3 px-5 font-bold text-slate-800 font-mono">{row.month}</td>
                  <td className="py-3 px-5 font-mono text-blue-600 font-bold">{row.count}</td>
                  <td className="py-3 px-5 font-mono text-slate-500">{cumulative}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MemberGrowthReport;
