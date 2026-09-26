import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { parseConstructionSpecs, getMainEntryLoomRun, isMatchingDesign } from '../utils/calculations';

export interface ActiveRun {
  loomNo: number;
  designNo: string;
  currentBeamNo?: string;
  setNo?: string;
  beamId?: number | null;
  loomStartDate: string;
  warpedMeter: number;
  dailyProduction: number;
  producedMeter?: number;
  grossBalanceMeter?: number;
  crimpLossMeter?: number;
  netBalanceMeter?: number;
  actualProductionHistory?: number[];
  avgDailyProduction?: number;
  effectiveDailyProduction?: number;
  balanceDays?: number;
  expectedRunoutDate?: Date;
  runoutStatus?: string;
  runoutSource?: string;
  confidenceLevel?: string;
  crimpPercent: number;
  rpm?: number | null;
  efficiency?: number | null;
  shiftHours?: number | null;
  workingHours?: number | null;
  machineUtilization?: number | null;
  productionOverride?: number | null;
  overrideReason?: string;
  remarks?: string;
  sortChangeType?: string | null;
  prepStatus?: string | null;
}

export interface NextPlanState {
  loomNo: number;
  designNo: string;
  beamNo?: string;
  setNo?: string;
  beamId?: number | null;
  startDate?: string;
  warpMeter?: number;
  dailyProduction?: number;
}

export interface CompletedRun {
  id: number;
  loomNo: number;
  designNo: string;
  startDate: string;
  endDate: string;
  warpMeter: number;
  totalProductionMeter: number;
  runningDays: number;
  avgDailyProduction: number;
  efficiencyPct: number;
  unit: string;
  sortChangeType?: string | null;
}

