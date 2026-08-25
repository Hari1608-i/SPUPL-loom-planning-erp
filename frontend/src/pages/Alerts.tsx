import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppProvider';
import { calculateLoomRun } from '../utils/calculations';
import { AlertTriangle, Search, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export default function Alerts() {
  const [searchTerm, setSearchTerm] = useState('');
  const { looms, activeRuns, designs, nextPlans } = useAppContext();
  
  const alertData = useMemo(() => {
    return Object.values(activeRuns)
      .map(run => {
        const design = designs.find(d => d.designNo === run.designNo);
        const calc = calculateLoomRun({
          loomStartDate: new Date(run.loomStartDate),
          warpedMeter: run.warpedMeter,
          dailyProduction: run.dailyProduction,
          crimpPercent: design?.crimpPercent || 0,
        });
        return { ...run, ...calc };
      })
      // Spec: balanceDays <= 15 AND next plan is NOT assigned
      .filter(run => {
        const isCritical = run.balanceDays <= 15;
        const hasNextPlan = nextPlans[run.loomNo] && nextPlans[run.loomNo].designNo && nextPlans[run.loomNo].designNo.trim() !== '';
        return isCritical && !hasNextPlan;
      })
      .sort((a, b) => a.expectedRunoutDate.getTime() - b.expectedRunoutDate.getTime());
  }, [activeRuns, designs, nextPlans]);

  const filteredData = alertData.filter(d => 
    d.loomNo.toString().includes(searchTerm) || 
    (d.designNo || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (days: number) => {
    if (days <= 2) return 'bg-red-100 text-red-700 border border-red-200';
    if (days <= 7) return 'bg-orange-100 text-orange-700 border border-orange-200';
    return 'bg-yellow-100 text-yellow-700 border border-yellow-200';
  };

  const getStatusText = (days: number) => {
    if (days <= 2) return '<= 2 DAYS';
    if (days <= 7) return '<= 7 DAYS';
    return '<= 15 DAYS';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6 bg-white p-6 rounded-2xl shadow-sm border border-industrial-100">
        <div>
          <h1 className="text-2xl font-black text-industrial-900 flex items-center tracking-tight">
            <AlertTriangle className="w-8 h-8 mr-3 text-red-600 p-1.5 bg-red-50 rounded-lg" /> 
            No Next Plan Alerts
          </h1>
          <p className="text-industrial-500 text-sm mt-2 font-medium">
            Critical looms (runout ≤ 15 days) from Main Entry that have no Next Plan assigned.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-industrial-100 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-industrial-100 bg-gradient-to-r from-red-50 to-white flex justify-between items-center">
           <div className="relative w-64">
             <Search className="w-4 h-4 absolute left-3 top-2.5 text-red-400" />
             <input 
               type="text" 
               placeholder="Search loom or design..." 
               value={searchTerm}
               onChange={e => setSearchTerm(e.target.value)}
               className="w-full pl-9 pr-4 py-2 text-sm border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all bg-white font-medium placeholder:font-normal"
             />
           </div>
           <div className="text-sm text-red-700 font-bold flex items-center px-4 py-2 bg-red-100 rounded-lg shadow-sm border border-red-200">
             <AlertTriangle className="w-4 h-4 mr-2" /> Needs Attention: {filteredData.length} Looms
           </div>
        </div>
        
        <div className="overflow-x-auto flex-1 min-h-[400px]">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-industrial-50/50 sticky top-0 shadow-sm z-10">
              <tr className="border-b border-industrial-200">
                <th className="py-4 px-6 text-xs font-bold text-industrial-600 uppercase tracking-wider">Loom No</th>
                <th className="py-4 px-6 text-xs font-bold text-industrial-600 uppercase tracking-wider">Design / SP No</th>
                <th className="py-4 px-6 text-xs font-bold text-industrial-600 uppercase tracking-wider text-right">Net Balance (m)</th>
                <th className="py-4 px-6 text-xs font-bold text-industrial-600 uppercase tracking-wider text-right">Expected Runout Date</th>
                <th className="py-4 px-6 text-xs font-bold text-industrial-600 uppercase tracking-wider text-center">Urgency</th>
                <th className="py-4 px-6 text-xs font-bold text-industrial-600 uppercase tracking-wider text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-100">
              {filteredData.map(run => (
                <tr key={run.loomNo} className="hover:bg-red-50/30 transition-colors group">
                  <td className="py-4 px-6 font-black text-industrial-900 text-lg">{run.loomNo}</td>
                  <td className="py-4 px-6 font-semibold text-industrial-700">{run.designNo}</td>
                  <td className="py-4 px-6 text-industrial-800 text-right font-mono font-bold">{Math.round(run.netBalanceMeter).toLocaleString()}</td>
                  <td className="py-4 px-6 text-industrial-800 text-right font-semibold">{format(run.expectedRunoutDate, 'dd MMM yyyy')}</td>
                  <td className="py-4 px-6 text-center">
                    <span className={`px-3 py-1.5 text-xs font-black rounded-lg shadow-sm ${getStatusColor(run.balanceDays)}`}>
                      {getStatusText(run.balanceDays)}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-center">
                    <Link to="/plan">
                      <button className="px-4 py-1.5 bg-industrial-900 text-white text-xs font-bold rounded-lg shadow hover:bg-industrial-800 hover:shadow-md transition-all active:scale-95">
                        Set Plan
                      </button>
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-industrial-400 bg-gray-50/50">
                    <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500 opacity-60" />
                    <p className="text-xl font-bold text-industrial-800">All Clear!</p>
                    <p className="text-sm font-medium mt-1">All critical looms currently have a next plan assigned.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
