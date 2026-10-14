import React, { useState, useEffect, useMemo } from 'react';
import { 
  Factory, RefreshCw, Save, CheckCircle2, 
  AlertCircle, ArrowRight, Clipboard, FileSpreadsheet, TrendingUp,
  CheckCircle, AlertTriangle, ShieldCheck, ChevronRight, X
} from 'lucide-react';
import { API_BASE_URL } from '../../config';

interface ToaProductionUpdateProps {
  initialIbpo?: string;
  onNavigateToCompletion?: (ibpo: string) => void;
}

interface ParsedProductionRow {
  rowNum: number;
  ibpo: string;
  totalMeters: number;
  matchedOrder?: any;
  currentCompleted: number;
  greyReq: number;
  deltaMeters: number;
  completionPct: number;
  statusCategory: 'UNCHANGED' | 'UPDATED' | 'AUTO_COMPLETED' | 'OVERPRODUCED' | 'NOT_FOUND' | 'INVALID';
  statusMessage: string;
}

export default function ToaProductionUpdate({ initialIbpo, onNavigateToCompletion }: ToaProductionUpdateProps) {
  const [activeTab, setActiveTab] = useState<'bulkGrid' | 'singleDrilldown'>('bulkGrid');
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedIbpo, setSelectedIbpo] = useState<string>(initialIbpo || '');
  const [productionData, setProductionData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // 2-Column Excel Paste Grid State
  const [pasteText, setPasteText] = useState('');
  const [lastBulkResult, setLastBulkResult] = useState<any | null>(null);

  // Single Entry Form State
  const [singleForm, setSingleForm] = useState({
    production_date: new Date().toISOString().split('T')[0],
    allocation_type: 'IN_HOUSE',
    loom_no: '',
    produced_meter: '',
    remarks: '',
    entered_by: 'Production Officer'
  });

  // Load orders
  const fetchOrders = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/orders`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setOrders(json.data);
        if (!selectedIbpo && json.data.length > 0) {
          setSelectedIbpo(json.data[0].ibpo);
        }
      }
    } catch (e) {
      console.error('Failed to load TOA orders', e);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Indexed map for fast client-side lookup during Excel paste
  const ordersMap = useMemo(() => {
    const map = new Map<string, any>();
    orders.forEach(o => {
      if (o.ibpo) map.set(String(o.ibpo).trim().toLowerCase(), o);
    });
    return map;
  }, [orders]);

  // Client-side parser for 2-column paste grid: [IBPO | Total Mtrs]
  const parsedPreviewRows = useMemo((): ParsedProductionRow[] => {
    if (!pasteText.trim()) return [];
    const lines = pasteText.trim().split(/\r?\n/);
    const result: ParsedProductionRow[] = [];

    lines.forEach((rawLine, idx) => {
      const line = rawLine.trim();
      if (!line) return;
      if (line.toLowerCase().includes('ibpo') && (line.toLowerCase().includes('mtr') || line.toLowerCase().includes('total'))) {
        return; // skip header row
      }

      // Split by tab, comma, semicolon, or multi-space
      let parts = line.split(/[\t,;]+|\s{2,}/);
      if (parts.length < 2) {
        parts = line.split(/\s+/);
      }

      const rowNum = idx + 1;
      const ibpo = parts[0]?.trim() || '';
      const totalMeters = parseFloat(parts[1]?.trim() || '');

      if (!ibpo || isNaN(totalMeters) || totalMeters < 0) {
        result.push({
          rowNum,
          ibpo: ibpo || '—',
          totalMeters: isNaN(totalMeters) ? 0 : totalMeters,
          currentCompleted: 0,
          greyReq: 0,
          deltaMeters: 0,
          completionPct: 0,
          statusCategory: 'INVALID',
          statusMessage: 'Invalid format (needs IBPO and numeric Total Mtrs)'
        });
        return;
      }

      const matched = ordersMap.get(ibpo.toLowerCase());
      if (!matched) {
        result.push({
          rowNum,
          ibpo,
          totalMeters,
          currentCompleted: 0,
          greyReq: 0,
          deltaMeters: 0,
          completionPct: 0,
          statusCategory: 'NOT_FOUND',
          statusMessage: 'IBPO not found in database'
        });
        return;
      }

      const currentCompleted = Number(matched.grey_completed || 0);
      const greyReq = Number(matched.grey_req || matched.order_qty || 1);
      const deltaMeters = totalMeters - currentCompleted;
      const completionPct = (totalMeters / greyReq) * 100;

      let statusCategory: ParsedProductionRow['statusCategory'] = 'UPDATED';
      let statusMessage = `Update to ${totalMeters.toLocaleString()} MTR`;

      if (Math.abs(totalMeters - currentCompleted) < 0.001) {
        statusCategory = 'UNCHANGED';
        statusMessage = 'Identical to current cumulative MTR (will be skipped)';
      } else if (completionPct >= 98.0 && completionPct <= 102.0) {
        statusCategory = 'AUTO_COMPLETED';
        statusMessage = `2% Auto-Complete (${completionPct.toFixed(1)}% satisfies tolerance)`;
      } else if (completionPct > 102.0) {
        statusCategory = 'OVERPRODUCED';
        statusMessage = `Overproduced alert (${completionPct.toFixed(1)}% > 102%)`;
      }

      result.push({
        rowNum,
        ibpo,
        totalMeters,
        matchedOrder: matched,
        currentCompleted,
        greyReq,
        deltaMeters,
        completionPct,
        statusCategory,
        statusMessage
      });
    });

    return result;
  }, [pasteText, ordersMap]);

  // Statistics on parsed rows
  const previewStats = useMemo(() => {
    let unchanged = 0;
    let updated = 0;
    let autoCompleted = 0;
    let overproduced = 0;
    let notFound = 0;
    let invalid = 0;

    parsedPreviewRows.forEach(r => {
      if (r.statusCategory === 'UNCHANGED') unchanged++;
      else if (r.statusCategory === 'AUTO_COMPLETED') { autoCompleted++; updated++; }
      else if (r.statusCategory === 'OVERPRODUCED') { overproduced++; updated++; }
      else if (r.statusCategory === 'UPDATED') updated++;
      else if (r.statusCategory === 'NOT_FOUND') notFound++;
      else if (r.statusCategory === 'INVALID') invalid++;
    });

    return { total: parsedPreviewRows.length, unchanged, updated, autoCompleted, overproduced, notFound, invalid };
  }, [parsedPreviewRows]);

  // Submit bulk 2-column paste grid
  const handleApplyBulkUpdates = async () => {
    if (parsedPreviewRows.length === 0) {
      setNotification({ type: 'error', message: 'No valid rows to apply. Paste 2 columns: [IBPO | Total Mtrs]' });
      return;
    }

    setSubmitting(true);
    setNotification(null);
    setLastBulkResult(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/production/bulk-paste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: pasteText,
          entered_by: 'Production Officer'
        })
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setLastBulkResult(json.data);
        const { updatedCount, unchangedCount, autoCompletedCount, overproducedCount } = json.data;
        setNotification({
          type: 'success',
          message: `Cumulative Update Applied: ${updatedCount} updated, ${unchangedCount} unchanged skipped, ${autoCompletedCount} auto-completed (>=98%), ${overproducedCount} overproduced.`
        });
        await fetchOrders();
        if (selectedIbpo) fetchProduction();
      } else {
        setNotification({ type: 'error', message: json.error || 'Failed to apply bulk production updates.' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Connection error while saving bulk production.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Load sample data into paste grid
  const handleLoadSamplePaste = () => {
    if (orders.length >= 3) {
      const sample = orders.slice(0, 5).map(o => {
        const req = Number(o.grey_req || o.order_qty || 1000);
        // sample with 99% (autocomplete), 50% (update), current (unchanged)
        const sampleMtrs = Math.round(req * 0.99);
        return `${o.ibpo}\t${sampleMtrs}`;
      }).join('\n');
      setPasteText(sample);
    } else {
      setPasteText("26001\t1250.5\n26002\t3400.0\n26003\t890.0");
    }
  };

  // Fetch production for selected IBPO (drilldown tab)
  const fetchProduction = async () => {
    if (!selectedIbpo) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/production/${selectedIbpo}`);
      const json = await res.json();
      if (json.success) {
        setProductionData(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'singleDrilldown') {
      fetchProduction();
    }
  }, [selectedIbpo, activeTab]);

  // Handle single manual production log submit
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIbpo || !singleForm.produced_meter) return;

    setSubmitting(true);
    setNotification(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/production`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ibpo: selectedIbpo,
          ...singleForm
        })
      });
      const json = await res.json();
      if (json.success) {
        setNotification({ type: 'success', message: `Recorded ${singleForm.produced_meter} MTR production successfully!` });
        setSingleForm(prev => ({ ...prev, produced_meter: '', remarks: '' }));
        await fetchOrders();
        fetchProduction();
      } else {
        setNotification({ type: 'error', message: json.error || 'Failed to record production' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const currentOrder = productionData?.order;
  const totalProduced = productionData?.totalProduced || 0;
  const orderQty = Number(currentOrder?.grey_req || currentOrder?.order_qty) || 0;
  const balanceToWeave = Math.max(0, orderQty - totalProduced);
  const completionPct = orderQty > 0 ? ((totalProduced / orderQty) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      {/* Top Header & Tab Navigation */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-full text-[10px] font-black uppercase tracking-wider">
              Production Entry &bull; KPX 2026 Engine
            </span>
            <span className="px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-full text-[10px] font-bold">
              2% Tolerance Auto-Complete
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
            Cumulative Production Entry &amp; Status Register
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            2-column paste grid for rapid daily bulk updates. Automatically applies 2% completion tolerance (&ge;98%) and overproduction alerts (&gt;102%).
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('bulkGrid')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'bulkGrid'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Clipboard className="w-3.5 h-3.5" />
            2-Column Excel Paste Grid
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('singleDrilldown')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'singleDrilldown'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Factory className="w-3.5 h-3.5" />
            Single IBPO Drilldown
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-3 border transition-all ${
          notification.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' :
          notification.type === 'warning' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800' :
          'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span className="flex-1">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="p-1 hover:opacity-70 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 1: EXACT 2-COLUMN EXCEL PASTE GRID [IBPO | Total Mtrs] */}
      {/* ============================================================== */}
      {activeTab === 'bulkGrid' && (
        <div className="space-y-6">
          {/* Paste Grid Input Card */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Clipboard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Excel 2-Column Paste Area: [IBPO &bull; Total Mtrs]
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Copy 2 columns directly from your production spreadsheet. Cumulative values are compared against current database records.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadSamplePaste}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Load Sample Paste
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

            {/* Paste Textarea */}
            <textarea
              rows={4}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder="Paste 2 columns from Excel:
26001	1250.5
26002	3400.0
26003	890.0"
              className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-mono text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
            />

            {/* Statistics Banner if rows parsed */}
            {parsedPreviewRows.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 pt-2">
                <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Rows</span>
                  <span className="text-base font-black text-slate-800 dark:text-white font-mono">{previewStats.total}</span>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-800 text-center">
                  <span className="text-[10px] text-blue-600 font-bold block uppercase">To Update</span>
                  <span className="text-base font-black text-blue-700 dark:text-blue-300 font-mono">{previewStats.updated}</span>
                </div>
                <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-600 text-center">
                  <span className="text-[10px] text-slate-500 font-bold block uppercase">Unchanged (Skip)</span>
                  <span className="text-base font-black text-slate-600 dark:text-slate-300 font-mono">{previewStats.unchanged}</span>
                </div>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800 text-center">
                  <span className="text-[10px] text-emerald-600 font-bold block uppercase">&ge;98% Auto-Close</span>
                  <span className="text-base font-black text-emerald-700 dark:text-emerald-300 font-mono">{previewStats.autoCompleted}</span>
                </div>
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800 text-center">
                  <span className="text-[10px] text-amber-600 font-bold block uppercase">&gt;102% Overprod</span>
                  <span className="text-base font-black text-amber-700 dark:text-amber-300 font-mono">{previewStats.overproduced}</span>
                </div>
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-800 text-center">
                  <span className="text-[10px] text-rose-600 font-bold block uppercase">Not Found</span>
                  <span className="text-base font-black text-rose-700 dark:text-rose-300 font-mono">{previewStats.notFound}</span>
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={submitting || parsedPreviewRows.length === 0}
                onClick={handleApplyBulkUpdates}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-900/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Applying Updates...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Apply Cumulative Updates ({previewStats.updated} to update, {previewStats.unchanged} skip)
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Parsed Live Preview Table */}
          {parsedPreviewRows.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 tracking-wider">
                  Live Preview Verification Table ({parsedPreviewRows.length} Rows)
                </h4>
                <span className="text-xs text-slate-400">
                  Rows marked <strong className="text-slate-600 dark:text-slate-200">UNCHANGED</strong> will be skipped automatically to save bandwidth &amp; DB writes.
                </span>
              </div>

              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700 z-10">
                    <tr>
                      <th className="p-3 text-center">Row</th>
                      <th className="p-3">IBPO</th>
                      <th className="p-3">Design / SP No</th>
                      <th className="p-3 text-right">Target Req (MTR)</th>
                      <th className="p-3 text-right">Current MTR</th>
                      <th className="p-3 text-right text-indigo-600 dark:text-indigo-400">Pasted Total MTR</th>
                      <th className="p-3 text-right">Delta</th>
                      <th className="p-3 text-right">Completion %</th>
                      <th className="p-3 text-center">Operation Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-medium">
                    {parsedPreviewRows.map((r) => {
                      const isUnchanged = r.statusCategory === 'UNCHANGED';
                      const isAutoCompleted = r.statusCategory === 'AUTO_COMPLETED';
                      const isOver = r.statusCategory === 'OVERPRODUCED';
                      const isNotFound = r.statusCategory === 'NOT_FOUND' || r.statusCategory === 'INVALID';

                      return (
                        <tr
                          key={r.rowNum}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-750 transition-colors ${
                            isUnchanged ? 'opacity-70 bg-slate-50/40' : ''
                          }`}
                        >
                          <td className="p-3 text-center font-mono text-slate-400">{r.rowNum}</td>
                          <td className="p-3 font-mono font-black text-slate-900 dark:text-white">{r.ibpo}</td>
                          <td className="p-3 text-slate-700 dark:text-slate-300">{r.matchedOrder?.sp_no || '—'}</td>
                          <td className="p-3 text-right font-mono">{r.greyReq ? r.greyReq.toLocaleString() : '—'}</td>
                          <td className="p-3 text-right font-mono text-slate-500">{r.currentCompleted.toLocaleString()}</td>
                          <td className="p-3 text-right font-mono font-black text-indigo-600 dark:text-indigo-400">
                            {r.totalMeters.toLocaleString()}
                          </td>
                          <td className={`p-3 text-right font-mono font-bold ${
                            r.deltaMeters > 0 ? 'text-emerald-600' : r.deltaMeters < 0 ? 'text-rose-600' : 'text-slate-400'
                          }`}>
                            {r.deltaMeters > 0 ? `+${r.deltaMeters.toLocaleString()}` : r.deltaMeters.toLocaleString()}
                          </td>
                          <td className="p-3 text-right font-mono font-black">
                            {r.completionPct ? `${r.completionPct.toFixed(1)}%` : '—'}
                          </td>
                          <td className="p-3 text-center">
                            {isUnchanged && (
                              <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-[11px] font-bold inline-flex items-center gap-1">
                                <CheckCircle className="w-3 h-3 text-slate-400" /> UNCHANGED (Skip)
                              </span>
                            )}
                            {isAutoCompleted && (
                              <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-lg text-[11px] font-black inline-flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-emerald-600" /> 2% AUTO-COMPLETED
                              </span>
                            )}
                            {isOver && (
                              <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded-lg text-[11px] font-black inline-flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-amber-600" /> OVERPRODUCED (&gt;102%)
                              </span>
                            )}
                            {!isUnchanged && !isAutoCompleted && !isOver && !isNotFound && (
                              <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800 rounded-lg text-[11px] font-black">
                                UPDATE CUMULATIVE
                              </span>
                            )}
                            {isNotFound && (
                              <span className="px-2.5 py-1 bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 rounded-lg text-[11px] font-bold">
                                {r.statusMessage}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: SINGLE IBPO DRILLDOWN & LOOM PRODUCTION LOGS */}
      {/* ============================================================== */}
      {activeTab === 'singleDrilldown' && (
        <div className="space-y-6">
          {/* Order Selector Card */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Select Active Order</span>
              <select
                value={selectedIbpo}
                onChange={e => setSelectedIbpo(e.target.value)}
                className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-indigo-600 focus:outline-none focus:border-indigo-500 min-w-[280px]"
              >
                {orders.map(o => (
                  <option key={o.id} value={o.ibpo}>
                    {o.ibpo} &bull; {o.sp_no} &bull; {Number(o.grey_req || o.order_qty).toLocaleString()} M ({o.status})
                  </option>
                ))}
              </select>
            </div>

            {currentOrder && onNavigateToCompletion && (
              <button
                type="button"
                onClick={() => onNavigateToCompletion(currentOrder.ibpo)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                View in Completion Review <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Order Metric Cards */}
          {currentOrder && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Grey Required</span>
                <span className="text-lg font-black text-slate-800 dark:text-white font-mono">{orderQty.toLocaleString()} MTR</span>
              </div>
              <div className="p-4 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <span className="text-[10px] text-emerald-600 font-bold block uppercase">Grey Completed</span>
                <span className="text-lg font-black text-emerald-600 font-mono">{totalProduced.toLocaleString()} MTR</span>
              </div>
              <div className="p-4 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <span className="text-[10px] text-amber-600 font-bold block uppercase">Balance To Weave</span>
                <span className="text-lg font-black text-amber-600 font-mono">{balanceToWeave.toLocaleString()} MTR</span>
              </div>
              <div className="p-4 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <span className="text-[10px] text-indigo-600 font-bold block uppercase">Completion %</span>
                <span className="text-lg font-black text-indigo-600 font-mono">{completionPct}%</span>
              </div>
            </div>
          )}

          {/* Add Single Production Log Form */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 tracking-wider">
              Add Individual Loom Production Log
            </h4>
            <form onSubmit={handleSingleSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Production Date</label>
                <input
                  type="date"
                  value={singleForm.production_date}
                  onChange={e => setSingleForm({ ...singleForm, production_date: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Stream</label>
                <select
                  value={singleForm.allocation_type}
                  onChange={e => setSingleForm({ ...singleForm, allocation_type: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                >
                  <option value="IN_HOUSE">In-House Loom</option>
                  <option value="VENDOR">Vendor Loom</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Loom #</label>
                <input
                  type="text"
                  placeholder="e.g. 14 or V-01"
                  value={singleForm.loom_no}
                  onChange={e => setSingleForm({ ...singleForm, loom_no: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Produced Meters *</label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="e.g. 240"
                  value={singleForm.produced_meter}
                  onChange={e => setSingleForm({ ...singleForm, produced_meter: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-black text-emerald-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Remarks</label>
                <input
                  type="text"
                  placeholder="Shift / Batch..."
                  value={singleForm.remarks}
                  onChange={e => setSingleForm({ ...singleForm, remarks: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Log
                </button>
              </div>
            </form>
          </div>

          {/* Production History Table */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 tracking-wider">
                Production History Logs ({productionData?.logs?.length || 0} Entries)
              </h4>
              <span className="text-xs font-black text-emerald-600">
                Sum Total: {totalProduced.toLocaleString()} MTR
              </span>
            </div>

            {(!productionData?.logs || productionData.logs.length === 0) ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No production logs recorded yet for IBPO {selectedIbpo}.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Stream</th>
                      <th className="p-3">Loom #</th>
                      <th className="p-3 text-right">Produced Meters</th>
                      <th className="p-3">Entered By</th>
                      <th className="p-3">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {productionData.logs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-750 transition-colors">
                        <td className="p-3 font-mono">{log.production_date ? new Date(log.production_date).toISOString().split('T')[0] : '—'}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            log.allocation_type === 'IN_HOUSE' ? 'bg-indigo-50 text-indigo-700' : 'bg-purple-50 text-purple-700'
                          }`}>
                            {log.allocation_type}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold">{log.loom_no ? `L-${log.loom_no}` : '—'}</td>
                        <td className="p-3 text-right font-black text-emerald-600 font-mono">
                          +{Number(log.produced_meter).toLocaleString()} MTR
                        </td>
                        <td className="p-3 text-slate-500">{log.entered_by || 'System'}</td>
                        <td className="p-3 text-slate-500">{log.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
