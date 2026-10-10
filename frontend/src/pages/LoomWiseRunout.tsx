import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppProvider';

import { ListTodo, Search, Calendar, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { CompanyPrintHeader, PrintTableHeaderRow } from '../components/common/CompanyPrintHeader';
import { triggerPrint } from '../utils/printManager';
import GlobalSearchFilter, { SearchTypeOption, SearchResultItem } from '../components/common/GlobalSearchFilter';

export default function LoomWiseRunout() {
  const { activeRuns, looms, nextPlans } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState<SearchTypeOption>('LOOM');
  const [orderTypeFilter, setOrderTypeFilter] = useState<'ALL' | 'GREY' | 'YD'>('ALL');

  const tableData = useMemo(() => {
    const list = Object.values(activeRuns).map(run => {
      const loom = looms.find(l => l.loomNo === run.loomNo);
      const plan = nextPlans[run.loomNo];

      return {
        ...run,
        unit: loom?.unit || 'Unknown',
        loomType: loom?.loomType || 'Unknown',
        nextDesign: plan?.designNo || 'Unplanned',
        orderType: ((run as any).orderType || 'GREY').toUpperCase(),
        ibpo: (run as any).ibpoNo || (run as any).ibpo || '',
        orderNo: (run as any).orderNo || '',
        vendorName: (run as any).vendorName || '',
        setNo: (run as any).setNo || '',
        // Ensure all display fields have safe defaults
        producedMeter: run.producedMeter ?? 0,
        netBalanceMeter: run.netBalanceMeter ?? 0,
        effectiveDailyProduction: run.effectiveDailyProduction ?? 0,
        balanceDays: run.balanceDays ?? 999999,
        expectedRunoutDate: run.expectedRunoutDate instanceof Date ? run.expectedRunoutDate : new Date(run.expectedRunoutDate ?? new Date()),
        runoutSource: run.runoutSource ?? 'DATA REQUIRED',
        confidenceLevel: run.confidenceLevel ?? 'DATA REQUIRED',
        runoutStatus: run.runoutStatus ?? 'DATA REQUIRED'
      };
    });

    return list.sort((a, b) => a.balanceDays - b.balanceDays);
  }, [activeRuns, looms, nextPlans]);

  // Classification counts
  const runoutCounts = useMemo(() => {
    const total = tableData.length;
    const grey = tableData.filter(d => (d.orderType || '').toUpperCase() === 'GREY').length;
    const yd = tableData.filter(d => (d.orderType || '').toUpperCase() === 'YD').length;
    return { total, grey, yd };
  }, [tableData]);

  const filteredData = useMemo(() => {
    let data = tableData;

    // Filter by Order Type
    if (orderTypeFilter !== 'ALL') {
      data = data.filter(d => (d.orderType || '').toUpperCase() === orderTypeFilter);
    }

    const raw = (searchTerm || '').trim();
    const q = raw.toLowerCase();
    if (!q) return data;

    return data.filter(d => {
      if (searchType === 'LOOM') {
        const clean = q.replace(/^loom\s*|^l-?\s*/i, '').trim();
        const loomStr = d.loomNo.toString().toLowerCase();
        return clean ? (loomStr === clean || loomStr.startsWith(clean) || loomStr.includes(clean)) : true;
      }
      if (searchType === 'DESIGN') {
        return (
          (d.designNo && d.designNo.toLowerCase().includes(q)) ||
          (d.nextDesign && d.nextDesign.toLowerCase().includes(q))
        );
      }
      // ALL
      const clean = q.replace(/^loom\s*|^l-?\s*/i, '').trim();
      const matchLoom = clean ? (d.loomNo.toString().toLowerCase() === clean || d.loomNo.toString().toLowerCase().includes(clean)) : false;
      return (
        matchLoom ||
        d.loomNo.toString().includes(q) ||
        (d.designNo && d.designNo.toLowerCase().includes(q)) ||
        (d.nextDesign && d.nextDesign.toLowerCase().includes(q)) ||
        (d.currentBeamNo && d.currentBeamNo.toLowerCase().includes(q)) ||
        (d.setNo && d.setNo.toLowerCase().includes(q)) ||
        (d.ibpo && d.ibpo.toLowerCase().includes(q)) ||
        (d.vendorName && d.vendorName.toLowerCase().includes(q)) ||
        (d.unit && d.unit.toLowerCase().includes(q)) ||
        (d.loomType && d.loomType.toLowerCase().includes(q))
      );
    });
  }, [tableData, orderTypeFilter, searchTerm, searchType]);

  const searchSuggestions: SearchResultItem[] = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return filteredData.slice(0, 10).map(d => ({
      id: d.loomNo,
      loomNo: d.loomNo,
      designNo: d.designNo,
      extraInfo: `${d.unit} • ${d.orderType} • ${d.loomType}`
    }));
  }, [filteredData, searchTerm]);

  const handleExportExcel = () => {
    const exportRows = filteredData.map(r => ({
      'Loom No': `L-${r.loomNo}`,
      'Unit': r.unit,
      'Order Type': r.orderType,
      'Loom Type': r.loomType,
      'Current Design': r.designNo,
      'IBPO': r.ibpo || 'NA',
      'Vendor': r.vendorName || 'NA',
      'Set No': r.setNo || 'NA',
      'Beam No': r.currentBeamNo || 'NA',
      'Warped Meter': r.warpedMeter,
      'Produced Meter': Math.round(r.producedMeter),
      'Net Balance (M)': Math.round(r.netBalanceMeter),
      'Effective Daily Production': Math.round(r.effectiveDailyProduction),
      'Runout Source': r.runoutSource,
      'Confidence Level': r.confidenceLevel,
      'Balance Days': r.balanceDays > 900000 ? 'NA' : Number(r.balanceDays.toFixed(1)),
      'Expected Runout Date': format(r.expectedRunoutDate, 'dd-MMM-yyyy'),
      'Next Plan': r.nextDesign
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Loom Runout');
    XLSX.writeFile(workbook, `Loom_Wise_Runout_${orderTypeFilter}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  const handleExportCSV = () => {
    const headers = ['Loom No', 'Unit', 'Loom Type', 'Current Design', 'Warped Meter', 'Produced Meter', 'Net Balance (M)', 'Effective Daily Production', 'Runout Source', 'Confidence Level', 'Balance Days', 'Expected Runout Date', 'Next Plan'];
    const csvRows: string[][] = [headers];

    filteredData.forEach(r => {
      csvRows.push([
        `"L-${r.loomNo}"`,
        `"${r.unit}"`,
        `"${r.loomType}"`,
        `"${r.designNo}"`,
        `"${r.warpedMeter}"`,
        `"${Math.round(r.producedMeter)}"`,
        `"${Math.round(r.netBalanceMeter)}"`,
        `"${Math.round(r.effectiveDailyProduction)}"`,
        `"${r.runoutSource}"`,
        `"${r.confidenceLevel}"`,
        `"${r.balanceDays.toFixed(1)}"`,
        `"${format(r.expectedRunoutDate, 'dd-MMM-yyyy')}"`,
        `"${r.nextDesign}"`
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Loom_Wise_Runout_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    triggerPrint({ orientation: 'landscape', title: 'Loom-Wise Runout Report' });
  };

  return (
    <div className="space-y-6 pb-12">
      <CompanyPrintHeader title="Loom-Wise Runout Report" subtitle="Warp Balance & Runout Schedule Audit Log" />

      {/* ── Page Header & Actions ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-industrial-900 flex items-center">
            <ListTodo className="w-6 h-6 mr-3 text-spu-primary" /> Loom-Wise Runout
          </h1>
          <p className="text-industrial-500 text-xs mt-1">
            Running loom runout schedules with Grey / YD / All analysis, Order Management linkage, and real production tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            title="Export Excel"
            className="flex items-center px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors font-bold text-xs shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5" />
            Excel
          </button>
          <button
            onClick={handleExportCSV}
            title="Export CSV"
            className="flex items-center px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-bold text-xs shadow-sm"
          >
            <FileText className="w-4 h-4 mr-1.5" />
            CSV
          </button>
          <button
            onClick={handleExportPDF}
            title="Print / Save PDF"
            className="flex items-center px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition-colors font-bold text-xs shadow-sm"
          >
            <Download className="w-4 h-4 mr-1.5" />
            PDF
          </button>
        </div>
      </div>

      {/* ── 3 Summary KPI Cards: All, Grey, YD Runouts ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
        {/* Card 1: All Looms Runout */}
        <div 
          onClick={() => setOrderTypeFilter('ALL')}
          className={`cursor-pointer p-5 rounded-2xl border transition-all ${
            orderTypeFilter === 'ALL'
              ? 'bg-spu-primary/5 border-spu-primary shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase text-slate-500 tracking-wider">All Looms Runout</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-900 text-white">ALL</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">{runoutCounts.total}</span>
            <span className="text-xs font-semibold text-slate-400">Total Running Looms</span>
          </div>
        </div>

        {/* Card 2: Grey Looms Runout */}
        <div 
          onClick={() => setOrderTypeFilter('GREY')}
          className={`cursor-pointer p-5 rounded-2xl border transition-all ${
            orderTypeFilter === 'GREY'
              ? 'bg-slate-100 border-slate-700 shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase text-slate-500 tracking-wider">Grey Looms Runout</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-700 text-white">GREY</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-800">{runoutCounts.grey}</span>
            <span className="text-xs font-semibold text-slate-400">Grey Order Looms</span>
          </div>
        </div>

        {/* Card 3: YD Looms Runout */}
        <div 
          onClick={() => setOrderTypeFilter('YD')}
          className={`cursor-pointer p-5 rounded-2xl border transition-all ${
            orderTypeFilter === 'YD'
              ? 'bg-purple-50 border-purple-600 shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase text-purple-700 tracking-wider">YD Looms Runout</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-600 text-white">YD</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-purple-600">{runoutCounts.yd}</span>
            <span className="text-xs font-semibold text-purple-400">Yarn Dyed Looms</span>
          </div>
        </div>
      </div>

      {/* ── Filter Bar & Table ── */}
      <div className="bg-white rounded-xl shadow-sm border border-industrial-100 overflow-hidden flex flex-col print:border-none print:shadow-none print:overflow-visible">
        <div className="p-4 border-b border-industrial-100 bg-industrial-50 flex flex-wrap justify-between items-center gap-3 print:hidden">
          
          {/* Segmented Filter: All | Grey | YD */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            <button
              onClick={() => setOrderTypeFilter('ALL')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                orderTypeFilter === 'ALL'
                  ? 'bg-spu-primary text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Looms ({runoutCounts.total})
            </button>
            <button
              onClick={() => setOrderTypeFilter('GREY')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                orderTypeFilter === 'GREY'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Grey Looms ({runoutCounts.grey})
            </button>
            <button
              onClick={() => setOrderTypeFilter('YD')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                orderTypeFilter === 'YD'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-purple-700'
              }`}
            >
              YD Looms ({runoutCounts.yd})
            </button>
          </div>

          <GlobalSearchFilter
            searchType={searchType}
            onSearchTypeChange={setSearchType}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            suggestions={searchSuggestions}
          />
          <div className="text-xs text-industrial-600 font-bold">Showing {filteredData.length} Looms</div>
        </div>
        
        <div className="overflow-auto flex-1 max-h-[calc(100vh-230px)] custom-scrollbar rounded-b-xl print:max-h-none print:overflow-visible">
          <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
            <thead className="bg-slate-900 text-white sticky top-0 shadow-md z-20 print:static print:bg-slate-100 print:text-black print:shadow-none">
              <PrintTableHeaderRow 
                title="Loom-Wise Runout Report" 
                subtitle={`Warp Balance & Runout Schedule (${orderTypeFilter} Looms)`} 
                colSpan={15} 
              />
              <tr className="border-b border-slate-700 font-bold uppercase text-white bg-slate-900 sticky top-0 print:text-black print:bg-slate-100">
                <th className="py-3 px-4 sticky top-0 bg-slate-900 text-white print:bg-transparent print:text-black">Loom No</th>
                <th className="py-3 px-4 sticky top-0 bg-slate-900 text-white print:bg-transparent print:text-black">Unit</th>
                <th className="py-3 px-4 sticky top-0 bg-slate-900 text-white print:bg-transparent print:text-black">Type</th>
                <th className="py-3 px-4 sticky top-0 bg-slate-900 text-white print:bg-transparent print:text-black">Current Design</th>
                <th className="py-3 px-4 sticky top-0 bg-slate-900 text-white print:bg-transparent print:text-black">IBPO / Vendor</th>
                <th className="py-3 px-4 text-right sticky top-0 bg-slate-900 text-white print:bg-transparent print:text-black">Warped Mtr</th>
                <th className="py-3 px-4 text-right sticky top-0 bg-slate-900 text-white print:bg-transparent print:text-black">Produced Mtr</th>
                <th className="py-3 px-4 text-right sticky top-0 bg-slate-900 text-white print:bg-transparent print:text-black">Net Balance</th>
                <th className="py-3 px-4 text-right sticky top-0 bg-slate-900 text-white print:bg-transparent print:text-black">Effective Prod</th>
                <th className="py-3 px-4 sticky top-0 bg-slate-900 text-white print:bg-transparent print:text-black">Runout Source</th>
                <th className="py-3 px-4 sticky top-0 bg-slate-900 text-white print:bg-transparent print:text-black">Confidence</th>
                <th className="py-3 px-4 text-right sticky top-0 bg-slate-900 text-white print:bg-transparent print:text-black">Balance Days</th>
                <th className="py-3 px-4 sticky top-0 bg-slate-900 text-white print:bg-transparent print:text-black">Expected Runout</th>
                <th className="py-3 px-4 sticky top-0 bg-slate-900 text-white print:bg-transparent print:text-black">Next Plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-100">
              {filteredData.map(row => (
                <tr key={row.loomNo} className="hover:bg-industrial-50 transition-colors">
                  <td className="py-3 px-4 font-black text-industrial-900">L-{row.loomNo}</td>
                  <td className="py-3 px-4 text-industrial-600 font-medium">{row.unit}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                      row.orderType === 'GREY' ? 'bg-slate-200 text-slate-800' :
                      row.orderType === 'YD' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {row.orderType}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-industrial-800">{row.designNo}</td>
                  
                  <td className="py-3 px-4 text-slate-600 text-[11px]">
                    <div className="font-semibold text-slate-800">{row.ibpo || 'NA — NOT IN MASTER'}</div>
                    <div className="text-slate-400 text-[10px]">{row.vendorName || '—'}</div>
                  </td>

                  <td className="py-3 px-4 text-right text-industrial-600">{Math.round(row.warpedMeter).toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-industrial-600">{Math.round(row.producedMeter).toLocaleString()}</td>
                  <td className="py-3 px-4 text-right font-mono font-black text-industrial-900">{Math.round(row.netBalanceMeter).toLocaleString()} m</td>
                  <td className="py-3 px-4 text-right font-bold text-slate-800">{Math.round(row.effectiveDailyProduction)} M/d</td>
                  
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      row.runoutSource === 'ACTUAL PRODUCTION' ? 'bg-emerald-100 text-emerald-800' :
                      row.runoutSource === 'RPM + EFFICIENCY' ? 'bg-blue-100 text-blue-800' :
                      row.runoutSource === 'DAILY PRODUCTION' ? 'bg-indigo-100 text-indigo-800' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {row.runoutSource}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      row.confidenceLevel === 'HIGH CONFIDENCE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' :
                      row.confidenceLevel === 'MEDIUM CONFIDENCE' ? 'bg-blue-50 text-blue-700 border border-blue-300' :
                      row.confidenceLevel === 'LOW CONFIDENCE' ? 'bg-amber-50 text-amber-700 border border-amber-300' :
                      'bg-slate-100 text-slate-400'
                    }`}>
                      {row.confidenceLevel}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-right">
                    <span className={`px-2 py-1 rounded font-bold font-mono text-xs ${row.balanceDays <= 2 ? 'bg-red-100 text-red-700' : 'text-industrial-900'}`}>
                      {row.balanceDays > 900000 ? '—' : (row.runoutStatus === 'RUNOUT OVERDUE' ? 'OVERDUE (0.0 d)' : `${Math.ceil(row.balanceDays)}d`)}
                    </span>
                  </td>
                  <td className="py-3 px-4 flex items-center font-medium">
                    <Calendar className={`w-4 h-4 mr-1.5 ${row.balanceDays <= 2 ? 'text-red-500' : 'text-industrial-400'}`} />
                    <span className={row.balanceDays <= 2 ? 'text-red-600 font-bold' : 'text-industrial-700'}>
                      {row.balanceDays > 900000 || row.runoutStatus === 'DATA REQUIRED' ? '—' : format(row.expectedRunoutDate, 'dd MMM yyyy')}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {row.nextDesign !== 'Unplanned' ? (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-semibold text-xs border border-green-200">
                        {row.nextDesign}
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded font-semibold text-xs border border-yellow-200">
                        Unplanned
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