interface AppContextType {
  activeRuns: Record<number, ActiveRun>;
  setActiveRuns: React.Dispatch<React.SetStateAction<Record<number, ActiveRun>>>;
  nextPlans: Record<number, NextPlanState>;
  setNextPlans: React.Dispatch<React.SetStateAction<Record<number, NextPlanState>>>;
  rawNextPlans: any[];
  looms: any[];
  setLooms: React.Dispatch<React.SetStateAction<any[]>>;
  designs: any[];
  setDesigns: React.Dispatch<React.SetStateAction<any[]>>;
  reeds: any[];
  reedRequirements: any[];
  orders: any[];
  beams: any[];
  completedHistory: CompletedRun[];
  productionLogs: any[];
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeRuns, setActiveRuns] = useState<Record<number, ActiveRun>>({});
  const [nextPlans, setNextPlans] = useState<Record<number, NextPlanState>>({});
  const [rawNextPlans, setRawNextPlans] = useState<any[]>([]);
  const [looms, setLooms] = useState<any[]>([]);
  const [designs, setDesigns] = useState<any[]>([]);
  const [reeds, setReeds] = useState<any[]>([]);
  const [reedRequirements, setReedRequirements] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [beams, setBeams] = useState<any[]>([]);
  const [completedHistory, setCompletedHistory] = useState<CompletedRun[]>([]);
  const [productionLogs, setProductionLogs] = useState<any[]>([]);

  const refreshData = async () => {
    try {
      const safeFetch = async (url: string) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          return await res.json();
        } catch {
          return null;
        }
      };

      const [loomsData, designsData, activeRunsData, nextPlansData, historyData, reedsData, reqsData, ordersData, beamsData, logsData] = await Promise.all([
        safeFetch(`${API_BASE_URL}/api/looms`),
        safeFetch(`${API_BASE_URL}/api/designs`),
        safeFetch(`${API_BASE_URL}/api/active-runs`),
        safeFetch(`${API_BASE_URL}/api/planning/next-plans`),
        safeFetch(`${API_BASE_URL}/api/completed-runs`),
        safeFetch(`${API_BASE_URL}/api/reed-stock`),
        safeFetch(`${API_BASE_URL}/api/reed-requirements`),
        safeFetch(`${API_BASE_URL}/api/orders`),
        safeFetch(`${API_BASE_URL}/api/beam-stock`),
        safeFetch(`${API_BASE_URL}/api/production-logs`)
      ]);

      if (Array.isArray(reedsData)) setReeds(reedsData);
      if (Array.isArray(reqsData)) setReedRequirements(reqsData);
      if (Array.isArray(ordersData)) setOrders(ordersData);
      if (Array.isArray(beamsData)) setBeams(beamsData);
      if (Array.isArray(logsData)) setProductionLogs(logsData);

      // Load designs
      let loadedDesigns: any[] = [];
      if (Array.isArray(designsData)) {
        loadedDesigns = designsData.map((d: any) => {
          const parsed = parseConstructionSpecs(d.construction);
          const resolvedPick = d.pick && String(d.pick).trim() !== '' ? String(d.pick) : (d.ppi ? String(d.ppi) : (parsed.pick || ''));
          const resolvedWidth = d.greige_width && String(d.greige_width).trim() !== '' ? String(d.greige_width) : (d.width ? String(d.width) : (parsed.greigeWidth || ''));
          const resolvedReedSpace = d.reed_space_warp_width && String(d.reed_space_warp_width).trim() !== '' ? String(d.reed_space_warp_width) : (parsed.reedSpace || (resolvedWidth ? String(parseFloat(resolvedWidth) + 1.5) : ''));

          return {
            designNo: d.design_no_sp_no,
            design_no_sp_no: d.design_no_sp_no,
            construction: d.construction || '',
            weftColours: d.weft_colours,
            weft_colours: d.weft_colours,
            frames: d.frames,
            reedCount: String(d.reed_count || ''),
            reed_count: String(d.reed_count || ''),
            pick: resolvedPick,
            greigeWidth: resolvedWidth,
            greige_width: resolvedWidth,
            totalEnds: Number(d.total_ends) || 0,
            total_ends: Number(d.total_ends) || 0,
            reedSpace: resolvedReedSpace,
            reed_space_warp_width: resolvedReedSpace,
            beamType: d.beam_type || '',
            beam_type: d.beam_type || '',
            beamDia: Number(d.beam_dia) || 0,
            beam_dia: Number(d.beam_dia) || 0,
            crimpPercent: Number(d.crimp_percent) || 0,
            crimp_percent: Number(d.crimp_percent) || 0,
            weaveType: d.weave_type || '',
            weave_type: d.weave_type || '',
            status: d.status || 'ACTIVE',
            remarks: d.remarks || ''
          };
        });
        setDesigns(loadedDesigns);
      } else {
        setDesigns([]);
      }


      // Process Looms from DB
      let loadedLooms: any[] = [];
      if (Array.isArray(loomsData)) {
        loadedLooms = loomsData.map(l => ({
          ...l,
          loomNo: l.loom_no,
          loom_no: l.loom_no,
          unit: l.unit,
          make: l.make,
          model: l.model,
          speed: Number(l.speed) || l.rpm || 0,
          shedding: l.shedding,
          width: l.width,
          weave: l.weave,
          frameCapacity: l.frame_capacity,
          loomType: l.loom_type,
          weftColours: l.weft_colours,
          beamType: l.beam_type,
          beamDia: l.beam_dia,
          installedLever: l.installed_lever
        }));
      }
      setLooms(loadedLooms);

      // Index daily production logs by loom for rapid lookup
      const logsByLoomMap = new Map<number, any[]>();
      if (Array.isArray(logsData)) {
        logsData.forEach(l => {
          const lNo = Number(l.loom_no);
          if (!logsByLoomMap.has(lNo)) logsByLoomMap.set(lNo, []);
          logsByLoomMap.get(lNo)!.push(l);
        });
      }

      // Merge Active Runs with cumulative production & logs history
      const activeRunObj: Record<number, ActiveRun> = {};
      if (Array.isArray(activeRunsData)) {
        activeRunsData.forEach(run => {
          const matchedDesign = loadedDesigns.find(d => 
            d.designNo === run.design_no_sp_no || 
            d.design_no_sp_no === run.design_no_sp_no ||
            (d.designNo && run.design_no_sp_no && d.designNo.trim().toLowerCase() === run.design_no_sp_no.trim().toLowerCase())
          );
          const rawCrimp = matchedDesign ? Number(matchedDesign.crimpPercent || matchedDesign.crimp_percent || 0) : 0;
          const crimp = rawCrimp > 0 ? (rawCrimp > 1 ? rawCrimp / 100 : rawCrimp) : 0.05;
          let startDate = new Date().toISOString().split('T')[0];
          try {
            if (run.loom_start_date) startDate = new Date(run.loom_start_date).toISOString().split('T')[0];
          } catch (e) {}

          const currentDesignClean = (run.design_no_sp_no || '').trim().toLowerCase();
          const loomLogsList = logsByLoomMap.get(Number(run.loom_no)) || [];

          const loomStartDate = startDate;

          // Calculate cumulative produced meters and actual daily production history
          // IMPORTANT: Only include logs up to today (same as LoomRow's selectedProductionDate cutoff)
          const todayStr = new Date().toISOString().split('T')[0];
          const relevantLogs: number[] = [];
          let cumulativeProduced = 0;
          let latestLogRpm: number | null = null;
          let latestLogEff: number | null = null;

          for (let li = 0; li < loomLogsList.length; li++) {
            const l = loomLogsList[li];
            const lDesign = (l.design_no || '').trim().toLowerCase();
            if (currentDesignClean && lDesign && !isMatchingDesign(lDesign, currentDesignClean)) continue;

            let lDateStr = '';
            try {
              if (l.date) lDateStr = new Date(l.date).toISOString().split('T')[0];
              else if (l.createdAt) lDateStr = new Date(l.createdAt).toISOString().split('T')[0];
            } catch (e) {}

            // Skip logs before actual loom start date
            if (loomStartDate && lDateStr && lDateStr < loomStartDate) continue;
            // Skip logs dated AFTER today (matches LoomRow selectedProductionDate cutoff)
            if (lDateStr && lDateStr > todayStr) continue;

            const pMtr = Number(l.produced_meter) || 0;
            relevantLogs.push(pMtr);
            cumulativeProduced += pMtr;

            if (l.rpm !== undefined && l.rpm !== null && Number(l.rpm) > 0) {
              latestLogRpm = Number(l.rpm);
            }
            if (l.efficiency !== undefined && l.efficiency !== null && Number(l.efficiency) > 0) {
              latestLogEff = Number(l.efficiency);
            }
          }

          // Always use the cumulative sum from actual daily production logs.
          // daily_production in LoomRunEntry stores the LAST SINGLE-DAY value entered by the user,
          // not a running total. Falling back to it would show a wrong (too-low) produced meter.
          // If no logs have been saved yet, producedMeter is correctly 0.
          const finalProducedMeter = cumulativeProduced;

          const matchedOrder = Array.isArray(ordersData) ? ordersData.find(o => 
            (o.design_no_sp_no && run.design_no_sp_no && isMatchingDesign(o.design_no_sp_no, currentDesignClean))
          ) : null;
          const matchedBeam = Array.isArray(beamsData) ? beamsData.find(b => 
            (b.beamNo && run.current_beam_no && b.beamNo.toString().toLowerCase() === run.current_beam_no.trim().toLowerCase()) ||
            (b.beam_no && run.current_beam_no && b.beam_no.toString().toLowerCase() === run.current_beam_no.trim().toLowerCase())
          ) : null;
          // Check if a production log specifically exists for today with RPM / Efficiency (matching MainEntry behavior)
          const todayLog = loomLogsList.find(l => {
            let lDateStr = '';
            try {
              if (l.date) lDateStr = new Date(l.date).toISOString().split('T')[0];
              else if (l.createdAt) lDateStr = new Date(l.createdAt).toISOString().split('T')[0];
            } catch (e) {}
            return lDateStr === todayStr && (!currentDesignClean || !l.design_no || isMatchingDesign(l.design_no, currentDesignClean));
          });
          const todayRpm = (todayLog && todayLog.rpm !== undefined && todayLog.rpm !== null && Number(todayLog.rpm) > 0) ? Number(todayLog.rpm) : null;
          const todayEff = (todayLog && todayLog.efficiency !== undefined && todayLog.efficiency !== null && Number(todayLog.efficiency) > 0) ? Number(todayLog.efficiency) : null;

          const activeRunPayload = {
            loomNo: run.loom_no,
            designNo: run.design_no_sp_no,
            currentBeamNo: run.current_beam_no || '',
            setNo: run.set_no || '',
            beamId: run.beam_id || null,
            loomStartDate: loomStartDate,
            warpedMeter: Number(run.warped_meter) || 0,
            dailyProduction: finalProducedMeter,
            rpm: todayRpm,
            efficiency: todayEff,
            crimpPercent: crimp,
            remarks: run.remarks || '',
            sortChangeType: run.sort_change_type || run.sortChangeType || null,
            prepStatus: run.prep_status || run.prepStatus || null
          };

          const calc = getMainEntryLoomRun({
            loomNo: run.loom_no,
            activeRun: activeRunPayload,
            design: matchedDesign,
            order: matchedOrder,
            beam: matchedBeam,
            productionLogs: logsData,
            currentDate: new Date()  // always today — matches LoomRow default
          });

          activeRunObj[run.loom_no] = {
            ...activeRunPayload,
            dailyProduction: calc.producedMeter,
            producedMeter: calc.producedMeter,
            grossBalanceMeter: calc.warpBalanceGross,
            crimpLossMeter: calc.crimpLossMeter,
            netBalanceMeter: calc.netBalanceMeter,
            avgDailyProduction: calc.avgProduction,
            effectiveDailyProduction: calc.effectiveDailyProduction,
            balanceDays: calc.balanceDays,
            expectedRunoutDate: calc.expectedRunoutDate,
            runoutStatus: calc.runoutStatus,
            runoutSource: calc.runoutSource,
            confidenceLevel: calc.confidenceLevel,
            actualProductionHistory: relevantLogs,
            runningDays: calc.runningDays,
            actualCrimpPercent: calc.actualCrimpPercent,
            effectiveCrimpPercent: calc.effectiveCrimpPercent,
            standardCrimpPercent: calc.standardCrimpPercent
          } as any;
        });
      }
      setActiveRuns(activeRunObj);

      // Merge Next Plans
      const nextPlansObj: Record<number, NextPlanState> = {};
      if (Array.isArray(nextPlansData)) {
        setRawNextPlans(nextPlansData);
        nextPlansData.forEach(plan => {
          nextPlansObj[plan.loom_no] = {
            loomNo: plan.loom_no,
            designNo: plan.next_design,
            beamNo: plan.reserved_beam_no || '',
            setNo: plan.reserved_set_no || '',
            beamId: plan.reserved_beam_id || null,
            startDate: plan.planned_start_date,
            warpMeter: Number(plan.planned_warp_meter) || 0,
            dailyProduction: Number(plan.planned_avg_daily_production) || 0
          };
        });
      }
      setNextPlans(nextPlansObj);

      if (Array.isArray(historyData)) {
        setCompletedHistory(historyData.map(h => ({
          id: h.id,
          loomNo: h.loom_no,
          designNo: h.design_no_sp_no,
          startDate: h.start_date,
          endDate: h.end_date,
          warpMeter: h.warp_meter,
          totalProductionMeter: h.total_production_meter,
          runningDays: h.running_days,
          avgDailyProduction: h.avg_daily_production,
          efficiencyPct: h.efficiency_pct,
          unit: h.unit,
          sortChangeType: h.sort_change_type || (h as any).sortChangeType || null
        })));
      }

    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refreshData();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const contextValue = React.useMemo(() => ({
    activeRuns, 
    setActiveRuns, 
    nextPlans, 
    setNextPlans, 
    rawNextPlans,
    looms, 
    setLooms, 
    designs, 
    setDesigns,
    reeds,
    reedRequirements,
    orders,
    beams,
    completedHistory,
    productionLogs,
    refreshData
  }), [
    activeRuns,
    nextPlans,
    rawNextPlans,
    looms,
    designs,
    reeds,
    reedRequirements,
    orders,
    beams,
    completedHistory,
    productionLogs
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}

