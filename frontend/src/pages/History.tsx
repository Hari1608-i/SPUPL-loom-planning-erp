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
      // Search text filter
      const matchesSearch = 
        d.loomNo.toString().includes(searchTerm) || 
        d.designNo.toLowerCase().includes(searchTerm.toLowerCase());
      
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
          <button className="flex items-center px-4 py-2 bg-white border border-industrial-200 text-industrial-700 rounded-lg hover:bg-industrial-50 shadow-sm transition-colors font-medium text-sm">
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
                  <td colSpan={10} className="py-12 text-center text-industrial-500">
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
