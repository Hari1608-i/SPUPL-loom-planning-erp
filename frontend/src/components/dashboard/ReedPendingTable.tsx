import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../../context/AppProvider';
import { Layers, CheckCircle2, ArrowRight } from 'lucide-react';
import { calculateOrderReedRequirement } from '../../utils/calculations';

export default function ReedPendingTable() {
  const { orders = [], designs = [], reeds = [] } = useAppContext();

  const reedAnalysis = useMemo(() => {
    const list: any[] = [];
    let totalPendingReedQty = 0;

    orders.forEach((ord: any) => {
      // Exclude completed orders
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

      const isPending = reqResult.shortageQty > 0 || reqResult.stockStatus === 'STOCK LOW' || reqResult.stockStatus === 'OUT OF STOCK';

      if (isPending) {
        totalPendingReedQty += reqResult.shortageQty;

        list.push({
          id: ord.id || ord.order_no,
          ibpoNo: ord.ibpo_no || ord.order_no || '—',
          customer: ord.customer_name || '—',
          buyer: ord.buyer_name || '—',
          designNo: ord.design_no_sp_no || '—',
          construction: ord.construction || matchedDesign?.construction || '—',
          reedCount,
          greigeWidth: matchedDesign?.greige_width || matchedDesign?.reedSpace || matchedDesign?.reed_space_warp_width || '—',
          requiredReedQty: reqResult.requiredReedQty,
          availableQty: reqResult.availableQty,
          allocatedQty: reqResult.reservedQty + reqResult.runningQty,
          pendingReedQty: reqResult.shortageQty,
          reedStatus: reqResult.stockStatus === 'STOCK LOW' ? 'REED LOW STOCK' : 'REED PENDING',
          plannedLoomCount,
          priority: ord.priority || 'NORMAL',
          remarks: ord.remarks || reqResult.recommendationMessage || '—'
        });
      }
    });

    return {
      items: list,
      pendingOrdersCount: list.length,
      totalPendingReedQty
    };
  }, [orders, designs, reeds]);

  return (
    <div className="space-y-4">
      {/* SUMMARY BANNER */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-black tracking-wide">Reed Pending Orders</h2>
            <span className="bg-blue-900/80 text-blue-200 text-xs font-black px-2.5 py-0.5 rounded-full border border-blue-700">
              {reedAnalysis.pendingOrdersCount} Orders
            </span>
          </div>
          <p className="text-xs text-slate-300 font-medium mt-1">
            Order-wise reed stock availability vs loom allocation requirements.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Reed Shortage</div>
            <div className="text-xl font-black text-amber-400">{reedAnalysis.totalPendingReedQty} Reeds</div>
          </div>
        </div>
      </div>

      {/* COMPACT ORDER CARDS GRID OR ZERO STATE */}
      {reedAnalysis.items.length === 0 ? (
        <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-6 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-emerald-900">✓ No Reed Pending Orders</h4>
              <p className="text-xs text-emerald-700 font-medium">All active orders have sufficient physical reed stock available.</p>
            </div>
          </div>
          <Link to="/orders" className="text-xs font-bold text-emerald-800 hover:underline flex items-center">
            View Order Management <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reedAnalysis.items.map((item, idx) => (
            <div 
              key={item.id || idx}
              className="bg-white rounded-2xl border border-industrial-100 p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3"
            >
              {/* Card Top: IBPO & Status */}
              <div className="flex items-start justify-between">
                <div>
                  <Link to="/orders" className="font-black text-base text-blue-700 hover:underline block leading-tight">
                    {item.ibpoNo}
                  </Link>
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                  item.reedStatus === 'REED LOW STOCK'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-red-100 text-red-800 border border-red-300'
                }`}>
                  {item.reedStatus}
                </span>
              </div>

              {/* Design, Construction & Greige Width */}
              <div className="bg-industrial-50/70 p-2.5 rounded-xl text-xs space-y-1 border border-industrial-100">
                <div className="flex justify-between">
                  <span className="text-industrial-400 font-medium">Design:</span>
                  <span className="font-bold text-indigo-700 truncate max-w-[180px]">{item.designNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-industrial-400 font-medium">Reed Count:</span>
                  <span className="font-bold text-slate-800">{item.reedCount} ({item.greigeWidth})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-industrial-400 font-medium">Construction:</span>
                  <span className="font-medium text-industrial-700 truncate max-w-[180px]">{item.construction}</span>
                </div>
              </div>

              {/* Reed Quantities Metrics Row */}
              <div className="grid grid-cols-4 gap-1 text-center bg-white p-2 rounded-xl border border-industrial-100">
                <div>
                  <div className="text-[9px] text-industrial-400 uppercase font-bold">Required</div>
                  <div className="text-xs font-black text-industrial-900 mt-0.5">{item.requiredReedQty}</div>
                </div>
                <div>
                  <div className="text-[9px] text-blue-600 uppercase font-bold">Available</div>
                  <div className="text-xs font-bold text-blue-700 mt-0.5">{item.availableQty}</div>
                </div>
                <div>
                  <div className="text-[9px] text-purple-600 uppercase font-bold">Allocated</div>
                  <div className="text-xs font-semibold text-purple-700 mt-0.5">{item.allocatedQty}</div>
                </div>
                <div>
                  <div className="text-[9px] text-amber-700 uppercase font-bold">Shortage</div>
                  <div className="text-xs font-black text-amber-700 mt-0.5">{item.pendingReedQty}</div>
                </div>
              </div>

              {/* Footer: Planned Looms & Priority */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-industrial-100 text-industrial-500">
                <div className="text-[11px] font-medium text-industrial-600">
                  Planned Looms: <span className="font-bold text-industrial-900">{item.plannedLoomCount}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  item.priority === 'CRITICAL' || item.priority === 'HIGH' || item.priority === 'URGENT'
                    ? 'bg-red-100 text-red-700 border border-red-200'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {item.priority}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
