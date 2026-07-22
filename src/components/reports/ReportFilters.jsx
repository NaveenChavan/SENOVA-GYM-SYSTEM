import React, { useState, useEffect } from "react";
const windowElectron = window.electron || null;

/**
 * ReportFilters — Reusable filter bar for reports.
 * 
 * @param {Object} props
 * @param {boolean} [props.showDateRange] - Show date range (From/To) inputs
 * @param {boolean} [props.showMonth] - Show month dropdown
 * @param {boolean} [props.showYear] - Show year dropdown
 * @param {boolean} [props.showPlan] - Show membership plan filter
 * @param {boolean} [props.showTrainer] - Show trainer filter
 * @param {boolean} [props.showStatus] - Show status filter (Active/Expired)
 * @param {Object} props.filters - Current filter values from parent
 * @param {Function} props.onFilterChange - Callback when any filter changes
 * @param {Function} [props.onApply] - Optional explicit apply button callback
 */
const ReportFilters = ({
  showDateRange = false,
  showMonth = false,
  showYear = false,
  showPlan = false,
  showTrainer = false,
  showStatus = false,
  filters = {},
  onFilterChange,
  onApply,
}) => {
  const [trainers, setTrainers] = useState([]);
  const [plans, setPlans] = useState([]);

  // Fetch trainers and plans for dropdown options
  useEffect(() => {
    if (!windowElectron) return;

    if (showTrainer) {
      const handleTrainers = (_e, arg) => {
        if (arg.success) setTrainers(arg.data || []);
      };
      windowElectron.ipcRenderer.on("get-trainers-response", handleTrainers);
      windowElectron.ipcRenderer.send("get-trainers");
      return () => {
        windowElectron.ipcRenderer.removeListener("get-trainers-response", handleTrainers);
      };
    }
  }, [showTrainer]);

  useEffect(() => {
    if (!windowElectron || !showPlan) return;
    // Fetch distinct plans from members
    const handlePlans = (_e, arg) => {
      if (arg.success) {
        const uniquePlans = [...new Set((arg.data || []).map((m) => m.plan).filter(Boolean))];
        setPlans(uniquePlans);
      }
    };
    windowElectron.ipcRenderer.on("get-members-response", handlePlans);
    windowElectron.ipcRenderer.send("get-members");
    return () => {
      windowElectron.ipcRenderer.removeListener("get-members-response", handlePlans);
    };
  }, [showPlan]);

  const handleChange = (key, value) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const handleClear = () => {
    const cleared = {};
    if (showDateRange) { cleared.startDate = ""; cleared.endDate = ""; }
    if (showMonth) cleared.month = "";
    if (showYear) cleared.year = "";
    if (showPlan) cleared.plan = "";
    if (showTrainer) cleared.trainer = "";
    if (showStatus) cleared.status = "";
    onFilterChange(cleared);
  };

  // Generate year options (current year back to 5 years ago)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  const months = [
    { value: "01", label: "January" }, { value: "02", label: "February" },
    { value: "03", label: "March" }, { value: "04", label: "April" },
    { value: "05", label: "May" }, { value: "06", label: "June" },
    { value: "07", label: "July" }, { value: "08", label: "August" },
    { value: "09", label: "September" }, { value: "10", label: "October" },
    { value: "11", label: "November" }, { value: "12", label: "December" },
  ];

  const hasActiveFilters = Object.values(filters).some((v) => v !== "" && v !== undefined && v !== null);

  return (
    <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">🔍 Filters</span>

      {showDateRange && (
        <>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-bold text-slate-500">From</label>
            <input
              type="date"
              value={filters.startDate || ""}
              onChange={(e) => handleChange("startDate", e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-bold text-slate-500">To</label>
            <input
              type="date"
              value={filters.endDate || ""}
              onChange={(e) => handleChange("endDate", e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>
        </>
      )}

      {showMonth && (
        <select
          value={filters.month || ""}
          onChange={(e) => handleChange("month", e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-300"
        >
          <option value="">All Months</option>
          {months.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      )}

      {showYear && (
        <select
          value={filters.year || ""}
          onChange={(e) => handleChange("year", e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-300"
        >
          <option value="">All Years</option>
          {yearOptions.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      )}

      {showPlan && (
        <select
          value={filters.plan || ""}
          onChange={(e) => handleChange("plan", e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-300"
        >
          <option value="">All Plans</option>
          {plans.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      )}

      {showTrainer && (
        <select
          value={filters.trainer || ""}
          onChange={(e) => handleChange("trainer", e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-300"
        >
          <option value="">All Trainers</option>
          {trainers.map((t) => (
            <option key={t.id} value={String(t.id)}>{t.name}</option>
          ))}
        </select>
      )}

      {showStatus && (
        <select
          value={filters.status || ""}
          onChange={(e) => handleChange("status", e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-300"
        >
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Expired">Expired</option>
        </select>
      )}

      {onApply && (
        <button
          onClick={onApply}
          className="bg-slate-900 text-white text-xs font-bold px-4 py-1.5 rounded-lg hover:bg-slate-800 transition-all"
        >
          Apply
        </button>
      )}

      {hasActiveFilters && (
        <button
          onClick={handleClear}
          className="text-xs font-bold text-slate-400 hover:text-rose-500 px-2 py-1.5 transition-colors"
          title="Clear all filters"
        >
          ✕ Clear
        </button>
      )}
    </div>
  );
};

export default ReportFilters;
