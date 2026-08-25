import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { useAppContext } from '../context/AppProvider';

export default function CompletedWarpAnalysis() {
  const { completedHistory, looms } = useAppContext();

  // Aggregate by design
  const designRollups = useMemo(() => {
    const agg: Record<string, { count: number; totalProd: number; totalDays: number; totalEff: number }> = {};
    completedHistory.forEach(h => {
      if (!agg[h.designNo]) {
        agg[h.designNo] = { count: 0, totalProd: 0, totalDays: 0, totalEff: 0 };
      }
      agg[h.designNo].count += 1;
      agg[h.designNo].totalProd += h.totalProductionMeter;
      agg[h.designNo].totalDays += h.runningDays;
      agg[h.designNo].totalEff += h.efficiencyPct;
    });

    return Object.entries(agg).map(([designNo, data]) => ({
      designNo,
      count: data.count,
      totalProd: data.totalProd,
      avgDays: data.totalDays / data.count,
      avgEff: data.totalEff / data.count,
    })).sort((a, b) => b.totalProd - a.totalProd);
  }, [completedHistory]);

  // Aggregate by unit
  const unitRollups = useMemo(() => {
    const agg: Record<string, { count: number; totalEff: number }> = {};
    
    // Some histories might not have unit if they were created before we added it, so we can try looking up from looms if missing.
    completedHistory.forEach(h => {
      let unit = h.unit;
      if (!unit || unit === 'Unknown') {
        const loom = looms.find(l => l.loomNo === h.loomNo);
        unit = loom ? loom.unit : 'Unknown';
      }
      // Normalize to "Unit X" format
      if (unit && unit !== 'Unknown' && !unit.startsWith('Unit')) {
        unit = `Unit ${unit}`;
      }
      
      if (!agg[unit]) {
        agg[unit] = { count: 0, totalEff: 0 };
      }
      agg[unit].count += 1;
      agg[unit].totalEff += h.efficiencyPct;
    });

    return Object.entries(agg).map(([unit, data]) => ({
      unit,
      avgEff: data.totalEff / data.count
    })).sort((a, b) => a.unit.localeCompare(b.unit));
  }, [completedHistory, looms]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-industrial-900 flex items-center">
            <Activity className="w-6 h-6 mr-3 text-industrial-500" /> Completed Warp Analysis
          </h1>
          <p className="text-industrial-500 text-sm mt-1">Efficiency roll-ups and historical averages by Design and Unit based on true completed history.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-industrial-100 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-industrial-100 bg-industrial-50">
             <h2 className="font-bold text-industrial-800">Design-Wise Performance</h2>
          </div>
          <div className="overflow-x-auto p-4 max-h-[600px] custom-scrollbar">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-white sticky top-0 shadow-sm z-10">
                <tr className="border-b border-industrial-200">
                  <th className="py-2 px-4 text-xs font-semibold text-industrial-500 uppercase">Design No</th>
                  <th className="py-2 px-4 text-xs font-semibold text-industrial-500 uppercase text-right">Warps Completed</th>
                  <th className="py-2 px-4 text-xs font-semibold text-industrial-500 uppercase text-right">Total Prod M.</th>
                  <th className="py-2 px-4 text-xs font-semibold text-industrial-500 uppercase text-right">Avg Run Days</th>
                  <th className="py-2 px-4 text-xs font-semibold text-industrial-500 uppercase text-right">Avg Efficiency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-100">
                {designRollups.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-industrial-500">No completed history available.</td></tr>
                )}
                {designRollups.map((row, idx) => (
                  <tr key={idx} className="hover:bg-industrial-50">
                    <td className="py-3 px-4 font-bold text-industrial-800">{row.designNo}</td>
                    <td className="py-3 px-4 text-industrial-600 text-right">{row.count}</td>
                    <td className="py-3 px-4 text-industrial-600 text-right font-mono">{row.totalProd.toLocaleString()}</td>
                    <td className="py-3 px-4 text-industrial-600 text-right font-mono">{row.avgDays.toFixed(1)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      <span className={row.avgEff >= 95 ? 'text-green-600' : 'text-orange-600'}>
                        {row.avgEff.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-industrial-100 overflow-hidden flex flex-col h-max">
          <div className="p-4 border-b border-industrial-100 bg-industrial-50">
             <h2 className="font-bold text-industrial-800">Unit-Wise Efficiency</h2>
          </div>
          <div className="p-4 space-y-6">
             {unitRollups.length === 0 && (
               <div className="py-8 text-center text-industrial-500">No unit data available.</div>
             )}
             {unitRollups.map((unit, idx) => (
               <div key={idx}>
                 <div className="flex justify-between text-sm mb-2">
                   <span className="font-bold text-industrial-700">{unit.unit.startsWith('Unit') ? unit.unit : `Unit ${unit.unit}`}</span>
                   <span className="font-mono font-bold text-industrial-900">{unit.avgEff.toFixed(1)}%</span>
                 </div>
                 <div className="w-full bg-industrial-100 rounded-full h-3">
                   <div 
                     className={`h-3 rounded-full ${unit.avgEff >= 95 ? 'bg-green-500' : (unit.avgEff >= 90 ? 'bg-blue-500' : 'bg-orange-500')}`}
                     style={{ width: `${Math.min(unit.avgEff, 100)}%` }}
                   ></div>
                 </div>
               </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
}
