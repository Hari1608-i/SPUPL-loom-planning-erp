import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Scissors, CheckCircle2, AlertCircle, Play, FileText, Search, Plus, RefreshCw } from 'lucide-react';

import { useAppContext } from '../context/AppProvider';
import { API_BASE_URL } from '../config';

interface SizingRequest {
  id: number;
  loom_no: number;
  design_no: string;
  target_date: string;
  status: string;
  priority: string;
  required_meter: number;
  actual_meter: number | null;
  vendor_name: string | null;
  set_no: string | null;
  beam_no: string | null;
  sizing_vendor: string | null;
  sizing_dc_no: string | null;
  sizing_machine: string | null;
  sizing_remarks: string | null;
  sizing_start_date: string | null;
  sizing_completion_date: string | null;
  beam_ready_date?: string | null;
  createdAt: string;
}

const statusProgressMap: Record<string, number> = {
  'PENDING': 10,
  'PLANNED': 25,
  'SIZING RUNNING': 60,
  'SIZING COMPLETED': 90,
  'BEAM READY': 100
};

const statusColorMap: Record<string, string> = {
  'PENDING': 'bg-gray-100 text-gray-700 border-gray-200',
  'PLANNED': 'bg-blue-100 text-blue-800 border-blue-200',
  'SIZING RUNNING': 'bg-orange-100 text-orange-800 border-orange-200',
  'SIZING COMPLETED': 'bg-amber-100 text-amber-800 border-amber-200',
  'BEAM READY': 'bg-emerald-100 text-emerald-800 border-emerald-200'
};

const priorityColorMap: Record<string, string> = {
  'Critical': 'bg-red-500',
  'High': 'bg-orange-500',
  'Medium': 'bg-yellow-500',
  'Low': 'bg-green-500'
};

