import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, XCircle, AlertTriangle, ShieldAlert, RefreshCw, 
  RotateCcw, Check, ArrowRight, Eye, ShieldCheck, FileCheck, Layers
} from 'lucide-react';
import { API_BASE_URL } from '../../config';

interface ToaCompletionReviewProps {
  initialIbpo?: string;
  onOrderClosed?: (ibpo: string) => void;
}

export default function ToaCompletionReview({ initialIbpo, onOrderClosed }: ToaCompletionReviewProps) {
  const [viewMode, setViewMode] = useState<'pending' | 'completed'>('pending');
  const [orders, setOrders] = useState<any[]>([]);
  const [completedOrders, setCompletedOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal / Review action state
  const [selectedReviewOrder, setSelectedReviewOrder] = useState<any | null>(null);
  const [approvalReason, setApprovalReason] = useState('');
  const [isApprovedCheckbox, setIsApprovedCheckbox] = useState(false);
  const [closedBy, setClosedBy] = useState('Planning Head');
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Reopen State
  const [reopenModalOrder, setReopenModalOrder] = useState<any | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenedBy, setReopenedBy] = useState('Admin');

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const [activeRes, completedRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/total-order-allocation/orders`),
        fetch(`${API_BASE_URL}/api/total-order-allocation/orders?include_completed=true&status=COMPLETED`)
      ]);

      const activeJson = await activeRes.json();
      const completedJson = await completedRes.json();

      if (activeJson.success) {
        setOrders(activeJson.data || []);
      }
      if (completedJson.success) {
        setCompletedOrders(completedJson.data || []);
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const openCloseReviewModal = async (ibpo: string) => {
    setNotification(null);
    setApprovalReason('');
    setIsApprovedCheckbox(false);
    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/completion-review/${ibpo}`);
      const json = await res.json();
      if (json.success) {
        setSelectedReviewOrder(json.data);
      } else {
        setNotification({ type: 'error', message: json.error || 'Failed to fetch review data' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  const handleConfirmClose = async () => {
    if (!selectedReviewOrder) return;
    const { ibpo, is_within_3_pct } = selectedReviewOrder;

    if (!is_within_3_pct && (!isApprovedCheckbox || !approvalReason.trim())) {
      setNotification({
        type: 'error',
        message: 'Deviation exceeds ±3%. You must check authorization and provide an explanation to close this order.'
      });
      return;
    }

    setSubmitting(true);
    setNotification(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/close-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ibpo,
          closed_by: closedBy,
          is_approved: isApprovedCheckbox,
          approval_reason: approvalReason,
          approved_by: closedBy
        })
      });
      const json = await res.json();
      if (json.success) {
        setNotification({ type: 'success', message: json.message });
        setSelectedReviewOrder(null);
        fetchOrders();
        if (onOrderClosed) onOrderClosed(ibpo);
      } else {
        setNotification({ type: 'error', message: json.error || 'Failed to close order' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReopen = async () => {
    if (!reopenModalOrder || !reopenReason.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/reopen-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ibpo: reopenModalOrder.ibpo,
          reopened_by: reopenedBy,
          reopen_reason: reopenReason
        })
      });
      const json = await res.json();
      if (json.success) {
        setNotification({ type: 'success', message: json.message });
        setReopenModalOrder(null);
        setReopenReason('');
        fetchOrders();
      } else {
        setNotification({ type: 'error', message: json.error || 'Failed to reopen order' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-full text-[10px] font-black uppercase tracking-wider">
              Quality & Variance Gate
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
            Order Completion Review & Closure
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Explicit confirmation with variance verification. Within ±3% requires user confirmation; deviations &gt; 3% require authorized exception approval.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setViewMode('pending')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              viewMode === 'pending'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Review Candidates ({orders.filter(o => o.completion_pct >= 80).length})
          </button>
          <button
            onClick={() => setViewMode('completed')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              viewMode === 'completed'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Completed Orders History ({completedOrders.length})
          </button>
        </div>
      </div>

      {notification && (
        <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-3 border ${
          notification.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
          <span className="flex-1">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600">×</button>
        </div>
      )}

      {/* View Mode 1: Review Candidates Table */}
      {viewMode === 'pending' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 tracking-wider">
              Orders Ready For Completion Review
            </h3>
            <span className="text-xs text-slate-500">
              Orders approaching or exceeding registered GREY REQ
            </span>
          </div>

          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">IBPO</th>
                  <th className="p-3">SP NO</th>
                  <th className="p-3 text-right">Ordered (MTR)</th>
                  <th className="p-3 text-right">Actual Produced</th>
                  <th className="p-3 text-right">Variance MTR</th>
                  <th className="p-3 text-right">Variance %</th>
                  <th className="p-3">Completion Status</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {orders.map(o => {
                  const isWithin3 = Math.abs(o.variance_pct) <= 3.0;
                  const isReady = o.completion_pct >= 90;

                  return (
                    <tr key={o.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-mono font-black text-indigo-600 dark:text-indigo-400">
                        {o.ibpo}
                      </td>
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                        {o.sp_no}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900 dark:text-white">
                        {Number(o.order_qty).toLocaleString()} M
                      </td>
                      <td className="p-3 text-right font-black text-emerald-600">
                        {Number(o.total_produced).toLocaleString()} M ({o.completion_pct}%)
                      </td>
                      <td className={`p-3 text-right font-mono font-black ${o.variance_mtr >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {o.variance_mtr > 0 ? `+${o.variance_mtr.toLocaleString()}` : o.variance_mtr.toLocaleString()} M
                      </td>
                      <td className="p-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full font-black text-[10px] ${
                          isWithin3 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {o.variance_pct > 0 ? `+${o.variance_pct}%` : `${o.variance_pct}%`}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full font-bold text-[10px]">
                          {o.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => openCloseReviewModal(o.ibpo)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 mx-auto transition-all"
                        >
                          <FileCheck className="w-3.5 h-3.5" />
                          Review & Close Order
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View Mode 2: Completed Orders Archive Table */}
      {viewMode === 'completed' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 tracking-wider">
              Completed Orders History (Preserved Archive)
            </h3>
            <span className="text-xs text-slate-500">
              Archived orders are excluded from active boards but permanently kept for audit
            </span>
          </div>

          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">IBPO</th>
                  <th className="p-3">SP NO</th>
                  <th className="p-3 text-right">Ordered MTR</th>
                  <th className="p-3 text-right">Completed MTR</th>
                  <th className="p-3 text-right">Variance MTR</th>
                  <th className="p-3 text-right">Variance %</th>
                  <th className="p-3">Closed By</th>
                  <th className="p-3">Closed Date</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {completedOrders.map(o => (
                  <tr key={o.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-mono font-black text-indigo-600 dark:text-indigo-400">{o.ibpo}</td>
                    <td className="p-3 font-bold">{o.sp_no}</td>
                    <td className="p-3 text-right font-bold">{Number(o.order_qty).toLocaleString()} M</td>
                    <td className="p-3 text-right font-black text-emerald-600">{Number(o.total_produced).toLocaleString()} M</td>
                    <td className="p-3 text-right font-mono font-bold">{o.variance_mtr} M</td>
                    <td className="p-3 text-right font-bold text-slate-700">{o.variance_pct}%</td>
                    <td className="p-3 text-slate-500">{o.completionReview?.closed_by || 'System'}</td>
                    <td className="p-3 text-slate-500">{o.completionReview?.closed_at ? new Date(o.completionReview.closed_at).toLocaleDateString() : '-'}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setReopenModalOrder(o)}
                        className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-lg text-[11px] font-bold flex items-center gap-1 mx-auto"
                      >
                        <RotateCcw className="w-3 h-3" /> Reopen Order
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation & Authorization Modal */}
      {selectedReviewOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-700 space-y-5">
            <div>
              <div className="flex justify-between items-start">
                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 font-mono font-black rounded-lg text-xs">
                  IBPO: {selectedReviewOrder.ibpo}
                </span>
                <span className="text-xs font-bold text-slate-500">{selectedReviewOrder.sp_no}</span>
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white mt-2">
                Order Completion Review & Confirmation
              </h3>
            </div>

            {/* Figures Grid */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-200/50">
                <span className="text-slate-500">Ordered Quantity:</span>
                <span className="font-bold text-slate-900 dark:text-white">{Number(selectedReviewOrder.order_qty).toLocaleString()} MTR</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/50">
                <span className="text-slate-500">In-House Produced:</span>
                <span className="font-bold text-slate-900 dark:text-white">{Number(selectedReviewOrder.in_house_meter).toLocaleString()} MTR</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/50">
                <span className="text-slate-500">Vendor Produced:</span>
                <span className="font-bold text-slate-900 dark:text-white">{Number(selectedReviewOrder.vendor_meter).toLocaleString()} MTR</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/50">
                <span className="text-slate-500">Total Actual Completed:</span>
                <span className="font-black text-emerald-600 text-sm">{Number(selectedReviewOrder.total_produced_meter).toLocaleString()} MTR</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/50">
                <span className="text-slate-500">Variance Meters:</span>
                <span className={`font-black ${selectedReviewOrder.variance_meter >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {selectedReviewOrder.variance_meter > 0 ? `+${selectedReviewOrder.variance_meter}` : selectedReviewOrder.variance_meter} MTR
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Variance Percentage:</span>
                <span className={`font-black text-sm ${selectedReviewOrder.is_within_3_pct ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {selectedReviewOrder.variance_pct > 0 ? `+${selectedReviewOrder.variance_pct}%` : `${selectedReviewOrder.variance_pct}%`}
                </span>
              </div>
            </div>

            {/* Threshold Checks */}
            {selectedReviewOrder.is_within_3_pct ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                <span>Variance is within allowable ±3% limit ({selectedReviewOrder.variance_pct}%). Confirm closure below.</span>
              </div>
            ) : (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3 text-xs">
                <div className="flex items-center gap-2 text-rose-800 font-black">
                  <ShieldAlert className="w-5 h-5 flex-shrink-0 text-rose-600" />
                  <span>EXCEPTION: Variance {selectedReviewOrder.variance_pct}% exceeds allowable ±3% threshold!</span>
                </div>
                <p className="text-rose-700 text-[11px]">
                  Authorised approval and mandatory explanation are required to close this order.
                </p>

                <label className="flex items-center gap-2 font-black text-rose-900 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={isApprovedCheckbox}
                    onChange={e => setIsApprovedCheckbox(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-rose-500"
                  />
                  I explicitly authorize this variance exception
                </label>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Reason / Explanation for Deviation *</label>
                  <textarea
                    rows={2}
                    required
                    placeholder="Enter management reason (e.g. customer accepted excess / shortage adjusted in warp)..."
                    value={approvalReason}
                    onChange={e => setApprovalReason(e.target.value)}
                    className="w-full p-2.5 bg-white border border-rose-300 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Closing User / Officer</label>
              <input
                type="text"
                value={closedBy}
                onChange={e => setClosedBy(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedReviewOrder(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClose}
                disabled={submitting || (!selectedReviewOrder.is_within_3_pct && (!isApprovedCheckbox || !approvalReason.trim()))}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-900/30 flex items-center gap-2"
              >
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirm & Permanently Close Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reopen Order */}
      {reopenModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 text-xs">
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Reopen Completed Order: {reopenModalOrder.ibpo}
            </h3>
            <p className="text-slate-500">
              Reopening this order will restore it to the active production queue and allow further corrections.
            </p>

            <div>
              <label className="block font-bold text-slate-600 mb-1">Reason for Reopening *</label>
              <textarea
                rows={2}
                required
                placeholder="Reason (e.g. Additional mending / extra meters to weave)..."
                value={reopenReason}
                onChange={e => setReopenReason(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">Authorised By</label>
              <input
                type="text"
                value={reopenedBy}
                onChange={e => setReopenedBy(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReopenModalOrder(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReopen}
                disabled={submitting || !reopenReason.trim()}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl font-black shadow-md flex items-center gap-1.5"
              >
                {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Confirm Reopen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
