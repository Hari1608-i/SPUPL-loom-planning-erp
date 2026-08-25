import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../../context/AppProvider';
import { Scissors, CheckCircle2, Calendar, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

export default function SizingPendingTable() {
  const { orders = [], designs = [] } = useAppContext();

  const sizingAnalysis = useMemo(() => {
    const list: any[] = [];
    let totalPendingMeters = 0;
    let totalOrderMeters = 0;

    orders.forEach((ord: any) => {
      // Exclude completed orders
      const isCompleted = (ord.order_completion_status || '').toUpperCase() === 'COMPLETED' || (ord.status || '').toUpperCase() === 'ORDER COMPLETED';
      if (isCompleted) return;

      const matchedDesign = designs.find((d: any) =>
        (d.design_no_sp_no || '').trim() === (ord.design_no_sp_no || '').trim() ||
        (d.design_no_sp_no || '').trim() === (ord.ibpo_no || '').trim()
      );

      const orderQty = Math.max(0, Number(ord.order_qty) || 0);
      const producedQty = Math.max(0, Number(ord.produced_qty || ord.grey_qty) || 0);
      const balanceQty = Math.max(0, orderQty - producedQty);

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

      // Sizing Pending condition
      const isSizingPending = sizingPendingQty > 0 && sizingStatusUpper !== 'COMPLETED';

      if (isSizingPending) {
        totalPendingMeters += sizingPendingQty;
        totalOrderMeters += orderQty;

        let planDateFormatted = '—';
        if (ord.sizing_planned_date) {
          try {
            const d = new Date(ord.sizing_planned_date);
            if (!isNaN(d.getTime())) planDateFormatted = format(d, 'dd-MM-yyyy');
          } catch {}
        }

        let weavingStartFormatted = '—';
        if (ord.weaving_planned_date || ord.weaving_start_date) {
          try {
            const d = new Date(ord.weaving_planned_date || ord.weaving_start_date);
            if (!isNaN(d.getTime())) weavingStartFormatted = format(d, 'dd-MM-yyyy');
          } catch {}
        }

        let targetCompletionFormatted = '—';
        if (ord.target_delivery_date || ord.expected_completion_date) {
          try {
            const d = new Date(ord.target_delivery_date || ord.expected_completion_date);
            if (!isNaN(d.getTime())) targetCompletionFormatted = format(d, 'dd-MM-yyyy');
          } catch {}
        }

        list.push({
          id: ord.id || ord.order_no,
          ibpoNo: ord.ibpo_no || ord.order_no || '—',
          customer: ord.customer_name || '—',
          buyer: ord.buyer_name || '—',
          designNo: ord.design_no_sp_no || '—',
          construction: ord.construction || matchedDesign?.construction || '—',
          orderQty,
          producedQty,
          balanceQty,
          sizingPlanDate: planDateFormatted,
          sizingStatus: ord.sizing_status || 'SIZING PENDING',
          sizingCompletedQty,
          sizingPendingQty,
          weavingStart: weavingStartFormatted,
          targetCompletion: targetCompletionFormatted,
          priority: ord.priority || 'NORMAL',
          remarks: ord.remarks || '—'
        });
      }
    });

    return {
      items: list,
      pendingOrdersCount: list.length,
      totalPendingMeters,
      totalOrderMeters
    };
  }, [orders, designs]);

  return (
    <div className="space-y-4">
      {/* SUMMARY BANNER */}
      <div className="bg-indigo-900/90 dark:bg-indigo-950 text-white rounded-2xl p-5 shadow-md border border-indigo-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Scissors className="w-5 h-5 text-indigo-300" />
            <h2 className="text-lg font-black tracking-wide">Sizing Pending Orders</h2>
            <span className="bg-indigo-700/80 text-indigo-100 text-xs font-black px-2.5 py-0.5 rounded-full border border-indigo-500">
              {sizingAnalysis.pendingOrdersCount} Orders
            </span>
          </div>
          <p className="text-xs text-indigo-200 font-medium mt-1">
            Warp yarn sizing requirement pending derived from active ERP orders.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-indigo-950/60 p-3 rounded-xl border border-indigo-700/50">
          <div>
            <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Total Pending Sizing</div>
            <div className="text-xl font-black text-amber-400">{sizingAnalysis.totalPendingMeters.toLocaleString()} m</div>
          </div>
          <div className="h-8 w-px bg-indigo-700/60" />
          <div>
            <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Total Orders Qty</div>
            <div className="text-sm font-bold text-indigo-100">{sizingAnalysis.totalOrderMeters.toLocaleString()} m</div>
          </div>
        </div>
      </div>

      {/* COMPACT ORDER CARDS GRID OR ZERO STATE */}
      {sizingAnalysis.items.length === 0 ? (
        <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-6 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-emerald-900">✓ No Sizing Pending Orders</h4>
              <p className="text-xs text-emerald-700 font-medium">All active orders have sizing processing up to date or completed.</p>
            </div>
          </div>
          <Link to="/orders" className="text-xs font-bold text-emerald-800 hover:underline flex items-center">
            View Order Management <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sizingAnalysis.items.map((item, idx) => (
            <div 
              key={item.id || idx}
              className="bg-white rounded-2xl border border-industrial-100 p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3"
            >
              {/* Card Top: IBPO & Status */}
              <div className="flex items-start justify-between">
                <div>
                  <Link to="/orders" className="font-black text-base text-indigo-700 hover:underline block leading-tight">
                    {item.ibpoNo}
                  </Link>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                  {item.sizingStatus}
                </span>
              </div>

              {/* Design & Construction */}
              <div className="bg-industrial-50/70 p-2.5 rounded-xl text-xs space-y-1 border border-industrial-100">
                <div className="flex justify-between">
                  <span className="text-industrial-400 font-medium">Design:</span>
                  <span className="font-bold text-blue-700 truncate max-w-[180px]">{item.designNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-industrial-400 font-medium">Construction:</span>
                  <span className="font-medium text-industrial-700 truncate max-w-[180px]">{item.construction}</span>
                </div>
              </div>

              {/* Order Quantities Metrics Row */}
              <div className="grid grid-cols-3 gap-2 text-center bg-white p-2 rounded-xl border border-industrial-100">
                <div>
                  <div className="text-[10px] text-industrial-400 uppercase font-bold">Order Qty</div>
                  <div className="text-xs font-black text-industrial-900 mt-0.5">{item.orderQty.toLocaleString()} m</div>
                </div>
                <div>
                  <div className="text-[10px] text-industrial-400 uppercase font-bold">Produced</div>
                  <div className="text-xs font-semibold text-industrial-700 mt-0.5">{item.producedQty.toLocaleString()} m</div>
                </div>
                <div>
                  <div className="text-[10px] text-indigo-500 uppercase font-bold">Pending</div>
                  <div className="text-xs font-black text-indigo-700 mt-0.5">{item.sizingPendingQty.toLocaleString()} m</div>
                </div>
              </div>

              {/* Footer: Plan Date & Priority */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-industrial-100 text-industrial-500">
                <div className="flex items-center text-[11px] font-medium">
                  <Calendar className="w-3.5 h-3.5 mr-1 text-industrial-400" />
                  Plan Date: <span className="font-bold text-industrial-800 ml-1">{item.sizingPlanDate}</span>
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
