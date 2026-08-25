import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  CheckCircle2, AlertTriangle, Clock, Layers, Calendar, CalendarDays, 
  Battery, Activity, AlignEndVertical, Factory, TrendingUp, ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { useAppContext } from '../../context/AppProvider';
import { calculateLoomRun } from '../../utils/calculations';

const KPICard = ({ title, value, subtitle, icon: Icon, colorClass, highlight }: any) => (
  <div className={`bg-white/90 p-5 rounded-2xl shadow-sm border border-industrial-100 flex items-start justify-between backdrop-blur-sm hover:shadow-md transition-shadow ${highlight ? 'ring-2 ring-industrial-200' : ''}`}>
    <div>
      <h3 className="text-industrial-500 font-bold text-xs uppercase tracking-wider mb-1.5">{title}</h3>
      <div className="text-3xl font-black text-industrial-900 mb-1">{value}</div>
      {subtitle && <div className="text-xs text-industrial-400 font-semibold">{subtitle}</div>}
    </div>
    <div className={`p-3.5 rounded-xl ${colorClass}`}>
      <Icon className="w-6 h-6" />
    </div>
  </div>
);

export default function ExecutiveKPIs() {
  const { looms, activeRuns, designs, nextPlans } = useAppContext();

  const { stats, criticalLoomItems } = useMemo(() => {
    let totalLooms = looms.length;
    let runningLooms = Object.keys(activeRuns).length;
    let idleLooms = totalLooms - runningLooms;
    
    let criticalLooms = 0; // <= 2 days
    let upcoming7 = 0;     // <= 7 days
    let upcoming15 = 0;    // <= 15 days
    
    let totalAvgProd = 0;
    let totalGrossBalance = 0;
    let totalNetBalance = 0;
    let activeDesignsSet = new Set<string>();
    const criticalList: any[] = [];

    Object.values(activeRuns).forEach((run: any) => {
      activeDesignsSet.add(run.designNo);
      
      const loom = looms.find(l => l.loomNo === run.loomNo);
      const design = designs.find(d => d.designNo === run.designNo);
      const crimpPercent = design ? design.crimpPercent : 0;
      
      const calc = calculateLoomRun({
        loomStartDate: new Date(run.loomStartDate),
        warpedMeter: run.warpedMeter,
        dailyProduction: run.dailyProduction,
        crimpPercent: crimpPercent
      });

      if (calc.balanceDays <= 2) {
        criticalLooms++;
        criticalList.push({
          loomNo: run.loomNo,
          unit: loom?.unit || 'Unit —',
          design: run.designNo,
          balanceDays: calc.balanceDays,
          balanceDaysFormatted: calc.balanceDays.toFixed(1),
          expectedRunoutDate: calc.expectedRunoutDate,
          expectedRunoutFormatted: format(calc.expectedRunoutDate, 'dd-MMM-yyyy'),
          avgProduction: Math.round(calc.avgProduction),
          producedMeter: Math.round(calc.producedMeter),
          netBalanceMeter: Math.round(calc.netBalanceMeter),
          status: calc.runoutStatus
        });
      }
      if (calc.balanceDays <= 7) upcoming7++;
      if (calc.balanceDays <= 15) upcoming15++;

      totalAvgProd += calc.avgProduction;
      totalGrossBalance += calc.warpBalanceGross;
      totalNetBalance += calc.netBalanceMeter;
    });

    criticalList.sort((a, b) => a.balanceDays - b.balanceDays);

    let plannedLooms = Object.keys(nextPlans).length;
    let unplannedLooms = totalLooms - plannedLooms;

    let machineUtilization = totalLooms > 0 ? (runningLooms / totalLooms) * 100 : 0;
    let avgProductionPerLoom = runningLooms > 0 ? (totalAvgProd / runningLooms) : 0;
    
    let uniqueUnits = new Set(looms.map(l => l.unit)).size;

    return {
      stats: {
        totalLooms,
        runningLooms,
        idleLooms,
        criticalLooms,
        upcoming7,
        upcoming15,
        plannedLooms,
        unplannedLooms,
        machineUtilization: machineUtilization.toFixed(1),
        totalAvgProd: totalAvgProd.toLocaleString(undefined, {maximumFractionDigits: 0}),
        avgProductionPerLoom: avgProductionPerLoom.toLocaleString(undefined, {maximumFractionDigits: 0}),
        totalNetBalance: totalNetBalance.toLocaleString(undefined, {maximumFractionDigits: 0}),
        totalGrossBalance: totalGrossBalance.toLocaleString(undefined, {maximumFractionDigits: 0}),
        activeDesigns: activeDesignsSet.size,
        uniqueUnits
      },
      criticalLoomItems: criticalList
    };
  }, [looms, activeRuns, designs, nextPlans]);

  return (
    <div className="space-y-6">
      {/* TOP ROW KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 xl:gap-6">
        <KPICard 
          title="Total Looms" 
          value={stats.totalLooms} 
          subtitle="Available in Master" 
          icon={Factory} 
          colorClass="bg-gray-100 text-gray-600" 
          highlight
        />
        <KPICard 
          title="Running Looms" 
          value={stats.runningLooms} 
          subtitle={`${stats.machineUtilization}% Utilization`} 
          icon={Activity} 
          colorClass="bg-blue-100 text-blue-600" 
          highlight
        />
        <KPICard 
          title="Idle Looms" 
          value={stats.idleLooms} 
          subtitle="Awaiting Plan" 
          icon={Battery} 
          colorClass="bg-amber-100 text-amber-600" 
          highlight
        />
        <KPICard 
          title="Critical Looms" 
          value={stats.criticalLooms} 
          subtitle="Runout <= 2 Days" 
          icon={AlertTriangle} 
          colorClass={stats.criticalLooms > 0 ? "bg-red-500 text-white animate-pulse" : "bg-red-100 text-red-600"} 
          highlight
        />
      </div>

      {/* COMPACT CRITICAL LOOM DETAILS AREA (DASHBOARD CARD LIST STYLE) */}
      {criticalLoomItems.length > 0 ? (
        <div className="bg-red-50/50 border border-red-200/80 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-red-600 animate-bounce" />
              <h3 className="text-sm font-bold text-red-900 uppercase tracking-wide">Critical Loom Details</h3>
              <span className="bg-red-200 text-red-900 text-xs font-black px-2 py-0.5 rounded-full">
                {criticalLoomItems.length} Critical
              </span>
            </div>
            <Link to="/loom-runout" className="text-xs font-bold text-red-700 hover:text-red-900 flex items-center hover:underline">
              View All Loom Runouts <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {criticalLoomItems.map(item => (
              <Link 
                key={item.loomNo}
                to="/loom-runout"
                className="bg-white p-4 rounded-xl border border-red-200 shadow-sm hover:shadow-md transition-all group block"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-black text-industrial-900 text-base">Loom {item.loomNo}</span>
                    <span className="text-xs font-bold text-industrial-500 bg-industrial-100 px-2 py-0.5 rounded">
                      {item.unit}
                    </span>
                  </div>
                  <span className="bg-red-100 text-red-800 text-xs font-black px-2 py-0.5 rounded border border-red-300">
                    Runout: {item.balanceDaysFormatted} d
                  </span>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-industrial-600">
                    <span className="font-medium text-industrial-400">Design:</span>
                    <span className="font-bold text-indigo-700">{item.design}</span>
                  </div>
                  <div className="flex justify-between text-industrial-600">
                    <span className="font-medium text-industrial-400">Exp. Runout:</span>
                    <span className="font-bold text-red-700">{item.expectedRunoutFormatted}</span>
                  </div>
                  <div className="flex justify-between text-industrial-600">
                    <span className="font-medium text-industrial-400">Net Balance:</span>
                    <span className="font-bold text-industrial-900">{item.netBalanceMeter.toLocaleString()} m</span>
                  </div>
                  <div className="flex justify-between text-industrial-600">
                    <span className="font-medium text-industrial-400">Avg Prod:</span>
                    <span className="font-semibold text-industrial-700">{item.avgProduction} M/day</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-emerald-900">✓ No Critical Looms</h4>
              <p className="text-[11px] text-emerald-700 font-medium">All running looms are currently operating above the 2-day critical runout threshold.</p>
            </div>
          </div>
          <Link to="/loom-runout" className="text-xs font-bold text-emerald-800 hover:underline flex items-center">
            View All Runouts <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </div>
      )}

      {/* SECOND ROW KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard title="Upcoming Runouts" value={stats.upcoming15} subtitle="<= 15 Days" icon={Clock} colorClass="bg-orange-100 text-orange-600" />
        <KPICard title="Total Planned" value={stats.plannedLooms} icon={CalendarDays} colorClass="bg-green-100 text-green-600" />
        <KPICard title="Unplanned" value={stats.unplannedLooms} icon={Calendar} colorClass="bg-yellow-100 text-yellow-600" />
        <KPICard title="Active Designs" value={stats.activeDesigns} icon={Layers} colorClass="bg-indigo-100 text-indigo-600" />
        <KPICard title="Avg Prod / Loom" value={stats.avgProductionPerLoom} icon={TrendingUp} colorClass="bg-teal-100 text-teal-600" />
        <KPICard title="Total Net Balance" value={stats.totalNetBalance} icon={AlignEndVertical} colorClass="bg-purple-100 text-purple-600" />
      </div>
    </div>
  );
}
