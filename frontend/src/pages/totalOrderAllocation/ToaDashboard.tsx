import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, CheckCircle2, Clock, AlertTriangle, Layers, 
  TrendingUp, Download, RefreshCw, Eye, ArrowRight, Factory, 
  Calendar, CheckCircle, Percent
} from 'lucide-react';
import KPICard from '../../components/ui/KPICard';
import { API_BASE_URL } from '../../config';

interface DashboardData {
  totalOrders: number;
  pendingOrders: number;
  allocatedOrders: number;
  inProductionOrders: number;
  completedOrders: number;
  approachingCompletion: number;
  delayedOrders: number;
  awaitingConfirmation: number;
  totalOrderedMtr: number;
  totalAllocatedMtr: number;
  totalProducedMtr: number;
  remainingMtr: number;
  unallocatedMtr: number;
  inHouseAllocatedMtr: number;
  vendorAllocatedMtr: number;
  allocatedInHouseLooms: number;
  allocatedVendorLooms: number;
  totalInHouseLooms: number;
  totalVendorLooms: number;
  dailyMtrCapacity: number;
  weeklyMtrCapacity: number;
  weeklyTargetKpx: number;
  orders: any[];
}

interface ToaDashboardProps {
  onSelectTab: (tabId: string, ibpo?: string) => void;
}

