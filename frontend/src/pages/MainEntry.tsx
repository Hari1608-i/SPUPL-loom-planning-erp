import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { calculateLoomRun, CalculatedLoomRun } from '../utils/calculations';
import { 
  AlertCircle, Save, Zap, Info, Lock, Layers, Building2, Package, CheckCircle2, 
  XCircle, ChevronDown, ChevronRight, ExternalLink, RefreshCw, AlertTriangle, ShieldCheck,
  Search, Filter, ShoppingBag, FileText, Calendar, Clock, Activity, ListTodo,
  Plus, Edit3, Trash2, CheckCircle, X, Download, Play
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { useAppContext } from '../context/AppProvider';
import { API_BASE_URL } from '../config';
import { CompanyPrintHeader } from '../components/common/CompanyPrintHeader';
import { triggerPrint } from '../utils/printManager';
import { Printer } from 'lucide-react';

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
  const { activeRuns, setActiveRuns, looms, designs, beams, reeds, orders, nextPlans, rawNextPlans, refreshData } = useAppContext();
  const [entries, setEntries] = useState<Record<number, EntryState>>({});
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

      const completedDesignNos = new Set(
        orders
          .filter(o => o.status === 'ORDER COMPLETED' || o.status === 'Completed' || o.order_completion_status === 'COMPLETED')
          .map(o => (o.design_no_sp_no || '').trim().toLowerCase())
      );
      const completedOrderNos = new Set(
        orders
          .filter(o => o.status === 'ORDER COMPLETED' || o.status === 'Completed' || o.order_completion_status === 'COMPLETED')
          .map(o => (o.ibpo_no || o.order_no || '').trim().toLowerCase())
      );

      looms.forEach(loom => {
        let activeRun = activeRuns[loom.loomNo];

        // If active run is associated with a completed order/design, ignore it
        if (activeRun) {
          const runDesign = (activeRun.designNo || '').trim().toLowerCase();
          const runOrder = ((activeRun as any).orderNo || '').trim().toLowerCase();

          if (completedDesignNos.has(runDesign) || (runOrder && completedOrderNos.has(runOrder))) {
            activeRun = undefined as any;
          }
        }

        // Find date-wise production log for this loom on selectedProductionDate
        const dateLog = productionLogs.find(
          l => l.loom_no === loom.loomNo && 
          format(new Date(l.date || l.createdAt || new Date()), 'yyyy-MM-dd') === selectedProductionDate
        );

        // Only update if not dirty
        if (!dirtyLoomsRef.current.has(loom.loomNo)) {
          if (activeRun) {
            newEntries[loom.loomNo] = {
              designNo: activeRun.designNo || '',
              currentBeamNo: (activeRun as any).currentBeamNo || '',
              loomStartDate: activeRun.loomStartDate || format(new Date(), 'yyyy-MM-dd'),
              warpedMeter: activeRun.warpedMeter || '',
              dailyProduction: dateLog ? dateLog.produced_meter : (activeRun.dailyProduction || ''),
              rpm: dateLog?.rpm || activeRun.rpm || '',
              efficiency: dateLog?.efficiency || activeRun.efficiency || '',
              remarks: (activeRun as any).remarks || ''
            };
          } else {
            newEntries[loom.loomNo] = {
              designNo: '',
              currentBeamNo: '',
              loomStartDate: format(new Date(), 'yyyy-MM-dd'),
              warpedMeter: '',
              dailyProduction: dateLog ? dateLog.produced_meter : '',
              rpm: '',
              efficiency: '',
              remarks: ''
            };
          }
        }
      });

      return newEntries;
    });
  }, [activeRuns, looms, designs, nextPlans, orders, selectedProductionDate, productionLogs]);

  // ── Build 5-plan queue per loom from rawNextPlans ──
  // Each loom gets an ordered array of up to 5 active (non-cancelled/completed) plans
  const loomNextPlansMap = useMemo(() => {
    const map: Record<number, any[]> = {};
    const activePlans = rawNextPlans.filter(
      p => p.status !== 'CANCELLED' && p.status !== 'COMPLETED'
    );
    // Sort: by planned_sequence ASC first, then by id ASC as tiebreaker
    activePlans.sort(
      (a, b) =>
        (Number(a.planned_sequence) || Number(a.id) || 0) -
        (Number(b.planned_sequence) || Number(b.id) || 0)
    );
    activePlans.forEach(p => {
      const lNo = Number(p.loom_no);
      if (!map[lNo]) map[lNo] = [];
      if (map[lNo].length < 5) map[lNo].push(p);
    });
    return map;
  }, [rawNextPlans]);

  // Unique list of Units for dropdown
  const availableUnits = useMemo(() => {
    const set = new Set<string>();
    looms.forEach(l => {
      if (l.unit) set.add(l.unit);
    });
    return Array.from(set).sort();
  }, [looms]);

  // Handle entry changes with strict Master validation
  const handleEntryChange = (loomNo: number, field: keyof EntryState, value: string | number) => {
    dirtyLoomsRef.current.add(loomNo);
    setEntries(prev => {
      const currentEntry = prev[loomNo] || {
        designNo: '', currentBeamNo: '', loomStartDate: format(new Date(), 'yyyy-MM-dd'),
        warpedMeter: '', dailyProduction: '', rpm: '', efficiency: '', remarks: ''
      };
      const updatedEntry = { ...currentEntry, [field]: value };

      // 1. Design & Loom Capability Validation
      if (field === 'designNo' && typeof value === 'string' && value.trim() !== '') {
        const loom = looms.find(l => l.loomNo === loomNo);
        const design = designs.find(d => d.designNo === value);
        
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
          const matchedBeam = beams.find(b => 
            (b.beamNo && b.beamNo.toString().toLowerCase() === targetBeamNo.trim().toLowerCase()) ||
            (b.vendorBeamNo && b.vendorBeamNo.toString().toLowerCase() === targetBeamNo.trim().toLowerCase()) ||
            (b.beam_no && b.beam_no.toString().toLowerCase() === targetBeamNo.trim().toLowerCase())
          );

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
  };

  // Excel Bulk Copy / Paste Handler
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement | HTMLSelectElement>, startLoomNo: number, startField: keyof EntryState) => {
    e.preventDefault();
    const clipboardData = e.clipboardData.getData('Text');
    if (!clipboardData) return;

    const rows = clipboardData.split(/\r?\n/).filter(r => r.trim() !== '');
    const startLoomIndex = looms.findIndex(l => l.loomNo === startLoomNo);
    const startFieldIndex = TRANSACTION_FIELDS_ORDER.indexOf(startField);

    if (startLoomIndex === -1 || startFieldIndex === -1) return;

    setEntries(prev => {
      const newEntries = { ...prev };
      let warnings: string[] = [];

      rows.forEach((rowStr, rowIndex) => {
        const cells = rowStr.split('\t');
        const targetLoomIndex = startLoomIndex + rowIndex;
        
        if (targetLoomIndex < looms.length) {
          const loom = looms[targetLoomIndex];
          const loomNo = loom.loomNo;
          dirtyLoomsRef.current.add(loomNo);
          let updatedEntry = { ...newEntries[loomNo] };

          cells.forEach((cellStr, cellIndex) => {
            const targetFieldIndex = startFieldIndex + cellIndex;
            if (targetFieldIndex < TRANSACTION_FIELDS_ORDER.length) {
              const field = TRANSACTION_FIELDS_ORDER[targetFieldIndex];
              const valueStr = cellStr.trim();
              
              if (field === 'designNo') {
                updatedEntry[field] = valueStr;
              } else if (field === 'loomStartDate') {
                const parsedDate = new Date(valueStr);
                if (!isNaN(parsedDate.getTime())) {
                  updatedEntry[field] = format(parsedDate, 'yyyy-MM-dd');
                } else if (/^\d{4}-\d{2}-\d{2}$/.test(valueStr)) {
                  updatedEntry[field] = valueStr;
                }
              } else if (field === 'rpm' || field === 'efficiency') {
                if (valueStr === '') {
                  updatedEntry[field] = '';
                } else {
                  const cleanStr = valueStr.replace(/,/g, '').replace(/%/g, '');
                  const num = Number(cleanStr);
                  if (!isNaN(num)) {
                    if (field === 'efficiency' && (num < 0 || num > 100)) {
                      warnings.push(`Loom ${loomNo}: Efficiency must be between 0% and 100%.`);
                    } else {
                      updatedEntry[field] = num;
                    }
                  }
                }
              } else if (field === 'warpedMeter' || field === 'dailyProduction') {
                const cleanStr = valueStr.replace(/,/g, '');
                const num = Number(cleanStr);
                if (!isNaN(num)) {
                  updatedEntry[field] = num;
                }
              } else if (field === 'currentBeamNo' || field === 'remarks') {
                updatedEntry[field] = valueStr;
              }
            }
          });

          newEntries[loomNo] = updatedEntry;
        }
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
          setErrorMsg(`Allocation Blocked: Beam ${entry.currentBeamNo} belongs to design "${beamDesign}", mismatching "${entry.designNo}".`);
          setTimeout(() => setErrorMsg(null), 6000);
          return;
        }
      }
    }

    // Check if Total Production >= Original Warp Meter -> Show Runout Confirmation Modal
    const prodMtr = Number(entry.dailyProduction || 0);
    const warpMtr = Number(entry.warpedMeter || 0);
    if (warpMtr > 0 && prodMtr >= warpMtr) {
      const nextPlanList = loomNextPlansMap[loomNo] || [];
      const queuedPlan = nextPlanList[0];
      setTransitionPromptPlan({
        loom: { loomNo },
        run: entry,
        plan: queuedPlan ? queuedPlan : { loom_no: loomNo, next_design: 'AVAILABLE (No Plan Queued)' },
        calc: { producedMeter: prodMtr, warpedMeter: warpMtr }
      });
      return;
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
      crimpPercent: design ? design.crimpPercent * 100 : 5,
      remarks: entry.remarks
    };

    try {
      await fetch(`${API_BASE_URL}/api/active-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([runPayload])
      });

      // Also log daily production entry if dailyProduction > 0
      if (Number(entry.dailyProduction || 0) > 0) {
        await fetch(`${API_BASE_URL}/api/production-logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loomNo,
            designNo: entry.designNo,
            producedMeter: Number(entry.dailyProduction),
            rpm: entry.rpm ? Number(entry.rpm) : null,
            efficiency: entry.efficiency ? Number(entry.efficiency) : null,
            remarks: entry.remarks || 'Daily production update',
            date: selectedProductionDate
          })
        });
        await fetchLogs();
      }

      await refreshData();
      setSuccessMsg(`Loom ${loomNo} production entry for ${format(new Date(selectedProductionDate), 'dd-MMM-yyyy')} saved!`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      setErrorMsg(`Failed to save Loom ${loomNo} entry.`);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  // Save All Transactions to Backend
  const saveAllPlans = async () => {
    let savedCount = 0;
    const runsArray: any[] = [];
    const consumedPlansArray: any[] = [];
    let validationErrors: string[] = [];

    // Pre-validate all entries
    Object.entries(entries).forEach(([key, entry]) => {
      const loomNo = Number(key);
      if (entry.designNo && entry.designNo.trim() !== '') {
        if (entry.currentBeamNo && entry.currentBeamNo.trim() !== '') {
          const matchedBeam = beams.find(b => 
            (b.beamNo && b.beamNo.toString().toLowerCase() === entry.currentBeamNo.trim().toLowerCase()) ||
            (b.vendorBeamNo && b.vendorBeamNo.toString().toLowerCase() === entry.currentBeamNo.trim().toLowerCase()) ||
            (b.beam_no && b.beam_no.toString().toLowerCase() === entry.currentBeamNo.trim().toLowerCase())
          );
          if (matchedBeam) {
            const beamDesign = matchedBeam.designNo || matchedBeam.design_no || matchedBeam.design;
            if (beamDesign && beamDesign.trim().toLowerCase() !== entry.designNo.trim().toLowerCase()) {
              validationErrors.push(`Loom ${loomNo}: Beam ${entry.currentBeamNo} design mismatch (${beamDesign} vs ${entry.designNo}).`);
            }
          }
        }

        const design = designs.find(d => d.designNo === entry.designNo);
        const run = {
          loomNo,
          designNo: entry.designNo,
          currentBeamNo: entry.currentBeamNo,
          loomStartDate: entry.loomStartDate,
          warpedMeter: Number(entry.warpedMeter || 0),
          dailyProduction: Number(entry.dailyProduction || 0),
          rpm: entry.rpm !== '' ? Number(entry.rpm) : null,
          efficiency: entry.efficiency !== '' ? Number(entry.efficiency) : null,
          crimpPercent: design ? design.crimpPercent * 100 : 5,
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
      setErrorMsg(`Save Blocked - Beam Design Mismatch Errors: ${validationErrors.join(' | ')}`);
      setTimeout(() => setErrorMsg(null), 8000);
      return;
    }

    dirtyLoomsRef.current.clear();

    try {
      if (runsArray.length > 0) {
        await fetch(`${API_BASE_URL}/api/active-runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(runsArray)
        });

        // Log daily production date-wise for each loom with production > 0
        for (const run of runsArray) {
          if (run.dailyProduction > 0) {
            await fetch(`${API_BASE_URL}/api/production-logs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                loomNo: run.loomNo,
                designNo: run.designNo,
                producedMeter: run.dailyProduction,
                rpm: run.rpm,
                efficiency: run.efficiency,
                remarks: run.remarks || 'Daily production update',
                date: selectedProductionDate
              })
            });
          }
        }
      }

      if (consumedPlansArray.length > 0) {
        await fetch(`${API_BASE_URL}/api/next-plans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(consumedPlansArray)
        });
      }

      await refreshData();
      await fetchLogs();
      setSuccessMsg(`Successfully saved daily production entries for ${format(new Date(selectedProductionDate), 'dd-MMM-yyyy')} across ${savedCount} looms!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error saving active runs:', err);
      setErrorMsg('Failed to save entries to backend.');
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

  const toggleRowExpand = (loomNo: number) => {
    setExpandedRows(prev => ({
      ...prev,
      [loomNo]: !prev[loomNo]
    }));
  };

  // Filtered looms list
  const filteredLooms = useMemo(() => {
    return looms.filter(loom => {
      if (selectedUnit !== 'ALL' && loom.unit !== selectedUnit) return false;

      const entry = entries[loom.loomNo] || { designNo: '', currentBeamNo: '' };
      const cleanDesignNo = (entry.designNo || '').trim().toLowerCase();
      const design = designs.find(d => (d.designNo || d.design_no_sp_no || '').trim().toLowerCase() === cleanDesignNo);
      const matchedOrder = orders.find(o => 
        (o.design_no_sp_no || '').trim().toLowerCase() === cleanDesignNo ||
        (o.ibpo_no || '').trim().toLowerCase() === cleanDesignNo ||
        (o.order_no || '').trim().toLowerCase() === cleanDesignNo
      );

      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase().trim();
        const matchesLoom = loom.loomNo.toString().includes(q);
        const matchesDesign = entry.designNo.toLowerCase().includes(q);
        const matchesBeam = entry.currentBeamNo.toLowerCase().includes(q);
        const matchesUnit = (loom.unit || '').toLowerCase().includes(q);
        const matchesConst = ((design?.construction || matchedOrder?.construction) || '').toLowerCase().includes(q);

        const matchesOrder = matchedOrder ? (matchedOrder.order_no || '').toLowerCase().includes(q) || (matchedOrder.customer_name || '').toLowerCase().includes(q) : false;

        if (!matchesLoom && !matchesDesign && !matchesBeam && !matchesUnit && !matchesConst && !matchesOrder) {
          return false;
        }
      }

      if (selectedRunoutFilter !== 'ALL') {
        const loomLogs = productionLogs.filter(l => l.loom_no === loom.loomNo).map(l => l.produced_meter);
        const effectivePick = design?.pick || (matchedOrder?.ppi !== undefined && matchedOrder?.ppi !== null && matchedOrder?.ppi !== '' ? String(matchedOrder.ppi) : '') || matchedOrder?.pick;
        const calc = calculateLoomRun({
          loomStartDate: entry.loomStartDate ? new Date(entry.loomStartDate) : new Date(),
          warpedMeter: typeof entry.warpedMeter === 'number' ? entry.warpedMeter : 0,
          dailyProduction: typeof entry.dailyProduction === 'number' ? entry.dailyProduction : 0,
          crimpPercent: design?.crimpPercent || 0.05,
          rpm: entry.rpm,
          efficiency: entry.efficiency,
          pick: effectivePick,
          actualProductionHistory: loomLogs
        });

        if (selectedRunoutFilter === 'URGENT' && calc.balanceDays > 2) return false;
        if (selectedRunoutFilter === 'ALERT' && (calc.balanceDays <= 2 || calc.balanceDays > 5)) return false;
        if (selectedRunoutFilter === 'NORMAL' && calc.balanceDays <= 5) return false;
      }

      return true;
    });
  }, [looms, entries, designs, orders, searchTerm, selectedUnit, selectedRunoutFilter, productionLogs]);

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
            onClick={() => triggerPrint()}
            title="Print Report"
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white hover:bg-slate-900 rounded-xl text-xs font-black transition-all shadow-md active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>

          <button
            onClick={saveAllPlans}
            className="flex items-center gap-2 px-6 py-2.5 bg-spu-primary text-white hover:bg-slate-900 rounded-xl text-xs font-black transition-all shadow-md active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>Save All Transactions</span>
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
              setSelectedProductionDate(format(prev, 'yyyy-MM-dd'));
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
              onChange={e => setSelectedProductionDate(e.target.value)}
              className="bg-transparent text-xs font-black text-slate-900 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              const next = addDays(new Date(selectedProductionDate), 1);
              const todayStr = format(new Date(), 'yyyy-MM-dd');
              if (format(next, 'yyyy-MM-dd') <= todayStr) {
                setSelectedProductionDate(format(next, 'yyyy-MM-dd'));
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
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              {/* Category Grouping Header Row */}
              <tr className="bg-slate-900 text-white uppercase text-[10px] font-black tracking-wider border-b border-slate-800">
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
                const design = designs.find(d => (d.designNo || d.design_no_sp_no || '').trim().toLowerCase() === cleanDesignNo);
                const matchedOrder = orders.find(o => 
                  (o.design_no_sp_no || '').trim().toLowerCase() === cleanDesignNo ||
                  (o.ibpo_no || '').trim().toLowerCase() === cleanDesignNo ||
                  (o.order_no || '').trim().toLowerCase() === cleanDesignNo
                );
                const nextPlan = nextPlans[loom.loomNo];

                // Beam stock & Set No connection
                let beamInfo: any = null;
                let beamMismatch = false;
                let setNoDisplay = 'N/A';

                if (entry.currentBeamNo && entry.currentBeamNo.trim() !== '') {
                  beamInfo = beams.find(b => 
                    (b.beamNo && b.beamNo.toString().toLowerCase() === entry.currentBeamNo.trim().toLowerCase()) ||
                    (b.vendorBeamNo && b.vendorBeamNo.toString().toLowerCase() === entry.currentBeamNo.trim().toLowerCase()) ||
                    (b.beam_no && b.beam_no.toString().toLowerCase() === entry.currentBeamNo.trim().toLowerCase())
                  );

                  if (beamInfo) {
                    setNoDisplay = beamInfo.setNo || beamInfo.set_no || 'N/A';
                    const bDesign = beamInfo.designNo || beamInfo.design_no || beamInfo.design;
                    if (bDesign && entry.designNo && bDesign.trim().toLowerCase() !== entry.designNo.trim().toLowerCase()) {
                      beamMismatch = true;
                    }
                  }
                }

                // Get daily logs for this loom
                const loomLogs = productionLogs
                  .filter(l => l.loom_no === loom.loomNo)
                  .map(l => l.produced_meter);
                const totalCumulativeProducedMtr = loomLogs.reduce((sum, val) => sum + (val || 0), 0);

                // Check if saved production exists for this loom on selectedProductionDate
                const hasSavedLogForSelectedDate = productionLogs.some(
                  l => l.loom_no === loom.loomNo &&
                  format(new Date(l.date || l.createdAt || new Date()), 'yyyy-MM-dd') === selectedProductionDate &&
                  l.produced_meter !== undefined && l.produced_meter !== null && Number(l.produced_meter) > 0
                );
                const hasDraftInput = entry.dailyProduction !== '' && entry.dailyProduction !== undefined && entry.dailyProduction !== null && Number(entry.dailyProduction) > 0;
                const isMissingProduction = !hasSavedLogForSelectedDate && !hasDraftInput;

                // Calculate Runout Metrics using cumulative total production
                const effectiveWarpMtr =
                  typeof entry.warpedMeter === 'number' && entry.warpedMeter > 0
                    ? entry.warpedMeter
                    : (beamInfo?.available_meter || beamInfo?.beamLength || 0);

                const effectiveCrimp = design?.crimpPercent ?? 0;
                const effectivePick = design?.pick || (matchedOrder?.ppi !== undefined && matchedOrder?.ppi !== null && matchedOrder?.ppi !== '' ? String(matchedOrder.ppi) : '') || matchedOrder?.pick;
                
                const calc: CalculatedLoomRun = calculateLoomRun({
                  loomStartDate: entry.loomStartDate ? new Date(entry.loomStartDate) : new Date(),
                  warpedMeter: effectiveWarpMtr,
                  dailyProduction: totalCumulativeProducedMtr,
                  crimpPercent: effectiveCrimp,
                  rpm: entry.rpm !== '' && entry.rpm !== null && entry.rpm !== undefined ? entry.rpm : 600,
                  efficiency: entry.efficiency !== '' && entry.efficiency !== null && entry.efficiency !== undefined ? entry.efficiency : 60,
                  pick: effectivePick,
                  actualProductionHistory: loomLogs
                });

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
                  const planBeamInfo = planBeamNo
                    ? beams.find(
                        (b: any) =>
                          (b.beam_no || '').toLowerCase() === planBeamNo.toLowerCase() ||
                          (b.beamNo || '').toLowerCase() === planBeamNo.toLowerCase()
                      )
                    : null;

                  // Warp meter for this plan: from allocated beam or planned field
                  const planWarpMtr =
                    Number(planBeamInfo?.available_meter || planBeamInfo?.beamLength || 0) ||
                    Number(plan.planned_warp_meter) ||
                    1800; // safe default

                  // Plan's own design crimp
                  const planDesign = designs.find(
                    (d: any) =>
                      (d.designNo || d.design_no_sp_no || '') === (plan.next_design || '')
                  );
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
                        {design?.pick || (matchedOrder?.ppi !== undefined && matchedOrder?.ppi !== null && matchedOrder?.ppi !== '' ? String(matchedOrder.ppi) : '') || matchedOrder?.pick || matchedOrder?.designMaster?.pick || '—'}
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

                      {/* 11. Start Date */}
                      <td className="p-3">
                        <input
                          type="date"
                          value={entry.loomStartDate}
                          onChange={e => handleEntryChange(loom.loomNo, 'loomStartDate', e.target.value)}
                          onPaste={e => handlePaste(e as any, loom.loomNo, 'loomStartDate')}
                          className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-extrabold text-slate-950 dark:text-white shadow-sm focus:border-indigo-600"
                        />
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
                          {isMissingProduction && (
                            <span
                              className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 inline-block animate-pulse"
                              title="Production not entered for selected date"
                            />
                          )}
                          <input
                            type="number"
                            value={entry.dailyProduction}
                            placeholder="Daily Mtr"
                            onChange={e => handleEntryChange(loom.loomNo, 'dailyProduction', e.target.value === '' ? '' : Number(e.target.value))}
                            onPaste={e => handlePaste(e as any, loom.loomNo, 'dailyProduction')}
                            className={`w-24 px-2.5 py-1.5 rounded-lg border-2 bg-emerald-50/30 dark:bg-emerald-950/20 text-xs font-black text-slate-950 dark:text-white shadow-sm focus:border-emerald-600 placeholder:text-slate-500 placeholder:font-normal ${
                              isMissingProduction ? 'border-red-400 dark:border-red-600' : 'border-emerald-400 dark:border-emerald-600'
                            }`}
                          />
                        </div>
                      </td>

                      {/* 14. Crimp % */}
                      <td className="p-3 text-xs font-extrabold text-slate-950 dark:text-slate-100">
                        {design ? `${(design.crimpPercent * 100).toFixed(1)}%` : '5.0%'}
                      </td>

                      {/* 15. RPM (Optional - Default 600) */}
                      <td className="p-3">
                        <input
                          type="number"
                          value={entry.rpm}
                          placeholder="600"
                          onChange={e => handleEntryChange(loom.loomNo, 'rpm', e.target.value === '' ? '' : Number(e.target.value))}
                          onPaste={e => handlePaste(e as any, loom.loomNo, 'rpm')}
                          className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold text-slate-950 dark:text-white shadow-sm focus:border-indigo-600 placeholder:text-slate-400 placeholder:font-bold"
                          title="Optional: Leave blank to automatically default to 600 RPM"
                        />
                      </td>

                      {/* 16. Efficiency % (Optional - Default 60%) */}
                      <td className="p-3 border-r border-slate-300 dark:border-slate-700">
                        <input
                          type="number"
                          value={entry.efficiency}
                          placeholder="60%"
                          onChange={e => handleEntryChange(loom.loomNo, 'efficiency', e.target.value === '' ? '' : Number(e.target.value))}
                          onPaste={e => handlePaste(e as any, loom.loomNo, 'efficiency')}
                          className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold text-slate-950 dark:text-white shadow-sm focus:border-indigo-600 placeholder:text-slate-400 placeholder:font-bold"
                          title="Optional: Leave blank to automatically default to 60% Efficiency"
                        />
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
                          {(() => {
                            const queuedPlan = rawNextPlans.find(p => p.loom_no === loom.loomNo && p.status !== 'CANCELLED' && p.status !== 'COMPLETED');
                            const isRunoutDone = calc.runoutStatus === 'RUNOUT OVERDUE' || (calc.netBalanceMeter !== undefined && calc.netBalanceMeter <= 0) || calc.producedMeter >= (entry.warpedMeter || 10000);
                            if (queuedPlan && isRunoutDone) {
                              return (
                                <button
                                  onClick={() => setTransitionPromptPlan({ loom, run: entry, plan: queuedPlan, calc })}
                                  className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-black shadow-sm flex items-center gap-1 border border-amber-600 animate-pulse"
                                  title={`Beam warp finished! Click to confirm transition of Loom ${loom.loomNo} to ${queuedPlan.next_design}`}
                                >
                                  <Play className="w-3.5 h-3.5" />
                                  <span>Promote Next Plan</span>
                                </button>
                              );
                            }
                            return null;
                          })()}
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
                                     <div>Crimp: <span className="font-bold">{(((design?.crimpPercent ?? 0)) * 100).toFixed(1)}%</span></div>
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
                                  <div>Effective Prod: <span className="font-bold text-emerald-600">{calc.effectiveDailyProduction.toFixed(1)} M/d</span></div>
                                  <div>Net Balance: <span className="font-bold text-spu-primary">{calc.netBalanceMeter.toFixed(0)} M</span></div>
                                  <div>Balance Days: <span className="font-black text-amber-600">{calc.balanceDays === 999999 ? '—' : `${calc.balanceDays.toFixed(1)} Days`}</span></div>
                                  <div>Expected Runout: <span className="font-bold">{calc.runoutStatus === 'DATA REQUIRED' ? 'Calculating...' : format(calc.expectedRunoutDate, 'dd-MMM-yyyy')}</span></div>
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

      {/* ── Beam Warp Runout Transition Confirmation Modal ── */}
      {transitionPromptPlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-300 dark:border-amber-700 shadow-2xl p-6 max-w-lg w-full space-y-4">
            <div className="flex items-center space-x-3 text-amber-600">
              <AlertTriangle className="w-7 h-7 shrink-0" />
              <div>
                <h3 className="font-black text-slate-900 dark:text-white text-lg">BEAM WARP RUNOUT CONFIRMATION</h3>
                <p className="text-xs text-slate-500 font-semibold">Loom {transitionPromptPlan.loom.loomNo} has completed its running warp meters</p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 text-xs text-slate-800 dark:text-slate-200 space-y-2 font-mono">
              <div>Current Finished Design: <strong className="text-slate-900 dark:text-white">{transitionPromptPlan.run?.designNo || '—'}</strong></div>
              <div>Queued Next Design: <strong className="text-blue-600 dark:text-blue-400 font-black">{transitionPromptPlan.plan?.next_design}</strong> (Order: {transitionPromptPlan.plan?.order_no || '—'})</div>
              <div>Total Production: <strong className="text-emerald-700 dark:text-emerald-400">{transitionPromptPlan.calc?.producedMeter?.toLocaleString()} M</strong> (Warp Meter: {transitionPromptPlan.calc?.warpedMeter?.toLocaleString()} M)</div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              Do you want to archive current beam run to <strong>Completed Warp History</strong> and start running the Next Planned Design <strong>{transitionPromptPlan.plan?.next_design}</strong> on Loom {transitionPromptPlan.loom.loomNo}?
            </p>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setTransitionPromptPlan(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs"
              >
                Keep Current Run
              </button>
              <button
                onClick={() => handleConfirmWarpTransition(transitionPromptPlan.plan)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs shadow-md flex items-center gap-1.5"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Confirm & Transition to Next Design</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
