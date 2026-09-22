import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend
} from 'recharts';
import { useAppContext } from '../../context/AppProvider';
import { calculateLoomRun, calculateOrderReedRequirement } from '../../utils/calculations';
import { BarChart3, PieChart, AlertTriangle, Layers, Factory } from 'lucide-react';

export default function ExecutiveCharts() {
  const { looms, activeRuns, designs, orders = [], reeds = [] } = useAppContext();

  const {
    statusDistData,
    unitData,
    pendingData,
    runoutRiskData
  } = useMemo(() => {
    const totalLooms = looms.length;
    const runningLooms = Object.keys(activeRuns).length;
    const idleLooms = Math.max(0, totalLooms - runningLooms);

    let criticalLooms = 0;
    let overdueLooms = 0;

    // Runout risk intervals for running looms
    let overdueCount = 0;
    let critical2Days = 0;
    let days3to5 = 0;
    let days6to10 = 0;
    let daysOver10 = 0;

    // Unit-wise map
    const unitMap: Record<string, { unit: string; total: number; running: number; critical: number }> = {};
    looms.forEach(l => {
      const u = l.unit || 'Unit —';
      if (!unitMap[u]) {
        unitMap[u] = { unit: u, total: 0, running: 0, critical: 0 };
      }
      unitMap[u].total++;
    });

    Object.values(activeRuns).forEach((run: any) => {
      const loom = looms.find(l => l.loomNo === run.loomNo);
      const calc = calculateLoomRun(run as any);

      const u = loom?.unit || 'Unit —';
      if (unitMap[u]) {
        unitMap[u].running++;
      }

      const isOverdue = calc.runoutStatus === 'RUNOUT OVERDUE' || calc.balanceDays <= 0;
      if (isOverdue) {
        overdueLooms++;
        overdueCount++;
      } else if (calc.balanceDays <= 2) {
        criticalLooms++;
        critical2Days++;
      } else if (calc.balanceDays <= 5) {
        days3to5++;
      } else if (calc.balanceDays <= 10) {
        days6to10++;
      } else {
        daysOver10++;
      }

      if (calc.balanceDays <= 2 && unitMap[u]) {
        unitMap[u].critical++;
      }
    });

    // Sizing pending orders calculation
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

    // Reed pending orders calculation
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

    // 1. Chart A: Loom Status Distribution (Avoids false mutual exclusivity assumption)
    const statusDist = [
      { name: 'Running', count: runningLooms, fill: '#2563EB' },
      { name: 'Idle', count: idleLooms, fill: '#D97706' },
      { name: 'Critical (≤2d)', count: criticalLooms, fill: '#DC2626' },
      { name: 'Overdue', count: overdueLooms, fill: '#7C3AED' }
    ];

    // 2. Chart B: Unit-Wise Loom Status
    const unitList = Object.values(unitMap)
      .sort((a, b) => a.unit.localeCompare(b.unit))
      .map(u => ({
        unit: u.unit,
        Running: u.running,
        Idle: Math.max(0, u.total - u.running),
        Critical: u.critical
      }));

    // 3. Chart C: Pending Work Summary
    const pendingList = [
      { name: 'Sizing Pending Orders', count: sizingPendingOrders, fill: '#F59E0B' },
      { name: 'Reed Pending Orders', count: reedPendingOrders, fill: '#6366F1' }
    ];

    // 4. Chart D: Runout Risk Summary (5 mutually exclusive partitions of running looms)
    const runoutRisk = [
      { interval: 'Overdue', count: overdueCount, fill: '#B91C1C' },
      { interval: '≤ 2 Days', count: critical2Days, fill: '#EA580C' },
      { interval: '3–5 Days', count: days3to5, fill: '#F59E0B' },
      { interval: '6–10 Days', count: days6to10, fill: '#3B82F6' },
      { interval: '> 10 Days', count: daysOver10, fill: '#10B981' }
    ];

    return {
      statusDistData: statusDist,
      unitData: unitList,
      pendingData: pendingList,
      runoutRiskData: runoutRisk
    };
  }, [looms, activeRuns, designs, orders, reeds]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-industrial-900 flex items-center tracking-tight">
          <BarChart3 className="w-5 h-5 mr-2 text-indigo-600" />
          Management Overview & Charts
        </h2>
        <span className="text-xs text-industrial-500 font-semibold">
          Derived from live Main Entry, Loom Master, and Order requirements
        </span>
      </div>

      {/* 2x2 GRID OF ESSENTIAL MANAGEMENT CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* CHART A: LOOM STATUS DISTRIBUTION */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-industrial-100 flex flex-col justify-between">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-industrial-900 flex items-center">
                <Factory className="w-4 h-4 mr-1.5 text-blue-600" />
                Loom Status Distribution
              </h3>
              <span className="text-[11px] font-bold text-industrial-400 bg-industrial-50 px-2 py-0.5 rounded border border-industrial-200">
                Total: {looms.length} Looms
              </span>
            </div>
            <p className="text-xs text-industrial-500 mt-1">
              Active operational counts. Critical & Overdue reflect risk states among running looms.
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusDistData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 12, fontWeight: 600 }} />
                <YAxis tick={{ fill: '#64748B', fontSize: 11 }} allowDecimals={false} />
                <Tooltip 
                  cursor={{ fill: '#F1F5F9' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                  formatter={(val: any) => [`${val} Looms`, 'Count']}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {statusDistData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART B: UNIT-WISE LOOM STATUS */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-industrial-100 flex flex-col justify-between">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-industrial-900 flex items-center">
                <BarChart3 className="w-4 h-4 mr-1.5 text-indigo-600" />
                Unit-Wise Loom Status
              </h3>
              <span className="text-[11px] font-bold text-industrial-400 bg-industrial-50 px-2 py-0.5 rounded border border-industrial-200">
                {unitData.length} Units
              </span>
            </div>
            <p className="text-xs text-industrial-500 mt-1">
              Running, Idle, and Critical looms grouped by production unit.
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={unitData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="unit" tick={{ fill: '#64748B', fontSize: 12, fontWeight: 600 }} />
                <YAxis tick={{ fill: '#64748B', fontSize: 11 }} allowDecimals={false} />
                <Tooltip 
                  cursor={{ fill: '#F1F5F9' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="Running" fill="#3B82F6" name="Running Looms" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Idle" fill="#94A3B8" name="Idle Looms" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Critical" fill="#EF4444" name="Critical (≤2d)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART C: PENDING WORK SUMMARY */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-industrial-100 flex flex-col justify-between">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-industrial-900 flex items-center">
                <Layers className="w-4 h-4 mr-1.5 text-amber-600" />
                Pending Work Summary
              </h3>
              <span className="text-[11px] font-bold text-industrial-400 bg-industrial-50 px-2 py-0.5 rounded border border-industrial-200">
                Backlog Orders
              </span>
            </div>
            <p className="text-xs text-industrial-500 mt-1">
              Active production orders requiring sizing preparation or reed stock allocation.
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pendingData} layout="vertical" margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" tick={{ fill: '#64748B', fontSize: 11 }} allowDecimals={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#334155', fontSize: 12, fontWeight: 600 }} width={140} />
                <Tooltip 
                  cursor={{ fill: '#F1F5F9' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                  formatter={(val: any) => [`${val} Orders`, 'Pending']}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {pendingData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART D: RUNOUT RISK SUMMARY */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-industrial-100 flex flex-col justify-between">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-industrial-900 flex items-center">
                <AlertTriangle className="w-4 h-4 mr-1.5 text-red-600" />
                Runout Risk Summary
              </h3>
              <span className="text-[11px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                {Object.keys(activeRuns).length} Running Looms
              </span>
            </div>
            <p className="text-xs text-industrial-500 mt-1">
              Authoritative runout distribution across operational warning horizons.
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={runoutRiskData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="interval" tick={{ fill: '#64748B', fontSize: 12, fontWeight: 600 }} />
                <YAxis tick={{ fill: '#64748B', fontSize: 11 }} allowDecimals={false} />
                <Tooltip 
                  cursor={{ fill: '#F1F5F9' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                  formatter={(val: any) => [`${val} Looms`, 'Count']}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {runoutRiskData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
