import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, Search, Plus, Download, Trash2, Save, Printer,
  Calendar, CheckCircle2, AlertCircle, RefreshCw, Copy, Layers, Filter, CheckCircle, AlertTriangle, Eye, X, Edit2
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { API_BASE_URL } from '../config';
import * as XLSX from 'xlsx';
import { CompanyPrintHeader } from '../components/common/CompanyPrintHeader';
import { useAppContext } from '../context/AppProvider';
import { triggerPrint } from '../utils/printManager';

export interface BeamRowState {
  id: string | number;
  date: string;
  design_no: string;
  vendor_name: string;
  party_beam_no: string;
  set_no: string;
  beam_no: string;
  beam_type: string;
  beam_dia: string | number;
  beam_width: string | number;
  total_ends: string | number;
  warp_meter: string | number;
  age_of_beam: string | number;
  location: string;
  beam_status: string;
  remarks: string;
  loom_no_assigned?: number | null;
  reserved_for?: string | null;
}

const FIELDS_ORDER: (keyof BeamRowState)[] = [
  'date', 'design_no', 'vendor_name', 'party_beam_no', 'set_no', 'beam_no', 
  'beam_type', 'beam_dia', 'beam_width', 'total_ends', 'warp_meter', 
  'age_of_beam', 'location', 'beam_status', 'remarks'
];

const BEAM_STATUSES = [
  'Available', 'ALLOCATED', 'RUNNING', 'RESERVED', 'READY', 'UNDER PREPARATION', 'COMPLETED', 'EMPTY', 'SCRAP'
];

