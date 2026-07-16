import React, { useState, useEffect } from "react";
const windowElectron = window.require ? window.require("electron") : null;

const getLocalDate = (date) => {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const AttendanceReport = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(getLocalDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [endDate, setEndDate] = useState(getLocalDate());

  const fetchReport = () => {
    if (!windowElectron) return;
    setLoading(true);
    windowElectron.ipcRenderer.send("get-report-attendance-range", { startDate, endDate });
  };

  useEffect(() => {
    if (!windowElectron) return;
    const handleResponse = (_e, arg) => {
      setLoading(false);
      if (arg.success) setData(arg.data || []);
    };
    windowElectron.ipcRenderer.on("get-report-attendance-range-response", handleResponse);
    fetchReport();
    return () => {
      windowElectron.ipcRenderer.removeListener("get-report-attendance-range-response", handleResponse);
    };
  }, []);

  // Group by date for summary
  const dateGroups = data.reduce((acc, entry) => {
    acc[entry.date] = (acc[entry.date] || 0) + 1;
    return acc;
  }, {});
  const uniqueDates = Object.keys(dateGroups).sort().reverse();
  const avgPerDay = uniqueDates.length > 0 ? Math.round(data.length / uniqueDates.length) : 0;

  const handleExport = () => {
    if (!windowElectron || data.length === 0) return;
    const headers = ["Date", "Member Name", "Phone", "Check-in Time"];
    const rows = data.map((a) => [a.date, a.memberName, a.phone, new Date(a.checkInTime).toLocaleTimeString()]);
    windowElectron.ipcRenderer.send("export-report-csv", {
      headers,
      rows,
      defaultFilename: `attendance-${startDate}-to-${endDate}.csv`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
          <span className="text-xs font-bold text-slate-500">From:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold font-mono"
          />
          <span className="text-xs font-bold text-slate-500">To:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold font-mono"
          />
          <button
            onClick={fetchReport}
            className="bg-slate-900 text-white text-xs font-bold px-4 py-1.5 rounded-lg hover:bg-slate-800 transition-all"
          >
            Generate
          </button>
        </div>
        <button
          onClick={handleExport}
          disabled={data.length === 0}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all"
        >
          📥 Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Check-ins</p>
          <h3 className="text-xl font-black text-slate-900 mt-1 font-mono">{data.length}</h3>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Days Covered</p>
          <h3 className="text-xl font-black text-blue-600 mt-1 font-mono">{uniqueDates.length}</h3>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg per Day</p>
          <h3 className="text-xl font-black text-emerald-600 mt-1 font-mono">{avgPerDay}</h3>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <div className="w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-400 mt-3 font-bold">Loading report...</p>
        </div>
      ) : (
        <>
          {/* Daily Breakdown */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-3">
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">Daily Breakdown</h4>
            {uniqueDates.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No attendance data for this range.</p>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {uniqueDates.map((date) => (
                  <div key={date} className="flex justify-between items-center bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5">
                    <span className="text-xs font-bold text-slate-700 font-mono">{date}</span>
                    <span className="text-xs font-black text-blue-600 font-mono">{dateGroups[date]} check-ins</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Full Records Table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {data.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8 font-bold">No attendance records found.</p>
            ) : (
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-[#F8FAFC]">
                    <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      <th className="py-3 px-5">Date</th>
                      <th className="py-3 px-5">Member</th>
                      <th className="py-3 px-5">Phone</th>
                      <th className="py-3 px-5">Time</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs font-semibold divide-y divide-slate-100">
                    {data.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-5 font-mono text-slate-500">{a.date}</td>
                        <td className="py-2.5 px-5 font-bold text-slate-800">{a.memberName}</td>
                        <td className="py-2.5 px-5 font-mono text-slate-500">{a.phone}</td>
                        <td className="py-2.5 px-5 font-mono text-slate-500">{new Date(a.checkInTime).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AttendanceReport;
