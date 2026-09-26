const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Normalizes SP No. for consistent comparison.
 * e.g. "SP26/148-22345" -> extracts "SP26/148"
 * Handles SP026 -> SP26
 */
function normalizeSpNo(designStr) {
  if (!designStr) return '';
  let clean = String(designStr).trim().toUpperCase();
  clean = clean.replace(/SP026/g, 'SP26');
  
  // If format is like SP26/148-22345, check if there's a hyphen separator
  const match = clean.match(/^(SP\d+\/\d+)/);
  if (match) {
    return match[1];
  }
  // If no standard prefix match, return trimmed string
  return clean.split('-')[0].trim();
}

/**
 * Normalizes color strings for comparison.
 */
function normalizeColor(colorStr) {
  if (!colorStr) return '';
  return String(colorStr).trim().toLowerCase();
}

/**
 * Evaluates Knotting Eligibility according to confirmed factory rules:
 * 1. Current running SP No. and next planned SP No. are the same.
 * 2. Current warp colours and next planned warp colours match.
 * 3. The number of warp colours matches.
 * 4. Ends Difference = ABS(Next Planned Total Ends - Current Running Total Ends) <= 1.
 */
function evaluateKnottingEligibility({
  currentDesign,
  nextDesign,
  currentWarpColours,
  nextWarpColours,
  currentWarpColourCount,
  nextWarpColourCount,
  currentEnds,
  nextEnds
}) {
  const normCurrentSp = normalizeSpNo(currentDesign);
  const normNextSp = normalizeSpNo(nextDesign);

  // Condition 1: Same SP No.
  const sameSp = Boolean(normCurrentSp && normNextSp && (normCurrentSp === normNextSp || currentDesign.trim().toUpperCase() === nextDesign.trim().toUpperCase()));

  // Condition 2: Same Warp Colours
  const cWarpClr = normalizeColor(currentWarpColours);
  const nWarpClr = normalizeColor(nextWarpColours);
  // If neither specified, both are considered standard match; if specified, they must match
  const sameWarpColours = Boolean((!cWarpClr && !nWarpClr) || (cWarpClr === nWarpClr));

  // Condition 3: Same Number of Warp Colours
  const cClrCount = Number(currentWarpColourCount) || 1;
  const nClrCount = Number(nextWarpColourCount) || 1;
  const sameColourCount = Boolean(cClrCount === nClrCount);

  // Condition 4: Ends Difference <= 1
  const cEndsNum = (currentEnds !== null && currentEnds !== undefined && !isNaN(Number(currentEnds))) ? Number(currentEnds) : null;
  const nEndsNum = (nextEnds !== null && nextEnds !== undefined && !isNaN(Number(nextEnds))) ? Number(nextEnds) : null;

  let endsDifference = null;
  let endsDiffOk = false;

  if (cEndsNum !== null && nEndsNum !== null) {
    endsDifference = Math.abs(nEndsNum - cEndsNum);
    endsDiffOk = endsDifference <= 1;
  }

  const reasons = [];

  if (!sameSp) {
    reasons.push(`Different SP No. (Current: "${normCurrentSp || currentDesign || 'None'}", Next: "${normNextSp || nextDesign || 'None'}")`);
  }

  if (!sameWarpColours) {
    reasons.push(`Different warp colour (Current: "${currentWarpColours || 'Standard'}", Next: "${nextWarpColours || 'Standard'}")`);
  }

  if (!sameColourCount) {
    reasons.push(`Different number of warp colours (Current: ${cClrCount}, Next: ${nClrCount})`);
  }

  if (cEndsNum === null || nEndsNum === null) {
    reasons.push('Required source data unavailable (Total ends not found for current or planned design)');
  } else if (!endsDiffOk) {
    reasons.push(`Ends difference greater than 1 (Current: ${cEndsNum}, Next: ${nEndsNum}, Difference: ${endsDifference})`);
  }

  const isEligible = Boolean(sameSp && sameWarpColours && sameColourCount && endsDiffOk);

  return {
    isEligible,
    suggestedProcess: isEligible ? 'KNOTTING' : 'KNOTTING_SORT_CHANGE',
    suggestedProcessLabel: isEligible ? 'KNOTTING SUGGESTED' : 'KNOTTING SORT CHANGE / GAITING REQUIRED',
    sameSp,
    sameWarpColours,
    sameColourCount,
    endsDifference,
    endsDiffOk,
    reasons,
    summaryDisplay: {
      currentSp: normCurrentSp || currentDesign,
      nextSp: normNextSp || nextDesign,
      currentEnds: cEndsNum,
      nextEnds: nEndsNum,
      endsDifference,
      currentWarpColours: currentWarpColours || 'Standard',
      nextWarpColours: nextWarpColours || 'Standard',
      currentWarpColourCount: cClrCount,
      nextWarpColourCount: nClrCount,
      isEligible,
      reasons
    }
  };
}

