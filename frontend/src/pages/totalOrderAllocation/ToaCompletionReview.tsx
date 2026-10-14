import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircle2, XCircle, AlertTriangle, ShieldAlert, RefreshCw, 
  RotateCcw, Check, ArrowRight, Eye, ShieldCheck, FileCheck, Layers,
  Clipboard, X, AlertCircle, ChevronRight
} from 'lucide-react';
import { API_BASE_URL } from '../../config';

interface ToaCompletionReviewProps {
  initialIbpo?: string;
  onOrderClosed?: (ibpo: string) => void;
}

interface ParsedIbpoRow {
  rowNum: number;
  ibpo: string;
  matchedOrder?: any;
  greyReq: number;
  greyCompleted: number;
  completionPct: number;
  remainingMtr: number;
  isEligible: boolean;
  isAlreadyCompleted: boolean;
  isNotFound: boolean;
  statusMessage: string;
}

export default function ToaCompletionReview({ initialIbpo, onOrderClosed }: ToaCompletionReviewProps) {
  const [viewMode, setViewMode] = useState<'bulkComplete' | 'pending' | 'completed'>('bulkComplete');
  const [orders, setOrders] = useState<any[]>([]);
  const [completedOrders, setCompletedOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // 1-Column Excel Paste Grid State
  const [pasteText, setPasteText] = useState('');
  const [lastBulkResult, setLastBulkResult] = useState<any | null>(null);

  // Modal / Single Review action state
  const [selectedReviewOrder, setSelectedReviewOrder] = useState<any | null>(null);
  const [approvalReason, setApprovalReason] = useState('');
  const [isApprovedCheckbox, setIsApprovedCheckbox] = useState(false);
  const [closedBy, setClosedBy] = useState('Planning Head');

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

  // Indexed map for fast client-side lookup during 1-column paste
  const allOrdersMap = useMemo(() => {
    const map = new Map<string, any>();
    [...orders, ...completedOrders].forEach(o => {
      if (o.ibpo) map.set(String(o.ibpo).trim().toLowerCase(), o);
    });
    return map;
  }, [orders, completedOrders]);

  // Client-side parser for 1-column paste grid: [IBPO]
  const parsedPreviewRows = useMemo((): ParsedIbpoRow[] => {
    if (!pasteText.trim()) return [];
    const lines = pasteText.trim().split(/\r?\n/);
    const result: ParsedIbpoRow[] = [];

    lines.forEach((rawLine, idx) => {
      const trimmed = rawLine.trim();
      if (!trimmed) return;
      if (trimmed.toLowerCase() === 'ibpo' || trimmed.toLowerCase() === 'ibpo no') return;

      // Extract first column if multiple columns pasted
      const ibpo = trimmed.split(/[\t,;\s]+/)[0]?.trim() || '';
      if (!ibpo) return;

      const rowNum = idx + 1;
      const matched = allOrdersMap.get(ibpo.toLowerCase());

      if (!matched) {
        result.push({
          rowNum,
          ibpo,
          greyReq: 0,
          greyCompleted: 0,
          completionPct: 0,
          remainingMtr: 0,
          isEligible: false,
          isAlreadyCompleted: false,
          isNotFound: true,
          statusMessage: 'IBPO not found in database'
        });
        return;
      }

      const greyReq = Number(matched.grey_req || matched.order_qty || 1);
      const greyCompleted = Number(matched.grey_completed || 0);
      const completionPct = (greyCompleted / greyReq) * 100;
      const remainingMtr = Math.max(0, greyReq - greyCompleted);
      const isAlreadyCompleted = matched.status === 'COMPLETED';
      const isEligible = !isAlreadyCompleted && completionPct >= 98.0;

      let statusMessage = '';
      if (isAlreadyCompleted) {
        statusMessage = 'Already COMPLETED & closed';
      } else if (isEligible) {
        statusMessage = `Eligible for completion (${completionPct.toFixed(1)}% satisfies >=98% tolerance)`;
      } else {
        const remPct = (100 - completionPct).toFixed(1);
        statusMessage = `Rejected: produced ${completionPct.toFixed(1)}%. Balance remaining: ${remainingMtr.toLocaleString()} MTR (${remPct}% remaining). Required >=98%.`;
      }

      result.push({
        rowNum,
        ibpo,
        matchedOrder: matched,
        greyReq,
        greyCompleted,
        completionPct,
        remainingMtr,
        isEligible,
        isAlreadyCompleted,
        isNotFound: false,
        statusMessage
      });
    });

    return result;
  }, [pasteText, allOrdersMap]);

  // Statistics on parsed IBPO rows
  const previewStats = useMemo(() => {
    let eligible = 0;
    let alreadyCompleted = 0;
    let rejected = 0;
    let notFound = 0;

    parsedPreviewRows.forEach(r => {
      if (r.isEligible) eligible++;
      else if (r.isAlreadyCompleted) alreadyCompleted++;
      else if (r.isNotFound) notFound++;
      else rejected++;
    });

    return { total: parsedPreviewRows.length, eligible, alreadyCompleted, rejected, notFound };
  }, [parsedPreviewRows]);

  // Handle bulk complete from 1-column grid
  const handleApplyBulkComplete = async () => {
    if (parsedPreviewRows.length === 0) {
      setNotification({ type: 'error', message: 'No IBPO list provided. Paste 1 column: [IBPO]' });
      return;
    }

    setSubmitting(true);
    setNotification(null);
    setLastBulkResult(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/completion/bulk-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: pasteText,
          user: 'Planning Head'
        })
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setLastBulkResult(json.data);
        const { completedCount, alreadyCompletedCount, rejectedCount } = json.data;
        setNotification({
          type: 'success',
          message: `Bulk Completion Finished: ${completedCount} orders completed (>=98%), ${alreadyCompletedCount} already completed, ${rejectedCount} rejected (remaining balance explained below).`
        });
        await fetchOrders();
      } else {
        setNotification({ type: 'error', message: json.error || 'Failed to complete orders.' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Connection error during bulk completion.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadSampleIbpos = () => {
    if (orders.length >= 3) {
      const sample = orders.slice(0, 5).map(o => o.ibpo).join('\n');
      setPasteText(sample);
    } else {
      setPasteText("26001\n26002\n26003");
    }
  };

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
    if (!reopenModalOrder || !reopenReason.trim()) {
      setNotification({ type: 'error', message: 'Reopen reason is mandatory' });
      return;
    }

    setSubmitting(true);
    setNotification(null);

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
      <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-full text-[10px] font-black uppercase tracking-wider">
              Completion Gate &bull; 2% Tolerance
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
            Order Completion Review &amp; Closure System
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Bulk-marks orders completed if &ge;98% completion tolerance is reached; otherwise rejects and displays exact remaining balance.
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setViewMode('bulkComplete')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'bulkComplete'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Clipboard className="w-3.5 h-3.5" />
            1-Column Paste Grid
          </button>
          <button
            type="button"
            onClick={() => setViewMode('pending')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              viewMode === 'pending'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Review Candidates ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('completed')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              viewMode === 'completed'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            History ({completedOrders.length})
          </button>
        </div>
      </div>

      {notification && (
        <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-3 border transition-all ${
          notification.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' :
          notification.type === 'warning' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800' :
          'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span className="flex-1">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="p-1 hover:opacity-70 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* VIEW 1: 1-COLUMN EXCEL PASTE GRID [IBPO] */}
      {/* ============================================================== */}
      {viewMode === 'bulkComplete' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Clipboard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Excel 1-Column Paste Area: [IBPO]
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Paste a list of IBPO numbers. Orders with &ge;98% completion will be marked COMPLETED; incomplete orders will show remaining balance.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadSampleIbpos}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Load Sample IBPOs
                </button>
                {pasteText && (
                  <button
                    type="button"
                    onClick={() => { setPasteText(''); setLastBulkResult(null); }}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <textarea
              rows={4}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder="Paste 1 column from Excel:
26001
26002
26003"
              className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-mono text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
            />

            {/* Statistics Banner */}
            {parsedPreviewRows.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Total IBPOs</span>
                  <span className="text-base font-black text-slate-800 dark:text-white font-mono">{previewStats.total}</span>
                </div>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800 text-center">
                  <span className="text-[10px] text-emerald-600 font-bold block uppercase">&ge;98% Eligible to Complete</span>
                  <span className="text-base font-black text-emerald-700 dark:text-emerald-300 font-mono">{previewStats.eligible}</span>
                </div>
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800 text-center">
                  <span className="text-[10px] text-amber-600 font-bold block uppercase">&lt;98% Incomplete (Will Reject)</span>
                  <span className="text-base font-black text-amber-700 dark:text-amber-300 font-mono">{previewStats.rejected}</span>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-800 text-center">
                  <span className="text-[10px] text-blue-600 font-bold block uppercase">Already Completed</span>
                  <span className="text-base font-black text-blue-700 dark:text-blue-300 font-mono">{previewStats.alreadyCompleted}</span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={submitting || previewStats.eligible === 0}
                onClick={handleApplyBulkComplete}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Completing Orders...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Bulk Complete Eligible Orders ({previewStats.eligible} Eligible)
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Parsed IBPO Preview List */}
          {parsedPreviewRows.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 tracking-wider">
                  Bulk Completion Verification Grid ({parsedPreviewRows.length} Items)
                </h4>
              </div>

              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700 z-10">
                    <tr>
                      <th className="p-3 text-center">Row</th>
                      <th className="p-3">IBPO</th>
                      <th className="p-3">SP NO</th>
                      <th className="p-3 text-right">Required (MTR)</th>
                      <th className="p-3 text-right">Produced (MTR)</th>
                      <th className="p-3 text-right">Balance (MTR)</th>
                      <th className="p-3 text-right">Completion %</th>
                      <th className="p-3 text-center">Status / Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-medium">
                    {parsedPreviewRows.map((r) => (
                      <tr key={r.rowNum} className="hover:bg-slate-50/80 dark:hover:bg-slate-750 transition-colors">
                        <td className="p-3 text-center font-mono text-slate-400">{r.rowNum}</td>
                        <td className="p-3 font-mono font-black text-slate-900 dark:text-white">{r.ibpo}</td>
                        <td className="p-3 text-slate-700 dark:text-slate-300">{r.matchedOrder?.sp_no || '—'}</td>
                        <td className="p-3 text-right font-mono">{r.greyReq ? r.greyReq.toLocaleString() : '—'}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                          {r.greyCompleted ? r.greyCompleted.toLocaleString() : '0'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-amber-600">
                          {r.remainingMtr ? r.remainingMtr.toLocaleString() : '0'}
                        </td>
                        <td className="p-3 text-right font-mono font-black">
                          {r.completionPct ? `${r.completionPct.toFixed(1)}%` : '0%'}
                        </td>
                        <td className="p-3 text-center">
                          {r.isEligible && (
                            <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-lg text-[11px] font-black inline-flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" /> ELIGIBLE (&ge;98%)
                            </span>
                          )}
                          {r.isAlreadyCompleted && (
                            <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800 rounded-lg text-[11px] font-bold">
                              ALREADY CLOSED
                            </span>
                          )}
                          {!r.isEligible && !r.isAlreadyCompleted && !r.isNotFound && (
                            <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded-lg text-[11px] font-bold" title={r.statusMessage}>
                              REJECTED (&lt;98%) &bull; {r.remainingMtr.toLocaleString()} MTR REMAINING
                            </span>
                          )}
                          {r.isNotFound && (
                            <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-lg text-[11px] font-bold">
                              NOT FOUND
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* VIEW 2: REVIEW CANDIDATES TABLE */}
      {/* ============================================================== */}
      {viewMode === 'pending' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 tracking-wider">
              Active Orders Awaiting Completion Review ({orders.length})
            </h3>
          </div>

          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">IBPO</th>
                  <th className="p-3">SP NO</th>
                  <th className="p-3 text-right">Required (MTR)</th>
                  <th className="p-3 text-right">Actual Produced</th>
                  <th className="p-3 text-right">Balance MTR</th>
                  <th className="p-3 text-right">Completion %</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {orders.map(o => {
                  const req = Number(o.grey_req || o.order_qty || 1);
                  const produced = Number(o.grey_completed || 0);
                  const balance = Math.max(0, req - produced);
                  const pct = (produced / req) * 100;
                  const isEligible = pct >= 98.0;

                  return (
                    <tr key={o.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-mono font-black text-indigo-600 dark:text-indigo-400">
                        {o.ibpo}
                      </td>
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                        {o.sp_no}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900 dark:text-white">
                        {req.toLocaleString()} M
                      </td>
                      <td className="p-3 text-right font-black text-emerald-600">
                        {produced.toLocaleString()} M
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-amber-600">
                        {balance.toLocaleString()} M
                      </td>
                      <td className="p-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full font-black text-[10px] ${
                          isEligible ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full font-bold text-[10px]">
                          {o.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => openCloseReviewModal(o.ibpo)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                            isEligible
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          Review &amp; Close
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

      {/* ============================================================== */}
      {/* VIEW 3: COMPLETED ORDERS HISTORY TABLE */}
      {/* ============================================================== */}
      {viewMode === 'completed' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 tracking-wider">
              Completed &amp; Closed Orders Registry ({completedOrders.length})
            </h3>
          </div>

          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">IBPO</th>
                  <th className="p-3">SP NO</th>
                  <th className="p-3 text-right">Required (MTR)</th>
                  <th className="p-3 text-right">Final Produced</th>
                  <th className="p-3">Tolerance Status</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {completedOrders.map(o => (
                  <tr key={o.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-mono font-black text-indigo-600 dark:text-indigo-400">
                      {o.ibpo}
                    </td>
                    <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                      {o.sp_no}
                    </td>
                    <td className="p-3 text-right font-bold font-mono">
                      {Number(o.grey_req || o.order_qty).toLocaleString()} M
                    </td>
                    <td className="p-3 text-right font-black text-emerald-600 font-mono">
                      {Number(o.grey_completed).toLocaleString()} M
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px]">
                        {o.tolerance_status || 'COMPLETED'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => setReopenModalOrder(o)}
                        className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        Reopen Order
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Single Review Modal */}
      {selectedReviewOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold">Confirm Order Completion</h3>
                <p className="text-xs text-indigo-100 font-mono">IBPO: {selectedReviewOrder.ibpo}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReviewOrder(null)}
                className="p-1 hover:bg-white/10 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                <div>
                  <span className="text-slate-400 block font-bold">Ordered Qty:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">{selectedReviewOrder.ordered_meters?.toLocaleString()} MTR</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold">Total Produced:</span>
                  <span className="font-mono font-black text-emerald-600">{selectedReviewOrder.total_produced?.toLocaleString()} MTR</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Approval Reason / Notes</label>
                <input
                  type="text"
                  value={approvalReason}
                  onChange={e => setApprovalReason(e.target.value)}
                  placeholder="e.g. Completed within 2% tolerance threshold"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="approveCb"
                  checked={isApprovedCheckbox}
                  onChange={e => setIsApprovedCheckbox(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <label htmlFor="approveCb" className="font-bold text-slate-700 dark:text-slate-300">
                  Authorize closure of order
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedReviewOrder(null)}
                  className="px-4 py-2 border rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleConfirmClose}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black cursor-pointer shadow-sm"
                >
                  {submitting ? 'Closing...' : 'Confirm Closure'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reopen Order Modal */}
      {reopenModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="bg-amber-600 px-6 py-4 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold">Reopen Order</h3>
                <p className="text-xs text-amber-100 font-mono">IBPO: {reopenModalOrder.ibpo}</p>
              </div>
              <button
                type="button"
                onClick={() => setReopenModalOrder(null)}
                className="p-1 hover:bg-white/10 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Reason for Reopening *</label>
                <textarea
                  rows={3}
                  value={reopenReason}
                  onChange={e => setReopenReason(e.target.value)}
                  placeholder="e.g. Additional weaving requirement / customer revised quantity"
                  required
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReopenModalOrder(null)}
                  className="px-4 py-2 border rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting || !reopenReason.trim()}
                  onClick={handleConfirmReopen}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-black cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Reopening...' : 'Reopen Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
