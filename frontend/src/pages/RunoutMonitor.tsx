import React, { useState, useMemo, useEffect } from 'react';
import { formatBalanceDays, formatRunoutDate } from '../utils/calculations';

import { Activity, AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck, Clock, RefreshCw, Search, X, Scissors, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useAppContext } from '../context/AppProvider';
import { API_BASE_URL } from '../config';

export default function RunoutMonitor() {
  const { activeRuns, rawNextPlans, looms, designs, reeds, beams, orders, refreshData } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState<'LOOM' | 'DESIGN' | 'ALL'>('LOOM');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterDelay, setFilterDelay] = useState('ALL');
  const [confirmModalData, setConfirmModalData] = useState<any>(null);
  const [cutBeamModalData, setCutBeamModalData] = useState<any>(null);
  const [cutReasonText, setCutReasonText] = useState<string>('Mid-run warp cut / Beam change');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    refreshData();
  }, []);

  const handleConfirmCutBeam = async () => {
    if (!cutBeamModalData) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/production/cut-beam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loomNo: cutBeamModalData.loomNo,
          beamId: cutBeamModalData.beamId,
          beamNo: cutBeamModalData.beamNo,
          producedMeter: cutBeamModalData.producedMeter,
          cutReason: cutReasonText || 'Mid-run warp cut'
        })
      });

      const resData = await response.json();
      if (response.ok && resData.success) {
        alert(`✂️ Cut Beam Successful!\n\nBeam #${resData.cutBeamNo} returned to Beam Stock with ${Math.round(resData.remainingMeter)}m remaining balance as CUT BEAM.`);
        await refreshData();
        setCutBeamModalData(null);
        setCutReasonText('Mid-run warp cut / Beam change');
      } else {
        alert(resData.error || 'Failed to execute Cut Beam.');
      }
    } catch (e: any) {
      alert('Error executing Cut Beam: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshData();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const monitorData = useMemo(() => {
    const runs = Object.values(activeRuns).filter(
      run => run && run.designNo && run.designNo.trim() !== '' && run.designNo !== '—'
    );
    return runs
      .map(run => {
        const loom = looms.find(l => l.loomNo === run.loomNo);
        const design = designs.find(d => d.designNo === run.designNo);
        const plan = rawNextPlans.find(p => {
          if (p.loom_no !== run.loomNo) return false;
          if (p.status === 'CANCELLED' || p.status === 'COMPLETED') return false;
          if (p.confirmation_status === 'CANCELLED' || p.confirmation_status === 'COMPLETED') return false;
          if (p.readiness_status === 'RUNNING IN MAIN ENTRY') return false;
          const nextD = (p.next_design || '').trim();
          if (!nextD) return false;
          if (nextD.toLowerCase() === (run.designNo || '').trim().toLowerCase()) return false;
          return true;
        });
        const nextDesignNo = plan ? (plan.next_design || '').trim() : '';
        const nextDesign = nextDesignNo ? designs.find(d => d.designNo === nextDesignNo) : null;

        // AppProvider already computed the correct runout via getMainEntryLoomRun with full production logs.
        // Read those pre-calculated fields directly — no double-calculation.
        const calcProducedMeter = run.producedMeter ?? 0;
        const calcNetBalanceMeter = run.netBalanceMeter ?? 0;
        const calcBalanceDays = run.balanceDays ?? 999999;
        const calcExpectedRunoutDate = run.expectedRunoutDate instanceof Date
          ? run.expectedRunoutDate
          : new Date(run.expectedRunoutDate ?? new Date());

        // Next Reed & Beam check
        const reqReedCount = nextDesign ? String(nextDesign.reedCount) : '';
        const matchingReed = reqReedCount ? reeds.find(r => r.reed_count === reqReedCount && (r.status === 'Available' || r.available_qty > 0)) : null;
        const matchingBeam = nextDesignNo ? beams.find(b => b.design_no === nextDesignNo && (b.status === 'Available' || b.available_meter > 0)) : null;

        const reedStatus = nextDesignNo ? (matchingReed ? 'AVAILABLE' : (plan && plan.reserved_reed_no ? 'RESERVED' : 'REQUIRED')) : '—';
        const beamStatus = nextDesignNo ? (matchingBeam ? 'READY' : (plan && plan.reserved_beam_no ? 'RESERVED' : 'REQUIRED')) : '—';
        const sizingStatus = nextDesignNo ? (matchingBeam ? 'COMPLETED' : 'RUNNING') : '—';

        const expectedStart = calcExpectedRunoutDate;
        const expectedFinish = new Date(expectedStart.getTime() + 10 * 24 * 60 * 60 * 1000);
        const delayStatus = calcBalanceDays <= 2 ? 'URGENT' : (calcBalanceDays <= 6 ? 'HIGH PRIORITY' : 'ON TIME');

        let actionStatus = 'SAFE';
        let actionColor = 'text-green-700 bg-green-50 border-green-200';

        if (plan && plan.status === 'CONFIRMED') {
          actionStatus = 'CONFIRMED & READY';
          actionColor = 'text-blue-700 bg-blue-50 border-blue-200 font-bold';
        } else if (calcBalanceDays <= 2) {
          actionStatus = 'URGENT PLAN (<= 2 Days)';
          actionColor = 'text-red-800 bg-red-100 font-black border-red-300 animate-pulse';
        } else if (calcBalanceDays <= 6) {
          actionStatus = 'ALERT: SIZING & REED (<= 6 Days)';
          actionColor = 'text-amber-800 bg-amber-100 font-bold border-amber-300';
        } else if (calcBalanceDays <= 15) {
          actionStatus = 'NEXT PLAN REQUIRED';
          actionColor = 'text-orange-700 bg-orange-50 font-bold border-orange-200';
        }

        // Runout condition satisfied
        const isRunoutReady = (run.warpedMeter > 0 && calcProducedMeter >= run.warpedMeter) || calcBalanceDays <= 0 || calcNetBalanceMeter <= 0;

        return {
          loomNo: run.loomNo,
          currentDesign: run.designNo,
          loomStartDate: run.loomStartDate || (run as any).loom_start_date || (run as any).startDate || null,
          beamId: run.beamId || (run as any).beam_id,
          beamNo: (run as any).beamNo || (run as any).current_beam_no || (run as any).currentBeamNo || '—',
          setNo: (run as any).setNo || (run as any).set_no || '—',
          orderNo: (run as any).orderNo || (run as any).order_no || (run as any).customer_name || '',
          producedMeter: calcProducedMeter,
          warpedMeter: Number(run.warpedMeter) || 0,
          netBalanceMeter: calcNetBalanceMeter,
          balanceDays: calcBalanceDays,
          expectedRunoutDate: calcExpectedRunoutDate,
          nextDesign: nextDesignNo || '—',
          nextLoom: run.loomNo,
          requiredReed: reqReedCount || '—',
          reedStatus,
          requiredBeam: nextDesign ? (nextDesign.beamType || 'Standard') : '—',
          beamStatus,
          sizingStatus,
          expectedStart,
          expectedFinish,
          delayStatus,
          actionStatus,
          actionColor,
          plan,
          isRunoutReady
        };
      })
      .sort((a, b) => a.expectedRunoutDate.getTime() - b.expectedRunoutDate.getTime());
  }, [activeRuns, looms, designs, rawNextPlans, reeds, beams]);

  const filteredData = useMemo(() => {
    const raw = (searchTerm || '').trim();
    const q = raw.toLowerCase();

    const list = monitorData.filter(d => {
      // 1. Status Filter Check
      if (filterDelay === 'URGENT' && d.delayStatus !== 'URGENT') return false;
      if (filterDelay === 'HIGH PRIORITY' && d.delayStatus !== 'HIGH PRIORITY') return false;
      if (filterDelay === 'ON TIME' && d.delayStatus !== 'ON TIME') return false;

      if (!q) return true;

      // 2. Search Type Filtering
      if (searchType === 'LOOM') {
        const parts = q.split(/[, ]+/).map(p => p.replace(/^loom\s*|^l-?\s*/i, '').trim()).filter(Boolean);
        if (parts.length === 0) return true;
        const loomStr = d.loomNo.toString().toLowerCase();
        return parts.some(p => loomStr === p || loomStr.startsWith(p) || loomStr.includes(p));
      }

      if (searchType === 'DESIGN') {
        return (
          (d.currentDesign && d.currentDesign.toLowerCase().includes(q)) ||
          (d.nextDesign && d.nextDesign.toLowerCase().includes(q))
        );
      }

      // searchType === 'ALL'
      const cleanLoom = q.replace(/^loom\s*|^l-?\s*/i, '').trim();
      const matchLoom = cleanLoom ? (d.loomNo.toString().toLowerCase() === cleanLoom || d.loomNo.toString().toLowerCase().includes(cleanLoom)) : false;

      return (
        matchLoom ||
        d.loomNo.toString().includes(q) ||
        (d.currentDesign && d.currentDesign.toLowerCase().includes(q)) ||
        (d.nextDesign && d.nextDesign.toLowerCase().includes(q)) ||
        (d.beamNo && d.beamNo.toString().toLowerCase().includes(q)) ||
        (d.setNo && d.setNo.toString().toLowerCase().includes(q)) ||
        (d.orderNo && d.orderNo.toString().toLowerCase().includes(q)) ||
        (d.requiredReed && d.requiredReed.toString().toLowerCase().includes(q)) ||
        (d.delayStatus && d.delayStatus.toLowerCase().includes(q)) ||
        (d.actionStatus && d.actionStatus.toLowerCase().includes(q))
      );
    });

    if (q && searchType === 'LOOM') {
      const clean = q.replace(/^loom\s*|^l-?\s*/i, '').trim();
      if (clean) {
        return [...list].sort((a, b) => {
          const aExact = a.loomNo.toString().toLowerCase() === clean ? 1 : 0;
          const bExact = b.loomNo.toString().toLowerCase() === clean ? 1 : 0;
          if (aExact !== bExact) return bExact - aExact;
          return a.expectedRunoutDate.getTime() - b.expectedRunoutDate.getTime();
        });
      }
    }

    return list;
  }, [monitorData, searchTerm, searchType, filterDelay]);

  const criticalCount = monitorData.filter(d => d.balanceDays <= 2).length;
  const alertCount = monitorData.filter(d => d.balanceDays > 2 && d.balanceDays <= 6).length;
  const readyCount = monitorData.filter(d => d.plan && d.plan.status === 'CONFIRMED').length;

  const handleConfirmRunout = async (promoteNext: boolean = false) => {
    if (!confirmModalData) return;
    setIsSubmitting(true);
    try {
      const shouldPromote = promoteNext && confirmModalData.nextDesign && confirmModalData.nextDesign !== '—';
      const response = await fetch(`${API_BASE_URL}/api/confirm-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loomNo: confirmModalData.loomNo,
          currentDesign: confirmModalData.currentDesign,
          producedMeter: confirmModalData.producedMeter,
          warpedMeter: confirmModalData.warpedMeter,
          nextDesign: shouldPromote ? confirmModalData.nextDesign : '',
          clearOnly: !shouldPromote,
          promoteNext: shouldPromote,
          startDate: format(new Date(), 'yyyy-MM-dd'),
          warpMeter: confirmModalData.plan?.planned_warp_meter || 1800,
          dailyProduction: 0,
          beamNo: confirmModalData.plan?.reserved_beam_no,
          setNo: confirmModalData.plan?.reserved_set_no,
          beamId: confirmModalData.plan?.reserved_beam_id
        })
      });

      if (response.ok) {
        await refreshData();
        setConfirmModalData(null);
      } else {
        const errData = await response.json().catch(() => ({}));
        alert(errData?.error || 'Failed to confirm runout. Please try again.');
      }
    } catch (e) {
      console.error('Failed to confirm runout:', e);
      alert('Error connecting to backend server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOneClickDelete = async (row: any) => {
    if (!row) return;
    const confirmDelete = window.confirm(
      `🗑️ ONE-CLICK DELETE RUNOUT\n\nLoom: Loom ${row.loomNo}\nDesign: ${row.currentDesign}\nProduced: ${Math.round(row.producedMeter)} M\n\nThis will archive current production to Completed History and remove this runout from active running (frees Loom ${row.loomNo} to Available).\n\nDo you want to delete and clear this runout?`
    );
    if (!confirmDelete) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/confirm-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loomNo: row.loomNo,
          currentDesign: row.currentDesign,
          producedMeter: row.producedMeter,
          warpedMeter: row.warpedMeter,
          nextDesign: '',
          clearOnly: true,
          promoteNext: false,
          startDate: format(new Date(), 'yyyy-MM-dd')
        })
      });

      if (response.ok) {
        await refreshData();
      } else {
        const errData = await response.json().catch(() => ({}));
        alert(errData?.error || 'Failed to delete runout. Please try again.');
      }
    } catch (e: any) {
      console.error('Failed to delete runout:', e);
      alert('Error deleting runout: ' + (e?.message || 'Server error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-full bg-slate-50/70 p-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center tracking-tight">
            <Activity className="w-6 h-6 mr-3 text-red-600" /> Runout Monitor & Requirements Confirmation Sheet
          </h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            Search by Loom No / Design No & Confirm Loom Plans: <strong>Loom → Current Design → Runout → Next Design → Reed → Beam → Sizing</strong>
          </p>
        </div>

        <button
          onClick={handleRefresh}
          className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md font-bold text-xs transition-all"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} /> {isRefreshing ? 'Refreshing...' : 'Refresh Requirements Data'}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-red-600 uppercase">Urgent Runout (≤ 2 Days)</div>
            <div className="text-2xl font-black text-red-700 mt-1">{criticalCount} Looms</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-bold">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-amber-600 uppercase">Next Plan Alerts (≤ 6 Days)</div>
            <div className="text-2xl font-black text-amber-700 mt-1">{alertCount} Looms</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-emerald-600 uppercase">Confirmed Plans</div>
            <div className="text-2xl font-black text-emerald-700 mt-1">{readyCount} Looms</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-blue-600 uppercase">Active Running Looms</div>
            <div className="text-2xl font-black text-blue-900 mt-1">{monitorData.length} Looms</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Activity className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Design & Loom Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4 text-xs">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-slate-500 uppercase">Filter Status:</span>
          {['ALL', 'URGENT', 'HIGH PRIORITY', 'ON TIME'].map(st => (
            <button
              key={st}
              onClick={() => setFilterDelay(st)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                filterDelay === st ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center space-x-1.5">
            <span className="font-bold text-slate-500 uppercase text-[11px]">Search Type:</span>
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as 'LOOM' | 'DESIGN' | 'ALL')}
              className="px-2.5 py-1.5 border border-slate-300 rounded-xl outline-none font-bold text-indigo-950 bg-white text-xs focus:ring-2 focus:ring-indigo-500 shadow-sm cursor-pointer"
            >
              <option value="LOOM">Loom No</option>
              <option value="DESIGN">Design No</option>
              <option value="ALL">All Fields</option>
            </select>
          </div>

          <div className="relative w-64 sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder={
                searchType === 'LOOM'
                  ? 'Search Loom No (e.g. 20, 107)...'
                  : searchType === 'DESIGN'
                  ? 'Search Design No (e.g. SP26/620)...'
                  : 'Search Loom, Design, Beam...'
              }
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-xl outline-none font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                title="Clear Search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Full 15-Column Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto custom-scrollbar flex-1">
          <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
            <thead className="bg-slate-900 text-white font-bold sticky top-0 z-20 shadow-sm">
              <tr className="border-b border-slate-700">
                <th className="py-3 px-3">Loom</th>
                <th className="py-3 px-3">Current Design</th>
                <th className="py-3 px-3 text-center bg-slate-800 border-x border-slate-700 font-black text-amber-300">LOOM ACTION CONTROLS</th>
                <th className="py-3 px-3 text-center">Start Date</th>
                <th className="py-3 px-3 text-right">Warp Length</th>
                <th className="py-3 px-3 text-right text-emerald-300">Production Mtr</th>
                <th className="py-3 px-3 text-right text-indigo-300">Bal Mtr</th>
                <th className="py-3 px-3 text-right text-amber-300">Expected Runout</th>
                <th className="py-3 px-3">Next Design</th>
                <th className="py-3 px-3 text-center">Next Loom</th>
                <th className="py-3 px-3 text-center">Required Reed</th>
                <th className="py-3 px-3 text-center">Reed Status</th>
                <th className="py-3 px-3 text-center">Required Beam</th>
                <th className="py-3 px-3 text-center">Beam Status</th>
                <th className="py-3 px-3 text-center">Sizing Status</th>
                <th className="py-3 px-3 text-center">Expected Start</th>
                <th className="py-3 px-3 text-center">Expected Finish</th>
                <th className="py-3 px-3 text-center">Delay Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={18} className="py-12 text-center text-slate-400 font-bold">
                    No matching {searchType === 'LOOM' ? 'looms' : searchType === 'DESIGN' ? 'designs' : 'records'} found for "{searchTerm}".
                  </td>
                </tr>
              ) : (
                filteredData.map(r => (
                  <tr key={r.loomNo} className="hover:bg-indigo-50/50 transition-colors group">
                    <td className="py-2.5 px-3 font-black text-indigo-900 bg-indigo-50/30">Loom {r.loomNo}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-800">{r.currentDesign}</td>

                    {/* ALWAYS VISIBLE ACTION CONTROLS IN COLUMN 3 */}
                    <td className="py-2.5 px-3 text-center bg-amber-50/40 border-x border-amber-200/60">
                      <div className="flex items-center justify-center space-x-1.5">
                        {/* CUT BEAM BUTTON */}
                        <button
                          onClick={() => {
                            setCutBeamModalData(r);
                            setCutReasonText('Mid-run warp cut / Beam change');
                          }}
                          title="Cut running warp beam and return remaining meters to Beam Stock with /CUT, /CUT-2, /CUT-3 suffix"
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-black text-[11px] inline-flex items-center gap-1 shadow-md transition-all cursor-pointer whitespace-nowrap active:scale-95"
                        >
                          <Scissors className="w-3.5 h-3.5" />
                          <span>CUT BEAM</span>
                        </button>

                        {/* CONFIRM RUNOUT BUTTON */}
                        <button
                          onClick={() => setConfirmModalData(r)}
                          title="Confirm runout and complete current design session"
                          className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-black text-[11px] inline-flex items-center gap-1 shadow-md transition-all cursor-pointer whitespace-nowrap active:scale-95"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>CONFIRM RUNOUT</span>
                        </button>

                        {/* ONE-CLICK DELETE BUTTON */}
                        <button
                          onClick={() => handleOneClickDelete(r)}
                          title="One-Click Delete: Archive and completely clear this runout from loom"
                          className="px-2.5 py-1 bg-rose-700 hover:bg-rose-800 text-white rounded-lg font-black text-[11px] inline-flex items-center gap-1 shadow-md transition-all cursor-pointer whitespace-nowrap active:scale-95"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>DELETE RUN</span>
                        </button>
                      </div>
                    </td>

                    {/* Start Date */}
                    <td className="py-2.5 px-3 text-center font-mono font-medium text-slate-700">
                      {formatRunoutDate(r.loomStartDate)}
                    </td>

                    {/* Warp Length */}
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                      {r.warpedMeter > 0 ? `${Math.round(r.warpedMeter).toLocaleString()} M` : '—'}
                    </td>

                    {/* Production Mtr */}
                    <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700">
                      {r.producedMeter > 0 ? `${Math.round(r.producedMeter).toLocaleString()} M` : '0 M'}
                    </td>

                    {/* Bal Mtr */}
                    <td className="py-2.5 px-3 text-right font-mono font-black text-indigo-900">
                      {Math.round(r.netBalanceMeter).toLocaleString()} M
                    </td>

                    {/* Expected Runout */}
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-red-700">
                      <div>{formatRunoutDate(r.expectedRunoutDate)}</div>
                      <div className="text-[10px] text-red-600 font-extrabold">{r.balanceDays > 999 ? 'Pending' : formatBalanceDays(r.balanceDays)}</div>
                    </td>

                    <td className="py-2.5 px-3 font-bold text-indigo-800">{r.nextDesign}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-700">{r.nextLoom}</td>
                    <td className="py-2.5 px-3 text-center font-medium text-slate-700">{r.requiredReed}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        r.reedStatus === 'AVAILABLE' || r.reedStatus === 'RESERVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : (r.reedStatus === '—' ? 'bg-slate-100 text-slate-400' : 'bg-red-100 text-red-800')
                      }`}>
                        {r.reedStatus}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-medium text-slate-700">{r.requiredBeam}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        r.beamStatus === 'READY' || r.beamStatus === 'RESERVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : (r.beamStatus === '—' ? 'bg-slate-100 text-slate-400' : 'bg-purple-100 text-purple-800')
                      }`}>
                        {r.beamStatus}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-semibold text-slate-800">{r.sizingStatus}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-700">{formatRunoutDate(r.expectedStart)}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-700">{formatRunoutDate(r.expectedFinish)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        r.delayStatus === 'ON TIME' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {r.delayStatus}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CUT BEAM CONFIRMATION MODAL */}
      {cutBeamModalData && (() => {
        const warped = Number(cutBeamModalData.warpedMeter || 0);
        const produced = Number(cutBeamModalData.producedMeter || 0);
        const remaining = Math.max(0, warped - produced);

        const getCutNamePreview = (name: string) => {
          if (!name || name === '—') return 'BEAM/CUT';
          let str = String(name).trim();
          const match = str.match(/\/CUT(?:-(\d+))?$/i);
          if (!match) return `${str}/CUT`;
          const count = match[1] ? parseInt(match[1], 10) + 1 : 2;
          return str.replace(/\/CUT(?:-\d+)?$/i, `/CUT-${count}`);
        };

        const currentBeamName = cutBeamModalData.beamNo || '12177/SPZ/12585/26';
        const newCutBeamName = getCutNamePreview(currentBeamName);

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5 text-amber-600">
                  <Scissors className="w-5 h-5" />
                  <h3 className="text-base font-black tracking-tight text-slate-900">Cut Beam & Return to Stock</h3>
                </div>
                <button 
                  onClick={() => setCutBeamModalData(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg font-bold"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 bg-amber-50/70 rounded-xl space-y-2 text-xs text-amber-900 font-medium border border-amber-200">
                <div className="flex justify-between">
                  <span className="font-bold text-amber-700">Loom No:</span>
                  <span className="font-black text-amber-950">Loom {cutBeamModalData.loomNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-amber-700">Current Design:</span>
                  <span className="font-bold text-amber-900">{cutBeamModalData.currentDesign}</span>
                </div>
                <div className="flex justify-between border-t border-amber-200/60 pt-2">
                  <span className="font-bold text-amber-700">Running Beam No:</span>
                  <span className="font-bold text-slate-800">{currentBeamName}</span>
                </div>
                <div className="flex justify-between font-black text-amber-900 bg-amber-200/60 p-1.5 rounded">
                  <span>New Cut Beam No:</span>
                  <span className="text-amber-950 font-black">{newCutBeamName}</span>
                </div>
                <div className="flex justify-between border-t border-amber-200/60 pt-2">
                  <span className="font-bold text-amber-700">Initial Warped Meter:</span>
                  <span className="font-bold text-slate-900">{warped} M</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-amber-700">Woven Production So Far:</span>
                  <span className="font-bold text-purple-900">{produced} M</span>
                </div>
                <div className="flex justify-between border-t border-amber-300 pt-2 mt-2 bg-amber-100/80 p-2 rounded-lg">
                  <span className="font-black text-amber-950">Remaining Meter (CUT BEAM):</span>
                  <span className="font-black text-emerald-700 text-sm">{remaining} M</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason / Remarks for Beam Cut</label>
                <input
                  type="text"
                  value={cutReasonText}
                  onChange={e => setCutReasonText(e.target.value)}
                  placeholder="e.g. Mid-run warp cut / Beam change"
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Clicking <strong>CONFIRM CUT BEAM</strong> will remove this warp beam from Loom {cutBeamModalData.loomNo}, rename the beam to <strong className="text-amber-800">{newCutBeamName}</strong>, calculate the remaining <strong>{remaining} M</strong> balance, and return it to <strong>Beam Stock Master</strong> as <strong className="text-amber-700">CUT BEAM</strong> so it can be re-allocated to any loom.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setCutBeamModalData(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleConfirmCutBeam}
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5"
                >
                  <Scissors className="w-4 h-4" />
                  <span>{isSubmitting ? 'Processing...' : 'CONFIRM CUT BEAM'}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Safety Runout Confirmation Dialog */}
      {confirmModalData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-base font-black tracking-tight text-slate-900">Confirm Loom Runout</h3>
              </div>
              <button 
                onClick={() => setConfirmModalData(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl space-y-2 text-xs text-slate-700 font-medium border border-slate-200">
              <div className="flex justify-between">
                <span className="font-bold text-slate-500">Loom No:</span>
                <span className="font-black text-indigo-900">Loom {confirmModalData.loomNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-500">Current Design:</span>
                <span className="font-bold text-slate-800">{confirmModalData.currentDesign}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-500">Expected Runout:</span>
                <span className="font-bold text-red-700">{formatRunoutDate(confirmModalData.expectedRunoutDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-500">Net Balance:</span>
                <span className="font-bold text-red-600">{Math.round(confirmModalData.netBalanceMeter)} M</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 mt-2">
                <span className="font-bold text-slate-500">Promoted Next Design:</span>
                <span className="font-black text-emerald-700">{confirmModalData.nextDesign !== '—' ? confirmModalData.nextDesign : 'None (Awaiting Next Plan)'}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Confirming runout will close the current design session, archive its complete production history to Completed History, mark the warp beam completed, and clear the loom to Available.
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmModalData(null)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                CANCEL
              </button>

              {/* COMPLETE & CLEAR RUNOUT (Default: clears the loom, never shows full warp again) */}
              <button
                onClick={() => handleConfirmRunout(false)}
                disabled={isSubmitting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                title="Archive production to Completed History and clear this loom to Available"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Processing...' : 'COMPLETE & CLEAR RUNOUT'}</span>
              </button>

              {/* PROMOTE NEXT PLAN (Only if planner specifically wants to load next plan immediately) */}
              {confirmModalData.nextDesign && confirmModalData.nextDesign !== '—' && (
                <button
                  onClick={() => handleConfirmRunout(true)}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title={`Start new session for next planned design: ${confirmModalData.nextDesign}`}
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>{isSubmitting ? 'Processing...' : `PROMOTE ${confirmModalData.nextDesign}`}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
