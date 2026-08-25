import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Clock, User, Activity } from 'lucide-react';
import { useAppContext } from '../../context/AppProvider';
import { calculateLoomRun } from '../../utils/calculations';

export default function LiveStatusBar() {
  const { activeRuns, designs } = useAppContext();
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Update last refresh time every 60 seconds (when context updates typically happen via AppProvider polling)
  useEffect(() => {
    setLastRefresh(new Date());
  }, [activeRuns]);

  // Compute live data directly from activeRuns
  const runningLoomCount = Object.keys(activeRuns).length;

  let criticalCount = 0;
  Object.values(activeRuns).forEach(run => {
    const design = designs.find(d => d.designNo === run.designNo);
    const crimpPercent = design ? design.crimpPercent : 0;
    const calc = calculateLoomRun({
      loomStartDate: new Date(run.loomStartDate),
      warpedMeter: run.warpedMeter,
      dailyProduction: run.dailyProduction,
      crimpPercent: crimpPercent
    });
    if (calc.balanceDays <= 2) {
      criticalCount++;
    }
  });

  return (
    <div className="bg-white/80 backdrop-blur-md border-b border-industrial-200 relative z-10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between text-xs font-semibold text-industrial-700">
        
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-1.5 text-status-safe">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-safe opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-status-safe"></span>
            </span>
            <span className="uppercase tracking-wide text-industrial-800">System Normal</span>
          </div>

          <div className="flex items-center text-industrial-500">
            <Clock className="w-4 h-4 mr-1.5" />
            Last Refresh: {lastRefresh.toLocaleTimeString()}
          </div>
        </div>

        <div className="flex items-center space-x-6">
          <div className="flex items-center">
            <Activity className="w-4 h-4 mr-1.5 text-industrial-400" />
            Running Looms: <span className="ml-1 text-industrial-900 font-bold">{runningLoomCount}</span>
          </div>

          {criticalCount > 0 ? (
            <div className="flex items-center text-status-critical bg-red-50 px-2.5 py-1 rounded-full border border-red-100 shadow-sm">
              <AlertTriangle className="w-4 h-4 mr-1.5 animate-pulse" />
              {criticalCount} Critical Alert{criticalCount !== 1 ? 's' : ''}
            </div>
          ) : (
            <div className="flex items-center text-status-safe bg-green-50 px-2.5 py-1 rounded-full border border-green-100 shadow-sm">
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              No Critical Alerts
            </div>
          )}

          <div className="flex items-center text-industrial-500 bg-industrial-100 px-3 py-1 rounded-full">
            <User className="w-4 h-4 mr-1.5" />
            Admin
          </div>
        </div>
      </div>
    </div>
  );
}
