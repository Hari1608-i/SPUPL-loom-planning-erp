import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { calculateLoomRun, CalculatedLoomRun, isMatchingDesign } from '../utils/calculations';
import { 
  AlertCircle, Save, Zap, Info, Lock, Unlock, Layers, Building2, Package, CheckCircle2, 
  XCircle, ChevronDown, ChevronRight, ExternalLink, RefreshCw, AlertTriangle, ShieldCheck,
  Search, Filter, ShoppingBag, FileText, Calendar, Clock, Activity, ListTodo,
  Plus, Edit3, Trash2, CheckCircle, X, Download, Play, FileSpreadsheet, Printer
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import * as XLSX from 'xlsx';
import { useAppContext } from '../context/AppProvider';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import { CompanyPrintHeader, PrintTableHeaderRow } from '../components/common/CompanyPrintHeader';
import { triggerPrint } from '../utils/printManager';
import { LoomRow } from '../components/mainEntry/LoomRow';

interface EntryState {
  designNo: string;
  currentBeamNo: string;
  loomStartDate: string;
  warpedMeter: number | '';
  dailyProduction: number | '';
  rpm: number | '';
  efficiency: number | '';
  remarks: string;
}

interface ProductionLogItem {
  id: number;
  loom_no: number;
  design_no?: string;
  produced_meter: number;
  rpm?: number | null;
  efficiency?: number | null;
  remarks?: string;
  createdAt?: string;
  date?: string;
}

const TRANSACTION_FIELDS_ORDER: (keyof EntryState)[] = [
  'designNo', 'currentBeamNo', 'loomStartDate', 'warpedMeter', 'dailyProduction', 'rpm', 'efficiency', 'remarks'
];

export default function MainEntry() {
  const location = useLocation();
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'ADMINISTRATOR' || user?.username?.toLowerCase() === 'admin';
  const { activeRuns, setActiveRuns, looms, designs, beams, reeds, orders, nextPlans, rawNextPlans, refreshData } = useAppContext();
  const [entries, setEntries] = useState<Record<number, EntryState>>({});
  const [unlockedLoomDates, setUnlockedLoomDates] = useState<Record<number, boolean>>({});
  const [adminUnlockModal, setAdminUnlockModal] = useState<{
    isOpen: boolean;
    loomNo: number | null;
    password: string;
    error: string | null;
    isVerifying: boolean;
  }>({
    isOpen: false,
    loomNo: null,
    password: '',
    error: null,
    isVerifying: false
  });
  const [isSavingAll, setIsSavingAll] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedUnit, setSelectedUnit] = useState<string>('ALL');
  const [selectedRunoutFilter, setSelectedRunoutFilter] = useState<string>('ALL');
  const [selectedProductionDate, setSelectedProductionDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    if (location.state && (location.state as any).loomNo) {
      const stateObj = location.state as any;
      const pLoom = Number(stateObj.loomNo);

      // IMPORTANT: Only pre-fill from navigation state if the loom has NO existing active run.
      // If a loom is already running another design, the confirmed plan must become
      // a next-plan only — never overwrite the current running design.
      const existingRun = activeRuns[pLoom];
      if (existingRun && existingRun.designNo && existingRun.designNo.trim() !== '') {
        // Loom already running — just highlight it and inform the user
        setSearchTerm(pLoom.toString());
        setSuccessMsg(`ℹ️ Loom ${pLoom} is already running Design "${existingRun.designNo}". The confirmed plan has been queued as the Next Plan.`);
        return;
      }

      const pDesign = stateObj.designNo || stateObj.nextDesign || '';
      const pBeam = stateObj.beamNo || stateObj.reservedBeamNo || '';
      const pDate = stateObj.plannedStartDate ? format(new Date(stateObj.plannedStartDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
      const pWarpMtr = Number(stateObj.warpMeter || stateObj.plannedWarpMeter || 0);

      dirtyLoomsRef.current.add(pLoom);
      setEntries(prev => ({
        ...prev,
        [pLoom]: {
          designNo: pDesign || prev[pLoom]?.designNo || '',
          currentBeamNo: pBeam || prev[pLoom]?.currentBeamNo || '',
          loomStartDate: pDate || prev[pLoom]?.loomStartDate || format(new Date(), 'yyyy-MM-dd'),
          warpedMeter: pWarpMtr > 0 ? pWarpMtr : (prev[pLoom]?.warpedMeter || ''),
          dailyProduction: prev[pLoom]?.dailyProduction || '',
          rpm: prev[pLoom]?.rpm || '',
          efficiency: prev[pLoom]?.efficiency || '',
          remarks: prev[pLoom]?.remarks || ''
        }
      }));
      setSearchTerm(pLoom.toString());
      setSuccessMsg(`🚀 Loom ${pLoom} confirmed plan loaded. Enter today's daily production to begin runout tracking.`);
    }
  }, [location.state]);
  
  // Daily Production History state
  const [productionLogs, setProductionLogs] = useState<ProductionLogItem[]>([]);
  const [historyModalLoomNo, setHistoryModalLoomNo] = useState<number | null>(null);
  const [newLogMeter, setNewLogMeter] = useState<string>('');
  const [newLogRpm, setNewLogRpm] = useState<string>('');
  const [newLogEff, setNewLogEff] = useState<string>('');
  const [newLogRemarks, setNewLogRemarks] = useState<string>('');
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editLogMeter, setEditLogMeter] = useState<string>('');
  const [editLogRpm, setEditLogRpm] = useState<string>('');
  const [editLogEff, setEditLogEff] = useState<string>('');
  const [editLogRemarks, setEditLogRemarks] = useState<string>('');

  // Warp Runout Transition Modal State
  const [transitionPromptPlan, setTransitionPromptPlan] = useState<any | null>(null);

  const handleConfirmWarpTransition = async (plan: any) => {
    if (!plan) return;
    const loomNo = plan.loom_no || plan.loomNo;
    const currentEntry = entries[loomNo] || {};
    try {
      if (plan.next_design && plan.next_design !== 'AVAILABLE (No Plan Queued)') {
        const res = await fetch(`${API_BASE_URL}/api/confirm-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loomNo,
            nextDesign: plan.next_design,
            startDate: format(new Date(), 'yyyy-MM-dd'),
            warpMeter: plan.planned_warp_meter || 1000,
            dailyProduction: 0, // NEW DESIGN PRODUCTION RESET TO 0
            beamNo: plan.reserved_beam_no,
            setNo: plan.reserved_set_no,
            beamId: plan.reserved_beam_id
          })
        });

        if (res.ok) {
          setSuccessMsg(`Loom L-${loomNo} successfully transitioned to Next Design "${plan.next_design}"! Production reset to 0 M.`);
          setTransitionPromptPlan(null);
          await refreshData();
          setTimeout(() => setSuccessMsg(null), 5000);
        } else {
          const data = await res.json();
          alert('Transition Error: ' + (data.error || 'Failed to transition loom'));
        }
      } else {
        // No next plan exists -> Set loom status to AVAILABLE
        const emptyRun = {
          loomNo,
          designNo: '',
          currentBeamNo: '',
          loomStartDate: format(new Date(), 'yyyy-MM-dd'),
          warpedMeter: 0,
          dailyProduction: 0,
          rpm: null,
          efficiency: null,
          remarks: 'Runout Completed — Waiting for Next Plan'
        };

        await fetch(`${API_BASE_URL}/api/active-runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([emptyRun])
        });

        setSuccessMsg(`Loom L-${loomNo}: Runout Confirmed! No next plan queued; loom status set to AVAILABLE.`);
        setTransitionPromptPlan(null);
        await refreshData();
        setTimeout(() => setSuccessMsg(null), 5000);
      }
    } catch(err: any) {
      alert('Transition Error: ' + err.message);
    }
  };

  // Track dirty looms so active edits aren't overwritten during polling
  const dirtyLoomsRef = useRef<Set<number>>(new Set());
  const prevDateRef = useRef<string>(selectedProductionDate);

  // Clear dirty looms whenever user navigates or selects a different date
  useEffect(() => {
    if (prevDateRef.current !== selectedProductionDate) {
      dirtyLoomsRef.current.clear();
      prevDateRef.current = selectedProductionDate;
    }
  }, [selectedProductionDate]);

  // Fetch production logs from API
  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/production-logs`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setProductionLogs(data);
      }
    } catch (e) {
      console.error('Failed to fetch production logs', e);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Helper for consistent date string comparison (YYYY-MM-DD)
  const getLogDateStr = (l: any): string => {
    if (!l) return '';
    if (l._dateStr) return l._dateStr;
    if (typeof l.date === 'string' && l.date.length >= 10) return l.date.substring(0, 10);
    try {
      return format(new Date(l.date || l.createdAt || new Date()), 'yyyy-MM-dd');
    } catch {
      return '';
    }
  };

  // High-performance indexed maps to eliminate lag/freezing
  const logsByLoom = useMemo(() => {
    const map = new Map<number, (ProductionLogItem & { _dateStr?: string })[]>();
    for (let i = 0; i < productionLogs.length; i++) {
      const l = productionLogs[i];
      let list = map.get(l.loom_no);
      if (!list) {
        list = [];
        map.set(l.loom_no, list);
      }
      const dateStr = (typeof l.date === 'string' && l.date.length >= 10)
        ? l.date.substring(0, 10)
        : format(new Date(l.date || l.createdAt || new Date()), 'yyyy-MM-dd');
      list.push({ ...l, _dateStr: dateStr });
    }
    return map;
  }, [productionLogs]);

  const designsMap = useMemo(() => {
    const map = new Map<string, any>();
    for (let i = 0; i < designs.length; i++) {
      const d = designs[i];
      const dNo = (d.designNo || d.design_no_sp_no || '').trim().toLowerCase();
      if (dNo && !map.has(dNo)) map.set(dNo, d);
    }
    return map;
  }, [designs]);

  const ordersMap = useMemo(() => {
    const map = new Map<string, any>();
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      const dNo = (o.design_no_sp_no || '').trim().toLowerCase();
      if (dNo && !map.has(dNo)) map.set(dNo, o);
      const ibpo = (o.ibpo_no || '').trim().toLowerCase();
      if (ibpo && !map.has(ibpo)) map.set(ibpo, o);
      const ordNo = (o.order_no || '').trim().toLowerCase();
      if (ordNo && !map.has(ordNo)) map.set(ordNo, o);
    }
    return map;
  }, [orders]);

  const beamsMap = useMemo(() => {
    const map = new Map<string, any>();
    for (let i = 0; i < beams.length; i++) {
      const b = beams[i];
      if (b.beamNo) map.set(b.beamNo.toString().trim().toLowerCase(), b);
      if (b.vendorBeamNo) map.set(b.vendorBeamNo.toString().trim().toLowerCase(), b);
      if (b.beam_no) map.set(b.beam_no.toString().trim().toLowerCase(), b);
    }
    return map;
  }, [beams]);

  // Synchronous Date Change Handler: isolates date-wise production and clears carryover
  const changeSelectedDate = (newDateStr: string) => {
    if (!newDateStr) return;
    dirtyLoomsRef.current.clear();
    setSelectedProductionDate(newDateStr);

    setEntries(prevEntries => {
      const nextEntries = { ...prevEntries };
      looms.forEach(loom => {
        const activeRun = activeRuns[loom.loomNo];
        const runningDesignClean = (activeRun?.designNo || '').trim().toLowerCase();
        
        const loomLogsList = logsByLoom.get(loom.loomNo) || [];
        let dateLog = loomLogsList.find(l => {
          const lDate = getLogDateStr(l);
          return lDate === newDateStr && (!runningDesignClean || !l.design_no || isMatchingDesign(l.design_no, runningDesignClean));
        });
        if (!dateLog) {
          dateLog = loomLogsList.find(l => getLogDateStr(l) === newDateStr);
        }

        if (activeRun) {
          nextEntries[loom.loomNo] = {
            designNo: activeRun.designNo || '',
            currentBeamNo: (activeRun as any).currentBeamNo || '',
            loomStartDate: activeRun.loomStartDate || format(new Date(), 'yyyy-MM-dd'),
            warpedMeter: activeRun.warpedMeter || '',
            // Exclusively load saved production, rpm, and efficiency for newDateStr; leave blank '' if not yet entered for this date
            dailyProduction: (dateLog && dateLog.produced_meter !== undefined && dateLog.produced_meter !== null) ? dateLog.produced_meter : '',
            rpm: (dateLog && dateLog.rpm !== undefined && dateLog.rpm !== null) ? dateLog.rpm : '',
            efficiency: (dateLog && dateLog.efficiency !== undefined && dateLog.efficiency !== null) ? dateLog.efficiency : '',
            remarks: (activeRun as any).remarks || ''
          };
        } else {
          nextEntries[loom.loomNo] = {
            designNo: '',
            currentBeamNo: '',
            loomStartDate: format(new Date(), 'yyyy-MM-dd'),
            warpedMeter: '',
            dailyProduction: '',
            rpm: '',
            efficiency: '',
            remarks: ''
          };
        }
      });
      return nextEntries;
    });
  };

  // Filter active designs (excluding completed order designs unless active)
  const activeDesigns = useMemo(() => {
    const completedOrderDesignNos = new Set(
      orders
        .filter(o => o.status === 'ORDER COMPLETED' || o.status === 'Completed' || o.order_completion_status === 'COMPLETED')
        .map(o => (o.design_no_sp_no || '').trim().toLowerCase())
    );
    const activeOrderDesignNos = new Set(
      orders
        .filter(o => o.status !== 'ORDER COMPLETED' && o.status !== 'Completed' && o.order_completion_status !== 'COMPLETED')
        .map(o => (o.design_no_sp_no || '').trim().toLowerCase())
    );

    return designs.filter(d => {
      const dNo = (d.designNo || d.design_no_sp_no || '').trim().toLowerCase();
      if (activeOrderDesignNos.has(dNo)) return true;
      if (completedOrderDesignNos.has(dNo)) return false;
      return true;
    });
  }, [designs, orders]);

  // Populate state from activeRuns, looms and date-wise productionLogs
  useEffect(() => {
    setEntries(prevEntries => {
      const newEntries = { ...prevEntries };

      const completedOrderNos = new Set(
        orders
          .filter(o => o.status === 'ORDER COMPLETED' || o.status === 'Completed' || o.order_completion_status === 'COMPLETED')
          .map(o => (o.ibpo_no || o.order_no || '').trim().toLowerCase())
      );

      looms.forEach(loom => {
        let activeRun = activeRuns[loom.loomNo];

        // If active run is associated with a completed order/design, ignore it
        if (activeRun) {
          const runOrder = ((activeRun as any).orderNo || '').trim().toLowerCase();
          if (runOrder && completedOrderNos.has(runOrder)) {
            activeRun = undefined as any;
          }
        }

        // Find date-wise production log for this loom on selectedProductionDate against current design
        const runningDesignClean = (activeRun?.designNo || '').trim().toLowerCase();
        const loomLogsList = logsByLoom.get(loom.loomNo) || [];
        let dateLog = loomLogsList.find(
          l => getLogDateStr(l) === selectedProductionDate &&
          (!runningDesignClean || !l.design_no || isMatchingDesign(l.design_no, runningDesignClean))
        );
        if (!dateLog) {
          dateLog = loomLogsList.find(l => getLogDateStr(l) === selectedProductionDate);
        }

        // Only update if not dirty
        if (!dirtyLoomsRef.current.has(loom.loomNo)) {
          if (activeRun) {
            newEntries[loom.loomNo] = {
              designNo: activeRun.designNo || '',
              currentBeamNo: (activeRun as any).currentBeamNo || '',
              loomStartDate: activeRun.loomStartDate || format(new Date(), 'yyyy-MM-dd'),
              warpedMeter: activeRun.warpedMeter || '',
              dailyProduction: (dateLog && dateLog.produced_meter !== undefined && dateLog.produced_meter !== null) ? dateLog.produced_meter : '',
              rpm: (dateLog && dateLog.rpm !== undefined && dateLog.rpm !== null) ? dateLog.rpm : '',
              efficiency: (dateLog && dateLog.efficiency !== undefined && dateLog.efficiency !== null) ? dateLog.efficiency : '',
              remarks: (activeRun as any).remarks || ''
            };
          } else {
            newEntries[loom.loomNo] = {
              designNo: '',
              currentBeamNo: '',
              loomStartDate: format(new Date(), 'yyyy-MM-dd'),
              warpedMeter: '',
              dailyProduction: '',
              rpm: '',
              efficiency: '',
              remarks: ''
            };
          }
        }
      });

      return newEntries;
    });
  }, [activeRuns, looms, designs, nextPlans, orders, selectedProductionDate, productionLogs, logsByLoom]);

  // ── Build 5-plan queue per loom from rawNextPlans ──
  // Each loom gets an ordered array of up to 5 active (non-cancelled/completed) plans
  const loomNextPlansMap = useMemo(() => {
    const map: Record<number, any[]> = {};
    const activePlans = rawNextPlans.filter(
      p => {
        const st = (p.status || '').toUpperCase();
        const rSt = (p.readiness_status || '').toUpperCase();
        if (st === 'CANCELLED' || st === 'COMPLETED' || rSt === 'RUNNING IN MAIN ENTRY') return false;

        const lNo = Number(p.loom_no);
        const currentRun = (activeRuns as any)[lNo] || (activeRuns as any)[String(lNo)];
        const runningDes = (currentRun?.designNo || currentRun?.design_no_sp_no || '').trim().toLowerCase();
        const pDes = (p.next_design || '').trim().toLowerCase();

        if (st === 'CONFIRMED' && runningDes && pDes === runningDes) return false;
        return true;
      }
    );
    // Sort: by planned_sequence ASC first, then by id ASC as tiebreaker
    activePlans.sort(
      (a, b) =>
        (Number(a.planned_sequence || a.sequence) || Number(a.id) || 0) -
        (Number(b.planned_sequence || b.sequence) || Number(b.id) || 0)
    );
    activePlans.forEach(p => {
      const lNo = Number(p.loom_no);
      if (!map[lNo]) map[lNo] = [];
      if (map[lNo].length < 5) map[lNo].push(p);
    });
    return map;
  }, [rawNextPlans, activeRuns]);

  // Unique list of Units for dropdown
  const availableUnits = useMemo(() => {
    const set = new Set<string>();
    looms.forEach(l => {
      if (l.unit) set.add(l.unit);
    });
    return Array.from(set).sort();
  }, [looms]);

  // Request Admin unlock for Loom Start Date
  const handleRequestUnlockStartDate = useCallback((loomNo: number) => {
    // If already unlocked, clicking toggles back to locked
    if (unlockedLoomDates[loomNo]) {
      setUnlockedLoomDates(prev => ({ ...prev, [loomNo]: false }));
      return;
    }
    if (!isAdmin) {
      setErrorMsg(`Loom L-${loomNo}: Only Administrator ID can unlock and modify Loom Start Date.`);
      setTimeout(() => setErrorMsg(null), 4000);
      return;
    }
    setAdminUnlockModal({
      isOpen: true,
      loomNo,
      password: '',
      error: null,
      isVerifying: false
    });
  }, [unlockedLoomDates, isAdmin]);

  // Verify Admin password to unlock Start Date
  const handleVerifyAdminPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!adminUnlockModal.loomNo || !adminUnlockModal.password) {
      setAdminUnlockModal(prev => ({ ...prev, error: 'Please enter Administrator Password' }));
      return;
    }

    setAdminUnlockModal(prev => ({ ...prev, isVerifying: true, error: null }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/verify-admin-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          password: adminUnlockModal.password,
          username: user?.username || 'ADMIN'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const targetLoom = adminUnlockModal.loomNo;
        setUnlockedLoomDates(prev => ({ ...prev, [targetLoom]: true }));
        setAdminUnlockModal({ isOpen: false, loomNo: null, password: '', error: null, isVerifying: false });
        setSuccessMsg(`Loom L-${targetLoom} Start Date unlocked! Modify the date and click SAVE to lock it.`);
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setAdminUnlockModal(prev => ({ ...prev, isVerifying: false, error: data.error || 'Incorrect Administrator Password. Please try again.' }));
      }
    } catch (err: any) {
      setAdminUnlockModal(prev => ({ ...prev, isVerifying: false, error: 'Connection error while verifying password.' }));
    }
  };

  // Handle entry changes with strict Master validation
  const handleEntryChange = useCallback((loomNo: number, field: keyof EntryState, value: string | number) => {
    // Start Date cannot be changed once set for an active run, UNLESS unlocked via Admin Password
    if (field === 'loomStartDate' && activeRuns[loomNo]?.loomStartDate && !unlockedLoomDates[loomNo]) {
      setErrorMsg(`Loom L-${loomNo}: Loom Start Date is locked. Click the Lock button and enter Admin Password to unlock.`);
      setTimeout(() => setErrorMsg(null), 4000);
      return;
    }

    setEntries(prev => {
      const prevEntry = prev[loomNo] || {
        designNo: '', currentBeamNo: '', loomStartDate: format(new Date(), 'yyyy-MM-dd'),
        warpedMeter: '', dailyProduction: '', rpm: '', efficiency: '', remarks: ''
      };

      // If loom is not allocated (no running design), ignore production, rpm, and efficiency entry
      if ((field === 'dailyProduction' || field === 'rpm' || field === 'efficiency') && (!prevEntry.designNo || prevEntry.designNo.trim() === '')) {
        setErrorMsg(`Loom L-${loomNo}: Cannot enter production for a non-allocated loom. Please allocate a design first.`);
        setTimeout(() => setErrorMsg(null), 3500);
        return prev;
      }

      dirtyLoomsRef.current.add(loomNo);
      const updatedEntry = { ...prevEntry, [field]: value };

      // 1. Design & Loom Capability Validation
      if (field === 'designNo' && typeof value === 'string' && value.trim() !== '') {
        const loom = looms.find(l => l.loomNo === loomNo);
        const design = designsMap.get(value.trim().toLowerCase());
        
        if (loom && design) {
          if (design.frames > (loom.installedLever || 0)) {
            setErrorMsg(`Capability Mismatch: Design ${design.designNo} requires ${design.frames} frames, but Loom ${loom.loomNo} only has ${loom.installedLever || 0} levers.`);
            setTimeout(() => setErrorMsg(null), 6000);
          } else if (design.weftColours > (loom.weftColours || 1)) {
            setErrorMsg(`Capability Mismatch: Design requires ${design.weftColours} colours, Loom supports ${loom.weftColours || 1}.`);
            setTimeout(() => setErrorMsg(null), 6000);
          }
        }
      }

      // 2. Beam Design Match Validation
      if (field === 'currentBeamNo' || field === 'designNo') {
        const targetBeamNo = field === 'currentBeamNo' ? String(value) : updatedEntry.currentBeamNo;
        const targetDesignNo = field === 'designNo' ? String(value) : updatedEntry.designNo;

        if (targetBeamNo.trim() !== '' && targetDesignNo.trim() !== '') {
          const matchedBeam = beamsMap.get(targetBeamNo.trim().toLowerCase());

          if (matchedBeam) {
            const beamDesign = matchedBeam.designNo || matchedBeam.design_no || matchedBeam.design;
            if (beamDesign && beamDesign.trim().toLowerCase() !== targetDesignNo.trim().toLowerCase()) {
              setErrorMsg(`Beam Design Mismatch: Beam ${targetBeamNo} is for design "${beamDesign}", mismatching "${targetDesignNo}".`);
              setTimeout(() => setErrorMsg(null), 6000);
            }
          }
        }
      }

      return {
        ...prev,
        [loomNo]: updatedEntry
      };
    });
  }, [activeRuns, isAdmin, looms, designsMap, beamsMap]);

  // Excel Bulk Copy / Paste Handler with Smart Column & Loom Matching
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement | HTMLSelectElement>, startLoomNo: number, startField: keyof EntryState) => {
    e.preventDefault();
    const clipboardData = e.clipboardData.getData('Text');
    if (!clipboardData) return;

    const rows = clipboardData.split(/\r?\n/).map(r => r.trim()).filter(r => r !== '');
    if (rows.length === 0) return;

    // Start row from currently filtered and displayed looms
    const startLoomIndex = filteredLooms.findIndex(l => l.loomNo === startLoomNo);
    if (startLoomIndex === -1) return;

    setEntries(prev => {
      const newEntries = { ...prev };
      let warnings: string[] = [];

      rows.forEach((rowStr, rowIndex) => {
        const rawCells = rowStr.split('\t').map(c => c.trim());
        if (rawCells.length === 0) return;

        // Check if cell 0 represents Loom No (e.g., "1", "L-1", "Loom 1")
        let targetLoom: any = null;
        let cells = [...rawCells];

        const firstCellLoomNum = parseInt(cells[0].replace(/^[^\d]*/, ''), 10);
        const matchesExistingLoom = !isNaN(firstCellLoomNum) && looms.some(l => l.loomNo === firstCellLoomNum);

        if (matchesExistingLoom && cells.length > 1) {
          targetLoom = looms.find(l => l.loomNo === firstCellLoomNum);
          cells = cells.slice(1);
        } else {
          const targetIndex = startLoomIndex + rowIndex;
          if (targetIndex < filteredLooms.length) {
            targetLoom = filteredLooms[targetIndex];
          }
        }

        if (!targetLoom) return;
        const loomNo = targetLoom.loomNo;
        let updatedEntry = { ...newEntries[loomNo] };
        const isLoomAllocated = !!(updatedEntry.designNo && updatedEntry.designNo.trim() !== '');

        // If loom is not allocated, ignore production/rpm/efficiency paste
        if (!isLoomAllocated && (startField === 'dailyProduction' || startField === 'rpm' || startField === 'efficiency')) {
          return;
        }

        dirtyLoomsRef.current.add(loomNo);

        // Handle pasting into Daily Production (Col 13)
        if (startField === 'dailyProduction') {
          if (cells.length === 1) {
            const num = Number(cells[0].replace(/,/g, ''));
            if (!isNaN(num)) updatedEntry.dailyProduction = num;
          } else if (cells.length === 2) {
            const pNum = Number(cells[0].replace(/,/g, ''));
            if (!isNaN(pNum)) updatedEntry.dailyProduction = pNum;

            const c1 = cells[1].replace(/,/g, '').replace(/%/g, '');
            const num1 = Number(c1);
            if (!isNaN(num1)) {
              if (num1 > 100) updatedEntry.rpm = num1;
              else updatedEntry.efficiency = num1;
            }
          } else if (cells.length === 3) {
            // [Prod, RPM, Eff%]
            const pNum = Number(cells[0].replace(/,/g, ''));
            if (!isNaN(pNum)) updatedEntry.dailyProduction = pNum;

            const rNum = Number(cells[1].replace(/,/g, ''));
            if (!isNaN(rNum)) updatedEntry.rpm = rNum;

            const eNum = Number(cells[2].replace(/,/g, '').replace(/%/g, ''));
            if (!isNaN(eNum)) updatedEntry.efficiency = eNum;
          } else if (cells.length >= 4) {
            // Check if cell 1 looks like crimp (<= 15) and cell 2 looks like RPM (> 100)
            const pNum = Number(cells[0].replace(/,/g, ''));
            if (!isNaN(pNum)) updatedEntry.dailyProduction = pNum;

            const c1Num = Number(cells[1].replace(/,/g, '').replace(/%/g, ''));
            const c2Num = Number(cells[2].replace(/,/g, ''));

            if (c2Num > 100) {
              updatedEntry.rpm = c2Num;
              const c3Num = Number(cells[3].replace(/,/g, '').replace(/%/g, ''));
              if (!isNaN(c3Num)) updatedEntry.efficiency = c3Num;
            } else {
              if (!isNaN(c1Num)) updatedEntry.rpm = c1Num;
              if (!isNaN(c2Num)) updatedEntry.efficiency = c2Num;
            }
          }
        } else if (startField === 'rpm') {
          const rNum = Number(cells[0].replace(/,/g, ''));
          if (!isNaN(rNum)) updatedEntry.rpm = rNum;
          if (cells.length > 1) {
            const eNum = Number(cells[1].replace(/,/g, '').replace(/%/g, ''));
            if (!isNaN(eNum)) updatedEntry.efficiency = eNum;
          }
        } else if (startField === 'efficiency') {
          const eNum = Number(cells[0].replace(/,/g, '').replace(/%/g, ''));
          if (!isNaN(eNum)) updatedEntry.efficiency = eNum;
        } else if (startField === 'loomStartDate') {
          // Never overwrite start date if loom has active run, UNLESS unlocked via Admin Password
          if (!activeRuns[loomNo]?.loomStartDate || unlockedLoomDates[loomNo]) {
            const parsedDate = new Date(cells[0]);
            if (!isNaN(parsedDate.getTime())) {
              updatedEntry.loomStartDate = format(parsedDate, 'yyyy-MM-dd');
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) {
              updatedEntry.loomStartDate = cells[0];
            }
          }
        } else {
          // Standard mapping via TRANSACTION_FIELDS_ORDER
          const startFieldIndex = TRANSACTION_FIELDS_ORDER.indexOf(startField);
          cells.forEach((cellStr, cellIndex) => {
            const targetFieldIndex = startFieldIndex + cellIndex;
            if (targetFieldIndex < TRANSACTION_FIELDS_ORDER.length) {
              const field = TRANSACTION_FIELDS_ORDER[targetFieldIndex];
              if (field === 'loomStartDate') {
                if (!activeRuns[loomNo]?.loomStartDate || unlockedLoomDates[loomNo]) {
                  const parsedDate = new Date(cellStr);
                  if (!isNaN(parsedDate.getTime())) updatedEntry.loomStartDate = format(parsedDate, 'yyyy-MM-dd');
                  else if (/^\d{4}-\d{2}-\d{2}$/.test(cellStr)) updatedEntry.loomStartDate = cellStr;
                }
              } else if (field === 'designNo' || field === 'currentBeamNo' || field === 'remarks') {
                updatedEntry[field] = cellStr;
              } else if (field === 'warpedMeter' || field === 'dailyProduction' || field === 'rpm' || field === 'efficiency') {
                if ((field === 'dailyProduction' || field === 'rpm' || field === 'efficiency') && !isLoomAllocated) {
                  return;
                }
                const clean = cellStr.replace(/,/g, '').replace(/%/g, '');
                const num = Number(clean);
                if (!isNaN(num)) updatedEntry[field] = num;
              }
            }
          });
        }

        newEntries[loomNo] = updatedEntry;
      });

      if (warnings.length > 0) {
        setErrorMsg(`Paste Warnings: ${warnings.join(' | ')}`);
        setTimeout(() => setErrorMsg(null), 8000);
      }

      return newEntries;
    });
  };

  // Execute / Save Single Loom Entry
  const executePlan = async (loomNo: number) => {
    const entry = entries[loomNo];
    if (!entry.designNo || entry.designNo.trim() === '') {
      setErrorMsg(`Cannot save Loom ${loomNo}: Design No is required.`);
      setTimeout(() => setErrorMsg(null), 4000);
      return;
    }

    // Check beam mismatch
    if (entry.currentBeamNo && entry.currentBeamNo.trim() !== '') {
      const matchedBeam = beams.find(b => 
        (b.beamNo && b.beamNo.toString().toLowerCase() === entry.currentBeamNo.trim().toLowerCase()) ||
        (b.vendorBeamNo && b.vendorBeamNo.toString().toLowerCase() === entry.currentBeamNo.trim().toLowerCase()) ||
        (b.beam_no && b.beam_no.toString().toLowerCase() === entry.currentBeamNo.trim().toLowerCase())
      );
      if (matchedBeam) {
        const beamDesign = matchedBeam.designNo || matchedBeam.design_no || matchedBeam.design;
        if (beamDesign && beamDesign.trim().toLowerCase() !== entry.designNo.trim().toLowerCase()) {
          console.warn(`Loom ${loomNo}: Beam ${entry.currentBeamNo} belongs to design "${beamDesign}", running "${entry.designNo}".`);
        }
      }
    }

    dirtyLoomsRef.current.delete(loomNo);
    const design = designs.find(d => d.designNo === entry.designNo);

    // Save single run to backend
    const runPayload = {
      loomNo,
      designNo: entry.designNo,
      currentBeamNo: entry.currentBeamNo,
      loomStartDate: entry.loomStartDate,
      warpedMeter: Number(entry.warpedMeter || 0),
      dailyProduction: Number(entry.dailyProduction || 0),
      rpm: entry.rpm ? Number(entry.rpm) : null,
      efficiency: entry.efficiency ? Number(entry.efficiency) : null,
      crimpPercent: design && Number(design.crimpPercent) > 0 ? (design.crimpPercent > 1 ? design.crimpPercent / 100 : design.crimpPercent) : 0.05,
      remarks: entry.remarks
    };

    try {
      await fetch(`${API_BASE_URL}/api/active-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([runPayload])
      });

      // Also log daily production entry if dailyProduction is entered (including 0)
      if (entry.dailyProduction !== '' && entry.dailyProduction !== undefined && entry.dailyProduction !== null) {
        await fetch(`${API_BASE_URL}/api/production-logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loomNo,
            designNo: entry.designNo,
            producedMeter: Number(entry.dailyProduction),
            rpm: (entry.rpm !== '' && entry.rpm !== null && entry.rpm !== undefined) ? Number(entry.rpm) : null,
            efficiency: (entry.efficiency !== '' && entry.efficiency !== null && entry.efficiency !== undefined) ? Number(entry.efficiency) : null,
            remarks: entry.remarks || 'Daily production update',
            date: selectedProductionDate
          })
        });
        await fetchLogs();
      }

      await refreshData();
      // Auto-relock Loom Start Date after saving
      setUnlockedLoomDates(prev => ({ ...prev, [loomNo]: false }));
      setSuccessMsg(`Loom ${loomNo} production entry for ${format(new Date(selectedProductionDate), 'dd-MMM-yyyy')} saved!`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      setErrorMsg(`Failed to save Loom ${loomNo} entry.`);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  // Save All Transactions to Backend
  const saveAllPlans = async () => {
    if (isSavingAll) return;
    setIsSavingAll(true);
    let savedCount = 0;
    const runsArray: any[] = [];
    const consumedPlansArray: any[] = [];
    let validationErrors: string[] = [];
    let skippedBeforeStart = 0;

    // Pre-validate all entries using indexed maps
    Object.entries(entries).forEach(([key, entry]) => {
      const loomNo = Number(key);
      if (entry.designNo && entry.designNo.trim() !== '') {
        if (entry.currentBeamNo && entry.currentBeamNo.trim() !== '') {
          const matchedBeam = beamsMap.get(entry.currentBeamNo.trim().toLowerCase());
          if (matchedBeam) {
            const beamDesign = matchedBeam.designNo || matchedBeam.design_no || matchedBeam.design;
            if (beamDesign && beamDesign.trim().toLowerCase() !== entry.designNo.trim().toLowerCase()) {
              validationErrors.push(`Loom ${loomNo}: Beam ${entry.currentBeamNo} design mismatch (${beamDesign} vs ${entry.designNo}).`);
            }
          }
        }

        const hasDailyInput = entry.dailyProduction !== '' && entry.dailyProduction !== undefined && entry.dailyProduction !== null;
        const design = designsMap.get(entry.designNo.trim().toLowerCase());
        const run = {
          loomNo,
          designNo: entry.designNo,
          currentBeamNo: entry.currentBeamNo,
          loomStartDate: entry.loomStartDate,
          warpedMeter: Number(entry.warpedMeter || 0),
          dailyProduction: hasDailyInput ? Number(entry.dailyProduction) : Number(activeRuns[loomNo]?.dailyProduction || 0),
          hasDailyInput,
          rawDailyProduction: entry.dailyProduction,
          rpm: entry.rpm !== '' ? Number(entry.rpm) : null,
          efficiency: entry.efficiency !== '' ? Number(entry.efficiency) : null,
          crimpPercent: design && Number(design.crimpPercent) > 0 ? (design.crimpPercent > 1 ? design.crimpPercent / 100 : design.crimpPercent) : 0.05,
          remarks: entry.remarks
        };
        runsArray.push(run);
        savedCount++;

        if (nextPlans[loomNo] && nextPlans[loomNo].designNo === entry.designNo) {
          consumedPlansArray.push({ loomNo, designNo: '' });
        }
      }
    });

    if (validationErrors.length > 0) {
      console.warn(`Beam Design Mismatch Warnings: ${validationErrors.join(' | ')}`);
    }

    dirtyLoomsRef.current.clear();

    try {
      if (runsArray.length > 0) {
        await fetch(`${API_BASE_URL}/api/active-runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(runsArray)
        });

        // Batch save daily production logs for this date (ONLY if entered for this date)
        const validLogPayloads = runsArray
          .filter(run => run.hasDailyInput)
          .map(run => ({
            loomNo: run.loomNo,
            designNo: run.designNo,
            producedMeter: Number(run.rawDailyProduction),
            rpm: run.rpm,
            efficiency: run.efficiency,
            remarks: run.remarks || 'Daily production update',
            date: selectedProductionDate
          }));

        if (validLogPayloads.length > 0) {
          await fetch(`${API_BASE_URL}/api/production-logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validLogPayloads)
          });
        }
      }

      if (consumedPlansArray.length > 0) {
        await fetch(`${API_BASE_URL}/api/next-plans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(consumedPlansArray)
        });
      }

      await Promise.all([refreshData(), fetchLogs()]);
      // Auto-relock all start dates after saving
      setUnlockedLoomDates({});
      const skipNote = skippedBeforeStart > 0 ? ` (${skippedBeforeStart} looms skipped: entry date is prior to their start date)` : '';
      const warnNote = validationErrors.length > 0 ? ` (Note: ${validationErrors.length} beam design mismatch warning${validationErrors.length > 1 ? 's' : ''} logged)` : '';
      setSuccessMsg(`Successfully saved daily production entries for ${format(new Date(selectedProductionDate), 'dd-MMM-yyyy')} across ${savedCount} looms!${skipNote}${warnNote}`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      console.error('Error saving active runs:', err);
      setErrorMsg('Failed to save entries to backend.');
    } finally {
      setIsSavingAll(false);
    }
  };

  // Add Production Log entry via Modal
  const handleAddLog = async () => {
    if (!historyModalLoomNo) return;
    const loomNo = historyModalLoomNo;
    const entry = entries[loomNo];
    const meterVal = parseFloat(newLogMeter);

    if (isNaN(meterVal) || meterVal < 0) {
      alert('Please enter a valid production meter.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/production-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loomNo,
          designNo: entry?.designNo || '',
          producedMeter: meterVal,
          rpm: newLogRpm ? parseInt(newLogRpm, 10) : null,
          efficiency: newLogEff ? parseFloat(newLogEff) : null,
          remarks: newLogRemarks || 'Daily log entry'
        })
      });

      if (res.ok) {
        setNewLogMeter('');
        setNewLogRpm('');
        setNewLogEff('');
        setNewLogRemarks('');
        await fetchLogs();
        await refreshData();
      }
    } catch (e) {
      alert('Failed to add production log.');
    }
  };

  // Update Production Log entry via Modal
  const handleSaveEditLog = async (id: number) => {
    const meterVal = parseFloat(editLogMeter);
    if (isNaN(meterVal) || meterVal < 0) {
      alert('Please enter a valid production meter.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/production-logs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produced_meter: meterVal,
          rpm: editLogRpm ? parseInt(editLogRpm, 10) : null,
          efficiency: editLogEff ? parseFloat(editLogEff) : null,
          remarks: editLogRemarks
        })
      });

      if (res.ok) {
        setEditingLogId(null);
        await fetchLogs();
        await refreshData();
      }
    } catch (e) {
      alert('Failed to update log.');
    }
  };

  // Delete Production Log entry via Modal
  const handleDeleteLog = async (id: number) => {
    if (!window.confirm('Delete this daily production log? Runout calculations will update immediately.')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/production-logs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchLogs();
        await refreshData();
      }
    } catch (e) {
      alert('Failed to delete log.');
    }
  };

  const toggleRowExpand = useCallback((loomNo: number) => {
    setExpandedRows(prev => ({
      ...prev,
      [loomNo]: !prev[loomNo]
    }));
  }, []);

  // Filtered looms list - Optimized to avoid any lag or recalculation when no search/filters active
  const filteredLooms = useMemo(() => {
    const hasSearch = searchTerm.trim() !== '';
    const hasUnitFilter = selectedUnit !== 'ALL';
    const hasRunoutFilter = selectedRunoutFilter !== 'ALL';

    if (!hasSearch && !hasUnitFilter && !hasRunoutFilter) {
      return looms;
    }

    const q = searchTerm.toLowerCase().trim();

    return looms.filter(loom => {
      if (hasUnitFilter && loom.unit !== selectedUnit) return false;

      const entry = entries[loom.loomNo] || { designNo: '', currentBeamNo: '', loomStartDate: '' };
      const cleanDesignNo = (entry.designNo || '').trim().toLowerCase();
      const design = cleanDesignNo ? designsMap.get(cleanDesignNo) : null;
      const matchedOrder = cleanDesignNo ? ordersMap.get(cleanDesignNo) : null;

      if (hasSearch) {
        const matchesLoom = loom.loomNo.toString().includes(q);
        const matchesDesign = (entry.designNo || '').toLowerCase().includes(q);
        const matchesBeam = (entry.currentBeamNo || '').toLowerCase().includes(q);
        const matchesSet = ((entry as any).setNo || (entry as any).set_no || '').toLowerCase().includes(q);
        const matchesUnit = (loom.unit || '').toLowerCase().includes(q);
        const matchesConst = ((design?.construction || matchedOrder?.construction) || '').toLowerCase().includes(q);

        const matchesOrder = matchedOrder ? (
          (matchedOrder.ibpo_no || '').toLowerCase().includes(q) ||
          (matchedOrder.order_no || '').toLowerCase().includes(q) ||
          (matchedOrder.customer_name || '').toLowerCase().includes(q)
        ) : false;

        if (!matchesLoom && !matchesDesign && !matchesBeam && !matchesSet && !matchesUnit && !matchesConst && !matchesOrder) {
          return false;
        }
      }

      if (hasRunoutFilter) {
        const currentDesignClean = (cleanDesignNo || '').toLowerCase();
        const startDateStr = entry.loomStartDate || '';

        const loomLogsList = logsByLoom.get(loom.loomNo) || [];
        const effectiveStartDateStr = startDateStr;

        const loomLogs = loomLogsList.filter(l => {
          if (currentDesignClean && l.design_no && !isMatchingDesign(l.design_no, currentDesignClean)) return false;
          const logDateStr = getLogDateStr(l);
          if (effectiveStartDateStr && logDateStr < effectiveStartDateStr) return false;
          if (selectedProductionDate && logDateStr > selectedProductionDate) return false;
          return true;
        }).map(l => l.produced_meter);

        const totalCumulative = loomLogs.reduce((sum, val) => sum + (val || 0), 0);
        const effectivePick = design?.pick || (matchedOrder?.ppi !== undefined && matchedOrder?.ppi !== null && matchedOrder?.ppi !== '' ? String(matchedOrder.ppi) : '') || matchedOrder?.pick;
        const calc = calculateLoomRun({
          loomStartDate: effectiveStartDateStr ? new Date(effectiveStartDateStr) : (entry.loomStartDate ? new Date(entry.loomStartDate) : new Date()),
          warpedMeter: typeof entry.warpedMeter === 'number' ? entry.warpedMeter : 0,
          dailyProduction: totalCumulative > 0 ? totalCumulative : (typeof entry.dailyProduction === 'number' ? entry.dailyProduction : 0),
          crimpPercent: design && Number(design.crimpPercent) > 0 ? (design.crimpPercent > 1 ? design.crimpPercent / 100 : design.crimpPercent) : 0.05,
          rpm: entry.rpm !== '' && entry.rpm !== null && entry.rpm !== undefined ? Number(entry.rpm) : null,
          efficiency: entry.efficiency !== '' && entry.efficiency !== null && entry.efficiency !== undefined ? Number(entry.efficiency) : null,
          pick: effectivePick,
          actualProductionHistory: loomLogs
        }, selectedProductionDate ? new Date(selectedProductionDate) : new Date());

        if (selectedRunoutFilter === 'URGENT' && calc.balanceDays > 2) return false;
        if (selectedRunoutFilter === 'ALERT' && (calc.balanceDays <= 2 || calc.balanceDays > 5)) return false;
        return true;
      }

      return true;
    });
  }, [looms, entries, designsMap, ordersMap, searchTerm, selectedUnit, selectedRunoutFilter, logsByLoom]);

  // Excel Download for Main Entry Screen
  const handleExportExcel = () => {
    const rows = filteredLooms.map((loom, index) => {
      const entry = entries[loom.loomNo] || {
        designNo: '', currentBeamNo: '', loomStartDate: format(new Date(), 'yyyy-MM-dd'),
        warpedMeter: '', dailyProduction: '', rpm: '', efficiency: '', remarks: ''
      };
      const isLoomAllocated = !!(entry.designNo && entry.designNo.trim() !== '');
      const design = designs.find(d => d.designNo === entry.designNo);
      const matchedOrder = orders.find(o => 
        (o.design_no_sp_no && entry.designNo && o.design_no_sp_no.trim().toLowerCase() === entry.designNo.trim().toLowerCase())
      );
      
      const currentDesignClean = (entry.designNo || '').trim().toLowerCase();
      const startDateStr = entry.loomStartDate ? format(new Date(entry.loomStartDate), 'yyyy-MM-dd') : '';
      const startDateDisplay = startDateStr ? format(new Date(entry.loomStartDate), 'dd-MMM-yyyy') : '';

      const loomLogsList = logsByLoom.get(loom.loomNo) || [];
      const effectiveStartDateStr = startDateStr;

      const loomLogs = loomLogsList
        .filter(l => {
          if (currentDesignClean && l.design_no && !isMatchingDesign(l.design_no, currentDesignClean)) return false;
          const logDateStr = getLogDateStr(l);
          if (effectiveStartDateStr && logDateStr < effectiveStartDateStr) return false;
          if (selectedProductionDate && logDateStr > selectedProductionDate) return false;
          return true;
        })
        .map(l => l.produced_meter);
      const totalCumulativeProducedMtr = loomLogs.reduce((sum, val) => sum + (val || 0), 0);

      const beamInfo = beams.find(b => 
        (b.beamNo && entry.currentBeamNo && b.beamNo.toString().toLowerCase() === entry.currentBeamNo.trim().toLowerCase()) ||
        (b.vendorBeamNo && entry.currentBeamNo && b.vendorBeamNo.toString().toLowerCase() === entry.currentBeamNo.trim().toLowerCase()) ||
        (b.beam_no && entry.currentBeamNo && b.beam_no.toString().toLowerCase() === entry.currentBeamNo.trim().toLowerCase())
      );

      const effectiveWarpMtr =
        typeof entry.warpedMeter === 'number' && entry.warpedMeter > 0
          ? entry.warpedMeter
          : (beamInfo?.available_meter || beamInfo?.beamLength || 0);

      const rawDesignCrimp = Number(design?.crimpPercent ?? design?.crimp_percent ?? matchedOrder?.crimp_percent ?? 0);
      const effectiveCrimp = rawDesignCrimp > 0 ? (rawDesignCrimp > 1 ? rawDesignCrimp / 100 : rawDesignCrimp) : 0.05;
      const effectivePick = design?.pick || (matchedOrder?.ppi !== undefined && matchedOrder?.ppi !== null && matchedOrder?.ppi !== '' ? String(matchedOrder.ppi) : '') || matchedOrder?.pick;
      const effectiveProducedMtr = totalCumulativeProducedMtr > 0
        ? totalCumulativeProducedMtr
        : (typeof entry.dailyProduction === 'number' ? entry.dailyProduction : 0);

      const actualWarpConsumed = (entry as any).actualWarpConsumed ?? (
        beamInfo && beamInfo.total_warped_meter > 0 && beamInfo.current_balance_meter !== undefined && beamInfo.current_balance_meter !== null && beamInfo.current_balance_meter > 0 && beamInfo.current_balance_meter < beamInfo.total_warped_meter
          ? beamInfo.total_warped_meter - beamInfo.current_balance_meter
          : null
      );

      const calc = isLoomAllocated ? calculateLoomRun({
        loomStartDate: effectiveStartDateStr ? new Date(effectiveStartDateStr) : (entry.loomStartDate ? new Date(entry.loomStartDate) : new Date()),
        warpedMeter: effectiveWarpMtr,
        dailyProduction: effectiveProducedMtr,
        crimpPercent: effectiveCrimp,
        rpm: entry.rpm !== '' && entry.rpm !== null && entry.rpm !== undefined ? Number(entry.rpm) : null,
        efficiency: entry.efficiency !== '' && entry.efficiency !== null && entry.efficiency !== undefined ? Number(entry.efficiency) : null,
        pick: effectivePick,
        actualProductionHistory: loomLogs,
        actualWarpConsumed
      } as any, selectedProductionDate ? new Date(selectedProductionDate) : new Date()) : null;

      const crimpDisplayStr = isLoomAllocated
        ? (calc?.actualCrimpPercent !== null && calc?.actualCrimpPercent !== undefined
            ? `${calc.actualCrimpPercent.toFixed(1)}% (Actual)`
            : `${(calc?.standardCrimpPercent ?? (effectiveCrimp * 100)).toFixed(1)}%`)
        : '—';

      return {
        'S.No': index + 1,
        'Loom No': `L-${loom.loomNo}`,
        'Unit': loom.unit || '—',
        'Loom Type': loom.loomType || '—',
        'Running Design / SP No': entry.designNo || 'Not Allocated',
        'Construction': design?.construction || matchedOrder?.construction || '—',
        'Reed': design?.reedCount || matchedOrder?.reed || '—',
        'Pick (PPI)': design?.pick || matchedOrder?.pick || '—',
        'Width (Inch)': design?.greigeWidth || matchedOrder?.width || '—',
        'Set No': beamInfo?.setNo || beamInfo?.set_no || '—',
        'Beam No': entry.currentBeamNo || '—',
        'Start Date': isLoomAllocated ? startDateDisplay : '—',
        'Warp Length (M)': effectiveWarpMtr > 0 ? effectiveWarpMtr : '—',
        'Daily Prod (M)': (isLoomAllocated && entry.dailyProduction !== '') ? entry.dailyProduction : '—',
        'Crimp %': crimpDisplayStr,
        'RPM': (isLoomAllocated && entry.rpm !== '') ? entry.rpm : (loom.rpm || '—'),
        'Eff %': (isLoomAllocated && entry.efficiency !== '') ? `${entry.efficiency}%` : '—',
        'Produced Fabric (M)': isLoomAllocated ? (Math.round(calc?.producedMeter ?? 0)) : '—',
        'Avg Prod/Day (M)': isLoomAllocated ? (Math.round(calc?.avgProduction ?? 0)) : '—',
        'Gross Bal (M)': isLoomAllocated ? (Math.round(calc?.warpBalanceGross ?? 0)) : '—',
        'Crimp Loss (M)': isLoomAllocated ? (Math.round(calc?.crimpLossMeter ?? 0)) : '—',
        'Net Bal (M)': isLoomAllocated ? (Math.round(calc?.netBalanceMeter ?? 0)) : '—',
        'Balance Days': isLoomAllocated ? (calc?.balanceDays ?? '—') : '—',
        'Expected Runout': isLoomAllocated && calc?.expectedRunoutDate ? format(calc.expectedRunoutDate, 'dd-MMM-yyyy') : '—',
        'Status': isLoomAllocated ? 'Active Run' : 'Available',
        'Remarks': entry.remarks || '—'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Live Main Entry');
    XLSX.writeFile(workbook, `SPUPL_Main_Entry_Register_${selectedProductionDate || format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1920px] mx-auto pb-24 font-sans">
      <CompanyPrintHeader title="Main Production Entry & Live Loom Runout Register" subtitle="Operational Live Weaving Master Audit Log" />

      {/* ── Top Header Banner ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-spu-primary/10 text-spu-primary rounded-xl">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <span>Main Production Entry & Live Loom Runout Control</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">SSOT Connected</span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Live operational screen connecting Loom Master, Design Master, Order Management, Beam Stock, Production Logs & Next Plans
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportExcel}
            title="Download Excel Report"
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-700 text-white hover:bg-emerald-800 rounded-xl text-xs font-black transition-all shadow-md active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel Download</span>
          </button>

          <button
            onClick={() => triggerPrint({ orientation: 'landscape', title: 'Main Production Entry & Live Loom Runout Register' })}
            title="Print Report"
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white hover:bg-slate-900 rounded-xl text-xs font-black transition-all shadow-md active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>

          <button
            onClick={saveAllPlans}
            disabled={isSavingAll}
            className="flex items-center gap-2 px-6 py-2.5 bg-spu-primary text-white hover:bg-slate-900 rounded-xl text-xs font-black transition-all shadow-md active:scale-95 disabled:opacity-75 disabled:cursor-wait"
          >
            {isSavingAll ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving All ({Object.keys(entries).length} Looms)...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save All Transactions</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Alert Banners */}
      {errorMsg && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-amber-500 hover:text-amber-700">✕</button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">✕</button>
        </div>
      )}

      {/* ── Date-Wise Production Date Selector Bar ── */}
      <div className="bg-emerald-950 text-white p-4 rounded-2xl border border-emerald-800 shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-700/80 rounded-xl text-emerald-100 font-bold">
            <Calendar className="w-5 h-5 text-emerald-300" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-emerald-200 flex items-center gap-2">
              <span>DATE-WISE DAILY PRODUCTION ENTRY SELECTOR</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-bold">Active Entry Date</span>
            </h2>
            <p className="text-xs text-emerald-300/80 font-medium">
              Daily Production is stored date-wise for each loom. Select a date to view/edit that date's actual production. Cumulative total produced meters recalculates automatically.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-emerald-900/90 p-1.5 rounded-xl border border-emerald-700 shadow-inner">
          <button
            type="button"
            onClick={() => {
              const prev = addDays(new Date(selectedProductionDate), -1);
              changeSelectedDate(format(prev, 'yyyy-MM-dd'));
            }}
            className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 rounded-lg text-xs font-bold transition-all active:scale-95"
          >
            ◀ Previous Date
          </button>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-lg shadow-sm">
            <span className="text-[10px] font-bold text-emerald-900 uppercase">DATE:</span>
            <input
              type="date"
              value={selectedProductionDate}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={e => changeSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-black text-slate-900 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              const next = addDays(new Date(selectedProductionDate), 1);
              const todayStr = format(new Date(), 'yyyy-MM-dd');
              if (format(next, 'yyyy-MM-dd') <= todayStr) {
                changeSelectedDate(format(next, 'yyyy-MM-dd'));
              }
            }}
            disabled={selectedProductionDate >= format(new Date(), 'yyyy-MM-dd')}
            className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-40"
          >
            Next Date ▶
          </button>
        </div>
      </div>

      {/* ── Search & Filter Controls Bar ── */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          
          {/* Search Input */}
          <div className="relative flex-1 min-w-[280px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search Loom No, Design No, Beam No, Set No, Order No, Customer, Unit..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-spu-primary/30"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>

          {/* Filters Row */}
          <div className="flex items-center gap-3 text-xs">
            {/* Unit Filter */}
            <div>
              <select
                value={selectedUnit}
                onChange={e => setSelectedUnit(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white font-medium"
              >
                <option value="ALL">All Units</option>
                {availableUnits.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            {/* Runout Filter */}
            <div>
              <select
                value={selectedRunoutFilter}
                onChange={e => setSelectedRunoutFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white font-medium"
              >
                <option value="ALL">All Runout Statuses</option>
                <option value="URGENT">Urgent Runout (≤ 2 Days)</option>
                <option value="ALERT">Planning Alert (3–5 Days)</option>
                <option value="NORMAL">Normal (&gt; 5 Days)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Production Grid Table (High-Speed Excel Grid with all 30 columns) ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden print:overflow-visible print:border-none print:shadow-none">
        <div className="overflow-x-auto max-h-[calc(100vh-210px)] overflow-y-auto custom-scrollbar print:overflow-visible print:max-h-none print:h-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-900 text-white font-bold sticky top-0 z-30 shadow-md print:static print:shadow-none">
              <PrintTableHeaderRow 
                title="Main Production Entry & Live Loom Runout Register" 
                subtitle="Operational Live Weaving Master Audit Log" 
                colSpan={30} 
              />
              {/* Category Grouping Header Row */}
              <tr className="bg-slate-900 text-white uppercase text-[10px] font-black tracking-wider border-b border-slate-800 print:bg-slate-200 print:text-black">
                <th colSpan={3} className="p-2.5 bg-slate-900 border-r border-slate-800 sticky left-0 z-20">
                  <span className="text-amber-400 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" /> 1. LOOM MASTER
                  </span>
                </th>
                <th colSpan={5} className="p-2.5 bg-slate-850 border-r border-slate-800">
                  <span className="text-blue-400 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5" /> 2. DESIGN & ORDER
                  </span>
                </th>
                <th colSpan={2} className="p-2.5 bg-slate-900 border-r border-slate-800">
                  <span className="text-purple-400 flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" /> 3. BEAM & SET
                  </span>
                </th>
                <th colSpan={6} className="p-2.5 bg-slate-950 border-r border-slate-800">
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" /> 4. DAILY PRODUCTION ENTRY ★ PRIMARY
                  </span>
                </th>
                <th colSpan={7} className="p-2.5 bg-slate-900 border-r border-slate-800">
                  <span className="text-indigo-400 flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5" /> 5. LIVE RUNOUT & BALANCES
                  </span>
                </th>
                <th colSpan={4} className="p-2.5 bg-slate-950 border-r border-slate-800">
                  <span className="text-teal-400 flex items-center gap-1">
                    <ListTodo className="w-3.5 h-3.5" /> 6. NEXT 1→5 PLANS (Cascade)
                  </span>
                </th>
                <th colSpan={3} className="p-2.5 bg-slate-900 text-right">7. STATUS & ACTIONS</th>
              </tr>

              {/* Column Names Header Row */}
              <tr className="bg-slate-800 text-white uppercase text-[11px] font-black border-b-2 border-slate-700 whitespace-nowrap tracking-tight">
                {/* 1-3. Loom Master */}
                <th className="p-3 w-8 text-center sticky left-0 bg-slate-800 text-white z-10">1. S.No</th>
                <th className="p-3 sticky left-8 bg-slate-800 text-white z-10">2. Loom No</th>
                <th className="p-3 border-r border-slate-700 sticky left-24 bg-slate-800 text-white z-10">3. Unit</th>
                
                {/* 4-8. Design & Order */}
                <th className="p-3 min-w-[150px] text-white">4. Running Design</th>
                <th className="p-3 text-white">5. Construction</th>
                <th className="p-3 text-white">6. Reed</th>
                <th className="p-3 text-white">7. Pick</th>
                <th className="p-3 border-r border-slate-700 text-white">8. Width</th>

                {/* 9-10. Beam & Set */}
                <th className="p-3 text-white">9. Set No</th>
                <th className="p-3 border-r border-slate-700 text-white">10. Beam No</th>

                {/* 11-16. Production Entry */}
                <th className="p-3 text-white">11. Start Date</th>
                <th className="p-3 text-white">12. Warp Mtr</th>
                <th className="p-3 font-black text-emerald-300 bg-emerald-950/80 border-r border-slate-700">13. Daily Prod (M) ★ ({format(new Date(selectedProductionDate), 'dd-MMM')})</th>
                <th className="p-3 text-white">14. Crimp %</th>
                <th className="p-3 text-white">15. RPM <span className="text-[9px] text-amber-300">(Opt·600)</span></th>
                <th className="p-3 border-r border-slate-700 text-white">16. Eff % <span className="text-[9px] text-amber-300">(Opt·60%)</span></th>

                {/* 17-23. Calculated Balances & Runout */}
                <th className="p-3 font-extrabold text-emerald-300 bg-emerald-950/80">17. Produced Mtr</th>
                <th className="p-3 font-extrabold text-emerald-300 bg-emerald-950/80">18. Avg Prod / Day</th>
                <th className="p-3 text-white">19. Gross Balance</th>
                <th className="p-3 text-white">20. Crimp Loss</th>
                <th className="p-3 font-extrabold text-indigo-300 bg-indigo-950/80">21. Net Balance</th>
                <th className="p-3 font-black text-amber-300 bg-amber-950/80">22. Bal Days</th>
                <th className="p-3 border-r border-slate-700 text-white">23. Expected Runout Date</th>

                {/* 24-27 merged. Next Plans 1–5 */}
                <th className="p-3 min-w-[320px] border-r border-slate-700 text-teal-300 bg-teal-950/80" colSpan={4}>
                  24–27. Next Plans 1→5 (Design · Start · Beam · Status)
                </th>

                {/* 28-30 */}
                <th className="p-3 border-r border-slate-700 text-white">28. Runout Status</th>
                <th className="p-3 text-white">29. Remarks</th>
                <th className="p-3 text-right text-white">30. Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredLooms.map((loom, index) => {
                const entry = entries[loom.loomNo] || {
                  designNo: '', currentBeamNo: '', loomStartDate: format(new Date(), 'yyyy-MM-dd'),
                  warpedMeter: '', dailyProduction: '', rpm: '', efficiency: '', remarks: ''
                };

                const isExpanded = !!expandedRows[loom.loomNo];
                const cleanDesignNo = (entry.designNo || '').trim().toLowerCase();
                const design = designsMap.get(cleanDesignNo);
                const matchedOrder = ordersMap.get(cleanDesignNo);
                const nextPlan = nextPlans[loom.loomNo];

                // Beam stock & Set No connection via fast indexed map
                let beamInfo: any = null;
                let beamMismatch = false;
                const activeRunObj = activeRuns[loom.loomNo];
                let setNoDisplay = (activeRunObj as any)?.set_no || (activeRunObj as any)?.setNo || (activeRunObj as any)?.set_number || 'N/A';

                if (entry.currentBeamNo && entry.currentBeamNo.trim() !== '') {
                  beamInfo = beamsMap.get(entry.currentBeamNo.trim().toLowerCase());

                  if (beamInfo) {
                    if (setNoDisplay === 'N/A') {
                      setNoDisplay = beamInfo.setNo || beamInfo.set_no || 'N/A';
                    }
                    const bDesign = beamInfo.designNo || beamInfo.design_no || beamInfo.design;
                    if (bDesign && entry.designNo && bDesign.trim().toLowerCase() !== entry.designNo.trim().toLowerCase()) {
                      beamMismatch = true;
                    }
                  } else if (setNoDisplay === 'N/A') {
                    setNoDisplay = entry.currentBeamNo;
                  }
                }

                // Get daily logs for this loom strictly against CURRENT DESIGN and ON OR AFTER LOOM START DATE
                const currentDesignClean = (entry.designNo || '').trim().toLowerCase();
                const startDateStr = entry.loomStartDate ? format(new Date(entry.loomStartDate), 'yyyy-MM-dd') : '';
                const isDateBeforeStart = !!(startDateStr && selectedProductionDate < startDateStr);
                const startDateDisplay = startDateStr ? format(new Date(entry.loomStartDate), 'dd-MMM-yyyy') : '';

                // High-speed single-pass logs processing for this loom
                const loomAllLogs = logsByLoom.get(loom.loomNo) || [];
                let totalCumulativeProducedMtr = 0;
                const loomLogs: number[] = [];
                let hasSavedLogForSelectedDate = false;
                let hasSavedRpmForSelectedDate = false;
                let hasSavedEffForSelectedDate = false;

                // Loom start date strictly from active warp
                const effectiveStartDateStr = startDateStr;

                for (let li = 0; li < loomAllLogs.length; li++) {
                  const l = loomAllLogs[li];
                  const lDesign = (l.design_no || '').trim().toLowerCase();
                  const logDateStr = getLogDateStr(l);

                  // A saved log for the selected date marks production entered (green)
                  if (logDateStr === selectedProductionDate) {
                    if (l.produced_meter !== undefined && l.produced_meter !== null) {
                      hasSavedLogForSelectedDate = true;
                    }
                    if (l.rpm !== undefined && l.rpm !== null) {
                      hasSavedRpmForSelectedDate = true;
                    }
                    if (l.efficiency !== undefined && l.efficiency !== null) {
                      hasSavedEffForSelectedDate = true;
                    }
                  }

                  // Cumulative meters calculation for CURRENT active warp
                  if (currentDesignClean && lDesign && !isMatchingDesign(lDesign, currentDesignClean)) continue;
                  if (effectiveStartDateStr && logDateStr < effectiveStartDateStr) continue;
                  if (selectedProductionDate && logDateStr > selectedProductionDate) continue;

                  const pVal = l.produced_meter || 0;
                  loomLogs.push(pVal);
                  totalCumulativeProducedMtr += pVal;
                }

                // Production status: Positive production (>0 M) is Green; No production (0 M or unentered) is Red
                const isLoomAllocated = !!(entry.designNo && entry.designNo.trim() !== '');
                const hasDraftInput = isLoomAllocated && entry.dailyProduction !== '' && entry.dailyProduction !== undefined && entry.dailyProduction !== null;
                const draftVal = hasDraftInput ? Number(entry.dailyProduction) : null;
                const isProductionPositive = isLoomAllocated && draftVal !== null && draftVal > 0;
                const isNoProduction = isLoomAllocated && (!hasDraftInput || draftVal === 0);
                const isMissingProduction = isNoProduction;

                const hasDraftRpm = isLoomAllocated && entry.rpm !== '' && entry.rpm !== undefined && entry.rpm !== null;
                const isMissingRpm = isLoomAllocated && !hasSavedRpmForSelectedDate && !hasDraftRpm;

                const hasDraftEff = isLoomAllocated && entry.efficiency !== '' && entry.efficiency !== undefined && entry.efficiency !== null;
                const isMissingEff = isLoomAllocated && !hasSavedEffForSelectedDate && !hasDraftEff;

                // Calculate Runout Metrics using cumulative total production up to selected date (+ today's draft if not yet saved)
                const effectiveWarpMtr =
                  typeof entry.warpedMeter === 'number' && entry.warpedMeter > 0
                    ? entry.warpedMeter
                    : (beamInfo?.available_meter || beamInfo?.beamLength || 0);

                const rawDesignCrimp = Number(design?.crimpPercent ?? design?.crimp_percent ?? matchedOrder?.crimp_percent ?? 0);
                const effectiveCrimp = rawDesignCrimp > 0 ? (rawDesignCrimp > 1 ? rawDesignCrimp / 100 : rawDesignCrimp) : 0.05;
                const effectivePick = design?.pick || (matchedOrder?.ppi !== undefined && matchedOrder?.ppi !== null && matchedOrder?.ppi !== '' ? String(matchedOrder.ppi) : '') || matchedOrder?.pick;
                
                const draftTodayMeter = (!hasSavedLogForSelectedDate && hasDraftInput && typeof entry.dailyProduction === 'number')
                  ? entry.dailyProduction
                  : 0;
                const effectiveProducedMtr = totalCumulativeProducedMtr + draftTodayMeter;
                const effectiveHistory = draftTodayMeter > 0 ? [...loomLogs, draftTodayMeter] : loomLogs;

                const actualWarpConsumed = (entry as any).actualWarpConsumed ?? (
                  beamInfo && beamInfo.total_warped_meter > 0 && beamInfo.current_balance_meter !== undefined && beamInfo.current_balance_meter !== null && beamInfo.current_balance_meter > 0 && beamInfo.current_balance_meter < beamInfo.total_warped_meter
                    ? beamInfo.total_warped_meter - beamInfo.current_balance_meter
                    : null
                );

                const calc: CalculatedLoomRun = calculateLoomRun({
                  loomStartDate: effectiveStartDateStr ? new Date(effectiveStartDateStr) : (entry.loomStartDate ? new Date(entry.loomStartDate) : new Date()),
                  warpedMeter: effectiveWarpMtr,
                  dailyProduction: effectiveProducedMtr,
                  crimpPercent: effectiveCrimp,
                  rpm: entry.rpm !== '' && entry.rpm !== null && entry.rpm !== undefined ? Number(entry.rpm) : null,
                  efficiency: entry.efficiency !== '' && entry.efficiency !== null && entry.efficiency !== undefined ? Number(entry.efficiency) : null,
                  pick: effectivePick,
                  actualProductionHistory: effectiveHistory,
                  actualWarpConsumed
                } as any, selectedProductionDate ? new Date(selectedProductionDate) : new Date());

                // Build next-plan list for this loom with cascading expected start/runout dates
                const nextPlansList = loomNextPlansMap[loom.loomNo] || [];
                // Default avg production for forecasting future plans (use actual if available)
                const forecastAvgProd = calc.avgProduction > 0 ? calc.avgProduction : 300;

                // Cascade: compute expected start/runout for each queued plan
                const cascadedPlans = nextPlansList.map((plan, idx) => {
                  // Expected start of this plan = runout of the previous step + 1 day
                  let expectedStart: Date;
                  if (idx === 0) {
                    // Plan 1 starts after current loom's runout
                    expectedStart =
                      calc.balanceDays === 999999
                        ? addDays(new Date(), 1)
                        : addDays(calc.expectedRunoutDate, 1);
                  } else {
                    expectedStart = addDays(cascadedPlans[idx - 1].expectedRunout, 1);
                  }

                  // Find beam for this plan (if allocated)
                  const planBeamNo = plan.reserved_beam_no || '';
                  const planBeamInfo = planBeamNo ? beamsMap.get(planBeamNo.toLowerCase()) : null;

                  // Warp meter for this plan: from allocated beam or planned field
                  const planWarpMtr =
                    Number(planBeamInfo?.available_meter || planBeamInfo?.beamLength || 0) ||
                    Number(plan.planned_warp_meter) ||
                    1800; // safe default

                  // Plan's own design crimp
                  const planDesign = plan.next_design ? designsMap.get((plan.next_design || '').trim().toLowerCase()) : null;
                  const planCrimp = planDesign?.crimpPercent ?? 0;
                  const planAvgProd = Number(plan.planned_avg_daily_production) || forecastAvgProd;

                  // Net balance for this plan
                  const planGrossBal = planWarpMtr; // no production yet
                  const planCrimpLoss = planGrossBal * planCrimp;
                  const planNetBal = Math.max(0, planGrossBal - planCrimpLoss);
                  const planBalanceDays = planAvgProd > 0 ? planNetBal / planAvgProd : 0;
                  const expectedRunout = addDays(expectedStart, Math.ceil(planBalanceDays));

                  // Determine plan status label
                  const rawStatus = (plan.status || '').toUpperCase();
                  let statusLabel = rawStatus || 'PLANNED';
                  if (plan.beam_status === 'BEAM ALLOCATED') statusLabel = 'BEAM ALLOCATED';
                  if (rawStatus === 'CONFIRMED') statusLabel = 'CONFIRMED ✓';
                  if (!planBeamNo) statusLabel = 'BEAM PENDING';

                  return {
                    plan,
                    expectedStart,
                    expectedRunout,
                    planWarpMtr,
                    planBalanceDays,
                    planAvgProd,
                    planBeamNo,
                    statusLabel
                  };
                });

                return (
                  <React.Fragment key={loom.loomNo}>
                    <tr className={`hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors ${beamMismatch ? 'bg-red-50/60 dark:bg-red-950/40' : ''}`}>
                      
                      {/* 1. S.No (#) */}
                      <td className="p-3 text-center sticky left-0 bg-white dark:bg-slate-800 z-10">
                        <div className="flex items-center gap-1 justify-center">
                          <button
                            onClick={() => toggleRowExpand(loom.loomNo)}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                            title="Toggle 9-Dimension Details Drawer"
                          >
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <span className="text-xs text-slate-700 dark:text-slate-300 font-extrabold font-mono">{index + 1}</span>
                        </div>
                      </td>

                      {/* 2. Loom No */}
                      <td className="p-3 font-black text-slate-900 dark:text-white sticky left-8 bg-white dark:bg-slate-800 z-10">
                        <div className="flex items-center gap-1.5">
                          <span className="text-spu-primary font-black text-xs">L-{loom.loomNo}</span>
                          <span title="Loom Master Data (Locked)"><Lock className="w-3.5 h-3.5 text-amber-600 opacity-80" /></span>
                        </div>
                      </td>

                      {/* 3. Unit */}
                      <td className="p-3 border-r border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-slate-100 sticky left-24 bg-white dark:bg-slate-800 z-10">
                        <div>{loom.unit || 'UNIT 1'}</div>
                      </td>

                      {/* 4. Current Running Design */}
                      <td className="p-3">
                        <select
                          value={entry.designNo}
                          onChange={e => handleEntryChange(loom.loomNo, 'designNo', e.target.value)}
                          onPaste={e => handlePaste(e as any, loom.loomNo, 'designNo')}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-black text-slate-950 dark:text-white focus:ring-2 focus:ring-spu-primary/30 focus:border-indigo-600 shadow-sm"
                        >
                          <option value="">-- Select Design --</option>
                          {activeDesigns.map(d => (
                            <option key={d.designNo} value={d.designNo}>{d.designNo}</option>
                          ))}
                        </select>
                      </td>

                      {/* 5. Construction */}
                      <td className="p-3 text-xs font-bold text-slate-950 dark:text-slate-100">
                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700/60 rounded-md border border-slate-300 dark:border-slate-600 block truncate max-w-[130px]" title={design?.construction || matchedOrder?.construction || matchedOrder?.designMaster?.construction || 'N/A'}>
                          {design?.construction || matchedOrder?.construction || matchedOrder?.designMaster?.construction || 'Select Design'}
                        </span>
                      </td>

                      {/* 6. Reed Count */}
                      <td className="p-3 text-xs font-bold text-slate-950 dark:text-slate-100">
                        {design?.reedCount || design?.reed_count || matchedOrder?.reed_count || matchedOrder?.reedCount || matchedOrder?.designMaster?.reed_count || '—'}
                      </td>

                      {/* 7. Pick */}
                      <td className="p-3 text-xs font-bold text-slate-950 dark:text-slate-100">
                        {(() => {
                          const constStr = design?.construction || matchedOrder?.construction || matchedOrder?.designMaster?.construction || '';
                          const parsedPick = constStr.match(/\b\d+\s*x\s*(\d+)\b/i)?.[1] || constStr.match(/\bX\s*(\d+)\b/i)?.[1] || '';
                          return design?.pick || (matchedOrder?.ppi !== undefined && matchedOrder?.ppi !== null && matchedOrder?.ppi !== '' ? String(matchedOrder.ppi) : '') || matchedOrder?.pick || matchedOrder?.designMaster?.pick || parsedPick || '—';
                        })()}
                      </td>

                      {/* 8. Greige Width */}
                      <td className="p-3 border-r border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-950 dark:text-slate-100">
                        {design?.greigeWidth || design?.greige_width || matchedOrder?.greige_width || matchedOrder?.width || matchedOrder?.required_reed_space || matchedOrder?.designMaster?.greige_width || design?.reedSpace || '—'}
                      </td>

                      {/* 9. Set No */}
                      <td className="p-3 font-black text-slate-950 dark:text-slate-100 text-xs">
                        {setNoDisplay}
                      </td>

                      {/* 10. Beam No (Read-Only - Allocated via Loom Planning Setup) */}
                      <td className="p-3 border-r border-slate-300 dark:border-slate-700 font-bold text-xs">
                        <div className="flex items-center space-x-1">
                          <span className={`px-2.5 py-1 rounded-md border text-xs font-mono font-extrabold ${
                            entry.currentBeamNo ? 'bg-indigo-100 text-indigo-950 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-200' : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300'
                          }`} title="Beam No allocated from Loom Planning Setup (Read-Only)">
                            {entry.currentBeamNo || 'Not Allocated'}
                          </span>
                          <span title="Locked from Loom Planning Setup">
                            <Lock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                          </span>
                        </div>
                      </td>

                      {/* 11. Start Date (Locked by default - Admin Password required to unlock) */}
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="date"
                            value={entry.loomStartDate}
                            disabled={!unlockedLoomDates[loom.loomNo]}
                            readOnly={!unlockedLoomDates[loom.loomNo]}
                            onChange={e => handleEntryChange(loom.loomNo, 'loomStartDate', e.target.value)}
                            onPaste={e => handlePaste(e as any, loom.loomNo, 'loomStartDate')}
                            className={`px-2 py-1.5 rounded-lg border text-xs font-extrabold shadow-sm ${
                              !unlockedLoomDates[loom.loomNo]
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 cursor-not-allowed'
                                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-200 border-emerald-400 focus:border-emerald-600 ring-2 ring-emerald-200'
                            }`}
                            title={
                              unlockedLoomDates[loom.loomNo]
                                ? 'UNLOCKED: Edit Start Date now. It will auto-relock on Save.'
                                : 'LOCKED: Click the Lock button to enter Admin Password & unlock.'
                            }
                          />
                          <button
                            type="button"
                            onClick={() => handleRequestUnlockStartDate(loom.loomNo)}
                            className={`p-1.5 rounded-lg border text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-xs active:scale-95 ${
                              unlockedLoomDates[loom.loomNo]
                                ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300'
                                : 'bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 border-slate-300'
                            }`}
                            title={
                              unlockedLoomDates[loom.loomNo]
                                ? 'Unlocked: Click to re-lock immediately'
                                : 'Locked: Click to enter Admin Password & unlock Start Date'
                            }
                          >
                            {unlockedLoomDates[loom.loomNo] ? (
                              <Unlock className="w-3.5 h-3.5 text-emerald-700" />
                            ) : (
                              <Lock className="w-3.5 h-3.5 text-amber-600" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* 12. Warp Meter */}
                      <td className="p-3">
                        <input
                          type="number"
                          value={entry.warpedMeter}
                          placeholder="Warp Mtr"
                          onChange={e => handleEntryChange(loom.loomNo, 'warpedMeter', e.target.value === '' ? '' : Number(e.target.value))}
                          onPaste={e => handlePaste(e as any, loom.loomNo, 'warpedMeter')}
                          className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-extrabold text-slate-950 dark:text-white shadow-sm focus:border-indigo-600 placeholder:text-slate-500 placeholder:font-normal"
                        />
                      </td>

                      {/* 13. Daily Production Meter */}
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          {isNoProduction && (
                            <span
                              className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 inline-block animate-pulse"
                              title={hasDraftInput && draftVal === 0 ? "Zero production (0 M) for selected date" : "Production not entered for selected date"}
                            />
                          )}
                          {isProductionPositive && (
                            <span
                              className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 inline-block"
                              title={`Production updated: ${draftVal} M`}
                            />
                          )}
                          <input
                            type="number"
                            value={!isLoomAllocated ? '' : entry.dailyProduction}
                            disabled={!isLoomAllocated}
                            placeholder={!isLoomAllocated ? 'Not Allocated' : 'Daily Mtr'}
                            onChange={e => {
                              if (!isLoomAllocated) return;
                              handleEntryChange(loom.loomNo, 'dailyProduction', e.target.value === '' ? '' : Number(e.target.value));
                            }}
                            onPaste={e => {
                              if (!isLoomAllocated) return;
                              handlePaste(e as any, loom.loomNo, 'dailyProduction');
                            }}
                            className={`w-24 px-2.5 py-1.5 rounded-lg border-2 text-xs font-black shadow-sm focus:outline-none placeholder:text-slate-400 placeholder:font-normal ${
                              !isLoomAllocated
                                ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60 text-slate-400'
                                : isNoProduction
                                  ? 'bg-red-50 dark:bg-red-950/30 border-red-500 dark:border-red-500 text-red-900 dark:text-red-200 focus:border-red-600 placeholder:text-red-400 dark:placeholder:text-red-500'
                                  : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 dark:border-emerald-500 text-slate-950 dark:text-white focus:border-emerald-600'
                            }`}
                            title={
                              !isLoomAllocated
                                ? 'Loom is not allocated. Production entry is disabled.'
                                : isNoProduction
                                  ? (hasDraftInput && draftVal === 0 ? 'Zero production (0 M) for selected date' : 'Production not entered for selected date')
                                  : `Production updated: ${draftVal} M for selected date`
                            }
                          />
                        </div>
                      </td>

                      {/* 14. Crimp % */}
                      <td className="p-3 text-xs font-extrabold text-slate-950 dark:text-slate-100">
                        {(() => {
                          if (!isLoomAllocated) return '—';
                          if (calc?.actualCrimpPercent !== null && calc?.actualCrimpPercent !== undefined) {
                            return (
                              <div title={`Actual Crimp: ${calc.actualCrimpPercent.toFixed(2)}% | Standard: ${(calc.standardCrimpPercent ?? 5).toFixed(1)}%`}>
                                <span>{calc.actualCrimpPercent.toFixed(1)}%</span>
                                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 block font-bold">ACTUAL</span>
                              </div>
                            );
                          }
                          const stdVal = calc?.standardCrimpPercent ?? (effectiveCrimp * 100);
                          return (
                            <div title={`Standard Crimp: ${stdVal.toFixed(1)}%`}>
                              <span>{stdVal.toFixed(1)}%</span>
                            </div>
                          );
                        })()}
                      </td>

                      {/* 15. RPM (Optional - Default 600) */}
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          {isMissingRpm && (
                            <span
                              className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 inline-block animate-pulse"
                              title="RPM not entered for selected date"
                            />
                          )}
                          <input
                            type="number"
                            value={!isLoomAllocated ? '' : entry.rpm}
                            disabled={!isLoomAllocated}
                            placeholder={!isLoomAllocated ? '—' : '600'}
                            onChange={e => {
                              if (!isLoomAllocated) return;
                              handleEntryChange(loom.loomNo, 'rpm', e.target.value === '' ? '' : Number(e.target.value));
                            }}
                            onPaste={e => {
                              if (!isLoomAllocated) return;
                              handlePaste(e as any, loom.loomNo, 'rpm');
                            }}
                            className={`w-20 px-2.5 py-1.5 rounded-lg border-2 text-xs font-black text-slate-950 dark:text-white shadow-sm focus:border-emerald-600 placeholder:text-slate-400 placeholder:font-normal ${
                              !isLoomAllocated
                                ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60 text-slate-400'
                                : isMissingRpm
                                  ? 'bg-emerald-50/30 dark:bg-emerald-950/20 border-red-400 dark:border-red-600'
                                  : 'bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-600'
                            }`}
                            title={!isLoomAllocated ? 'Loom is not allocated' : 'RPM for selected date'}
                          />
                        </div>
                      </td>

                      {/* 16. Efficiency % (Optional - Default 60%) */}
                      <td className="p-3 border-r border-slate-300 dark:border-slate-700">
                        <div className="flex items-center gap-1.5">
                          {isMissingEff && (
                            <span
                              className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 inline-block animate-pulse"
                              title="Efficiency not entered for selected date"
                            />
                          )}
                          <input
                            type="number"
                            value={!isLoomAllocated ? '' : entry.efficiency}
                            disabled={!isLoomAllocated}
                            placeholder={!isLoomAllocated ? '—' : '60%'}
                            onChange={e => {
                              if (!isLoomAllocated) return;
                              handleEntryChange(loom.loomNo, 'efficiency', e.target.value === '' ? '' : Number(e.target.value));
                            }}
                            onPaste={e => {
                              if (!isLoomAllocated) return;
                              handlePaste(e as any, loom.loomNo, 'efficiency');
                            }}
                            className={`w-20 px-2.5 py-1.5 rounded-lg border-2 text-xs font-black text-slate-950 dark:text-white shadow-sm focus:border-emerald-600 placeholder:text-slate-400 placeholder:font-normal ${
                              !isLoomAllocated
                                ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60 text-slate-400'
                                : isMissingEff
                                  ? 'bg-emerald-50/30 dark:bg-emerald-950/20 border-red-400 dark:border-red-600'
                                  : 'bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-600'
                            }`}
                            title={!isLoomAllocated ? 'Loom is not allocated' : 'Efficiency % for selected date'}
                          />
                        </div>
                      </td>

                      {/* 17. Produced Meter */}
                      <td className="p-3 font-extrabold text-emerald-700 dark:text-emerald-400 text-xs">
                        {calc.producedMeter > 0 ? `${calc.producedMeter.toFixed(0)} M` : '0 M'}
                      </td>

                      {/* 18. Average Production / Day */}
                      <td className="p-3 font-extrabold text-emerald-700 dark:text-emerald-400 text-xs">
                        {calc.avgProduction > 0 ? `${calc.avgProduction.toFixed(1)} M/d` : '—'}
                      </td>

                      {/* 19. Gross Warp Balance */}
                      <td className="p-3 text-xs font-bold text-slate-950 dark:text-slate-100">
                        {calc.warpBalanceGross.toFixed(0)} M
                      </td>

                      {/* 20. Crimp Loss */}
                      <td className="p-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {calc.crimpLossMeter.toFixed(0)} M
                      </td>

                      {/* 21. Net Warp Balance */}
                      <td className="p-3 font-black text-indigo-950 dark:text-indigo-200 text-xs">
                        <span className="bg-indigo-100/70 dark:bg-indigo-950/60 px-2 py-1 rounded border border-indigo-200 dark:border-indigo-800 inline-block">
                          {calc.netBalanceMeter.toFixed(0)} M
                        </span>
                      </td>

                      {/* 22. Balance Days */}
                      <td className="p-3 font-black text-amber-900 dark:text-amber-200 text-xs">
                        <span className="bg-amber-100/70 dark:bg-amber-950/60 px-2 py-1 rounded border border-amber-200 dark:border-amber-800 inline-block">
                          {calc.balanceDays === 999999 ? '—' : `${calc.balanceDays.toFixed(1)} d`}
                        </span>
                      </td>

                      {/* 23. Expected Runout Date */}
                      <td className="p-3 border-r border-slate-300 dark:border-slate-700 font-extrabold text-slate-950 dark:text-white text-xs">
                        {calc.runoutStatus === 'DATA REQUIRED' || calc.balanceDays === 999999 ? (
                          <span className="text-slate-500 text-xs font-medium">Calculating...</span>
                        ) : (
                          <div>
                            <div className="font-black text-slate-950 dark:text-white">{format(calc.expectedRunoutDate, 'dd-MMM-yyyy')}</div>
                            <div className={`text-[10px] font-bold ${calc.balanceDays <= 2 ? 'text-red-700 font-black' : 'text-slate-500'}`}>
                              {calc.balanceDays.toFixed(1)} Days
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 24-27. Next 1–5 Plans (compact cascading queue) */}
                      <td className="p-2 text-[10px]" colSpan={4}>
                        {cascadedPlans.length === 0 ? (
                          <span className="text-slate-400 italic">No next plans queued</span>
                        ) : (
                          <div className="space-y-1.5">
                            {cascadedPlans.map((cp, idx) => (
                              <div
                                key={cp.plan.id || idx}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${
                                  idx === 0
                                    ? 'bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:border-teal-800'
                                    : 'bg-slate-50 border-slate-200 dark:bg-slate-800/40 dark:border-slate-700'
                                }`}
                              >
                                {/* Plan badge */}
                                <span className={`shrink-0 font-black text-[9px] px-1.5 py-0.5 rounded-full ${
                                  idx === 0 ? 'bg-teal-600 text-white' : 'bg-slate-400 text-white'
                                }`}>
                                  N{idx + 1}
                                </span>

                                {/* Design */}
                                <span className="font-bold text-slate-900 dark:text-white truncate max-w-[90px]" title={cp.plan.next_design}>
                                  {cp.plan.next_design || '—'}
                                </span>

                                {/* Expected Start */}
                                <span className="text-slate-500 dark:text-slate-400 shrink-0">
                                  {format(cp.expectedStart, 'dd-MMM')}
                                </span>

                                {/* Beam badge */}
                                {cp.planBeamNo ? (
                                  <span className="text-indigo-700 dark:text-indigo-300 font-semibold shrink-0 text-[9px]">
                                    B:{cp.planBeamNo}
                                  </span>
                                ) : (
                                  <span className="text-amber-600 font-semibold shrink-0 text-[9px]">NO BEAM</span>
                                )}

                                {/* Status */}
                                <span className={`shrink-0 text-[9px] font-bold px-1 py-0.5 rounded ${
                                  cp.statusLabel.includes('CONFIRMED') ? 'text-emerald-700 bg-emerald-100' :
                                  cp.statusLabel.includes('BEAM ALLOCATED') ? 'text-indigo-700 bg-indigo-100' :
                                  cp.statusLabel.includes('BEAM PENDING') ? 'text-amber-700 bg-amber-100' :
                                  'text-slate-500 bg-slate-100'
                                }`}>
                                  {cp.statusLabel}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* 28. Runout Status Badge */}
                      <td className="p-3 border-r border-slate-200 dark:border-slate-700">
                        <span className={`px-2.5 py-1 rounded-full font-black text-[9px] block text-center whitespace-nowrap ${
                          calc.runoutStatus === 'RUNOUT <= 2 DAYS' || calc.runoutStatus === 'RUNOUT <= 1 DAY' || calc.runoutStatus === 'RUNOUT OVERDUE'
                            ? 'bg-red-100 text-red-800 border border-red-300 animate-pulse'
                            : calc.runoutStatus === 'RUNOUT <= 5 DAYS'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : calc.runoutStatus === 'RUNOUT <= 10 DAYS'
                            ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                            : calc.runoutStatus === 'DATA REQUIRED'
                            ? 'bg-slate-100 text-slate-500 border border-slate-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}>
                          {calc.runoutStatus}
                        </span>
                      </td>

                      {/* 29. Remarks */}
                      <td className="p-3">
                        <input
                          type="text"
                          value={entry.remarks}
                          placeholder="Remarks"
                          onChange={e => handleEntryChange(loom.loomNo, 'remarks', e.target.value)}
                          className="w-24 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                        />
                      </td>

                      {/* 30. Actions */}
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setHistoryModalLoomNo(loom.loomNo)}
                            className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold flex items-center gap-1 border border-blue-200"
                            title="Daily Production History & Edit Modal"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Logs</span>
                          </button>
                          <button
                            onClick={() => executePlan(loom.loomNo)}
                            disabled={beamMismatch}
                            className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors disabled:opacity-40"
                          >
                            Save
                          </button>
                        </div>
                      </td>

                    </tr>

                    {/* ── Comprehensive 9-Dimension Expanded Operational Drawer ── */}
                    {isExpanded && (
                      <tr className="bg-slate-50/90 dark:bg-slate-900/70">
                        <td colSpan={30} className="p-5">
                          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg space-y-6 text-xs">
                            
                            {/* Drawer Header */}
                            <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
                              <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-spu-primary text-white rounded-xl font-black text-sm">
                                  L-{loom.loomNo}
                                </div>
                                <div>
                                  <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                    Loom {loom.loomNo} Complete Operational Record
                                  </h3>
                                  <p className="text-xs text-slate-500">Unit: {loom.unit || 'UNIT 1'} | Type: {loom.loomType} | Status: {loom.status || 'Active'}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`px-3 py-1 rounded-full font-bold text-xs ${
                                  calc.confidenceLevel === 'HIGH CONFIDENCE' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                                  calc.confidenceLevel === 'MEDIUM CONFIDENCE' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                                  'bg-amber-100 text-amber-800 border border-amber-300'
                                }`}>
                                  Source: {calc.runoutSource} ({calc.confidenceLevel})
                                </span>
                              </div>
                            </div>

                            {/* 9-Dimension Section Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                              
                              {/* 1. LOOM MASTER PANEL */}
                              <div className="p-4 bg-slate-50 dark:bg-slate-750 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                                <h4 className="font-black uppercase text-[11px] text-amber-600 flex items-center gap-1.5">
                                  <Building2 className="w-4 h-4" /> 1. Loom Master Details
                                </h4>
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                                  <div>Unit: <span className="font-bold">{loom.unit || 'UNIT 1'}</span></div>
                                  <div>Type: <span className="font-bold">{loom.loomType}</span></div>
                                  <div>Make: <span className="font-bold">{loom.make || 'N/A'}</span></div>
                                  <div>Model: <span className="font-bold">{loom.model || 'N/A'}</span></div>
                                  <div>Colours: <span className="font-bold">{loom.weftColours || 1}</span></div>
                                  <div>Width: <span className="font-bold">{loom.width || '190 CM'}</span></div>
                                  <div>Levers: <span className="font-bold">{loom.installedLever || 0}</span></div>
                                  <div>Beam Dia: <span className="font-bold">{loom.beamDia || 800} MM</span></div>
                                </div>
                              </div>

                              {/* 2. DESIGN MASTER PANEL */}
                              <div className="p-4 bg-slate-50 dark:bg-slate-750 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                                <h4 className="font-black uppercase text-[11px] text-blue-600 flex items-center gap-1.5">
                                  <Layers className="w-4 h-4" /> 2. Design Master Details
                                </h4>
                                {design || matchedOrder ? (
                                   <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                                     <div>Design: <span className="font-bold text-spu-primary">{design?.designNo || matchedOrder?.design_no_sp_no || entry.designNo}</span></div>
                                     <div>Construction: <span className="font-bold">{design?.construction || matchedOrder?.construction || '—'}</span></div>
                                     <div>Weave: <span className="font-bold">{design?.weaveType || matchedOrder?.weave_type || '—'}</span></div>
                                     <div>Frames: <span className="font-bold">{design?.frames || matchedOrder?.frames || '—'}</span></div>
                                     <div>Reed: <span className="font-bold">{design?.reedCount || design?.reed_count || matchedOrder?.reed_count || '—'}</span></div>
                                     <div>Pick: <span className="font-bold">{design?.pick || (matchedOrder?.ppi ? String(matchedOrder.ppi) : '') || matchedOrder?.pick || '—'}</span></div>
                                     <div>Greige W: <span className="font-bold">{design?.greigeWidth || matchedOrder?.greige_width || matchedOrder?.width || matchedOrder?.required_reed_space || '—'}</span></div>
                                      <div>Crimp: <span className="font-bold">{calc?.actualCrimpPercent !== null && calc?.actualCrimpPercent !== undefined ? `${calc.actualCrimpPercent.toFixed(1)}% (Actual)` : `${(calc?.standardCrimpPercent ?? (effectiveCrimp * 100)).toFixed(1)}%`}</span></div>
                                   </div>
                                 ) : (
                                   <p className="text-slate-400 text-[11px]">No design selected.</p>
                                 )}
                              </div>

                              {/* 3. ORDER DETAILS PANEL */}
                              <div className="p-4 bg-slate-50 dark:bg-slate-750 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                                <h4 className="font-black uppercase text-[11px] text-purple-600 flex items-center gap-1.5">
                                  <ShoppingBag className="w-4 h-4" /> 3. Connected Order Details
                                </h4>
                                {matchedOrder ? (
                                  <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                                    <div>Order No: <span className="font-bold text-spu-primary">{matchedOrder.order_no}</span></div>
                                    <div>Customer: <span className="font-bold">{matchedOrder.customer_name}</span></div>
                                    <div>Order Qty: <span className="font-bold">{matchedOrder.order_qty?.toLocaleString()} M</span></div>
                                    <div>Warp Qty: <span className="font-bold">{matchedOrder.warp_qty?.toLocaleString()} M</span></div>
                                    <div>Delivery: <span className="font-bold">{matchedOrder.target_delivery_date ? format(new Date(matchedOrder.target_delivery_date), 'dd-MMM-yyyy') : 'N/A'}</span></div>
                                    <div>Status: <span className="font-bold text-emerald-600">{matchedOrder.status}</span></div>
                                  </div>
                                ) : (
                                  <p className="text-slate-400 text-[11px]">No active order connected to this design.</p>
                                )}
                              </div>

                              {/* 4. BEAM & SET PANEL */}
                              <div className="p-4 bg-slate-50 dark:bg-slate-750 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                                <h4 className="font-black uppercase text-[11px] text-indigo-600 flex items-center gap-1.5">
                                  <Package className="w-4 h-4" /> 4. Beam & Set Stock Details
                                </h4>
                                {beamInfo ? (
                                  <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                                    <div>Beam No: <span className="font-bold">{beamInfo.beamNo || beamInfo.beam_no}</span></div>
                                    <div>Set No: <span className="font-bold text-spu-primary">{setNoDisplay}</span></div>
                                    <div>Vendor DC: <span className="font-bold">{beamInfo.warpingDcNo || beamInfo.warp_dc_no || 'N/A'}</span></div>
                                    <div>Vendor: <span className="font-bold">{beamInfo.vendor_name || beamInfo.warpingVendor || 'SPUPL'}</span></div>
                                    <div>Warp Meter: <span className="font-bold">{(beamInfo.beamLength || beamInfo.available_meter || 0).toLocaleString()} M</span></div>
                                    <div>Sizing Status: <span className="font-bold text-emerald-600">{beamInfo.sizingStatus || 'READY'}</span></div>
                                  </div>
                                ) : (
                                  <div className="text-[11px] space-y-1">
                                    <div>Beam No: <span className="font-bold">{entry.currentBeamNo || 'Not Entered'}</span></div>
                                    <div>Set No: <span className="font-bold">{setNoDisplay}</span></div>
                                  </div>
                                )}
                              </div>

                              {/* 5. REED DETAILS PANEL */}
                              <div className="p-4 bg-slate-50 dark:bg-slate-750 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                                <h4 className="font-black uppercase text-[11px] text-teal-600 flex items-center gap-1.5">
                                  <Activity className="w-4 h-4" /> 5. Reed Stock Details
                                </h4>
                                <div className="space-y-1.5 text-[11px]">
                                  <div>Required Reed Count: <span className="font-bold">{design?.reedCount || 'N/A'}</span></div>
                                  <div>Reed Status: {reeds.some(r => r.reedCount === design?.reedCount || r.reed_count === design?.reedCount) ? (
                                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">AVAILABLE IN STOCK</span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">REED CHECK WARNING</span>
                                  )}</div>
                                </div>
                              </div>

                              {/* 6. PRODUCTION & RUNOUT PANEL */}
                              <div className="p-4 bg-slate-50 dark:bg-slate-750 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                                <h4 className="font-black uppercase text-[11px] text-emerald-600 flex items-center gap-1.5">
                                  <Zap className="w-4 h-4" /> 6. Production & Runout Status
                                </h4>
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                                  <div>Start Date: <span className="font-bold">{entry.loomStartDate}</span></div>
                                  <div>Produced: <span className="font-bold text-slate-900 dark:text-white">{calc.producedMeter.toFixed(0)} M</span></div>
                                  <div>Gross Balance: <span className="font-bold text-slate-900 dark:text-white">{calc.warpBalanceGross.toFixed(0)} M</span></div>
                                  <div>Crimp Loss: <span className="font-bold text-slate-900 dark:text-white">{calc.crimpLossMeter.toFixed(0)} M</span></div>
                                  <div>Effective Prod: <span className="font-bold text-emerald-600">{calc.effectiveDailyProduction > 0 ? `${calc.effectiveDailyProduction.toFixed(1)} M/d` : '—'}</span></div>
                                  <div>Net Balance: <span className="font-bold text-spu-primary">{calc.netBalanceMeter.toFixed(0)} M</span></div>
                                  <div>Balance Days: <span className="font-black text-amber-600">{calc.balanceDays === 999999 ? '—' : `${calc.balanceDays.toFixed(1)} Days`}</span></div>
                                  <div>Expected Runout: <span className="font-bold">{calc.runoutStatus === 'DATA REQUIRED' || calc.balanceDays === 999999 ? 'Calculating...' : format(calc.expectedRunoutDate, 'dd-MMM-yyyy')}</span></div>
                                </div>
                              </div>

                            </div>

                            {/* 7. NEXT 1-5 PLANS QUEUE PANEL */}
                            <div className="p-4 bg-teal-50/60 dark:bg-teal-950/40 rounded-xl border border-teal-200 dark:border-teal-800 space-y-3 text-xs">
                              <div className="flex items-center gap-2 text-teal-900 dark:text-teal-200 font-black border-b border-teal-200 dark:border-teal-700 pb-2">
                                <ListTodo className="w-4 h-4 text-teal-600" />
                                <span>NEXT PLANS QUEUE — LOOM {loom.loomNo} (up to 5 designs)</span>
                              </div>
                              {cascadedPlans.length === 0 ? (
                                <p className="text-slate-500 italic text-[11px]">No next plans currently queued for this loom.</p>
                              ) : (
                                <div className="space-y-2">
                                  {cascadedPlans.map((cp, idx) => {
                                    const planOrder = orders.find(
                                      (o: any) => o.design_no_sp_no === cp.plan.next_design
                                    );
                                    return (
                                      <div
                                        key={cp.plan.id || idx}
                                        className={`grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 px-3 py-2.5 rounded-lg border ${
                                          idx === 0
                                            ? 'bg-teal-100/60 border-teal-300 dark:bg-teal-900/30 dark:border-teal-700'
                                            : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700'
                                        }`}
                                      >
                                        {/* Plan badge + Design */}
                                        <div className="col-span-2 md:col-span-1 flex items-center gap-2">
                                          <span className={`font-black text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                                            idx === 0 ? 'bg-teal-600 text-white' : 'bg-slate-400 text-white'
                                          }`}>
                                            NEXT {idx + 1}
                                          </span>
                                          <span className="font-black text-slate-900 dark:text-white text-[11px]">
                                            {cp.plan.next_design || '—'}
                                          </span>
                                        </div>

                                        {/* Order / IBPO */}
                                        <div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase">Order/IBPO</div>
                                          <div className="font-bold text-slate-700 dark:text-slate-300">
                                            {cp.plan.order_no || planOrder?.ibpo_no || planOrder?.order_no || '—'}
                                          </div>
                                        </div>

                                        {/* Beam */}
                                        <div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase">Beam</div>
                                          <div className={`font-bold ${
                                            cp.planBeamNo ? 'text-indigo-700 dark:text-indigo-300' : 'text-amber-600'
                                          }`}>
                                            {cp.planBeamNo || 'Not Allocated'}
                                          </div>
                                        </div>

                                        {/* Expected Start */}
                                        <div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase">Exp. Start</div>
                                          <div className="font-bold text-slate-700 dark:text-slate-300">
                                            {format(cp.expectedStart, 'dd-MMM-yyyy')}
                                          </div>
                                        </div>

                                        {/* Expected Runout */}
                                        <div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase">Exp. Runout</div>
                                          <div className="font-bold text-slate-700 dark:text-slate-300">
                                            {format(cp.expectedRunout, 'dd-MMM-yyyy')}
                                          </div>
                                        </div>

                                        {/* Warp Mtr */}
                                        <div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase">Warp Mtr</div>
                                          <div className="font-bold text-slate-700 dark:text-slate-300">
                                            {cp.planWarpMtr.toLocaleString()} M
                                          </div>
                                        </div>

                                        {/* Avg Prod */}
                                        <div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase">Avg Prod</div>
                                          <div className="font-bold text-slate-700 dark:text-slate-300">
                                            {cp.planAvgProd.toFixed(0)} M/d
                                            {Number(cp.plan.planned_avg_daily_production) <= 0 && (
                                              <span className="text-amber-500 text-[9px] ml-1">(est.)</span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Status */}
                                        <div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase">Status</div>
                                          <span className={`inline-block text-[9px] font-black px-2 py-0.5 rounded-full ${
                                            cp.statusLabel.includes('CONFIRMED') ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                                            cp.statusLabel.includes('BEAM ALLOCATED') ? 'bg-indigo-100 text-indigo-800 border border-indigo-300' :
                                            cp.statusLabel.includes('BEAM PENDING') ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                                            'bg-slate-100 text-slate-600 border border-slate-300'
                                          }`}>
                                            {cp.statusLabel}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Daily Production History & Edit Modal ── */}
      {historyModalLoomNo && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-spu-primary" />
                  <span>Daily Production History — Loom {historyModalLoomNo}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  View, add, edit or delete daily production entries. Runout calculation updates automatically.
                </p>
              </div>
              <button 
                onClick={() => setHistoryModalLoomNo(null)}
                className="p-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Add New Daily Log Row */}
            <div className="p-4 bg-slate-50 dark:bg-slate-750 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>Add Daily Production Record</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Production (Mtr) *</label>
                  <input
                    type="number"
                    value={newLogMeter}
                    onChange={e => setNewLogMeter(e.target.value)}
                    placeholder="e.g. 500"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">RPM (Optional)</label>
                  <input
                    type="number"
                    value={newLogRpm}
                    onChange={e => setNewLogRpm(e.target.value)}
                    placeholder="e.g. 450"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Efficiency % (Optional)</label>
                  <input
                    type="number"
                    value={newLogEff}
                    onChange={e => setNewLogEff(e.target.value)}
                    placeholder="e.g. 85"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Remarks</label>
                  <input
                    type="text"
                    value={newLogRemarks}
                    onChange={e => setNewLogRemarks(e.target.value)}
                    placeholder="Remarks"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              </div>
              <div className="text-right">
                <button
                  onClick={handleAddLog}
                  className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  Add Record
                </button>
              </div>
            </div>

            {/* Production History Logs Table */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 uppercase text-[10px] font-black">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Logged Date</th>
                    <th className="p-3">Produced Mtr</th>
                    <th className="p-3">RPM</th>
                    <th className="p-3">Eff %</th>
                    <th className="p-3">Remarks</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {productionLogs.filter(l => l.loom_no === historyModalLoomNo).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-slate-400">
                        No production history records found for Loom {historyModalLoomNo}.
                      </td>
                    </tr>
                  ) : (
                    productionLogs
                      .filter(l => l.loom_no === historyModalLoomNo)
                      .map((log, idx) => {
                        const isEditing = editingLogId === log.id;
                        return (
                          <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-750">
                            <td className="p-3 font-mono text-[11px] text-slate-400">{idx + 1}</td>
                            <td className="p-3 font-medium">
                              {log.createdAt ? format(new Date(log.createdAt), 'dd-MMM-yyyy HH:mm') : '—'}
                            </td>
                            <td className="p-3 font-extrabold text-emerald-700 dark:text-emerald-400">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editLogMeter}
                                  onChange={e => setEditLogMeter(e.target.value)}
                                  className="w-20 px-2 py-1 rounded border border-slate-300 text-xs font-bold"
                                />
                              ) : (
                                `${log.produced_meter} M`
                              )}
                            </td>
                            <td className="p-3 font-medium">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editLogRpm}
                                  onChange={e => setEditLogRpm(e.target.value)}
                                  className="w-16 px-2 py-1 rounded border border-slate-300 text-xs"
                                />
                              ) : (
                                log.rpm || '—'
                              )}
                            </td>
                            <td className="p-3 font-medium">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editLogEff}
                                  onChange={e => setEditLogEff(e.target.value)}
                                  className="w-16 px-2 py-1 rounded border border-slate-300 text-xs"
                                />
                              ) : (
                                log.efficiency ? `${log.efficiency}%` : '—'
                              )}
                            </td>
                            <td className="p-3 text-slate-500">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editLogRemarks}
                                  onChange={e => setEditLogRemarks(e.target.value)}
                                  className="w-full px-2 py-1 rounded border border-slate-300 text-xs"
                                />
                              ) : (
                                log.remarks || '—'
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => handleSaveEditLog(log.id)}
                                    className="p-1 bg-emerald-100 text-emerald-800 rounded hover:bg-emerald-200"
                                    title="Save Edit"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditingLogId(null)}
                                    className="p-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
                                    title="Cancel Edit"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingLogId(log.id);
                                      setEditLogMeter(String(log.produced_meter));
                                      setEditLogRpm(log.rpm ? String(log.rpm) : '');
                                      setEditLogEff(log.efficiency ? String(log.efficiency) : '');
                                      setEditLogRemarks(log.remarks || '');
                                    }}
                                    className="p-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
                                    title="Edit Entry"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteLog(log.id)}
                                    className="p-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                                    title="Delete Entry"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-right pt-2 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setHistoryModalLoomNo(null)}
                className="px-5 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl hover:bg-slate-200"
              >
                Close Modal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN PASSWORD VERIFICATION MODAL FOR LOOM START DATE */}
      {adminUnlockModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-amber-600">
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center font-bold">
                  <Lock className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-tight text-slate-900 dark:text-white">Admin Authorization</h3>
                  <p className="text-[11px] text-slate-500">Unlock Start Date for Loom L-{adminUnlockModal.loomNo}</p>
                </div>
              </div>
              <button 
                onClick={() => setAdminUnlockModal({ isOpen: false, loomNo: null, password: '', error: null, isVerifying: false })}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleVerifyAdminPassword} className="space-y-3">
              <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-xl border border-amber-200/60 text-xs text-amber-900 dark:text-amber-200">
                <p className="font-semibold leading-relaxed">
                  Changing the <strong>Loom Start Date</strong> directly recalculates the active warp runout forecast. Please enter the <strong>Administrator Password</strong> to authorize.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Administrator Password</label>
                <input
                  type="password"
                  autoFocus
                  value={adminUnlockModal.password}
                  onChange={e => setAdminUnlockModal(prev => ({ ...prev, password: e.target.value, error: null }))}
                  placeholder="Enter admin password..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              {adminUnlockModal.error && (
                <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs font-bold text-red-700 dark:text-red-300 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{adminUnlockModal.error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdminUnlockModal({ isOpen: false, loomNo: null, password: '', error: null, isVerifying: false })}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={adminUnlockModal.isVerifying || !adminUnlockModal.password}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>{adminUnlockModal.isVerifying ? 'Verifying...' : 'CONFIRM & UNLOCK'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