/**
 * Fetches all necessary database entities to construct complete preparation details for a plan.
 */
async function getPreparationDetailsByPlanId(planId) {
  const plan = await prisma.plannedAssignment.findUnique({
    where: { id: Number(planId) },
    include: {
      LoomMaster: true
    }
  });

  if (!plan) return null;

  return getPreparationDetailsForPlan(plan);
}

/**
 * Fetches preparation details for a loom given its active or pending plan.
 */
async function getPreparationDetailsByLoomNo(loomNo) {
  const loomNum = Number(loomNo);
  const plan = await prisma.plannedAssignment.findFirst({
    where: {
      loom_no: loomNum,
      status: { in: ['PLANNED', 'BEAM ALLOCATED', 'CONFIRMED', 'PENDING', 'RUNNING'] }
    },
    orderBy: { id: 'desc' },
    include: {
      LoomMaster: true
    }
  });

  if (!plan) return null;

  return getPreparationDetailsForPlan(plan);
}

/**
 * Core helper that reads all authoritative source data for a plan and resolves running vs next design.
 */
async function getPreparationDetailsForPlan(plan) {
  const loomNum = plan.loom_no;
  const loom = plan.LoomMaster || await prisma.loomMaster.findUnique({ where: { loom_no: loomNum } });

  // 1. Current running loom details from LoomRunEntry
  const currentRun = await prisma.loomRunEntry.findUnique({
    where: { loom_no: loomNum }
  });

  const currentDesignNo = (currentRun?.design_no_sp_no || plan.current_design || '').trim();
  const nextDesignNo = (plan.next_design || '').trim();

  // 2. Fetch DesignMaster for both
  const [currentDesignMaster, nextDesignMaster] = await Promise.all([
    currentDesignNo ? prisma.designMaster.findUnique({ where: { design_no_sp_no: currentDesignNo } }) : null,
    nextDesignNo ? prisma.designMaster.findUnique({ where: { design_no_sp_no: nextDesignNo } }) : null
  ]);

  // 3. Fetch OrderMaster for both (if applicable)
  const currentOrder = currentRun?.order_no ? await prisma.orderMaster.findFirst({
    where: { OR: [{ order_no: currentRun.order_no }, { ibpo_no: currentRun.order_no }] }
  }) : null;

  const nextOrder = plan.order_no ? await prisma.orderMaster.findFirst({
    where: { OR: [{ order_no: plan.order_no }, { ibpo_no: plan.order_no }] }
  }) : null;

  // 4. Fetch Beam info if allocated
  let beamRecord = null;
  if (plan.reserved_beam_id) {
    beamRecord = await prisma.beamStockMaster.findUnique({ where: { id: plan.reserved_beam_id } });
  } else if (plan.reserved_beam_no) {
    beamRecord = await prisma.beamStockMaster.findFirst({ where: { beam_no: plan.reserved_beam_no } });
  }

  // Current values
  const currentEnds = currentDesignMaster?.total_ends ?? currentOrder?.total_ends ?? null;
  const currentWarpColours = currentOrder?.combo_pattern || currentDesignMaster?.weft_colour_details || 'Standard';
  const currentWarpColourCount = currentDesignMaster?.no_of_clr_warp ?? currentOrder?.no_of_clr_warp ?? 1;

  // Next planned values
  const nextEnds = nextDesignMaster?.total_ends ?? nextOrder?.total_ends ?? beamRecord?.ends ?? null;
  const nextWarpColours = nextOrder?.combo_pattern || nextDesignMaster?.weft_colour_details || 'Standard';
  const nextWarpColourCount = nextDesignMaster?.no_of_clr_warp ?? nextOrder?.no_of_clr_warp ?? 1;

  const setNo = plan.reserved_set_no || beamRecord?.set_no || currentRun?.set_no || '';
  const beamNo = plan.reserved_beam_no || beamRecord?.beam_no || '';
  const warpLoadingDate = plan.planned_start_date || (currentRun?.loom_start_date ? currentRun.loom_start_date : new Date());

  // 5. Evaluate Knotting Eligibility
  const evaluation = evaluateKnottingEligibility({
    currentDesign: currentDesignNo,
    nextDesign: nextDesignNo,
    currentWarpColours,
    nextWarpColours,
    currentWarpColourCount,
    nextWarpColourCount,
    currentEnds,
    nextEnds
  });

  // 6. Check if a preparation record already exists for this plan
  const existingProcess = await prisma.warpPreparationProcess.findFirst({
    where: {
      plan_id: plan.id
    },
    orderBy: { id: 'desc' }
  });

  return {
    planId: plan.id,
    loomNo: loomNum,
    unit: loom?.unit || 'UNIT 1',
    currentDesign: currentDesignNo,
    nextDesign: nextDesignNo,
    orderNo: plan.order_no || nextOrder?.order_no || '',
    currentEnds,
    nextEnds,
    endsDifference: evaluation.endsDifference,
    currentWarpColours,
    nextWarpColours,
    currentWarpColourCount,
    nextWarpColourCount,
    setNo,
    beamNo,
    warpLoadingDate,
    evaluation,
    existingProcess
  };
}

