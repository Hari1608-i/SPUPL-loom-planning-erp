import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  CheckCircle2, AlertTriangle, Clock, Layers, Scissors, 
  Battery, Activity, Factory, ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { useAppContext } from '../../context/AppProvider';
import { calculateLoomRun, calculateOrderReedRequirement } from '../../utils/calculations';

interface KPICardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: any;
  colorClass: string;
  highlight?: boolean;
  to?: string;
}

const KPICard = ({ title, value, subtitle, icon: Icon, colorClass, highlight, to }: KPICardProps) => {
  const content = (
    <div className={`bg-white/90 p-4 rounded-2xl shadow-sm border border-industrial-100 flex items-start justify-between backdrop-blur-sm hover:shadow-md transition-all h-full ${highlight ? 'ring-2 ring-industrial-200' : ''}`}>
      <div className="flex-1 pr-2">
        <h3 className="text-industrial-500 font-bold text-[10px] sm:text-xs uppercase tracking-wider mb-1 line-clamp-1">{title}</h3>
        <div className="text-2xl sm:text-3xl font-black text-industrial-900 mb-0.5">{value}</div>
        {subtitle && <div className="text-[11px] text-industrial-400 font-semibold">{subtitle}</div>}
      </div>
      <div className={`p-2.5 sm:p-3 rounded-xl flex-shrink-0 ${colorClass}`}>
        <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block transition-transform hover:-translate-y-0.5">
        {content}
      </Link>
    );
  }

  return content;
};

