import React, { useMemo } from 'react';
import { useAppContext } from '../../context/AppProvider';
import { calculateLoomRun } from '../../utils/calculations';
import { Factory, AlertTriangle, TrendingUp, Battery, Activity } from 'lucide-react';

export default function UnitPerformance() {
  const { looms, activeRuns, designs } = useAppContext();

  const unitStats = useMemo(() => {
    const stats: Record<string, any> = {};

    // Initialize unit stats based on all available units in Loom Master
    looms.forEach(loom => {
      if (!loom.unit) return;
      if (!stats[loom.unit]) {
        stats[loom.unit] = {
          unit: loom.unit,
          totalLooms: 0,
          runningLooms: 0,
          criticalLooms: 0,
          totalAvgProd: 0,
          efficiencySum: 0
        };
      }
      stats[loom.unit].totalLooms++;
    });

    // Populate data from active runs
    Object.values(activeRuns).forEach(run => {
      const loom = looms.find(l => l.loomNo === run.loomNo);
      if (!loom || !loom.unit) return;

      const design = designs.find(d => d.designNo === run.designNo);
      const crimpPercent = design ? design.crimpPercent : 0;
      
      const calc = calculateLoomRun({
        loomStartDate: new Date(run.loomStartDate),
        warpedMeter: run.warpedMeter,
        dailyProduction: run.dailyProduction,
        crimpPercent: crimpPercent
      });

      stats[loom.unit].runningLooms++;
      if (calc.balanceDays <= 2) {
        stats[loom.unit].criticalLooms++;
      }
      stats[loom.unit].totalAvgProd += calc.avgProduction;
      
      // Basic mock calculation for efficiency based on avg prod vs some expected max. 
      // Assuming 300 meters is 100% efficient.
      const maxExpected = 300; 
      const efficiency = Math.min((calc.avgProduction / maxExpected) * 100, 100);
      stats[loom.unit].efficiencySum += efficiency;
    });

    return Object.values(stats).sort((a, b) => a.unit.localeCompare(b.unit));
  }, [looms, activeRuns, designs]);

  if (unitStats.length === 0) return null;

  return (
    <div className="space-y-4 mt-8">
      <h2 className="text-xl font-bold text-industrial-800 flex items-center">
        <Factory className="w-5 h-5 mr-2 text-industrial-500" />
        Unit Performance
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {unitStats.map(stat => {
          const availableLooms = stat.totalLooms - stat.runningLooms;
          const avgProduction = stat.runningLooms > 0 ? (stat.totalAvgProd / stat.runningLooms).toFixed(0) : 0;
          const avgEfficiency = stat.runningLooms > 0 ? (stat.efficiencySum / stat.runningLooms).toFixed(1) : 0;

          return (
            <div key={stat.unit} className="bg-white p-5 rounded-2xl shadow-sm border border-industrial-100 flex flex-col hover:shadow-md transition-shadow">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-industrial-900">{stat.unit}</h3>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${stat.runningLooms === 0 ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                  {stat.runningLooms}/{stat.totalLooms} Active
                </span>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-industrial-500 flex items-center"><TrendingUp className="w-4 h-4 mr-1.5"/> Avg Prod</span>
                  <span className="font-semibold text-industrial-900">{avgProduction} m/day</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-industrial-500 flex items-center"><Activity className="w-4 h-4 mr-1.5"/> Efficiency</span>
                  <span className="font-semibold text-industrial-900">{avgEfficiency}%</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-industrial-500 flex items-center"><AlertTriangle className="w-4 h-4 mr-1.5 text-red-500"/> Critical</span>
                  <span className={`font-semibold ${stat.criticalLooms > 0 ? 'text-red-600' : 'text-industrial-900'}`}>{stat.criticalLooms}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-industrial-500 flex items-center"><Battery className="w-4 h-4 mr-1.5"/> Available</span>
                  <span className="font-semibold text-industrial-900">{availableLooms}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
