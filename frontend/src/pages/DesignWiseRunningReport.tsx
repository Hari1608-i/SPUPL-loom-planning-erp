import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  LayoutGrid, Table as TableIcon, Search, Filter, RefreshCw, Download, FileText, 
  FileSpreadsheet, AlertTriangle, ChevronDown, ChevronRight, ArrowUpRight, 
  Zap, Building2, Layers, CheckCircle2, Clock, Calendar, ExternalLink, Info
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import { API_BASE_URL } from '../config';
import { calculateLoomRun } from '../utils/calculations';
import { CompanyPrintHeader } from '../components/common/CompanyPrintHeader';
import { triggerPrint } from '../utils/printManager';

interface RunningLoomItem {
  loomNo: number;
  designNo: string;
  loomStartDate: string;
  warpedMeter: number;
  dailyProduction: number;
  currentReedNo: string;
  currentBeamNo: string;
  unit: string;
  loomType: string;
  rpm: number;
  make: string;
  model: string;
  status: string;
  construction: string;
  weave: string;
  frames: number;
  weftColours: number;
  reedCount: string;
  pick: string;
  greigeWidth: string;
  crimpPercent: number;
  loomExistsInMaster: boolean;
  designExistsInMaster: boolean;
}

interface OrderItem {
  id: number;
  order_no: string;
  ibpo_no?: string;
  customer_name: string;
  design_no_sp_no: string;
  order_qty: number;
  grey_qty?: number;
  target_delivery_date?: string;
  status: string;
}

