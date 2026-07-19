import React, { useState, useEffect } from "react";
import ReportExportBar from "./ReportExportBar";
const windowElectron = window.require ? window.require("electron") : null;

const TrainerReport = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!windowElectron) return;
    const handleResponse = (_e, arg) => {
      setLoading(false);
      if (arg.success) setData(arg.data || []);
    };
    windowElectron.ipcRenderer.on("get-report-trainer-load-response", handleResponse);
    windowElectron.ipcRenderer.send("get-report-trainer-load");
    return () => {
      windowElectron.ipcRenderer.removeListener("get-report-trainer-load-response", handleResponse);
    };
  }, []);

  const totalClients = data.reduce((acc, t) => acc + t.activeClients, 0);
  const maxClients = Math.max(...data.map((t) => t.activeClients), 1);

  // Export data preparation
  const exportHeaders = ["Trainer Name", "Specialization", "Phone", "Active Clients"];
  const exportRows = data.map((t) => [t.name, t.specialization, t.phone, t.activeClients]);
  const summaryCards = [
    { label: "Total Trainers", value: data.length },
    { label: "Total Assigned Clients", value: totalClients },
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
      {/* Export Bar */}
      <ReportExportBar
        title="Trainer Load Report"
        headers={exportHeaders}
        rows={exportRows}
        summaryCards={summaryCards}
        csvFilename={`trainer-load-${new Date().toISOString().split("T")[0]}.csv`}
        pdfFilename={`trainer-load-${new Date().toISOString().split("T")[0]}.pdf`}
        disabled={data.length === 0}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Trainers</p>
          <h3 className="text-xl font-black text-slate-900 mt-1 font-mono">{data.length}</h3>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Assigned Clients</p>
          <h3 className="text-xl font-black text-blue-600 mt-1 font-mono">{totalClients}</h3>
        </div>
      </div>

      {/* Load Distribution Visual */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">Client Distribution</h4>
        {data.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">No trainers registered.</p>
        ) : (
          <div className="space-y-3">
            {data.map((t) => (
              <div key={t.id} className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-700 w-32 flex-shrink-0 truncate">{t.name}</span>
                <div className="flex-1 bg-slate-100 h-6 rounded-lg overflow-hidden">
                  <div
                    className="bg-purple-500 h-full rounded-lg flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${t.activeClients > 0 ? Math.max((t.activeClients / maxClients) * 100, 12) : 0}%` }}
                  >
                    {t.activeClients > 0 && (
                      <span className="text-[10px] font-black text-white">{t.activeClients}</span>
                    )}
                  </div>
                </div>
                {t.activeClients === 0 && (
                  <span className="text-[10px] font-bold text-slate-400">0</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {data.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8 font-bold">No trainer data available.</p>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-[#F8FAFC]/60">
                <th className="py-3 px-5">Trainer</th>
                <th className="py-3 px-5">Specialization</th>
                <th className="py-3 px-5">Phone</th>
                <th className="py-3 px-5">Active Clients</th>
                <th className="py-3 px-5">Load Status</th>
              </tr>
            </thead>
            <tbody className="text-xs font-semibold divide-y divide-slate-100">
              {data.map((t) => {
                let loadStatus = "Low";
                let loadColor = "text-emerald-600 bg-emerald-50 border-emerald-100";
                if (t.activeClients >= 10) { loadStatus = "High"; loadColor = "text-rose-600 bg-rose-50 border-rose-100"; }
                else if (t.activeClients >= 5) { loadStatus = "Medium"; loadColor = "text-amber-600 bg-amber-50 border-amber-100"; }
                return (
                  <tr key={t.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-5 font-bold text-slate-800">{t.name}</td>
                    <td className="py-3 px-5 text-slate-600">{t.specialization}</td>
                    <td className="py-3 px-5 font-mono text-slate-500">{t.phone}</td>
                    <td className="py-3 px-5 font-mono font-bold text-blue-600">{t.activeClients}</td>
                    <td className="py-3 px-5">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${loadColor}`}>
                        {loadStatus}
                      </span>
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

export default TrainerReport;
