import * as XLSX from 'xlsx';
import React, { useState, useMemo } from 'react';
import { History as HistoryIcon, Search, Download, Filter } from 'lucide-react';
import { format, isSameMonth, subMonths, parseISO } from 'date-fns';
import { useAppContext } from '../context/AppProvider';

export default function History() {
  const [searchTerm, setSearchTerm] = useState('');
  const [monthFilter, setMonthFilter] = useState('ALL'); // ALL, CURRENT, PREVIOUS
  const { completedHistory, looms } = useAppContext();

  const filteredData = useMemo(() => {
    const today = new Date();
    
    return completedHistory.filter(d => {
      const q = (searchTerm || '').trim().toLowerCase();
      const matchesSearch = 
        !q ||
        (d.loomNo || '').toString().toLowerCase().includes(q) || 
        (d.designNo || '').toLowerCase().includes(q) ||
        (d.unit || '').toLowerCase().includes(q) ||
        ((d as any).setNo || (d as any).set_no || '').toString().toLowerCase().includes(q) ||
        ((d as any).beamNo || (d as any).beam_no || '').toString().toLowerCase().includes(q) ||
        ((d as any).orderNo || (d as any).order_no || '').toString().toLowerCase().includes(q);
      
      if (!matchesSearch) return false;

      // Month filter
      if (monthFilter === 'CURRENT') {
        return isSameMonth(parseISO(d.endDate), today);
      } else if (monthFilter === 'PREVIOUS') {
        return isSameMonth(parseISO(d.endDate), subMonths(today, 1));
      }
      return true; // ALL
    });
  }, [completedHistory, searchTerm, monthFilter]);

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
        'Loom': `L-${row.loomNo}`,
        'Unit': unit,
        'Design / SP No': row.designNo,
        'Sort Change': sortChangeDisplay,
        'Start Date': format(parseISO(row.startDate), 'dd/MM/yyyy'),
        'End Date': format(parseISO(row.endDate), 'dd/MM/yyyy'),
        'Warp M.': Math.round(row.warpMeter),
        'Prod M.': Math.round(row.totalProductionMeter),
        'Run Days': row.runningDays,
        'Avg Prod': Math.round(row.avgDailyProduction),
        'Efficiency %': Number(row.efficiencyPct.toFixed(1))
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);

    // Dynamic Excel Formulas:
    // Col J: Avg Prod = IF(Run Days [Col I] > 0, ROUND(Prod M. [Col H] / Run Days [Col I], 0), 0)
    // Col K: Efficiency % = IF(Warp M. [Col G] > 0, ROUND((Prod M. [Col H] / Warp M. [Col G]) * 100, 1), 0)
    filteredData.forEach((row, idx) => {
      const r = idx + 2;
      const avgProd = Math.round(row.avgDailyProduction);
      const eff = Number(row.efficiencyPct.toFixed(1));
      ws[`J${r}`] = { t: 'n', v: avgProd, f: `IF(I${r}>0, ROUND(H${r}/I${r}, 0), 0)` };
      ws[`K${r}`] = { t: 'n', v: eff, f: `IF(G${r}>0, ROUND((H${r}/G${r})*100, 1), 0)` };
    });

    ws['!cols'] = [
      { wch: 10 }, // Loom
      { wch: 12 }, // Unit
      { wch: 18 }, // Design / SP No
      { wch: 16 }, // Sort Change
      { wch: 14 }, // Start Date
      { wch: 14 }, // End Date
      { wch: 14 }, // Warp M.
      { wch: 14 }, // Prod M.
      { wch: 12 }, // Run Days
      { wch: 14 }, // Avg Prod
      { wch: 14 }  // Efficiency %
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Completed Warp History');
    XLSX.writeFile(wb, `SPUPL_Completed_Warp_History_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-industrial-900 flex items-center">
            <HistoryIcon className="w-6 h-6 mr-3 text-industrial-500" /> Completed Warp History
          </h1>
          <p className="text-industrial-500 text-sm mt-1">Log of all completed weaves and efficiency analytics across all looms.</p>
        </div>
        <div className="flex space-x-3 items-center">
          <div className="relative">
            <select 
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-industrial-200 text-industrial-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-colors text-sm font-medium appearance-none"
            >
              <option value="ALL">All Time</option>
              <option value="CURRENT">Current Month</option>
              <option value="PREVIOUS">Previous Month</option>
            </select>
            <Filter className="w-4 h-4 absolute left-3 top-2.5 text-industrial-400 pointer-events-none" />
          </div>
          <button onClick={handleExportExcel} className="flex items-center px-4 py-2 bg-white border border-industrial-200 text-industrial-700 rounded-lg hover:bg-industrial-50 shadow-sm transition-colors font-medium text-sm cursor-pointer">
            <Download className="w-4 h-4 mr-2" /> Export Log
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-industrial-100 overflow-hidden flex flex-col flex-1">
        <div className="p-4 border-b border-industrial-100 bg-industrial-50 flex justify-between items-center">
           <div className="relative w-64">
             <Search className="w-4 h-4 absolute left-3 top-2.5 text-industrial-400" />
             <input 
               type="text" 
               placeholder="Search loom or design..." 
               value={searchTerm}
               onChange={e => setSearchTerm(e.target.value)}
               className="w-full pl-9 pr-4 py-2 text-sm border border-industrial-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
             />
           </div>
           <div className="text-sm text-industrial-500 font-medium">Completed Runs: {filteredData.length}</div>
        </div>
        
        <div className="overflow-auto custom-scrollbar flex-1 relative">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-white sticky top-0 shadow-sm z-10">
              <tr className="border-b border-industrial-200">
                <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase">Loom</th>
                <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase">Unit</th>
                <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase">Design / SP No</th>
                <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase">Sort Change</th>
                <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase text-right">Start Date</th>
                <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase text-right">End Date</th>
                <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase text-right">Warp M.</th>
                <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase text-right">Prod M.</th>
                <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase text-right">Run Days</th>
                <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase text-right">Avg Prod</th>
                <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase text-right">Efficiency %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-100">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-industrial-500">
                    No completed runs found.
                  </td>
                </tr>
              ) : (
                filteredData.map((row, idx) => {
                  let unit = row.unit;
                  if (!unit || unit === 'Unknown') {
                    const l = looms.find(loom => loom.loomNo === row.loomNo);
                    unit = l ? l.unit : '-';
                  }
                  // Normalize to "Unit X" format
                  if (unit && unit !== '-' && !unit.startsWith('Unit')) {
                    unit = `Unit ${unit}`;
                  }

                  return (
                  <tr key={idx} className="hover:bg-industrial-50 transition-colors">
                    <td className="py-3 px-4 font-bold text-industrial-800">{row.loomNo}</td>
                    <td className="py-3 px-4 text-industrial-600">{unit}</td>
                    <td className="py-3 px-4 text-industrial-800 font-medium">{row.designNo}</td>
                    <td className="py-3 px-4">
                      {row.sortChangeType ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                          row.sortChangeType === 'KNOTTING'
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : row.sortChangeType === 'KNOTTING_SORT_CHANGE'
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-purple-100 text-purple-900 border-purple-300'
                        }`}>
                          {row.sortChangeType === 'KNOTTING' ? '✂️ Knotting' : row.sortChangeType === 'KNOTTING_SORT_CHANGE' ? '🔄 Sort Chg' : '⚙️ Gaiting'}
                        </span>
                      ) : (
                        <span className="text-industrial-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-industrial-600 text-right">{format(parseISO(row.startDate), 'dd/MM/yyyy')}</td>
                    <td className="py-3 px-4 text-industrial-600 text-right">{format(parseISO(row.endDate), 'dd/MM/yyyy')}</td>
                    <td className="py-3 px-4 text-industrial-600 text-right font-mono">{Math.round(row.warpMeter).toLocaleString()}</td>
                    <td className="py-3 px-4 text-industrial-600 text-right font-mono font-bold text-blue-600">{Math.round(row.totalProductionMeter).toLocaleString()}</td>
                    <td className="py-3 px-4 text-industrial-600 text-right font-mono">{row.runningDays}</td>
                    <td className="py-3 px-4 text-industrial-600 text-right font-mono">{Math.round(row.avgDailyProduction)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      <span className={row.efficiencyPct >= 95 ? 'text-green-600' : 'text-orange-600'}>
                        {row.efficiencyPct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                )})
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