/**
 * Confirms or creates a WarpPreparationProcess record in the database.
 */
async function confirmPreparationProcess({
  planId,
  loomNo,
  processType,
  startDate,
  loomStartDate,
  responsiblePerson,
  remarks,
  user
}) {
  const validProcesses = ['KNOTTING', 'KNOTTING_SORT_CHANGE', 'GAITING'];
  const pType = String(processType || '').trim().toUpperCase();

  if (!validProcesses.includes(pType)) {
    throw new Error(`Invalid process type "${processType}". Must be KNOTTING, KNOTTING_SORT_CHANGE, or GAITING.`);
  }

  // Get authoritative plan details
  let plan = null;
  if (planId) {
    plan = await prisma.plannedAssignment.findUnique({ where: { id: Number(planId) } });
  } else if (loomNo) {
    plan = await prisma.plannedAssignment.findFirst({
      where: {
        loom_no: Number(loomNo),
        status: { in: ['PLANNED', 'BEAM ALLOCATED', 'CONFIRMED', 'PENDING'] }
      },
      orderBy: { id: 'desc' }
    });
  }

  if (!plan) {
    throw new Error(`No active or pending loom plan found for Loom ${loomNo || 'N/A'}. Process must start from Loom Plan Setup.`);
  }

  const details = await getPreparationDetailsForPlan(plan);
  const { evaluation } = details;

  // Validation: If Gaiting or Knotting Sort Change is selected, it's manually chosen by planner
  const confirmedProcess = pType;
  const suggestedProcess = evaluation.suggestedProcess;
  const eligibilityStatus = evaluation.isEligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE';
  const eligibilityReasons = evaluation.reasons.join('; ');
  const chosenStartDate = startDate || loomStartDate || null;

  // Prevent duplicate open process records for the exact same plan
  const existing = await prisma.warpPreparationProcess.findFirst({
    where: {
      plan_id: plan.id
    }
  });

  const payload = {
    plan_id: plan.id,
    loom_no: plan.loom_no,
    process_type: confirmedProcess,
    suggested_process: suggestedProcess,
    confirmed_process: confirmedProcess,
    eligibility_status: eligibilityStatus,
    eligibility_reasons: eligibilityReasons,
    current_design: details.currentDesign,
    next_design: details.nextDesign,
    order_no: details.orderNo,
    current_ends: details.currentEnds,
    next_ends: details.nextEnds,
    ends_difference: details.endsDifference,
    current_warp_colours: details.currentWarpColours,
    next_warp_colours: details.nextWarpColours,
    current_warp_colour_count: details.currentWarpColourCount,
    next_warp_colour_count: details.nextWarpColourCount,
    set_no: details.setNo,
    beam_no: details.beamNo,
    warp_loading_date: chosenStartDate ? new Date(chosenStartDate) : (details.warpLoadingDate ? new Date(details.warpLoadingDate) : null),
    status: 'PENDING',
    responsible_person: responsiblePerson || null,
    remarks: remarks || null,
    created_by: user || 'Planner',
    confirmed_by: user || 'Planner',
    confirmed_date: new Date()
  };

  let record;
  if (existing) {
    record = await prisma.warpPreparationProcess.update({
      where: { id: existing.id },
      data: payload
    });
  } else {
    record = await prisma.warpPreparationProcess.create({
      data: payload
    });
  }

  // Update PlannedAssignment planned_start_date if startDate provided
  if (chosenStartDate) {
    try {
      await prisma.plannedAssignment.update({
        where: { id: plan.id },
        data: {
          planned_start_date: new Date(chosenStartDate)
        }
      });
    } catch (planDateErr) {
      console.warn('PlannedAssignment start date update warning:', planDateErr.message);
    }
  }

  // Also synchronize directly into active LoomRunEntry for persistent display across all pages
  try {
    const runData = {
      sort_change_type: confirmedProcess,
      prep_status: 'PENDING'
    };
    if (chosenStartDate) {
      runData.loom_start_date = new Date(chosenStartDate);
    }
    await prisma.loomRunEntry.updateMany({
      where: { loom_no: plan.loom_no },
      data: runData
    });
  } catch (syncErr) {
    console.warn('LoomRunEntry sync warning:', syncErr.message);
  }

  return {
    success: true,
    record,
    details,
    message: `Preparation process "${confirmedProcess}" successfully confirmed and saved for Loom ${plan.loom_no} (Plan #${plan.id}).`
  };
}

