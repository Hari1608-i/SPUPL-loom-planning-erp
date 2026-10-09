const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Client } = require('./backend/node_modules/pg');
require('./backend/node_modules/dotenv').config({ path: './backend/.env' });

async function generateReport() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('Fetching Running Looms and Beam Stock from database...');
  
  // 1. Fetch running looms from LoomRunEntry
  const runQuery = `
    SELECT 
      l.loom_no,
      l.order_no,
      l.design_no_sp_no,
      l.current_beam_no,
      l.set_no,
      l.warped_meter,
      l.loom_start_date,
      b.vendor_name,
      b.date AS sizing_date,
      lm.shed_name,
      lm.model,
      lm.rpm
    FROM "LoomRunEntry" l
    LEFT JOIN "BeamStockMaster" b 
      ON l.current_beam_no = b.beam_no AND l.set_no = b.set_no
    LEFT JOIN "LoomMaster" lm 
      ON l.loom_no = lm.loom_no
    ORDER BY l.loom_no ASC
  `;
  const runRes = await client.query(runQuery);
  const runningLooms = runRes.rows;

  // 2. Fetch future / stock allocations for repeated looms
  const futureQuery = `
    SELECT 
      b.id,
      b.beam_no,
      b.set_no,
      b.order_no,
      b.design_no,
      b.available_meter,
      b.vendor_name,
      b.date AS sizing_date,
      b.status,
      b.reserved_for
    FROM "BeamStockMaster" b
    WHERE b.reserved_for LIKE 'Future Plan for Loom %'
    ORDER BY b.id ASC
  `;
  const futureRes = await client.query(futureQuery);
  const futureBeams = futureRes.rows;

  // 3. Status counts
  const lmStats = await client.query('SELECT status, COUNT(*) FROM "LoomMaster" GROUP BY status');
  
  await client.end();

  const formatDate = (d) => {
    if (!d) return '-';
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return '-';
    return dateObj.toISOString().split('T')[0];
  };

  const totalWarpedMeters = runningLooms.reduce((acc, r) => acc + (parseFloat(r.warped_meter) || 0), 0);
  const totalFutureMeters = futureBeams.reduce((acc, r) => acc + (parseFloat(r.available_meter) || 0), 0);

  // Build HTML Report
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SPUPL - Running Looms & Beam Stock Allocation Report</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 8mm 8mm 8mm 8mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      padding: 12px;
      font-size: 8pt;
    }
    @media print {
      body {
        background-color: #fff;
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
      .page-break {
        page-break-after: always;
        break-after: page;
      }
    }
    .header-card {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      color: #fff;
      padding: 14px 20px;
      border-radius: 8px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .title-area h1 {
      font-size: 16pt;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #38bdf8;
      margin-bottom: 2px;
    }
    .title-area p {
      font-size: 8.5pt;
      color: #94a3b8;
    }
    .badge-bar {
      display: flex;
      gap: 10px;
    }
    .stat-badge {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      padding: 6px 12px;
      text-align: right;
    }
    .stat-badge .num {
      font-size: 12pt;
      font-weight: 700;
      color: #38bdf8;
    }
    .stat-badge .lbl {
      font-size: 6.5pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #cbd5e1;
    }
    .section-title {
      font-size: 10pt;
      font-weight: 700;
      color: #1e293b;
      margin: 10px 0 6px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 4px;
    }
    .section-title .tag {
      background: #e0f2fe;
      color: #0369a1;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 7pt;
      font-weight: 600;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 7.5pt;
      margin-bottom: 14px;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      border-radius: 4px;
      overflow: hidden;
    }
    table.data-table th {
      background-color: #1e293b;
      color: #f8fafc;
      font-weight: 600;
      text-align: left;
      padding: 5px 6px;
      border: 1px solid #334155;
      text-transform: uppercase;
      font-size: 6.8pt;
      letter-spacing: 0.3px;
    }
    table.data-table td {
      padding: 4.5px 6px;
      border: 1px solid #e2e8f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #334155;
    }
    table.data-table tr:nth-child(even) {
      background-color: #f8fafc;
    }
    table.data-table tr:hover {
      background-color: #f1f5f9;
    }
    .text-center { text-align: center !important; }
    .text-right { text-align: right !important; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .font-bold { font-weight: 700; }
    .status-running {
      background-color: #dcfce7;
      color: #15803d;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 6.5pt;
      display: inline-block;
    }
    .status-available {
      background-color: #fef9c3;
      color: #a16207;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 6.5pt;
      display: inline-block;
    }
    .rule-note {
      background: #f0fdf4;
      border-left: 4px solid #16a34a;
      padding: 8px 12px;
      margin-bottom: 12px;
      font-size: 7.5pt;
      color: #166534;
      line-height: 1.4;
      border-radius: 0 4px 4px 0;
    }
    .rule-note strong {
      color: #14532d;
    }
    .btn-print {
      position: fixed;
      top: 16px;
      right: 16px;
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 8px 16px;
      font-size: 9pt;
      font-weight: bold;
      border-radius: 6px;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(37,99,235,0.3);
      z-index: 9999;
    }
    .btn-print:hover {
      background: #1d4ed8;
    }
  </style>
</head>
<body>
  <button class="btn-print no-print" onclick="window.print()">🖨️ Print / Save as PDF</button>

  <div class="header-card">
    <div class="title-area">
      <h1>SRI PARVATHI UDHYOG PRIVATE LIMITED</h1>
      <p>Loom Planning & ERP System — Master Running Looms & Beam Stock Allocation Report</p>
      <p style="margin-top: 4px; color: #94a3b8; font-size: 7.5pt;">Source: RUNNING LOOMS - 09.10.2026.xlsx | Export Date: October 9, 2026 | Sizing Date Calculation: Loom Start Date - 4 Days</p>
    </div>
    <div class="badge-bar">
      <div class="stat-badge">
        <div class="num">${runningLooms.length}</div>
        <div class="lbl">Active Running Looms</div>
      </div>
      <div class="stat-badge">
        <div class="num">${futureBeams.length}</div>
        <div class="lbl">Future Stock Beams</div>
      </div>
      <div class="stat-badge">
        <div class="num">${totalWarpedMeters.toLocaleString()} m</div>
        <div class="lbl">Running Warp Mtr</div>
      </div>
    </div>
  </div>

  <div class="rule-note">
    <strong>Verification Rules Applied:</strong><br>
    • <strong>Current Running Looms:</strong> 150 unique looms are set to Active Running status with their exact first-assigned IBPO, Design No, Beam No, Set No, and Warp Meter.<br>
    • <strong>Multi-IBPO / Repeated Looms:</strong> Looms with repeated occurrences (Looms 12, 56, 156, 220, 235, 300) have their 1st row active in running, and remaining 8 rows preserved in <em>BeamStockMaster</em> with status <em>Available</em> &amp; reserved for future planning.<br>
    • <strong>Sizing Date Logic:</strong> Automatically calculated as exactly <strong>4 calendar days prior to Loom Start Date</strong> for all entries.<br>
    • <strong>Order Management Sync:</strong> All corresponding IBPOs set to <em>WEAVING RUNNING</em>.
  </div>

  <!-- SECTION 1: FUTURE / MULTI-IBPO BEAM STOCK TABLE -->
  <div class="section-title">
    <span>1. FUTURE BEAM STOCK ALLOCATIONS (Multi-IBPO Looms: 12, 56, 156, 220, 235, 300)</span>
    <span class="tag">8 Preserved Stock Entries</span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 60px;" class="text-center">S.No</th>
        <th style="width: 140px;">Reserved Loom Target</th>
        <th style="width: 90px;" class="text-center font-mono">Beam No</th>
        <th style="width: 90px;" class="text-center font-mono">Set No</th>
        <th style="width: 90px;" class="text-center font-mono">IBPO</th>
        <th>Design / Sort No</th>
        <th style="width: 90px;" class="text-right font-mono">Warp Mtr</th>
        <th style="width: 100px;" class="text-center">Sizing Date (-4d)</th>
        <th style="width: 140px;">Sizing Vendor</th>
        <th style="width: 90px;" class="text-center">Stock Status</th>
      </tr>
    </thead>
    <tbody>
      ${futureBeams.map((b, i) => `
        <tr>
          <td class="text-center font-mono">${i + 1}</td>
          <td class="font-bold" style="color: #0369a1;">${b.reserved_for}</td>
          <td class="text-center font-mono font-bold">${b.beam_no}</td>
          <td class="text-center font-mono">${b.set_no}</td>
          <td class="text-center font-mono font-bold">${b.order_no || '-'}</td>
          <td class="font-bold">${b.design_no}</td>
          <td class="text-right font-mono font-bold">${(b.available_meter || 0).toLocaleString()}</td>
          <td class="text-center font-mono">${formatDate(b.sizing_date)}</td>
          <td>${b.vendor_name || '-'}</td>
          <td class="text-center"><span class="status-available">${b.status}</span></td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <!-- SECTION 2: ALL 150 CURRENT RUNNING LOOMS -->
  <div class="section-title">
    <span>2. MASTER ACTIVE RUNNING LOOMS ALLOCATION</span>
    <span class="tag">150 Unique Looms</span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 50px;" class="text-center">Loom</th>
        <th style="width: 75px;" class="text-center font-mono">IBPO</th>
        <th style="width: 130px;">Design No</th>
        <th style="width: 75px;" class="text-center font-mono">Beam No</th>
        <th style="width: 75px;" class="text-center font-mono">Set No</th>
        <th style="width: 75px;" class="text-right font-mono">Warp Mtr</th>
        <th style="width: 85px;" class="text-center">Start Date</th>
        <th style="width: 85px;" class="text-center">Sizing Date (-4d)</th>
        <th>Sizing Vendor</th>
        <th style="width: 60px;" class="text-center font-mono">RPM</th>
        <th style="width: 65px;" class="text-center">Status</th>
      </tr>
    </thead>
    <tbody>
      ${runningLooms.map(l => `
        <tr>
          <td class="text-center font-bold" style="background-color: #f1f5f9; color: #0284c7;">${l.loom_no}</td>
          <td class="text-center font-mono font-bold">${l.order_no || '-'}</td>
          <td class="font-bold">${l.design_no_sp_no || '-'}</td>
          <td class="text-center font-mono font-bold">${l.current_beam_no || '-'}</td>
          <td class="text-center font-mono">${l.set_no || '-'}</td>
          <td class="text-right font-mono font-bold">${(parseFloat(l.warped_meter) || 0).toLocaleString()}</td>
          <td class="text-center font-mono">${formatDate(l.loom_start_date)}</td>
          <td class="text-center font-mono font-bold" style="color: #0d9488;">${formatDate(l.sizing_date)}</td>
          <td>${l.vendor_name || '-'}</td>
          <td class="text-center font-mono">${l.rpm || '-'}</td>
          <td class="text-center"><span class="status-running">Running</span></td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div style="margin-top: 16px; text-align: center; color: #64748b; font-size: 7pt; border-top: 1px solid #e2e8f0; padding-top: 8px;">
    Report automatically generated by SPUPL Loom Planning ERP System. All data synchronized with Supabase PostgreSQL production database.
  </div>
</body>
</html>`;

  // Output paths
  const rootHtmlPath = path.join(__dirname, 'RUNNING_LOOMS_UPDATE_REPORT_09-10-2026.html');
  const rootPdfPath = path.join(__dirname, 'RUNNING_LOOMS_UPDATE_REPORT_09-10-2026.pdf');
  const downloadsPdfPath = 'C:\\Users\\SPUPL-PLANNING\\Downloads\\RUNNING_LOOMS_UPDATE_REPORT_09-10-2026.pdf';
  const publicPdfPath = path.join(__dirname, 'frontend', 'public', 'RUNNING_LOOMS_UPDATE_REPORT_09-10-2026.pdf');
  const publicHtmlPath = path.join(__dirname, 'frontend', 'public', 'RUNNING_LOOMS_UPDATE_REPORT_09-10-2026.html');

  fs.writeFileSync(rootHtmlPath, htmlContent, 'utf-8');
  fs.writeFileSync(publicHtmlPath, htmlContent, 'utf-8');
  console.log('HTML reports saved successfully.');

  // Generate PDF via Headless Chrome or Edge
  const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const executable = fs.existsSync(browserPath) ? browserPath : edgePath;

  console.log(`Generating PDF using: ${executable}...`);
  const cmd = `"${executable}" --headless=new --disable-gpu --run-all-compositor-stages-before-draw --no-pdf-header-footer --print-to-pdf="${rootPdfPath}" "${rootHtmlPath}"`;
  
  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log(`✓ PDF successfully generated at: ${rootPdfPath}`);
    
    // Copy to Downloads & public
    fs.copyFileSync(rootPdfPath, downloadsPdfPath);
    console.log(`✓ PDF successfully copied to: ${downloadsPdfPath}`);
    fs.copyFileSync(rootPdfPath, publicPdfPath);
    console.log(`✓ PDF successfully copied to: ${publicPdfPath}`);
  } catch (err) {
    console.error('PDF generation error:', err);
  }
}

generateReport().catch(console.error);
