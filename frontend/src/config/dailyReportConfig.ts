// SPUPL Daily Report Master Configuration
// Extracted strictly from master reference file: "DAILY PRODUCTION -AUGUST- 26.xlsx"
// Covers all 13 departments, exact raw metrics, default targets, units, and automated formulas.

export interface MetricDefinition {
  code: string;
  name: string;
  type: 'number' | 'text' | 'textarea';
  unit?: string;
  target?: number;
  defaultValue?: any;
  placeholder?: string;
  isCalculated?: boolean;
}

export interface DepartmentConfig {
  code: string;
  name: string;
  head: string;
  mentor: string;
  description: string;
  rawMetrics: MetricDefinition[];
  calculatedMetrics: MetricDefinition[];
  calculate: (rawValues: Record<string, any>) => Record<string, any>;
}

export const DEPARTMENTS: DepartmentConfig[] = [
  // 1. PLANNING
  {
    code: 'PLANNING',
    name: 'PLANNING',
    head: 'BALAMURALI',
    mentor: 'MANIKANDAN',
    description: 'Order status, Critical, Fast Track and Reproduction Order Tracking',
    rawMetrics: [
      { code: 'CURRENT_ORDER_STATUS', name: 'Current Order Status', type: 'textarea', placeholder: 'e.g. YARN DYED -25.63 Lacs / SOLID -1.94Lacs' },
      { code: 'CRITICAL_ORDERS', name: 'Critical Orders', type: 'textarea', placeholder: 'e.g. sp26/015, 200, 153, 080, 566' },
      { code: 'FAST_TRACK_ORDERS', name: 'Fast Track Orders', type: 'textarea', placeholder: 'e.g. SP26/598, 599, 620, 619, 330' },
      { code: 'REPRODUCTION_ORDERS', name: 'Reproduction Orders', type: 'textarea', placeholder: 'e.g. SP20/272, SP23/164, SP26/269' },
      { code: 'NEW_ORDERS', name: 'New Orders', type: 'textarea', placeholder: 'e.g. YARN DYED-0.08 / SOLID-0.00' },
      // OTT Pending Status (Department-Wise Pending Orders)
      { code: 'OTT_GREIGE_YARN', name: 'Greige Yarn', type: 'number', unit: 'Orders', placeholder: 'Enter Greige Yarn OTT pending' },
      { code: 'OTT_DYED_YARN', name: 'Dyed Yarn', type: 'number', unit: 'Orders', placeholder: 'Enter Dyed Yarn OTT pending' },
      { code: 'OTT_SIZING', name: 'Sizing', type: 'number', unit: 'Orders', placeholder: 'Enter Sizing OTT pending' },
      { code: 'OTT_GREIGE_WAREHOUSE', name: 'Greige WareHouse', type: 'number', unit: 'Orders', placeholder: 'Enter Greige WareHouse OTT pending' },
      { code: 'OTT_PROCESSING', name: 'Processing', type: 'number', unit: 'Orders', placeholder: 'Enter Processing OTT pending' },
      { code: 'OTT_FINISHED_WAREHOUSE', name: 'Finished WareHouse', type: 'number', unit: 'Orders', placeholder: 'Enter Finished WareHouse OTT pending' },
      { code: 'OTT_FINAL_DISPATCH', name: 'Final Dispatch', type: 'number', unit: 'Orders', placeholder: 'Enter Final Dispatch OTT pending' }
    ],
    calculatedMetrics: [],
    calculate: (raw) => ({})
  },

  // 2. SIZING
  {
    code: 'SIZING',
    name: 'SIZING',
    head: 'GUNASEKARAN',
    mentor: 'SENTHIL',
    description: 'Sizing & Warping production, Remnants & Yarn Stock positions',
    rawMetrics: [
      { code: 'SIZING_MTRS', name: 'Sizing Production (Mtrs)', type: 'number', target: 40000, unit: 'Mtrs', placeholder: 'Enter Sizing meters' },
      { code: 'SEC_WARPING_MTRS', name: 'Sectional Warping (Mtrs)', type: 'number', target: 4000, unit: 'Mtrs', placeholder: 'Enter Sec Warping meters' },
      { code: 'SAMPLE_BEAMS', name: 'Sample (Beams)', type: 'number', target: 4, unit: 'Nos', placeholder: 'Enter Sample count' },
      { code: 'REWINDING_KGS', name: 'Re-Winding Production (KGS)', type: 'number', target: 600, unit: 'Kgs', placeholder: 'Enter Re-winding kgs' },
      { code: 'REMNANTS_KGS', name: 'Remnants Generation (KGS)', type: 'number', target: 0, unit: 'Kgs', placeholder: 'Enter Remnants kgs' },
      { code: 'DYED_YARN_STOCK_KGS', name: 'Dyed Yarn Stock (KGS)', type: 'number', unit: 'Kgs', placeholder: 'Enter Dyed Yarn stock' },
      { code: 'GREY_YARN_STOCK_KGS', name: 'Grey Yarn Stock (KGS)', type: 'number', unit: 'Kgs', placeholder: 'Enter Grey Yarn stock' }
    ],
    calculatedMetrics: [
      { code: 'SIZING_DIFF', name: 'Sizing Diff (vs 40k)', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'SIZING_ACHIEVEMENT_PCT', name: 'Sizing Achievement %', type: 'number', unit: '%', isCalculated: true },
      { code: 'SEC_WARPING_DIFF', name: 'Sec Warping Diff (vs 4k)', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'SEC_WARPING_ACHIEVEMENT_PCT', name: 'Sec Warping Achievement %', type: 'number', unit: '%', isCalculated: true },
      { code: 'REWINDING_DIFF', name: 'Re-Winding Diff (vs 600)', type: 'number', unit: 'Kgs', isCalculated: true },
      { code: 'TOTAL_YARN_STOCK_KGS', name: 'Total Yarn Stock (Dyed + Grey)', type: 'number', unit: 'Kgs', isCalculated: true }
    ],
    calculate: (raw) => {
      const sizing = Number(raw.SIZING_MTRS) || 0;
      const warping = Number(raw.SEC_WARPING_MTRS) || 0;
      const rewinding = Number(raw.REWINDING_KGS) || 0;
      const dyed = Number(raw.DYED_YARN_STOCK_KGS) || 0;
      const grey = Number(raw.GREY_YARN_STOCK_KGS) || 0;
      return {
        SIZING_DIFF: Math.round(sizing - 40000),
        SIZING_ACHIEVEMENT_PCT: Number(((sizing / 40000) * 100).toFixed(1)),
        SEC_WARPING_DIFF: Math.round(warping - 4000),
        SEC_WARPING_ACHIEVEMENT_PCT: Number(((warping / 4000) * 100).toFixed(1)),
        REWINDING_DIFF: Math.round(rewinding - 600),
        TOTAL_YARN_STOCK_KGS: Math.round(dyed + grey)
      };
    }
  },

  // 3. WEAVING
  {
    code: 'WEAVING',
    name: 'WEAVING',
    head: 'GUNASEKARAN',
    mentor: 'RAMESH / GUNASEKARAN',
    description: 'Inhouse weaving meters, picks, operational efficiencies and loom stoppages',
    rawMetrics: [
      { code: 'INHOUSE_KPICKS', name: 'Inhouse Production (KPicks)', type: 'number', target: 155739, unit: 'KPicks', placeholder: 'Enter KPicks' },
      { code: 'INHOUSE_MTRS', name: 'Inhouse Production (Mtrs)', type: 'number', target: 68400, unit: 'Mtrs', placeholder: 'Enter Weaving meters' },
      { code: 'AVG_PICK', name: 'Average Pick (PPI)', type: 'number', defaultValue: 59.1, unit: 'PPI', placeholder: 'e.g. 59.1' },
      { code: 'EFFICIENCY_PCT', name: 'Efficiency %', type: 'number', unit: '%', placeholder: 'e.g. 64' },
      { code: 'UTILISATION_PCT', name: 'Utilisation %', type: 'number', unit: '%', placeholder: 'e.g. 95' },
      { code: 'UE_PCT', name: 'UE %', type: 'number', unit: '%', placeholder: 'e.g. 60' },
      { code: 'NO_OF_KNOTTINGS', name: 'No of Knottings', type: 'number', unit: 'Nos', placeholder: 'Count' },
      { code: 'NO_OF_SORT_CHANGES', name: 'No of Sort Changes', type: 'number', unit: 'Nos', placeholder: 'Count' },
      { code: 'NO_OF_FULL_LOOM_STOPPAGE', name: 'No of Full Loom Stoppages', type: 'number', unit: 'Nos', placeholder: 'Count' }
    ],
    calculatedMetrics: [
      { code: 'KPICKS_DIFF', name: 'KPicks Diff (vs Target)', type: 'number', unit: 'KPicks', isCalculated: true },
      { code: 'KPICKS_ACHIEVEMENT_PCT', name: 'KPicks Achievement %', type: 'number', unit: '%', isCalculated: true },
      { code: 'MTRS_DIFF', name: 'Mtrs Diff (vs 68.4k)', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'MTRS_ACHIEVEMENT_PCT', name: 'Mtrs Achievement %', type: 'number', unit: '%', isCalculated: true }
    ],
    calculate: (raw) => {
      const kp = Number(raw.INHOUSE_KPICKS) || 0;
      const mtr = Number(raw.INHOUSE_MTRS) || 0;
      return {
        KPICKS_DIFF: Math.round(kp - 155739),
        KPICKS_ACHIEVEMENT_PCT: Number(((kp / 155739) * 100).toFixed(1)),
        MTRS_DIFF: Math.round(mtr - 68400),
        MTRS_ACHIEVEMENT_PCT: Number(((mtr / 68400) * 100).toFixed(1))
      };
    }
  },

  // 4. GREIGE INSPECTION
  {
    code: 'GREIGE_INSPECTION',
    name: 'GREIGE INSPECTION',
    head: 'GUNASEKARAN',
    mentor: 'M.RAMESH',
    description: 'Inhouse, Vendor and Washing greige inspection, passed & rejection rates',
    rawMetrics: [
      { code: 'INHOUSE_TOTAL_INSPECTED', name: 'Inhouse - Total Mtrs Inspected', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'INHOUSE_TOTAL_PASSED', name: 'Inhouse - Total Mtrs Passed', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'VENDOR_TOTAL_INSPECTED', name: 'Vendor - Total Mtrs Inspected', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'VENDOR_TOTAL_PASSED', name: 'Vendor - Total Mtrs Passed', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'WASHING_TOTAL_MTRS', name: 'Washing - Total Mtrs', type: 'number', unit: 'Mtrs', defaultValue: 0, placeholder: 'Mtrs' },
      { code: 'WASHING_TOTAL_PASSED', name: 'Washing - Total Passed', type: 'number', unit: 'Mtrs', defaultValue: 0, placeholder: 'Mtrs' }
    ],
    calculatedMetrics: [
      { code: 'INHOUSE_TOTAL_REJECTED', name: 'Inhouse - Total Rejected', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'INHOUSE_REJECTION_PCT', name: 'Inhouse - Rejection %', type: 'number', unit: '%', isCalculated: true },
      { code: 'VENDOR_TOTAL_REJECTED', name: 'Vendor - Total Rejected', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'VENDOR_REJECTION_PCT', name: 'Vendor - Rejection %', type: 'number', unit: '%', isCalculated: true },
      { code: 'TOTAL_MTRS_INSPECTED', name: 'Combined Total Inspected', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'TOTAL_MTRS_PASSED', name: 'Combined Total Passed', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'TOTAL_MTRS_REJECTED', name: 'Combined Total Rejected', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'OVERALL_REJECTION_PCT', name: 'Combined Overall Rejection %', type: 'number', unit: '%', isCalculated: true }
    ],
    calculate: (raw) => {
      const inInsp = Number(raw.INHOUSE_TOTAL_INSPECTED) || 0;
      const inPass = Number(raw.INHOUSE_TOTAL_PASSED) || 0;
      const inRej = Math.max(0, Number((inInsp - inPass).toFixed(1)));
      const inRejPct = inInsp > 0 ? Number(((inRej / inInsp) * 100).toFixed(2)) : 0;

      const venInsp = Number(raw.VENDOR_TOTAL_INSPECTED) || 0;
      const venPass = Number(raw.VENDOR_TOTAL_PASSED) || 0;
      const venRej = Math.max(0, Number((venInsp - venPass).toFixed(1)));
      const venRejPct = venInsp > 0 ? Number(((venRej / venInsp) * 100).toFixed(2)) : 0;

      const washInsp = Number(raw.WASHING_TOTAL_MTRS) || 0;
      const washPass = Number(raw.WASHING_TOTAL_PASSED) || 0;
      const washRej = Math.max(0, Number((washInsp - washPass).toFixed(1)));

      const totInsp = Number((inInsp + venInsp + washInsp).toFixed(1));
      const totPass = Number((inPass + venPass + washPass).toFixed(1));
      const totRej = Number((inRej + venRej + washRej).toFixed(1));
      const totRejPct = totInsp > 0 ? Number(((totRej / totInsp) * 100).toFixed(2)) : 0;

      return {
        INHOUSE_TOTAL_REJECTED: inRej,
        INHOUSE_REJECTION_PCT: inRejPct,
        VENDOR_TOTAL_REJECTED: venRej,
        VENDOR_REJECTION_PCT: venRejPct,
        WASHING_TOTAL_REJECTED: washRej,
        TOTAL_MTRS_INSPECTED: totInsp,
        TOTAL_MTRS_PASSED: totPass,
        TOTAL_MTRS_REJECTED: totRej,
        OVERALL_REJECTION_PCT: totRejPct
      };
    }
  },

  // 5. FINISHED INSPECTION
  {
    code: 'FINISHED_INSPECTION',
    name: 'FINISHED INSPECTION',
    head: 'GUNASEKARAN',
    mentor: 'M.RAMESH',
    description: 'Finished inspection, realisation %, rewash, rejections & purchase inspection',
    rawMetrics: [
      { code: 'SALES_RETURN_MTRS', name: 'Sales Returns (Mtrs)', type: 'number', target: 0, unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'REPRODUCTION_MTRS', name: 'Reproduction (Mtrs)', type: 'number', target: 0, unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'REJECTION_MTRS', name: 'Daily Rejection Total (Mtrs)', type: 'number', target: 0, unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'REWASH_MTRS', name: 'Daily Rewash Total (Mtrs)', type: 'number', target: 0, unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'DYEING_PRINTING_MTRS', name: 'Dyeing & Printing (Mtrs)', type: 'number', target: 50000, unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'FINISHED_INSPECTION_MTRS', name: 'Finished Inspection (Mtrs)', type: 'number', target: 77950, unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'REALISATION_PCT', name: 'Realisation %', type: 'number', unit: '%', placeholder: 'e.g. 99.2' },
      { code: 'PROCESSING_REJECTION_MTRS', name: 'Processing Rejection (Mtrs)', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'VENDOR_REJECTION_MTRS', name: 'Vendor Rejection (Mtrs)', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'WEAVING_REJECTION_MTRS', name: 'Weaving Rejection (Mtrs)', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'PROCESSING_REWASH_MTRS', name: 'Processing Rewash (Mtrs)', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'VENDOR_REWASH_MTRS', name: 'Vendor Rewash (Mtrs)', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'FABRIC_PURCHASE_MTRS', name: 'Fabric Purchase Inspection (Mtrs)', type: 'number', target: 30000, unit: 'Mtrs', placeholder: 'Mtrs' }
    ],
    calculatedMetrics: [
      { code: 'FINISHED_DIFF', name: 'Inspection Diff (vs 77.9k)', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'FINISHED_ACHIEVEMENT_PCT', name: 'Inspection Achievement %', type: 'number', unit: '%', isCalculated: true },
      { code: 'TOTAL_REJECTION_MTRS', name: 'Total Finished Rejections', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'TOTAL_REJECTION_PCT', name: 'Total Rejection %', type: 'number', unit: '%', isCalculated: true },
      { code: 'TOTAL_REWASH_MTRS', name: 'Total Rewash Mtrs', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'TOTAL_REWASH_PCT', name: 'Total Rewash %', type: 'number', unit: '%', isCalculated: true },
      { code: 'FABRIC_PURCHASE_DIFF', name: 'Purchase Diff (vs 30k)', type: 'number', unit: 'Mtrs', isCalculated: true }
    ],
    calculate: (raw) => {
      const finished = Number(raw.FINISHED_INSPECTION_MTRS) || 0;
      const procRej = Number(raw.PROCESSING_REJECTION_MTRS) || 0;
      const venRej = Number(raw.VENDOR_REJECTION_MTRS) || 0;
      const weavRej = Number(raw.WEAVING_REJECTION_MTRS) || 0;
      const totRej = Number((procRej + venRej + weavRej).toFixed(1));
      const totRejPct = finished > 0 ? Number(((totRej / finished) * 100).toFixed(2)) : 0;

      const procRew = Number(raw.PROCESSING_REWASH_MTRS) || 0;
      const venRew = Number(raw.VENDOR_REWASH_MTRS) || 0;
      const totRew = Number((procRew + venRew).toFixed(1));
      const totRewPct = finished > 0 ? Number(((totRew / finished) * 100).toFixed(2)) : 0;

      const purchase = Number(raw.FABRIC_PURCHASE_MTRS) || 0;

      return {
        FINISHED_DIFF: Math.round(finished - 77950),
        FINISHED_ACHIEVEMENT_PCT: Number(((finished / 77950) * 100).toFixed(1)),
        TOTAL_REJECTION_MTRS: totRej,
        TOTAL_REJECTION_PCT: totRejPct,
        TOTAL_REWASH_MTRS: totRew,
        TOTAL_REWASH_PCT: totRewPct,
        FABRIC_PURCHASE_DIFF: Math.round(purchase - 30000)
      };
    }
  },

  // 6. MENDING
  {
    code: 'MENDING',
    name: 'MENDING',
    head: 'GUNASEKARAN',
    mentor: 'MATHESHWARAN',
    description: 'Weaving, Yarn, Sizing and Processing mending quantities',
    rawMetrics: [
      { code: 'WEAVING_INHOUSE_MTRS', name: 'Weaving (Inhouse) Mtrs', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'WEAVING_VENDOR_MTRS', name: 'Weaving (Vendor) Mtrs', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'YARN_INHOUSE_MTRS', name: 'Yarn (Inhouse) Mtrs', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'YARN_VENDOR_MTRS', name: 'Yarn (Vendor) Mtrs', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'SIZING_INHOUSE_MTRS', name: 'Sizing (Inhouse) Mtrs', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'SIZING_VENDOR_MTRS', name: 'Sizing (Vendor) Mtrs', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'PROCESSING_MTRS', name: 'Processing Mtrs', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' }
    ],
    calculatedMetrics: [
      { code: 'TOTAL_WEAVING_MENDING', name: 'Total Weaving Mending', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'TOTAL_YARN_MENDING', name: 'Total Yarn Mending', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'TOTAL_SIZING_MENDING', name: 'Total Sizing Mending', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'TOTAL_MENDED_QTY', name: 'Grand Total Mended Quantity', type: 'number', unit: 'Mtrs', isCalculated: true }
    ],
    calculate: (raw) => {
      const wIn = Number(raw.WEAVING_INHOUSE_MTRS) || 0;
      const wVen = Number(raw.WEAVING_VENDOR_MTRS) || 0;
      const yIn = Number(raw.YARN_INHOUSE_MTRS) || 0;
      const yVen = Number(raw.YARN_VENDOR_MTRS) || 0;
      const sIn = Number(raw.SIZING_INHOUSE_MTRS) || 0;
      const sVen = Number(raw.SIZING_VENDOR_MTRS) || 0;
      const p = Number(raw.PROCESSING_MTRS) || 0;

      const totW = Number((wIn + wVen).toFixed(1));
      const totY = Number((yIn + yVen).toFixed(1));
      const totS = Number((sIn + sVen).toFixed(1));
      const grand = Number((totW + totY + totS + p).toFixed(1));

      return {
        TOTAL_WEAVING_MENDING: totW,
        TOTAL_YARN_MENDING: totY,
        TOTAL_SIZING_MENDING: totS,
        TOTAL_MENDED_QTY: grand
      };
    }
  },

  // 7. PROCESSING / DYEING
  {
    code: 'PROCESSING_DYEING',
    name: 'PROCESSING / DYEING',
    head: 'NATESAN',
    mentor: 'NATESAN / GANESH',
    description: 'Pinning, Dyeing & Printing deliveries, fabric stock and OTD pending queues',
    rawMetrics: [
      { code: 'PINNING_MTRS', name: 'Pinning (Mtrs)', type: 'number', target: 0, unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'REPROCESS_MTRS', name: 'Reprocess (Mtrs)', type: 'number', target: 0, unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'PROCESSING_DELIVERY_INHOUSE', name: 'Processing Delivery Inhouse (Mtrs)', type: 'number', target: 35000, unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'PROCESSING_DELIVERY_OUTSIDE', name: 'Processing Delivery Outside (Mtrs)', type: 'number', target: 0, unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'DYEING_PRINTING_MTRS', name: 'Dyeing & Printing (Mtrs)', type: 'number', target: 50000, unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'GREIGE_FABRIC_STOCK_MTRS', name: 'Greige Fabric Stock (Mtrs)', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'YARN_DYED_FABRIC_STOCK_MTRS', name: 'Yarn Dyed Fabric Stock (Mtrs)', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'NO_OF_DAYS', name: 'NO OF DAYS', type: 'number', unit: 'Days', placeholder: 'Enter actual number of days' },
      { code: 'OTD_GREIGE_YARN', name: 'OTD Pending - Greige Yarn', type: 'number', unit: 'Orders', placeholder: 'Orders count' },
      { code: 'OTD_DYED_YARN', name: 'OTD Pending - Dyed Yarn', type: 'number', unit: 'Orders', placeholder: 'Orders count' },
      { code: 'OTD_SIZING', name: 'OTD Pending - Sizing', type: 'number', unit: 'Orders', placeholder: 'Orders count' },
      { code: 'OTD_GREIGE_WAREHOUSE', name: 'OTD Pending - Greige Warehouse', type: 'number', unit: 'Orders', placeholder: 'Orders count' },
      { code: 'OTD_PROCESSING', name: 'OTD Pending - Processing', type: 'number', unit: 'Orders', placeholder: 'Orders count' },
      { code: 'OTD_FINISHED_WAREHOUSE', name: 'OTD Pending - Finished Warehouse', type: 'number', unit: 'Orders', placeholder: 'Orders count' },
      { code: 'OTD_FINAL_DISPATCH', name: 'OTD Pending - Final Dispatch', type: 'number', unit: 'Orders', placeholder: 'Orders count' }
    ],
    calculatedMetrics: [
      { code: 'DELIVERY_INHOUSE_DIFF', name: 'Delivery Inhouse Diff (vs 35k)', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'DELIVERY_INHOUSE_ACHIEVEMENT_PCT', name: 'Delivery Inhouse Achievement %', type: 'number', unit: '%', isCalculated: true },
      { code: 'DYEING_PRINTING_DIFF', name: 'Dyeing Diff (vs 50k)', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'DYEING_PRINTING_ACHIEVEMENT_PCT', name: 'Dyeing Achievement %', type: 'number', unit: '%', isCalculated: true },
      { code: 'TOTAL_FABRIC_STOCK_MTRS', name: 'Total Fabric Stock (Greige + YD)', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'TOTAL_OTD_PENDING', name: 'Total OTD Pending Orders', type: 'number', unit: 'Orders', isCalculated: true }
    ],
    calculate: (raw) => {
      const delIn = Number(raw.PROCESSING_DELIVERY_INHOUSE) || 0;
      const dye = Number(raw.DYEING_PRINTING_MTRS) || 0;
      const gStk = Number(raw.GREIGE_FABRIC_STOCK_MTRS) || 0;
      const ydStk = Number(raw.YARN_DYED_FABRIC_STOCK_MTRS) || 0;

      const otd1 = Number(raw.OTD_GREIGE_YARN) || 0;
      const otd2 = Number(raw.OTD_DYED_YARN) || 0;
      const otd3 = Number(raw.OTD_SIZING) || 0;
      const otd4 = Number(raw.OTD_GREIGE_WAREHOUSE) || 0;
      const otd5 = Number(raw.OTD_PROCESSING) || 0;
      const otd6 = Number(raw.OTD_FINISHED_WAREHOUSE) || 0;
      const otd7 = Number(raw.OTD_FINAL_DISPATCH) || 0;

      return {
        DELIVERY_INHOUSE_DIFF: Math.round(delIn - 35000),
        DELIVERY_INHOUSE_ACHIEVEMENT_PCT: Number(((delIn / 35000) * 100).toFixed(1)),
        DYEING_PRINTING_DIFF: Math.round(dye - 50000),
        DYEING_PRINTING_ACHIEVEMENT_PCT: Number(((dye / 50000) * 100).toFixed(1)),
        TOTAL_FABRIC_STOCK_MTRS: Math.round(gStk + ydStk),
        TOTAL_OTD_PENDING: otd1 + otd2 + otd3 + otd4 + otd5 + otd6 + otd7
      };
    }
  },

  // 8. RAW MATERIAL
  {
    code: 'RAW_MATERIAL',
    name: 'RAW MATERIAL',
    head: 'VENKAT',
    mentor: 'MOHANA / CHANDRU',
    description: 'Greige yarn and Dyed yarn order completion, on-time and delays',
    rawMetrics: [
      { code: 'GREIGE_TOTAL_ORDERS', name: 'Greige Yarn - Total Orders', type: 'number', unit: 'Orders', placeholder: 'Count' },
      { code: 'GREIGE_YARN_COMPLETED', name: 'Greige Yarn - Completed', type: 'number', unit: 'Orders', placeholder: 'Count' },
      { code: 'GREIGE_ONTIME', name: 'Greige Yarn - Ontime', type: 'number', unit: 'Orders', placeholder: 'Count' },
      { code: 'DYED_TOTAL_ORDERS', name: 'Dyed Yarn - Total Orders', type: 'number', unit: 'Orders', placeholder: 'Count' },
      { code: 'DYED_YARN_COMPLETED', name: 'Dyed Yarn - Completed', type: 'number', unit: 'Orders', placeholder: 'Count' },
      { code: 'DYED_ONTIME', name: 'Dyed Yarn - Ontime', type: 'number', unit: 'Orders', placeholder: 'Count' }
    ],
    calculatedMetrics: [
      { code: 'GREIGE_NOT_COMPLETED', name: 'Greige Yarn - Not Completed', type: 'number', unit: 'Orders', isCalculated: true },
      { code: 'GREIGE_DELAY', name: 'Greige Yarn - Delay', type: 'number', unit: 'Orders', isCalculated: true },
      { code: 'DYED_NOT_COMPLETED', name: 'Dyed Yarn - Not Completed', type: 'number', unit: 'Orders', isCalculated: true },
      { code: 'DYED_DELAY', name: 'Dyed Yarn - Delay', type: 'number', unit: 'Orders', isCalculated: true }
    ],
    calculate: (raw) => {
      const gTot = Number(raw.GREIGE_TOTAL_ORDERS) || 0;
      const gComp = Number(raw.GREIGE_YARN_COMPLETED) || 0;
      const gOn = Number(raw.GREIGE_ONTIME) || 0;

      const dTot = Number(raw.DYED_TOTAL_ORDERS) || 0;
      const dComp = Number(raw.DYED_YARN_COMPLETED) || 0;
      const dOn = Number(raw.DYED_ONTIME) || 0;

      return {
        GREIGE_NOT_COMPLETED: Math.max(0, gTot - gComp),
        GREIGE_DELAY: Math.max(0, gComp - gOn),
        DYED_NOT_COMPLETED: Math.max(0, dTot - dComp),
        DYED_DELAY: Math.max(0, dComp - dOn)
      };
    }
  },

  // 9. GREY WAREHOUSE
  {
    code: 'GREY_WAREHOUSE',
    name: 'GREY WAREHOUSE',
    head: 'GUNASEKARAN',
    mentor: 'M.RAMESH / VIVEK',
    description: 'Greige production received, finished fabric production & outward dispatch',
    rawMetrics: [
      { code: 'TOTAL_PRODN_GREIGE', name: 'Total Prodn - Greige (Mtrs)', type: 'number', target: 75000, unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'TOTAL_PRODN_FINISH', name: 'Total Prodn - Finish (Mtrs)', type: 'number', target: 0, unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'GREIGE_YD_OUTWARD', name: 'Greige & YD Outward (Mtrs)', type: 'number', target: 80000, unit: 'Mtrs', placeholder: 'Mtrs' }
    ],
    calculatedMetrics: [
      { code: 'PRODN_GREIGE_DIFF', name: 'Greige Prodn Diff (vs 75k)', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'PRODN_GREIGE_ACHIEVEMENT_PCT', name: 'Greige Prodn Achievement %', type: 'number', unit: '%', isCalculated: true },
      { code: 'OUTWARD_DIFF', name: 'Outward Diff (vs 80k)', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'OUTWARD_ACHIEVEMENT_PCT', name: 'Outward Achievement %', type: 'number', unit: '%', isCalculated: true }
    ],
    calculate: (raw) => {
      const grg = Number(raw.TOTAL_PRODN_GREIGE) || 0;
      const out = Number(raw.GREIGE_YD_OUTWARD) || 0;
      return {
        PRODN_GREIGE_DIFF: Math.round(grg - 75000),
        PRODN_GREIGE_ACHIEVEMENT_PCT: Number(((grg / 75000) * 100).toFixed(1)),
        OUTWARD_DIFF: Math.round(out - 80000),
        OUTWARD_ACHIEVEMENT_PCT: Number(((out / 80000) * 100).toFixed(1))
      };
    }
  },

  // 10. OUTSOURCING
  {
    code: 'OUTSOURCING',
    name: 'OUTSOURCING',
    head: 'MADHESH',
    mentor: 'MADHESH',
    description: 'Outsourced fabric receipt for greige and yarn dyed orders',
    rawMetrics: [
      { code: 'GREIGE_FABRIC', name: 'Greige Fabric (Mtrs)', type: 'number', target: 15000, unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'YD_FABRIC', name: 'YD Fabric (Mtrs)', type: 'number', target: 15000, unit: 'Mtrs', placeholder: 'Mtrs' }
    ],
    calculatedMetrics: [
      { code: 'GREIGE_DIFF', name: 'Greige Diff (vs 15k)', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'GREIGE_ACHIEVEMENT_PCT', name: 'Greige Achievement %', type: 'number', unit: '%', isCalculated: true },
      { code: 'YD_DIFF', name: 'YD Diff (vs 15k)', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'YD_ACHIEVEMENT_PCT', name: 'YD Achievement %', type: 'number', unit: '%', isCalculated: true }
    ],
    calculate: (raw) => {
      const g = Number(raw.GREIGE_FABRIC) || 0;
      const yd = Number(raw.YD_FABRIC) || 0;
      return {
        GREIGE_DIFF: Math.round(g - 15000),
        GREIGE_ACHIEVEMENT_PCT: Number(((g / 15000) * 100).toFixed(1)),
        YD_DIFF: Math.round(yd - 15000),
        YD_ACHIEVEMENT_PCT: Number(((yd / 15000) * 100).toFixed(1))
      };
    }
  },

  // 11. DISPATCH & PACKING
  {
    code: 'DISPATCH_PACKING',
    name: 'DISPATCH & PACKING',
    head: 'M.RAMESH / BALA MURALI',
    mentor: 'JAGAN',
    description: 'Finished goods dispatch and packing volume tracking',
    rawMetrics: [
      { code: 'DESPATCH_MTRS', name: 'Despatch (Mtrs)', type: 'number', target: 77950, unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'PACKING_MTRS', name: 'Packing (Mtrs)', type: 'number', target: 77950, unit: 'Mtrs', placeholder: 'Mtrs' }
    ],
    calculatedMetrics: [
      { code: 'DESPATCH_DIFF', name: 'Despatch Diff (vs 77.9k)', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'DESPATCH_ACHIEVEMENT_PCT', name: 'Despatch Achievement %', type: 'number', unit: '%', isCalculated: true },
      { code: 'PACKING_DIFF', name: 'Packing Diff (vs 77.9k)', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'PACKING_ACHIEVEMENT_PCT', name: 'Packing Achievement %', type: 'number', unit: '%', isCalculated: true }
    ],
    calculate: (raw) => {
      const des = Number(raw.DESPATCH_MTRS) || 0;
      const pac = Number(raw.PACKING_MTRS) || 0;
      return {
        DESPATCH_DIFF: Math.round(des - 77950),
        DESPATCH_ACHIEVEMENT_PCT: Number(((des / 77950) * 100).toFixed(1)),
        PACKING_DIFF: Math.round(pac - 77950),
        PACKING_ACHIEVEMENT_PCT: Number(((pac / 77950) * 100).toFixed(1))
      };
    }
  },

  // 12. SPINNING
  {
    code: 'SPINNING',
    name: 'SPINNING',
    head: 'VENKATESHWARAN',
    mentor: 'VENKATESHWARAN',
    description: 'VSF, Flax & Linen production and GPS metrics',
    rawMetrics: [
      { code: 'VSF_PRODUCTION', name: 'VSF Production (Kgs)', type: 'number', target: 0, unit: 'Kgs', placeholder: 'Kgs' },
      { code: 'FLAX_LINEN_PRODUCTION', name: 'Flax, Linen & Others (Kgs)', type: 'number', target: 3500, unit: 'Kgs', placeholder: 'Kgs' },
      { code: 'VSF_GPS', name: 'VSF GPS (GMS)', type: 'number', target: 135, unit: 'GMS', placeholder: 'Gms' },
      { code: 'FLAX_GPS', name: 'Flax GPS (GMS)', type: 'number', target: 140, unit: 'GMS', placeholder: 'Gms' }
    ],
    calculatedMetrics: [
      { code: 'FLAX_DIFF', name: 'Flax Diff (vs 3500)', type: 'number', unit: 'Kgs', isCalculated: true },
      { code: 'FLAX_ACHIEVEMENT_PCT', name: 'Flax Achievement %', type: 'number', unit: '%', isCalculated: true },
      { code: 'FLAX_GPS_DIFF', name: 'Flax GPS Diff (vs 140)', type: 'number', unit: 'GMS', isCalculated: true }
    ],
    calculate: (raw) => {
      const flx = Number(raw.FLAX_LINEN_PRODUCTION) || 0;
      const gps = Number(raw.FLAX_GPS) || 0;
      return {
        FLAX_DIFF: Math.round(flx - 3500),
        FLAX_ACHIEVEMENT_PCT: Number(((flx / 3500) * 100).toFixed(1)),
        FLAX_GPS_DIFF: Math.round(gps - 140)
      };
    }
  },

  // 13. HRD
  {
    code: 'HRD',
    name: 'HRD',
    head: 'JAYANTH',
    mentor: 'MOHAN',
    description: 'Approved vs engaged manpower strength, new joiners, others & quality/operational source entry',
    rawMetrics: [
      { code: 'APPROVED_STRENGTH', name: 'Approved Strength', type: 'number', defaultValue: 510, unit: 'Persons', placeholder: '510' },
      { code: 'ENGAGED_STRENGTH', name: 'Engaged Strength', type: 'number', unit: 'Persons', placeholder: 'Persons' },
      { code: 'NO_OF_NEW_JOINERS', name: 'No of New Joiners', type: 'number', unit: 'Persons', placeholder: 'Persons' },
      { code: 'OTHERS_MANPOWER', name: 'Others Manpower', type: 'number', defaultValue: 0, unit: 'Persons', placeholder: 'Persons' }
    ],
    calculatedMetrics: [
      { code: 'HRD_EXCESS_SHORTAGE', name: 'HRD Excess / Shortage', type: 'number', unit: 'Persons', isCalculated: true }
    ],
    calculate: (raw) => {
      const app = Number(raw.APPROVED_STRENGTH) || 510;
      const eng = Number(raw.ENGAGED_STRENGTH) || 0;
      return {
        HRD_EXCESS_SHORTAGE: eng > 0 ? eng - app : 0
      };
    }
  },

  // 14. TRANSPORT
  {
    code: 'TRANSPORT',
    name: 'TRANSPORT',
    head: 'SARAVANAN',
    mentor: 'MOHAN',
    description: 'Transport vehicle trips tracking',
    rawMetrics: [
      { code: 'TRANSPORT_TRIPS', name: 'Transport Vehicle Trips', type: 'number', target: 45, unit: 'Trips', placeholder: 'Trips' }
    ],
    calculatedMetrics: [
      { code: 'TRANSPORT_DIFF', name: 'Transport Diff (vs 45)', type: 'number', unit: 'Trips', isCalculated: true },
      { code: 'TRANSPORT_ACHIEVEMENT_PCT', name: 'Transport Achievement %', type: 'number', unit: '%', isCalculated: true }
    ],
    calculate: (raw) => {
      const tr = Number(raw.TRANSPORT_TRIPS) || 0;
      return {
        TRANSPORT_DIFF: Math.round(tr - 45),
        TRANSPORT_ACHIEVEMENT_PCT: Number(((tr / 45) * 100).toFixed(1))
      };
    }
  }
];

export function getDepartment(code: string): DepartmentConfig | undefined {
  if (code === 'HRD_TRANSPORT') {
    return DEPARTMENTS.find(d => d.code === 'HRD');
  }
  return DEPARTMENTS.find(d => d.code === code);
}

export const getDepartmentByCode = getDepartment;

export function computePerformanceMark(target?: number, actual?: number, pct?: number): string {
  if (target === undefined || target === null || target <= 0) return 'N/A';
  if (actual === undefined || actual === null) return 'NOT ENTERED';
  if (actual === 0 && target > 0) return 'CRITICAL';
  const achievement = pct !== undefined && pct !== null ? pct : (target > 0 ? (actual / target) * 100 : 0);
  if (achievement >= 100) return 'EXCELLENT';
  if (achievement >= 90) return 'GOOD';
  if (achievement >= 80) return 'ON PLAN';
  return 'BELOW TARGET';
}

export interface OttMetricDefinition {
  code: string;
  name: string;
  unit: string;
}

export const PLANNING_OTT_METRICS: OttMetricDefinition[] = [
  { code: 'OTT_GREIGE_YARN', name: 'Greige Yarn', unit: 'Orders/Lots' },
  { code: 'OTT_DYED_YARN', name: 'Dyed Yarn', unit: 'Orders/Lots' },
  { code: 'OTT_SIZING', name: 'Sizing', unit: 'Orders/Lots' },
  { code: 'OTT_GREIGE_WAREHOUSE', name: 'Greige WareHouse', unit: 'Orders/Lots' },
  { code: 'OTT_PROCESSING', name: 'Processing', unit: 'Orders/Lots' },
  { code: 'OTT_FINISHED_WAREHOUSE', name: 'Finished WareHouse', unit: 'Orders/Lots' },
  { code: 'OTT_FINAL_DISPATCH', name: 'Final Dispatch', unit: 'Orders/Lots' }
];

