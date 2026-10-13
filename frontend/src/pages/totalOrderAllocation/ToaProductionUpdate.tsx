import React, { useState, useEffect } from 'react';
import { 
  Factory, Plus, RefreshCw, Save, Trash2, CheckCircle2, 
  AlertCircle, Calendar, ArrowRight, Clipboard, FileSpreadsheet, TrendingUp
} from 'lucide-react';
import { API_BASE_URL } from '../../config';

interface ToaProductionUpdateProps {
  initialIbpo?: string;
  onNavigateToCompletion?: (ibpo: string) => void;
}

export default function ToaProductionUpdate({ initialIbpo, onNavigateToCompletion }: ToaProductionUpdateProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedIbpo, setSelectedIbpo] = useState<string>(initialIbpo || '');
  const [productionData, setProductionData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Single Entry Form
  const [singleForm, setSingleForm] = useState({
    production_date: new Date().toISOString().split('T')[0],
    allocation_type: 'IN_HOUSE',
    loom_no: '',
    produced_meter: '',
    remarks: '',
    entered_by: 'Production Officer'
  });

  // Bulk Paste / Multi-Row Grid
  const [bulkMode, setBulkMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [bulkRows, setBulkRows] = useState<any[]>([
    { loom_no: '', produced_meter: '', production_date: new Date().toISOString().split('T')[0], allocation_type: 'IN_HOUSE', remarks: '' }
  ]);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load orders
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/total-order-allocation/orders`)
      .then(res => res.json())
      .then(json => {
        if (json.success && Array.isArray(json.data)) {
          setOrders(json.data);
          if (!selectedIbpo && json.data.length > 0) {
            setSelectedIbpo(json.data[0].ibpo);
          }
        }
      });
  }, []);

  // Fetch production for selected IBPO
  const fetchProduction = async () => {
    if (!selectedIbpo) return;
    setLoading(true);
    setNotification(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/production/${selectedIbpo}`);
      const json = await res.json();
      if (json.success) {
        setProductionData(json.data);
      } else {
        setNotification({ type: 'error', message: json.error || 'Failed to load production data' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProduction();
  }, [selectedIbpo]);

  // Handle single production log submit
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

  // Parse bulk paste from Excel
  const handleParseClipboard = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.trim().split(/\r?\n/);
    const parsed: any[] = [];

    lines.forEach(l => {
      const parts = l.split('\t');
      if (parts.length >= 2) {
        const loom_no = parts[0]?.trim();
        const produced_meter = parseFloat(parts[1]?.replace(/,/g, '')) || 0;
        const date = parts[2]?.trim() || new Date().toISOString().split('T')[0];
        const type = parts[3]?.trim() || 'IN_HOUSE';

        if (produced_meter > 0) {
          parsed.push({
            loom_no,
            produced_meter,
            production_date: date,
            allocation_type: type,
            remarks: ''
          });
        }
      }
    });

    if (parsed.length > 0) {
      setBulkRows(parsed);
      setPasteText('');
      setNotification({ type: 'success', message: `Parsed ${parsed.length} production rows. Review and click Save.` });
    } else {
      setNotification({ type: 'error', message: 'Could not parse rows. Copy columns: [Loom #, Produced Meters, Date, Type]' });
    }
  };

  // Save bulk production rows
  const handleSaveBulk = async () => {
    const validRows = bulkRows
      .filter(r => Number(r.produced_meter) > 0)
      .map(r => ({ ...r, ibpo: selectedIbpo }));

    if (validRows.length === 0) {
      setNotification({ type: 'error', message: 'No valid rows with meters > 0 to save.' });
      return;
    }

    setSubmitting(true);
    setNotification(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/production/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows })
      });
      const json = await res.json();
      if (json.success) {
        setNotification({ type: 'success', message: `Saved ${json.data.successCount} production logs successfully!` });
        setBulkRows([{ loom_no: '', produced_meter: '', production_date: new Date().toISOString().split('T')[0], allocation_type: 'IN_HOUSE', remarks: '' }]);
        fetchProduction();
      } else {
        setNotification({ type: 'error', message: json.error || 'Failed to save bulk logs' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const order = productionData?.order;
  const totalProduced = productionData?.totalProduced || 0;
  const orderQty = Number(order?.order_qty) || 0;
  const balanceToWeave = orderQty - totalProduced;
  const completionPct = orderQty > 0 ? ((totalProduced / orderQty) * 100).toFixed(1) : '0';
  const isOverproduced = totalProduced > orderQty;

  return (
    <div className="space-y-6">
      {/* Top Header & Order Selector */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-full text-[10px] font-black uppercase tracking-wider">
              Daily Production Tracker
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
            Production Update Entry Against IBPO
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Record actual weaving output per loom/vendor. Auto-recalculates cumulative balances and completion forecasts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Select Order:</label>
          <select
            value={selectedIbpo}
            onChange={e => setSelectedIbpo(e.target.value)}
            className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-indigo-600 focus:outline-none focus:border-indigo-500 min-w-[220px]"
          >
            {orders.map(o => (
              <option key={o.id} value={o.ibpo}>
                {o.ibpo} • {o.sp_no} • {Number(o.order_qty).toLocaleString()} M ({o.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {notification && (
        <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-3 border ${
          notification.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span className="flex-1">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600">×</button>
        </div>
      )}

      {order && (
        <>
          {/* Order Metrics Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-slate-800">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-800">
              <div>
                <span className="text-xs text-indigo-400 font-bold font-mono">IBPO: {order.ibpo}</span>
                <h3 className="text-lg font-black text-white mt-0.5">{order.sp_no} • {order.customer || 'General'}</h3>
                <p className="text-xs text-slate-400">{order.order_type} • Product Group: {order.product_group}</p>
              </div>

              <div className="flex items-center gap-3">
                {onNavigateToCompletion && Number(completionPct) >= 97 && (
                  <button
                    onClick={() => onNavigateToCompletion(order.ibpo)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 transition-all"
                  >
                    Proceed to Completion Close <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-xs">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Ordered (MTR)</p>
                <p className="text-lg font-black text-white mt-0.5">{orderQty.toLocaleString()} M</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Cumulative Produced</p>
                <p className="text-lg font-black text-emerald-400 mt-0.5">{totalProduced.toLocaleString()} M ({completionPct}%)</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Balance To Weave</p>
                <p className={`text-lg font-black mt-0.5 ${balanceToWeave <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {balanceToWeave <= 0 ? '0 M' : `${balanceToWeave.toLocaleString()} M`}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Status & Variance</p>
                <p className="text-sm font-black text-amber-300 mt-0.5">
                  {isOverproduced ? `+${(totalProduced - orderQty).toLocaleString()} M Excess` : `${order.status}`}
                </p>
              </div>
            </div>
          </div>

          {/* Form & Mode Switcher */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 tracking-wider">
                {bulkMode ? 'Multi-Entry / Excel Copy-Paste Production' : 'Single Production Log Entry'}
              </h3>

              <button
                onClick={() => setBulkMode(!bulkMode)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                {bulkMode ? 'Switch to Single Form' : 'Switch to Multi-Entry / Excel Paste'}
              </button>
            </div>

            {!bulkMode ? (
              <form onSubmit={handleSingleSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Production Date *</label>
                  <input
                    type="date"
                    required
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
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black shadow-md flex items-center justify-center gap-1.5 transition-all"
                  >
                    {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save Log
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="space-y-2">
                  <textarea
                    rows={2}
                    placeholder="Paste tab-separated cells from Excel: [Loom #, Produced Meters, Date (optional), Type (optional)]..."
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleParseClipboard}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1.5"
                  >
                    <Clipboard className="w-3.5 h-3.5" /> Parse Excel Rows
                  </button>
                </div>

                {bulkRows.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-600">Rows to Save: {bulkRows.length}</span>
                      <button
                        type="button"
                        onClick={handleSaveBulk}
                        disabled={submitting}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black shadow-md flex items-center gap-2"
                      >
                        {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save All Rows
                      </button>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 max-h-60">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-900 font-bold border-b">
                          <tr>
                            <th className="p-2">Loom #</th>
                            <th className="p-2">Produced MTR</th>
                            <th className="p-2">Date</th>
                            <th className="p-2">Type</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {bulkRows.map((r, i) => (
                            <tr key={i}>
                              <td className="p-2 font-mono font-bold">{r.loom_no}</td>
                              <td className="p-2 font-black text-emerald-600">{r.produced_meter}</td>
                              <td className="p-2 text-slate-500">{r.production_date}</td>
                              <td className="p-2">{r.allocation_type}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Daily Production Logs Table */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <h3 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 tracking-wider">
                Production History Logs ({productionData.logs?.length || 0} Entries)
              </h3>
              <span className="text-xs font-black text-emerald-600">
                Sum Total: {totalProduced.toLocaleString()} MTR
              </span>
            </div>

            {productionData.logs?.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No production logs recorded yet for IBPO {order.ibpo}.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Allocation Stream</th>
                      <th className="p-3">Loom #</th>
                      <th className="p-3 text-right">Produced Meters</th>
                      <th className="p-3">Entered By</th>
                      <th className="p-3">Remarks</th>
                      <th className="p-3 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {productionData.logs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-bold text-slate-800 dark:text-white">
                          {new Date(log.production_date).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            log.allocation_type === 'IN_HOUSE' ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {log.allocation_type}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                          {log.loom_no ? `L-${log.loom_no}` : (log.vendor_loom_id ? `V-${log.vendor_loom_id}` : '-')}
                        </td>
                        <td className="p-3 text-right font-black text-emerald-600">
                          {Number(log.produced_meter).toLocaleString()} M
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-400 font-medium">
                          {log.entered_by}
                        </td>
                        <td className="p-3 text-slate-500">
                          {log.remarks || '-'}
                        </td>
                        <td className="p-3 text-right text-slate-400 font-mono text-[10px]">
                          {new Date(log.createdAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