export default function SizingDashboard() {
  const { designs, looms, refreshData } = useAppContext();
  const [requests, setRequests] = useState<SizingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [activeModal, setActiveModal] = useState<{ req: SizingRequest; action: string } | null>(null);
  const [modalForm, setModalForm] = useState<any>({});

  const fetchRequests = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sizing/requests`);
      const data = await res.json();
      setRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModal) return;

    const { req, action } = activeModal;

    if (action === 'BEAM READY') {
      try {
        const res = await fetch(`${API_BASE_URL}/api/sizing/requests/${req.id}/ready`, {
          method: 'POST'
        });
        if (res.ok) {
          setSuccessMsg(`Beam marked as READY! Stock generated and plan updated.`);
          await refreshData();
          fetchRequests();
          setActiveModal(null);
          setTimeout(() => setSuccessMsg(null), 5000);
        }
      } catch (e) {
        console.error(e);
      }
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/sizing/requests/${req.id}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: action,
          ...modalForm
        })
      });
      if (res.ok) {
        setSuccessMsg(`Job updated to ${action}.`);
        await refreshData();
        fetchRequests();
        setActiveModal(null);
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getNextStatus = (current: string) => {
    switch (current) {
      case 'PENDING': return 'SIZING RUNNING';
      case 'PLANNED': return 'SIZING RUNNING';
      case 'SIZING RUNNING': return 'SIZING COMPLETED';
      case 'SIZING COMPLETED': return 'BEAM READY';
      default: return null;
    }
  };

  const openActionModal = (req: SizingRequest, action: string) => {
    setActiveModal({ req, action });
    setModalForm({
      sizing_vendor: req.sizing_vendor || req.vendor_name || '',
      sizing_dc_no: req.sizing_dc_no || '',
      sizing_machine: req.sizing_machine || '',
      sizing_remarks: req.sizing_remarks || '',
      set_no: req.set_no || '',
      beam_no: req.beam_no || '',
      actual_meter: req.actual_meter || req.required_meter || ''
    });
  };

  const kpis = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'PENDING' || r.status === 'PLANNED').length,
    sizingRunning: requests.filter(r => r.status === 'SIZING RUNNING').length,
    ready: requests.filter(r => r.status === 'BEAM READY').length,
    critical: requests.filter(r => r.priority === 'Critical' && r.status !== 'BEAM READY').length
  };

  const filteredRequests = requests.filter(r =>
    r.design_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.loom_no.toString().includes(searchTerm) ||
    (r.beam_no && r.beam_no.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 flex flex-col h-full bg-slate-50/70 p-4">
      {/* HEADER */}
      <div className="flex justify-between items-center bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center tracking-tight">
            <Scissors className="w-6 h-6 mr-3 text-indigo-600" /> Sizing Readiness & Beam Stock Status
          </h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            Single Source of Truth for Sizing Readiness. Preparation notes are logged via <strong>REMARKS</strong>.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={async () => {
              setIsLoading(true);
              await refreshData();
              await fetchRequests();
              setIsLoading(false);
            }}
            className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md font-bold text-xs transition-all"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-refresh-spin' : ''}`} /> Refresh Sizing Data
          </button>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search Design No (e.g. SP26/620-23122), Loom..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-72 bg-slate-50"
            />
          </div>
        </div>
      </div>


      {/* KPIS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Sizing Requests', value: kpis.total, color: 'text-slate-800' },
          { label: 'Pending Sizing', value: kpis.pending, color: 'text-gray-600' },
          { label: 'Sizing Running', value: kpis.sizingRunning, color: 'text-orange-600' },
          { label: 'Beams Ready', value: kpis.ready, color: 'text-emerald-600' },
          { label: 'Critical Jobs', value: kpis.critical, color: 'text-red-600' },
        ].map((k, i) => (
          <div key={i} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center items-center">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 text-center">{k.label}</div>
            <div className={`text-2xl font-black ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-lg flex items-start shadow-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 mr-3 mt-0.5" />
          <div className="text-emerald-800 font-bold text-sm">{successMsg}</div>
        </div>
      )}

      {/* MAIN GRID */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
            <thead className="bg-slate-900 text-white font-bold sticky top-0 shadow-sm z-10">
              <tr className="border-b border-slate-700">
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Loom & Target</th>
                <th className="py-3 px-4">Design Specs</th>
                <th className="py-3 px-4">Req Meter</th>
                <th className="py-3 px-4">Target Date</th>
                <th className="py-3 px-4 min-w-[200px]">Sizing Readiness</th>
                <th className="py-3 px-4">Preparation Remarks</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={8} className="py-12 text-center text-slate-500 font-medium">Loading sizing requests...</td></tr>
              ) : filteredRequests.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-slate-500 font-medium">No active sizing requests found.</td></tr>
              ) : (
                filteredRequests.map(req => {
                  const design = designs.find(d => d.designNo === req.design_no);
                  const loom = looms.find(l => l.loomNo === req.loom_no);
                  const targetDate = new Date(req.target_date);
                  const isOverdue = targetDate < new Date() && req.status !== 'BEAM READY';
                  const progress = statusProgressMap[req.status] || 20;
                  const nextStatus = getNextStatus(req.status);

                  return (
                    <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 align-middle">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${priorityColorMap[req.priority] || 'bg-gray-400'}`}></div>
                          <span className="font-bold text-slate-700">{req.priority}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top">
                        <div className="font-black text-sm text-indigo-900">Loom {req.loom_no}</div>
                        <div className="text-[10px] text-slate-500">Unit {loom?.unit || '1'}</div>
                      </td>

                      <td className="py-3 px-4 align-top">
                        <div className="font-bold text-blue-700">{req.design_no}</div>
                        <div className="text-[10px] text-slate-500">
                          Ends: <span className="font-bold text-slate-700">{design?.totalEnds || '-'}</span> | Width: <span className="font-bold text-slate-700">{design?.reedSpace || '-'}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 align-middle font-bold text-slate-800 text-sm">
                        {req.required_meter} m
                      </td>

                      <td className="py-3 px-4 align-middle">
                        <div className={`font-bold ${isOverdue ? 'text-red-600' : 'text-slate-700'}`}>
                          {format(targetDate, 'dd-MM-yyyy')}
                        </div>
                        {isOverdue && <div className="text-[10px] font-bold text-red-500 uppercase">Overdue</div>}
                      </td>

                      <td className="py-3 px-4 align-middle">
                        <div className="mb-1 flex justify-between items-center font-bold text-[10px]">
                          <span className={`px-2 py-0.5 rounded border ${statusColorMap[req.status] || 'bg-gray-100 text-gray-700'}`}>{req.status}</span>
                          <span className="text-slate-600">{progress}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden flex">
                          <div className="h-full bg-indigo-600 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                        </div>
                      </td>

                      <td className="py-3 px-4 align-middle text-slate-600 italic">
                        {req.sizing_remarks || 'Priority sizing scheduled.'}
                      </td>

                      <td className="py-3 px-4 align-middle text-center">
                        {req.status === 'BEAM READY' ? (
                          <div className="bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-lg flex items-center justify-center text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Beam Ready
                          </div>
                        ) : nextStatus ? (
                          <button
                            onClick={() => openActionModal(req, nextStatus)}
                            className="w-full py-1.5 px-3 rounded-lg font-bold text-white shadow-sm flex items-center justify-center transition-colors text-xs bg-indigo-600 hover:bg-indigo-700"
                          >
                            <Play className="w-3.5 h-3.5 mr-1" /> Update Status
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ACTION MODAL */}
      {activeModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="bg-indigo-600 p-4">
              <h3 className="text-lg font-bold text-white flex items-center">
                <Play className="w-5 h-5 mr-2" /> Update Sizing Status: {activeModal.action}
              </h3>
              <p className="text-indigo-100 text-xs">Req #{activeModal.req.id} | Loom {activeModal.req.loom_no}</p>
            </div>

            <form onSubmit={handleAction} className="p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Sizing Vendor / Machine</label>
                <input
                  type="text"
                  value={modalForm.sizing_vendor}
                  onChange={e => setModalForm({ ...modalForm, sizing_vendor: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg outline-none"
                  placeholder="e.g. In-House Sizing 1"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Preparation Remarks</label>
                <textarea
                  value={modalForm.sizing_remarks}
                  onChange={e => setModalForm({ ...modalForm, sizing_remarks: e.target.value })}
                  rows={2}
                  className="w-full p-2 border border-slate-300 rounded-lg outline-none"
                  placeholder="Enter any preparation notes or priority remarks..."
                />
              </div>

              {activeModal.action === 'BEAM READY' && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                  <div>
                    <label className="font-bold text-slate-700">Generated Beam No</label>
                    <input
                      type="text"
                      value={modalForm.beam_no}
                      onChange={e => setModalForm({ ...modalForm, beam_no: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700">Actual Warped Meter</label>
                    <input
                      type="number"
                      value={modalForm.actual_meter}
                      onChange={e => setModalForm({ ...modalForm, actual_meter: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg outline-none"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setActiveModal(null)} className="flex-1 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200">Cancel</button>
                <button type="submit" className="flex-1 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-sm">Confirm Update</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
