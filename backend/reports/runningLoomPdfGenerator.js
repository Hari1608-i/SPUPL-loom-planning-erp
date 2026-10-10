const PDFDocument = require('pdfkit');

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatNativeDate(d, withTime = false) {
  if (!d) return 'NA';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return 'NA';
    const day = String(dt.getDate()).padStart(2, '0');
    const mon = MONTH_NAMES[dt.getMonth()];
    const yr = String(dt.getFullYear()).slice(-2);
    if (!withTime) return `${day}-${mon}-${yr}`;
    const hrs = String(dt.getHours()).padStart(2, '0');
    const mins = String(dt.getMinutes()).padStart(2, '0');
    const secs = String(dt.getSeconds()).padStart(2, '0');
    return `${day}-${mon}-${dt.getFullYear()} ${hrs}:${mins}:${secs}`;
  } catch (e) {
    return 'NA';
  }
}

/**
 * Generates the Official Full Running Loom Register PDF (All 224 Running Looms)
 * @param {Array} runningLoomsList - Enriched running looms data
 * @param {Stream.Writable} outputStream - Stream to pipe PDF into
 */
function generateRunningLoomsPdf(runningLoomsList, outputStream) {
  // Landscape A4: 841.89 x 595.28 pt
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 25, bottom: 25, left: 20, right: 20 },
    bufferPages: true
  });

  doc.pipe(outputStream);

  const totalLooms = runningLoomsList.length;
  const greyCount = runningLoomsList.filter(l => (l.orderType || '').toUpperCase() === 'GREY').length;
  const ydCount = runningLoomsList.filter(l => (l.orderType || '').toUpperCase() === 'YD').length;
  const validDesigns = new Set(runningLoomsList.map(l => l.designNo).filter(d => d && !d.includes('NOT MAPPED'))).size;
  const missingOrderCount = runningLoomsList.filter(l => !l.inOrderManagement || (l.ibpo && l.ibpo.includes('NOT IN ORDER'))).length;
  const missingDesignCount = runningLoomsList.filter(l => !l.designExistsInMaster || (l.designNo && l.designNo.includes('NOT MAPPED'))).length;
  const missingBeamCount = runningLoomsList.filter(l => !l.currentBeamNo || l.currentBeamNo === '').length;
  const missingDateCount = runningLoomsList.filter(l => !l.loomStartDate).length;

  // Header Component
  const drawHeader = (isFirstPage = false) => {
    // Company Header
    doc.rect(20, 15, 801.89, 42).fill('#0f172a');
    doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold')
      .text('SANTHI PROCESSING UNIT PVT. LTD.', 30, 20);
    doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
      .text('SPUPL LOOM PLANNING ERP — COMPLETE RUNNING LOOM REGISTER & WEAVE AUDIT', 30, 34);

    const reportDateStr = formatNativeDate(new Date(), true);
    doc.fillColor('#cbd5e1').fontSize(7.5).font('Helvetica')
      .text(`Generated: ${reportDateStr} | Status: LIVE PRODUCTION REGISTER`, 550, 24, { align: 'right', width: 260 });

    if (isFirstPage) {
      // Summary Metrics Cards (First Page Only)
      doc.rect(20, 62, 801.89, 44).fill('#f8fafc').strokeColor('#cbd5e1').lineWidth(0.5).stroke();

      const cardWidth = 801.89 / 7;
      const kpis = [
        { label: 'TOTAL RUNNING', value: `${totalLooms} Looms`, color: '#0f172a' },
        { label: 'GREY LOOMS', value: `${greyCount} Looms`, color: '#0369a1' },
        { label: 'YD LOOMS', value: `${ydCount} Looms`, color: '#7c3aed' },
        { label: 'VALID DESIGNS', value: `${validDesigns} Designs`, color: '#059669' },
        { label: 'MISSING ORDERS', value: `${missingOrderCount}`, color: missingOrderCount > 0 ? '#d97706' : '#059669' },
        { label: 'UNMAPPED DESIGNS', value: `${missingDesignCount}`, color: missingDesignCount > 0 ? '#dc2626' : '#059669' },
        { label: 'BEAMS ALLOCATED', value: `${totalLooms - missingBeamCount} / ${totalLooms}`, color: '#0f172a' }
      ];

      kpis.forEach((kpi, idx) => {
        const x = 20 + (idx * cardWidth);
        doc.fillColor('#64748b').fontSize(6).font('Helvetica-Bold')
          .text(kpi.label, x + 5, 68, { width: cardWidth - 10, align: 'center' });
        doc.fillColor(kpi.color).fontSize(10).font('Helvetica-Bold')
          .text(kpi.value, x + 5, 82, { width: cardWidth - 10, align: 'center' });
      });
    }
  };

  // 23 Columns Specifications
  const columns = [
    { key: 'unit', label: 'Unit', width: 34, align: 'left' },
    { key: 'loomNo', label: 'Loom', width: 28, align: 'center' },
    { key: 'status', label: 'Status', width: 32, align: 'center' },
    { key: 'loomStartDate', label: 'Start Dt', width: 44, align: 'center' },
    { key: 'designNo', label: 'Design / SP No', width: 72, align: 'left' },
    { key: 'ibpo', label: 'IBPO', width: 38, align: 'center' },
    { key: 'orderType', label: 'Type', width: 28, align: 'center' },
    { key: 'customerName', label: 'Customer', width: 48, align: 'left' },
    { key: 'vendorName', label: 'Vendor Name', width: 62, align: 'left' },
    { key: 'plannedWarpingDate', label: 'Pln Warping (-4d)', width: 44, align: 'center' },
    { key: 'plannedSizingDate', label: 'Pln Sizing (-4d)', width: 44, align: 'center' },
    { key: 'setNo', label: 'Set No', width: 32, align: 'center' },
    { key: 'currentBeamNo', label: 'Beam No', width: 34, align: 'center' },
    { key: 'beamType', label: 'Beam Type', width: 34, align: 'center' },
    { key: 'beamDia', label: 'Dia', width: 20, align: 'right' },
    { key: 'beamWidth', label: 'Width', width: 24, align: 'right' },
    { key: 'totalEnds', label: 'Ends', width: 24, align: 'right' },
    { key: 'warpedMeter', label: 'Warp M', width: 34, align: 'right' },
    { key: 'producedMeter', label: 'Prod M', width: 34, align: 'right' },
    { key: 'balanceMtr', label: 'Bal M', width: 34, align: 'right' },
    { key: 'runoutDate', label: 'Runout', width: 36, align: 'center' },
    { key: 'balanceDays', label: 'Days', width: 22, align: 'right' },
    { key: 'valStatus', label: 'Validation Status', width: 45, align: 'left' }
  ];

  const drawTableHeader = (y) => {
    doc.rect(20, y, 801.89, 16).fill('#1e293b');
    let x = 20;
    columns.forEach(col => {
      doc.fillColor('#f8fafc').fontSize(5.5).font('Helvetica-Bold')
        .text(col.label, x + 2, y + 4.5, { width: col.width - 4, align: col.align });
      x += col.width;
    });
  };

  // Render Rows
  let currentY = 112;
  const rowHeight = 14;
  const maxRowsPerPage = 28;
  const maxRowsFirstPage = 25;

  drawHeader(true);
  drawTableHeader(currentY);
  currentY += 16;

  runningLoomsList.forEach((row, idx) => {
    // Check page break
    if (currentY + rowHeight > 565) {
      doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: 25, bottom: 25, left: 20, right: 20 } });
      drawHeader(false);
      currentY = 62;
      drawTableHeader(currentY);
      currentY += 16;
    }

    // Zebra striping
    if (idx % 2 === 1) {
      doc.rect(20, currentY, 801.89, rowHeight).fill('#f8fafc');
    }

    // Border line bottom
    doc.moveTo(20, currentY + rowHeight).lineTo(821.89, currentY + rowHeight)
      .strokeColor('#e2e8f0').lineWidth(0.4).stroke();

    const formatDateSafe = (dStr) => formatNativeDate(dStr, false);

    const startDateFmt = formatDateSafe(row.loomStartDate);
    const warpDateFmt = formatDateSafe(row.plannedWarpingDate);
    const sizingDateFmt = formatDateSafe(row.plannedSizingDate);
    const runoutDateFmt = formatDateSafe(row.expectedRunoutDate);

    const netBal = Math.max(0, Math.round((Number(row.warpedMeter) || 0) - (Number(row.producedMeter) || 0)));
    const cleanDays = (row.balanceDays !== null && row.balanceDays !== undefined && row.balanceDays < 900000)
      ? `${Math.ceil(row.balanceDays)}d`
      : 'NA';

    let validationBadge = 'VALID';
    if (!row.inOrderManagement) validationBadge = 'NA-ORDER';
    else if (!row.designExistsInMaster) validationBadge = 'NA-DESIGN';
    else if (!row.currentBeamNo) validationBadge = 'NO-BEAM';

    const rowData = {
      unit: (row.unit || 'U1').replace('UNIT ', 'U'),
      loomNo: `L-${row.loomNo}`,
      status: 'RUN',
      loomStartDate: startDateFmt,
      designNo: (row.designNo || 'NA').substring(0, 18),
      ibpo: (row.ibpo || 'NA').replace('NA — NOT IN ORDER MANAGEMENT', 'NA'),
      orderType: (row.orderType || 'GREY').toUpperCase() === 'YD' ? 'YD' : 'GRY',
      customerName: (row.customerName || '-').substring(0, 10),
      vendorName: (row.vendorName || '-').substring(0, 13),
      plannedWarpingDate: warpDateFmt,
      plannedSizingDate: sizingDateFmt,
      setNo: (row.setNo || '-').substring(0, 8),
      currentBeamNo: (row.currentBeamNo || '-').substring(0, 8),
      beamType: (row.beamType || 'RF-900').replace('RF-900', 'RF900').substring(0, 8),
      beamDia: row.beamDia ? String(row.beamDia) : '-',
      beamWidth: row.beamWidth ? String(row.beamWidth) : '-',
      totalEnds: row.totalEnds ? String(row.totalEnds) : '-',
      warpedMeter: row.warpedMeter ? Math.round(row.warpedMeter).toLocaleString() : '0',
      producedMeter: row.producedMeter ? Math.round(row.producedMeter).toLocaleString() : '0',
      balanceMtr: netBal ? netBal.toLocaleString() : '0',
      runoutDate: runoutDateFmt,
      balanceDays: cleanDays,
      valStatus: validationBadge
    };

    let x = 20;
    columns.forEach(col => {
      let cellColor = '#1e293b';
      if (col.key === 'orderType') {
        cellColor = rowData[col.key] === 'YD' ? '#7c3aed' : '#0369a1';
      } else if (col.key === 'valStatus') {
        cellColor = rowData[col.key] === 'VALID' ? '#059669' : '#d97706';
      }

      doc.fillColor(cellColor).fontSize(5.5).font(col.key === 'loomNo' || col.key === 'designNo' ? 'Helvetica-Bold' : 'Helvetica')
        .text(String(rowData[col.key]), x + 2, currentY + 3.5, { width: col.width - 4, align: col.align });
      x += col.width;
    });

    currentY += rowHeight;
  });

  // Footer & Page Numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fillColor('#64748b').fontSize(7).font('Helvetica')
      .text(`SPUPL ERP Confidential Audit Document — Page ${i + 1} of ${range.count} | Santhi Processing Unit Pvt. Ltd.`, 20, 575, { align: 'center', width: 801.89 });
  }

  doc.end();
}

module.exports = { generateRunningLoomsPdf };
