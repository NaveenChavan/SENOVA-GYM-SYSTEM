/**
 * printReport.js — HTML Iframe Print Utility
 * 
 * Renders a clean HTML report in a hidden iframe and triggers the native print dialog.
 * Completely isolated from the app UI (no sidebar, tabs, or navigation in print output).
 */

/**
 * @param {Object} options
 * @param {string} options.title - Report title displayed at the top
 * @param {string[]} options.headers - Table column headers
 * @param {Array<Array<string|number>>} options.rows - Table data rows
 * @param {string} [options.subtitle] - Optional subtitle (e.g., date range)
 * @param {Array<{label: string, value: string|number}>} [options.summaryCards] - Optional summary data
 */
export function printReport({ title, headers, rows, subtitle, summaryCards }) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.top = "-10000px";
  iframe.style.left = "-10000px";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;

  const summaryHtml = summaryCards && summaryCards.length > 0
    ? `<div class="summary-row">${summaryCards.map(c => `<div class="summary-card"><span class="label">${c.label}</span><span class="value">${c.value}</span></div>`).join("")}</div>`
    : "";

  const tableHtml = rows.length > 0
    ? `<table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell ?? "—"}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>`
    : `<p class="empty">No data available.</p>`;

  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; color: #1e293b; font-size: 11px; }
    .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
    .header h1 { font-size: 18px; font-weight: 900; color: #0f172a; }
    .header p { font-size: 10px; color: #64748b; margin-top: 4px; }
    .summary-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 14px; flex: 1; min-width: 120px; }
    .summary-card .label { display: block; font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-card .value { display: block; font-size: 14px; font-weight: 900; color: #0f172a; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #f1f5f9; border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; }
    td { border: 1px solid #e2e8f0; padding: 5px 10px; font-size: 10px; color: #334155; }
    tr:nth-child(even) { background: #f8fafc; }
    .empty { text-align: center; color: #94a3b8; padding: 32px; font-size: 12px; }
    .footer { margin-top: 16px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    ${subtitle ? `<p>${subtitle}</p>` : ""}
    <p>Generated: ${new Date().toLocaleString()}</p>
  </div>
  ${summaryHtml}
  ${tableHtml}
  <div class="footer">SENOVA Gym Management System</div>
</body>
</html>`);
  doc.close();

  // Wait for content to render before printing
  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
    // Cleanup after print dialog closes
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  }, 250);
}
