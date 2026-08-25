import React, { useState, useEffect } from 'react';
import {
  ClipboardList, Plus, Search, AlertTriangle, Edit3, Trash2, X, Download,
  CheckCircle, Printer, FileSpreadsheet, AlertCircle
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import * as XLSX from 'xlsx';
import { useAppContext } from '../context/AppProvider';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import { CompanyPrintHeader } from '../components/common/CompanyPrintHeader';
import { triggerPrint } from '../utils/printManager';
import {
  calculateOrderPlanning,
  calculateOrderSchedule,
  normalizeIbpo,
  parseConstructionSpecs
} from '../utils/calculations';

interface LoomWiseProductionItem {
  loom_no: number;
  daily_production?: number;
  loom_start_date?: string;
  produced_meter?: number;
}

interface Design {
  design_no_sp_no: string;
  construction?: string;
  weave_type?: string;
  reed_count?: string;
  pick?: string;
  greige_width?: string;
  total_ends?: number;
  reed_space_warp_width?: string;
  frames?: number;
  beam_type?: string;
  crimp_percent?: number;
  weft_colours?: number;
  epi?: number;
  ppi?: number;
  no_of_clr_warp?: number;
  no_of_clr_weft?: number;
}

interface Order {
  id: number;
  order_no?: string;
  ibpo_no?: string;
  customer_name: string;
  buyer_name?: string;
  combo_pattern?: string;
  finish?: string;
  design_no_sp_no: string;
  construction?: string;
  weave_type?: string;
  epi?: number;
  ppi?: number;
  beam_type?: string;
  no_of_clr_warp?: number | string;
  no_of_clr_weft?: number | string;
  frames?: number;
  weft_colours?: number;
  reed_count?: string;
  pick?: string;
  greige_width?: string;
  total_ends?: number;
  reed_space?: string;
  crimp_percent?: number;
  uom: string;
  order_qty: number;
  grey_qty?: number;
  grey_quantity?: number;
  warp_qty?: number;
  warp_quantity?: number;
  planned_loom_count?: number;
  avg_production_per_loom?: number;
  estimated_production_days?: number;
  weaving_completion_date?: string;
  expected_completion_date?: string;
  sizing_planned_date?: string;
  sizing_completed_date?: string;
  sizing_completion_date?: string;
  weaving_planned_date?: string;
  weaving_start_date?: string;
  priority: string;

  status: string;
  remarks?: string;
  order_received_date: string;
  order_date?: string;
  produced_qty?: number;
  order_completion_status?: string;
  actual_completion_date?: string;
  createdAt?: string;
  actual_loom_count?: number;
  actual_weaving_start_date?: string;
  actual_avg_production?: number;
  actual_runout_date?: string;
  production_drop_alert?: boolean;
  production_drop_pct?: number;
  expected_avg_production?: number;
  loomWiseProduction?: LoomWiseProductionItem[];
}

interface MultiOrderRowState {
  id?: number;
  ibpo_no: string;
  customer_name: string;
  buyer_name: string;
  combo_pattern: string;
  finish: string;
  priority: string;
  remarks: string;

  design_no_sp_no: string;
  construction: string;
  weave_type: string;
  epi: number | string;
  ppi: number | string;
  beam_type: string;
  no_of_clr_warp: number | string;
  no_of_clr_weft: number | string;
  frames: number | string;
  weft_colours: number | string;
  reed_count: string;
  pick: string;
  greige_width: string;
  total_ends: number | string;
  reed_space: string;
  crimp_percent: number | string;

  uom: string;
  order_qty: number | string;
  grey_qty: number | string;
  warp_qty: number | string;
  order_received_date: string;
  weaving_completion_date: string;
  status: string;

  sizing_planned_date: string;
  sizing_completion_date: string;
  weaving_start_date: string;
  weaving_planned_date: string;
  planned_loom_count: number | string;
  avg_production_per_loom: number | string;
}

export default function OrderManagement() {
  const { refreshData } = useAppContext();
  const { user, hasActionPermission } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE ORDERS');
  const [loading, setLoading] = useState(false);
  
  // Single Order Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [ibpoCheckMsg, setIbpoCheckMsg] = useState<{ isAvailable: boolean; message: string } | null>(null);

  // Selection & Multi-Action States
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [showMultiEntryModal, setShowMultiEntryModal] = useState(false);
  const [showMultiEditModal, setShowMultiEditModal] = useState(false);
  const [multiRows, setMultiRows] = useState<MultiOrderRowState[]>([]);
  const [multiErrorMsg, setMultiErrorMsg] = useState<string | null>(null);
  const [isSubmittingMulti, setIsSubmittingMulti] = useState(false);

  // Permission Checks
  const canCreate = hasActionPermission('Order Management', 'create');
  const canEdit = hasActionPermission('Order Management', 'edit');
  const canDelete = hasActionPermission('Order Management', 'delete');
  const canExport = hasActionPermission('Order Management', 'export');
  const canPrint = hasActionPermission('Order Management', 'print');

  const defaultForm = {
    ibpo_no: '',
    customer_name: '',
    buyer_name: '',
    combo_pattern: '',
    finish: '',
    priority: 'NORMAL',
    remarks: '',

    design_no_sp_no: '',
    construction: '',
    weave_type: 'CAM',
    epi: 0,
    ppi: 0,
    beam_type: 'SINGLE BEAM',
    no_of_clr_warp: 1 as number | string,
    no_of_clr_weft: 1 as number | string,
    frames: 4,
    weft_colours: 1 as number | string,
    reed_count: '',
    pick: '',
    greige_width: '',
    total_ends: 0,
    reed_space: '',
    crimp_percent: 0,

    uom: 'Meters',
    grey_qty: 0,
    warp_qty: 0,
    order_qty: 0,
    order_received_date: format(new Date(), 'yyyy-MM-dd'),
    weaving_completion_date: '',
    status: 'ORDER RECEIVED',

    sizing_planned_date: '',
    sizing_completion_date: '',
    weaving_start_date: '',
    weaving_planned_date: '',
    planned_loom_count: 0,
    avg_production_per_loom: 0
  };


  const [formData, setFormData] = useState(defaultForm);

  useEffect(() => {
    if (!formData.ibpo_no || !formData.ibpo_no.trim()) {
      setIbpoCheckMsg(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const cleanIbpo = normalizeIbpo(formData.ibpo_no);
        const excludeParam = editingOrder ? `&excludeId=${editingOrder.id}` : '';
        const res = await fetch(`${API_BASE_URL}/api/orders/check-ibpo?ibpo=${encodeURIComponent(cleanIbpo)}${excludeParam}`);
        if (res.ok) {
          const data = await res.json();
          setIbpoCheckMsg(data);
        }
      } catch (err) {
        console.error('Failed to check IBPO:', err);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [formData.ibpo_no, editingOrder]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ordRes, desRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/orders`),
        fetch(`${API_BASE_URL}/api/designs`)
      ]);

      if (ordRes.ok) {
        const ordData = await ordRes.json();
        setOrders(Array.isArray(ordData) ? ordData : []);
      }
      if (desRes.ok) {
        const desData = await desRes.json();
        setDesigns(Array.isArray(desData) ? desData : []);
      }
    } catch (err) {
      console.error('Failed to load order data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const createBlankMultiRow = (): MultiOrderRowState => ({
    ibpo_no: '',
    customer_name: '',
    buyer_name: '',
    combo_pattern: '',
    finish: '',
    priority: 'NORMAL',
    remarks: '',

    design_no_sp_no: '',
    construction: '',
    weave_type: 'CAM',
    epi: '',
    ppi: '',
    beam_type: 'SINGLE BEAM',
    no_of_clr_warp: 1,
    no_of_clr_weft: 1,
    frames: 4,
    weft_colours: 1,
    reed_count: '',
    pick: '',
    greige_width: '',
    total_ends: '',
    reed_space: '',
    crimp_percent: '',

    uom: 'Meters',
    order_qty: '',
    grey_qty: '',
    warp_qty: '',
    order_received_date: format(new Date(), 'yyyy-MM-dd'),
    weaving_completion_date: '',
    status: 'ORDER RECEIVED',

    sizing_planned_date: '',
    sizing_completion_date: '',
    weaving_start_date: format(new Date(), 'yyyy-MM-dd'),
    weaving_planned_date: format(new Date(), 'yyyy-MM-dd'),
    planned_loom_count: 2,
    avg_production_per_loom: 250
  });

  const handleOpenMultiEntry = () => {
    setMultiErrorMsg(null);
    setMultiRows(Array.from({ length: 5 }).map(createBlankMultiRow));
    setShowMultiEntryModal(true);
  };

  const handleOpenMultiEdit = () => {
    if (selectedOrderIds.length === 0) return;
    const selectedList = orders.filter(o => selectedOrderIds.includes(o.id));
    const mappedRows: MultiOrderRowState[] = selectedList.map(ord => {
      const matched = designs.find(d => d.design_no_sp_no === ord.design_no_sp_no);
      return {
        id: ord.id,
        ibpo_no: ord.ibpo_no || '',
        customer_name: ord.customer_name || '',
        buyer_name: ord.buyer_name || '',
        combo_pattern: ord.combo_pattern || '',
        finish: ord.finish || '',
        priority: ord.priority || 'NORMAL',
        remarks: ord.remarks || '',

        design_no_sp_no: ord.design_no_sp_no || '',
        construction: ord.construction || matched?.construction || '',
        weave_type: ord.weave_type || matched?.weave_type || 'CAM',
        epi: ord.epi ?? matched?.epi ?? '',
        ppi: ord.ppi ?? matched?.ppi ?? '',
        beam_type: ord.beam_type || matched?.beam_type || 'SINGLE BEAM',
        no_of_clr_warp: ord.no_of_clr_warp ?? matched?.no_of_clr_warp ?? '',
        no_of_clr_weft: ord.no_of_clr_weft ?? ord.weft_colours ?? matched?.weft_colours ?? '',
        frames: ord.frames ?? matched?.frames ?? '',
        weft_colours: ord.weft_colours ?? matched?.weft_colours ?? '',
        reed_count: ord.reed_count || matched?.reed_count || '',
        pick: ord.pick || matched?.pick || '',
        greige_width: ord.greige_width || matched?.greige_width || '',
        total_ends: ord.total_ends ?? matched?.total_ends ?? '',
        reed_space: ord.reed_space || matched?.reed_space_warp_width || '',
        crimp_percent: ord.crimp_percent ?? matched?.crimp_percent ?? '',

        uom: ord.uom || 'Meters',
        order_qty: ord.order_qty || '',
        grey_qty: ord.grey_qty || '',
        warp_qty: ord.warp_qty || '',
        order_received_date: ord.order_received_date ? format(new Date(ord.order_received_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        weaving_completion_date: ord.weaving_completion_date ? format(new Date(ord.weaving_completion_date), 'yyyy-MM-dd') : '',
        status: ord.status || 'ORDER RECEIVED',

        sizing_planned_date: ord.sizing_planned_date ? format(new Date(ord.sizing_planned_date), 'yyyy-MM-dd') : '',
        sizing_completion_date: ord.sizing_completion_date || ord.sizing_completed_date ? format(new Date(ord.sizing_completion_date || ord.sizing_completed_date!), 'yyyy-MM-dd') : '',
        weaving_start_date: ord.weaving_start_date ? format(new Date(ord.weaving_start_date), 'yyyy-MM-dd') : '',
        weaving_planned_date: ord.weaving_planned_date ? format(new Date(ord.weaving_planned_date), 'yyyy-MM-dd') : '',
        planned_loom_count: ord.planned_loom_count || 2,
        avg_production_per_loom: ord.avg_production_per_loom || 250
      };
    });

    setMultiErrorMsg(null);
    setMultiRows(mappedRows);
    setShowMultiEditModal(true);
  };

  const handleMultiDelete = async () => {
    if (selectedOrderIds.length === 0) return;

    const selectedOrdersList = orders.filter(o => selectedOrderIds.includes(o.id));
    const activeRunning = selectedOrdersList.filter(o =>
      o.status === 'WEAVING RUNNING' ||
      o.status === 'WEAVING COMPLETED' ||
      o.status === 'ORDER COMPLETED' ||
      (o.produced_qty && o.produced_qty > 0)
    );

    if (activeRunning.length > 0) {
      const blockedList = activeRunning.map(o => o.ibpo_no || o.order_no).join(', ');
      alert(`Order cannot be deleted because operational processing has already started for: ${blockedList}`);
      return;
    }

    if (!window.confirm(`You have selected ${selectedOrderIds.length} orders.\nAre you sure you want to delete these orders?`)) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedOrderIds, adminUser: user?.username })
      });

      if (res.ok) {
        setSelectedOrderIds([]);
        await loadData();
        await refreshData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete selected orders.');
      }
    } catch (e: unknown) {
      alert('Error during bulk deletion: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const updateMultiRowDesign = (rowIndex: number, designNo: string) => {
    const cleanNo = designNo.trim();
    const matched = designs.find(d => d.design_no_sp_no.trim().toLowerCase() === cleanNo.toLowerCase());

    setMultiRows(prev => {
      const next = [...prev];
      const target = { ...next[rowIndex], design_no_sp_no: designNo };
      const constr = matched?.construction || target.construction;
      const parsed = parseConstructionSpecs(constr);

      if (matched) {
        target.construction = constr;
        target.weave_type = matched.weave_type || target.weave_type || 'CAM';
        target.beam_type = matched.beam_type || target.beam_type || 'SINGLE BEAM';
        target.frames = matched.frames ?? target.frames ?? 4;
        target.no_of_clr_warp = matched.no_of_clr_warp ?? target.no_of_clr_warp ?? 1;
        target.no_of_clr_weft = matched.no_of_clr_weft ?? matched.weft_colours ?? target.no_of_clr_weft ?? 1;
        target.weft_colours = matched.weft_colours ?? target.weft_colours ?? 1;
        target.reed_count = matched.reed_count || target.reed_count || '';
        target.pick = matched.pick || parsed.pick || target.pick || '';
        target.greige_width = matched.greige_width || parsed.greigeWidth || target.greige_width || '';
        target.total_ends = matched.total_ends ?? target.total_ends ?? '';
        target.reed_space = matched.reed_space_warp_width || parsed.reedSpace || target.reed_space || '';
        target.crimp_percent = matched.crimp_percent ?? target.crimp_percent ?? '';
      } else if (constr) {
        if (!target.pick && parsed.pick) target.pick = parsed.pick;
        if (!target.greige_width && parsed.greigeWidth) target.greige_width = parsed.greigeWidth;
        if (!target.reed_space && parsed.reedSpace) target.reed_space = parsed.reedSpace;
      }
      next[rowIndex] = target;
      return next;
    });
  };

  const parseColorCount = (val: any): number => {
    if (val === null || val === undefined || val === '') return 1;
    if (typeof val === 'number') return isNaN(val) ? 1 : val;
    const s = String(val).trim();
    if (!s || s === '—') return 1;
    if (!isNaN(Number(s))) return Number(s);
    if (s.includes('+')) {
      const parts = s.split('+').map(p => parseFloat(p.trim())).filter(n => !isNaN(n));
      if (parts.length > 0) {
        const sum = parts.reduce((acc, curr) => acc + curr, 0);
        return sum > 0 ? sum : parts.length;
      }
    }
    const parsed = parseFloat(s);
    return !isNaN(parsed) && parsed > 0 ? parsed : 1;
  };

  const parsePastedDate = (val: string): string => {
    if (!val) return '';
    const s = val.trim();
    if (!s || s === '—') return '';
    
    // If already yyyy-MM-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // Try dd-MMM or dd-MMM-yy / dd-MMM-yyyy (e.g., 16-Sep, 21-Sep, 05-Oct, 16/09/2026, 16-09-2026)
    const monthNames: Record<string, number> = {
      jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11
    };
    
    const parts = s.split(/[-/ ]+/);
    if (parts.length >= 2) {
      const day = parseInt(parts[0], 10);
      const monthStr = parts[1].toLowerCase().slice(0, 3);
      const isNamedMonth = monthNames.hasOwnProperty(monthStr);
      
      if (!isNaN(day) && (isNamedMonth || !isNaN(parseInt(parts[1], 10)))) {
        const monthIndex = isNamedMonth ? monthNames[monthStr] : parseInt(parts[1], 10) - 1;
        let year = new Date().getFullYear();
        if (parts[2]) {
          const yNum = parseInt(parts[2], 10);
          if (!isNaN(yNum)) {
            year = yNum < 100 ? 2000 + yNum : yNum;
          }
        }
        if (day >= 1 && day <= 31 && monthIndex >= 0 && monthIndex <= 11) {
          const d = new Date(year, monthIndex, day);
          return format(d, 'yyyy-MM-dd');
        }
      }
    }

    // Fallback JS Date parse
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return format(d, 'yyyy-MM-dd');
    }

    return s;
  };

  const handlePasteExcel = (e: React.ClipboardEvent) => {
    const pasteData = e.clipboardData.getData('text');
    if (!pasteData) return;

    const lines = pasteData.split(/\r\n|\n|\r/).filter(line => line.trim() !== '');
    if (lines.length === 0) return;

    const pastedRows: MultiOrderRowState[] = lines.map(line => {
      const cols = line.split('\t').map(c => c.trim());

      // Check if this is a legacy paste with Customer Name & Buyer Name (length >= 21)
      let offset = 0;
      if (cols.length >= 21 || (cols.length >= 20 && cols[1]?.includes(' ') && !cols[1]?.includes('/'))) {
        offset = 2; // skip Customer Name (col 0) & Buyer Name (col 1)
      }

      const ibpo = cols[offset + 0] || '';
      const dNo = cols[offset + 1] || '';
      const matched = designs.find(d => d.design_no_sp_no.trim().toLowerCase() === dNo.trim().toLowerCase());
      const constr = cols[offset + 2] || matched?.construction || '';
      const parsed = parseConstructionSpecs(constr);

      const wType = cols[offset + 3] || matched?.weave_type || 'CAM';
      const bType = cols[offset + 4] || matched?.beam_type || 'SINGLE BEAM';
      const framesVal = cols[offset + 5] ? (Number(cols[offset + 5]) || 4) : (matched?.frames || 4);
      const gWidth = cols[offset + 6] || matched?.greige_width || parsed.greigeWidth || '';
      const wWidth = cols[offset + 7] || matched?.reed_space_warp_width || parsed.reedSpace || '';
      const endsVal = cols[offset + 8] ? (Number(cols[offset + 8]) || '') : (matched?.total_ends || '');
      const clrWarp = cols[offset + 9] ? cols[offset + 9] : (matched?.no_of_clr_warp || 1);
      const clrWeft = cols[offset + 10] ? cols[offset + 10] : (matched?.no_of_clr_weft || matched?.weft_colours || 1);
      const rCount = cols[offset + 11] || matched?.reed_count || '';

      const qtyVal = cols[offset + 12] || '';
      const szPlan = parsePastedDate(cols[offset + 13]);
      const szTarget = parsePastedDate(cols[offset + 14]);
      const wvStart = parsePastedDate(cols[offset + 15]) || format(new Date(), 'yyyy-MM-dd');
      const wvEnd = parsePastedDate(cols[offset + 16]);
      const loomCnt = cols[offset + 17] ? (Number(cols[offset + 17]) || 2) : 2;
      const avgProd = cols[offset + 18] ? (Number(cols[offset + 18]) || 250) : 250;
      const prio = (cols[offset + 19] || 'NORMAL').toUpperCase();

      return {
        ibpo_no: ibpo,
        customer_name: '',
        buyer_name: '',
        combo_pattern: '',
        finish: '',
        priority: prio,
        remarks: '',

        design_no_sp_no: dNo,
        construction: constr,
        weave_type: wType,
        epi: matched?.epi || '',
        ppi: matched?.ppi || parsed.pick || '',
        beam_type: bType,
        no_of_clr_warp: clrWarp,
        no_of_clr_weft: clrWeft,
        frames: framesVal,
        weft_colours: clrWeft,
        reed_count: rCount,
        pick: parsed.pick || matched?.pick || '',
        greige_width: gWidth,
        total_ends: endsVal,
        reed_space: wWidth,
        crimp_percent: matched?.crimp_percent || '',

        uom: 'Meters',
        order_qty: qtyVal,
        grey_qty: qtyVal,
        warp_qty: qtyVal,
        order_received_date: format(new Date(), 'yyyy-MM-dd'),
        weaving_completion_date: wvEnd,
        status: 'ORDER RECEIVED',

        sizing_planned_date: szPlan,
        sizing_completion_date: szTarget,
        weaving_start_date: wvStart,
        weaving_planned_date: wvStart,
        planned_loom_count: loomCnt,
        avg_production_per_loom: avgProd
      };
    });

    setMultiRows(pastedRows);
    setMultiErrorMsg(null);
  };

  const handleSaveMultiOrders = async () => {
    const nonBlankRows = multiRows.filter(r => r.ibpo_no.trim() || r.design_no_sp_no.trim() || r.order_qty);

    if (nonBlankRows.length === 0) {
      setMultiErrorMsg('Please enter at least one order before saving.');
      return;
    }

    const ibpoSet = new Set<string>();
    for (let i = 0; i < nonBlankRows.length; i++) {
      const r = nonBlankRows[i];
      if (!r.ibpo_no.trim()) {
        setMultiErrorMsg(`Row ${i + 1}: IBPO Number is required.`);
        return;
      }
      const cleanIbpo = r.ibpo_no.trim().toUpperCase();
      if (ibpoSet.has(cleanIbpo)) {
        setMultiErrorMsg(`Row ${i + 1}: Duplicate IBPO "${cleanIbpo}" found in pasted rows.`);
        return;
      }
      ibpoSet.add(cleanIbpo);

      const dupDb = orders.find(o => o.ibpo_no && o.ibpo_no.trim().toUpperCase() === cleanIbpo && o.status !== 'ORDER COMPLETED' && o.order_completion_status !== 'COMPLETED');
      if (dupDb) {
        setMultiErrorMsg(`Row ${i + 1}: IBPO "${cleanIbpo}" is already active in Order Management.`);
        return;
      }

      if (!r.design_no_sp_no.trim()) {
        setMultiErrorMsg(`Row ${i + 1}: Design Number is required.`);
        return;
      }
      if (!(Number(r.order_qty) > 0)) {
        setMultiErrorMsg(`Row ${i + 1}: Order Quantity must be greater than 0.`);
        return;
      }
      if (!r.weaving_start_date) {
        r.weaving_start_date = format(new Date(), 'yyyy-MM-dd');
      }
      if (!r.weaving_completion_date) {
        const looms = Number(r.planned_loom_count) || 2;
        const avg = Number(r.avg_production_per_loom) || 250;
        const daily = looms * avg;
        const days = daily > 0 ? Math.ceil((Number(r.order_qty) || 0) / daily) : 10;
        const startDate = new Date(r.weaving_start_date);
        const validStart = !isNaN(startDate.getTime()) ? startDate : new Date();
        r.weaving_completion_date = format(addDays(validStart, days), 'yyyy-MM-dd');
      }
      if (!(Number(r.planned_loom_count) > 0)) {
        r.planned_loom_count = 2;
      }
      if (!(Number(r.avg_production_per_loom) > 0)) {
        r.avg_production_per_loom = 250;
      }
    }

    setIsSubmittingMulti(true);
    setMultiErrorMsg(null);

    try {
      const payload = nonBlankRows.map(r => ({
        ...r,
        no_of_clr_warp: parseColorCount(r.no_of_clr_warp),
        no_of_clr_weft: parseColorCount(r.no_of_clr_weft),
        customer_name: r.customer_name?.trim() || r.ibpo_no || 'STANDARD',
        buyer_name: r.buyer_name?.trim() || ''
      }));

      const res = await fetch(`${API_BASE_URL}/api/orders/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: payload, adminUser: user?.username })
      });

      if (res.ok) {
        setShowMultiEntryModal(false);
        await loadData();
        await refreshData();
      } else {
        const data = await res.json();
        setMultiErrorMsg(data.error || 'Failed to save bulk orders.');
      }
    } catch (e: unknown) {
      setMultiErrorMsg('Error saving bulk orders: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsSubmittingMulti(false);
    }
  };

  const handleSaveMultiEdit = async () => {
    if (multiRows.length === 0) return;

    for (let i = 0; i < multiRows.length; i++) {
      const r = multiRows[i];
      if (!(Number(r.order_qty) > 0)) {
        setMultiErrorMsg(`Row ${i + 1}: Order Quantity must be greater than 0.`);
        return;
      }
      if (!(Number(r.planned_loom_count) > 0)) {
        setMultiErrorMsg(`Row ${i + 1}: Planned Loom Count is required.`);
        return;
      }
      if (!(Number(r.avg_production_per_loom) > 0)) {
        setMultiErrorMsg(`Row ${i + 1}: Planned Avg Production / Loom / Day is required.`);
        return;
      }
    }

    setIsSubmittingMulti(true);
    setMultiErrorMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/bulk`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: multiRows, adminUser: user?.username })
      });

      if (res.ok) {
        setShowMultiEditModal(false);
        setSelectedOrderIds([]);
        await loadData();
        await refreshData();
      } else {
        const data = await res.json();
        setMultiErrorMsg(data.error || 'Failed to save multi edit.');
      }
    } catch (e: unknown) {
      setMultiErrorMsg('Error saving multi edit: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsSubmittingMulti(false);
    }
  };

  const handleDesignChange = (selectedDesignNo: string) => {
    const matched = designs.find(d => d.design_no_sp_no === selectedDesignNo);
    if (matched) {
      setFormData(prev => ({
        ...prev,
        design_no_sp_no: selectedDesignNo,
        construction: matched.construction || prev.construction,
        weave_type: matched.weave_type || prev.weave_type,
        frames: matched.frames || prev.frames,
        weft_colours: matched.weft_colours || prev.weft_colours,
        reed_count: matched.reed_count || prev.reed_count,
        pick: matched.pick || prev.pick,
        greige_width: matched.greige_width || prev.greige_width,
        total_ends: matched.total_ends || prev.total_ends,
        reed_space: matched.reed_space_warp_width || prev.reed_space,
        crimp_percent: matched.crimp_percent || prev.crimp_percent
      }));
    } else {
      setFormData(prev => ({ ...prev, design_no_sp_no: selectedDesignNo }));
    }
  };

  const liveSchedule = calculateOrderSchedule(
    formData.order_qty,
    formData.planned_loom_count,
    formData.avg_production_per_loom,
    formData.weaving_planned_date || formData.weaving_start_date,
    formData.weaving_completion_date,
    editingOrder?.status === 'ORDER COMPLETED'
  );

  const handleOpenAdd = () => {
    setEditingOrder(null);
    setFormData(defaultForm);
    setIbpoCheckMsg(null);
    setShowModal(true);
  };

  const handleOpenEdit = (ord: Order) => {
    setEditingOrder(ord);
    setIbpoCheckMsg(null);
    const matched = designs.find(d => d.design_no_sp_no === ord.design_no_sp_no);

    setFormData({
      ibpo_no: ord.ibpo_no || '',
      customer_name: ord.customer_name || '',
      buyer_name: ord.buyer_name || '',
      combo_pattern: ord.combo_pattern || '',
      finish: ord.finish || '',
      priority: ord.priority || 'NORMAL',
      remarks: ord.remarks || '',

      design_no_sp_no: ord.design_no_sp_no || ord.ibpo_no || '',
      construction: ord.construction || matched?.construction || '',
      weave_type: ord.weave_type || matched?.weave_type || 'CAM',
      epi: ord.epi ?? matched?.epi ?? 0,
      ppi: ord.ppi ?? matched?.ppi ?? 0,
      total_ends: ord.total_ends ?? matched?.total_ends ?? 0,
      beam_type: ord.beam_type || matched?.beam_type || 'SINGLE BEAM',
      frames: ord.frames ?? matched?.frames ?? 4,
      no_of_clr_warp: (ord.no_of_clr_warp ?? matched?.no_of_clr_warp ?? 1) as any,
      no_of_clr_weft: (ord.no_of_clr_weft ?? ord.weft_colours ?? matched?.weft_colours ?? 1) as any,
      weft_colours: (ord.weft_colours ?? matched?.weft_colours ?? 1) as any,
      reed_count: ord.reed_count || matched?.reed_count || '',
      pick: ord.pick || matched?.pick || '',
      greige_width: ord.greige_width || matched?.greige_width || '',
      reed_space: ord.reed_space || matched?.reed_space_warp_width || '',
      crimp_percent: ord.crimp_percent ?? matched?.crimp_percent ?? 0,

      uom: ord.uom || 'Meters',
      grey_qty: ord.grey_qty || 0,
      warp_qty: ord.warp_qty || ord.order_qty || 0,
      order_qty: ord.order_qty || 0,
      order_received_date: ord.order_received_date ? format(new Date(ord.order_received_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      weaving_completion_date: ord.weaving_completion_date ? format(new Date(ord.weaving_completion_date), 'yyyy-MM-dd') : '',
      status: ord.status || 'ORDER RECEIVED',

      sizing_planned_date: ord.sizing_planned_date ? format(new Date(ord.sizing_planned_date), 'yyyy-MM-dd') : '',
      sizing_completion_date: ord.sizing_completion_date || ord.sizing_completed_date ? format(new Date(ord.sizing_completion_date || ord.sizing_completed_date!), 'yyyy-MM-dd') : '',
      weaving_start_date: ord.weaving_start_date ? format(new Date(ord.weaving_start_date), 'yyyy-MM-dd') : '',
      weaving_planned_date: ord.weaving_planned_date ? format(new Date(ord.weaving_planned_date), 'yyyy-MM-dd') : '',
      planned_loom_count: ord.planned_loom_count || 2,
      avg_production_per_loom: ord.avg_production_per_loom || 250
    });

    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanIbpo = normalizeIbpo(formData.ibpo_no);
    if (!cleanIbpo || !formData.design_no_sp_no.trim()) {
      alert('Please fill in required fields: IBPO Number and Design Number.');
      return;
    }

    if (ibpoCheckMsg && !ibpoCheckMsg.isAvailable) {
      alert(ibpoCheckMsg.message);
      return;
    }

    if (!(Number(formData.order_qty) > 0)) {
      alert('Validation Error: Order Quantity must be greater than 0.');
      return;
    }
    if (!(Number(formData.planned_loom_count) > 0)) {
      alert('Validation Error: Required Loom Count must be greater than 0.');
      return;
    }
    if (!(Number(formData.avg_production_per_loom) > 0)) {
      alert('Validation Error: Average Production / Loom / Day must be greater than 0.');
      return;
    }

    setLoading(true);

    const payload = {
      ...formData,
      no_of_clr_warp: parseColorCount(formData.no_of_clr_warp),
      no_of_clr_weft: parseColorCount(formData.no_of_clr_weft),
      customer_name: formData.customer_name?.trim() || cleanIbpo || 'STANDARD',
      buyer_name: formData.buyer_name?.trim() || '',
      ibpo_no: cleanIbpo,
      expected_completion_date: liveSchedule.expectedCompletionDate ? format(liveSchedule.expectedCompletionDate, 'yyyy-MM-dd') : null
    };

    try {
      const url = editingOrder ? `${API_BASE_URL}/api/orders/${editingOrder.id}` : `${API_BASE_URL}/api/orders`;
      const method = editingOrder ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowModal(false);
        await loadData();
        await refreshData();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to save order');
      }
    } catch (err: unknown) {
      alert('Error saving order: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    const ord = orders.find(o => o.id === id);
    if (ord && (ord.status === 'WEAVING RUNNING' || ord.status === 'WEAVING COMPLETED' || ord.status === 'ORDER COMPLETED' || (ord.produced_qty && ord.produced_qty > 0))) {
      alert('Order cannot be deleted because operational processing has already started.');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this order?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadData();
        await refreshData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to delete order.');
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Order Completion Confirmation Handler (Requirement 11 & 12)
  const handleCompleteOrder = async (ord: Order) => {
    if (!window.confirm(`Confirm order completion for IBPO "${ord.ibpo_no || ord.order_no}"?\nThis will mark the order status as ORDER COMPLETED.`)) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/${ord.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completed_by: user?.username || 'Planning Manager',
          remarks: 'Order completion confirmed by user'
        })
      });

      if (res.ok) {
        await loadData();
        await refreshData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to complete order.');
      }
    } catch (e: unknown) {
      alert('Error confirming completion: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesSearch =
      (o.ibpo_no && o.ibpo_no.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (o.design_no_sp_no && o.design_no_sp_no.toLowerCase().includes(searchTerm.toLowerCase()));

    if (statusFilter === 'ALL') return matchesSearch;
    if (statusFilter === 'ACTIVE ORDERS') {
      return matchesSearch && o.status !== 'ORDER COMPLETED' && o.order_completion_status !== 'COMPLETED';
    }
    if (statusFilter === 'COMPLETED') {
      return matchesSearch && (o.status === 'ORDER COMPLETED' || o.order_completion_status === 'COMPLETED');
    }
    return matchesSearch && o.status === statusFilter;
  });

  const handleSelectAllCheckbox = (checked: boolean) => {
    if (checked) {
      setSelectedOrderIds(filteredOrders.map(o => o.id));
    } else {
      setSelectedOrderIds([]);
    }
  };

  const handleToggleRowCheckbox = (id: number) => {
    setSelectedOrderIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleExportExcel = () => {
    const exportData = filteredOrders.map((ord, idx) => {
      const plan = calculateOrderPlanning({
        orderQty: ord.order_qty,
        plannedLoomCount: ord.planned_loom_count || 0,
        plannedAvgProduction: ord.avg_production_per_loom || 0,
        weavingPlannedDate: ord.weaving_planned_date || ord.weaving_start_date,
        weavingCompletionDate: ord.weaving_completion_date,
        actualLoomCount: ord.actual_loom_count,
        actualWeavingStartDate: ord.actual_weaving_start_date,
        actualAvgProduction: ord.actual_avg_production,
        producedQty: ord.produced_qty,
        actualCompletionDate: ord.actual_completion_date,
        status: ord.status,
        orderCompletionStatus: ord.order_completion_status
      });

      const matchedDesign = designs.find(d => {
        const dSp = (d.design_no_sp_no || '').trim();
        const oSp = (ord.design_no_sp_no || ord.ibpo_no || '').trim();
        return dSp === oSp || dSp.replace('SP026', 'SP26') === oSp.replace('SP026', 'SP26');
      });

      return {
        'S.No': idx + 1,
        'IBPO Number': ord.ibpo_no || ord.order_no || '—',
        'Combo / Pattern': ord.combo_pattern || '—',
        'Finish': ord.finish || '—',
        'Priority': ord.priority || 'NORMAL',
        'Remarks': ord.remarks || '—',

        'Design / SP Number': ord.design_no_sp_no || matchedDesign?.design_no_sp_no || ord.ibpo_no || '—',
        'Construction': ord.construction || matchedDesign?.construction || '—',
        'Weave Type': ord.weave_type || matchedDesign?.weave_type || '—',
        'Frames': ord.frames || matchedDesign?.frames || '—',
        'Weft Colours': ord.weft_colours || matchedDesign?.weft_colours || '—',
        'Reed Count': ord.reed_count || matchedDesign?.reed_count || '—',
        'Pick': ord.pick || matchedDesign?.pick || '—',
        'Greige Width': ord.greige_width || matchedDesign?.greige_width || '—',
        'Total Ends': ord.total_ends || matchedDesign?.total_ends || '—',
        'Reed Space': ord.reed_space || matchedDesign?.reed_space_warp_width || '—',
        'Crimp %': ord.crimp_percent != null ? `${ord.crimp_percent}%` : (matchedDesign?.crimp_percent != null ? `${matchedDesign.crimp_percent}%` : '—'),

        'UOM': ord.uom || 'Meters',
        'Order Quantity': plan.orderQty,
        'Grey Quantity': ord.grey_qty ?? ord.grey_quantity ?? 0,
        'Warp Quantity': ord.warp_qty ?? ord.warp_quantity ?? 0,
        'Produced Quantity': plan.producedQty,
        'Balance Quantity': plan.balanceQty,
        'Order Received Date': (ord.order_received_date || ord.order_date) ? format(new Date(ord.order_received_date || ord.order_date!), 'dd-MM-yyyy') : '—',

        'Sizing Plan Date': ord.sizing_planned_date ? format(new Date(ord.sizing_planned_date), 'dd-MM-yyyy') : '—',
        'Weaving Planned Start Date': plan.weavingPlannedDateFormatted,
        'Target Completion Date (Planner)': plan.targetCompletionDateFormatted,
        'Planned Loom Count': plan.plannedLoomCount,
        'Planned Avg Prod/Loom (m/day)': plan.plannedAvgProduction,

        'Total Daily Production (Planned)': plan.plannedDailyProduction,
        'Required Production Days': plan.requiredProductionDays,
        'System Expected Completion (Forecast)': plan.expectedCompletionDateFormatted,
        'Schedule Variance': plan.varianceText,

        'Actual Loom Count': ord.actual_loom_count ?? 0,
        'Actual Weaving Start Date': ord.actual_weaving_start_date ? format(new Date(ord.actual_weaving_start_date), 'dd-MM-yyyy') : 'Not Started',
        'Actual Avg Production Rate': (ord.actual_loom_count && ord.actual_loom_count > 0 && ord.actual_avg_production) ? `${ord.actual_avg_production} M` : '—',
        'Actual Runout / Expected Completion': ord.actual_completion_date ? format(new Date(ord.actual_completion_date), 'dd-MM-yyyy') : (ord.actual_loom_count && ord.actual_loom_count > 0 && ord.actual_runout_date ? format(new Date(ord.actual_runout_date), 'dd-MM-yyyy') : 'Not Started'),
        'Production Drop Alert': ord.production_drop_alert ? `LOW PRODUCTION (-${ord.production_drop_pct}%)` : 'NORMAL',

        'Order Status': plan.normalizedStatus
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Order_Master');
    XLSX.writeFile(workbook, `SPU_Loom_Orders_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  const isAllSelected = filteredOrders.length > 0 && filteredOrders.every(o => selectedOrderIds.includes(o.id));

  return (
    <div className="space-y-6">
      
      {/* Printable Header */}
      <CompanyPrintHeader title="ORDER MANAGEMENT & PLANNED FORECAST REPORT" />

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-xl text-spu-secondary">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">Order Management & Master Register</h1>
              <p className="text-xs text-slate-500 font-medium">Single & Multi-order entry, planned forecast analysis, actual loom production tracking, and order completion.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canExport && (
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl font-bold text-xs transition-colors border border-emerald-200"
            >
              <Download className="w-4 h-4" /> Export Excel
            </button>
          )}

          {canPrint && (
            <button
              onClick={() => triggerPrint()}
              className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold text-xs transition-colors"
            >
              <Printer className="w-4 h-4" /> Print / PDF
            </button>
          )}

          {canCreate && (
            <>
              <button
                onClick={handleOpenMultiEntry}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-black text-xs shadow-md hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:-translate-y-0.5"
              >
                <FileSpreadsheet className="w-4 h-4" /> + MULTI ORDERS ENTRY
              </button>

              <button
                onClick={handleOpenAdd}
                className="flex items-center gap-2 px-4 py-2 bg-spu-secondary text-white rounded-xl font-bold text-xs shadow-md hover:bg-indigo-700 transition-all transform hover:-translate-y-0.5"
              >
                <Plus className="w-4 h-4" /> Create New Order
              </button>
            </>
          )}
        </div>
      </div>

      {/* Toolbar & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between flex-wrap gap-4 print:hidden">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl w-full max-w-sm focus-within:border-spu-secondary transition-all">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search IBPO or Design..."
              className="bg-transparent border-none outline-none text-xs w-full font-medium text-slate-700"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-spu-secondary"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ACTIVE ORDERS">Active Orders (Non-Completed)</option>
            <option value="ALL">All Orders (Active + Completed)</option>
            <option value="ORDER RECEIVED">Order Received</option>
            <option value="LOOM PLANNED">Loom Planned</option>
            <option value="WEAVING RUNNING">Weaving Running</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>

        {/* Multi Selection Actions Toolbar */}
        <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
          <span className="text-xs font-bold text-slate-700">
            Selected: <strong className="text-spu-secondary font-black">{selectedOrderIds.length}</strong>
          </span>

          <button
            disabled={selectedOrderIds.length === 0 || !canEdit}
            onClick={handleOpenMultiEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            <Edit3 className="w-3.5 h-3.5" /> MULTI EDIT
          </button>

          <button
            disabled={selectedOrderIds.length === 0 || !canDelete}
            onClick={handleMultiDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg font-bold text-xs hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" /> MULTI DELETE
          </button>
        </div>
      </div>

      {/* Active Orders Data Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="py-3.5 px-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={(e) => handleSelectAllCheckbox(e.target.checked)}
                    className="w-4 h-4 rounded text-spu-secondary focus:ring-spu-secondary cursor-pointer accent-indigo-500"
                  />
                </th>
                <th className="py-3.5 px-4 text-center">S.No</th>
                <th className="py-3.5 px-4">IBPO Number</th>
                <th className="py-3.5 px-4">Design No</th>
                <th className="py-3.5 px-4">Construction</th>
                <th className="py-3.5 px-4">Weave Type</th>
                <th className="py-3.5 px-4">Beam Type</th>
                <th className="py-3.5 px-4 text-center">Frames</th>
                <th className="py-3.5 px-4 text-right">Greige Width</th>
                <th className="py-3.5 px-4 text-right">Warp Width</th>
                <th className="py-3.5 px-4 text-right">Total Ends</th>
                <th className="py-3.5 px-4 text-center">Clr Warp</th>
                <th className="py-3.5 px-4 text-center">Clr Weft</th>
                <th className="py-3.5 px-4 text-center">Reed Count</th>
                <th className="py-3.5 px-4 text-right">WARP Qty</th>
                <th className="py-3.5 px-4 text-right">Produced Qty</th>
                <th className="py-3.5 px-4 text-right">Balance Qty</th>
                <th className="py-3.5 px-4 text-center">Sizing Plan Date</th>
                <th className="py-3.5 px-4 text-center">Sizing Target End</th>
                <th className="py-3.5 px-4 text-center">Weaving Planned Start</th>
                <th className="py-3.5 px-4 text-center">Target Completion</th>
                <th className="py-3.5 px-4 text-center">Planned Looms</th>
                <th className="py-3.5 px-4 text-right">Planned Avg Prod</th>
                <th className="py-3.5 px-4 text-center">System Expected</th>
                <th className="py-3.5 px-4 text-center">Schedule Variance</th>
                <th className="py-3.5 px-4 text-center bg-indigo-950/80">Actual Looms</th>
                <th className="py-3.5 px-4 text-center bg-indigo-950/80">Actual Start</th>
                <th className="py-3.5 px-4 text-right bg-indigo-950/80">Actual Avg Prod</th>
                <th className="py-3.5 px-4 text-center bg-indigo-950/80">Actual Runout / Completion</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={31} className="py-12 text-center text-slate-400 font-bold text-sm">
                    No orders found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((ord, idx) => {
                  const isSelected = selectedOrderIds.includes(ord.id);
                  const isProdDropAlert = ord.production_drop_alert || false;
                  
                  const plan = calculateOrderPlanning({
                    orderQty: ord.order_qty,
                    plannedLoomCount: ord.planned_loom_count || 0,
                    plannedAvgProduction: ord.avg_production_per_loom || 0,
                    weavingPlannedDate: ord.weaving_planned_date || ord.weaving_start_date,
                    weavingCompletionDate: ord.weaving_completion_date,
                    actualLoomCount: ord.actual_loom_count,
                    actualWeavingStartDate: ord.actual_weaving_start_date,
                    actualAvgProduction: ord.actual_avg_production,
                    producedQty: ord.produced_qty,
                    actualCompletionDate: ord.actual_completion_date,
                    status: ord.status,
                    orderCompletionStatus: ord.order_completion_status
                  });

                  const isOrderCompleted = ord.status === 'ORDER COMPLETED' || ord.order_completion_status === 'COMPLETED';
                  const isEligibleForCompletion = !isOrderCompleted && (plan.producedQty >= plan.orderQty || plan.balanceQty <= 0 || ord.status === 'WEAVING COMPLETED');
                  const matchedDesign = designs.find(d => d.design_no_sp_no.trim().toLowerCase() === (ord.design_no_sp_no || '').trim().toLowerCase());

                  const displayConstruction = ord.construction || matchedDesign?.construction || '—';
                  const displayWeaveType = ord.weave_type || matchedDesign?.weave_type || 'CAM';
                  const displayBeamType = ord.beam_type || matchedDesign?.beam_type || 'SINGLE BEAM';
                  const displayFrames = ord.frames ?? matchedDesign?.frames ?? 4;
                  const displayGreigeWidth = ord.greige_width ?? (ord as any).width ?? matchedDesign?.greige_width ?? '—';
                  const displayWarpWidth = ord.reed_space ?? (ord as any).reed_space_warp_width ?? matchedDesign?.reed_space_warp_width ?? '—';
                  const displayTotalEnds = ord.total_ends ?? matchedDesign?.total_ends ?? '—';
                  const displayClrWarp = ord.no_of_clr_warp ?? (ord as any).warp_colours ?? matchedDesign?.no_of_clr_warp ?? (matchedDesign as any)?.warp_colours ?? 1;
                  const displayClrWeft = ord.no_of_clr_weft ?? ord.weft_colours ?? matchedDesign?.no_of_clr_weft ?? matchedDesign?.weft_colours ?? 1;
                  const displayReedCount = ord.reed_count || matchedDesign?.reed_count || '—';
                  const displaySizingTargetEnd = ord.sizing_completion_date || ord.sizing_completed_date
                    ? format(new Date(ord.sizing_completion_date || ord.sizing_completed_date!), 'dd-MM-yyyy')
                    : (ord.sizing_planned_date ? format(addDays(new Date(ord.sizing_planned_date), 5), 'dd-MM-yyyy') : '—');

                  return (
                    <tr key={ord.id} className={`transition-colors ${
                      isProdDropAlert ? 'bg-red-50/70 hover:bg-red-100/50 border-l-4 border-l-red-500' :
                      isSelected ? 'bg-indigo-50/50' : 'hover:bg-indigo-50/30'
                    }`}>
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleRowCheckbox(ord.id)}
                          className="w-4 h-4 rounded text-spu-secondary focus:ring-spu-secondary cursor-pointer accent-indigo-600"
                        />
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-4 font-black text-indigo-700 font-mono">
                        {ord.ibpo_no || ord.order_no || '—'}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-700">{ord.design_no_sp_no}</td>
                      <td className="py-3 px-4 text-slate-600 font-medium">{displayConstruction}</td>
                      <td className="py-3 px-4 text-slate-600 font-medium uppercase">{displayWeaveType}</td>
                      <td className="py-3 px-4 text-slate-600 font-medium uppercase">{displayBeamType}</td>
                      <td className="py-3 px-4 text-center text-slate-600 font-medium">{displayFrames}</td>
                      <td className="py-3 px-4 text-right text-slate-600 font-medium">{displayGreigeWidth}</td>
                      <td className="py-3 px-4 text-right text-slate-600 font-medium">{displayWarpWidth}</td>
                      <td className="py-3 px-4 text-right text-slate-600 font-medium">{displayTotalEnds}</td>
                      <td className="py-3 px-4 text-center text-slate-600 font-medium">{displayClrWarp}</td>
                      <td className="py-3 px-4 text-center text-slate-600 font-medium">{displayClrWeft}</td>
                      <td className="py-3 px-4 text-center text-slate-600 font-medium">{displayReedCount}</td>
                      <td className="py-3 px-4 text-right font-black text-slate-900">{plan.orderQty.toLocaleString()} {ord.uom || 'M'}</td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-600">{plan.producedQty.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right font-bold text-amber-600">{plan.balanceQty.toLocaleString()}</td>
                      <td className="py-3 px-4 text-center text-slate-600 font-medium">{ord.sizing_planned_date ? format(new Date(ord.sizing_planned_date), 'dd-MM-yyyy') : '—'}</td>
                      <td className="py-3 px-4 text-center text-slate-600 font-medium">{displaySizingTargetEnd}</td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-700">{plan.weavingPlannedDateFormatted}</td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-700">{plan.targetCompletionDateFormatted}</td>
                      <td className="py-3 px-4 text-center font-bold text-slate-800">{plan.plannedLoomCount}</td>
                      <td className="py-3 px-4 text-right text-slate-600">{plan.plannedAvgProduction} M</td>
                      <td className="py-3 px-4 text-center font-bold text-indigo-900">{plan.expectedCompletionDateFormatted}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          plan.scheduleStatus === 'AHEAD' ? 'bg-emerald-100 text-emerald-800' :
                          plan.scheduleStatus === 'ON TIME' ? 'bg-blue-100 text-blue-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {plan.varianceText}
                        </span>
                      </td>

                      {/* Actual Operational Columns (Real Data Derived) */}
                      <td className="py-3 px-4 text-center font-bold text-slate-800 bg-slate-50/50">
                        {ord.actual_loom_count ?? 0}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-600 bg-slate-50/50">
                        {ord.actual_weaving_start_date ? format(new Date(ord.actual_weaving_start_date), 'dd-MM-yyyy') : 'Not Started'}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-700 bg-slate-50/50">
                        {ord.actual_loom_count && ord.actual_loom_count > 0 && ord.actual_avg_production ? `${ord.actual_avg_production} M` : '—'}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-indigo-900 bg-slate-50/50">
                        {ord.actual_completion_date ? format(new Date(ord.actual_completion_date), 'dd-MM-yyyy') : (ord.actual_loom_count && ord.actual_loom_count > 0 && ord.actual_runout_date ? format(new Date(ord.actual_runout_date), 'dd-MM-yyyy') : 'Not Started')}
                      </td>

                      {/* Status Column with Production Drop Warning Badge */}
                      <td className="py-3 px-4 text-center">
                        {isOrderCompleted ? (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-md uppercase tracking-wider border border-emerald-300 inline-flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-emerald-600" /> ✓ ORDER COMPLETED
                          </span>
                        ) : isProdDropAlert ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-[10px] font-black rounded-md uppercase border border-slate-200">
                              {plan.normalizedStatus}
                            </span>
                            <span
                              className="px-2 py-0.5 bg-red-100 text-red-800 text-[10px] font-black rounded-full border border-red-300 inline-flex items-center gap-1 cursor-help"
                              title={`Expected Avg: ${ord.expected_avg_production || plan.plannedAvgProduction} M/day | Actual Avg: ${ord.actual_avg_production || 0} M/day | Drop: ${ord.production_drop_pct || 0}%`}
                            >
                              <AlertTriangle className="w-3 h-3 text-red-600" /> ⚠ LOW PRODUCTION (-{ord.production_drop_pct}%)
                            </span>
                          </div>
                        ) : (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-[10px] font-black rounded-md uppercase tracking-wider border border-slate-200">
                            {plan.normalizedStatus}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right space-x-1 print:hidden">
                        {!isOrderCompleted && canEdit && (
                          <button
                            onClick={() => handleCompleteOrder(ord)}
                            className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all shadow-sm inline-flex items-center gap-1 mr-1 ${
                              isEligibleForCompletion
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-400/50'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-300'
                            }`}
                            title="Confirm Order Completion"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> COMPLETE ORDER
                          </button>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => handleOpenEdit(ord)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit Order"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(ord.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Order"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Single Order Create/Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-black text-slate-800">
                {editingOrder ? 'Edit Order' : 'Create New Order'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              
              {/* Customer Details Section */}
              {/* Design Details Section */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">Section A — Design Specifications</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">IBPO *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. IBPO-001"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:border-spu-secondary outline-none uppercase"
                      value={formData.ibpo_no}
                      onChange={(e) => setFormData({ ...formData, ibpo_no: e.target.value })}
                    />
                    {ibpoCheckMsg && (
                      <p className={`text-[10px] font-bold mt-1 ${ibpoCheckMsg.isAvailable ? 'text-emerald-600' : 'text-red-600'}`}>
                        {ibpoCheckMsg.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Design No *</label>
                    <input
                      type="text"
                      required
                      list="designList"
                      placeholder="e.g. SP26/001-00002"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:border-spu-secondary outline-none"
                      value={formData.design_no_sp_no}
                      onChange={(e) => handleDesignChange(e.target.value)}
                    />
                    <datalist id="designList">
                      {designs.map(d => (
                        <option key={d.design_no_sp_no} value={d.design_no_sp_no} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Construction</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.construction}
                      onChange={(e) => setFormData({ ...formData, construction: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Weave Type</label>
                    <input
                      type="text"
                      list="weaveTypeList"
                      placeholder="CAM / DOBBY / JACQUARD"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.weave_type}
                      onChange={(e) => setFormData({ ...formData, weave_type: e.target.value })}
                    />
                    <datalist id="weaveTypeList">
                      <option value="CAM" />
                      <option value="4 FRAME CAM" />
                      <option value="DOBBY" />
                      <option value="16 FRAME DOBBY" />
                      <option value="3/1 TWILL" />
                      <option value="JACQUARD" />
                    </datalist>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Beam Type</label>
                    <select
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.beam_type}
                      onChange={(e) => setFormData({ ...formData, beam_type: e.target.value })}
                    >
                      <option value="SINGLE BEAM">SINGLE BEAM</option>
                      <option value="DOUBLE BEAM">DOUBLE BEAM</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">No. of Frames</label>
                    <input
                      type="number"
                      min={1}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.frames}
                      onChange={(e) => setFormData({ ...formData, frames: Number(e.target.value) })}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Greige Width</label>
                    <input
                      type="text"
                      placeholder="e.g. 57"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.greige_width || ''}
                      onChange={(e) => setFormData({ ...formData, greige_width: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Warp Width</label>
                    <input
                      type="text"
                      placeholder="e.g. 58.5"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.reed_space || ''}
                      onChange={(e) => setFormData({ ...formData, reed_space: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Total Ends</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.total_ends || ''}
                      onChange={(e) => setFormData({ ...formData, total_ends: Number(e.target.value) })}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">No. of Color Warp</label>
                    <input
                      type="text"
                      placeholder="1 or 1+2"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.no_of_clr_warp ?? ''}
                      onChange={(e) => setFormData({ ...formData, no_of_clr_warp: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">No. of Color Weft</label>
                    <input
                      type="text"
                      placeholder="1 or 1+2"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.no_of_clr_weft ?? ''}
                      onChange={(e) => setFormData({ ...formData, no_of_clr_weft: e.target.value, weft_colours: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Reed Count</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.reed_count}
                      onChange={(e) => setFormData({ ...formData, reed_count: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Order Quantities & Dates */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">Section B — Order Quantities & Dates</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
                  <div className="flex flex-col justify-end h-full">
                    <div className="min-h-[32px] flex items-end mb-1">
                      <label className="text-[11px] font-bold text-slate-600 uppercase leading-tight">WARP MTR *</label>
                    </div>
                    <input
                      type="number"
                      required
                      min={1}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.order_qty}
                      onChange={(e) => setFormData({ ...formData, order_qty: Number(e.target.value) })}
                    />
                  </div>

                  <div className="flex flex-col justify-end h-full">
                    <div className="min-h-[32px] flex items-end mb-1">
                      <label className="text-[11px] font-bold text-slate-600 uppercase leading-tight">Sizing Plan Date</label>
                    </div>
                    <input
                      type="date"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.sizing_planned_date}
                      onChange={(e) => setFormData({ ...formData, sizing_planned_date: e.target.value })}
                    />
                  </div>

                  <div className="flex flex-col justify-end h-full">
                    <div className="min-h-[32px] flex items-end mb-1">
                      <label className="text-[11px] font-bold text-slate-600 uppercase leading-tight">Sizing Target End</label>
                    </div>
                    <input
                      type="date"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.sizing_completion_date}
                      onChange={(e) => setFormData({ ...formData, sizing_completion_date: e.target.value })}
                    />
                  </div>

                  <div className="flex flex-col justify-end h-full">
                    <div className="min-h-[32px] flex items-end mb-1">
                      <label className="text-[11px] font-bold text-slate-600 uppercase leading-tight">Weaving Plan Start *</label>
                    </div>
                    <input
                      type="date"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.weaving_planned_date || formData.weaving_start_date}
                      onChange={(e) => setFormData({ ...formData, weaving_planned_date: e.target.value, weaving_start_date: e.target.value })}
                    />
                  </div>

                  <div className="flex flex-col justify-end h-full">
                    <div className="min-h-[32px] flex items-end mb-1">
                      <label className="text-[11px] font-bold text-slate-600 uppercase leading-tight">Weaving Target End *</label>
                    </div>
                    <input
                      type="date"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.weaving_completion_date}
                      onChange={(e) => setFormData({ ...formData, weaving_completion_date: e.target.value })}
                    />
                  </div>
                </div>
              </div>



              {/* Planning Parameters */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">Section C — Loom Capacity Planning</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase">Planned Loom Count *</label>
                    <input
                      type="number"
                      required
                      min={1}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.planned_loom_count}
                      onChange={(e) => setFormData({ ...formData, planned_loom_count: Number(e.target.value) })}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase">Planned Avg Prod / Loom (m/day) *</label>
                    <input
                      type="number"
                      required
                      min={1}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      value={formData.avg_production_per_loom}
                      onChange={(e) => setFormData({ ...formData, avg_production_per_loom: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              {/* Live Forecast Preview */}
              <div className="bg-indigo-50/60 p-4 rounded-2xl border border-indigo-100 space-y-2">
                <div className="text-xs font-black uppercase text-indigo-800 tracking-wider">Planned Schedule Forecast Preview</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-bold text-indigo-900">
                  <div>Daily Prod: <strong>{liveSchedule.calculatedDailyProd} M/day</strong></div>
                  <div>Required Days: <strong>{liveSchedule.requiredProductionDays} Days</strong></div>
                  <div>Expected End: <strong>{liveSchedule.expectedCompletionDate ? format(liveSchedule.expectedCompletionDate, 'dd-MM-yyyy') : '—'}</strong></div>
                  <div>Variance: <span className="uppercase text-indigo-700">{liveSchedule.varianceText}</span></div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={loading} className="px-6 py-2.5 bg-spu-secondary text-white rounded-xl text-xs font-bold shadow-md hover:bg-indigo-700 disabled:opacity-50">
                  {loading ? 'Saving Order...' : 'Save Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Multi Orders Entry Modal (Excel Copy/Paste Grid) ── */}
      {showMultiEntryModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-7xl max-h-[94vh] flex flex-col overflow-hidden">
            
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
              <div>
                <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-indigo-400" /> Multi Orders Entry (Excel Copy/Paste Grid)
                </h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Copy multiple rows from Excel and paste directly into this grid. Edit cells, auto-fill design specs, and save batch orders.</p>
              </div>
              <button onClick={() => setShowMultiEntryModal(false)} className="text-slate-400 hover:text-white"><X className="w-6 h-6" /></button>
            </div>

            {/* Paste Instruction Toolbar */}
            <div className="bg-indigo-50/80 px-6 py-3 border-b border-indigo-100 flex items-center justify-between flex-wrap gap-3">
              <div className="text-xs font-bold text-indigo-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <span>Tip: Click inside the grid and press <strong>Ctrl + V</strong> to paste rows directly from Excel.</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMultiRows(prev => [...prev, createBlankMultiRow()])}
                  className="px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-100 transition-colors shadow-sm"
                >
                  + Add Row
                </button>
                <button
                  type="button"
                  onClick={() => setMultiRows(Array.from({ length: 5 }).map(createBlankMultiRow))}
                  className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors"
                >
                  Clear Grid
                </button>
              </div>
            </div>

            {multiErrorMsg && (
              <div className="px-6 py-2.5 bg-red-100 border-b border-red-200 text-red-800 text-xs font-bold flex items-center justify-between">
                <span>⚠️ {multiErrorMsg}</span>
                <button onClick={() => setMultiErrorMsg(null)} className="text-red-600 hover:text-red-900"><X className="w-4 h-4" /></button>
              </div>
            )}

            {/* Excel Grid Table */}
            <div className="flex-1 overflow-auto custom-scrollbar p-4" onPaste={handlePasteExcel}>
              <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
                <thead className="bg-slate-100 text-slate-700 font-black uppercase tracking-wider sticky top-0 z-20 border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-2 text-center border-r border-slate-200 w-10">#</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[140px]">IBPO *</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[150px]">Design No *</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[150px]">Construction</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[120px]">Weave Type</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[130px]">Beam Type</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[90px]">Frames</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[100px]">Greige Width</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[100px]">Warp Width</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[100px]">Total Ends</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[90px]">Clr Warp</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[90px]">Clr Weft</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[110px]">Reed Count</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[110px]">WARP MTR *</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[130px]">Sizing Plan Date</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[130px]">Sizing Target End</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[130px]">Planned Start *</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[130px]">Target Completion *</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[90px]">Looms *</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[110px]">Avg Prod *</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[100px]">Forecast Days</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[110px]">Expected End</th>
                    <th className="py-2.5 px-2 border-r border-slate-200 min-w-[110px]">Priority</th>
                    <th className="py-2.5 px-2 text-center w-10">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {multiRows.map((row, idx) => {
                    const dailyProd = (Number(row.planned_loom_count) || 0) * (Number(row.avg_production_per_loom) || 0);
                    const reqDays = dailyProd > 0 ? Math.ceil((Number(row.order_qty) || 0) / dailyProd) : 0;
                    const expectedEnd = row.weaving_start_date && reqDays > 0 ? format(addDays(new Date(row.weaving_start_date), reqDays), 'dd-MM-yyyy') : '—';
                    const matchedDesign = designs.find(d => d.design_no_sp_no.trim().toLowerCase() === row.design_no_sp_no.trim().toLowerCase());

                    return (
                      <tr key={idx} className="hover:bg-indigo-50/30">
                        <td className="py-2 px-2 text-center font-bold text-slate-400 border-r border-slate-200">{idx + 1}</td>

                        {/* IBPO Number */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="text"
                            placeholder="IBPO-001"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-bold text-indigo-700 uppercase outline-none focus:border-indigo-600"
                            value={row.ibpo_no}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], ibpo_no: v }; return n; });
                            }}
                          />
                        </td>

                        {/* Design / SP Number */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="text"
                            placeholder="Design No"
                            list={`des-list-${idx}`}
                            className={`w-full px-2 py-1.5 bg-white border rounded font-bold text-slate-800 outline-none focus:border-indigo-600 ${row.design_no_sp_no && !matchedDesign ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}
                            value={row.design_no_sp_no}
                            onChange={e => updateMultiRowDesign(idx, e.target.value)}
                          />
                          <datalist id={`des-list-${idx}`}>
                            {designs.map(d => <option key={d.design_no_sp_no} value={d.design_no_sp_no} />)}
                          </datalist>
                        </td>

                        {/* Construction */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="text"
                            placeholder="Construction"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-medium text-slate-700 outline-none focus:border-indigo-600"
                            value={row.construction}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], construction: v }; return n; });
                            }}
                          />
                        </td>

                        {/* Weave Type */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="text"
                            placeholder="CAM / DOBBY"
                            list={`weave-list-${idx}`}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-medium text-slate-700 outline-none focus:border-indigo-600 uppercase"
                            value={row.weave_type}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], weave_type: v }; return n; });
                            }}
                          />
                          <datalist id={`weave-list-${idx}`}>
                            <option value="CAM" />
                            <option value="4 FRAME CAM" />
                            <option value="DOBBY" />
                            <option value="16 FRAME DOBBY" />
                            <option value="3/1 TWILL" />
                            <option value="JACQUARD" />
                          </datalist>
                        </td>

                        {/* Beam Type */}
                        <td className="p-1 border-r border-slate-200">
                          <select
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-semibold text-slate-700 outline-none text-xs"
                            value={row.beam_type}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], beam_type: v }; return n; });
                            }}
                          >
                            <option value="SINGLE BEAM">SINGLE BEAM</option>
                            <option value="DOUBLE BEAM">DOUBLE BEAM</option>
                          </select>
                        </td>

                        {/* No. of Frames */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="number"
                            min={1}
                            placeholder="4"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-medium text-center text-slate-800 outline-none focus:border-indigo-600"
                            value={row.frames}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], frames: v }; return n; });
                            }}
                          />
                        </td>

                        {/* Greige Width */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="text"
                            placeholder="57"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-medium text-slate-700 outline-none focus:border-indigo-600"
                            value={row.greige_width}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], greige_width: v }; return n; });
                            }}
                          />
                        </td>

                        {/* Warp Width */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="text"
                            placeholder="58.5"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-medium text-slate-700 outline-none focus:border-indigo-600"
                            value={row.reed_space}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], reed_space: v }; return n; });
                            }}
                          />
                        </td>

                        {/* Total Ends */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="number"
                            placeholder="4800"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-medium text-right text-slate-800 outline-none focus:border-indigo-600"
                            value={row.total_ends}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], total_ends: v }; return n; });
                            }}
                          />
                        </td>

                        {/* No. of Color Warp */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="text"
                            placeholder="1 or 1+2"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-medium text-center text-slate-800 outline-none focus:border-indigo-600"
                            value={row.no_of_clr_warp ?? ''}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], no_of_clr_warp: v }; return n; });
                            }}
                          />
                        </td>

                        {/* No. of Color Weft */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="text"
                            placeholder="1 or 1+2"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-medium text-center text-slate-800 outline-none focus:border-indigo-600"
                            value={row.no_of_clr_weft ?? ''}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], no_of_clr_weft: v, weft_colours: v }; return n; });
                            }}
                          />
                        </td>

                        {/* Reed Count */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="text"
                            placeholder="80"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-medium text-slate-700 outline-none focus:border-indigo-600"
                            value={row.reed_count}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], reed_count: v }; return n; });
                            }}
                          />
                        </td>

                        {/* WARP Qty */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="number"
                            placeholder="Qty"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-black text-right text-slate-900 outline-none focus:border-indigo-600"
                            value={row.order_qty}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], order_qty: v, grey_qty: v, warp_qty: v }; return n; });
                            }}
                          />
                        </td>

                        {/* Sizing Plan Date */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="date"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-semibold text-slate-700 outline-none focus:border-indigo-600"
                            value={row.sizing_planned_date}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], sizing_planned_date: v }; return n; });
                            }}
                          />
                        </td>

                        {/* Sizing Target End */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="date"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-semibold text-slate-700 outline-none focus:border-indigo-600"
                            value={row.sizing_completion_date}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], sizing_completion_date: v }; return n; });
                            }}
                          />
                        </td>

                        {/* Planned Start Date */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="date"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-semibold text-slate-700 outline-none focus:border-indigo-600"
                            value={row.weaving_start_date}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], weaving_start_date: v, weaving_planned_date: v }; return n; });
                            }}
                          />
                        </td>

                        {/* Target Completion Date */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="date"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-semibold text-slate-700 outline-none focus:border-indigo-600"
                            value={row.weaving_completion_date}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], weaving_completion_date: v }; return n; });
                            }}
                          />
                        </td>

                        {/* Planned Loom Count */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="number"
                            placeholder="Looms"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-bold text-center text-slate-800 outline-none focus:border-indigo-600"
                            value={row.planned_loom_count}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], planned_loom_count: v }; return n; });
                            }}
                          />
                        </td>

                        {/* Avg Production */}
                        <td className="p-1 border-r border-slate-200">
                          <input
                            type="number"
                            placeholder="m/day"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-bold text-right text-slate-800 outline-none focus:border-indigo-600"
                            value={row.avg_production_per_loom}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], avg_production_per_loom: v }; return n; });
                            }}
                          />
                        </td>

                        {/* Forecast Days */}
                        <td className="py-2 px-3 text-center font-bold text-slate-700 border-r border-slate-200 bg-slate-50">
                          {reqDays > 0 ? `${reqDays} Days` : '—'}
                        </td>

                        {/* Expected End */}
                        <td className="py-2 px-3 text-center font-bold text-indigo-900 border-r border-slate-200 bg-indigo-50/40">
                          {expectedEnd}
                        </td>

                        {/* Priority */}
                        <td className="p-1 border-r border-slate-200">
                          <select
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-bold text-xs outline-none"
                            value={row.priority}
                            onChange={e => {
                              const v = e.target.value;
                              setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], priority: v }; return n; });
                            }}
                          >
                            <option value="NORMAL">NORMAL</option>
                            <option value="HIGH">HIGH</option>
                            <option value="URGENT">URGENT</option>
                            <option value="LOW">LOW</option>
                          </select>
                        </td>

                        {/* Delete Row Action */}
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setMultiRows(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                            title="Remove row"
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

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="text-xs font-bold text-slate-500">
                Total Orders Ready: <strong className="text-slate-800">{multiRows.filter(r => r.ibpo_no.trim() || r.customer_name.trim()).length}</strong>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowMultiEntryModal(false)}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmittingMulti}
                  onClick={handleSaveMultiOrders}
                  className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-black shadow-md hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 transition-all"
                >
                  {isSubmittingMulti ? 'Saving All Orders...' : 'SAVE ALL ORDERS'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Multi Edit Modal ── */}
      {showMultiEditModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
            
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-blue-900 text-white">
              <div>
                <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-blue-300" /> Multi Order Edit ({multiRows.length} Orders Selected)
                </h2>
                <p className="text-xs text-blue-200 font-medium mt-0.5">Edit customer, quantity, dates, or loom capacity planning for selected active orders.</p>
              </div>
              <button onClick={() => setShowMultiEditModal(false)} className="text-slate-400 hover:text-white"><X className="w-6 h-6" /></button>
            </div>

            {multiErrorMsg && (
              <div className="px-6 py-2.5 bg-red-100 border-b border-red-200 text-red-800 text-xs font-bold flex items-center justify-between">
                <span>⚠️ {multiErrorMsg}</span>
                <button onClick={() => setMultiErrorMsg(null)} className="text-red-600 hover:text-red-900"><X className="w-4 h-4" /></button>
              </div>
            )}

            <div className="flex-1 overflow-auto custom-scrollbar p-4">
              <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
                <thead className="bg-slate-100 text-slate-700 font-black uppercase tracking-wider sticky top-0 z-20 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 border-r border-slate-200 min-w-[140px]">IBPO Number</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 min-w-[140px]">Design No</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 min-w-[110px]">WARP Qty *</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 min-w-[130px]">Planned Start *</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 min-w-[130px]">Target Completion *</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 min-w-[100px]">Planned Looms *</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 min-w-[110px]">Avg Prod/Loom *</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 min-w-[110px]">Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {multiRows.map((row, idx) => (
                    <tr key={row.id || idx} className="hover:bg-blue-50/30">
                      <td className="py-2 px-3 font-black text-indigo-700 border-r border-slate-200 bg-slate-50">
                        {row.ibpo_no}
                      </td>

                      <td className="py-2 px-3 font-bold text-slate-800 border-r border-slate-200 bg-slate-50">
                        {row.design_no_sp_no}
                      </td>

                      <td className="p-1 border-r border-slate-200">
                        <input
                          type="number"
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-black text-right text-slate-900 outline-none focus:border-blue-600"
                          value={row.order_qty}
                          onChange={e => {
                            const v = e.target.value;
                            setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], order_qty: v }; return n; });
                          }}
                        />
                      </td>

                      <td className="p-1 border-r border-slate-200">
                        <input
                          type="date"
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-semibold text-slate-700 outline-none focus:border-blue-600"
                          value={row.weaving_start_date}
                          onChange={e => {
                            const v = e.target.value;
                            setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], weaving_start_date: v, weaving_planned_date: v }; return n; });
                          }}
                        />
                      </td>

                      <td className="p-1 border-r border-slate-200">
                        <input
                          type="date"
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-semibold text-slate-700 outline-none focus:border-blue-600"
                          value={row.weaving_completion_date}
                          onChange={e => {
                            const v = e.target.value;
                            setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], weaving_completion_date: v }; return n; });
                          }}
                        />
                      </td>

                      <td className="p-1 border-r border-slate-200">
                        <input
                          type="number"
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-bold text-center text-slate-800 outline-none focus:border-blue-600"
                          value={row.planned_loom_count}
                          onChange={e => {
                            const v = e.target.value;
                            setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], planned_loom_count: v }; return n; });
                          }}
                        />
                      </td>

                      <td className="p-1 border-r border-slate-200">
                        <input
                          type="number"
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-bold text-right text-slate-800 outline-none focus:border-blue-600"
                          value={row.avg_production_per_loom}
                          onChange={e => {
                            const v = e.target.value;
                            setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], avg_production_per_loom: v }; return n; });
                          }}
                        />
                      </td>

                      <td className="p-1 border-r border-slate-200">
                        <select
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-bold text-xs outline-none"
                          value={row.priority}
                          onChange={e => {
                            const v = e.target.value;
                            setMultiRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], priority: v }; return n; });
                          }}
                        >
                          <option value="NORMAL">NORMAL</option>
                          <option value="HIGH">HIGH</option>
                          <option value="URGENT">URGENT</option>
                          <option value="LOW">LOW</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="text-xs font-bold text-slate-500">
                Selected Orders for Edit: <strong className="text-blue-900">{multiRows.length}</strong>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowMultiEditModal(false)}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmittingMulti}
                  onClick={handleSaveMultiEdit}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-blue-700 disabled:opacity-50 transition-all"
                >
                  {isSubmittingMulti ? 'Saving Changes...' : 'SAVE CHANGES'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}