import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { History as HistoryIcon, Search, Download, Filter, RotateCcw, Calendar, FileSpreadsheet, Printer } from 'lucide-react';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { useAppContext } from '../context/AppProvider';
import { CompanyPrintHeader } from '../components/common/CompanyPrintHeader';
import { triggerPrint } from '../utils/printManager';

export default function History() {
  const { completedHistory, looms } = useAppContext();

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [unitFilter, setUnitFilter] = useState('ALL');
  const [loomFilter, setLoomFilter] = useState('ALL');
  const [designFilter, setDesignFilter] = useState('ALL');
  const [sortChangeFilter, setSortChangeFilter] = useState('ALL');
  const [orderTypeFilter, setOrderTypeFilter] = useState<'ALL' | 'GREY' | 'YD'>('ALL');

  // Distinct options for dropdowns
  const uniqueUnits = useMemo(() => {
    const set = new Set<string>();
    completedHistory.forEach(h => {
      let u = h.unit;
      if (u && u !== 'Unknown') {
        if (!u.startsWith('Unit')) u = `Unit ${u}`;
        set.add(u);
      }
    });
    return Array.from(set).sort();
  }, [completedHistory]);

  const uniqueLooms = useMemo(() => {
    const set = new Set<number>();
    completedHistory.forEach(h => {
      if (h.loomNo) set.add(Number(h.loomNo));
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [completedHistory]);

  const uniqueDesigns = useMemo(() => {
    const set = new Set<string>();
    completedHistory.forEach(h => {
      if (h.designNo) set.add(h.designNo.trim());
    });
    return Array.from(set).sort();
  }, [completedHistory]);

  // Reset Filters
  const handleResetFilters = () => {
    setSearchTerm('');
    setFromDate('');
    setToDate('');
    setUnitFilter('ALL');
    setLoomFilter('ALL');
    setDesignFilter('ALL');
    setSortChangeFilter('ALL');
    setOrderTypeFilter('ALL');
  };

  // Filtered dataset
  const filteredData = useMemo(() => {
    return completedHistory.filter(d => {
      // 1. Text Search across key identifiers
      const q = (searchTerm || '').trim().toLowerCase();
      if (q) {
        const matches =
          (d.loomNo || '').toString().toLowerCase().includes(q) ||
          (d.designNo || '').toLowerCase().includes(q) ||
          (d.unit || '').toLowerCase().includes(q) ||
          (d.construction || '').toLowerCase().includes(q) ||
          (d.reed || '').toLowerCase().includes(q) ||
          (d.pick || '').toLowerCase().includes(q) ||
          (d.width || '').toLowerCase().includes(q) ||
          (d.setNo || '').toString().toLowerCase().includes(q) ||
          (d.beamNo || '').toString().toLowerCase().includes(q) ||
          (d.ibpoNo || '').toString().toLowerCase().includes(q);
        if (!matches) return false;
      }

      // 2. Date Range Filter (inclusive boundary)
      if (fromDate || toDate) {
        try {
          const runEndDate = parseISO(d.endDate);
          if (fromDate) {
            const startLimit = startOfDay(parseISO(fromDate));
            if (runEndDate < startLimit) return false;
          }
          if (toDate) {
            const endLimit = endOfDay(parseISO(toDate));
            if (runEndDate > endLimit) return false;
          }
        } catch (e) {
          // ignore parsing error
        }
      }

      // 3. Unit Filter
      if (unitFilter !== 'ALL') {
        let u = d.unit || '';
        if (u && !u.startsWith('Unit')) u = `Unit ${u}`;
        if (u !== unitFilter) return false;
      }

      // 4. Loom Filter
      if (loomFilter !== 'ALL' && Number(d.loomNo) !== Number(loomFilter)) {
        return false;
      }

      // 5. Design Filter
      if (designFilter !== 'ALL' && (d.designNo || '').trim() !== designFilter) {
        return false;
      }

      // 6. Sort Change Filter
      if (sortChangeFilter !== 'ALL') {
        const sc = (d.sortChangeType || '').toUpperCase();
        if (sortChangeFilter === 'GAITING' && sc !== 'GAITING') return false;
        if (sortChangeFilter === 'KNOTTING' && sc !== 'KNOTTING') return false;
        if (sortChangeFilter === 'KNOTTING_SORT_CHANGE' && sc !== 'KNOTTING_SORT_CHANGE') return false;
      }

      // 7. Order Type Filter (GREY / YD / ALL)
      if (orderTypeFilter !== 'ALL') {
        const oType = (d.orderType || 'GREY').toUpperCase();
        if (orderTypeFilter === 'GREY' && oType.includes('YD')) return false;
        if (orderTypeFilter === 'YD' && !oType.includes('YD')) return false;
      }

      return true;
    });
  }, [completedHistory, searchTerm, fromDate, toDate, unitFilter, loomFilter, designFilter, sortChangeFilter, orderTypeFilter]);

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const count = filteredData.length;
    const totalWarpMtr = filteredData.reduce((acc, r) => acc + (Number(r.warpMeter) || 0), 0);
    const totalProdMtr = filteredData.reduce((acc, r) => acc + (Number(r.totalProductionMeter) || 0), 0);
    const totalRunDays = filteredData.reduce((acc, r) => acc + (Number(r.runningDays) || 0), 0);
    const avgDailyProd = totalRunDays > 0 ? Math.round(totalProdMtr / totalRunDays) : 0;
    const avgEfficiency = totalWarpMtr > 0 ? Number(((totalProdMtr / totalWarpMtr) * 100).toFixed(1)) : (
      count > 0 ? Number((filteredData.reduce((acc, r) => acc + (Number(r.efficiencyPct) || 0), 0) / count).toFixed(1)) : 0
    );

    return {
      count,
      totalWarpMtr: Math.round(totalWarpMtr),
      totalProdMtr: Math.round(totalProdMtr),
      totalRunDays,
      avgDailyProd,
      avgEfficiency
    };
  }, [filteredData]);

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    const dataToExport = filteredData.map((row) => {
      let unit = row.unit;
      if (!unit || unit === 'Unknown') {
        const l = looms.find(loom => loom.loomNo === row.loomNo);
        unit = l ? l.unit : '-';
      }
      if (unit && unit !== '-' && !unit.startsWith('Unit')) {
        unit = `Unit ${unit}`;
      }

      const sortChangeDisplay = row.sortChangeType === 'KNOTTING'
        ? 'Knotting'
        : row.sortChangeType === 'KNOTTING_SORT_CHANGE'
        ? 'Knotting Sort Change'
        : row.sortChangeType === 'GAITING'
        ? 'Gaiting'
        : '—';

      return {
        'Loom No': `L-${row.loomNo}`,
        'Unit': unit,
        'Running Design / Design / SP No': row.designNo,
        'Construction': row.construction || 'Not Available',
        'Reed': row.reed || 'Not Available',
        'Pick': row.pick || 'Not Available',
        'Width': row.width || 'Not Available',
        'Set No': row.setNo || 'Not Available',
        'Beam No': row.beamNo || 'Not Available',
        'Sort Change': sortChangeDisplay,
        'Start Date': row.startDate ? format(parseISO(row.startDate), 'dd/MM/yyyy') : '—',
        'End Date': row.endDate ? format(parseISO(row.endDate), 'dd/MM/yyyy') : '—',
        'Warp Mtr': Math.round(row.warpMeter),
        'Production Mtr': Math.round(row.totalProductionMeter),
        'Run Days': row.runningDays,
        'Average Production': Math.round(row.avgDailyProduction),
        'Efficiency %': Number(row.efficiencyPct.toFixed(1))
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);

    // Dynamic Excel Formulas for columns P (Avg Prod) and Q (Efficiency %)
    filteredData.forEach((row, idx) => {
      const r = idx + 2;
      const avgProd = Math.round(row.avgDailyProduction);
      const eff = Number(row.efficiencyPct.toFixed(1));
      // Col O is Run Days, Col N is Prod Mtr, Col M is Warp Mtr
      ws[`P${r}`] = { t: 'n', v: avgProd, f: `IF(O${r}>0, ROUND(N${r}/O${r}, 0), 0)` };
      ws[`Q${r}`] = { t: 'n', v: eff, f: `IF(M${r}>0, ROUND((N${r}/M${r})*100, 1), 0)` };
    });

    // Column Widths for clean spreadsheet layout
    ws['!cols'] = [
      { wch: 10 }, // 1. Loom No
      { wch: 10 }, // 2. Unit
      { wch: 20 }, // 3. Design
      { wch: 28 }, // 4. Construction
      { wch: 10 }, // 5. Reed
      { wch: 8 },  // 6. Pick
      { wch: 10 }, // 7. Width
      { wch: 12 }, // 8. Set No
      { wch: 20 }, // 9. Beam No
      { wch: 16 }, // 10. Sort Change
      { wch: 12 }, // 11. Start Date
      { wch: 12 }, // 12. End Date
      { wch: 12 }, // 13. Warp Mtr
      { wch: 14 }, // 14. Prod Mtr
      { wch: 10 }, // 15. Run Days
      { wch: 14 }, // 16. Avg Prod
      { wch: 12 }  // 17. Efficiency %
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Warp History');
    const dateTag = format(new Date(), 'yyyyMMdd');
    XLSX.writeFile(wb, `SPUPL_Completed_Warp_History_${dateTag}.xlsx`);
  };

  // Export / Print PDF (landscape audit format)
  const handleExportPDF = () => {
    triggerPrint({ orientation: 'landscape', title: 'Completed Warp History Report' });
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      <CompanyPrintHeader
        title="Completed Warp History & Weave Log"
        subtitle={`Audit Period: ${fromDate ? format(parseISO(fromDate), 'dd/MM/yyyy') : 'Earliest'} to ${toDate ? format(parseISO(toDate), 'dd/MM/yyyy') : 'Latest'} | Order Type: ${orderTypeFilter}`}
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center tracking-tight">
            <HistoryIcon className="w-7 h-7 mr-3 text-indigo-600 p-1.5 bg-indigo-50 rounded-xl" /> Completed Warp History
          </h1>
          <p className="text-slate-500 text-xs mt-1 font-medium">
            Log of all completed weaves, technical sort specifications, beam allocation, and historical efficiency analytics across all looms.
          </p>
        </div>

        {/* Global Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPDF}
            className="flex items-center px-3.5 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl shadow-sm transition-all font-bold text-xs cursor-pointer"
            title="Export to PDF / Print Report"
          >
            <Printer className="w-4 h-4 mr-1.5 text-indigo-600" /> Export PDF
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm transition-all font-bold text-xs cursor-pointer"
            title="Export filtered records as Excel (.xlsx)"
          >
            <Download className="w-4 h-4 mr-1.5" /> Export Excel
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Completed Runs</span>
          <strong className="text-lg font-black text-slate-800 mt-0.5 block">{summaryMetrics.count}</strong>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Warp Mtr</span>
          <strong className="text-lg font-black text-indigo-600 mt-0.5 block">{summaryMetrics.totalWarpMtr.toLocaleString()} M</strong>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Prod Mtr</span>
          <strong className="text-lg font-black text-blue-600 mt-0.5 block">{summaryMetrics.totalProdMtr.toLocaleString()} M</strong>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Run Days</span>
          <strong className="text-lg font-black text-slate-700 mt-0.5 block">{summaryMetrics.totalRunDays}</strong>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Avg Production</span>
          <strong className="text-lg font-black text-emerald-600 mt-0.5 block">{summaryMetrics.avgDailyProd} <span className="text-xs font-normal">m/d</span></strong>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Avg Efficiency</span>
          <strong className={`text-lg font-black mt-0.5 block ${summaryMetrics.avgEfficiency >= 90 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {summaryMetrics.avgEfficiency}%
          </strong>
        </div>
      </div>

      {/* Advanced Filter Toolbar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5 items-end">
          {/* Search */}
          <div className="lg:col-span-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Search</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Loom, design, construction, beam..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* From Date */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Order Type: Grey / YD / All */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Order Type</label>
            <select
              value={orderTypeFilter}
              onChange={e => setOrderTypeFilter(e.target.value as any)}
              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All (Grey & YD)</option>
              <option value="GREY">Grey Orders</option>
              <option value="YD">Yarn Dyed (YD)</option>
            </select>
          </div>

          {/* Unit Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Unit</label>
            <select
              value={unitFilter}
              onChange={e => setUnitFilter(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Units</option>
              {uniqueUnits.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          {/* Sort Change Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Sort Change</label>
            <select
              value={sortChangeFilter}
              onChange={e => setSortChangeFilter(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Sorts</option>
              <option value="GAITING">Gaiting</option>
              <option value="KNOTTING">Knotting</option>
              <option value="KNOTTING_SORT_CHANGE">Sort Change</option>
            </select>
          </div>

          {/* Reset Action */}
          <div className="flex gap-1.5">
            <button
              onClick={handleResetFilters}
              className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          </div>
        </div>
      </div>

      {/* Main 17 Columns Warp History Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1">
        <div className="p-3.5 border-b border-slate-100 bg-slate-50 flex justify-between items-center text-xs font-bold text-slate-600 print:hidden">
          <span>Showing {filteredData.length} Completed Weave Runs</span>
          {orderTypeFilter !== 'ALL' && (
            <span className="px-2 py-0.5 rounded text-[11px] font-black bg-indigo-100 text-indigo-700">
              Filter Active: {orderTypeFilter === 'GREY' ? 'Grey Orders Only' : 'Yarn Dyed Orders Only'}
            </span>
          )}
        </div>

        <div className="overflow-auto custom-scrollbar flex-1 relative">
          <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
            <thead className="bg-slate-100/90 text-slate-700 sticky top-0 shadow-sm z-10 border-b border-slate-200 text-[11px] font-black uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3 border-r border-slate-200 text-center w-12">1. Loom</th>
                <th className="py-2.5 px-3 border-r border-slate-200 w-16">2. Unit</th>
                <th className="py-2.5 px-3 border-r border-slate-200 min-w-[150px]">3. Running Design / SP No</th>
                <th className="py-2.5 px-3 border-r border-slate-200 min-w-[200px]">4. Construction</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-center w-16">5. Reed</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-center w-14">6. Pick</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-center w-16">7. Width</th>
                <th className="py-2.5 px-3 border-r border-slate-200 min-w-[90px]">8. Set No</th>
                <th className="py-2.5 px-3 border-r border-slate-200 min-w-[130px]">9. Beam No</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-center w-24">10. Sort Change</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-right w-24">11. Start Date</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-right w-24">12. End Date</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-right w-24">13. Warp Mtr</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-right w-24">14. Prod Mtr</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-right w-20">15. Run Days</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-right w-24">16. Avg Prod</th>
                <th className="py-2.5 px-3 text-right w-24">17. Efficiency %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={17} className="py-12 text-center text-slate-400 font-medium">
                    No completed warp records found matching the selected filters.
                  </td>
                </tr>
              ) : (
                filteredData.map((row, idx) => {
                  let unit = row.unit;
                  if (!unit || unit === 'Unknown') {
                    const l = looms.find(loom => loom.loomNo === row.loomNo);
                    unit = l ? l.unit : '-';
                  }
                  if (unit && unit !== '-' && !unit.startsWith('Unit')) {
                    unit = `Unit ${unit}`;
                  }

                  const sortBadge = row.sortChangeType === 'KNOTTING'
                    ? { label: '✂️ Knotting', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' }
                    : row.sortChangeType === 'KNOTTING_SORT_CHANGE'
                    ? { label: '🔄 Sort Chg', cls: 'bg-amber-100 text-amber-900 border-amber-300' }
                    : row.sortChangeType === 'GAITING'
                    ? { label: '⚙️ Gaiting', cls: 'bg-purple-100 text-purple-900 border-purple-300' }
                    : null;

                  return (
                    <tr key={row.id || idx} className="hover:bg-indigo-50/20 transition-colors">
                      {/* 1. Loom No */}
                      <td className="py-2.5 px-3 font-black text-slate-900 text-center border-r border-slate-100">
                        {row.loomNo}
                      </td>

                      {/* 2. Unit */}
                      <td className="py-2.5 px-3 font-semibold text-slate-600 border-r border-slate-100">
                        {unit}
                      </td>

                      {/* 3. Running Design / Design / SP No */}
                      <td className="py-2.5 px-3 font-bold text-slate-800 border-r border-slate-100">
                        <span className="font-mono">{row.designNo}</span>
                        {row.orderType === 'YD' && (
                          <span className="ml-1.5 px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded text-[9px] font-black uppercase">
                            YD
                          </span>
                        )}
                      </td>

                      {/* 4. Construction */}
                      <td className="py-2.5 px-3 text-slate-700 border-r border-slate-100 font-medium">
                        {row.construction && row.construction !== 'Not Available' ? (
                          <span title={row.construction}>{row.construction}</span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Not Available</span>
                        )}
                      </td>

                      {/* 5. Reed */}
                      <td className="py-2.5 px-3 text-center text-slate-700 font-semibold border-r border-slate-100">
                        {row.reed && row.reed !== 'Not Available' ? row.reed : <span className="text-slate-400 italic text-[11px]">—</span>}
                      </td>

                      {/* 6. Pick */}
                      <td className="py-2.5 px-3 text-center text-slate-700 font-semibold border-r border-slate-100">
                        {row.pick && row.pick !== 'Not Available' ? row.pick : <span className="text-slate-400 italic text-[11px]">—</span>}
                      </td>

                      {/* 7. Width */}
                      <td className="py-2.5 px-3 text-center text-slate-700 font-semibold border-r border-slate-100">
                        {row.width && row.width !== 'Not Available' ? `${row.width}"` : <span className="text-slate-400 italic text-[11px]">—</span>}
                      </td>

                      {/* 8. Set No */}
                      <td className="py-2.5 px-3 text-slate-700 font-semibold border-r border-slate-100">
                        {row.setNo && row.setNo !== 'Not Available' ? row.setNo : <span className="text-slate-400 italic text-[11px]">Not Available</span>}
                      </td>

                      {/* 9. Beam No */}
                      <td className="py-2.5 px-3 text-slate-700 font-semibold border-r border-slate-100">
                        {row.beamNo && row.beamNo !== 'Not Available' ? (
                          <span className="font-mono text-indigo-700 font-bold">{row.beamNo}</span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Not Available</span>
                        )}
                      </td>

                      {/* 10. Sort Change */}
                      <td className="py-2.5 px-3 text-center border-r border-slate-100">
                        {sortBadge ? (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${sortBadge.cls}`}>
                            {sortBadge.label}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* 11. Start Date */}
                      <td className="py-2.5 px-3 text-right text-slate-600 font-medium border-r border-slate-100">
                        {row.startDate ? format(parseISO(row.startDate), 'dd/MM/yyyy') : '—'}
                      </td>

                      {/* 12. End Date */}
                      <td className="py-2.5 px-3 text-right text-slate-600 font-medium border-r border-slate-100">
                        {row.endDate ? format(parseISO(row.endDate), 'dd/MM/yyyy') : '—'}
                      </td>

                      {/* 13. Warp Mtr */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700 border-r border-slate-100">
                        {Math.round(row.warpMeter).toLocaleString()}
                      </td>

                      {/* 14. Prod Mtr */}
                      <td className="py-2.5 px-3 text-right font-mono font-black text-blue-700 border-r border-slate-100">
                        {Math.round(row.totalProductionMeter).toLocaleString()}
                      </td>

                      {/* 15. Run Days */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700 border-r border-slate-100">
                        {row.runningDays}
                      </td>

                      {/* 16. Avg Prod */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-800 font-bold border-r border-slate-100">
                        {Math.round(row.avgDailyProduction).toLocaleString()}
                      </td>

                      {/* 17. Efficiency % */}
                      <td className="py-2.5 px-3 text-right font-mono font-black">
                        <span className={row.efficiencyPct >= 95 ? 'text-emerald-600' : 'text-amber-600'}>
                          {row.efficiencyPct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
