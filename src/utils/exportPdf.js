/**
 * exportPdf.js — PDF Export Utility using Electron's built-in printToPDF
 * 
 * Sends report data to main process via IPC, which creates a hidden BrowserWindow,
 * renders HTML, calls printToPDF, and saves to user-selected location.
 * Zero external dependencies.
 */

const windowElectron = window.electron || null;

/**
 * @param {Object} options
 * @param {string} options.title - Report title
 * @param {string[]} options.headers - Table column headers
 * @param {Array<Array<string|number>>} options.rows - Table data rows
 * @param {string} [options.subtitle] - Optional subtitle
 * @param {Array<{label: string, value: string|number}>} [options.summaryCards] - Optional summary cards
 * @param {string} [options.defaultFilename] - Default filename for save dialog
 * @returns {Promise<{success: boolean, filePath?: string, error?: string, canceled?: boolean}>}
 */
export function exportPdf({ title, headers, rows, subtitle, summaryCards, defaultFilename }) {
  return new Promise((resolve) => {
    if (!windowElectron) {
      return resolve({ success: false, error: "Electron not available" });
    }

    const handleResponse = (_e, result) => {
      windowElectron.ipcRenderer.removeListener("export-report-pdf-response", handleResponse);
      resolve(result);
    };

    windowElectron.ipcRenderer.on("export-report-pdf-response", handleResponse);
    windowElectron.ipcRenderer.send("export-report-pdf", {
      title,
      headers,
      rows,
      subtitle,
      summaryCards,
      defaultFilename: defaultFilename || `report-${new Date().toISOString().split("T")[0]}.pdf`,
    });
  });
}