export default function ExecutiveKPIs() {
  const { looms, activeRuns, designs, orders = [], reeds = [] } = useAppContext();

  const { stats, criticalLoomItems } = useMemo(() => {
    const totalLooms = looms.length;
    const runningLooms = Object.keys(activeRuns).length;
    const idleLooms = Math.max(0, totalLooms - runningLooms);
    
    let criticalLooms = 0; // <= 2 days
    let overdueLooms = 0;  // status === RUNOUT OVERDUE or balanceDays <= 0
    const criticalList: any[] = [];

    Object.values(activeRuns).forEach((run: any) => {
      const loom = looms.find(l => l.loomNo === run.loomNo);
      const calc = calculateLoomRun(run as any);

      const isOverdue = calc.runoutStatus === 'RUNOUT OVERDUE' || calc.balanceDays <= 0;
      if (isOverdue) {
        overdueLooms++;
      }

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
    });

    criticalList.sort((a, b) => a.balanceDays - b.balanceDays);

    // 6. Sizing Pending Orders (Authoritative calculation matching Sizing analysis)
    let sizingPendingOrders = 0;
    orders.forEach((ord: any) => {
      const isCompleted = (ord.order_completion_status || '').toUpperCase() === 'COMPLETED' || (ord.status || '').toUpperCase() === 'ORDER COMPLETED';
      if (isCompleted) return;

      const matchedDesign = designs.find((d: any) =>
        (d.design_no_sp_no || '').trim() === (ord.design_no_sp_no || '').trim() ||
        (d.design_no_sp_no || '').trim() === (ord.ibpo_no || '').trim()
      );

      const orderQty = Math.max(0, Number(ord.order_qty) || 0);
      const producedQty = Math.max(0, Number(ord.produced_qty || ord.grey_qty) || 0);
      const crimpPct = matchedDesign?.crimpPercent || 5;
      const requiredSizingQty = ord.warp_qty && Number(ord.warp_qty) > 0 
        ? Number(ord.warp_qty) 
        : Math.round(orderQty * (1 + crimpPct / 100));

      let sizingCompletedQty = 0;
      const sizingStatusUpper = (ord.sizing_status || '').toUpperCase();
      if (sizingStatusUpper === 'COMPLETED' || ord.sizing_completed_date) {
        sizingCompletedQty = requiredSizingQty;
      } else if (producedQty > 0) {
        sizingCompletedQty = Math.min(requiredSizingQty, Math.round(producedQty * (1 + crimpPct / 100)));
      }

      const sizingPendingQty = Math.max(0, requiredSizingQty - sizingCompletedQty);
      if (sizingPendingQty > 0 && sizingStatusUpper !== 'COMPLETED') {
        sizingPendingOrders++;
      }
    });

    // 7. Reed Pending Orders (Authoritative calculation matching Reed stock requirement)
    let reedPendingOrders = 0;
    orders.forEach((ord: any) => {
      const isCompleted = (ord.order_completion_status || '').toUpperCase() === 'COMPLETED' || (ord.status || '').toUpperCase() === 'ORDER COMPLETED';
      if (isCompleted) return;

      const matchedDesign = designs.find((d: any) =>
        (d.design_no_sp_no || '').trim() === (ord.design_no_sp_no || '').trim() ||
        (d.design_no_sp_no || '').trim() === (ord.ibpo_no || '').trim()
      );

      const reedCount = ord.reed_count || matchedDesign?.reed_count || matchedDesign?.reedCount || '—';
      const plannedLoomCount = Math.max(1, Number(ord.planned_loom_count) || 1);

      const reqResult = calculateOrderReedRequirement({
        orderQty: Number(ord.order_qty) || 0,
        plannedLoomCount,
        reedCount,
        availableReeds: reeds
      });

      if (reqResult.shortageQty > 0 || reqResult.stockStatus === 'STOCK LOW' || reqResult.stockStatus === 'OUT OF STOCK') {
        reedPendingOrders++;
      }
    });

    return {
      stats: {
        totalLooms,
        runningLooms,
        idleLooms,
        criticalLooms,
        overdueLooms,
        sizingPendingOrders,
        reedPendingOrders
      },
      criticalLoomItems: criticalList
    };
  }, [looms, activeRuns, designs, orders, reeds]);

  return (
    <div className="space-y-6">
      {/* TOP ROW: EXACTLY 7 REQUESTED MANAGEMENT KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 xl:gap-4">
        {/* 1. TOTAL LOOMS */}
        <KPICard 
          title="Total Looms" 
          value={stats.totalLooms} 
          subtitle="Available in Master" 
          icon={Factory} 
          colorClass="bg-slate-100 text-slate-700" 
          highlight
          to="/loom-master"
        />

        {/* 2. RUNNING LOOMS */}
        <KPICard 
          title="Running Looms" 
          value={stats.runningLooms} 
          subtitle="Current Running" 
          icon={Activity} 
          colorClass="bg-blue-100 text-blue-700" 
          highlight
          to="/entry"
        />

        {/* 3. IDLE LOOMS */}
        <KPICard 
          title="Idle Looms" 
          value={stats.idleLooms} 
          subtitle="Awaiting Plan" 
          icon={Battery} 
          colorClass="bg-amber-100 text-amber-700" 
          highlight
          to="/plan"
        />

        {/* 4. CRITICAL LOOMS */}
        <KPICard 
          title="Critical Looms" 
          value={stats.criticalLooms} 
          subtitle="Runout <= 2 Days" 
          icon={AlertTriangle} 
          colorClass={stats.criticalLooms > 0 ? "bg-red-500 text-white animate-pulse" : "bg-red-100 text-red-700"} 
          highlight
          to="/loom-runout"
        />

        {/* 5. OVERDUE LOOMS */}
        <KPICard 
          title="Overdue Looms" 
          value={stats.overdueLooms} 
          subtitle={stats.overdueLooms > 0 ? "Runout Overdue" : "No overdue looms"} 
          icon={Clock} 
          colorClass={stats.overdueLooms > 0 ? "bg-purple-600 text-white animate-pulse" : "bg-purple-100 text-purple-700"} 
          highlight
          to="/runout-monitor"
        />

        {/* 6. SIZING PENDING ORDERS */}
        <KPICard 
          title="Sizing Pending" 
          value={stats.sizingPendingOrders} 
          subtitle={stats.sizingPendingOrders > 0 ? "Orders Pending" : "No pending sizing"} 
          icon={Scissors} 
          colorClass={stats.sizingPendingOrders > 0 ? "bg-orange-100 text-orange-700" : "bg-emerald-100 text-emerald-700"} 
          highlight
          to="/orders"
        />

        {/* 7. REED PENDING ORDERS */}
        <KPICard 
          title="Reed Pending" 
          value={stats.reedPendingOrders} 
          subtitle={stats.reedPendingOrders > 0 ? "Orders Pending" : "No pending reed"} 
          icon={Layers} 
          colorClass={stats.reedPendingOrders > 0 ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"} 
          highlight
          to="/reed-stock"
        />
      </div>

      {/* COMPACT CRITICAL LOOM DETAILS AREA (PREVIEW CARDS ONLY WHEN CRITICAL LOOMS EXIST) */}
      {criticalLoomItems.length > 0 ? (
        <div className="bg-red-50/50 border border-red-200/80 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-red-600 animate-bounce" />
              <h3 className="text-xs sm:text-sm font-bold text-red-900 uppercase tracking-wide">Critical Loom Details</h3>
              <span className="bg-red-200 text-red-900 text-xs font-black px-2 py-0.5 rounded-full">
                {criticalLoomItems.length} Critical
              </span>
            </div>
            <Link to="/loom-runout" className="text-xs font-bold text-red-700 hover:text-red-900 flex items-center hover:underline">
              View All Loom Runouts <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {criticalLoomItems.slice(0, 6).map(item => (
              <Link 
                key={item.loomNo}
                to="/loom-runout"
                className="bg-white p-3.5 rounded-xl border border-red-200 shadow-sm hover:shadow-md transition-all group block"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-black text-industrial-900 text-sm sm:text-base">Loom {item.loomNo}</span>
                    <span className="text-[11px] font-bold text-industrial-500 bg-industrial-100 px-1.5 py-0.5 rounded">
                      {item.unit}
                    </span>
                  </div>
                  <span className="bg-red-100 text-red-800 text-[11px] font-black px-2 py-0.5 rounded border border-red-300">
                    Runout: {item.balanceDaysFormatted} d
                  </span>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-industrial-600">
                    <span className="font-medium text-industrial-400">Design:</span>
                    <span className="font-bold text-indigo-700 truncate max-w-[150px]">{item.design}</span>
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
          {criticalLoomItems.length > 6 && (
            <div className="text-center pt-1">
              <Link to="/loom-runout" className="text-xs font-bold text-red-700 hover:text-red-900 hover:underline">
                + {criticalLoomItems.length - 6} more critical looms... Click to view full list in Loom Runout
              </Link>
            </div>
          )}
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
    </div>
  );
}
