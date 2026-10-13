import React, { useState, useEffect } from 'react';
import { 
  Plus, Upload, Download, Clipboard, CheckCircle, AlertCircle, 
  Trash2, RefreshCw, FileSpreadsheet, ArrowRight, Save, Layers
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { API_BASE_URL } from '../../config';

interface ToaOrderEntryProps {
  onOrderSaved?: (ibpo: string) => void;
}

export default function ToaOrderEntry({ onOrderSaved }: ToaOrderEntryProps) {
  const [entryMode, setEntryMode] = useState<'single' | 'bulk'>('single');

  // Single Entry Form State
  const [formData, setFormData] = useState({
    ibpo: '',
    customer: '',
    order_no: '',
    sp_no: '',
    order_type: 'YD',
    construction: '',
    order_qty: '',
    grey_req: '',
    product_group: 'Normal YD',
    ppi: '',
    kpx: '',
    kpx_factor: '1.0',
    width: '',
    reed_count: '',
    pick: '',
    frames: '',
    weft_colours: '',
    received_date: new Date().toISOString().split('T')[0],
    target_date: '',
    priority: 'Medium',
    remarks: ''
  });

  // Bulk Paste / Grid State
  const [bulkRows, setBulkRows] = useState<any[]>([
    { ibpo: '', sp_no: '', order_qty: '', order_type: 'YD', customer: '', width: '', ppi: '', received_date: new Date().toISOString().split('T')[0] },
    { ibpo: '', sp_no: '', order_qty: '', order_type: 'YD', customer: '', width: '', ppi: '', received_date: new Date().toISOString().split('T')[0] },
    { ibpo: '', sp_no: '', order_qty: '', order_type: 'YD', customer: '', width: '', ppi: '', received_date: new Date().toISOString().split('T')[0] }
  ]);

  const [pasteText, setPasteText] = useState('');
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [designs, setDesigns] = useState<any[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load existing DesignMaster for fast auto-fill
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/designs`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setDesigns(data);
      })
      .catch(() => {});
  }, []);

  // When SP No changes in single form, auto-fill technical specs
  const handleSpNoChange = (spNo: string) => {
    const trimmed = spNo.trim();
    const matched = designs.find(d => d.design_no_sp_no?.toLowerCase() === trimmed.toLowerCase());
    if (matched) {
      setFormData(prev => ({
        ...prev,
        sp_no: spNo,
        construction: matched.construction || prev.construction,
        width: matched.greige_width || prev.width,
        reed_count: matched.reed_count || prev.reed_count,
        pick: matched.pick || prev.pick,
        ppi: matched.ppi ? String(matched.ppi) : prev.ppi,
        frames: matched.frames ? String(matched.frames) : prev.frames,
        weft_colours: matched.weft_colours ? String(matched.weft_colours) : prev.weft_colours
      }));
    } else {
      setFormData(prev => ({ ...prev, sp_no: spNo }));
    }
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNotification(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const json = await res.json();
      if (json.success) {
        setNotification({ type: 'success', message: `Order with IBPO "${formData.ibpo}" registered successfully!` });
        const savedIbpo = formData.ibpo;
        setFormData({
          ibpo: '',
          customer: '',
          order_no: '',
          sp_no: '',
          order_type: 'YD',
          construction: '',
          order_qty: '',
          grey_req: '',
          product_group: 'Normal YD',
          ppi: '',
          kpx: '',
          kpx_factor: '1.0',
          width: '',
          reed_count: '',
          pick: '',
          frames: '',
          weft_colours: '',
          received_date: new Date().toISOString().split('T')[0],
          target_date: '',
          priority: 'Medium',
          remarks: ''
        });
        if (onOrderSaved) onOrderSaved(savedIbpo);
      } else {
        setNotification({ type: 'error', message: json.error || 'Failed to save order' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  // Parse Excel Clipboard Copy-Paste
  const handleParseClipboard = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.trim().split(/\r?\n/);
    const parsed: any[] = [];

    // Header detection
    let startIdx = 0;
    const firstLineLower = lines[0].toLowerCase();
    if (firstLineLower.includes('ibpo') || firstLineLower.includes('sp')) {
      startIdx = 1; // Skip header row
    }

    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split('\t');
      if (parts.length < 2) continue;
      const ibpo = parts[0]?.trim();
      const sp_no = parts[1]?.trim();
      const order_qty = parts[2]?.trim();
      const order_type = parts[3]?.trim() || (sp_no.toUpperCase().includes('GREY') ? 'Grey' : 'YD');
      const customer = parts[4]?.trim() || '';
      const width = parts[5]?.trim() || '';
      const ppi = parts[6]?.trim() || '';

      if (ibpo && sp_no) {
        parsed.push({
          ibpo,
          sp_no,
          order_qty: parseFloat(order_qty.replace(/,/g, '')) || 0,
          order_type,
          customer,
          width,
          ppi,
          received_date: new Date().toISOString().split('T')[0]
        });
      }
    }

    if (parsed.length > 0) {
      setBulkRows(parsed);
      setPreviewRows(parsed);
      setPasteText('');
      setNotification({ type: 'success', message: `Parsed ${parsed.length} rows from Excel clipboard. Review below before saving.` });
    } else {
      setNotification({ type: 'error', message: 'No valid rows found. Please copy columns: [IBPO, SP_NO, QTY, ORDER_TYPE, CUSTOMER, WIDTH, PPI]' });
    }
  };

  // Upload Excel File (.xlsx)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const data = XLSX.utils.sheet_to_json(ws);

        if (Array.isArray(data) && data.length > 0) {
          const parsed = data.map((r: any) => ({
            ibpo: String(r['IBPO'] || r['ibpo'] || '').trim(),
            sp_no: String(r['SP NO'] || r['SP_NO'] || r['sp_no'] || r['Design'] || '').trim(),
            order_qty: parseFloat(String(r['GREY REQ'] || r['order_qty'] || r['Qty'] || 0).replace(/,/g, '')) || 0,
            order_type: String(r['Order Type'] || r['order_type'] || 'YD').trim(),
            customer: String(r['Customer'] || r['customer'] || '').trim(),
            width: String(r['Width'] || r['width'] || '').trim(),
            ppi: String(r['PPI'] || r['ppi'] || '').trim(),
            received_date: String(r['Order Received Date'] || r['received_date'] || new Date().toISOString().split('T')[0]).trim()
          })).filter(r => r.ibpo && r.sp_no);

          setBulkRows(parsed);
          setPreviewRows(parsed);
          setNotification({ type: 'success', message: `Imported ${parsed.length} rows from Excel file. Review below.` });
        }
      } catch (err: any) {
        setNotification({ type: 'error', message: `Failed to read Excel file: ${err.message}` });
      }
    };
    reader.readAsBinaryString(file);
  };

  // Save Bulk Rows to Server
  const handleSaveBulk = async () => {
    const validRows = bulkRows.filter(r => r.ibpo && r.sp_no && Number(r.order_qty) > 0);
    if (validRows.length === 0) {
      setNotification({ type: 'error', message: 'No valid rows with IBPO, SP No, and quantity > 0 to save.' });
      return;
    }

    setLoading(true);
    setNotification(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/orders/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows })
      });
      const json = await res.json();
      if (json.success) {
        const { successCount, failedCount, errors } = json.data;
        if (failedCount > 0) {
          setNotification({
            type: 'error',
            message: `Saved ${successCount} orders. ${failedCount} rows had errors: ${errors.map((e: any) => `Row ${e.row}: ${e.error}`).join('; ')}`
          });
        } else {
          setNotification({ type: 'success', message: `All ${successCount} orders registered successfully!` });
          setBulkRows([]);
          setPreviewRows([]);
        }
      } else {
        setNotification({ type: 'error', message: json.error || 'Failed to save bulk orders' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  // Download Sample Template
  const handleDownloadTemplate = () => {
    const sampleData = [
      { 'IBPO': '24501', 'SP NO': 'SP26/692', 'GREY REQ': 15000, 'Order Type': 'YD', 'Customer': 'RAYMOND', 'Width': '75 inch', 'PPI': 68, 'Order Received Date': '2026-10-15' },
      { 'IBPO': '24502', 'SP NO': 'SP25/230', 'GREY REQ': 8500, 'Order Type': 'Grey', 'Customer': 'ARVIND', 'Width': '63 inch', 'PPI': 56, 'Order Received Date': '2026-10-15' },
      { 'IBPO': '24503', 'SP NO': 'SP26/619', 'GREY REQ': 12000, 'Order Type': 'YD', 'Customer': 'ZODIAC', 'Width': '72 inch', 'PPI': 72, 'Order Received Date': '2026-10-16' }
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Order_Template');
    XLSX.writeFile(wb, 'SPUPL_TOA_Order_Entry_Template.xlsx');
  };

  return (
    <div className="space-y-6">
      {/* Header and Mode Switcher */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
            Order Entry & Bulk Import Register
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Register individual or bulk orders with technical specifications. Eligible for In-House & Vendor capability analysis.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setEntryMode('single')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              entryMode === 'single'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Single Form Entry
          </button>
          <button
            onClick={() => setEntryMode('bulk')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              entryMode === 'bulk'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel Copy-Paste / Multi Entry
          </button>
        </div>
      </div>

      {notification && (
        <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-3 border ${
          notification.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span className="flex-1">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600">×</button>
        </div>
      )}

      {/* Mode 1: Single Order Entry Form */}
      {entryMode === 'single' && (
        <form onSubmit={handleSingleSubmit} className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                IBPO (Unique Identifier) *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 23204"
                value={formData.ibpo}
                onChange={e => setFormData({ ...formData, ibpo: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                SP NO / Design No *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. SP26/692"
                value={formData.sp_no}
                onChange={e => handleSpNoChange(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                Order Type *
              </label>
              <select
                value={formData.order_type}
                onChange={e => setFormData({ ...formData, order_type: e.target.value, product_group: e.target.value === 'Grey' ? 'Normal Grey' : 'Normal YD' })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="YD">YD (Yarn Dyed)</option>
                <option value="Grey">Grey</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                GREY REQ (Ordered Qty in MTR) *
              </label>
              <input
                type="number"
                required
                min="1"
                placeholder="e.g. 50000"
                value={formData.order_qty}
                onChange={e => setFormData({ ...formData, order_qty: e.target.value, grey_req: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                Customer Name
              </label>
              <input
                type="text"
                placeholder="e.g. Arvind / Raymond"
                value={formData.customer}
                onChange={e => setFormData({ ...formData, customer: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                Order Received Date
              </label>
              <input
                type="date"
                required
                value={formData.received_date}
                onChange={e => setFormData({ ...formData, received_date: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                Required Target Date
              </label>
              <input
                type="date"
                value={formData.target_date}
                onChange={e => setFormData({ ...formData, target_date: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                Product Group
              </label>
              <select
                value={formData.product_group}
                onChange={e => setFormData({ ...formData, product_group: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Normal YD">Normal YD</option>
                <option value="Normal Grey">Normal Grey</option>
                <option value="Linen Blend">Linen Blend</option>
                <option value="Special">Special</option>
              </select>
            </div>
          </div>

          {/* Technical Specs for Capability Verification */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
            <h4 className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider mb-3">
              Technical Capability Requirements (Auto-enriched from Design Master)
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Width</label>
                <input
                  type="text"
                  placeholder="e.g. 75 inch"
                  value={formData.width}
                  onChange={e => setFormData({ ...formData, width: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Frames</label>
                <input
                  type="number"
                  placeholder="e.g. 12"
                  value={formData.frames}
                  onChange={e => setFormData({ ...formData, frames: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Weft Colours</label>
                <input
                  type="number"
                  placeholder="e.g. 4"
                  value={formData.weft_colours}
                  onChange={e => setFormData({ ...formData, weft_colours: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">PPI</label>
                <input
                  type="number"
                  placeholder="e.g. 68"
                  value={formData.ppi}
                  onChange={e => setFormData({ ...formData, ppi: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Reed Count</label>
                <input
                  type="text"
                  placeholder="e.g. 96"
                  value={formData.reed_count}
                  onChange={e => setFormData({ ...formData, reed_count: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Pick</label>
                <input
                  type="text"
                  placeholder="e.g. 64"
                  value={formData.pick}
                  onChange={e => setFormData({ ...formData, pick: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-900/30 transition-all flex items-center gap-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Order & Enable Allocation
            </button>
          </div>
        </form>
      )}

      {/* Mode 2: Bulk Entry & Excel Copy-Paste Grid */}
      {entryMode === 'bulk' && (
        <div className="space-y-6">
          {/* Quick Paste & Template Controls */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Clipboard className="w-4 h-4 text-indigo-600" />
                  Excel Copy-Paste Area
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Copy cells directly from Excel (e.g. from Loom_Planning_KPX REPORT_2026.xlsx) and paste here.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  Download Excel Template
                </button>

                <label className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-indigo-600" />
                  Upload .xlsx File
                  <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <textarea
                rows={3}
                placeholder="Paste tab-separated rows here (e.g. 23204 [TAB] SP26/692 [TAB] 15000 [TAB] YD [TAB] RAYMOND)..."
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-mono text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleParseClipboard}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2"
              >
                <Clipboard className="w-3.5 h-3.5" />
                Parse Clipboard Rows
              </button>
            </div>
          </div>

          {/* Interactive Editable Grid */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                  Bulk Order Multi-Entry Grid ({bulkRows.length} Rows)
                </h3>
                <p className="text-xs text-slate-500">Edit cells directly before saving.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBulkRows([...bulkRows, { ibpo: '', sp_no: '', order_qty: '', order_type: 'YD', customer: '', width: '', ppi: '', received_date: new Date().toISOString().split('T')[0] }])}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
                >
                  + Add Row
                </button>
                <button
                  type="button"
                  onClick={handleSaveBulk}
                  disabled={loading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2"
                >
                  {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save All Valid Orders
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 max-h-[500px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-2.5 w-12 text-center">#</th>
                    <th className="p-2.5">IBPO *</th>
                    <th className="p-2.5">SP NO / Design *</th>
                    <th className="p-2.5 text-right">GREY REQ (MTR) *</th>
                    <th className="p-2.5">Type</th>
                    <th className="p-2.5">Customer</th>
                    <th className="p-2.5">Width</th>
                    <th className="p-2.5">PPI</th>
                    <th className="p-2.5">Received Date</th>
                    <th className="p-2.5 w-10 text-center">Del</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {bulkRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-2 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="p-1">
                        <input
                          type="text"
                          placeholder="IBPO"
                          value={row.ibpo}
                          onChange={e => {
                            const updated = [...bulkRows];
                            updated[idx].ibpo = e.target.value;
                            setBulkRows(updated);
                          }}
                          className="w-full px-2 py-1.5 bg-transparent border border-slate-200 dark:border-slate-700 rounded font-mono font-bold text-indigo-600"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="text"
                          placeholder="SP26/..."
                          value={row.sp_no}
                          onChange={e => {
                            const updated = [...bulkRows];
                            updated[idx].sp_no = e.target.value;
                            setBulkRows(updated);
                          }}
                          className="w-full px-2 py-1.5 bg-transparent border border-slate-200 dark:border-slate-700 rounded font-bold"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="number"
                          placeholder="MTR"
                          value={row.order_qty}
                          onChange={e => {
                            const updated = [...bulkRows];
                            updated[idx].order_qty = e.target.value;
                            setBulkRows(updated);
                          }}
                          className="w-full px-2 py-1.5 bg-transparent border border-slate-200 dark:border-slate-700 rounded text-right font-black"
                        />
                      </td>
                      <td className="p-1">
                        <select
                          value={row.order_type || 'YD'}
                          onChange={e => {
                            const updated = [...bulkRows];
                            updated[idx].order_type = e.target.value;
                            setBulkRows(updated);
                          }}
                          className="w-full px-2 py-1.5 bg-transparent border border-slate-200 dark:border-slate-700 rounded font-bold"
                        >
                          <option value="YD">YD</option>
                          <option value="Grey">Grey</option>
                        </select>
                      </td>
                      <td className="p-1">
                        <input
                          type="text"
                          placeholder="Customer"
                          value={row.customer || ''}
                          onChange={e => {
                            const updated = [...bulkRows];
                            updated[idx].customer = e.target.value;
                            setBulkRows(updated);
                          }}
                          className="w-full px-2 py-1.5 bg-transparent border border-slate-200 dark:border-slate-700 rounded"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="text"
                          placeholder="Width"
                          value={row.width || ''}
                          onChange={e => {
                            const updated = [...bulkRows];
                            updated[idx].width = e.target.value;
                            setBulkRows(updated);
                          }}
                          className="w-full px-2 py-1.5 bg-transparent border border-slate-200 dark:border-slate-700 rounded"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="text"
                          placeholder="PPI"
                          value={row.ppi || ''}
                          onChange={e => {
                            const updated = [...bulkRows];
                            updated[idx].ppi = e.target.value;
                            setBulkRows(updated);
                          }}
                          className="w-full px-2 py-1.5 bg-transparent border border-slate-200 dark:border-slate-700 rounded"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="date"
                          value={row.received_date || ''}
                          onChange={e => {
                            const updated = [...bulkRows];
                            updated[idx].received_date = e.target.value;
                            setBulkRows(updated);
                          }}
                          className="w-full px-2 py-1.5 bg-transparent border border-slate-200 dark:border-slate-700 rounded font-medium"
                        />
                      </td>
                      <td className="p-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = bulkRows.filter((_, i) => i !== idx);
                            setBulkRows(updated);
                          }}
                          className="p-1 text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