/**
 * Updates process status (PENDING -> IN_PROGRESS -> COMPLETED)
 */
async function updateProcessStatus({
  id,
  status,
  processStartDate,
  processStartTime,
  processCompletionDate,
  processCompletionTime,
  responsiblePerson,
  remarks,
  user
}) {
  const procId = Number(id);
  const existing = await prisma.warpPreparationProcess.findUnique({
    where: { id: procId }
  });

  if (!existing) {
    throw new Error(`Warp preparation record with ID ${id} not found.`);
  }

  const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];
  const newStatus = String(status || '').trim().toUpperCase();

  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid status "${status}". Must be PENDING, IN_PROGRESS, or COMPLETED.`);
  }

  const updateData = {
    status: newStatus
  };

  if (processStartDate !== undefined) {
    updateData.process_start_date = processStartDate ? new Date(processStartDate) : null;
  }
  if (processStartTime !== undefined) {
    updateData.process_start_time = processStartTime ? String(processStartTime).trim() : null;
  }
  if (processCompletionDate !== undefined) {
    updateData.process_completion_date = processCompletionDate ? new Date(processCompletionDate) : null;
  }
  if (processCompletionTime !== undefined) {
    updateData.process_completion_time = processCompletionTime ? String(processCompletionTime).trim() : null;
  }
  if (responsiblePerson !== undefined) {
    updateData.responsible_person = responsiblePerson ? String(responsiblePerson).trim() : null;
  }
  if (remarks !== undefined) {
    updateData.remarks = remarks ? String(remarks).trim() : null;
  }

  const updated = await prisma.warpPreparationProcess.update({
    where: { id: procId },
    data: updateData
  });

  // Sync with active LoomRunEntry
  try {
    if (updated && updated.loom_no) {
      const runData = {};
      if (newStatus) runData.prep_status = newStatus;
      if (updated.confirmed_process) runData.sort_change_type = updated.confirmed_process;
      await prisma.loomRunEntry.updateMany({
        where: { loom_no: updated.loom_no },
        data: runData
      });
    }
  } catch (syncErr) {
    console.warn('LoomRunEntry status sync warning:', syncErr.message);
  }

  return {
    success: true,
    record: updated,
    message: `Preparation record #${procId} for Loom ${updated.loom_no} updated to ${newStatus}.`
  };
}

/**
 * Retrieves all active preparation records for all looms.
 */
async function getAllActivePreparationRecords() {
  const records = await prisma.warpPreparationProcess.findMany({
    orderBy: { id: 'desc' },
    include: {
      LoomMaster: true,
      PlannedAssignment: true
    }
  });

  // Group by loom_no to get the latest active record for each loom
  const latestByLoom = {};
  for (const r of records) {
    if (!latestByLoom[r.loom_no]) {
      latestByLoom[r.loom_no] = r;
    }
  }

  return {
    allRecords: records,
    latestByLoom
  };
}

/**
 * Retrieves permanent history for a specific loom.
 */
async function getPreparationHistory(loomNo) {
  const loomNum = Number(loomNo);
  const history = await prisma.warpPreparationProcess.findMany({
    where: { loom_no: loomNum },
    orderBy: { createdAt: 'desc' },
    include: {
      PlannedAssignment: true
    }
  });

  return history;
}

/**
 * Checks if a pending or in-progress warp preparation blocks warp loading for a loom.
 */
async function checkWarpLoadingPrerequisite(loomNo, planId) {
  const loomNum = Number(loomNo);

  const whereClause = {
    loom_no: loomNum,
    status: { in: ['PENDING', 'IN_PROGRESS'] }
  };

  if (planId) {
    whereClause.plan_id = Number(planId);
  }

  const pendingProcess = await prisma.warpPreparationProcess.findFirst({
    where: whereClause,
    orderBy: { id: 'desc' }
  });

  if (pendingProcess) {
    return {
      allowed: false,
      process: pendingProcess,
      message: `Preparation Prerequisite Incomplete: Process "${pendingProcess.confirmed_process || pendingProcess.process_type}" for Loom ${loomNum} is currently ${pendingProcess.status}. Please complete Warp Preparation & Knotting before proceeding with Warp Loading.`
    };
  }

  return {
    allowed: true,
    message: 'Warp preparation prerequisite satisfied.'
  };
}

module.exports = {
  normalizeSpNo,
  normalizeColor,
  evaluateKnottingEligibility,
  getPreparationDetailsByPlanId,
  getPreparationDetailsByLoomNo,
  getPreparationDetailsForPlan,
  confirmPreparationProcess,
  updateProcessStatus,
  getAllActivePreparationRecords,
  getPreparationHistory,
  checkWarpLoadingPrerequisite
};
