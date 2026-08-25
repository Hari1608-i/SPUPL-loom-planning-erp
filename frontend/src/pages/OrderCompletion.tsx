import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircle2, Clock, Search, Filter, RefreshCw, FileText, Download, 
  Printer, ArrowRight, ShieldCheck, AlertTriangle, Package, Layers, Activity, Calendar, Award
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import * as XLSX from 'xlsx';
import { API_BASE_URL } from '../config';
import { CompanyPrintHeader } from '../components/common/CompanyPrintHeader';
import { calculateOrderPlanning } from '../utils/calculations';
import { triggerPrint } from '../utils/printManager';



interface CompletedOrderRecord {
  id: number;
  order_no: string;
  ibpo_no?: string;
  customer_name: string;
  buyer_name?: string;
  design_no_sp_no: string;
  construction?: string;
  order_qty: number;
  grey_qty?: number;
  warp_qty?: number;
  uom: string;
  order_received_date: string;
  target_delivery_date?: string;
  
  // Yarn Details
  required_yarn_qty?: number;
  confirmed_yarn_qty?: number;
  balance_yarn_qty?: number;
  yarn_confirmation_date?: string;
  
  // Sizing Details
  sizing_required_qty?: number;
  sizing_confirmed_qty?: number;
  sizing_date?: string;
  sizing_completion_date?: string;
  
  // Beam & Weaving Details
  beams_used?: string;
  looms_used?: string;
  loom_start_date?: string;
  loom_end_date?: string;
  daily_production_avg?: number;
  total_produced_meter?: number;
  
  // Completion Details
  final_status: string;
  produced_qty: number;
  short_excess_qty?: number;
  actual_completion_date: string;
  delay_days?: number;
  delay_reason?: string;
  corrective_action?: string;
  planner_remarks?: string;
  completed_by?: string;
  createdAt: string;
}

