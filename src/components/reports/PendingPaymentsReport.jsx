import React, { useState, useEffect } from "react";
const windowElectron = window.require ? window.require("electron") : null;

const PendingPaymentsReport = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!windowElectron) return;
    const handleResponse = (_e, arg) => {
      setLoading(false);
      if (arg.success) setData(arg.data || []);
    };
    windowElectron.ipcRenderer.on("get-report-pending-payments-response", handleResponse);
    windowElectron.ipcRenderer.send("get-report-pending-payments");
    return () => {
      windowElectron.ipcRenderer.removeListener("get-report-pending-payments-response", handleResponse);
    };
  }, []);

  const totalPending = data.reduce((acc, m) => acc + Number(m.amountPending || 0), 0);

  const handleExport = () => {
    if (!windowElectron || data.length === 0) return;
    const headers = ["Name", "Phone", "Plan", "Amount Paid", "Amount Pending", "Expiry Date", "Status"];
    const rows = data.map((m) => [m.name, m.phone, m.plan, m.amountPaid, m.amountPending, m.expiryDate, m.status]);
    windowElectron.ipcRenderer.send("export-report-csv", {
      headers,
      rows,
      defaultFilename: `pending-payments-${new Date().toISOString().split("T")[0]}.csv`,
    });
  };

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
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Members with Dues</p>
          <h3 className="text-xl font-black text-slate-900 mt-1 font-mono">{data.length}</h3>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Pending</p>
          <h3 className="text-xl font-black text-rose-500 mt-1 font-mono">₹{totalPending}</h3>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex items-center justify-center">
          <button
            onClick={handleExport}
            disabled={data.length === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all"
          >
            📥 Export CSV
          </button>
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
