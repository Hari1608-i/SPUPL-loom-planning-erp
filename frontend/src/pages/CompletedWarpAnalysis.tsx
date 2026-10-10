import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Activity, Download, Filter, RotateCcw, Calendar, Printer, Layers, Cpu, CheckCircle2 } from 'lucide-react';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { useAppContext } from '../context/AppProvider';
import { CompanyPrintHeader } from '../components/common/CompanyPrintHeader';
import { triggerPrint } from '../utils/printManager';

export default function CompletedWarpAnalysis() {
  const { completedHistory, looms } = useAppContext();

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [unitFilter, setUnitFilter] = useState('ALL');
  const [loomFilter, setLoomFilter] = useState('ALL');
  const [designFilter, setDesignFilter] = useState('ALL');
  const [sortChangeFilter, setSortChangeFilter] = useState('ALL');
  const [orderTypeFilter, setOrderTypeFilter] = useState<'ALL' | 'GREY' | 'YD'>('ALL');
  const [activeAnalysisView, setActiveAnalysisView] = useState<'DESIGN' | 'LOOM' | 'UNIT' | 'SORT' | 'ORDER_TYPE'>('DESIGN');

  // Distinct filter values
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

  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setUnitFilter('ALL');
    setLoomFilter('ALL');
    setDesignFilter('ALL');
    setSortChangeFilter('ALL');
    setOrderTypeFilter('ALL');
  };

  // Filtered dataset
  const filteredHistory = useMemo(() => {
    return completedHistory.filter(h => {
      // Date range filter
      if (fromDate || toDate) {
        try {
          const runDate = parseISO(h.endDate);
          if (fromDate && runDate < startOfDay(parseISO(fromDate))) return false;
          if (toDate && runDate > endOfDay(parseISO(toDate))) return false;
        } catch (e) {}
      }

      // Unit filter
      if (unitFilter !== 'ALL') {
        let u = h.unit || '';
        if (u && !u.startsWith('Unit')) u = `Unit ${u}`;
        if (u !== unitFilter) return false;
      }

      // Loom filter
      if (loomFilter !== 'ALL' && Number(h.loomNo) !== Number(loomFilter)) {
        return false;
      }

      // Design filter
      if (designFilter !== 'ALL' && (h.designNo || '').trim() !== designFilter) {
        return false;
      }

      // Sort Change filter
      if (sortChangeFilter !== 'ALL') {
        const sc = (h.sortChangeType || '').toUpperCase();
        if (sortChangeFilter === 'GAITING' && sc !== 'GAITING') return false;
        if (sortChangeFilter === 'KNOTTING' && sc !== 'KNOTTING') return false;
        if (sortChangeFilter === 'KNOTTING_SORT_CHANGE' && sc !== 'KNOTTING_SORT_CHANGE') return false;
      }

      // Order Type filter
      if (orderTypeFilter !== 'ALL') {
        const ot = (h.orderType || 'GREY').toUpperCase();
        if (orderTypeFilter === 'GREY' && ot.includes('YD')) return false;
        if (orderTypeFilter === 'YD' && !ot.includes('YD')) return false;
      }

      return true;
    });
  }, [completedHistory, fromDate, toDate, unitFilter, loomFilter, designFilter, sortChangeFilter, orderTypeFilter]);

  // Summary Metrics
  const summary = useMemo(() => {
    const count = filteredHistory.length;
    const totalWarp = filteredHistory.reduce((s, h) => s + (Number(h.warpMeter) || 0), 0);
    const totalProd = filteredHistory.reduce((s, h) => s + (Number(h.totalProductionMeter) || 0), 0);
    const totalDays = filteredHistory.reduce((s, h) => s + (Number(h.runningDays) || 0), 0);
    const avgDuration = count > 0 ? (totalDays / count).toFixed(1) : '0';
    const avgDailyProd = totalDays > 0 ? Math.round(totalProd / totalDays) : 0;
    const avgEfficiency = totalWarp > 0 ? ((totalProd / totalWarp) * 100).toFixed(1) : (
      count > 0 ? (filteredHistory.reduce((s, h) => s + (Number(h.efficiencyPct) || 0), 0) / count).toFixed(1) : '0'
    );

    return {
      count,
      totalWarp: Math.round(totalWarp),
      totalProd: Math.round(totalProd),
      totalDays,
      avgDuration,
      avgDailyProd,
      avgEfficiency
    };
  }, [filteredHistory]);

  // Aggregate by Design
  const designRollups = useMemo(() => {
    const agg: Record<string, { count: number; totalWarp: number; totalProd: number; totalDays: number; totalEff: number }> = {};
    filteredHistory.forEach(h => {
      const d = h.designNo || 'Unknown';
      if (!agg[d]) {
        agg[d] = { count: 0, totalWarp: 0, totalProd: 0, totalDays: 0, totalEff: 0 };
      }
      agg[d].count += 1;
      agg[d].totalWarp += Number(h.warpMeter) || 0;
      agg[d].totalProd += Number(h.totalProductionMeter) || 0;
      agg[d].totalDays += Number(h.runningDays) || 0;
      agg[d].totalEff += Number(h.efficiencyPct) || 0;
    });

    return Object.entries(agg).map(([designNo, data]) => ({
      designNo,
      count: data.count,
      totalWarp: Math.round(data.totalWarp),
      totalProd: Math.round(data.totalProd),
      avgDays: data.count > 0 ? Number((data.totalDays / data.count).toFixed(1)) : 0,
      avgProd: data.totalDays > 0 ? Math.round(data.totalProd / data.totalDays) : 0,
      avgEff: data.count > 0 ? Number((data.totalEff / data.count).toFixed(1)) : 0
    })).sort((a, b) => b.totalProd - a.totalProd);
  }, [filteredHistory]);

  // Aggregate by Unit
  const unitRollups = useMemo(() => {
    const agg: Record<string, { count: number; totalWarp: number; totalProd: number; totalDays: number; totalEff: number }> = {};
    filteredHistory.forEach(h => {
      let unit = h.unit;
      if (!unit || unit === 'Unknown') {
        const loom = looms.find(l => l.loomNo === h.loomNo);
        unit = loom ? loom.unit : 'Unknown';
      }
      if (unit && unit !== 'Unknown' && !unit.startsWith('Unit')) {
        unit = `Unit ${unit}`;
      }
      if (!agg[unit]) {
        agg[unit] = { count: 0, totalWarp: 0, totalProd: 0, totalDays: 0, totalEff: 0 };
      }
      agg[unit].count += 1;
      agg[unit].totalWarp += Number(h.warpMeter) || 0;
      agg[unit].totalProd += Number(h.totalProductionMeter) || 0;
      agg[unit].totalDays += Number(h.runningDays) || 0;
      agg[unit].totalEff += Number(h.efficiencyPct) || 0;
    });

    return Object.entries(agg).map(([unit, data]) => ({
      unit,
      count: data.count,
      totalWarp: Math.round(data.totalWarp),
      totalProd: Math.round(data.totalProd),
      avgDays: data.count > 0 ? Number((data.totalDays / data.count).toFixed(1)) : 0,
      avgProd: data.totalDays > 0 ? Math.round(data.totalProd / data.totalDays) : 0,
      avgEff: data.count > 0 ? Number((data.totalEff / data.count).toFixed(1)) : 0
    })).sort((a, b) => a.unit.localeCompare(b.unit));
  }, [filteredHistory, looms]);

  // Aggregate by Loom
  const loomRollups = useMemo(() => {
    const agg: Record<number, { count: number; unit: string; totalWarp: number; totalProd: number; totalDays: number; totalEff: number }> = {};
    filteredHistory.forEach(h => {
      const lNo = Number(h.loomNo);
      let unit = h.unit;
      if (!unit || unit === 'Unknown') {
        const loom = looms.find(l => l.loomNo === lNo);
        unit = loom ? loom.unit : '-';
      }
      if (unit && unit !== '-' && !unit.startsWith('Unit')) unit = `Unit ${unit}`;

      if (!agg[lNo]) {
        agg[lNo] = { count: 0, unit, totalWarp: 0, totalProd: 0, totalDays: 0, totalEff: 0 };
      }
      agg[lNo].count += 1;
      agg[lNo].totalWarp += Number(h.warpMeter) || 0;
      agg[lNo].totalProd += Number(h.totalProductionMeter) || 0;
      agg[lNo].totalDays += Number(h.runningDays) || 0;
      agg[lNo].totalEff += Number(h.efficiencyPct) || 0;
    });

    return Object.entries(agg).map(([loomNo, data]) => ({
      loomNo: Number(loomNo),
      unit: data.unit,
      count: data.count,
      totalWarp: Math.round(data.totalWarp),
      totalProd: Math.round(data.totalProd),
      avgDays: data.count > 0 ? Number((data.totalDays / data.count).toFixed(1)) : 0,
      avgProd: data.totalDays > 0 ? Math.round(data.totalProd / data.totalDays) : 0,
      avgEff: data.count > 0 ? Number((data.totalEff / data.count).toFixed(1)) : 0
    })).sort((a, b) => b.totalProd - a.totalProd);
  }, [filteredHistory, looms]);

  // Aggregate by Sort Change
  const sortChangeRollups = useMemo(() => {
    const agg: Record<string, { count: number; totalProd: number; totalDays: number; totalEff: number }> = {};
    filteredHistory.forEach(h => {
      const sc = h.sortChangeType === 'KNOTTING' ? 'Knotting'
        : h.sortChangeType === 'KNOTTING_SORT_CHANGE' ? 'Knotting Sort Change'
        : h.sortChangeType === 'GAITING' ? 'Gaiting' : 'Standard / Other';

      if (!agg[sc]) agg[sc] = { count: 0, totalProd: 0, totalDays: 0, totalEff: 0 };
      agg[sc].count += 1;
      agg[sc].totalProd += Number(h.totalProductionMeter) || 0;
      agg[sc].totalDays += Number(h.runningDays) || 0;
      agg[sc].totalEff += Number(h.efficiencyPct) || 0;
    });

    return Object.entries(agg).map(([sortChange, data]) => ({
      sortChange,
      count: data.count,
      totalProd: Math.round(data.totalProd),
      avgDays: data.count > 0 ? Number((data.totalDays / data.count).toFixed(1)) : 0,
      avgEff: data.count > 0 ? Number((data.totalEff / data.count).toFixed(1)) : 0
    })).sort((a, b) => b.count - a.count);
  }, [filteredHistory]);

  // Aggregate by Order Type (Grey vs YD)
  const orderTypeRollups = useMemo(() => {
    const agg: Record<string, { count: number; totalWarp: number; totalProd: number; totalDays: number; totalEff: number }> = {};
    filteredHistory.forEach(h => {
      const ot = (h.orderType || '').toUpperCase().includes('YD') ? 'Yarn Dyed (YD)' : 'Grey Fabric';
      if (!agg[ot]) agg[ot] = { count: 0, totalWarp: 0, totalProd: 0, totalDays: 0, totalEff: 0 };
      agg[ot].count += 1;
      agg[ot].totalWarp += Number(h.warpMeter) || 0;
      agg[ot].totalProd += Number(h.totalProductionMeter) || 0;
      agg[ot].totalDays += Number(h.runningDays) || 0;
      agg[ot].totalEff += Number(h.efficiencyPct) || 0;
    });

    return Object.entries(agg).map(([type, data]) => ({
      type,
      count: data.count,
      totalWarp: Math.round(data.totalWarp),
      totalProd: Math.round(data.totalProd),
      avgDays: data.count > 0 ? Number((data.totalDays / data.count).toFixed(1)) : 0,
      avgEff: data.count > 0 ? Number((data.totalEff / data.count).toFixed(1)) : 0
    }));
  }, [filteredHistory]);

  // Export Analysis to Excel
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary & Design-Wise Performance
    const designData = designRollups.map(d => ({
      'Design No': d.designNo,
      'Warps Completed': d.count,
      'Total Warp Mtr': d.totalWarp,
      'Total Prod Mtr': d.totalProd,
      'Avg Run Days': d.avgDays,
      'Avg Daily Prod': d.avgProd,
      'Avg Efficiency %': d.avgEff
    }));
    const wsDesign = XLSX.utils.json_to_sheet(designData);
    XLSX.utils.book_append_sheet(wb, wsDesign, 'Design Performance');

    // Sheet 2: Loom Performance
    const loomData = loomRollups.map(l => ({
      'Loom No': `L-${l.loomNo}`,
      'Unit': l.unit,
      'Warps Completed': l.count,
      'Total Prod Mtr': l.totalProd,
      'Avg Run Days': l.avgDays,
      'Avg Daily Prod': l.avgProd,
      'Avg Efficiency %': l.avgEff
    }));
    const wsLoom = XLSX.utils.json_to_sheet(loomData);
    XLSX.utils.book_append_sheet(wb, wsLoom, 'Loom Performance');

    // Sheet 3: Unit Performance
    const unitData = unitRollups.map(u => ({
      'Unit': u.unit,
      'Warps Completed': u.count,
      'Total Prod Mtr': u.totalProd,
      'Avg Daily Prod': u.avgProd,
      'Avg Efficiency %': u.avgEff
    }));
    const wsUnit = XLSX.utils.json_to_sheet(unitData);
    XLSX.utils.book_append_sheet(wb, wsUnit, 'Unit Performance');

    // Sheet 4: Grey vs YD
    const otData = orderTypeRollups.map(o => ({
      'Order Type': o.type,
      'Warps Completed': o.count,
      'Total Warp Mtr': o.totalWarp,
      'Total Prod Mtr': o.totalProd,
      'Avg Run Days': o.avgDays,
      'Avg Efficiency %': o.avgEff
    }));
    const wsOT = XLSX.utils.json_to_sheet(otData);
    XLSX.utils.book_append_sheet(wb, wsOT, 'Grey vs YD');

    XLSX.writeFile(wb, `SPUPL_Warp_Analysis_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const handleExportPDF = () => {
    triggerPrint({ orientation: 'landscape', title: 'Completed Warp Analysis Report' });
  };

  return (
    <div className="space-y-6">
      <CompanyPrintHeader
        title="Completed Warp Analysis & Efficiency Analytics"
        subtitle={`Period: ${fromDate ? format(parseISO(fromDate), 'dd/MM/yyyy') : 'All'} to ${toDate ? format(parseISO(toDate), 'dd/MM/yyyy') : 'All'} | Type: ${orderTypeFilter}`}
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center tracking-tight">
            <Activity className="w-7 h-7 mr-3 text-indigo-600 p-1.5 bg-indigo-50 rounded-xl" /> Completed Warp Analysis
          </h1>
          <p className="text-slate-500 text-xs mt-1 font-medium">
            Multi-dimensional performance analysis across Designs, Looms, Units, Sort Change Types, and Grey vs YD fabric production.
          </p>
        </div>

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
            title="Export Analysis to Excel"
          >
            <Download className="w-4 h-4 mr-1.5" /> Export Excel
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Completed Runs</span>
          <strong className="text-lg font-black text-slate-800 mt-0.5 block">{summary.count}</strong>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Warp Mtr</span>
          <strong className="text-lg font-black text-indigo-600 mt-0.5 block">{summary.totalWarp.toLocaleString()} M</strong>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Prod Mtr</span>
          <strong className="text-lg font-black text-blue-600 mt-0.5 block">{summary.totalProd.toLocaleString()} M</strong>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Avg Run Days</span>
          <strong className="text-lg font-black text-slate-700 mt-0.5 block">{summary.avgDuration} <span className="text-xs font-normal">days</span></strong>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Avg Production</span>
          <strong className="text-lg font-black text-emerald-600 mt-0.5 block">{summary.avgDailyProd} <span className="text-xs font-normal">m/d</span></strong>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Avg Efficiency</span>
          <strong className={`text-lg font-black mt-0.5 block ${Number(summary.avgEfficiency) >= 90 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {summary.avgEfficiency}%
          </strong>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5 items-end">
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

          {/* Loom Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Loom No</label>
            <select
              value={loomFilter}
              onChange={e => setLoomFilter(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Looms</option>
              {uniqueLooms.map(l => (
                <option key={l} value={l}>Loom {l}</option>
              ))}
            </select>
          </div>

          {/* Design Filter */}
          <div className="lg:col-span-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Design / SP No</label>
            <select
              value={designFilter}
              onChange={e => setDesignFilter(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Designs</option>
              {uniqueDesigns.map(d => (
                <option key={d} value={d}>{d}</option>
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

          {/* Order Type */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Order Type</label>
            <select
              value={orderTypeFilter}
              onChange={e => setOrderTypeFilter(e.target.value as any)}
              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All (Grey & YD)</option>
              <option value="GREY">Grey Fabric</option>
              <option value="YD">Yarn Dyed (YD)</option>
            </select>
          </div>
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-slate-100">
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setActiveAnalysisView('DESIGN')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${activeAnalysisView === 'DESIGN' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Design-Wise
            </button>
            <button
              onClick={() => setActiveAnalysisView('LOOM')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${activeAnalysisView === 'LOOM' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Loom-Wise
            </button>
            <button
              onClick={() => setActiveAnalysisView('UNIT')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${activeAnalysisView === 'UNIT' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Unit-Wise
            </button>
            <button
              onClick={() => setActiveAnalysisView('SORT')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${activeAnalysisView === 'SORT' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Sort Change
            </button>
            <button
              onClick={() => setActiveAnalysisView('ORDER_TYPE')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${activeAnalysisView === 'ORDER_TYPE' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Grey vs YD
            </button>
          </div>

          <button
            onClick={handleResetFilters}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Filter
          </button>
        </div>
      </div>

      {/* Main Analysis Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* VIEW 1: DESIGN-WISE */}
        {activeAnalysisView === 'DESIGN' && (
          <div className="overflow-x-auto p-4 max-h-[600px] custom-scrollbar">
            <div className="text-xs font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" /> Design-Wise Performance Roll-Up ({designRollups.length} Designs)
            </div>
            <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
              <thead className="bg-slate-100/90 text-slate-700 sticky top-0 shadow-sm z-10 border-b border-slate-200 text-[11px] font-black uppercase">
                <tr>
                  <th className="py-2.5 px-4">Design / SP No</th>
                  <th className="py-2.5 px-4 text-right">Warps Completed</th>
                  <th className="py-2.5 px-4 text-right">Total Warp Mtr</th>
                  <th className="py-2.5 px-4 text-right">Total Prod Mtr</th>
                  <th className="py-2.5 px-4 text-right">Avg Run Days</th>
                  <th className="py-2.5 px-4 text-right">Avg Daily Prod</th>
                  <th className="py-2.5 px-4 text-right">Avg Efficiency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {designRollups.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-slate-400">No records found.</td></tr>
                ) : (
                  designRollups.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{row.designNo}</td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-600">{row.count}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">{row.totalWarp.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-blue-700">{row.totalProd.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">{row.avgDays} d</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">{row.avgProd} m/d</td>
                      <td className="py-3 px-4 text-right font-mono font-black">
                        <span className={row.avgEff >= 95 ? 'text-emerald-600' : 'text-amber-600'}>
                          {row.avgEff}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* VIEW 2: LOOM-WISE */}
        {activeAnalysisView === 'LOOM' && (
          <div className="overflow-x-auto p-4 max-h-[600px] custom-scrollbar">
            <div className="text-xs font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-600" /> Loom-Wise Production & Efficiency ({loomRollups.length} Looms)
            </div>
            <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
              <thead className="bg-slate-100/90 text-slate-700 sticky top-0 shadow-sm z-10 border-b border-slate-200 text-[11px] font-black uppercase">
                <tr>
                  <th className="py-2.5 px-4">Loom No</th>
                  <th className="py-2.5 px-4">Unit</th>
                  <th className="py-2.5 px-4 text-right">Warps Completed</th>
                  <th className="py-2.5 px-4 text-right">Total Warp Mtr</th>
                  <th className="py-2.5 px-4 text-right">Total Prod Mtr</th>
                  <th className="py-2.5 px-4 text-right">Avg Run Days</th>
                  <th className="py-2.5 px-4 text-right">Avg Daily Prod</th>
                  <th className="py-2.5 px-4 text-right">Avg Efficiency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loomRollups.length === 0 ? (
                  <tr><td colSpan={8} className="py-8 text-center text-slate-400">No records found.</td></tr>
                ) : (
                  loomRollups.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-black text-slate-900">Loom {row.loomNo}</td>
                      <td className="py-3 px-4 text-slate-600 font-semibold">{row.unit}</td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-600">{row.count}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">{row.totalWarp.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-blue-700">{row.totalProd.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">{row.avgDays} d</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">{row.avgProd} m/d</td>
                      <td className="py-3 px-4 text-right font-mono font-black">
                        <span className={row.avgEff >= 95 ? 'text-emerald-600' : 'text-amber-600'}>
                          {row.avgEff}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* VIEW 3: UNIT-WISE */}
        {activeAnalysisView === 'UNIT' && (
          <div className="p-6 space-y-6">
            <div className="text-xs font-bold text-slate-600 uppercase flex items-center gap-2">
              Unit-Wise Overall Weaving Efficiency & Volume
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {unitRollups.map((u, idx) => (
                <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-black text-slate-800 text-sm">{u.unit}</span>
                    <span className="font-mono font-black text-base text-indigo-700">{u.avgEff}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full ${u.avgEff >= 95 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                      style={{ width: `${Math.min(u.avgEff, 100)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-center text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block font-bold">Warps</span>
                      <strong className="text-slate-800 font-bold">{u.count}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block font-bold">Total Prod</span>
                      <strong className="text-blue-700 font-mono font-bold">{u.totalProd.toLocaleString()} M</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block font-bold">Avg Prod</span>
                      <strong className="text-slate-800 font-mono font-bold">{u.avgProd} m/d</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 4: SORT CHANGE */}
        {activeAnalysisView === 'SORT' && (
          <div className="p-6 space-y-4">
            <div className="text-xs font-bold text-slate-600 uppercase flex items-center gap-2">
              Sort Change Operational Impact
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {sortChangeRollups.map((s, idx) => (
                <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-black text-slate-800 text-sm">{s.sortChange}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-100 text-indigo-700">
                      {s.count} Runs
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 text-xs space-y-1">
                    <div className="flex justify-between text-slate-600">
                      <span>Total Production:</span>
                      <strong className="font-mono text-slate-900">{s.totalProd.toLocaleString()} M</strong>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Avg Run Duration:</span>
                      <strong className="font-mono text-slate-900">{s.avgDays} Days</strong>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Avg Efficiency:</span>
                      <strong className="font-mono text-emerald-600">{s.avgEff}%</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 5: GREY VS YD */}
        {activeAnalysisView === 'ORDER_TYPE' && (
          <div className="p-6 space-y-4">
            <div className="text-xs font-bold text-slate-600 uppercase flex items-center gap-2">
              Grey Fabric vs Yarn Dyed (YD) Production Comparison
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {orderTypeRollups.map((ot, idx) => (
                <div key={idx} className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-black text-slate-900 text-base">{ot.type}</span>
                    <span className={`px-2.5 py-1 rounded text-xs font-black ${ot.type.includes('YD') ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-200 text-slate-800'}`}>
                      {ot.count} Runs
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs pt-2 border-t border-slate-200">
                    <div className="flex justify-between text-slate-600">
                      <span>Total Warp Meters:</span>
                      <strong className="font-mono text-slate-900">{ot.totalWarp.toLocaleString()} M</strong>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Total Production Meters:</span>
                      <strong className="font-mono text-blue-700">{ot.totalProd.toLocaleString()} M</strong>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Avg Run Duration:</span>
                      <strong className="font-mono text-slate-900">{ot.avgDays} Days</strong>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Avg Efficiency:</span>
                      <strong className="font-mono text-emerald-600">{ot.avgEff}%</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