export default function DesignWiseRunningReport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // State variables
  const [runningLooms, setRunningLooms] = useState<RunningLoomItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<{ unmappedLooms: number[]; unmappedDesigns: string[] }>({
    unmappedLooms: [],
    unmappedDesigns: []
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'TABLE' | 'MATRIX'>('TABLE');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedUnit, setSelectedUnit] = useState<string>('ALL');
  const [selectedDesign, setSelectedDesign] = useState<string>('ALL');
  const [selectedLoomType, setSelectedLoomType] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('RUNNING');
  const [dateMode, setDateMode] = useState<'CURRENT' | 'TODAY' | 'CUSTOM'>('CURRENT');
  const [customDate, setCustomDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // Expandable rows
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Detail Modal states
  const [selectedLoomDetail, setSelectedLoomDetail] = useState<RunningLoomItem | null>(null);
  const [selectedDesignDetail, setSelectedDesignDetail] = useState<string | null>(null);

  // Fetch report data from backend API
  const fetchReportData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/reports/design-running`);
      if (!res.ok) throw new Error('Failed to fetch design-running report');
      const json = await res.json();
      if (json.success) {
        setRunningLooms(json.data || []);
        setValidationWarnings(json.validationWarnings || { unmappedLooms: [], unmappedDesigns: [] });
        setOrders(json.orders || []);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Error fetching design running report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, []);

  // Auto-refresh timer (30 sec interval when enabled)
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchReportData();
    }, 30000);
    return () => clearInterval(timer);
  }, [autoRefresh]);

  // Handle URL search queries if passed
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setSearchQuery(q);
  }, [searchParams]);

  // Unique lists for dropdown filters
  const availableUnits = useMemo(() => {
    const set = new Set<string>();
    runningLooms.forEach(item => set.add(item.unit));
    return Array.from(set).sort();
  }, [runningLooms]);

  const availableDesigns = useMemo(() => {
    const set = new Set<string>();
    runningLooms.forEach(item => set.add(item.designNo));
    return Array.from(set).sort();
  }, [runningLooms]);

  const availableLoomTypes = useMemo(() => {
    const set = new Set<string>();
    runningLooms.forEach(item => {
      if (item.loomType) set.add(item.loomType);
    });
    return Array.from(set).sort();
  }, [runningLooms]);

  // Filtered running looms based on search query & dropdown filters
  const filteredLooms = useMemo(() => {
    return runningLooms.filter(item => {
      // Unit filter
      if (selectedUnit !== 'ALL' && item.unit !== selectedUnit) return false;

      // Design filter
      if (selectedDesign !== 'ALL' && item.designNo !== selectedDesign) return false;

      // Loom Type filter
      if (selectedLoomType !== 'ALL' && item.loomType !== selectedLoomType) return false;

      // Search query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const matchesLoom = item.loomNo.toString().includes(q);
        const matchesDesign = item.designNo.toLowerCase().includes(q);
        const matchesUnit = item.unit.toLowerCase().includes(q);
        const matchesConst = item.construction.toLowerCase().includes(q);
        const matchesWeave = item.weave.toLowerCase().includes(q);
        if (!matchesLoom && !matchesDesign && !matchesUnit && !matchesConst && !matchesWeave) {
          return false;
        }
      }

      return true;
    });
  }, [runningLooms, selectedUnit, selectedDesign, selectedLoomType, selectedStatus, searchQuery]);

  // Executive Summary Metrics
  const summaryMetrics = useMemo(() => {
    const uniqueLoomNos = new Set(filteredLooms.map(l => l.loomNo));
    const uniqueDesigns = new Set(filteredLooms.map(l => l.designNo));
    const uniqueUnits = new Set(filteredLooms.map(l => l.unit));

    // Calculate highest running design
    const designCounts: Record<string, number> = {};
    filteredLooms.forEach(l => {
      designCounts[l.designNo] = (designCounts[l.designNo] || 0) + 1;
    });

    let topDesign = 'None';
    let topDesignCount = 0;
    Object.entries(designCounts).forEach(([design, count]) => {
      if (count > topDesignCount) {
        topDesignCount = count;
        topDesign = design;
      }
    });

    // Calculate highest running unit
    const unitCounts: Record<string, number> = {};
    filteredLooms.forEach(l => {
      unitCounts[l.unit] = (unitCounts[l.unit] || 0) + 1;
    });

    let topUnit = 'None';
    let topUnitCount = 0;
    Object.entries(unitCounts).forEach(([unit, count]) => {
      if (count > topUnitCount) {
        topUnitCount = count;
        topUnit = unit;
      }
    });

    return {
      totalRunningLooms: uniqueLoomNos.size,
      totalRunningDesigns: uniqueDesigns.size,
      totalActiveUnits: uniqueUnits.size,
      highestRunningDesign: topDesign !== 'None' ? `${topDesign} (${topDesignCount} Looms)` : 'N/A',
      highestRunningUnit: topUnit !== 'None' ? `${topUnit} (${topUnitCount} Looms)` : 'N/A'
    };
  }, [filteredLooms]);

  // Grouping logic: Group by Unit -> then by Design No
  const groupedData = useMemo(() => {
    const unitsMap: Record<string, Record<string, RunningLoomItem[]>> = {};

    filteredLooms.forEach(item => {
      const u = item.unit || 'UNIT 1';
      const d = item.designNo || 'UNKNOWN';

      if (!unitsMap[u]) {
        unitsMap[u] = {};
      }
      if (!unitsMap[u][d]) {
        unitsMap[u][d] = [];
      }
      unitsMap[u][d].push(item);
    });

    // Also calculate overall Design Totals (if design is present across multiple units)
    const designOverallMap: Record<string, { totalLooms: number; unitsBreakdown: Record<string, number> }> = {};
    filteredLooms.forEach(item => {
      const d = item.designNo;
      const u = item.unit;
      if (!designOverallMap[d]) {
        designOverallMap[d] = { totalLooms: 0, unitsBreakdown: {} };
      }
      designOverallMap[d].totalLooms += 1;
      designOverallMap[d].unitsBreakdown[u] = (designOverallMap[d].unitsBreakdown[u] || 0) + 1;
    });

    return { unitsMap, designOverallMap };
  }, [filteredLooms]);

  // Visual Matrix structure: Rows = Designs, Columns = Units
  const matrixData = useMemo(() => {
    const unitsList = availableUnits.length > 0 ? availableUnits : ['UNIT 1', 'UNIT 2', 'UNIT 3'];
    const designsList = availableDesigns;

    const rows = designsList.map(designNo => {
      const unitCounts: Record<string, number> = {};
      const unitLooms: Record<string, number[]> = {};
      const unitLoomsStr: Record<string, string> = {};
      let rowTotal = 0;

      unitsList.forEach(unit => {
        const loomsForCell = filteredLooms.filter(l => l.designNo === designNo && l.unit === unit);
        const count = loomsForCell.length;
        const sortedNos = loomsForCell.map(l => l.loomNo).sort((a, b) => a - b);
        unitCounts[unit] = count;
        unitLooms[unit] = sortedNos;
        unitLoomsStr[unit] = sortedNos.length > 0 ? sortedNos.map(n => `L-${n}`).join(', ') : '—';
        rowTotal += count;
      });

      return {
        designNo,
        unitCounts,
        unitLooms,
        unitLoomsStr,
        rowTotal
      };
    });

    return { unitsList, rows };
  }, [availableUnits, availableDesigns, filteredLooms]);

  // Expand / Collapse toggler for row details
  const toggleRowExpand = (rowKey: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [rowKey]: !prev[rowKey]
    }));
  };

  // Export Handlers
  const handleExportExcel = () => {
    // Sheet 1: Matrix View (Design x Unit with Loom Nos)
    const matrixExportRows = matrixData.rows.map(row => {
      const rowData: any = { 'Design No / SP No': row.designNo };
      matrixData.unitsList.forEach(unit => {
        const count = row.unitCounts[unit] || 0;
        const loomStr = row.unitLoomsStr[unit] || '—';
        rowData[unit] = count > 0 ? `${count} Looms (${loomStr})` : '0';
      });
      rowData['Total Looms'] = row.rowTotal;
      return rowData;
    });

    // Sheet 2: Detailed List
    const detailExportRows: any[] = [];
    Object.entries(groupedData.unitsMap).forEach(([unit, designs]) => {
      Object.entries(designs).forEach(([designNo, looms]) => {
        const sortedLoomNos = looms.map(l => `L-${l.loomNo}`).sort().join(', ');
        detailExportRows.push({
          Unit: unit,
          'Design No / SP No': designNo,
          'Loom Nos': sortedLoomNos,
          'Total Looms': looms.length,
          'Construction': looms[0]?.construction || '',
          'Weave': looms[0]?.weave || ''
        });
      });
    });

    const workbook = XLSX.utils.book_new();
    const matrixWorksheet = XLSX.utils.json_to_sheet(matrixExportRows);
    const detailWorksheet = XLSX.utils.json_to_sheet(detailExportRows);

    XLSX.utils.book_append_sheet(workbook, matrixWorksheet, 'Matrix View');
    XLSX.utils.book_append_sheet(workbook, detailWorksheet, 'Loom Details');

    XLSX.writeFile(workbook, `Design_Wise_Loom_Running_Report_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  const handleExportCSV = () => {
    const headers = ['Design No / SP No', ...matrixData.unitsList, 'Total Looms'];
    const rows: string[][] = [headers];

    matrixData.rows.forEach(row => {
      const line = [`"${row.designNo}"`];
      matrixData.unitsList.forEach(unit => {
        const count = row.unitCounts[unit] || 0;
        const loomStr = row.unitLoomsStr[unit] || '—';
        line.push(count > 0 ? `"${count} Looms (${loomStr})"` : '"0"');
      });
      line.push(`"${row.rowTotal}"`);
      rows.push(line);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Design_Wise_Loom_Running_Matrix_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    triggerPrint();
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto pb-20">
      <CompanyPrintHeader title="Design-Wise Loom Running Report" subtitle="Management Summary View" />
      
      {/* ── Top Header Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm print:hidden">

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Last Updated Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700/60 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Updated: {format(lastUpdated, 'HH:mm:ss')}</span>
          </div>

          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
              autoRefresh 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700'
                : 'bg-white text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${autoRefresh ? 'text-emerald-600 animate-pulse' : 'text-slate-400'}`} />
            <span>Auto Refresh {autoRefresh ? '(ON)' : '(OFF)'}</span>
          </button>

          {/* Manual Refresh Button */}
          <button
            onClick={fetchReportData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 text-white dark:bg-slate-700 hover:bg-slate-800 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-refresh-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {/* Export Dropdown / Buttons */}
          <div className="flex items-center gap-1 border border-slate-200 dark:border-slate-700 rounded-xl p-1 bg-slate-50 dark:bg-slate-800">
            <button
              onClick={handleExportExcel}
              title="Export to Excel"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-all border border-slate-200 dark:border-slate-600 shadow-2xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel</span>
            </button>
            <button
              onClick={handleExportCSV}
              title="Export to CSV"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-all border border-slate-200 dark:border-slate-600 shadow-2xs"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>CSV</span>
            </button>
            <button
              onClick={handleExportPDF}
              title="Print / Save PDF"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-700 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-all border border-slate-200 dark:border-slate-600 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-amber-600" />
              <span>PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Data Validation Warnings Banner (If Unmapped Looms or Designs Exist) ── */}
      {(validationWarnings.unmappedLooms.length > 0 || validationWarnings.unmappedDesigns.length > 0) && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 p-4 rounded-2xl flex items-start gap-3 text-amber-800 dark:text-amber-300 shadow-sm print:hidden">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
          <div className="text-xs space-y-1">
            <h4 className="font-bold text-sm">DATA VALIDATION WARNING</h4>
            {validationWarnings.unmappedLooms.length > 0 && (
              <p>
                • Looms present in Main Entry but missing from Loom Master: <span className="font-bold">{validationWarnings.unmappedLooms.join(', ')}</span>
              </p>
            )}
            {validationWarnings.unmappedDesigns.length > 0 && (
              <p>
                • Invalid Design references present in Main Entry: <span className="font-bold">{validationWarnings.unmappedDesigns.join(', ')}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Summary KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 print:hidden">
        {/* Card 1: TOTAL RUNNING LOOMS */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-black uppercase tracking-wider">Total Running Looms</span>
            <div className="p-2 bg-spu-primary/10 text-spu-primary rounded-lg">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white">
              {summaryMetrics.totalRunningLooms}
            </span>
            <span className="text-xs font-semibold text-slate-400">
              / 224 Total
            </span>
          </div>
        </div>

        {/* Card 2: TOTAL RUNNING DESIGNS */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-black uppercase tracking-wider">Running Designs</span>
            <div className="p-2 bg-blue-50 text-blue-600 dark:bg-blue-950/40 rounded-lg">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-slate-900 dark:text-white">
              {summaryMetrics.totalRunningDesigns}
            </span>
          </div>
        </div>

        {/* Card 3: TOTAL ACTIVE UNITS */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-black uppercase tracking-wider">Active Units</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 rounded-lg">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-slate-900 dark:text-white">
              {summaryMetrics.totalActiveUnits}
            </span>
          </div>
        </div>

        {/* Card 4: HIGHEST RUNNING DESIGN */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-black uppercase tracking-wider">Highest Running Design</span>
            <div className="p-2 bg-amber-50 text-amber-600 dark:bg-amber-950/40 rounded-lg">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-base font-black text-slate-900 dark:text-white truncate block" title={summaryMetrics.highestRunningDesign}>
              {summaryMetrics.highestRunningDesign}
            </span>
          </div>
        </div>

        {/* Card 5: HIGHEST RUNNING UNIT */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-black uppercase tracking-wider">Highest Running Unit</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 rounded-lg">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-base font-black text-slate-900 dark:text-white truncate block" title={summaryMetrics.highestRunningUnit}>
              {summaryMetrics.highestRunningUnit}
            </span>
          </div>
        </div>
      </div>

      {/* ── Filters & View Mode Control Bar ── */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4 print:hidden">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          
          {/* Search Input */}
          <div className="relative flex-1 min-w-[280px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search Loom No, Design No, Unit, Construction, Weave..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-spu-primary/30"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setViewMode('TABLE')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'TABLE'
                  ? 'bg-white dark:bg-slate-800 text-spu-primary shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              <TableIcon className="w-4 h-4" />
              <span>Table Matrix View</span>
            </button>
            <button
              onClick={() => setViewMode('MATRIX')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'MATRIX'
                  ? 'bg-white dark:bg-slate-800 text-spu-primary shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Visual Matrix View</span>
            </button>
          </div>
        </div>

        {/* Dropdown Filters Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2 border-t border-slate-100 dark:border-slate-700/60 text-xs">
          
          {/* Unit Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Unit</label>
            <select
              value={selectedUnit}
              onChange={e => setSelectedUnit(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-medium"
            >
              <option value="ALL">All Units</option>
              {availableUnits.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          {/* Design Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Design No</label>
            <select
              value={selectedDesign}
              onChange={e => setSelectedDesign(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-medium"
            >
              <option value="ALL">All Designs</option>
              {availableDesigns.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Loom Type Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Loom Type</label>
            <select
              value={selectedLoomType}
              onChange={e => setSelectedLoomType(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-medium"
            >
              <option value="ALL">All Loom Types</option>
              {availableLoomTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-medium"
            >
              <option value="RUNNING">Currently Running</option>
              <option value="ALL">All Statuses</option>
            </select>
          </div>

          {/* Date Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date Mode</label>
            <select
              value={dateMode}
              onChange={e => setDateMode(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-medium"
            >
              <option value="CURRENT">Current Running</option>
              <option value="TODAY">Today</option>
              <option value="CUSTOM">Custom Date</option>
            </select>
          </div>
        </div>

        {dateMode === 'CUSTOM' && (
          <div className="flex items-center gap-3 pt-2">
            <span className="text-xs font-semibold text-slate-500">Select Date:</span>
            <input
              type="date"
              value={customDate}
              onChange={e => setCustomDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
            />
          </div>
        )}
      </div>

      {/* ── Main Report Content ── */}

      {loading ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <RefreshCw className="w-8 h-8 text-spu-primary animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">Loading live Design-Wise Loom Running report...</p>
        </div>
      ) : viewMode === 'TABLE' ? (
        
        /* ── VIEW MODE 1: MATRIX TABLE VIEW (Grouped by Unit, then Design) ── */
        <div className="space-y-8">
          {Object.keys(groupedData.unitsMap).length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
              <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-base font-bold text-slate-700 dark:text-slate-200">No Running Looms Found</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or search query.</p>
            </div>
          ) : (
            Object.entries(groupedData.unitsMap).map(([unitName, designsMap]) => {
              const unitTotalLooms = Object.values(designsMap).reduce((acc, looms) => acc + looms.length, 0);

              return (
                <div key={unitName} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                  
                  {/* Unit Section Header */}
                  <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-spu-accent" />
                      <h2 className="text-base font-black tracking-wide uppercase">{unitName}</h2>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-800 px-3.5 py-1.5 rounded-xl border border-slate-700 text-xs font-bold">
                      <span className="text-slate-400 uppercase">Unit Running Looms:</span>
                      <span className="text-spu-accent text-sm font-black">{unitTotalLooms}</span>
                    </div>
                  </div>

                  {/* Unit Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-black uppercase tracking-wider">
                          <th className="py-3.5 px-4 w-12 text-center">#</th>
                          <th className="py-3.5 px-4">Design No / SP No</th>
                          <th className="py-3.5 px-4">Running Loom Numbers</th>
                          <th className="py-3.5 px-4 text-center">Total Looms</th>
                          <th className="py-3.5 px-4">Technical Spec</th>
                          <th className="py-3.5 px-4 text-right">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                        {Object.entries(designsMap).map(([designNo, looms], idx) => {
                          const rowKey = `${unitName}_${designNo}`;
                          const isExpanded = !!expandedRows[rowKey];

                          // Sorted loom numbers numerically
                          const sortedLooms = [...looms].sort((a, b) => a.loomNo - b.loomNo);

                          // Calculate runout dates range for this design
                          const runoutDates = sortedLooms.map(l => {
                            const calc = calculateLoomRun({
                              loomStartDate: new Date(l.loomStartDate),
                              warpedMeter: l.warpedMeter,
                              dailyProduction: l.dailyProduction,
                              crimpPercent: l.crimpPercent || 0.05
                            });
                            return calc.expectedRunoutDate;
                          });

                          const earliestRunout = runoutDates.length > 0 ? new Date(Math.min(...runoutDates.map(d => d.getTime()))) : null;
                          const latestRunout = runoutDates.length > 0 ? new Date(Math.max(...runoutDates.map(d => d.getTime()))) : null;

                          // Find active orders for this design
                          const designOrders = orders.filter(o => o.design_no_sp_no === designNo);

                          return (
                            <React.Fragment key={rowKey}>
                              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors group">
                                
                                {/* Expand toggle */}
                                <td className="py-3.5 px-4 text-center">
                                  <button
                                    onClick={() => toggleRowExpand(rowKey)}
                                    className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                                  >
                                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                  </button>
                                </td>

                                {/* Design No */}
                                <td className="py-3.5 px-4 font-black text-slate-900 dark:text-white">
                                  <button
                                    onClick={() => setSelectedDesignDetail(designNo)}
                                    className="text-spu-primary dark:text-blue-400 hover:underline flex items-center gap-1.5 text-xs font-black"
                                  >
                                    <span>{designNo}</span>
                                    <ExternalLink className="w-3 h-3 opacity-60" />
                                  </button>
                                </td>

                                {/* Loom Numbers */}
                                <td className="py-3.5 px-4 font-bold text-slate-700 dark:text-slate-200">
                                  <div className="flex flex-wrap gap-1.5 items-center">
                                    {sortedLooms.map(l => (
                                      <button
                                        key={l.loomNo}
                                        onClick={() => setSelectedLoomDetail(l)}
                                        className="px-2 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-spu-primary hover:text-white rounded-lg text-xs font-bold transition-all border border-slate-200 dark:border-slate-600"
                                        title="Click for loom details"
                                      >
                                        L-{l.loomNo}
                                      </button>
                                    ))}
                                  </div>
                                </td>

                                {/* Total Looms Count */}
                                <td className="py-3.5 px-4 text-center">
                                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-spu-primary/10 text-spu-primary dark:bg-blue-950/60 dark:text-blue-300 font-black text-sm">
                                    {looms.length}
                                  </span>
                                </td>

                                {/* Technical Specs */}
                                <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 text-[11px]">
                                  <div>Const: <span className="font-semibold text-slate-700 dark:text-slate-200">{looms[0]?.construction || 'N/A'}</span></div>
                                  <div>Weave: <span className="font-semibold text-slate-700 dark:text-slate-200">{looms[0]?.weave || 'N/A'}</span></div>
                                </td>

                                {/* Action Expand */}
                                <td className="py-3.5 px-4 text-right">
                                  <button
                                    onClick={() => toggleRowExpand(rowKey)}
                                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-bold transition-all"
                                  >
                                    {isExpanded ? 'Hide Details' : 'View Looms'}
                                  </button>
                                </td>
                              </tr>

                              {/* Expanded Row Breakdown */}
                              {isExpanded && (
                                <tr className="bg-slate-50/70 dark:bg-slate-900/50">
                                  <td colSpan={6} className="p-4">
                                    <div className="space-y-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
                                      
                                      {/* Runout Summary Bar */}
                                      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-xl border border-indigo-100 dark:border-indigo-900/50 text-xs">
                                        <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200 font-bold">
                                          <Info className="w-4 h-4 text-indigo-600" />
                                          <span>Runout Forecast for Design {designNo}:</span>
                                        </div>
                                        <div className="flex items-center gap-4 text-slate-700 dark:text-slate-300 font-semibold">
                                          <div>
                                            Earliest Runout: <span className="font-black text-amber-600 dark:text-amber-400">{earliestRunout ? format(earliestRunout, 'dd-MMM-yyyy') : 'N/A'}</span>
                                          </div>
                                          <div>
                                            Latest Runout: <span className="font-black text-emerald-600 dark:text-emerald-400">{latestRunout ? format(latestRunout, 'dd-MMM-yyyy') : 'N/A'}</span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Sub-table for running looms details */}
                                      <div>
                                        <h4 className="text-xs font-black uppercase text-slate-500 mb-2">Running Looms Breakdown</h4>
                                        <div className="overflow-x-auto">
                                          <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                            <thead className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                                              <tr>
                                                <th className="p-2.5">Loom No</th>
                                                <th className="p-2.5">Start Date</th>
                                                <th className="p-2.5">Warped Meter</th>
                                                <th className="p-2.5">Daily Prod (M)</th>
                                                <th className="p-2.5">Produced Meter</th>
                                                <th className="p-2.5">Net Balance (M)</th>
                                                <th className="p-2.5">Balance Days</th>
                                                <th className="p-2.5">Expected Runout</th>
                                                <th className="p-2.5">Status</th>
                                                <th className="p-2.5 text-right">Action</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                              {sortedLooms.map(loomItem => {
                                                const calc = calculateLoomRun({
                                                  loomStartDate: new Date(loomItem.loomStartDate),
                                                  warpedMeter: loomItem.warpedMeter,
                                                  dailyProduction: loomItem.dailyProduction,
                                                  crimpPercent: loomItem.crimpPercent || 0.05
                                                });

                                                return (
                                                  <tr key={loomItem.loomNo} className="hover:bg-slate-50 dark:hover:bg-slate-750">
                                                    <td className="p-2.5 font-black text-spu-primary">Loom {loomItem.loomNo}</td>
                                                    <td className="p-2.5">{loomItem.loomStartDate ? format(new Date(loomItem.loomStartDate), 'dd-MMM-yyyy') : 'N/A'}</td>
                                                    <td className="p-2.5 font-semibold">{loomItem.warpedMeter.toLocaleString()}</td>
                                                    <td className="p-2.5 font-semibold">{loomItem.dailyProduction}</td>
                                                    <td className="p-2.5 font-semibold">{calc.producedMeter.toFixed(0)}</td>
                                                    <td className="p-2.5 font-semibold">{calc.netBalanceMeter.toFixed(0)}</td>
                                                    <td className="p-2.5 font-bold">
                                                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                                                        calc.balanceDays <= 2 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                                                      }`}>
                                                        {calc.balanceDays.toFixed(1)} Days
                                                      </span>
                                                    </td>
                                                    <td className="p-2.5 font-semibold">{format(calc.expectedRunoutDate, 'dd-MMM-yyyy')}</td>
                                                    <td className="p-2.5">
                                                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">
                                                        {loomItem.status}
                                                      </span>
                                                    </td>
                                                    <td className="p-2.5 text-right">
                                                      <button
                                                        onClick={() => navigate(`/entry?loom=${loomItem.loomNo}`)}
                                                        className="px-2.5 py-1 bg-slate-900 text-white rounded text-[10px] font-bold hover:bg-slate-800"
                                                      >
                                                        Open Entry
                                                      </button>
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>

                                      {/* Order Management Connection */}
                                      {designOrders.length > 0 && (
                                        <div className="pt-2">
                                          <h4 className="text-xs font-black uppercase text-slate-500 mb-2">Connected Orders</h4>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                            {designOrders.map(ord => (
                                              <div key={ord.id} className="p-2.5 bg-slate-50 dark:bg-slate-700/60 rounded-lg border border-slate-200 dark:border-slate-600 flex items-center justify-between">
                                                <div>
                                                  <div className="font-bold text-slate-800 dark:text-white">{ord.order_no}</div>
                                                  <div className="text-[11px] text-slate-500">IBPO: {ord.ibpo_no || '—'}</div>
                                                </div>
                                                <div className="text-right">
                                                  <div className="font-bold text-spu-primary">{ord.order_qty.toLocaleString()} M</div>
                                                  <div className="text-[10px] text-slate-400">Status: {ord.status}</div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Unit Footer Total */}
                  <div className="bg-slate-100 dark:bg-slate-900 px-6 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs font-black">
                    <span className="uppercase text-slate-600 dark:text-slate-300">{unitName} TOTAL</span>
                    <span className="text-slate-900 dark:text-white text-sm">{unitTotalLooms} Running Looms</span>
                  </div>
                </div>
              );
            })
          )}

          {/* Overall Grand Total Footer */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 flex items-center justify-between shadow-xl">
            <div>
              <h3 className="text-lg font-black tracking-wide uppercase">GRAND TOTAL RUNNING LOOMS</h3>
              <p className="text-xs text-slate-400 mt-0.5">Unique count of currently active running looms</p>
            </div>
            <div className="text-right">
              <span className="text-4xl font-black text-spu-accent">
                {summaryMetrics.totalRunningLooms}
              </span>
              <span className="text-xs text-slate-400 block font-semibold">/ 224 Looms Active</span>
            </div>
          </div>
        </div>

      ) : (

        /* ── VIEW MODE 2: VISUAL MATRIX VIEW (Grid) ── */
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Visual Matrix View (Design × Unit)
              </h3>
              <p className="text-xs text-slate-500">Cross-tabular breakdown of running loom count for each Design per Unit</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs text-left">
              <thead>
                <tr className="bg-slate-900 text-white uppercase text-[11px] font-black tracking-wider">
                  <th className="p-3 border border-slate-700">Design No / SP No</th>
                  {matrixData.unitsList.map(unit => (
                    <th key={unit} className="p-3 border border-slate-700 text-center">{unit}</th>
                  ))}
                  <th className="p-3 border border-slate-700 text-center bg-slate-800">Total Looms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 font-semibold">
                {matrixData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={matrixData.unitsList.length + 2} className="p-6 text-center text-slate-400">
                      No design matrix data available.
                    </td>
                  </tr>
                ) : (
                  matrixData.rows.map(row => (
                    <tr key={row.designNo} className="hover:bg-slate-50 dark:hover:bg-slate-750">
                      
                      {/* Design Name */}
                      <td className="p-3 border border-slate-200 dark:border-slate-700 font-black text-slate-900 dark:text-white">
                        <button
                          onClick={() => setSelectedDesignDetail(row.designNo)}
                          className="hover:underline text-spu-primary dark:text-blue-400"
                        >
                          {row.designNo}
                        </button>
                      </td>

                      {/* Units Counts & Explicit Loom Nos */}
                      {matrixData.unitsList.map(unit => {
                        const count = row.unitCounts[unit] || 0;
                        const loomNosStr = row.unitLoomsStr[unit] || '—';

                        return (
                          <td 
                            key={unit} 
                            className={`p-3 border border-slate-200 dark:border-slate-700 text-center font-bold ${
                              count > 0 ? 'bg-emerald-50/70 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-300' : 'text-slate-300 dark:text-slate-600'
                            }`}
                          >
                            {count > 0 ? (
                              <div className="flex flex-col items-center justify-center space-y-1">
                                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-xs font-black shadow-xs">
                                  {count} {count === 1 ? 'Loom' : 'Looms'}
                                </span>
                                <span className="text-[11px] font-mono font-black text-indigo-900 dark:text-indigo-200 bg-white/90 dark:bg-slate-900 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 shadow-2xs">
                                  {loomNosStr}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 font-mono text-xs">0</span>
                            )}
                          </td>
                        );
                      })}

                      {/* Row Total */}
                      <td className="p-3 border border-slate-200 dark:border-slate-700 text-center font-black bg-slate-50 dark:bg-slate-900 text-spu-primary text-sm">
                        {row.rowTotal}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              
              {/* Matrix Footer Totals */}
              <tfoot>
                <tr className="bg-slate-900 text-white font-black">
                  <td className="p-3 border border-slate-700 uppercase">UNIT TOTALS</td>
                  {matrixData.unitsList.map(unit => {
                    const unitTotal = filteredLooms.filter(l => l.unit === unit).length;
                    return (
                      <td key={unit} className="p-3 border border-slate-700 text-center text-spu-accent text-sm">
                        {unitTotal}
                      </td>
                    );
                  })}
                  <td className="p-3 border border-slate-700 text-center text-emerald-400 text-base">
                    {summaryMetrics.totalRunningLooms}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Loom Detail Popup Modal ── */}
      {selectedLoomDetail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-lg w-full p-6 space-y-4 relative">
            <button
              onClick={() => setSelectedLoomDetail(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-black text-lg"
            >
              ✕
            </button>
            <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="p-3 bg-spu-primary text-white rounded-xl font-black text-base">
                L-{selectedLoomDetail.loomNo}
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Loom {selectedLoomDetail.loomNo} Details</h3>
                <p className="text-xs text-slate-500">Unit: {selectedLoomDetail.unit} | Type: {selectedLoomDetail.loomType}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Current Design</span>
                <span className="font-black text-slate-800 dark:text-white">{selectedLoomDetail.designNo}</span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Loom Start Date</span>
                <span className="font-bold text-slate-800 dark:text-white">
                  {selectedLoomDetail.loomStartDate ? format(new Date(selectedLoomDetail.loomStartDate), 'dd-MMM-yyyy') : 'N/A'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Warped Meter</span>
                <span className="font-bold text-slate-800 dark:text-white">{selectedLoomDetail.warpedMeter.toLocaleString()} M</span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Daily Production</span>
                <span className="font-bold text-slate-800 dark:text-white">{selectedLoomDetail.dailyProduction} M/day</span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Reed & Pick</span>
                <span className="font-bold text-slate-800 dark:text-white">{selectedLoomDetail.reedCount} / {selectedLoomDetail.pick}</span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Greige Width</span>
                <span className="font-bold text-slate-800 dark:text-white">{selectedLoomDetail.greigeWidth}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setSelectedLoomDetail(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedLoomDetail(null);
                  navigate(`/entry?loom=${selectedLoomDetail.loomNo}`);
                }}
                className="px-4 py-2 bg-spu-primary text-white rounded-xl text-xs font-bold hover:bg-slate-900"
              >
                Open Main Entry Page
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Design Detail Popup Modal ── */}
      {selectedDesignDetail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-lg w-full p-6 space-y-4 relative">
            <button
              onClick={() => setSelectedDesignDetail(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-black text-lg"
            >
              ✕
            </button>
            <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="p-3 bg-blue-600 text-white rounded-xl font-black text-base">
                SP
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Design Details</h3>
                <p className="text-xs text-slate-500">{selectedDesignDetail}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl flex justify-between">
                <span className="text-slate-400 font-semibold">Running Looms Count:</span>
                <span className="font-black text-spu-primary">
                  {runningLooms.filter(l => l.designNo === selectedDesignDetail).length} Looms
                </span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl flex justify-between">
                <span className="text-slate-400 font-semibold">Units Running This Design:</span>
                <span className="font-bold text-slate-800 dark:text-white">
                  {Array.from(new Set(runningLooms.filter(l => l.designNo === selectedDesignDetail).map(l => l.unit))).join(', ')}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setSelectedDesignDetail(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedDesignDetail(null);
                  navigate(`/designs?q=${encodeURIComponent(selectedDesignDetail)}`);
                }}
                className="px-4 py-2 bg-spu-primary text-white rounded-xl text-xs font-bold hover:bg-slate-900"
              >
                Open Design Master Page
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
