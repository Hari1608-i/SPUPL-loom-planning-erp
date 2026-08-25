import React, { useState, useEffect } from 'react';
import { Layers, Search, Plus, RefreshCw, CheckCircle2, ShieldCheck, Download, Trash2, Edit3, Box, AlertTriangle, X, Database, ShoppingBag, CheckCircle } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { useAppContext } from '../context/AppProvider';
import { calculateOrderReedRequirement } from '../utils/calculations';

export default function ReedStock() {
  const { reeds, orders = [], designs = [], refreshData } = useAppContext();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const defaultForm = {
    reed_count: '44/2',
    dents_per_inch: 44,
    total_dents: 2950,
    vendor: 'Premier',
    location: 'Rack A-01',
    available_qty: 4,
    remarks: ''
  };

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [formData, setFormData] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  const [showOrderStockModal, setShowOrderStockModal] = useState(false);
  const [selectedOrderForStock, setSelectedOrderForStock] = useState<any>(null);
  const [orderStockForm, setOrderStockForm] = useState({
    add_qty: 1,
    vendor: 'Premier',
    location: 'Rack A-01',
    remarks: ''
  });

  const openOrderStockModal = (ord: any, reqResult: any, reedCount: string) => {
    setSelectedOrderForStock({
      ibpo_no: ord.ibpo_no || ord.order_no || '—',
      reedCount,
      requiredQty: reqResult.requiredReedQty,
      availableQty: reqResult.availableQty,
      shortageQty: reqResult.shortageQty
    });
    setOrderStockForm({
      add_qty: reqResult.shortageQty > 0 ? reqResult.shortageQty : 1,
      vendor: 'Premier',
      location: 'Rack A-01',
      remarks: `Direct Stock Entry against IBPO ${ord.ibpo_no || ord.order_no}`
    });
    setShowOrderStockModal(true);
  };

  const handleOrderStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForStock) return;
    if (orderStockForm.add_qty <= 0) {
      alert('Please enter a valid positive reed quantity.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/reed-stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reed_count: selectedOrderForStock.reedCount,
          dents_per_inch: 44,
          total_dents: 2950,
          vendor: orderStockForm.vendor,
          make_vendor: orderStockForm.vendor,
          location: orderStockForm.location,
          available_qty: orderStockForm.add_qty,
          remarks: orderStockForm.remarks || `Allocated for ${selectedOrderForStock.ibpo_no}`
        })
      });

      if (res.ok) {
        setShowOrderStockModal(false);
        setSelectedOrderForStock(null);
        await refreshData();
      } else {
        alert('Failed to save order reed stock');
      }
    } catch (err: any) {
      alert('Error adding order stock: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  // Compute KPI Totals as per Point 20 Formula:
  // TOTAL PHYSICAL REEDS = SUM(Available Qty)
  // RESERVED = SUM(Reserved Qty)
  // RUNNING = SUM(Running Qty)
  // BALANCE = SUM(Available Qty) - SUM(Reserved Qty) - SUM(Running Qty)
  const totalTypes = reeds.length;
  const totalPhysicalReeds = reeds.reduce((acc, r) => acc + Number(r.available_qty !== undefined ? r.available_qty : (r.total_qty || 1)), 0);
  const totalReserved = reeds.reduce((acc, r) => acc + Number(r.reserved_qty || 0), 0);
  const totalRunning = reeds.reduce((acc, r) => acc + Number(r.running_qty || 0), 0);
  const totalBalance = totalPhysicalReeds - totalReserved - totalRunning;
  const lowStockTypes = reeds.filter(r => {
    const bal = r.balance_qty !== undefined ? r.balance_qty : (Number(r.available_qty || 0) - Number(r.reserved_qty || 0) - Number(r.running_qty || 0));
    return bal <= 2 && bal >= 0;
  }).length;

  const filteredReeds = reeds.filter(r => {
    const avail = Number(r.available_qty !== undefined ? r.available_qty : (r.total_qty || 1));
    const res = Number(r.reserved_qty || 0);
    const run = Number(r.running_qty || 0);
    const bal = r.balance_qty !== undefined ? r.balance_qty : (avail - res - run);

    if (statusFilter === 'AVAILABLE' && bal <= 0) return false;
    if (statusFilter === 'RESERVED' && res <= 0) return false;
    if (statusFilter === 'RUNNING' && run <= 0) return false;
    if (statusFilter === 'LOW_STOCK' && (bal <= 0 || bal > 2)) return false;
    if (statusFilter === 'OUT_OF_STOCK' && bal > 0) return false;

    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (r.reed_count && r.reed_count.toLowerCase().includes(q)) ||
      (r.location && r.location.toLowerCase().includes(q)) ||
      (r.vendor && r.vendor.toLowerCase().includes(q)) ||
      (r.make_vendor && r.make_vendor.toLowerCase().includes(q)) ||
      (r.status && r.status.toLowerCase().includes(q))
    );
  });

  const handleSeedSampleStock = async () => {
    setSaving(true);
    try {
      const sampleReeds = [
        { reed_count: '44/2', dents_per_inch: 44, total_dents: 2950, vendor: 'Premier', make_vendor: 'Premier', location: 'Rack A-01', available_qty: 4, remarks: 'Sample Stock' },
        { reed_count: '46/2', dents_per_inch: 46, total_dents: 3000, vendor: 'VSM', make_vendor: 'VSM', location: 'Rack A-02', available_qty: 4, remarks: 'Sample Stock' },
        { reed_count: '40/1', dents_per_inch: 40, total_dents: 2880, vendor: 'LoomCraft', make_vendor: 'LoomCraft', location: 'Rack B-01', available_qty: 3, remarks: 'Sample Stock' },
        { reed_count: '60/1', dents_per_inch: 60, total_dents: 3840, vendor: 'Apex', make_vendor: 'Apex', location: 'Rack B-02', available_qty: 5, remarks: 'Sample Stock' },
        { reed_count: '80/2', dents_per_inch: 80, total_dents: 5440, vendor: 'Star Reeds', make_vendor: 'Star Reeds', location: 'Rack C-01', available_qty: 4, remarks: 'Sample Stock' }
      ];

      const res = await fetch(`${API_BASE_URL}/api/reed-stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleReeds)
      });
      if (res.ok) {
        await refreshData();
      } else {
        alert('Failed to initialize sample stock');
      }
    } catch (err: any) {
      alert('Error initializing sample stock: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/reed-stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowAddModal(false);
        setFormData(defaultForm);
        await refreshData();
      } else {
        alert('Failed to save Reed stock record');
      }
    } catch (err: any) {
      alert('Error saving Reed stock: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (r: any) => {
    setEditingId(r.id);
    setFormData({
      reed_count: r.reed_count || '',
      dents_per_inch: r.dents_per_inch || 44,
      total_dents: r.total_dents || 2950,
      vendor: r.vendor || r.make_vendor || 'Premier',
      location: r.location || 'Rack A-01',
      available_qty: r.available_qty !== undefined ? r.available_qty : (r.total_qty || 1),
      remarks: r.remarks || ''
    });
    setShowEditModal(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    // Check edit validation rule: New Available Qty >= Reserved Qty + Running Qty
    const currentRecord = reeds.find(r => r.id === editingId);
    if (currentRecord) {
      const committed = Number(currentRecord.reserved_qty || 0) + Number(currentRecord.running_qty || 0);
      if (formData.available_qty < committed) {
        alert(`Cannot reduce physical stock (${formData.available_qty}) below currently reserved and running quantity (${committed}).`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/reed-stock/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowEditModal(false);
        setEditingId(null);
        setFormData(defaultForm);
        await refreshData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update Reed stock record');
      }
    } catch (err: any) {
      alert('Error updating Reed stock: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSave = async () => {
    if (!bulkPasteText.trim()) return;
    setSaving(true);
    try {
      const lines = bulkPasteText.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
      const items = lines.map(line => {
        const parts = line.split('\t').map(p => p.trim());
        return {
          reed_count: parts[0] || '44/2',
          dents_per_inch: parseInt(parts[1], 10) || 44,
          total_dents: parseInt(parts[2], 10) || 2950,
          vendor: parts[3] || 'Premier',
          make_vendor: parts[3] || 'Premier',
          location: parts[4] || 'Rack A-01',
          available_qty: parseInt(parts[5], 10) || 4,
          remarks: parts[6] || 'Excel Bulk Import'
        };
      });

      const res = await fetch(`${API_BASE_URL}/api/reed-stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items)
      });

      if (res.ok) {
        setShowBulkModal(false);
        setBulkPasteText('');
        await refreshData();
      } else {
        alert('Failed to save bulk reed items');
      }
    } catch (err: any) {
      alert('Error saving bulk reeds: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: any) => {
    if ((r.reserved_qty || 0) > 0 || (r.running_qty || 0) > 0) {
      alert('This Reed Count is currently committed to loom planning/production and cannot be deleted.');
      return;
    }

    if (!window.confirm(`Delete Reed Stock for Count "${r.reed_count}"?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/reed-stock/${r.id}`, { method: 'DELETE' });
      if (res.ok) {
        await refreshData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete reed stock');
      }
    } catch (err: any) {
      alert('Failed to delete reed stock: ' + err.message);
    }
  };

  const getStatusBadge = (r: any) => {
    const avail = Number(r.available_qty !== undefined ? r.available_qty : (r.total_qty || 1));
    const res = Number(r.reserved_qty || 0);
    const run = Number(r.running_qty || 0);
    const bal = r.balance_qty !== undefined ? r.balance_qty : (avail - res - run);

    if (bal < 0) {
      return <span className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-black uppercase">DATA MISMATCH</span>;
    }
    if (bal === 0 && run === 0 && res === 0) {
      return <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 text-[10px] font-black uppercase">OUT OF STOCK</span>;
    }
    if (bal === 0) {
      return run > 0 ? (
        <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-black uppercase">RUNNING</span>
      ) : (
        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-black uppercase">RESERVED</span>
      );
    }
    if (bal <= 2) {
      return <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-black uppercase">LOW STOCK</span>;
    }
    if (run > 0) {
      return <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-black uppercase">RUNNING</span>;
    }
    if (res > 0) {
      return <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-black uppercase">RESERVED</span>;
    }
    return <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">AVAILABLE</span>;
  };

  return (
    <div className="space-y-6 pb-12 bg-slate-50/70 p-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-industrial-900 flex items-center">
            <Layers className="w-6 h-6 mr-3 text-blue-600" /> Reed Stock Master (SSOT)
          </h1>
          <p className="text-industrial-500 text-sm mt-1">
            Single Source of Truth for Physical Reed Stock & Live Allocations (Balance Qty = Available Qty - Reserved Qty - Running Qty).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={async () => { setIsRefreshing(true); await refreshData(); setTimeout(() => setIsRefreshing(false), 700); }}
            className="flex items-center px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg shadow-sm font-semibold text-xs transition-all"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isRefreshing ? 'animate-refresh-spin' : ''}`} /> Refresh Stock
          </button>

          <button
            onClick={() => setShowBulkModal(true)}
            className="flex items-center px-3 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg shadow-sm font-semibold text-xs transition-all"
          >
            <Download className="w-4 h-4 mr-1.5" /> Excel Bulk Paste
          </button>

          <button
            onClick={() => {
              setFormData(defaultForm);
              setShowAddModal(true);
            }}
            className="flex items-center px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg shadow-sm font-semibold text-xs transition-all"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add New Reed
          </button>
        </div>
      </div>

      {/* KPI Cards (Point 19 & 20 Definition) */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[10px] text-slate-500 font-bold uppercase">TOTAL REED TYPES</div>
          <div className="text-xl font-black text-slate-900 mt-0.5">{totalTypes}</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-blue-200 shadow-sm bg-blue-50/20">
          <div className="text-[10px] text-blue-600 font-bold uppercase">TOTAL PHYSICAL REEDS</div>
          <div className="text-xl font-black text-blue-900 mt-0.5">{totalPhysicalReeds}</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[10px] text-slate-500 font-bold uppercase">AVAILABLE STOCK</div>
          <div className="text-xl font-black text-slate-900 mt-0.5">{totalPhysicalReeds}</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-blue-200 shadow-sm bg-blue-50/20">
          <div className="text-[10px] text-blue-600 font-bold uppercase">RESERVED QTY</div>
          <div className="text-xl font-black text-blue-700 mt-0.5">{totalReserved}</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-purple-200 shadow-sm bg-purple-50/20">
          <div className="text-[10px] text-purple-600 font-bold uppercase">RUNNING QTY</div>
          <div className="text-xl font-black text-purple-700 mt-0.5">{totalRunning}</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-sm bg-emerald-50/20">
          <div className="text-[10px] text-emerald-600 font-bold uppercase">BALANCE QTY</div>
          <div className="text-xl font-black text-emerald-700 mt-0.5">{totalBalance}</div>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: 'ALL', label: 'All Stock' },
            { key: 'AVAILABLE', label: 'Available' },
            { key: 'RESERVED', label: 'Reserved' },
            { key: 'RUNNING', label: 'Running' },
            { key: 'LOW_STOCK', label: `Low Stock (${lowStockTypes})` },
            { key: 'OUT_OF_STOCK', label: 'Out of Stock' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === tab.key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search count, vendor, location..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* SECTION A — ORDER-WISE REED REQUIREMENT */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center">
              <Box className="w-5 h-5 text-indigo-600 mr-2" /> Section A — Active Order Reed Requirements (Shortage & Low Stock Only)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Displays active orders requiring reed procurement/allocation (Sufficient stock orders are automatically hidden).
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 text-xs font-bold border border-amber-200">
            {
              orders
                .filter((o: any) => o.order_completion_status !== 'COMPLETED' && o.status !== 'ORDER COMPLETED')
                .filter((ord: any) => {
                  const matchedDesign = designs.find((d: any) =>
                    (d.design_no_sp_no || '').trim() === (ord.design_no_sp_no || '').trim() ||
                    (d.design_no_sp_no || '').trim() === (ord.ibpo_no || '').trim() ||
                    (d.design_no_sp_no || '').replace('SP026', 'SP26').trim() === (ord.ibpo_no || '').replace('SP026', 'SP26').trim()
                  );
                  const reedCount = ord.reed_count || matchedDesign?.reed_count || '';
                  const reqResult = calculateOrderReedRequirement({
                    orderQty: ord.order_qty,
                    plannedLoomCount: ord.planned_loom_count || 1,
                    reedCount,
                    availableReeds: reeds
                  });
                  return reqResult.stockStatus === 'STOCK LOW' || reqResult.stockStatus === 'OUT OF STOCK';
                }).length
            } Orders Needing Attention
          </span>
        </div>

        <div className="w-full overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left border-collapse text-xs table-fixed">
            <thead className="bg-slate-800 text-white font-bold sticky top-0">
              <tr className="border-b border-slate-700">
                <th className="py-2.5 px-2 text-center w-[4%]">#</th>
                <th className="py-2.5 px-2 w-[22%]">Order / IBPO No</th>
                <th className="py-2.5 px-2 text-center bg-indigo-900 text-indigo-200 w-[15%]">Reed Count</th>
                <th className="py-2.5 px-2 text-center bg-blue-900 text-blue-100 w-[14%]">Required Reed Qty</th>
                <th className="py-2.5 px-2 text-center w-[14%]">Available Reed Qty</th>
                <th className="py-2.5 px-2 text-center text-amber-300 w-[13%]">Shortage Qty</th>
                <th className="py-2.5 px-2 text-center w-[12%]">Status</th>
                <th className="py-2.5 px-2 text-center w-[6%] bg-blue-950 text-blue-200">+ Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {
                orders
                  .filter((o: any) => o.order_completion_status !== 'COMPLETED' && o.status !== 'ORDER COMPLETED')
                  .filter((ord: any) => {
                    const matchedDesign = designs.find((d: any) =>
                      (d.design_no_sp_no || '').trim() === (ord.design_no_sp_no || '').trim() ||
                      (d.design_no_sp_no || '').trim() === (ord.ibpo_no || '').trim() ||
                      (d.design_no_sp_no || '').replace('SP026', 'SP26').trim() === (ord.ibpo_no || '').replace('SP026', 'SP26').trim()
                    );
                    const reedCount = ord.reed_count || matchedDesign?.reed_count || '';
                    const reqResult = calculateOrderReedRequirement({
                      orderQty: ord.order_qty,
                      plannedLoomCount: ord.planned_loom_count || 1,
                      reedCount,
                      availableReeds: reeds
                    });
                    return reqResult.stockStatus === 'STOCK LOW' || reqResult.stockStatus === 'OUT OF STOCK';
                  }).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-emerald-700 bg-emerald-50/50 font-bold">
                      <CheckCircle className="w-5 h-5 inline mr-2 text-emerald-600" />
                      All active orders have sufficient physical reed stock available in factory inventory! No reed shortages detected.
                    </td>
                  </tr>
                ) : (
                  orders
                    .filter((o: any) => o.order_completion_status !== 'COMPLETED' && o.status !== 'ORDER COMPLETED')
                    .filter((ord: any) => {
                      const matchedDesign = designs.find((d: any) =>
                        (d.design_no_sp_no || '').trim() === (ord.design_no_sp_no || '').trim() ||
                        (d.design_no_sp_no || '').trim() === (ord.ibpo_no || '').trim() ||
                        (d.design_no_sp_no || '').replace('SP026', 'SP26').trim() === (ord.ibpo_no || '').replace('SP026', 'SP26').trim()
                      );
                      const reedCount = ord.reed_count || matchedDesign?.reed_count || '';
                      const reqResult = calculateOrderReedRequirement({
                        orderQty: ord.order_qty,
                        plannedLoomCount: ord.planned_loom_count || 1,
                        reedCount,
                        availableReeds: reeds
                      });
                      return reqResult.stockStatus === 'STOCK LOW' || reqResult.stockStatus === 'OUT OF STOCK';
                    })
                    .map((ord: any, idx: number) => {
                      const matchedDesign = designs.find((d: any) =>
                        (d.design_no_sp_no || '').trim() === (ord.design_no_sp_no || '').trim() ||
                        (d.design_no_sp_no || '').trim() === (ord.ibpo_no || '').trim() ||
                        (d.design_no_sp_no || '').replace('SP026', 'SP26').trim() === (ord.ibpo_no || '').replace('SP026', 'SP26').trim()
                      );

                      const reedCount = ord.reed_count || matchedDesign?.reed_count || '—';
                      const plannedLoomCount = ord.planned_loom_count || 1;

                      const reqResult = calculateOrderReedRequirement({
                        orderQty: ord.order_qty,
                        plannedLoomCount,
                        reedCount,
                        availableReeds: reeds
                      });

                      return (
                        <tr key={ord.id || idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-2 text-center text-slate-400 font-bold">{idx + 1}</td>
                          <td className="py-2 px-2 font-black text-blue-700 text-xs break-words">{ord.ibpo_no || ord.order_no || '—'}</td>
                          <td className="py-2 px-2 text-center font-black text-indigo-900 bg-indigo-50/50 text-xs">{reedCount}</td>
                          <td className="py-2 px-2 text-center font-black text-blue-900 bg-blue-50/50 text-xs">{reqResult.requiredReedQty}</td>
                          <td className="py-2 px-2 text-center font-bold text-slate-700 text-xs">{reqResult.availableQty}</td>
                          <td className="py-2 px-2 text-center font-black text-amber-700 bg-amber-50/50 text-xs">{reqResult.shortageQty > 0 ? reqResult.shortageQty : '0'}</td>
                          <td className="py-2 px-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider inline-block ${
                              reqResult.stockStatus === 'STOCK LOW'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-red-100 text-red-800 border border-red-300'
                            }`}>
                              {reqResult.stockStatus}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              onClick={() => openOrderStockModal(ord, reqResult, reedCount)}
                              title="Add Reed Stock Against Order"
                              className="w-7 h-7 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-black text-base flex items-center justify-center mx-auto shadow-md transition-all active:scale-95"
                            >
                              +
                            </button>
                          </td>
                        </tr>
                      );
                    })
                )
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Main Grid Table — SECTION B PHYSICAL REED STOCK */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-3 bg-slate-100 border-b border-slate-200 font-bold text-slate-800 text-xs flex justify-between items-center">
          <span>SECTION B — PHYSICAL REED STOCK MASTER</span>
          <span className="text-slate-500 font-normal">Physical stock grouped by Reed Count, Dents/Inch & Vendor</span>
        </div>
        <div className="w-full overflow-hidden relative">
          <table className="w-full text-left border-collapse text-xs table-fixed">
            <thead className="bg-slate-900 text-white font-bold sticky top-0 z-20 shadow-sm">
              <tr className="border-b border-slate-700">
                <th className="py-2.5 px-2 text-center w-[3%]">#</th>
                <th className="py-2.5 px-2 w-[10%]">Reed Count</th>
                <th className="py-2.5 px-2 text-center w-[8%]">Dents / Inch</th>
                <th className="py-2.5 px-2 text-right w-[9%]">Total Dents</th>
                <th className="py-2.5 px-2 w-[16%]">Make / Vendor</th>
                <th className="py-2.5 px-2 w-[10%]">Location</th>
                <th className="py-2.5 px-2 text-center bg-blue-950/70 text-blue-200 w-[9%]">Available Qty</th>
                <th className="py-2.5 px-2 text-center bg-amber-950/70 text-amber-200 w-[8%]">Reserved Qty</th>
                <th className="py-2.5 px-2 text-center bg-purple-950/70 text-purple-200 w-[8%]">Running Qty</th>
                <th className="py-2.5 px-2 text-center bg-emerald-900 text-white font-black w-[9%]">Balance Qty</th>
                <th className="py-2.5 px-2 text-center w-[11%]">Status</th>
                <th className="py-2.5 px-2 text-center w-[5%]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredReeds.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center">
                    <div className="max-w-md mx-auto flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                      <Database className="w-12 h-12 text-slate-400 mb-3" />
                      <h3 className="text-base font-bold text-slate-800">No Reed Stock Records Found</h3>
                      <p className="text-xs text-slate-500 mt-1 text-center">
                        There are currently no reed count stock records matching your criteria. Add a new reed count stock or initialize sample inventory.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
                        <button
                          onClick={handleSeedSampleStock}
                          disabled={saving}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition-all"
                        >
                          {saving ? 'Seeding...' : 'Initialize Sample Stock'}
                        </button>
                        <button
                          onClick={() => {
                            setFormData(defaultForm);
                            setShowAddModal(true);
                          }}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-all"
                        >
                          <Plus className="w-4 h-4 inline mr-1" /> Add New Reed
                        </button>
                        <button
                          onClick={async () => { setIsRefreshing(true); await refreshData(); setTimeout(() => setIsRefreshing(false), 700); }}
                          className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg shadow-sm transition-all"
                        >
                          <RefreshCw className={`w-4 h-4 inline mr-1 ${isRefreshing ? 'animate-refresh-spin' : ''}`} /> Refresh
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredReeds.map((r, idx) => {
                  const avail = Number(r.available_qty !== undefined ? r.available_qty : (r.total_qty || 1));
                  const res = Number(r.reserved_qty || 0);
                  const run = Number(r.running_qty || 0);
                  const bal = r.balance_qty !== undefined ? r.balance_qty : (avail - res - run);

                  return (
                    <tr key={r.id || idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-2 text-center text-slate-400">{idx + 1}</td>
                      <td className="py-2 px-2 font-black text-slate-900 text-xs truncate">
                        {r.reed_count || '—'}
                      </td>
                      <td className="py-2 px-2 text-center font-bold text-slate-700">
                        {r.dents_per_inch || 44}
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-slate-700">
                        {r.total_dents ? r.total_dents.toLocaleString() : '2,950'}
                      </td>
                      <td className="py-2 px-2 font-semibold text-slate-800 break-words">
                        {r.make_vendor || r.vendor || r.reed_make || 'Premier'}
                      </td>
                      <td className="py-2 px-2 font-semibold text-slate-600 break-words">
                        {r.location || 'Rack A-01'}
                      </td>
                      <td className="py-2 px-2 text-center font-bold text-blue-700 bg-blue-50/50">
                        {avail}
                      </td>
                      <td className="py-2 px-2 text-center font-bold text-amber-700 bg-amber-50/50">
                        {res}
                      </td>
                      <td className="py-2 px-2 text-center font-bold text-purple-700 bg-purple-50/50">
                        {run}
                      </td>
                      <td className={`py-2 px-2 text-center font-black text-xs ${bal < 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100/60 text-emerald-800'}`}>
                        {bal}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {getStatusBadge(r)}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => openEditModal(r)}
                            className="p-1 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit Stock"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(r)}
                            className="p-1 rounded text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete Stock"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add New Reed */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-base flex items-center">
                <Plus className="w-5 h-5 mr-2 text-blue-400" /> Add New Reed Stock
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4 text-xs font-medium">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Reed Count *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 44/2"
                    value={formData.reed_count}
                    onChange={e => setFormData({ ...formData, reed_count: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Dents / Inch *</label>
                  <input
                    type="number"
                    required
                    placeholder="44"
                    value={formData.dents_per_inch}
                    onChange={e => setFormData({ ...formData, dents_per_inch: parseInt(e.target.value, 10) || 0 })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Total Dents *</label>
                  <input
                    type="number"
                    required
                    placeholder="2950"
                    value={formData.total_dents}
                    onChange={e => setFormData({ ...formData, total_dents: parseInt(e.target.value, 10) || 0 })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Make / Vendor *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Premier / VSM"
                    value={formData.vendor}
                    onChange={e => setFormData({ ...formData, vendor: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Stock Location *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rack A-01"
                    value={formData.location}
                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Available Qty (Physical Stock) *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={formData.available_qty}
                    onChange={e => setFormData({ ...formData, available_qty: parseInt(e.target.value, 10) || 1 })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Remarks</label>
                <input
                  type="text"
                  placeholder="Optional stock notes..."
                  value={formData.remarks}
                  onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md"
                >
                  {saving ? 'Saving...' : 'Save Reed Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Reed */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-base flex items-center">
                <Edit3 className="w-5 h-5 mr-2 text-blue-400" /> Edit Reed Stock Specification
              </h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="p-6 space-y-4 text-xs font-medium">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Reed Count *</label>
                  <input
                    type="text"
                    required
                    value={formData.reed_count}
                    onChange={e => setFormData({ ...formData, reed_count: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Dents / Inch *</label>
                  <input
                    type="number"
                    required
                    value={formData.dents_per_inch}
                    onChange={e => setFormData({ ...formData, dents_per_inch: parseInt(e.target.value, 10) || 0 })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Total Dents *</label>
                  <input
                    type="number"
                    required
                    value={formData.total_dents}
                    onChange={e => setFormData({ ...formData, total_dents: parseInt(e.target.value, 10) || 0 })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Make / Vendor *</label>
                  <input
                    type="text"
                    required
                    value={formData.vendor}
                    onChange={e => setFormData({ ...formData, vendor: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Stock Location *</label>
                  <input
                    type="text"
                    required
                    value={formData.location}
                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Available Qty (Physical Stock) *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={formData.available_qty}
                    onChange={e => setFormData({ ...formData, available_qty: parseInt(e.target.value, 10) || 1 })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Remarks</label>
                <input
                  type="text"
                  value={formData.remarks}
                  onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md"
                >
                  {saving ? 'Updating...' : 'Update Reed Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Excel Bulk Paste */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200">
            <div className="p-4 bg-emerald-800 text-white flex justify-between items-center">
              <h3 className="font-bold text-base flex items-center">
                <Download className="w-5 h-5 mr-2" /> Excel Bulk Paste (Reed Stock Master)
              </h3>
              <button onClick={() => setShowBulkModal(false)} className="text-emerald-200 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs font-medium">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-xs">
                <strong>Excel Column Order (Tab-Separated):</strong>
                <p className="mt-1 font-mono text-[11px] text-emerald-800">
                  Reed Count &nbsp;|&nbsp; Dents/Inch &nbsp;|&nbsp; Total Dents &nbsp;|&nbsp; Make/Vendor &nbsp;|&nbsp; Location &nbsp;|&nbsp; Available Qty &nbsp;|&nbsp; Remarks
                </p>
                <p className="mt-1 text-[11px] text-emerald-700">
                  Example: <code>44/2 &nbsp;\t&nbsp; 44 &nbsp;\t&nbsp; 2950 &nbsp;\t&nbsp; Premier &nbsp;\t&nbsp; Rack A-01 &nbsp;\t&nbsp; 4 &nbsp;\t&nbsp; Initial Stock</code>
                </p>
              </div>

              <textarea
                rows={8}
                value={bulkPasteText}
                onChange={e => setBulkPasteText(e.target.value)}
                placeholder="Paste rows copied directly from Excel (Ctrl + V)..."
                className="w-full p-3 border border-slate-300 rounded-xl outline-none font-mono text-xs focus:ring-2 focus:ring-emerald-500"
              />

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkSave}
                  disabled={saving || !bulkPasteText.trim()}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-md disabled:opacity-50"
                >
                  {saving ? 'Importing...' : 'Import Bulk Rows'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: ADD REED STOCK AGAINST ORDER (+) */}
      {showOrderStockModal && selectedOrderForStock && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="p-4 bg-blue-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-base flex items-center">
                <Plus className="w-5 h-5 mr-2" /> ADD REED STOCK AGAINST ORDER
              </h3>
              <button onClick={() => setShowOrderStockModal(false)} className="text-blue-200 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOrderStockSubmit} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">Order / IBPO No</div>
                  <div className="text-sm font-black text-blue-700 mt-0.5">{selectedOrderForStock.ibpo_no}</div>
                </div>
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">Required Reed Count</div>
                  <div className="text-sm font-black text-indigo-900 mt-0.5">{selectedOrderForStock.reedCount}</div>
                </div>
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">Required Qty</div>
                  <div className="text-sm font-black text-slate-900 mt-0.5">{selectedOrderForStock.requiredQty} Reeds</div>
                </div>
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">Current Shortage</div>
                  <div className="text-sm font-black text-amber-700 mt-0.5">{selectedOrderForStock.shortageQty} Reeds</div>
                </div>
              </div>

              <div>
                <label className="block text-slate-800 font-bold mb-1">Add Reed Qty (Physical Stock) *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={orderStockForm.add_qty}
                  onChange={e => setOrderStockForm({ ...orderStockForm, add_qty: parseInt(e.target.value, 10) || 1 })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-black text-base text-blue-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Vendor / Make</label>
                  <input
                    type="text"
                    value={orderStockForm.vendor}
                    onChange={e => setOrderStockForm({ ...orderStockForm, vendor: e.target.value })}
                    className="w-full p-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Stock Location</label>
                  <input
                    type="text"
                    value={orderStockForm.location}
                    onChange={e => setOrderStockForm({ ...orderStockForm, location: e.target.value })}
                    className="w-full p-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Remarks</label>
                <input
                  type="text"
                  value={orderStockForm.remarks}
                  onChange={e => setOrderStockForm({ ...orderStockForm, remarks: e.target.value })}
                  className="w-full p-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowOrderStockModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md disabled:opacity-50"
                >
                  {saving ? 'Saving Stock...' : 'SAVE STOCK'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