export default function BeamStock() {
  const { orders, designs, looms, beams, rawNextPlans, activeRuns, refreshData } = useAppContext();

  const [rows, setRows] = useState<BeamRowState[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [dbBeamCount, setDbBeamCount] = useState(0);

  // Requirement Panel Filter State
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [orderReqSearchTerm, setOrderReqSearchTerm] = useState('');

  // Manual Warp Override Map (ibpo -> manualValue)
  const [manualWarpOverrides, setManualWarpOverrides] = useState<Record<string, number>>({});
  const [editingWarpModal, setEditingWarpModal] = useState<{ ibpo: string; calculated: number; current: number } | null>(null);
  const [tempManualWarpVal, setTempManualWarpVal] = useState<string>('');

  // Quick Action Modal State
  const [quickAddOrderModal, setQuickAddOrderModal] = useState<any | null>(null);
  const [quickForm, setQuickForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    vendor_name: '',
    party_beam_no: '',
    set_no: '',
    beam_no: '',
    beam_type: 'Standard',
    beam_dia: '800',
    beam_width: '',
    total_ends: '',
    warp_meter: '',
    location: 'At Sizing',
    remarks: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/beam-stock`);
      if (!res.ok) throw new Error('Failed to fetch beam stock');
      const data = await res.json();
      
      setDbBeamCount(data.length);

      if (Array.isArray(data) && data.length > 0) {
        const mapped: BeamRowState[] = data.map((b: any, idx: number) => {
          let formattedDate = format(new Date(), 'yyyy-MM-dd');
          try {
            if (b.date) formattedDate = format(new Date(b.date), 'yyyy-MM-dd');
          } catch(e) {}

          const ageDays = formattedDate ? differenceInDays(new Date(), new Date(formattedDate)) : 0;

          const designNoVal = b.design_no || 
            orders.find(o => o.ibpo_no === b.party_beam_no || o.order_no === b.party_beam_no || (b.remarks && b.remarks.includes(o.ibpo_no)))?.design_no_sp_no || 
            '';

          let derivedStatus = b.status || 'Available';
          if (b.loom_no_assigned || b.reserved_for) {
            const norm = (derivedStatus || '').trim().toUpperCase();
            if (norm === 'AVAILABLE' || norm === 'READY' || !norm) {
              derivedStatus = 'ALLOCATED';
            }
          }

          return {
            id: b.id || `existing-${idx}`,
            date: formattedDate,
            design_no: designNoVal,
            vendor_name: b.vendor_name || b.party || '',
            party_beam_no: b.party_beam_no || b.vendor_beam_no || '',
            set_no: b.set_no || b.warping_batch_no || '',
            beam_no: b.beam_no || '',
            beam_type: b.beam_type || '',
            beam_dia: b.beam_dia !== null && b.beam_dia !== undefined ? b.beam_dia : '',
            beam_width: b.beam_width !== null && b.beam_width !== undefined ? b.beam_width : '',
            total_ends: b.ends !== null && b.ends !== undefined ? b.ends : '',
            warp_meter: b.total_warped_meter !== null && b.total_warped_meter !== undefined ? b.total_warped_meter : (b.available_meter || ''),
            age_of_beam: ageDays >= 0 ? ageDays : 0,
            location: b.location || '',
            beam_status: derivedStatus,
            remarks: b.remarks || '',
            loom_no_assigned: b.loom_no_assigned || null,
            reserved_for: b.reserved_for || null
          };
        });
        setRows(mapped);
      } else {
        // Initialize 15 blank rows ready for Excel copy-paste
        const emptyRows: BeamRowState[] = Array.from({ length: 15 }).map((_, idx) => ({
          id: `blank-${idx}`,
          date: format(new Date(), 'yyyy-MM-dd'),
          design_no: '',
          vendor_name: '',
          party_beam_no: '',
          set_no: '',
          beam_no: '',
          beam_type: '',
          beam_dia: '',
          beam_width: '',
          total_ends: '',
          warp_meter: '',
          age_of_beam: 0,
          location: '',
          beam_status: 'Available',
          remarks: ''
        }));
        setRows(emptyRows);
      }
    } catch (err: any) {
      console.error('Error loading beam stock:', err);
    }
  };

  // Order-Wise Beam Requirement Summaries (SSOT — 13 Required Columns)
  const activeOrderRequirements = useMemo(() => {
    // Helper: normalize status string for case-insensitive comparison
    const normStatus = (s: string) => (s || '').trim().toUpperCase();

    // Collect all running beam numbers from Main Entry (activeRuns)
    const runningBeamNos = new Set<string>();
    Object.values(activeRuns || {}).forEach((r: any) => {
      const rBeamNo = (r.currentBeamNo || r.beam_no || '').trim().toUpperCase();
      if (rBeamNo && rBeamNo !== 'NOT ALLOCATED' && rBeamNo !== '—') {
        runningBeamNos.add(rBeamNo);
      }
    });

    // Collect all plan allocated beam numbers from rawNextPlans
    const planAllocatedBeamNos = new Set<string>();
    (rawNextPlans || []).forEach((p: any) => {
      const pBeamNo = (p.reserved_beam_no || '').trim().toUpperCase();
      if (pBeamNo && p.status !== 'CANCELLED' && p.status !== 'COMPLETED') {
        planAllocatedBeamNos.add(pBeamNo);
      }
    });

    return orders
      .filter(o => {
        const st = (o.status || '').toUpperCase();
        const compSt = (o.order_completion_status || '').toUpperCase();
        return st !== 'ORDER COMPLETED' && st !== 'COMPLETED' && compSt !== 'COMPLETED';
      })
      .map(ord => {
        const ibpo = ord.ibpo_no || ord.order_no || '—';
        const designNo = ord.design_no_sp_no || ibpo;
        const matchedDesign = designs.find(d => (d.design_no_sp_no || d.designNo) === designNo);

        // Required beams = planned loom count (minimum 0 — only non-zero if planning exists)
        const requiredBeams = Math.max(0, Number(ord.planned_loom_count) || 0);
        const orderMtr = Number(ord.order_qty) || Number(ord.warp_qty) || 0;

        // Warp Meter from order field
        const calculatedWarpMtr = Number(ord.warp_qty) || orderMtr;
        const manualWarpMtr = manualWarpOverrides[ibpo];
        const finalWarpMtr = manualWarpMtr && manualWarpMtr > 0 ? manualWarpMtr : calculatedWarpMtr;

        // ── PLANNED SIZING DATE ──
        let plannedSizingDate = 'PENDING';
        const sizingDateRaw = ord.sizing_planned_date || ord.sizing_plan_date;
        if (sizingDateRaw) {
          try {
            const d = new Date(sizingDateRaw);
            if (!isNaN(d.getTime())) plannedSizingDate = format(d, 'dd-MM-yyyy');
          } catch(e) {}
        }

        // ── LOOM START DATE ──
        let loomStartDate = 'NOT STARTED';
        const loomDateRaw = ord.actual_weaving_start_date || ord.weaving_start_date || ord.weaving_planned_date || ord.weaving_planned_start_date;
        if (loomDateRaw) {
          try {
            const d = new Date(loomDateRaw);
            if (!isNaN(d.getTime())) loomStartDate = format(d, 'dd-MM-yyyy');
          } catch(e) {}
        }

        // ── BEAM COUNTS — design-specific, case-insensitive status matching ──
        const seenBeamNos = new Set<string>();
        const matchingBeams = rows.filter(r => {
          const rDesign = (r.design_no || '').trim().toLowerCase();
          const rBeamNo = (r.beam_no || '').trim();
          if (rDesign !== designNo.trim().toLowerCase()) return false;
          if (!rBeamNo) return false;
          if (seenBeamNos.has(rBeamNo.toUpperCase())) return false;
          seenBeamNos.add(rBeamNo.toUpperCase());
          return true;
        });

        // AVAILABLE: physical beams in stock NOT yet allocated or assigned or running
        const availableStatuses = new Set(['AVAILABLE', 'READY']);
        const allocatedStatuses = new Set(['RESERVED', 'ALLOCATED', 'RUNNING', 'CONFIRMED', 'IN USE', 'ASSIGNED']);

        // Count allocations from rawNextPlans for this order/design
        const planAllocatedCount = rawNextPlans.filter(p => {
          const st = (p.status || '').toUpperCase();
          if (st === 'CANCELLED' || st === 'COMPLETED') return false;
          const pIbpo = (p.order_no || '').trim().toLowerCase();
          const pDes = (p.next_design || '').trim().toLowerCase();
          const tIbpo = (ibpo || '').trim().toLowerCase();
          const tDes = (designNo || '').trim().toLowerCase();
          const isMatch = (pIbpo && pIbpo === tIbpo) || (pDes && pDes === tDes);
          return isMatch && (p.reserved_beam_id || p.reserved_beam_no || p.beam_status === 'BEAM ALLOCATED');
        }).length;

        const availablePhysicalBeamsList = matchingBeams.filter(b => {
          const st = normStatus(b.beam_status);
          const bNo = (b.beam_no || '').trim().toUpperCase();
          const isRunning = runningBeamNos.has(bNo) || st === 'RUNNING' || st === 'IN USE';
          const isAssigned = !!b.loom_no_assigned || (b.remarks && b.remarks.includes('Reserved')) || planAllocatedBeamNos.has(bNo);
          return availableStatuses.has(st) && !isRunning && !isAssigned;
        });

        const availableBeams = availablePhysicalBeamsList.length;

        // Sum of Warp Mtr from physical beams that are currently AVAILABLE and eligible for this design
        const availableWarpMtr = availablePhysicalBeamsList.reduce((sum, b) => {
          const mtr = typeof b.warp_meter === 'number' ? b.warp_meter : parseFloat(String(b.warp_meter || 0)) || 0;
          return sum + mtr;
        }, 0);

        // WARP BALANCE = REQUIRED WARP MTR - USABLE AVAILABLE BEAM WARP MTR
        const warpBalance = finalWarpMtr - availableWarpMtr;

        const physAllocatedCount = matchingBeams.filter(b => {
          const st = normStatus(b.beam_status);
          const bNo = (b.beam_no || '').trim().toUpperCase();
          const isRunning = runningBeamNos.has(bNo);
          const isAssigned = !!b.loom_no_assigned || (b.remarks && b.remarks.includes('Reserved')) || planAllocatedBeamNos.has(bNo);
          return allocatedStatuses.has(st) || isAssigned || isRunning;
        }).length;

        const allocatedBeams = Math.max(physAllocatedCount, planAllocatedCount);

        // BALANCE BEAMS: Net outstanding required beams = MAX(Required Beams - Allocated Beams, 0)
        const balanceBeams = Math.max(0, requiredBeams - allocatedBeams);

        return {
          ord,
          ibpo,
          designNo,
          matchedDesign,
          orderMtr,
          calculatedWarpMtr,
          manualWarpMtr,
          finalWarpMtr,
          availableWarpMtr,
          warpBalance,
          plannedLooms: requiredBeams,
          plannedSizingDate,
          loomStartDate,
          requiredBeams,
          availableBeams,
          allocatedBeams,
          balanceBeams
        };
      });
  }, [orders, designs, rows, rawNextPlans, activeRuns, manualWarpOverrides]);

  // Filtered Order Requirements for Display
  const displayedOrderRequirements = useMemo(() => {
    let list = showAllOrders ? activeOrderRequirements : activeOrderRequirements.filter(r => r.balanceBeams > 0);
    if (!orderReqSearchTerm.trim()) return list;
    const q = orderReqSearchTerm.trim().toLowerCase();
    return list.filter(r =>
      (r.ibpo || '').toLowerCase().includes(q) ||
      (r.designNo || '').toLowerCase().includes(q) ||
      (r.plannedSizingDate || '').toLowerCase().includes(q) ||
      (r.loomStartDate || '').toLowerCase().includes(q)
    );
  }, [activeOrderRequirements, showAllOrders, orderReqSearchTerm]);

  // Summary Metrics Area
  const summaryMetrics = useMemo(() => {
    const ordersNeedingBeams = activeOrderRequirements.filter(r => r.balanceBeams > 0).length;
    // Total beams required = sum of requiredBeams (planned loom counts) across all active orders
    const totalBeamsRequired = activeOrderRequirements.reduce((sum, r) => sum + r.requiredBeams, 0);
    const totalMetersRequired = activeOrderRequirements.reduce((sum, r) => sum + r.finalWarpMtr, 0);
    const totalPhysicalAvailable = rows.filter(r => {
      const st = (r.beam_status || '').trim().toUpperCase();
      const isAssigned = !!(r as any).loom_no_assigned || (r.remarks && r.remarks.includes('Reserved'));
      return (st === 'AVAILABLE' || st === 'READY') && !isAssigned && (r.beam_no || '').trim() !== '';
    }).length;

    return {
      ordersNeedingBeams,
      totalBeamsRequired,
      totalMetersRequired,
      totalPhysicalAvailable
    };
  }, [activeOrderRequirements, rows]);

  // Open Manual Warp Override Modal
  const handleOpenWarpOverrideModal = (req: any) => {
    setEditingWarpModal({
      ibpo: req.ibpo,
      calculated: req.calculatedWarpMtr,
      current: req.finalWarpMtr
    });
    setTempManualWarpVal(String(req.finalWarpMtr));
  };

  // Save Manual Warp Override
  const handleSaveWarpOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWarpModal) return;
    const val = Number(tempManualWarpVal);
    if (!isNaN(val) && val > 0) {
      setManualWarpOverrides(prev => ({ ...prev, [editingWarpModal.ibpo]: val }));
      setSuccessMsg(`Manual Warp Meter requirement updated to ${val.toLocaleString()} M for Order ${editingWarpModal.ibpo}!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
    setEditingWarpModal(null);
  };

  // Open Quick Add Beam Modal for selected order
  const handleOpenQuickAddModal = (reqItem: any) => {
    const d = reqItem.matchedDesign;
    setQuickAddOrderModal(reqItem);
    const defaultMetersPerBeam = Math.ceil(reqItem.finalWarpMtr / Math.max(1, reqItem.requiredBeams)) || 2000;

    setQuickForm({
      date: format(new Date(), 'yyyy-MM-dd'),
      vendor_name: 'In-House Warping',
      party_beam_no: reqItem.ibpo,
      set_no: `SET-${reqItem.ibpo.slice(-4)}`,
      beam_no: `BM-${Math.floor(1000 + Math.random() * 9000)}`,
      beam_type: d?.beam_type || 'Standard',
      beam_dia: '800',
      beam_width: d?.reed_space_warp_width || d?.greige_width || '68',
      total_ends: String(d?.total_ends || 4648),
      warp_meter: String(defaultMetersPerBeam),
      location: 'At Sizing',
      remarks: `Added for Order ${reqItem.ibpo}`
    });
  };

  // Submit Quick Add Beam Modal
  const handleSaveQuickBeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddOrderModal) return;

    if (!quickForm.beam_no.trim()) {
      alert('Validation Error: Physical Beam No is required.');
      return;
    }

    if (!(Number(quickForm.warp_meter) > 0)) {
      alert('Validation Error: Warp Meter must be greater than 0.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    const payload = [{
      date: quickForm.date,
      design_no: quickAddOrderModal.designNo,
      vendor_name: quickForm.vendor_name,
      party_beam_no: quickForm.party_beam_no,
      set_no: quickForm.set_no,
      beam_no: quickForm.beam_no.trim(),
      beam_type: quickForm.beam_type,
      beam_dia: Number(quickForm.beam_dia) || null,
      beam_width: Number(quickForm.beam_width) || null,
      total_ends: Number(quickForm.total_ends) || null,
      warp_meter: Number(quickForm.warp_meter),
      available_meter: Number(quickForm.warp_meter),
      location: quickForm.location,
      beam_status: 'Available',
      remarks: quickForm.remarks
    }];

    try {
      const res = await fetch(`${API_BASE_URL}/api/beam-stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save beam stock');
      }

      setSuccessMsg(`🎉 Beam #${quickForm.beam_no} created & linked to Order "${quickAddOrderModal.ibpo}" (Design: ${quickAddOrderModal.designNo})!`);
      setQuickAddOrderModal(null);
      await fetchData();
      await refreshData();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (e: any) {
      setErrorMsg(`Save Error: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRowChange = (index: number, field: keyof BeamRowState, value: any) => {
    setRows(prev => {
      const newRows = [...prev];
      const updatedRow = { ...newRows[index], [field]: value };
      
      if (field === 'date' && value) {
        try {
          const d = new Date(value);
          if (!isNaN(d.getTime())) {
            updatedRow.age_of_beam = Math.max(0, differenceInDays(new Date(), d));
          }
        } catch(e) {}
      }

      newRows[index] = updatedRow;
      return newRows;
    });
  };

  // Excel paste handler
  const handlePaste = (
    e: React.ClipboardEvent<HTMLInputElement | HTMLSelectElement>,
    startRowIndex: number,
    startField: keyof BeamRowState
  ) => {
    e.preventDefault();
    const clipboardData = e.clipboardData.getData('Text');
    if (!clipboardData || !clipboardData.trim()) return;

    const rawLines = clipboardData.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
    if (rawLines.length === 0) return;

    const startFieldIndex = FIELDS_ORDER.indexOf(startField);
    if (startFieldIndex === -1) return;

    const isTabSeparated = rawLines[0].includes('\t');

    const parseLineCols = (line: string): string[] => {
      if (isTabSeparated) {
        return line.split('\t').map(c => c.trim().replace(/^"|"$/g, ''));
      }
      const parts: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim());
      return parts;
    };

    const firstLineCols = parseLineCols(rawLines[0]);
    const col0Low = (firstLineCols[0] || '').toLowerCase();
    const col1Low = (firstLineCols[1] || '').toLowerCase();

    const isHeader = col0Low === 'date' || col0Low === 'design' || col0Low === 'vendor' || col1Low === 'design no' || col1Low === 'design_no';
    const col0IsDate = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(firstLineCols[0]) || /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(firstLineCols[0]);

    const hasHeader = isHeader && !col0IsDate;
    const startLineIndex = hasHeader ? 1 : 0;

    setRows(prev => {
      const newRows = [...prev];
      let pastedCount = 0;

      for (let rIdx = startLineIndex; rIdx < rawLines.length; rIdx++) {
        const cells = parseLineCols(rawLines[rIdx]);
        const targetRowIndex = startRowIndex + (rIdx - startLineIndex);

        if (targetRowIndex >= newRows.length) {
          newRows.push({
            id: `pasted-${Date.now()}-${rIdx}`,
            date: format(new Date(), 'yyyy-MM-dd'),
            design_no: '', vendor_name: '', party_beam_no: '', set_no: '',
            beam_no: '', beam_type: '', beam_dia: '', beam_width: '',
            total_ends: '', warp_meter: '', age_of_beam: 0, location: '',
            beam_status: 'Available', remarks: ''
          });
        }

        let updatedRow = { ...newRows[targetRowIndex] };

        cells.forEach((cellStr, cellIndex) => {
          const targetFieldIndex = startFieldIndex + cellIndex;
          if (targetFieldIndex < FIELDS_ORDER.length) {
            const field = FIELDS_ORDER[targetFieldIndex];
            let valStr = cellStr.trim();

            if (field === 'date') {
              try {
                const parsedDate = new Date(valStr);
                if (!isNaN(parsedDate.getTime())) {
                  valStr = format(parsedDate, 'yyyy-MM-dd');
                  updatedRow.age_of_beam = Math.max(0, differenceInDays(new Date(), parsedDate));
                }
              } catch(e) {}
              updatedRow.date = valStr;
            } else if (field === 'beam_dia' || field === 'beam_width' || field === 'total_ends' || field === 'warp_meter') {
              const num = Number(valStr.replace(/[^0-9.]/g, ''));
              (updatedRow as any)[field] = !isNaN(num) && valStr !== '' ? num : valStr;
            } else {
              (updatedRow as any)[field] = valStr;
            }
          }
        });

        newRows[targetRowIndex] = updatedRow;
        pastedCount++;
      }

      setSuccessMsg(`Pasted ${pastedCount} Beam Stock records from Excel! Click "Save All Beam Stock Changes" to persist.`);
      setTimeout(() => setSuccessMsg(null), 6000);
      return newRows;
    });
  };

  const handleSaveAll = async () => {
    const validRows = rows.filter(r => r.beam_no && String(r.beam_no).trim() !== '');

    if (validRows.length === 0) {
      setErrorMsg('Please enter a valid Beam No for at least one row before saving.');
      setTimeout(() => setErrorMsg(null), 4000);
      return;
    }

    setIsSaving(true);
    setErrorMsg('Saving Beam Stock records to Database...');

    try {
      const payload = validRows.map(r => ({
        date: r.date || format(new Date(), 'yyyy-MM-dd'),
        design_no: r.design_no || '',
        vendor_name: r.vendor_name || '',
        party_beam_no: r.party_beam_no || '',
        set_no: r.set_no || '',
        beam_no: String(r.beam_no).trim(),
        beam_type: r.beam_type || '',
        beam_dia: r.beam_dia !== '' ? Number(r.beam_dia) : null,
        beam_width: r.beam_width !== '' ? Number(r.beam_width) : null,
        total_ends: r.total_ends !== '' ? Number(r.total_ends) : null,
        warp_meter: r.warp_meter !== '' ? Number(r.warp_meter) : null,
        location: r.location || '',
        beam_status: r.beam_status || 'Available',
        remarks: r.remarks || ''
      }));

      const res = await fetch(`${API_BASE_URL}/api/beam-stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save beam stock');
      }

      await fetchData();
      await refreshData();
      setSuccessMsg(`Successfully saved ${payload.length} Beam Stock records to Database!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e: any) {
      setErrorMsg(`Database Save Error: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearDatabase = async () => {
    if (window.confirm('Are you sure you want to delete ALL Beam Stock records from the database? This cannot be undone.')) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/beam-stock/clear-all`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to clear beam stock database');
        
        await fetchData();
        await refreshData();
        setSuccessMsg('All Beam Stock records cleared from Database!');
        setTimeout(() => setSuccessMsg(null), 4000);
      } catch (e: any) {
        setErrorMsg(`Failed to clear database: ${e.message}`);
      }
    }
  };

  const handleCleanEmpty = async () => {
    if (window.confirm('Delete all beam stock rows with empty status? This cannot be undone.')) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/beam-stock/clean-empty`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to clean empty statuses');
        await fetchData();
        await refreshData();
        setSuccessMsg('Cleaned empty status rows from Database!');
        setTimeout(() => setSuccessMsg(null), 4000);
      } catch (e: any) {
        setErrorMsg(`Failed to clean: ${e.message}`);
        setTimeout(() => setErrorMsg(null), 4000);
      }
    }
  };

  const handleAddBlankRow = () => {
    setRows(prev => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        date: format(new Date(), 'yyyy-MM-dd'),
        design_no: '', vendor_name: '', party_beam_no: '', set_no: '',
        beam_no: '', beam_type: '', beam_dia: '', beam_width: '',
        total_ends: '', warp_meter: '', age_of_beam: 0, location: '',
        beam_status: 'Available', remarks: ''
      }
    ]);
  };

  // Safe Deletion Safeguard
  const handleDeleteRow = async (index: number) => {
    const target = rows[index];

    // Check allocation safeguard
    const statusUpper = (target.beam_status || '').toUpperCase();
    if (statusUpper === 'RESERVED' || statusUpper === 'ALLOCATED' || statusUpper === 'RUNNING' || statusUpper === 'CONFIRMED') {
      alert(`⚠️ Cannot Delete Beam #${target.beam_no}: This physical beam is currently ${statusUpper} to a loom plan/production.`);
      return;
    }

    if (typeof target.id === 'number') {
      try {
        const res = await fetch(`${API_BASE_URL}/api/beam-stock/${target.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const err = await res.json();
          alert(`Delete Error: ${err.error || 'Failed to delete beam record'}`);
          return;
        }
      } catch (e: any) {
        console.error(e);
      }
    }
    setRows(prev => prev.filter((_, idx) => idx !== index));
    setSuccessMsg(`Beam #${target.beam_no || 'Row'} deleted.`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleExportExcel = () => {
    const exportData = rows
      .filter(r => r.beam_no !== '')
      .map(r => ({
        'Date': r.date,
        'Design No': r.design_no,
        'Vendor Name': r.vendor_name,
        'Party Beam No': r.party_beam_no,
        'Set No': r.set_no,
        'Beam No': r.beam_no,
        'Beam Type': r.beam_type,
        'Beam Dia': r.beam_dia,
        'Beam Width': r.beam_width,
        'Total Ends': r.total_ends,
        'Warp Mtr': r.warp_meter,
        'Age (Days)': r.age_of_beam,
        'Location': r.location,
        'Beam Status': r.beam_status,
        'Remark': r.remarks
      }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BeamStock");
    XLSX.writeFile(wb, `SPUPL_Beam_Stock.xlsx`);
  };

  const filteredRows = rows.filter(r => {
    const normSt = (r.beam_status || '').toUpperCase();

    const matchesSearch = !searchTerm || 
      (r.beam_no || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (r.design_no || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.vendor_name || '').toLowerCase().includes(searchTerm.toLowerCase());

    // Beams running on looms are active on the loom floor and must NOT be shown in stock inventory view unless specifically filtered
    const matchesStatus = statusFilter === 'ALL'
      ? normSt !== 'RUNNING' && normSt !== 'IN USE'
      : normSt === statusFilter.toUpperCase();

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-24">
      <CompanyPrintHeader title="Beam Stock & Requirement Control" subtitle="Physical Beam Inventory & Loom Allocation Report" />

      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 bg-slate-900 text-white rounded-2xl shadow-xl gap-4 border border-slate-800 print:hidden">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center">
            <Package className="w-7 h-7 mr-3 text-blue-500" /> Beam Stock & Requirement Control
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Real-time physical beam inventory, warp meters, sizing schedule & beam allocation for loom planning
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              await fetchData();
              await refreshData();
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center"
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh Requirements & Stock
          </button>
        </div>
      </div>

      {/* Alert Messages */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-bold text-xs">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <span className="font-bold text-xs">{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
        </div>
      )}

      {/* SECTION 1 — BEAM PRODUCTION & REQUIREMENT SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-[10px] uppercase font-bold text-slate-400">Orders Needing Beams</div>
          <div className="text-xl font-black text-amber-600 mt-1">{summaryMetrics.ordersNeedingBeams}</div>
          <div className="text-[9px] text-slate-500 font-semibold mt-0.5">Active Orders With Balance</div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-[10px] uppercase font-bold text-slate-400">Total Beams Required</div>
          <div className="text-xl font-black text-blue-700 mt-1">{summaryMetrics.totalBeamsRequired}</div>
          <div className="text-[9px] text-slate-500 font-semibold mt-0.5">Loom Planning Basis</div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-[10px] uppercase font-bold text-slate-400">Warp Meters Required</div>
          <div className="text-xl font-black text-purple-700 mt-1">
            {(summaryMetrics.totalMetersRequired).toLocaleString()} M
          </div>
          <div className="text-[9px] text-slate-500 font-semibold mt-0.5">Total Warp Preparation</div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-[10px] uppercase font-bold text-slate-400">Physical Beams Available</div>
          <div className="text-xl font-black text-emerald-700 mt-1">{summaryMetrics.totalPhysicalAvailable}</div>
          <div className="text-[9px] text-slate-500 font-semibold mt-0.5">Central Beam Stock</div>
        </div>
      </div>

      {/* SECTION 2 — ORDER-WISE BEAM REQUIREMENT & PRODUCTION STATUS PANEL (EXACT 14 COLUMNS) */}
      <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap justify-between items-center border-b border-slate-800 pb-3 gap-3">
          <div>
            <h3 className="text-base font-black text-blue-300 uppercase tracking-wide flex items-center">
              <Layers className="w-5 h-5 mr-2 text-blue-400" /> BEAM REQUIREMENT & PRODUCTION CONTROL
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Order-wise beam requirements, sizing schedule & physical stock allocation status.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input Box */}
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search IBPO or Design..."
                value={orderReqSearchTerm}
                onChange={e => setOrderReqSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 bg-slate-800 border border-slate-700 text-white placeholder-slate-400 rounded-xl text-xs font-bold outline-none focus:border-blue-500 focus:bg-slate-900 transition-all"
              />
              {orderReqSearchTerm && (
                <button
                  onClick={() => setOrderReqSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white font-bold text-xs"
                  title="Clear Search"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              onClick={() => setShowAllOrders(!showAllOrders)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs border border-slate-700 transition-all shrink-0"
            >
              {showAllOrders ? 'Show Pending Orders Only' : `Show All Active Orders (${activeOrderRequirements.length})`}
            </button>
          </div>
        </div>

        {/* Requirements Table — All 14 Columns Fit On Screen */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-slate-950 text-slate-400 uppercase text-[9.5px] font-black border-b border-slate-800">
                <th className="py-2 px-1 text-center">#</th>
                <th className="py-2 px-1.5 text-blue-300">IBPO / ORDER NO</th>
                <th className="py-2 px-1.5">DESIGN NO</th>
                <th className="py-2 px-1.5 text-right">ORDER MTR</th>
                <th className="py-2 px-1.5 text-right text-purple-300">WARP MTR</th>
                <th className="py-2 px-1 text-center">PLANNED LOOMS</th>
                <th className="py-2 px-1.5 text-center text-cyan-300">PLANNED SIZING DATE</th>
                <th className="py-2 px-1.5 text-center text-indigo-300">LOOM START DATE</th>
                <th className="py-2 px-1 text-center">REQ BEAMS</th>
                <th className="py-2 px-1 text-center text-emerald-400">AVAIL BEAMS</th>
                <th className="py-2 px-1 text-center text-purple-400">ALLOC BEAMS</th>
                <th className="py-2 px-1.5 text-center text-amber-300 font-black">BAL BEAMS</th>
                <th className="py-2 px-1.5 text-center text-pink-300 font-black">BAL WARP MTR</th>
                <th className="py-2 px-1 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 font-mono text-[11px]">
              {displayedOrderRequirements.length === 0 ? (
                <tr>
                  <td colSpan={14} className="p-6 text-center text-slate-500 font-semibold font-sans">
                    No active orders currently require beam stock entry. Click <strong>Show All Active Orders</strong> to view all.
                  </td>
                </tr>
              ) : (
                displayedOrderRequirements.map((req, idx) => (
                  <tr key={req.ibpo} className="hover:bg-slate-850/60 transition-colors">
                    <td className="py-2 px-1 text-center text-slate-500 font-bold">{idx + 1}</td>

                    <td className="py-2 px-1.5 font-black text-blue-300">
                      <span className="px-1.5 py-0.5 bg-blue-950/80 border border-blue-800 rounded font-mono">
                        {req.ibpo}
                      </span>
                    </td>

                    <td className="py-2 px-1.5 font-bold text-white">{req.designNo}</td>

                    <td className="py-2 px-1.5 text-right font-bold text-slate-200">{req.orderMtr.toLocaleString()} M</td>

                    <td className="py-2 px-1.5 text-right font-black text-purple-300">
                      <div className="flex items-center justify-end space-x-1">
                        <span>{req.finalWarpMtr.toLocaleString()} M</span>
                        {req.manualWarpMtr ? (
                          <span className="text-[9px] px-1 bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded">MANUAL</span>
                        ) : null}
                        <button
                          onClick={() => handleOpenWarpOverrideModal(req)}
                          className="text-slate-400 hover:text-blue-400 p-0.5"
                          title="Manual Warp Meter Override"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>

                    <td className="py-2 px-1 text-center font-bold text-slate-200">{req.plannedLooms}</td>

                    <td className="py-2 px-1.5 text-center font-semibold text-cyan-300">{req.plannedSizingDate}</td>

                    <td className="py-2 px-1.5 text-center font-semibold text-indigo-300">{req.loomStartDate}</td>

                    <td className="py-2 px-1 text-center font-bold text-slate-200">{req.requiredBeams}</td>

                    <td className="py-2 px-1 text-center font-bold text-emerald-400">{req.availableBeams}</td>

                    <td className="py-2 px-1 text-center font-bold text-purple-400">{req.allocatedBeams}</td>

                    <td className="py-2 px-1.5 text-center font-black text-amber-400">
                      {req.balanceBeams === 0 ? (
                        <span className="text-emerald-400 font-bold text-[10px]">0 (READY)</span>
                      ) : (
                        req.balanceBeams
                      )}
                    </td>

                    <td className="py-2 px-1.5 text-center font-black">
                      {req.warpBalance < 0 ? (
                        <span className="text-emerald-400 font-black" title="Surplus warp meters available in stock">
                          {req.warpBalance.toLocaleString()} M
                        </span>
                      ) : req.warpBalance === 0 ? (
                        <span className="text-emerald-300 font-bold">0 M</span>
                      ) : (
                        <span className="text-amber-400 font-bold">{req.warpBalance.toLocaleString()} M</span>
                      )}
                    </td>

                    <td className="py-2 px-1 text-center font-sans">
                      <button
                        onClick={() => handleOpenQuickAddModal(req)}
                        className="px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] rounded-md shadow-sm flex items-center mx-auto transition-all"
                        title={`Add Beam for IBPO ${req.ibpo}`}
                      >
                        <Plus className="w-3 h-3 mr-0.5" /> + ADD BEAM
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3 — EXCEL ENTRY GRID CONTROL BAR & EXCEL TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4 print:p-0 print:border-none flex-1 flex flex-col">
        
        {/* Controls Bar */}
        <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-200 pb-3 print:hidden">
          <div className="flex items-center space-x-3">
            <h3 className="font-black text-slate-900 text-sm uppercase flex items-center">
              PHYSICAL BEAM STOCK ENTRY GRID ({filteredRows.length} Beams)
            </h3>
            <span className="text-xs text-slate-500 font-semibold">(Paste rows directly from Excel with Ctrl+V)</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search Beam No, Design..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-semibold"
              />
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="p-1.5 text-xs border border-slate-200 rounded-xl font-bold bg-white outline-none"
            >
              <option value="ALL">All Statuses</option>
              {BEAM_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <button
              onClick={handleAddBlankRow}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 transition-all flex items-center"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Row
            </button>

            <button
              onClick={handleSaveAll}
              disabled={isSaving}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" /> Save All Changes
            </button>

            <button
              onClick={handleExportExcel}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition-all flex items-center"
            >
              <Download className="w-3.5 h-3.5 mr-1" /> Export Excel
            </button>
          </div>
        </div>

        {/* Excel Entry Table */}
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse whitespace-nowrap text-xs font-mono">
            <thead>
              <tr className="bg-slate-900 text-white uppercase text-[10px] font-black border-b border-slate-800">
                <th className="p-2 text-center w-10">S.No</th>
                <th className="p-2 min-w-[110px]">Date *</th>
                <th className="p-2 min-w-[130px] text-blue-300">Design No</th>
                <th className="p-2 min-w-[120px]">Vendor Name</th>
                <th className="p-2 min-w-[110px]">Party Beam No</th>
                <th className="p-2 min-w-[100px]">Set No</th>
                <th className="p-2 min-w-[110px] text-amber-300">Beam No *</th>
                <th className="p-2 min-w-[110px]">Beam Type</th>
                <th className="p-2 min-w-[80px] text-right">Beam Dia</th>
                <th className="p-2 min-w-[80px] text-right">Width</th>
                <th className="p-2 min-w-[80px] text-right">Total Ends</th>
                <th className="p-2 min-w-[100px] text-right text-emerald-300">Warp Mtr *</th>
                <th className="p-2 min-w-[70px] text-center">Age (Days)</th>
                <th className="p-2 min-w-[100px]">Location</th>
                <th className="p-2 min-w-[110px]">Beam Status</th>
                <th className="p-2 min-w-[130px]">Remarks</th>
                <th className="p-2 text-center w-12 print:hidden">Del</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {filteredRows.map((row, index) => {
                return (
                  <tr key={row.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="p-2 text-center font-bold text-slate-400">{index + 1}</td>

                    <td className="p-1">
                      <input
                        type="date"
                        value={row.date}
                        onChange={e => handleRowChange(index, 'date', e.target.value)}
                        onPaste={e => handlePaste(e, index, 'date')}
                        className="w-full p-1.5 border border-slate-300 rounded font-semibold text-xs outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="SP26/..."
                        value={row.design_no}
                        onChange={e => handleRowChange(index, 'design_no', e.target.value)}
                        onPaste={e => handlePaste(e, index, 'design_no')}
                        className="w-full p-1.5 border border-slate-300 rounded font-bold text-xs text-blue-900 outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="Vendor"
                        value={row.vendor_name}
                        onChange={e => handleRowChange(index, 'vendor_name', e.target.value)}
                        onPaste={e => handlePaste(e, index, 'vendor_name')}
                        className="w-full p-1.5 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="Party No"
                        value={row.party_beam_no}
                        onChange={e => handleRowChange(index, 'party_beam_no', e.target.value)}
                        onPaste={e => handlePaste(e, index, 'party_beam_no')}
                        className="w-full p-1.5 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="Set No"
                        value={row.set_no}
                        onChange={e => handleRowChange(index, 'set_no', e.target.value)}
                        onPaste={e => handlePaste(e, index, 'set_no')}
                        className="w-full p-1.5 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="BM-..."
                        value={row.beam_no}
                        onChange={e => handleRowChange(index, 'beam_no', e.target.value)}
                        onPaste={e => handlePaste(e, index, 'beam_no')}
                        className="w-full p-1.5 border border-amber-300 bg-amber-50/50 rounded font-black text-xs text-slate-900 outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </td>

                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="Standard"
                        value={row.beam_type}
                        onChange={e => handleRowChange(index, 'beam_type', e.target.value)}
                        onPaste={e => handlePaste(e, index, 'beam_type')}
                        className="w-full p-1.5 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    <td className="p-1">
                      <input
                        type="number"
                        placeholder="800"
                        value={row.beam_dia}
                        onChange={e => handleRowChange(index, 'beam_dia', e.target.value)}
                        onPaste={e => handlePaste(e, index, 'beam_dia')}
                        className="w-full p-1.5 border border-slate-300 rounded text-xs text-right outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    <td className="p-1">
                      <input
                        type="number"
                        placeholder="68"
                        value={row.beam_width}
                        onChange={e => handleRowChange(index, 'beam_width', e.target.value)}
                        onPaste={e => handlePaste(e, index, 'beam_width')}
                        className="w-full p-1.5 border border-slate-300 rounded text-xs text-right outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    <td className="p-1">
                      <input
                        type="number"
                        placeholder="4648"
                        value={row.total_ends}
                        onChange={e => handleRowChange(index, 'total_ends', e.target.value)}
                        onPaste={e => handlePaste(e, index, 'total_ends')}
                        className="w-full p-1.5 border border-slate-300 rounded text-xs text-right outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    <td className="p-1">
                      <input
                        type="number"
                        placeholder="5000"
                        value={row.warp_meter}
                        onChange={e => handleRowChange(index, 'warp_meter', e.target.value)}
                        onPaste={e => handlePaste(e, index, 'warp_meter')}
                        className="w-full p-1.5 border border-emerald-300 bg-emerald-50/50 rounded font-bold text-xs text-right text-emerald-950 outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </td>

                    <td className="p-2 text-center font-bold text-slate-600 text-xs">
                      {row.age_of_beam}
                    </td>

                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="Location"
                        value={row.location}
                        onChange={e => handleRowChange(index, 'location', e.target.value)}
                        onPaste={e => handlePaste(e, index, 'location')}
                        className="w-full p-1.5 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    <td className="p-1">
                      <select
                        value={BEAM_STATUSES.find(s => s.toUpperCase() === (row.beam_status || '').toUpperCase()) || row.beam_status || 'Available'}
                        onChange={e => handleRowChange(index, 'beam_status', e.target.value)}
                        className={`w-full p-1.5 border rounded font-bold text-xs outline-none ${
                          (row.beam_status || '').toUpperCase() === 'ALLOCATED' || (row.beam_status || '').toUpperCase() === 'RESERVED'
                            ? 'border-purple-400 bg-purple-50 text-purple-900 font-extrabold'
                            : (row.beam_status || '').toUpperCase() === 'RUNNING'
                            ? 'border-blue-400 bg-blue-50 text-blue-900 font-extrabold'
                            : 'border-slate-300 bg-white text-slate-900'
                        }`}
                      >
                        {BEAM_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>

                    <td className="p-1">
                      <input
                        type="text"
                        placeholder="Remarks"
                        value={row.remarks}
                        onChange={e => handleRowChange(index, 'remarks', e.target.value)}
                        onPaste={e => handlePaste(e, index, 'remarks')}
                        className="w-full p-1.5 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    <td className="p-2 text-center print:hidden">
                      <button
                        onClick={() => handleDeleteRow(index)}
                        className="text-red-500 hover:text-red-700 font-bold text-xs p-1"
                        title="Delete Row"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MANUAL WARP OVERRIDE MODAL */}
      {editingWarpModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4 border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center">
                <Edit2 className="w-4 h-4 mr-2 text-blue-600" /> Manual Warp Meter Override ({editingWarpModal.ibpo})
              </h3>
              <button onClick={() => setEditingWarpModal(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveWarpOverride} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 border border-slate-200">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Calculated Warp Meter:</span>
                  <span className="font-bold text-slate-800">{editingWarpModal.calculated.toLocaleString()} M</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Current Final Warp Meter:</span>
                  <span className="font-bold text-purple-700">{editingWarpModal.current.toLocaleString()} M</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-800 font-bold mb-1">Enter Manual Warp Meter Override (M)</label>
                <input
                  type="number"
                  required
                  value={tempManualWarpVal}
                  onChange={e => setTempManualWarpVal(e.target.value)}
                  placeholder="e.g. 14500"
                  className="w-full p-2.5 border border-purple-300 bg-purple-50/40 rounded-xl text-right font-black text-sm text-purple-950 outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingWarpModal(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md"
                >
                  Save Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK ADD BEAM MODAL */}
      {quickAddOrderModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
            
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-sm flex items-center">
                <Plus className="w-4 h-4 mr-2 text-emerald-400" /> ADD BEAM PRODUCTION STOCK ({quickAddOrderModal.ibpo})
              </h3>
              <button onClick={() => setQuickAddOrderModal(null)} className="text-slate-400 hover:text-white font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveQuickBeam} className="p-5 space-y-4 text-xs font-medium max-h-[85vh] overflow-y-auto custom-scrollbar">
              
              {/* Read Only Order Specification Header */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Order / IBPO</span>
                    <span className="font-black text-blue-900 text-xs mt-0.5 block">{quickAddOrderModal.ibpo}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Design / SP No</span>
                    <span className="font-black text-slate-900 text-xs mt-0.5 block">{quickAddOrderModal.designNo}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Order Qty</span>
                    <span className="font-bold text-slate-800 text-xs mt-0.5 block">{quickAddOrderModal.orderMtr.toLocaleString()} M</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Final Warp Mtr</span>
                    <span className="font-black text-purple-700 text-xs mt-0.5 block">{quickAddOrderModal.finalWarpMtr.toLocaleString()} M</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center pt-2 border-t border-slate-200 text-[11px]">
                  <div>Planned Looms: <strong>{quickAddOrderModal.plannedLooms}</strong></div>
                  <div>Sizing Date: <strong className="text-cyan-700">{quickAddOrderModal.plannedSizingDate}</strong></div>
                  <div>Loom Start: <strong className="text-indigo-700">{quickAddOrderModal.loomStartDate}</strong></div>
                  <div>Balance Beams: <strong className="text-amber-600">{quickAddOrderModal.balanceBeams} Beams</strong></div>
                </div>
              </div>

              {/* Editable Physical Beam Entry Fields */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 text-xs uppercase flex items-center">
                  <Package className="w-3.5 h-3.5 mr-1.5 text-blue-600" /> Physical Beam Production Parameters
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Production Date *</label>
                    <input
                      type="date"
                      required
                      value={quickForm.date}
                      onChange={e => setQuickForm(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Vendor / Warper Name *</label>
                    <input
                      type="text"
                      required
                      value={quickForm.vendor_name}
                      onChange={e => setQuickForm(prev => ({ ...prev, vendor_name: e.target.value }))}
                      placeholder="e.g. In-House Warping"
                      className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Physical Beam No *</label>
                    <input
                      type="text"
                      required
                      value={quickForm.beam_no}
                      onChange={e => setQuickForm(prev => ({ ...prev, beam_no: e.target.value }))}
                      placeholder="e.g. BM-1005"
                      className="w-full p-2.5 border border-amber-300 bg-amber-50/40 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-black text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Party Beam No / IBPO</label>
                    <input
                      type="text"
                      value={quickForm.party_beam_no}
                      onChange={e => setQuickForm(prev => ({ ...prev, party_beam_no: e.target.value }))}
                      className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Set No / Warping Batch</label>
                    <input
                      type="text"
                      value={quickForm.set_no}
                      onChange={e => setQuickForm(prev => ({ ...prev, set_no: e.target.value }))}
                      placeholder="e.g. SET-001"
                      className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Beam Type</label>
                    <input
                      type="text"
                      value={quickForm.beam_type}
                      onChange={e => setQuickForm(prev => ({ ...prev, beam_type: e.target.value }))}
                      className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Beam Dia (mm)</label>
                    <input
                      type="number"
                      value={quickForm.beam_dia}
                      onChange={e => setQuickForm(prev => ({ ...prev, beam_dia: e.target.value }))}
                      className="w-full p-2.5 border border-slate-300 rounded-xl text-right outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Beam Width (in)</label>
                    <input
                      type="number"
                      value={quickForm.beam_width}
                      onChange={e => setQuickForm(prev => ({ ...prev, beam_width: e.target.value }))}
                      className="w-full p-2.5 border border-slate-300 rounded-xl text-right outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Total Ends</label>
                    <input
                      type="number"
                      value={quickForm.total_ends}
                      onChange={e => setQuickForm(prev => ({ ...prev, total_ends: e.target.value }))}
                      className="w-full p-2.5 border border-slate-300 rounded-xl text-right outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Warp Meter *</label>
                    <input
                      type="number"
                      required
                      value={quickForm.warp_meter}
                      onChange={e => setQuickForm(prev => ({ ...prev, warp_meter: e.target.value }))}
                      placeholder="e.g. 2000"
                      className="w-full p-2.5 border border-emerald-300 bg-emerald-50/50 rounded-xl text-right outline-none focus:ring-2 focus:ring-emerald-500 font-black text-emerald-950"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Stock Location</label>
                    <input
                      type="text"
                      value={quickForm.location}
                      onChange={e => setQuickForm(prev => ({ ...prev, location: e.target.value }))}
                      placeholder="e.g. At Sizing, Store A-01"
                      className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Operator Remarks</label>
                    <input
                      type="text"
                      value={quickForm.remarks}
                      onChange={e => setQuickForm(prev => ({ ...prev, remarks: e.target.value }))}
                      className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setQuickAddOrderModal(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-md disabled:opacity-40 flex items-center"
                >
                  <Save className="w-4 h-4 mr-2" /> SAVE BEAM PRODUCTION
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