export default function OrderCompletion() {
  const [historyRecords, setHistoryRecords] = useState<CompletedOrderRecord[]>([]);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'history' | 'complete_action'>('history');
  
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedRecord, setSelectedRecord] = useState<CompletedOrderRecord | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [showCompleteModal, setShowCompleteModal] = useState<boolean>(false);
  const [selectedOrderToComplete, setSelectedOrderToComplete] = useState<any | null>(null);

  // Completion Form
  const [completionStatus, setCompletionStatus] = useState<string>('COMPLETED');
  const [actualProducedQty, setActualProducedQty] = useState<number>(0);
  const [completionDate, setCompletionDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [completedBy, setCompletedBy] = useState<string>('Production Head');
  const [delayReason, setDelayReason] = useState<string>('');
  const [correctiveAction, setCorrectiveAction] = useState<string>('');
  const [plannerRemarks, setPlannerRemarks] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [historyRes, ordersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/order-completion/history`),
        fetch(`${API_BASE_URL}/api/orders`)
      ]);

      let histData: any[] = [];
      let ordsData: any[] = [];

      if (historyRes.ok) histData = await historyRes.json();
      if (ordersRes.ok) ordsData = await ordersRes.json();

      setActiveOrders(ordsData.filter((o: any) => o.status !== 'ORDER COMPLETED' && o.status !== 'Completed' && o.order_completion_status !== 'COMPLETED'));

      const completedFromOrders = ordsData.filter((o: any) => o.status === 'ORDER COMPLETED' || o.status === 'Completed' || o.order_completion_status === 'COMPLETED');
      const combined = [...histData];

      completedFromOrders.forEach((co: any) => {
        if (!combined.some(h => h.id === co.id || (co.ibpo_no && h.ibpo_no === co.ibpo_no))) {
          combined.push({
            id: co.id,
            order_no: co.order_no || co.ibpo_no || `ORD-${co.id}`,
            ibpo_no: co.ibpo_no,
            customer_name: co.customer_name,
            buyer_name: co.buyer_name,
            design_no_sp_no: co.design_no_sp_no,
            construction: co.construction || co.designMaster?.construction || '',
            order_qty: co.order_qty,
            grey_qty: co.grey_qty,
            warp_qty: co.warp_qty,
            uom: co.uom || 'Meters',
            order_received_date: co.order_received_date,
            weaving_completion_date: co.weaving_completion_date || co.expected_completion_date,
            actual_completion_date: co.actual_completion_date || co.updatedAt,
            produced_qty: co.produced_qty || co.order_qty,
            final_status: co.status || 'ORDER COMPLETED',
            completed_by: co.completed_by || 'Planning Manager',
            planner_remarks: co.completion_remarks || co.remarks || 'Completed',
            createdAt: co.createdAt
          });
        }
      });

      setHistoryRecords(combined);
    } catch (err) {
      console.error('Error fetching completion data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const handleOpenCompleteModal = (order: any) => {
    setSelectedOrderToComplete(order);
    const prodQty = Number(order.produced_qty || order.order_qty || 0);
    setActualProducedQty(prodQty);
    setCompletionStatus(prodQty >= order.order_qty ? 'COMPLETED' : 'SHORT CLOSED');
    setShowCompleteModal(true);
  };

  const handleConfirmCompletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderToComplete) return;

    setSubmitting(true);
    setMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/order-completion/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_no: selectedOrderToComplete.order_no,
          final_status: completionStatus,
          produced_qty: Number(actualProducedQty),
          actual_completion_date: completionDate,
          completed_by: completedBy,
          delay_reason: delayReason,
          corrective_action: correctiveAction,
          planner_remarks: plannerRemarks
        })
      });

      const result = await res.json();
      if (res.ok && result.success) {
        setMsg({ text: `Order ${selectedOrderToComplete.order_no} successfully COMPLETED and moved to History!`, type: 'success' });
        setShowCompleteModal(false);
        fetchAllData();
      } else {
        setMsg({ text: result.error || 'Failed to complete order', type: 'error' });
      }
    } catch (err: any) {
      setMsg({ text: err.message || 'Server error', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    const dataToExport = historyRecords.map(r => ({
      'Order No': r.order_no,
      'IBPO No': r.ibpo_no || '—',
      'Design No': r.design_no_sp_no,
      'Order Qty': r.order_qty,
      'Produced Qty': r.produced_qty,
      'Short / Excess Qty': r.short_excess_qty || 0,
      'Order Received Date': r.order_received_date ? format(new Date(r.order_received_date), 'dd/MM/yyyy') : '—',
      'Target Delivery Date': r.target_delivery_date ? format(new Date(r.target_delivery_date), 'dd/MM/yyyy') : '—',
      'Actual Completion Date': r.actual_completion_date ? format(new Date(r.actual_completion_date), 'dd/MM/yyyy') : '—',
      'Delay Days': r.delay_days || 0,
      'Final Status': r.final_status,
      'Completed By': r.completed_by || '—',
      'Planner Remarks': r.planner_remarks || '—'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Completed Orders');
    XLSX.writeFile(wb, `SPUPL_Completed_Orders_History_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const filteredHistory = useMemo(() => {
    return historyRecords.filter(r => {
      const q = searchTerm.toLowerCase();
      const matchQuery = 
        !q ||
        r.order_no.toLowerCase().includes(q) ||
        (r.ibpo_no && r.ibpo_no.toLowerCase().includes(q)) ||
        r.design_no_sp_no.toLowerCase().includes(q);

      const matchStatus = statusFilter === 'ALL' || r.final_status === statusFilter;
      return matchQuery && matchStatus;
    });
  }, [historyRecords, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    const total = historyRecords.length;
    const completed = historyRecords.filter(r => r.final_status === 'COMPLETED').length;
    const shortClosed = historyRecords.filter(r => r.final_status === 'SHORT CLOSED').length;
    const excess = historyRecords.filter(r => r.final_status === 'EXCESS PRODUCED').length;
    const delayed = historyRecords.filter(r => (r.delay_days || 0) > 0).length;

    return { total, completed, shortClosed, excess, delayed };
  }, [historyRecords]);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto pb-20">
      <CompanyPrintHeader title="Order Completion & Historical Production Archive" subtitle="Official Santhi Processing Unit Pvt. Ltd. Closed Order Registry" />

      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm print:hidden">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Award className="w-7 h-7 text-emerald-600" />
            Order Completion & History Archive
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Complete active orders after weaving production fulfillment and inspect full 15-point historical traceability.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-sm transition-all"
          >
            <Download className="w-4 h-4" /> Export Excel
          </button>
          <button
            onClick={() => triggerPrint()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-sm shadow-sm transition-all"
          >
            <Printer className="w-4 h-4" /> Print Report
          </button>
        </div>
      </div>

      {msg && (
        <div className={`p-4 rounded-xl font-bold text-sm flex items-center gap-3 print:hidden ${
          msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {msg.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 print:hidden">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase">Total Completed</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/20 shadow-sm">
          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">Fully Completed</p>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.completed}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/20 shadow-sm">
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase">Short Closed</p>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{stats.shortClosed}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-blue-200 dark:border-blue-800/40 bg-blue-50/20 shadow-sm">
          <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase">Excess Produced</p>
          <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">{stats.excess}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50/20 shadow-sm">
          <p className="text-xs font-bold text-red-600 dark:text-red-400 uppercase">Delayed Orders</p>
          <p className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">{stats.delayed}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 space-x-6 print:hidden">
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'history' ? 'border-spu-primary text-spu-primary' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" /> Completed Orders History ({historyRecords.length})
        </button>
        <button
          onClick={() => setActiveTab('complete_action')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'complete_action' ? 'border-spu-primary text-spu-primary' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Pending Completion Review ({activeOrders.length})
        </button>
      </div>

      {/* TAB 1: HISTORY TABLE */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center print:hidden">
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search Order No, IBPO, Design, Customer..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-spu-primary"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold outline-none"
              >
                <option value="ALL">All Completion Statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="SHORT CLOSED">Short Closed</option>
                <option value="EXCESS PRODUCED">Excess Produced</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                    <th className="py-3 px-4">Order / IBPO</th>
                    <th className="py-3 px-4">Customer & Design</th>
                    <th className="py-3 px-4 text-right">Order Qty</th>
                    <th className="py-3 px-4 text-right">Produced Qty</th>
                    <th className="py-3 px-4 text-right">Short / Excess</th>
                    <th className="py-3 px-4">Actual Completion Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center print:hidden">Audit Trace</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-sm font-medium">
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No completed order history records found.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-spu-primary">{r.order_no}</div>
                          {r.ibpo_no && <div className="text-xs text-slate-400">IBPO: {r.ibpo_no}</div>}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800 dark:text-slate-200">{r.design_no_sp_no}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-semibold">
                          {r.order_qty.toLocaleString()} {r.uom}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {r.produced_qty.toLocaleString()} {r.uom}
                        </td>
                        <td className="py-3 px-4 text-right font-bold">
                          <span className={r.short_excess_qty && r.short_excess_qty < 0 ? 'text-amber-600' : 'text-blue-600'}>
                            {r.short_excess_qty ? (r.short_excess_qty > 0 ? `+${r.short_excess_qty}` : r.short_excess_qty) : 0} {r.uom}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-xs">
                            {r.actual_completion_date ? format(new Date(r.actual_completion_date), 'dd MMM yyyy') : '—'}
                          </div>
                          {(r.delay_days || 0) !== 0 ? (
                            r.delay_days && r.delay_days > 0 ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-full mt-1">
                                <AlertTriangle className="w-3 h-3" /> Delayed {r.delay_days} Days
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full mt-1">
                                <CheckCircle2 className="w-3 h-3" /> Early {Math.abs(r.delay_days || 0)} Days
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full mt-1">
                              On Time
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider inline-flex items-center gap-1 border ${
                            r.final_status === 'COMPLETED' ? (r.delay_days && r.delay_days > 0 ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300') :
                            r.final_status === 'SHORT CLOSED' ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300' :
                            'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300'
                          }`}>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                            {r.final_status === 'COMPLETED' 
                              ? (r.delay_days && r.delay_days > 0 ? '✓ COMPLETED – DELAYED' : '✓ ORDER COMPLETED') 
                              : `✓ ${r.final_status}`}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center print:hidden">
                          <button
                            onClick={() => { setSelectedRecord(r); setShowDetailModal(true); }}
                            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors"
                          >
                            View Audit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PENDING COMPLETION REVIEW */}
      {activeTab === 'complete_action' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-black text-slate-800 dark:text-white">Active Orders Pending Completion Action</h3>
            <p className="text-xs text-slate-500">Orders with production fulfillment ready to be verified and moved to Completed Order History.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-3 px-4">Order No / IBPO</th>
                  <th className="py-3 px-4">Customer & Design</th>
                  <th className="py-3 px-4 text-right">Order Qty</th>
                  <th className="py-3 px-4 text-right">Warp Confirmed</th>
                  <th className="py-3 px-4 text-right">Produced Qty</th>
                  <th className="py-3 px-4">Current Status</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-sm font-medium">
                {activeOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No active orders pending completion review.
                    </td>
                  </tr>
                ) : (
                  activeOrders.map(o => (
                    <tr key={o.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-spu-primary">{o.order_no}</div>
                        {o.ibpo_no && <div className="text-xs text-slate-400">IBPO: {o.ibpo_no}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{o.design_no_sp_no}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">
                        {o.order_qty.toLocaleString()} {o.uom}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-blue-600">
                        {(o.warp_confirmed_qty || o.warp_qty || 0).toLocaleString()} Mtr
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-600">
                        {(o.produced_qty || 0).toLocaleString()} Mtr
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider inline-flex items-center gap-1 border ${
                          o.status === 'WEAVING COMPLETED' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {o.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleOpenCompleteModal(o)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-sm transition-all flex items-center gap-1 mx-auto"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Confirm Order Completion
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Complete Order Modal */}
      {showCompleteModal && selectedOrderToComplete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center pb-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Confirm Order Completion</h3>
                <p className="text-xs text-slate-500">Order: {selectedOrderToComplete.order_no} | IBPO: {selectedOrderToComplete.ibpo_no || '—'}</p>
              </div>
              <button onClick={() => setShowCompleteModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
            </div>

            <form onSubmit={handleConfirmCompletion} className="space-y-4 mt-4 text-sm font-medium">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Final Completion Status</label>
                <select
                  value={completionStatus}
                  onChange={e => setCompletionStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold outline-none"
                >
                  <option value="COMPLETED">COMPLETED (Full Production)</option>
                  <option value="SHORT CLOSED">SHORT CLOSED (Authorized Shortfall)</option>
                  <option value="EXCESS PRODUCED">EXCESS PRODUCED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Order Quantity</label>
                  <input
                    type="text"
                    disabled
                    value={`${selectedOrderToComplete.order_qty.toLocaleString()} ${selectedOrderToComplete.uom}`}
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Actual Produced Qty</label>
                  <input
                    type="number"
                    required
                    value={actualProducedQty}
                    onChange={e => setActualProducedQty(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-spu-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Actual Completion Date</label>
                <input
                  type="date"
                  required
                  value={completionDate}
                  onChange={e => setCompletionDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-spu-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Completed By</label>
                <input
                  type="text"
                  required
                  value={completedBy}
                  onChange={e => setCompletedBy(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-spu-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Delay Reason (if delayed)</label>
                <input
                  type="text"
                  value={delayReason}
                  onChange={e => setDelayReason(e.target.value)}
                  placeholder="Yarn receipt delay, machine breakdown, etc."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl text-sm outline-none focus:border-spu-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Planner / Manager Remarks</label>
                <textarea
                  rows={2}
                  value={plannerRemarks}
                  onChange={e => setPlannerRemarks(e.target.value)}
                  placeholder="Final quality inspection, customer dispatch approval..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl text-sm outline-none focus:border-spu-primary resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowCompleteModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Archiving...' : 'Complete & Archive'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit Detail Modal */}
      {showDetailModal && selectedRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-2xl w-full shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  Full Order Audit Trail — {selectedRecord.order_no}
                </h3>
                <p className="text-xs text-slate-500">Design: {selectedRecord.design_no_sp_no}</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
            </div>

            <div className="space-y-4 mt-4 text-xs font-medium">
              {/* Order Info */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <h4 className="font-black text-slate-800 dark:text-white uppercase text-[11px]">1. Order Details</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-slate-400 block">IBPO:</span> <strong className="text-slate-800 dark:text-slate-200">{selectedRecord.ibpo_no || '—'}</strong></div>
                  <div><span className="text-slate-400 block">Order Qty:</span> <strong className="text-slate-800 dark:text-slate-200">{selectedRecord.order_qty.toLocaleString()} {selectedRecord.uom}</strong></div>
                </div>
              </div>

              {/* Warp & Beam Specs */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <h4 className="font-black text-slate-800 dark:text-white uppercase text-[11px]">2. Warp & Beam Specifications</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div><span className="text-slate-400 block">Required Warp Qty:</span> <strong className="text-slate-800 dark:text-slate-200">{(selectedRecord.required_yarn_qty || selectedRecord.sizing_required_qty || 0).toLocaleString()} Mtr</strong></div>
                  <div><span className="text-slate-400 block">Allocated Warp Qty:</span> <strong className="text-emerald-600">{(selectedRecord.confirmed_yarn_qty || selectedRecord.sizing_confirmed_qty || 0).toLocaleString()} Mtr</strong></div>
                  <div><span className="text-slate-400 block">Warping / Sizing Date:</span> <strong className="text-slate-800 dark:text-slate-200">{selectedRecord.sizing_date || selectedRecord.yarn_confirmation_date ? format(new Date(selectedRecord.sizing_date || selectedRecord.yarn_confirmation_date || ''), 'dd/MM/yyyy') : '—'}</strong></div>
                </div>
              </div>

              {/* Weaving & Completion */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <h4 className="font-black text-slate-800 dark:text-white uppercase text-[11px]">3. Weaving Production & Completion</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div><span className="text-slate-400 block">Final Status:</span> <strong className="text-emerald-600">{selectedRecord.final_status}</strong></div>
                  <div><span className="text-slate-400 block">Total Produced:</span> <strong className="text-slate-800 dark:text-slate-200">{selectedRecord.produced_qty.toLocaleString()} {selectedRecord.uom}</strong></div>
                  <div><span className="text-slate-400 block">Completed By:</span> <strong className="text-slate-800 dark:text-slate-200">{selectedRecord.completed_by || '—'}</strong></div>
                </div>
              </div>

              {selectedRecord.planner_remarks && (
                <div className="p-3 bg-blue-50/50 text-blue-900 rounded-xl border border-blue-200">
                  <strong>Remarks:</strong> {selectedRecord.planner_remarks}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-slate-800 text-white font-bold rounded-xl text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
