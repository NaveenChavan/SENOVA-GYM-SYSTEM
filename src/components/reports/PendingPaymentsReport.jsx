import React, { useState, useEffect, useCallback } from "react";
import ReportFilters from "./ReportFilters";
import ReportExportBar from "./ReportExportBar";
const windowElectron = window.require ? window.require("electron") : null;

const PendingPaymentsReport = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ plan: "", trainer: "", status: "" });

  const fetchReport = useCallback((activeFilters) => {
    if (!windowElectron) return;
    setLoading(true);
    const payload = {};
    if (activeFilters.plan) payload.plan = activeFilters.plan;
    if (activeFilters.trainer) payload.trainer = activeFilters.trainer;
    if (activeFilters.status) payload.status = activeFilters.status;
    windowElectron.ipcRenderer.send("get-report-pending-payments", Object.keys(payload).length > 0 ? payload : undefined);
  }, []);

  useEffect(() => {
    if (!windowElectron) return;
    const handleResponse = (_e, arg) => {
      setLoading(false);
      if (arg.success) setData(arg.data || []);
    };
    windowElectron.ipcRenderer.on("get-report-pending-payments-response", handleResponse);
    fetchReport(filters);
    return () => {
      windowElectron.ipcRenderer.removeListener("get-report-pending-payments-response", handleResponse);
    };
  }, []);

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    fetchReport(newFilters);
  };

  const totalPending = data.reduce((acc, m) => acc + Number(m.amountPending || 0), 0);

  // Export data preparation
  const exportHeaders = ["Name", "Phone", "Plan", "Amount Paid", "Amount Pending", "Expiry Date", "Status"];
  const exportRows = data.map((m) => [m.name, m.phone, m.plan, m.amountPaid, m.amountPending, m.expiryDate, m.status]);
  const summaryCards = [
    { label: "Members with Dues", value: data.length },
    { label: "Total Pending", value: `₹${totalPending}` },
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
          showTrainer
          showStatus
          filters={filters}
          onFilterChange={handleFilterChange}
        />
        <ReportExportBar
          title="Pending Payments Report"
          headers={exportHeaders}
          rows={exportRows}
          summaryCards={summaryCards}
          csvFilename={`pending-payments-${new Date().toISOString().split("T")[0]}.csv`}
          pdfFilename={`pending-payments-${new Date().toISOString().split("T")[0]}.pdf`}
          disabled={data.length === 0}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Members with Dues</p>
          <h3 className="text-xl font-black text-slate-900 mt-1 font-mono">{data.length}</h3>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Pending</p>
          <h3 className="text-xl font-black text-rose-500 mt-1 font-mono">₹{totalPending}</h3>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {data.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8 font-bold">No pending payments found.</p>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-[#F8FAFC]/60">
                <th className="py-3 px-5">Name</th>
                <th className="py-3 px-5">Phone</th>
                <th className="py-3 px-5">Plan</th>
                <th className="py-3 px-5">Paid</th>
                <th className="py-3 px-5">Pending</th>
                <th className="py-3 px-5">Expiry</th>
              </tr>
            </thead>
            <tbody className="text-xs font-semibold divide-y divide-slate-100">
              {data.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-5 font-bold text-slate-800">{m.name}</td>
                  <td className="py-3 px-5 font-mono text-slate-500">{m.phone}</td>
                  <td className="py-3 px-5 text-slate-600">{m.plan}</td>
                  <td className="py-3 px-5 font-mono text-emerald-600">₹{m.amountPaid || 0}</td>
                  <td className="py-3 px-5 font-mono text-rose-500 font-black">₹{m.amountPending}</td>
                  <td className="py-3 px-5 font-mono text-slate-500">{m.expiryDate || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PendingPaymentsReport;
