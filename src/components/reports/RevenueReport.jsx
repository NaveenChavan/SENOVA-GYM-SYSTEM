import React, { useState, useEffect, useCallback } from "react";
import ReportFilters from "./ReportFilters";
import ReportExportBar from "./ReportExportBar";
const windowElectron = window.require ? window.require("electron") : null;

const RevenueReport = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ plan: "", year: "", month: "" });

  const fetchReport = useCallback((activeFilters) => {
    if (!windowElectron) return;
    setLoading(true);
    const payload = {};
    if (activeFilters.plan) payload.plan = activeFilters.plan;
    if (activeFilters.year) payload.year = activeFilters.year;
    if (activeFilters.month) payload.month = activeFilters.month;
    windowElectron.ipcRenderer.send("get-report-revenue-summary", Object.keys(payload).length > 0 ? payload : undefined);
  }, []);

  useEffect(() => {
    if (!windowElectron) return;
    const handleResponse = (_e, arg) => {
      setLoading(false);
      if (arg.success) setData(arg.data || []);
    };
    windowElectron.ipcRenderer.on("get-report-revenue-summary-response", handleResponse);
    fetchReport(filters);
    return () => {
      windowElectron.ipcRenderer.removeListener("get-report-revenue-summary-response", handleResponse);
    };
  }, []);

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    fetchReport(newFilters);
  };

  const totalRevenue = data.reduce((acc, r) => acc + Number(r.totalPaid || 0), 0);
  const totalPending = data.reduce((acc, r) => acc + Number(r.totalPending || 0), 0);
  const totalMembers = data.reduce((acc, r) => acc + Number(r.memberCount || 0), 0);
  const collectionRate = (totalRevenue + totalPending) > 0 ? Math.round((totalRevenue / (totalRevenue + totalPending)) * 100) : 0;

  // Export data preparation
  const exportHeaders = ["Plan", "Members", "Total Paid (₹)", "Total Pending (₹)"];
  const exportRows = data.map((r) => [r.plan || "No Plan", r.memberCount, r.totalPaid || 0, r.totalPending || 0]);
  exportRows.push(["TOTAL", totalMembers, totalRevenue, totalPending]);
  const summaryCards = [
    { label: "Total Revenue", value: `₹${totalRevenue}` },
    { label: "Total Pending", value: `₹${totalPending}` },
    { label: "Collection Rate", value: `${collectionRate}%` },
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
          showPlan
          showYear
          showMonth
          filters={filters}
          onFilterChange={handleFilterChange}
        />
        <ReportExportBar
          title="Revenue Snapshot"
          headers={exportHeaders}
          rows={exportRows}
          summaryCards={summaryCards}
          csvFilename={`revenue-snapshot-${new Date().toISOString().split("T")[0]}.csv`}
          pdfFilename={`revenue-snapshot-${new Date().toISOString().split("T")[0]}.pdf`}
          disabled={data.length === 0}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Revenue</p>
          <h3 className="text-xl font-black text-emerald-600 mt-1 font-mono">₹{totalRevenue}</h3>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Pending</p>
          <h3 className="text-xl font-black text-rose-500 mt-1 font-mono">₹{totalPending}</h3>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Collection Rate</p>
          <h3 className="text-xl font-black text-blue-600 mt-1 font-mono">{collectionRate}%</h3>
        </div>
      </div>

      {/* Revenue by Plan Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {data.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8 font-bold">No revenue data available.</p>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-[#F8FAFC]/60">
                <th className="py-3 px-5">Plan</th>
                <th className="py-3 px-5">Members</th>
                <th className="py-3 px-5">Revenue</th>
                <th className="py-3 px-5">Pending</th>
                <th className="py-3 px-5">Share</th>
              </tr>
            </thead>
            <tbody className="text-xs font-semibold divide-y divide-slate-100">
              {data.map((r, idx) => {
                const share = totalRevenue > 0 ? Math.round((Number(r.totalPaid || 0) / totalRevenue) * 100) : 0;
                return (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-3 px-5 font-bold text-slate-800">{r.plan || "No Plan"}</td>
                    <td className="py-3 px-5 font-mono text-slate-600">{r.memberCount}</td>
                    <td className="py-3 px-5 font-mono text-emerald-600 font-bold">₹{r.totalPaid || 0}</td>
                    <td className="py-3 px-5 font-mono text-rose-500">₹{r.totalPending || 0}</td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div className="bg-blue-600 h-full rounded-full" style={{ width: `${share}%` }}></div>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 font-mono">{share}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Total Row */}
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td className="py-3 px-5 font-black text-slate-900">TOTAL</td>
                <td className="py-3 px-5 font-mono font-black text-slate-900">{totalMembers}</td>
                <td className="py-3 px-5 font-mono font-black text-emerald-700">₹{totalRevenue}</td>
                <td className="py-3 px-5 font-mono font-black text-rose-600">₹{totalPending}</td>
                <td className="py-3 px-5 font-mono font-black text-blue-700">100%</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default RevenueReport;
