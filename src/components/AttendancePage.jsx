import React, { useState, useEffect, useRef } from "react";
import useGymStore from "../store/gymStore";
import { useUI } from "../context/UIContext";
const windowElectron = window.require ? window.require("electron") : null;

const AttendancePage = () => {
  // Consume from centralized store
  const membersList = useGymStore((state) => state.members);
  const { showToast } = useUI();

  const [searchPhone, setSearchPhone] = useState("");
  const [scanResults, setScanResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [todayLog, setTodayLog] = useState([]);

  // History state
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().split("T")[0]);
  const [historyData, setHistoryData] = useState([]);
  const [historySearch, setHistorySearch] = useState("");

  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  const inputRef = useRef(null);
  const historyDateRef = useRef(historyDate);

  const fetchTodayAttendance = () => {
    if (windowElectron) windowElectron.ipcRenderer.send("get-today-attendance");
  };

  const fetchHistory = (date) => {
    if (windowElectron) windowElectron.ipcRenderer.send("get-attendance-history", date);
  };

  const handleHistoryDateChange = (e) => {
    const newDate = e.target.value;
    setHistoryDate(newDate);
    historyDateRef.current = newDate;
    fetchHistory(newDate);
  };

  useEffect(() => {
    if (!windowElectron) return;

    const handleMarkResponse = (_e, arg) => {
      if (arg.success) {
        showToastRef.current("Attendance marked successfully!", "success");
        fetchTodayAttendance();
        fetchHistory(historyDateRef.current);
      } else if (arg.duplicate) {
        showToastRef.current("Attendance already marked for today.", "warning");
      } else {
        showToastRef.current(arg.error || "Failed to mark attendance.", "error");
      }
    };

    const handleTodayResponse = (_e, arg) => {
      if (arg.success) setTodayLog(arg.data || []);
    };

    const handleHistoryResponse = (_e, arg) => {
      if (arg.success) setHistoryData(arg.data || []);
    };

    windowElectron.ipcRenderer.on("mark-attendance-response", handleMarkResponse);
    windowElectron.ipcRenderer.on("get-today-attendance-response", handleTodayResponse);
    windowElectron.ipcRenderer.on("get-attendance-history-response", handleHistoryResponse);

    fetchTodayAttendance();
    fetchHistory(new Date().toISOString().split("T")[0]);

    return () => {
      windowElectron.ipcRenderer.removeListener("mark-attendance-response", handleMarkResponse);
      windowElectron.ipcRenderer.removeListener("get-today-attendance-response", handleTodayResponse);
      windowElectron.ipcRenderer.removeListener("get-attendance-history-response", handleHistoryResponse);
    };
  }, []);

  const triggerMockScan = () => {
    const trimmedInput = searchPhone.trim();
    if (!trimmedInput)
      return showToast(
        "Please enter a mobile number to simulate the biometric trigger loop!",
        "warning",
      );

    setHasSearched(true);
    const matchedMembers = membersList.filter((m) => m.phone === trimmedInput);

    if (matchedMembers.length > 0) {
      const today = new Date();
      const parsedResults = matchedMembers.map((member) => {
        const expiry = new Date(member.expiryDate);
        const isExpired = today > expiry;
        let accessGranted = !isExpired && member.status === "Active";
        let gateMessage =
          member.status === "Frozen"
            ? "Access Denied: Account is Frozen! 🧊"
            : isExpired
              ? "Access Denied: Membership Expired! ❌"
              : "Access Granted: Welcome Active Member! 🎉";

        // Auto-mark attendance when access is granted
        if (accessGranted && windowElectron) {
          windowElectron.ipcRenderer.send("mark-attendance", {
            memberId: member.id,
            memberName: member.name,
            phone: member.phone,
          });
        }

        return {
          id: member.id,
          success: accessGranted,
          name: member.name,
          plan: member.plan,
          status: member.status,
          expiryDate: member.expiryDate,
          message: gateMessage,
        };
      });
      setScanResults(parsedResults);
    } else {
      setScanResults([]);
    }

    setSearchPhone("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const filteredHistory = historyData.filter((entry) => {
    if (!historySearch.trim()) return true;
    const term = historySearch.trim().toLowerCase();
    return entry.memberName.toLowerCase().includes(term) || entry.phone.includes(term);
  });

  return (
    <div className="p-8 space-y-6 bg-[#F8FAFC] min-h-screen font-sans text-slate-800">
      <div className="flex justify-between items-center bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl font-bold">
            🛂
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Biometric Attendance Interface
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Gateway validation system with real-time Frozen status
              synchronization.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4 h-fit">
          <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest">
            ⚙️ Device Terminal
          </h3>
          <div>
            <label className="text-xs text-slate-500 block mb-1.5 font-bold">
              Scan Card / Mobile Sequence
            </label>
            <input
              ref={inputRef}
              type="text"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && triggerMockScan()}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 font-mono focus:outline-none focus:border-blue-600 focus:bg-white"
              placeholder="Enter phone number..."
            />
          </div>
          <button
            onClick={triggerMockScan}
            className="w-full bg-blue-600 text-white font-bold text-sm py-3.5 rounded-xl shadow-md hover:bg-blue-700 transition-all uppercase tracking-wider"
          >
            Trigger Scanner Sensor Pulse
          </button>
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm lg:col-span-2 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
            Gate Authentication Result
          </h3>
          <div className="space-y-3 min-h-[250px] flex flex-col justify-start">
            {!hasSearched ? (
              <div className="flex-grow flex flex-col items-center justify-center text-slate-400 py-12 text-center">
                <span className="text-3xl mb-2 animate-pulse">📡</span>
                <p className="text-xs font-bold">
                  Waiting for scanner terminal sensor signal input...
                </p>
              </div>
            ) : scanResults.length === 0 ? (
              <div className="flex-grow flex flex-col items-center justify-center text-rose-500 py-12 text-center bg-rose-50/40 border border-dashed border-rose-200 rounded-xl">
                <span className="text-2xl mb-1">❌</span>
                <p className="text-sm font-black">
                  Access Denied: Record Missing!
                </p>
              </div>
            ) : (
              scanResults.map((result) => (
                <div
                  key={result.id}
                  className={`border rounded-xl p-5 flex justify-between items-center ${result.success ? "border-emerald-200 bg-emerald-50/30" : "border-rose-200 bg-rose-50/30"}`}
                >
                  <div>
                    <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                      {result.name}
                      <span
                        className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${result.success ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}
                      >
                        {result.status}
                      </span>
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 font-semibold">
                      Plan: {result.plan} •{" "}
                      <span className="font-mono">
                        Expiry: {result.expiryDate}
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-black ${result.success ? "text-emerald-600" : "text-rose-600"}`}
                    >
                      {result.success ? "ACCESS GRANTED" : "ACCESS DENIED"}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                      {result.message}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Today's Attendance Log */}
      <div className="bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest">
            📋 Today's Attendance ({todayLog.length})
          </h3>
          <span className="text-[10px] font-bold text-slate-400">
            {new Date().toISOString().split("T")[0]}
          </span>
        </div>
        {todayLog.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4 text-center">
            No attendance records for today yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
            {todayLog.map((entry) => (
              <div key={entry.id} className="flex justify-between items-center py-2.5">
                <div>
                  <p className="text-sm font-bold text-slate-800">{entry.memberName}</p>
                  <p className="text-[11px] font-mono text-slate-400">{entry.phone}</p>
                </div>
                <span className="text-[11px] font-bold text-slate-500 font-mono">
                  {new Date(entry.checkInTime).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attendance History */}
      <div className="bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest">
          📅 Attendance History
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="date"
            value={historyDate}
            onChange={handleHistoryDateChange}
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
          />
          <input
            type="text"
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>
        <p className="text-[11px] font-bold text-slate-400">
          Total Records: {filteredHistory.length}
        </p>
        {filteredHistory.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4 text-center">
            No attendance records found for this date.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto">
            {filteredHistory.map((entry) => (
              <div key={entry.id} className="flex justify-between items-center py-2.5">
                <div>
                  <p className="text-sm font-bold text-slate-800">{entry.memberName}</p>
                  <p className="text-[11px] font-mono text-slate-400">{entry.phone}</p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-bold text-slate-500 font-mono">
                    {new Date(entry.checkInTime).toLocaleTimeString()}
                  </span>
                  <p className="text-[10px] text-slate-400 font-mono">{entry.date}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendancePage;