export default function ToaDashboard({ onSelectTab }: ToaDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/dashboard`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || 'Failed to load dashboard data');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleExportExcel = () => {
    window.open(`${API_BASE_URL}/api/total-order-allocation/reports/export-excel`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Loading Total Order Allocation Dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700">
        <p className="font-bold">Error loading dashboard</p>
        <p className="text-sm">{error}</p>
        <button onClick={fetchDashboard} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium">
          Retry
        </button>
      </div>
    );
  }

  const d = data || {
    totalOrders: 0,
    pendingOrders: 0,
    allocatedOrders: 0,
    inProductionOrders: 0,
    completedOrders: 0,
    approachingCompletion: 0,
    delayedOrders: 0,
    awaitingConfirmation: 0,
    totalOrderedMtr: 0,
    totalAllocatedMtr: 0,
    totalProducedMtr: 0,
    remainingMtr: 0,
    unallocatedMtr: 0,
    inHouseAllocatedMtr: 0,
    vendorAllocatedMtr: 0,
    allocatedInHouseLooms: 0,
    allocatedVendorLooms: 0,
    totalInHouseLooms: 224,
    totalVendorLooms: 0,
    dailyMtrCapacity: 115732,
    weeklyMtrCapacity: 810122,
    weeklyTargetKpx: 2926000,
    orders: []
  };

  const allocPct = d.totalOrderedMtr > 0 ? ((d.totalAllocatedMtr / d.totalOrderedMtr) * 100).toFixed(1) : '0';
  const prodPct = d.totalOrderedMtr > 0 ? ((d.totalProducedMtr / d.totalOrderedMtr) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-3xl text-white shadow-xl border border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 rounded-full text-xs font-bold uppercase tracking-wider">
              Autonomous Planning & Control
            </span>
            <span className="text-xs text-slate-400 font-medium">
              Updated Live • Ref: KPX 2026 Engine
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-1 text-white">
            Total Order Allocation Dashboard
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl font-medium">
            Multi-order capability checking, automated FIFO start/completion forecasting, dedicated in-house vs vendor segregation, and audited closure.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchDashboard}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all border border-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/30 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel Report
          </button>
        </div>
      </div>

      {/* Row 1: Primary Order Status KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div 
          onClick={() => onSelectTab('orders')}
          className="cursor-pointer group"
        >
          <KPICard
            title="Total Registered Orders"
            value={d.totalOrders}
            icon={ClipboardList}
            color="primary"
          />
        </div>

        <div 
          onClick={() => onSelectTab('inhouse')}
          className="cursor-pointer group"
        >
          <KPICard
            title="Pending Allocation"
            value={d.pendingOrders}
            icon={Clock}
            color="warning"
          />
        </div>

        <div 
          onClick={() => onSelectTab('production')}
          className="cursor-pointer group"
        >
          <KPICard
            title="In Active Production"
            value={d.inProductionOrders}
            icon={Factory}
            color="secondary"
          />
        </div>

        <div 
          onClick={() => onSelectTab('completion')}
          className="cursor-pointer group"
        >
          <KPICard
            title="Completed & Closed"
            value={d.completedOrders}
            icon={CheckCircle2}
            color="success"
          />
        </div>
      </div>

      {/* Row 2: Meter Allocation & Segregation Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Meter Progression Card */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              Order Volume & Balance
            </h3>
            <span className="text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">
              {prodPct}% Weft Done
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                <span>Total Ordered Quantity</span>
                <span className="text-slate-900 dark:text-white font-black">{d.totalOrderedMtr.toLocaleString()} MTR</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                <div className="bg-indigo-600 h-2 rounded-full" style={{ width: '100%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                <span>Total Allocated Quantity ({allocPct}%)</span>
                <span className="text-indigo-600 font-black">{d.totalAllocatedMtr.toLocaleString()} MTR</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(100, Number(allocPct))}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                <span>Total Actual Produced ({prodPct}%)</span>
                <span className="text-emerald-600 font-black">{d.totalProducedMtr.toLocaleString()} MTR</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(100, Number(prodPct))}%` }} />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center text-xs">
            <span className="text-slate-500 font-semibold">Balance To Weave</span>
            <span className="font-black text-rose-600 text-sm">{d.remainingMtr.toLocaleString()} MTR</span>
          </div>
        </div>

        {/* In-House vs Vendor Split */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              In-House vs Vendor Split
            </h3>
            <span className="text-xs font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
              Segregated Streams
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl">
              <p className="text-[11px] font-bold text-indigo-700 dark:text-indigo-400 uppercase">In-House Looms</p>
              <h4 className="text-2xl font-black text-indigo-900 dark:text-white mt-1">{d.allocatedInHouseLooms}</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 font-medium">
                {d.inHouseAllocatedMtr.toLocaleString()} MTR allocated
              </p>
              <span className="text-[10px] text-slate-500">Cap: {d.totalInHouseLooms} Looms</span>
            </div>

            <div className="p-4 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40 rounded-2xl">
              <p className="text-[11px] font-bold text-purple-700 dark:text-purple-400 uppercase">Vendor Looms</p>
              <h4 className="text-2xl font-black text-purple-900 dark:text-white mt-1">{d.allocatedVendorLooms}</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 font-medium">
                {d.vendorAllocatedMtr.toLocaleString()} MTR allocated
              </p>
              <span className="text-[10px] text-slate-500">Cap: {d.totalVendorLooms} Master Looms</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center text-xs">
            <span className="text-slate-500 font-semibold">Unallocated Balance</span>
            <span className="font-black text-amber-600">{d.unallocatedMtr.toLocaleString()} MTR</span>
          </div>
        </div>

        {/* Reference Weekly & Daily Capacity Standards (KPX 2026 Engine) */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              KPX 2026 Capacity Standards
            </h3>
            <span className="text-xs font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">
              Read-Only Ref
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
              <span className="text-slate-500 font-medium">Weekly Target KPX</span>
              <span className="font-black text-slate-800 dark:text-white">{d.weeklyTargetKpx.toLocaleString()} KPX/wk</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
              <span className="text-slate-500 font-medium">Weekly Capacity (MTR)</span>
              <span className="font-black text-slate-800 dark:text-white">{d.weeklyMtrCapacity.toLocaleString()} MTR</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
              <span className="text-slate-500 font-medium">Estimated Daily Capacity</span>
              <span className="font-black text-emerald-600">{d.dailyMtrCapacity.toLocaleString()} MTR/day</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500 font-medium">Average PPI Reference</span>
              <span className="font-black text-slate-800 dark:text-white">66 PPI</span>
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-[11px] text-slate-500 dark:text-slate-400">
            Formula: KPX × 0.27686997 | Calculations auto-adjust per order without overwriting reference sheets.
          </div>
        </div>
      </div>

      {/* Row 3: Active Orders Register Preview */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-white tracking-tight">
              Active Orders & Capacity Allocation Stream
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any order row to review full capability analysis, loom assignment or production log.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onSelectTab('orders')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              Order Entry Grid <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {d.orders.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
            <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Orders in Total Order Allocation System</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Start by entering bulk orders via normal form, spreadsheet grid, or pasting directly from Excel.
            </p>
            <button
              onClick={() => onSelectTab('orders')}
              className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md"
            >
              + Register New Orders
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                  <th className="p-3">IBPO</th>
                  <th className="p-3">SP NO / Design</th>
                  <th className="p-3">Type</th>
                  <th className="p-3 text-right">GREY REQ (MTR)</th>
                  <th className="p-3 text-right">Produced (MTR)</th>
                  <th className="p-3 text-right">Balance</th>
                  <th className="p-3">Received Date</th>
                  <th className="p-3">Alloc Stream</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {d.orders.map((o: any) => {
                  const produced = o.productionLogs?.reduce((acc: number, p: any) => acc + (Number(p.produced_meter) || 0), 0) || 0;
                  const balance = (Number(o.order_qty) || 0) - produced;
                  const pct = o.order_qty > 0 ? Math.round((produced / o.order_qty) * 100) : 0;

                  return (
                    <tr 
                      key={o.id} 
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="p-3 font-mono font-black text-indigo-600 dark:text-indigo-400">
                        {o.ibpo}
                      </td>
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                        {o.sp_no}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${o.order_type === 'Grey' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                          {o.order_type}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900 dark:text-white">
                        {Number(o.order_qty).toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-bold text-emerald-600">
                        {produced.toLocaleString()} ({pct}%)
                      </td>
                      <td className="p-3 text-right font-black text-rose-600">
                        {Math.max(0, balance).toLocaleString()}
                      </td>
                      <td className="p-3 text-slate-500">
                        {o.received_date ? new Date(o.received_date).toLocaleDateString() : '-'}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          o.allocation_type === 'IN_HOUSE' ? 'bg-indigo-100 text-indigo-700' :
                          o.allocation_type === 'VENDOR' ? 'bg-purple-100 text-purple-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {o.allocation_type || 'UNALLOCATED'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2.5 py-0.5 rounded-full font-black text-[10px] ${
                          o.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                          o.status === 'IN_PRODUCTION' ? 'bg-blue-100 text-blue-800' :
                          o.status === 'ALLOCATED' ? 'bg-purple-100 text-purple-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => onSelectTab('report', o.ibpo)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded-lg text-[11px] font-bold transition-all border border-slate-200"
                        >
                          View Lifecycle
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
