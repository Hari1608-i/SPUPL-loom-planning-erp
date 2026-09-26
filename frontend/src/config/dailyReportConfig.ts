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

const isEntered = (val: any): boolean => val !== undefined && val !== null && val !== '' && !isNaN(Number(val));

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
      const isSizing = isEntered(raw.SIZING_MTRS);
      const isWarping = isEntered(raw.SEC_WARPING_MTRS);
      const isRewinding = isEntered(raw.REWINDING_KGS);
      const isDyed = isEntered(raw.DYED_YARN_STOCK_KGS);
      const isGrey = isEntered(raw.GREY_YARN_STOCK_KGS);

      const sizing = isSizing ? Number(raw.SIZING_MTRS) : null;
      const warping = isWarping ? Number(raw.SEC_WARPING_MTRS) : null;
      const rewinding = isRewinding ? Number(raw.REWINDING_KGS) : null;
      const dyed = isDyed ? Number(raw.DYED_YARN_STOCK_KGS) : 0;
      const grey = isGrey ? Number(raw.GREY_YARN_STOCK_KGS) : 0;

      return {
        SIZING_DIFF: sizing !== null ? Math.round(sizing - 40000) : '',
        SIZING_ACHIEVEMENT_PCT: sizing !== null ? Number(((sizing / 40000) * 100).toFixed(1)) : '',
        SEC_WARPING_DIFF: warping !== null ? Math.round(warping - 4000) : '',
        SEC_WARPING_ACHIEVEMENT_PCT: warping !== null ? Number(((warping / 4000) * 100).toFixed(1)) : '',
        REWINDING_DIFF: rewinding !== null ? Math.round(rewinding - 600) : '',
        TOTAL_YARN_STOCK_KGS: (isDyed || isGrey) ? Math.round(dyed + grey) : ''
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
      const isKp = isEntered(raw.INHOUSE_KPICKS);
      const isMtr = isEntered(raw.INHOUSE_MTRS);
      const kp = isKp ? Number(raw.INHOUSE_KPICKS) : null;
      const mtr = isMtr ? Number(raw.INHOUSE_MTRS) : null;
      return {
        KPICKS_DIFF: kp !== null ? Math.round(kp - 155739) : '',
        KPICKS_ACHIEVEMENT_PCT: kp !== null ? Number(((kp / 155739) * 100).toFixed(1)) : '',
        MTRS_DIFF: mtr !== null ? Math.round(mtr - 68400) : '',
        MTRS_ACHIEVEMENT_PCT: mtr !== null ? Number(((mtr / 68400) * 100).toFixed(1)) : ''
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
      const hasInInsp = isEntered(raw.INHOUSE_TOTAL_INSPECTED);
      const hasInPass = isEntered(raw.INHOUSE_TOTAL_PASSED);
      const inInsp = hasInInsp ? Number(raw.INHOUSE_TOTAL_INSPECTED) : null;
      const inPass = hasInPass ? Number(raw.INHOUSE_TOTAL_PASSED) : null;
      const inRej = (inInsp !== null && inPass !== null) ? Math.max(0, Number((inInsp - inPass).toFixed(1))) : '';
      const inRejPct = (inInsp !== null && inInsp > 0 && typeof inRej === 'number') ? Number(((inRej / inInsp) * 100).toFixed(2)) : '';

      const hasVenInsp = isEntered(raw.VENDOR_TOTAL_INSPECTED);
      const hasVenPass = isEntered(raw.VENDOR_TOTAL_PASSED);
      const venInsp = hasVenInsp ? Number(raw.VENDOR_TOTAL_INSPECTED) : null;
      const venPass = hasVenPass ? Number(raw.VENDOR_TOTAL_PASSED) : null;
      const venRej = (venInsp !== null && venPass !== null) ? Math.max(0, Number((venInsp - venPass).toFixed(1))) : '';
      const venRejPct = (venInsp !== null && venInsp > 0 && typeof venRej === 'number') ? Number(((venRej / venInsp) * 100).toFixed(2)) : '';

      const hasWashInsp = isEntered(raw.WASHING_TOTAL_MTRS);
      const hasWashPass = isEntered(raw.WASHING_TOTAL_PASSED);
      const washInsp = hasWashInsp ? Number(raw.WASHING_TOTAL_MTRS) : null;
      const washPass = hasWashPass ? Number(raw.WASHING_TOTAL_PASSED) : null;
      const washRej = (washInsp !== null && washPass !== null) ? Math.max(0, Number((washInsp - washPass).toFixed(1))) : '';

      const hasAnyInsp = inInsp !== null || venInsp !== null || washInsp !== null;
      const totInsp = hasAnyInsp ? Number(((inInsp || 0) + (venInsp || 0) + (washInsp || 0)).toFixed(1)) : '';
      const hasAnyPass = inPass !== null || venPass !== null || washPass !== null;
      const totPass = hasAnyPass ? Number(((inPass || 0) + (venPass || 0) + (washPass || 0)).toFixed(1)) : '';
      const hasAnyRej = (typeof inRej === 'number') || (typeof venRej === 'number') || (typeof washRej === 'number');
      const totRej = hasAnyRej ? Number(((typeof inRej === 'number' ? inRej : 0) + (typeof venRej === 'number' ? venRej : 0) + (typeof washRej === 'number' ? washRej : 0)).toFixed(1)) : '';
      const totRejPct = (typeof totInsp === 'number' && totInsp > 0 && typeof totRej === 'number') ? Number(((totRej / totInsp) * 100).toFixed(2)) : '';

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
      const isFin = isEntered(raw.FINISHED_INSPECTION_MTRS);
      const finished = isFin ? Number(raw.FINISHED_INSPECTION_MTRS) : null;

      const hasProcRej = isEntered(raw.PROCESSING_REJECTION_MTRS);
      const hasVenRej = isEntered(raw.VENDOR_REJECTION_MTRS);
      const hasWeavRej = isEntered(raw.WEAVING_REJECTION_MTRS);
      const hasAnyRej = hasProcRej || hasVenRej || hasWeavRej;
      const totRej = hasAnyRej ? Number(((Number(raw.PROCESSING_REJECTION_MTRS) || 0) + (Number(raw.VENDOR_REJECTION_MTRS) || 0) + (Number(raw.WEAVING_REJECTION_MTRS) || 0)).toFixed(1)) : '';
      const totRejPct = (finished !== null && finished > 0 && typeof totRej === 'number') ? Number(((totRej / finished) * 100).toFixed(2)) : '';

      const hasProcRew = isEntered(raw.PROCESSING_REWASH_MTRS);
      const hasVenRew = isEntered(raw.VENDOR_REWASH_MTRS);
      const hasAnyRew = hasProcRew || hasVenRew;
      const totRew = hasAnyRew ? Number(((Number(raw.PROCESSING_REWASH_MTRS) || 0) + (Number(raw.VENDOR_REWASH_MTRS) || 0)).toFixed(1)) : '';
      const totRewPct = (finished !== null && finished > 0 && typeof totRew === 'number') ? Number(((totRew / finished) * 100).toFixed(2)) : '';

      const isPurchase = isEntered(raw.FABRIC_PURCHASE_MTRS);
      const purchase = isPurchase ? Number(raw.FABRIC_PURCHASE_MTRS) : null;

      return {
        FINISHED_DIFF: finished !== null ? Math.round(finished - 77950) : '',
        FINISHED_ACHIEVEMENT_PCT: finished !== null ? Number(((finished / 77950) * 100).toFixed(1)) : '',
        TOTAL_REJECTION_MTRS: totRej,
        TOTAL_REJECTION_PCT: totRejPct,
        TOTAL_REWASH_MTRS: totRew,
        TOTAL_REWASH_PCT: totRewPct,
        FABRIC_PURCHASE_DIFF: purchase !== null ? Math.round(purchase - 30000) : ''
      };
    }
  },

  // SAMPLING
  {
    code: 'SAMPLING',
    name: 'SAMPLING',
    head: 'GUNASEKARAN',
    mentor: 'MATHESHWARAN',
    description: 'Single End Sizing, Desk Loom Mtr, Sample WPG, Pending Sample and Remarks',
    rawMetrics: [
      { code: 'SINGLE_END_SIZING', name: 'SINGLE END SIZING', type: 'number', target: 80, unit: 'KG', placeholder: 'e.g. 80' },
      { code: 'DESK_LOOM_MTR', name: 'DESK LOOM MTR', type: 'number', placeholder: 'Desk Loom Mtr' },
      { code: 'SAMPLE_WPG', name: 'SAMPLE WPG', type: 'number', target: 8, placeholder: 'e.g. 8' },
      { code: 'PENDING_SAMPLE', name: 'PENDING SAMPLE', type: 'number', placeholder: 'Pending Sample' },
      { code: 'REMARKS', name: 'Remarks', type: 'text', placeholder: 'Enter remarks' }
    ],
    calculatedMetrics: [
      { code: 'SINGLE_END_SIZING_DIFF', name: 'Single End Sizing Diff (vs Target)', type: 'number', unit: 'KG', isCalculated: true },
      { code: 'SINGLE_END_SIZING_ACHIEVEMENT_PCT', name: 'Single End Sizing Achievement %', type: 'number', unit: '%', isCalculated: true },
      { code: 'SAMPLE_WPG_DIFF', name: 'Sample WPG Diff (vs Target)', type: 'number', isCalculated: true },
      { code: 'SAMPLE_WPG_ACHIEVEMENT_PCT', name: 'Sample WPG Achievement %', type: 'number', unit: '%', isCalculated: true }
    ],
    calculate: (raw) => {
      const seVal = raw.SINGLE_END_SIZING !== undefined && raw.SINGLE_END_SIZING !== '' ? raw.SINGLE_END_SIZING : raw.SE_SIZING;
      const wpgVal = raw.SAMPLE_WPG;
      const isSe = isEntered(seVal);
      const isWpg = isEntered(wpgVal);
      const se = isSe ? Number(seVal) : null;
      const wpg = isWpg ? Number(wpgVal) : null;
      return {
        SINGLE_END_SIZING_DIFF: se !== null ? Number((se - 80).toFixed(1)) : '',
        SINGLE_END_SIZING_ACHIEVEMENT_PCT: (se !== null && 80 > 0) ? Number(((se / 80) * 100).toFixed(1)) : '',
        SE_SIZING_DIFF: se !== null ? Number((se - 80).toFixed(1)) : '',
        SE_SIZING_ACHIEVEMENT_PCT: (se !== null && 80 > 0) ? Number(((se / 80) * 100).toFixed(1)) : '',
        SAMPLE_WPG_DIFF: wpg !== null ? Number((wpg - 8).toFixed(1)) : '',
        SAMPLE_WPG_ACHIEVEMENT_PCT: (wpg !== null && 8 > 0) ? Number(((wpg / 8) * 100).toFixed(1)) : ''
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
      const hasWIn = isEntered(raw.WEAVING_INHOUSE_MTRS);
      const hasWVen = isEntered(raw.WEAVING_VENDOR_MTRS);
      const totW = (hasWIn || hasWVen) ? Number(((Number(raw.WEAVING_INHOUSE_MTRS) || 0) + (Number(raw.WEAVING_VENDOR_MTRS) || 0)).toFixed(1)) : '';

      const hasYIn = isEntered(raw.YARN_INHOUSE_MTRS);
      const hasYVen = isEntered(raw.YARN_VENDOR_MTRS);
      const totY = (hasYIn || hasYVen) ? Number(((Number(raw.YARN_INHOUSE_MTRS) || 0) + (Number(raw.YARN_VENDOR_MTRS) || 0)).toFixed(1)) : '';

      const hasSIn = isEntered(raw.SIZING_INHOUSE_MTRS);
      const hasSVen = isEntered(raw.SIZING_VENDOR_MTRS);
      const totS = (hasSIn || hasSVen) ? Number(((Number(raw.SIZING_INHOUSE_MTRS) || 0) + (Number(raw.SIZING_VENDOR_MTRS) || 0)).toFixed(1)) : '';

      const hasP = isEntered(raw.PROCESSING_MTRS);
      const p = hasP ? Number(raw.PROCESSING_MTRS) : 0;

      const hasGrand = (typeof totW === 'number') || (typeof totY === 'number') || (typeof totS === 'number') || hasP;
      const grand = hasGrand ? Number(((typeof totW === 'number' ? totW : 0) + (typeof totY === 'number' ? totY : 0) + (typeof totS === 'number' ? totS : 0) + p).toFixed(1)) : '';

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
      { code: 'DYEING_PRINTING_MTRS', name: 'Dyeing & Printing (Mtrs)', type: 'number', target: 40000, unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'GREIGE_FABRIC_STOCK_MTRS', name: 'Greige Fabric Stock (Mtrs)', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'YARN_DYED_FABRIC_STOCK_MTRS', name: 'Yarn Dyed Fabric Stock (Mtrs)', type: 'number', unit: 'Mtrs', placeholder: 'Mtrs' },
      { code: 'NO_OF_DAYS', name: 'NO OF DAYS', type: 'number', unit: 'Days', placeholder: 'Enter actual number of days' }
    ],
    calculatedMetrics: [
      { code: 'DELIVERY_INHOUSE_DIFF', name: 'Delivery Inhouse Diff (vs 35k)', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'DELIVERY_INHOUSE_ACHIEVEMENT_PCT', name: 'Delivery Inhouse Achievement %', type: 'number', unit: '%', isCalculated: true },
      { code: 'DYEING_PRINTING_DIFF', name: 'Dyeing Diff (vs 40k)', type: 'number', unit: 'Mtrs', isCalculated: true },
      { code: 'DYEING_PRINTING_ACHIEVEMENT_PCT', name: 'Dyeing Achievement %', type: 'number', unit: '%', isCalculated: true },
      { code: 'TOTAL_FABRIC_STOCK_MTRS', name: 'Total Fabric Stock (Greige + YD)', type: 'number', unit: 'Mtrs', isCalculated: true }
    ],
    calculate: (raw) => {
      const isDelIn = isEntered(raw.PROCESSING_DELIVERY_INHOUSE);
      const isDye = isEntered(raw.DYEING_PRINTING_MTRS);
      const isGStk = isEntered(raw.GREIGE_FABRIC_STOCK_MTRS);
      const isYdStk = isEntered(raw.YARN_DYED_FABRIC_STOCK_MTRS);

      const delIn = isDelIn ? Number(raw.PROCESSING_DELIVERY_INHOUSE) : null;
      const dye = isDye ? Number(raw.DYEING_PRINTING_MTRS) : null;
      const gStk = isGStk ? Number(raw.GREIGE_FABRIC_STOCK_MTRS) : 0;
      const ydStk = isYdStk ? Number(raw.YARN_DYED_FABRIC_STOCK_MTRS) : 0;

      return {
        DELIVERY_INHOUSE_DIFF: delIn !== null ? Math.round(delIn - 35000) : '',
        DELIVERY_INHOUSE_ACHIEVEMENT_PCT: delIn !== null ? Number(((delIn / 35000) * 100).toFixed(1)) : '',
        DYEING_PRINTING_DIFF: dye !== null ? Math.round(dye - 40000) : '',
        DYEING_PRINTING_ACHIEVEMENT_PCT: dye !== null ? Number(((dye / 40000) * 100).toFixed(1)) : '',
        TOTAL_FABRIC_STOCK_MTRS: (isGStk || isYdStk) ? Math.round(gStk + ydStk) : ''
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
      const isGTot = isEntered(raw.GREIGE_TOTAL_ORDERS);
      const isGComp = isEntered(raw.GREIGE_YARN_COMPLETED);
      const isGOn = isEntered(raw.GREIGE_ONTIME);

      const isDTot = isEntered(raw.DYED_TOTAL_ORDERS);
      const isDComp = isEntered(raw.DYED_YARN_COMPLETED);
      const isDOn = isEntered(raw.DYED_ONTIME);

      const gTot = isGTot ? Number(raw.GREIGE_TOTAL_ORDERS) : null;
      const gComp = isGComp ? Number(raw.GREIGE_YARN_COMPLETED) : null;
      const gOn = isGOn ? Number(raw.GREIGE_ONTIME) : null;

      const dTot = isDTot ? Number(raw.DYED_TOTAL_ORDERS) : null;
      const dComp = isDComp ? Number(raw.DYED_YARN_COMPLETED) : null;
      const dOn = isDOn ? Number(raw.DYED_ONTIME) : null;

      return {
        GREIGE_NOT_COMPLETED: (gTot !== null && gComp !== null) ? Math.max(0, gTot - gComp) : '',
        GREIGE_DELAY: (gComp !== null && gOn !== null) ? Math.max(0, gComp - gOn) : '',
        DYED_NOT_COMPLETED: (dTot !== null && dComp !== null) ? Math.max(0, dTot - dComp) : '',
        DYED_DELAY: (dComp !== null && dOn !== null) ? Math.max(0, dComp - dOn) : ''
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
      const isGrg = isEntered(raw.TOTAL_PRODN_GREIGE);
      const isOut = isEntered(raw.GREIGE_YD_OUTWARD);
      const grg = isGrg ? Number(raw.TOTAL_PRODN_GREIGE) : null;
      const out = isOut ? Number(raw.GREIGE_YD_OUTWARD) : null;
      return {
        PRODN_GREIGE_DIFF: grg !== null ? Math.round(grg - 75000) : '',
        PRODN_GREIGE_ACHIEVEMENT_PCT: grg !== null ? Number(((grg / 75000) * 100).toFixed(1)) : '',
        OUTWARD_DIFF: out !== null ? Math.round(out - 80000) : '',
        OUTWARD_ACHIEVEMENT_PCT: out !== null ? Number(((out / 80000) * 100).toFixed(1)) : ''
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
      const isG = isEntered(raw.GREIGE_FABRIC);
      const isYd = isEntered(raw.YD_FABRIC);
      const g = isG ? Number(raw.GREIGE_FABRIC) : null;
      const yd = isYd ? Number(raw.YD_FABRIC) : null;
      return {
        GREIGE_DIFF: g !== null ? Math.round(g - 15000) : '',
        GREIGE_ACHIEVEMENT_PCT: g !== null ? Number(((g / 15000) * 100).toFixed(1)) : '',
        YD_DIFF: yd !== null ? Math.round(yd - 15000) : '',
        YD_ACHIEVEMENT_PCT: yd !== null ? Number(((yd / 15000) * 100).toFixed(1)) : ''
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
      const isDes = isEntered(raw.DESPATCH_MTRS);
      const isPac = isEntered(raw.PACKING_MTRS);
      const des = isDes ? Number(raw.DESPATCH_MTRS) : null;
      const pac = isPac ? Number(raw.PACKING_MTRS) : null;
      return {
        DESPATCH_DIFF: des !== null ? Math.round(des - 77950) : '',
        DESPATCH_ACHIEVEMENT_PCT: des !== null ? Number(((des / 77950) * 100).toFixed(1)) : '',
        PACKING_DIFF: pac !== null ? Math.round(pac - 77950) : '',
        PACKING_ACHIEVEMENT_PCT: pac !== null ? Number(((pac / 77950) * 100).toFixed(1)) : ''
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
      const isFlx = isEntered(raw.FLAX_LINEN_PRODUCTION);
      const isGps = isEntered(raw.FLAX_GPS);
      const flx = isFlx ? Number(raw.FLAX_LINEN_PRODUCTION) : null;
      const gps = isGps ? Number(raw.FLAX_GPS) : null;
      return {
        FLAX_DIFF: flx !== null ? Math.round(flx - 3500) : '',
        FLAX_ACHIEVEMENT_PCT: flx !== null ? Number(((flx / 3500) * 100).toFixed(1)) : '',
        FLAX_GPS_DIFF: gps !== null ? Math.round(gps - 140) : ''
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
      const isEng = isEntered(raw.ENGAGED_STRENGTH);
      const eng = isEng ? Number(raw.ENGAGED_STRENGTH) : null;
      return {
        HRD_EXCESS_SHORTAGE: eng !== null ? eng - app : ''
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
      const isTr = isEntered(raw.TRANSPORT_TRIPS);
      const tr = isTr ? Number(raw.TRANSPORT_TRIPS) : null;
      return {
        TRANSPORT_DIFF: tr !== null ? Math.round(tr - 45) : '',
        TRANSPORT_ACHIEVEMENT_PCT: tr !== null ? Number(((tr / 45) * 100).toFixed(1)) : ''
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

