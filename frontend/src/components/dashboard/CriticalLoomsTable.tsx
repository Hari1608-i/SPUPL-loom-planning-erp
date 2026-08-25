import React, { useMemo } from 'react';
import { useAppContext } from '../../context/AppProvider';
import { calculateLoomRun } from '../../utils/calculations';
import { AlertCircle, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export default function CriticalLoomsTable() {
  const { looms, activeRuns, designs } = useAppContext();

  const criticalLooms = useMemo(() => {
    const list: any[] = [];
    Object.values(activeRuns).forEach(run => {
      const loom = looms.find(l => l.loomNo === run.loomNo);
      if (!loom) return;

      const design = designs.find(d => d.designNo === run.designNo);
      const crimpPercent = design ? design.crimpPercent : 0;

      const calc = calculateLoomRun({
        loomStartDate: new Date(run.loomStartDate),
        warpedMeter: run.warpedMeter,
        dailyProduction: run.dailyProduction,
        crimpPercent: crimpPercent
      });

      if (calc.balanceDays <= 2) {
        let priority = 'HIGH';
        if (calc.balanceDays <= 0) priority = 'CRITICAL';
        
        let colorCode = 'bg-yellow-100 text-yellow-800 border-yellow-200';
        if (calc.balanceDays <= 0) colorCode = 'bg-red-100 text-red-800 border-red-200';
        else if (calc.balanceDays <= 1) colorCode = 'bg-orange-100 text-orange-800 border-orange-200';

        list.push({
          loomNo: loom.loomNo,
          unit: loom.unit,
          design: run.designNo,
          runningDays: calc.runningDays,
          netBalance: calc.netBalanceMeter,
          balanceDays: calc.balanceDays.toFixed(1),
          runoutDate: calc.expectedRunoutDate,
          status: calc.runoutStatus,
          priority,
          colorCode
        });
      }
    });

    return list.sort((a, b) => Number(a.balanceDays) - Number(b.balanceDays));
  }, [looms, activeRuns, designs]);

  if (criticalLooms.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-industrial-100 p-6 flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-bold text-industrial-800 text-lg flex items-center">
          <AlertCircle className="w-5 h-5 mr-2 text-red-500" />
          Critical Looms Action Required
        </h2>
        <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold border border-red-200">
          {criticalLooms.length} Looms &lt;= 2 Days
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead>
            <tr className="border-b border-industrial-200">
              <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase">Loom No</th>
              <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase">Unit</th>
              <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase">Current Design</th>
              <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase">Net Balance</th>
              <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase">Days Left</th>
              <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase">Exp. Runout</th>
              <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase">Status</th>
              <th className="py-3 px-4 text-xs font-semibold text-industrial-500 uppercase text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-industrial-100">
            {criticalLooms.map(item => (
              <tr key={item.loomNo} className="hover:bg-industrial-50 transition-colors group">
                <td className="py-3 px-4 font-bold text-industrial-900">{item.loomNo}</td>
                <td className="py-3 px-4 text-industrial-600 font-medium">{item.unit}</td>
                <td className="py-3 px-4 text-industrial-700">{item.design}</td>
                <td className="py-3 px-4 text-industrial-900 font-semibold">{item.netBalance.toLocaleString(undefined, {maximumFractionDigits:0})} m</td>
                <td className="py-3 px-4 text-industrial-900 font-bold">{item.balanceDays} d</td>
                <td className="py-3 px-4 text-industrial-600 flex items-center">
                  <Calendar className="w-4 h-4 mr-1.5 text-industrial-400" />
                  {format(item.runoutDate, 'dd MMM yyyy')}
                </td>
                <td className="py-3 px-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold border ${item.colorCode}`}>
                    {item.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <button className="text-blue-600 font-semibold text-sm hover:text-blue-800 opacity-0 group-hover:opacity-100 transition-opacity">
                    Plan Next →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
