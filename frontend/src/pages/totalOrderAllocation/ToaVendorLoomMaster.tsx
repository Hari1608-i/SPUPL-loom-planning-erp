import React, { useState, useEffect } from 'react';
import { 
  Building2, Plus, Edit, Trash2, RefreshCw, Layers, CheckCircle2, 
  AlertCircle, ShieldCheck, Factory, Gauge, X, Save
} from 'lucide-react';
import { API_BASE_URL } from '../../config';

export default function ToaVendorLoomMaster() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);

  // Dialogs
  const [showAddVendorModal, setShowAddVendorModal] = useState(false);
  const [showBulkLoomsModal, setShowBulkLoomsModal] = useState(false);

  // Vendor Form
  const [vendorForm, setVendorForm] = useState({
    vendor_name: '',
    vendor_code: '',
    contact_person: '',
    phone: '',
    email: '',
    total_declared_looms: '45',
    remarks: ''
  });

  // Bulk Looms Form
  const [bulkForm, setBulkForm] = useState({
    count: '45',
    prefix: 'V-',
    start_number: '1',
    loom_type: 'Rapier',
    width: '75 inch',
    frame_capacity: '16',
    max_weft_colours: '4',
    max_ppi: '90',
    avg_daily_prod: '150'
  });

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/vendors`);
      const json = await res.json();
      if (json.success) {
        setVendors(json.data || []);
        if (json.data.length > 0 && selectedVendorId === null) {
          setSelectedVendorId(json.data[0].id);
        }
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vendorForm)
      });
      const json = await res.json();
      if (json.success) {
        setNotification({ type: 'success', message: `Vendor "${vendorForm.vendor_name}" created successfully!` });
        setShowAddVendorModal(false);
        setVendorForm({
          vendor_name: '',
          vendor_code: '',
          contact_person: '',
          phone: '',
          email: '',
          total_declared_looms: '45',
          remarks: ''
        });
        fetchVendors();
      } else {
        setNotification({ type: 'error', message: json.error || 'Failed to create vendor' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  const handleBulkCreateLooms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendorId) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/vendors/${selectedVendorId}/looms/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bulkForm)
      });
      const json = await res.json();
      if (json.success) {
        setNotification({ type: 'success', message: `Bulk created ${json.data.createdCount} individual loom records successfully!` });
        setShowBulkLoomsModal(false);
        fetchVendors();
      } else {
        setNotification({ type: 'error', message: json.error || 'Failed to create looms' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  const activeVendor = vendors.find(v => v.id === selectedVendorId);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-0.5 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800 rounded-full text-[10px] font-black uppercase tracking-wider">
              Dedicated Vendor Master
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
            Vendor Loom Master & Capability Matrix
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage external partner facilities. Register vendor accounts and bulk create individual loom specifications.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddVendorModal(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            + New Vendor Account
          </button>
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

      {/* Main Vendor Split View */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Vendor List */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 space-y-3">
          <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider px-2">
            Registered Vendors ({vendors.length})
          </h3>

          <div className="space-y-2">
            {vendors.map(v => (
              <div
                key={v.id}
                onClick={() => setSelectedVendorId(v.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  selectedVendorId === v.id
                    ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700 shadow-sm'
                    : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-sm font-black text-slate-800 dark:text-white">{v.vendor_name}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">Code: {v.vendor_code || 'N/A'}</p>
                  </div>
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-md text-[10px] font-black">
                    {v.actual_looms_count} / {v.total_declared_looms} Looms
                  </span>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-200/50 dark:border-slate-700/50 text-[11px] text-slate-600 dark:text-slate-400 flex justify-between">
                  <span>Contact: {v.contact_person || 'N/A'}</span>
                  <span>{v.phone || ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Selected Vendor's Looms Matrix */}
        <div className="md:col-span-2 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-4">
          {activeVendor ? (
            <>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-700">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {activeVendor.vendor_name} — Looms Register
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Total Declared: {activeVendor.total_declared_looms} | Individually Configured: {activeVendor.actual_looms_count} Looms
                  </p>
                </div>

                <button
                  onClick={() => setShowBulkLoomsModal(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + Bulk Generate Looms (e.g. 45 Looms)
                </button>
              </div>

              {activeVendor.looms?.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                  <Factory className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-600">No loom records generated yet for this vendor.</p>
                  <p className="text-[11px] text-slate-400 mt-1">Use the button above to generate individual loom records in bulk.</p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-2.5">Loom ID</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5">Width</th>
                        <th className="p-2.5">Frames</th>
                        <th className="p-2.5">Weft Colours</th>
                        <th className="p-2.5">Max PPI</th>
                        <th className="p-2.5">Avg Daily MTR</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {activeVendor.looms.map((loom: any) => (
                        <tr key={loom.id} className="hover:bg-slate-50/50">
                          <td className="p-2.5 font-mono font-black text-purple-600 dark:text-purple-400">
                            {loom.loom_no}
                          </td>
                          <td className="p-2.5 text-slate-700 dark:text-slate-300">
                            {loom.loom_type}
                          </td>
                          <td className="p-2.5 font-bold">
                            {loom.width}
                          </td>
                          <td className="p-2.5">
                            {loom.frame_capacity} Frames
                          </td>
                          <td className="p-2.5">
                            {loom.max_weft_colours} Clr
                          </td>
                          <td className="p-2.5">
                            {loom.max_ppi}
                          </td>
                          <td className="p-2.5 font-bold text-slate-900 dark:text-white">
                            {loom.avg_daily_prod} M/D
                          </td>
                          <td className="p-2.5">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              {loom.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-slate-400 text-xs">
              Select a vendor on the left to inspect or configure their loom register.
            </div>
          )}
        </div>
      </div>

      {/* Modal: New Vendor Account */}
      {showAddVendorModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black text-slate-900 dark:text-white">Add New Vendor Facility</h3>
              <button onClick={() => setShowAddVendorModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateVendor} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Vendor Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sri Amman Weaving Mill"
                  value={vendorForm.vendor_name}
                  onChange={e => setVendorForm({ ...vendorForm, vendor_name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Vendor Code</label>
                  <input
                    type="text"
                    placeholder="e.g. V-SAW"
                    value={vendorForm.vendor_code}
                    onChange={e => setVendorForm({ ...vendorForm, vendor_code: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Declared Looms Count</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 45"
                    value={vendorForm.total_declared_looms}
                    onChange={e => setVendorForm({ ...vendorForm, total_declared_looms: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Contact Person</label>
                <input
                  type="text"
                  placeholder="e.g. Mr. Subramani"
                  value={vendorForm.contact_person}
                  onChange={e => setVendorForm({ ...vendorForm, contact_person: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Phone</label>
                  <input
                    type="text"
                    placeholder="Phone #"
                    value={vendorForm.phone}
                    onChange={e => setVendorForm({ ...vendorForm, phone: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="Email"
                    value={vendorForm.email}
                    onChange={e => setVendorForm({ ...vendorForm, email: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddVendorModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black shadow-md"
                >
                  Save Vendor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Bulk Create Looms */}
      {showBulkLoomsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Bulk Generate Vendor Looms</h3>
                <p className="text-xs text-slate-500">For vendor: {activeVendor?.vendor_name}</p>
              </div>
              <button onClick={() => setShowBulkLoomsModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBulkCreateLooms} className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Looms Count *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={bulkForm.count}
                    onChange={e => setBulkForm({ ...bulkForm, count: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-black"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Loom Prefix</label>
                  <input
                    type="text"
                    value={bulkForm.prefix}
                    onChange={e => setBulkForm({ ...bulkForm, prefix: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Start Number</label>
                  <input
                    type="number"
                    min="1"
                    value={bulkForm.start_number}
                    onChange={e => setBulkForm({ ...bulkForm, start_number: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Loom Type</label>
                  <select
                    value={bulkForm.loom_type}
                    onChange={e => setBulkForm({ ...bulkForm, loom_type: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold"
                  >
                    <option value="Rapier">Rapier</option>
                    <option value="Airjet">Airjet</option>
                    <option value="Projectile">Projectile</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Width / Reed Space</label>
                  <input
                    type="text"
                    value={bulkForm.width}
                    onChange={e => setBulkForm({ ...bulkForm, width: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Frame Capacity</label>
                  <input
                    type="number"
                    value={bulkForm.frame_capacity}
                    onChange={e => setBulkForm({ ...bulkForm, frame_capacity: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Daily Prod (MTR)</label>
                  <input
                    type="number"
                    value={bulkForm.avg_daily_prod}
                    onChange={e => setBulkForm({ ...bulkForm, avg_daily_prod: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-black text-purple-600"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl text-[11px] text-slate-500">
                Preview: Will generate records from <strong>{bulkForm.prefix}{String(bulkForm.start_number).padStart(2, '0')}</strong> to <strong>{bulkForm.prefix}{String(parseInt(bulkForm.start_number) + parseInt(bulkForm.count || '1') - 1).padStart(2, '0')}</strong>.
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowBulkLoomsModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-md"
                >
                  Generate {bulkForm.count} Looms
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
