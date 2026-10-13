import React, { useState } from 'react';
import { 
  FileSpreadsheet, Clipboard, Download, Upload, CheckCircle2, 
  AlertTriangle, RefreshCw, Save, Trash2, ArrowRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { API_BASE_URL } from '../../config';

export default function ToaBulkOperations() {
  const [activeTab, setActiveTab] = useState<'orders' | 'production'>('orders');

  // Bulk Orders State
  const [orderPasteText, setOrderPasteText] = useState('');
  const [orderRows, setOrderRows] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Bulk Production State
  const [prodPasteText, setProdPasteText] = useState('');
  const [prodRows, setProdRows] = useState<any[]>([]);
  const [loadingProd, setLoadingProd] = useState(false);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Parse Orders Clipboard
  const handleParseOrderClipboard = () => {
    if (!orderPasteText.trim()) return;
    const lines = orderPasteText.trim().split(/\r?\n/);
    const parsed: any[] = [];
    let startIdx = 0;
    if (lines[0].toLowerCase().includes('ibpo')) startIdx = 1;

    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split('\t');
      if (parts.length >= 2) {
        const ibpo = parts[0]?.trim();
        const sp_no = parts[1]?.trim();
        const qty = parseFloat(parts[2]?.replace(/,/g, '')) || 0;
        const type = parts[3]?.trim() || (sp_no.toUpperCase().includes('GREY') ? 'Grey' : 'YD');
        const cust = parts[4]?.trim() || '';
        const width = parts[5]?.trim() || '';
        const ppi = parts[6]?.trim() || '';

        if (ibpo && sp_no && qty > 0) {
          parsed.push({
            ibpo,
            sp_no,
            order_qty: qty,
            order_type: type,
            customer: cust,
            width,
            ppi,
            received_date: new Date().toISOString().split('T')[0]
          });
        }
      }
    }

    if (parsed.length > 0) {
      setOrderRows(parsed);
      setOrderPasteText('');
      setNotification({ type: 'success', message: `Parsed ${parsed.length} orders from clipboard. Review below before saving.` });
    } else {
      setNotification({ type: 'error', message: 'No valid rows found. Copy: [IBPO, SP_NO, QTY, TYPE, CUSTOMER, WIDTH, PPI]' });
    }
  };

  // Save Bulk Orders
  const handleSaveBulkOrders = async () => {
    if (orderRows.length === 0) return;
    setLoadingOrders(true);
    setNotification(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/orders/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: orderRows })
      });
      const json = await res.json();
      if (json.success) {
        setNotification({
          type: 'success',
          message: `Saved ${json.data.successCount} orders successfully! (${json.data.failedCount} skipped / duplicates)`
        });
        setOrderRows([]);
      } else {
        setNotification({ type: 'error', message: json.error || 'Failed to save orders' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoadingOrders(false);
    }
  };

  // Parse Production Clipboard
  const handleParseProdClipboard = () => {
    if (!prodPasteText.trim()) return;
    const lines = prodPasteText.trim().split(/\r?\n/);
    const parsed: any[] = [];
    let startIdx = 0;
    if (lines[0].toLowerCase().includes('ibpo')) startIdx = 1;

    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split('\t');
      if (parts.length >= 2) {
        const ibpo = parts[0]?.trim();
        const produced_meter = parseFloat(parts[1]?.replace(/,/g, '')) || 0;
        const loom_no = parts[2]?.trim() || '';
        const date = parts[3]?.trim() || new Date().toISOString().split('T')[0];
        const type = parts[4]?.trim() || 'IN_HOUSE';

        if (ibpo && produced_meter > 0) {
          parsed.push({
            ibpo,
            produced_meter,
            loom_no: parseInt(loom_no) || null,
            production_date: date,
            allocation_type: type,
            remarks: ''
          });
        }
      }
    }

    if (parsed.length > 0) {
      setProdRows(parsed);
      setProdPasteText('');
      setNotification({ type: 'success', message: `Parsed ${parsed.length} daily production rows. Review below before saving.` });
    } else {
      setNotification({ type: 'error', message: 'No valid rows found. Copy: [IBPO, PRODUCED_MTR, LOOM_NO, DATE, TYPE]' });
    }
  };

  // Save Bulk Production
  const handleSaveBulkProd = async () => {
    if (prodRows.length === 0) return;
    setLoadingProd(true);
    setNotification(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/production/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: prodRows })
      });
      const json = await res.json();
      if (json.success) {
        setNotification({
          type: 'success',
          message: `Saved ${json.data.successCount} daily production records successfully!`
        });
        setProdRows([]);
      } else {
        setNotification({ type: 'error', message: json.error || 'Failed to save production records' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoadingProd(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-full text-[10px] font-black uppercase tracking-wider">
              Bulk Processing Suite
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
            Bulk Operations & Excel Copy-Paste Tools
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Rapid data onboarding: Bulk upload or paste orders and multi-loom daily production logs directly from Excel.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'orders'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Bulk Orders Import
          </button>
          <button
            onClick={() => setActiveTab('production')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'production'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Bulk Daily Production
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

      {/* Tab 1: Bulk Orders */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <h3 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 tracking-wider flex items-center gap-2">
              <Clipboard className="w-4 h-4 text-indigo-600" />
              Paste Orders from Excel
            </h3>
            <textarea
              rows={3}
              placeholder="Paste tab-separated rows: [IBPO, SP_NO, GREY REQ, ORDER_TYPE, CUSTOMER, WIDTH, PPI]..."
              value={orderPasteText}
              onChange={e => setOrderPasteText(e.target.value)}
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-mono"
            />
            <button
              onClick={handleParseOrderClipboard}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md"
            >
              Parse Order Rows
            </button>
          </div>

          {orderRows.length > 0 && (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">
                  Parsed Orders Preview ({orderRows.length} Rows)
                </h4>
                <button
                  onClick={handleSaveBulkOrders}
                  disabled={loadingOrders}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2"
                >
                  {loadingOrders ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save All Orders
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 max-h-80">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-900 font-bold border-b">
                    <tr>
                      <th className="p-2.5">IBPO</th>
                      <th className="p-2.5">SP NO</th>
                      <th className="p-2.5 text-right">GREY REQ</th>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5">Customer</th>
                      <th className="p-2.5">Width</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {orderRows.map((r, i) => (
                      <tr key={i}>
                        <td className="p-2.5 font-mono font-bold text-indigo-600">{r.ibpo}</td>
                        <td className="p-2.5 font-bold">{r.sp_no}</td>
                        <td className="p-2.5 text-right font-black">{r.order_qty} M</td>
                        <td className="p-2.5">{r.order_type}</td>
                        <td className="p-2.5 text-slate-500">{r.customer}</td>
                        <td className="p-2.5 text-slate-500">{r.width}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Bulk Production */}
      {activeTab === 'production' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <h3 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 tracking-wider flex items-center gap-2">
              <Clipboard className="w-4 h-4 text-emerald-600" />
              Paste Multi-Loom Daily Production from Excel
            </h3>
            <textarea
              rows={3}
              placeholder="Paste tab-separated rows: [IBPO, PRODUCED_MTR, LOOM_NO, DATE, TYPE]..."
              value={prodPasteText}
              onChange={e => setProdPasteText(e.target.value)}
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-mono"
            />
            <button
              onClick={handleParseProdClipboard}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md"
            >
              Parse Production Rows
            </button>
          </div>

          {prodRows.length > 0 && (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">
                  Parsed Production Rows Preview ({prodRows.length} Records)
                </h4>
                <button
                  onClick={handleSaveBulkProd}
                  disabled={loadingProd}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2"
                >
                  {loadingProd ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save All Daily Production Records
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 max-h-80">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-900 font-bold border-b">
                    <tr>
                      <th className="p-2.5">IBPO</th>
                      <th className="p-2.5 text-right">Produced Meters</th>
                      <th className="p-2.5">Loom #</th>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {prodRows.map((r, i) => (
                      <tr key={i}>
                        <td className="p-2.5 font-mono font-bold text-indigo-600">{r.ibpo}</td>
                        <td className="p-2.5 text-right font-black text-emerald-600">{r.produced_meter} M</td>
                        <td className="p-2.5 font-mono">{r.loom_no ? `L-${r.loom_no}` : '-'}</td>
                        <td className="p-2.5 text-slate-500">{r.production_date}</td>
                        <td className="p-2.5">{r.allocation_type}</td>
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
  );
}
