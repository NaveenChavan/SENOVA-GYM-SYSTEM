import React, { useState } from "react";
import { printReport } from "../../utils/printReport";
import { exportPdf } from "../../utils/exportPdf";
const windowElectron = window.electron || null;

/**
 * ReportExportBar — Reusable export toolbar for all reports.
 * Provides CSV, PDF, and Print buttons with consistent styling.
 * 
 * @param {Object} props
 * @param {string} props.title - Report title (used in PDF/Print headers)
 * @param {string[]} props.headers - Column headers for export
 * @param {Array<Array<string|number>>} props.rows - Data rows for export
 * @param {string} [props.subtitle] - Optional subtitle for PDF/Print
 * @param {Array<{label: string, value: string|number}>} [props.summaryCards] - Summary data for PDF/Print
 * @param {string} [props.csvFilename] - Default CSV filename
 * @param {string} [props.pdfFilename] - Default PDF filename
 * @param {boolean} [props.disabled] - Disable all export buttons (e.g., when no data)
 */
const ReportExportBar = ({
  title,
  headers,
  rows,
  subtitle,
  summaryCards,
  csvFilename,
  pdfFilename,
  disabled = false,
}) => {
  const [exporting, setExporting] = useState(null); // 'csv' | 'pdf' | null

  const handleCsvExport = () => {
    if (!windowElectron || disabled || rows.length === 0) return;
    setExporting("csv");
    const handleResponse = () => {
      windowElectron.ipcRenderer.removeListener("export-report-csv-response", handleResponse);
      setExporting(null);
    };
    windowElectron.ipcRenderer.on("export-report-csv-response", handleResponse);
    windowElectron.ipcRenderer.send("export-report-csv", {
      headers,
      rows,
      defaultFilename: csvFilename || `report-${new Date().toISOString().split("T")[0]}.csv`,
    });
  };

  const handlePdfExport = async () => {
    if (disabled || rows.length === 0) return;
    setExporting("pdf");
    await exportPdf({
      title,
      headers,
      rows,
      subtitle,
      summaryCards,
      defaultFilename: pdfFilename || `report-${new Date().toISOString().split("T")[0]}.pdf`,
    });
    setExporting(null);
  };

  const handlePrint = () => {
    if (disabled || rows.length === 0) return;
    printReport({ title, headers, rows, subtitle, summaryCards });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Export</span>

      {/* CSV Button */}
      <button
        onClick={handleCsvExport}
        disabled={disabled || exporting === "csv"}
        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all"
        title="Export as CSV"
      >
        {exporting === "csv" ? (
          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
        ) : (
          <span>📄</span>
        )}
        CSV
      </button>

      {/* PDF Button */}
      <button
        onClick={handlePdfExport}
        disabled={disabled || exporting === "pdf"}
        className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all"
        title="Export as PDF"
      >
        {exporting === "pdf" ? (
          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
        ) : (
          <span>📕</span>
        )}
        PDF
      </button>

      {/* Print Button */}
      <button
        onClick={handlePrint}
        disabled={disabled}
        className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all"
        title="Print Report"
      >
        <span>🖨️</span>
        Print
      </button>
    </div>
  );
};

export default ReportExportBar;
