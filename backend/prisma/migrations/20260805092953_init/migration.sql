-- CreateTable
CREATE TABLE "AllocationAuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user" TEXT NOT NULL DEFAULT 'System',
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "old_plan" TEXT,
    "new_plan" TEXT NOT NULL,
    "reason" TEXT,
    "action" TEXT NOT NULL,
    "loom_no" INTEGER NOT NULL,
    "design_no" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "BeamPreparationRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loom_no" INTEGER NOT NULL,
    "design_no" TEXT NOT NULL,
    "target_date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING FOR WARPING',
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "warping_vendor" TEXT,
    "warping_dc_no" TEXT,
    "warping_batch" TEXT,
    "sizing_vendor" TEXT,
    "sizing_dc_no" TEXT,
    "sizing_machine" TEXT,
    "vendor_name" TEXT,
    "vendor_beam" TEXT,
    "set_no" TEXT,
    "beam_no" TEXT,
    "required_meter" REAL,
    "actual_meter" REAL,
    "warping_remarks" TEXT,
    "sizing_remarks" TEXT,
    "warping_start_date" DATETIME,
    "warping_completion_date" DATETIME,
    "sizing_start_date" DATETIME,
    "sizing_completion_date" DATETIME,
    "beam_ready_date" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BeamStockMaster" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "design_no" TEXT NOT NULL,
    "ibpo" TEXT,
    "count" TEXT,
    "ends" INTEGER,
    "beam_dia" INTEGER,
    "beam_no" TEXT NOT NULL,
    "beam_length" REAL,
    "available_meter" REAL NOT NULL,
    "party" TEXT,
    "set_no" TEXT,
    "order_type" TEXT,
    "warp_dc_no" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Available',
    "loom_no_assigned" INTEGER,
    "beam_type" TEXT,
    "beam_width" REAL,
    "construction" TEXT,
    "location" TEXT,
    "ready_status" TEXT,
    "reed_count" TEXT,
    "remarks" TEXT,
    "reserved_for" TEXT,
    "reserved_status" TEXT,
    "total_warped_meter" REAL,
    "unit" TEXT,
    "warping_batch_no" TEXT
);

-- CreateTable
CREATE TABLE "CompletedWarpHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loom_no" INTEGER NOT NULL,
    "design_no_sp_no" TEXT NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME NOT NULL,
    "warp_meter" REAL NOT NULL,
    "total_production_meter" REAL NOT NULL,
    "running_days" INTEGER NOT NULL,
    "avg_daily_production" REAL NOT NULL,
    "efficiency_pct" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    CONSTRAINT "CompletedWarpHistory_loom_no_fkey" FOREIGN KEY ("loom_no") REFERENCES "LoomMaster" ("loom_no") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Department" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT
);

-- CreateTable
CREATE TABLE "DesignMaster" (
    "design_no_sp_no" TEXT NOT NULL PRIMARY KEY,
    "construction" TEXT,
    "weft_colours" INTEGER NOT NULL,
    "weft_colour_details" TEXT,
    "frames" INTEGER NOT NULL,
    "reed_count" TEXT,
    "pick" TEXT,
    "greige_width" TEXT,
    "total_ends" INTEGER,
    "reed_space_warp_width" TEXT NOT NULL,
    "weave_type" TEXT NOT NULL,
    "beam_type" TEXT NOT NULL,
    "crimp_percent" REAL NOT NULL,
    "beam_dia" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "remarks" TEXT
);

-- CreateTable
CREATE TABLE "LoginHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "loginTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logoutTime" DATETIME,
    "ipAddress" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "status" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "LoomMaster" (
    "loom_no" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loom_type" TEXT,
    "shed" INTEGER,
    "shed_name" TEXT,
    "area" INTEGER,
    "installed_date" TEXT,
    "rpm" INTEGER,
    "act_rpm" INTEGER,
    "make" TEXT,
    "model" TEXT,
    "motor_kw_hp" TEXT,
    "drive" TEXT,
    "control_panel" TEXT,
    "weft_colours" INTEGER,
    "beam_type" TEXT,
    "beam_dia" INTEGER,
    "installed_lever" INTEGER,
    "width" TEXT,
    "unit" TEXT,
    "weave" TEXT,
    "frame_capacity" INTEGER,
    "max_weft_colours" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Available',
    "remarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL DEFAULT 'System',
    "modifiedBy" TEXT
);

-- CreateTable
CREATE TABLE "LoomRunEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loom_no" INTEGER NOT NULL,
    "design_no_sp_no" TEXT,
    "loom_start_date" DATETIME NOT NULL,
    "warped_meter" REAL NOT NULL,
    "daily_production" REAL NOT NULL,
    "next_plan_design" TEXT,
    "remarks" TEXT,
    CONSTRAINT "LoomRunEntry_loom_no_fkey" FOREIGN KEY ("loom_no") REFERENCES "LoomMaster" ("loom_no") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlannedAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loom_no" INTEGER NOT NULL,
    "current_design" TEXT NOT NULL,
    "next_design" TEXT NOT NULL,
    "planned_start_date" DATETIME NOT NULL,
    "planned_warp_meter" REAL NOT NULL,
    "planned_avg_daily_production" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT PLANNED',
    "reserved_beam_id" INTEGER,
    "confirmation_status" TEXT,
    CONSTRAINT "PlannedAssignment_loom_no_fkey" FOREIGN KEY ("loom_no") REFERENCES "LoomMaster" ("loom_no") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecommendationHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recommended_loom" INTEGER NOT NULL,
    "selected_loom" INTEGER NOT NULL,
    "selected_design" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "planner_name" TEXT NOT NULL DEFAULT 'System'
);

-- CreateTable
CREATE TABLE "ReedStockMaster" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reed_count" TEXT NOT NULL,
    "reed_width" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Available',
    "available_qty" INTEGER NOT NULL,
    "location" TEXT
);

-- CreateTable
CREATE TABLE "RoleMaster" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template" TEXT
);

-- CreateTable
CREATE TABLE "SystemAuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "screen" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "department" TEXT,
    "designation" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastLogin" DATETIME,
    "permissions" TEXT,
    "remarks" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'System',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrderMaster" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "order_no" TEXT NOT NULL,
    "ibpo_no" TEXT,
    "customer_name" TEXT NOT NULL,
    "buyer_name" TEXT,
    "program" TEXT,
    "style" TEXT,
    "design_no_sp_no" TEXT NOT NULL,
    "construction" TEXT,
    "uom" TEXT NOT NULL DEFAULT 'Meters',
    "order_qty" REAL NOT NULL,
    "grey_qty" REAL,
    "warp_qty" REAL,
    "beam_capacity" REAL,
    "required_beams" INTEGER,
    "planned_warp_beams" INTEGER,
    "current_beam_planned" INTEGER NOT NULL DEFAULT 0,
    "beam_prepared" INTEGER NOT NULL DEFAULT 0,
    "planned_loom_count" INTEGER,
    "avg_production_per_loom" REAL,
    "estimated_production_days" REAL,
    "expected_completion_date" DATETIME,
    "sizing_planned_date" DATETIME,
    "sizing_completed_date" DATETIME,
    "weaving_planned_date" DATETIME,
    "expected_dispatch_date" DATETIME,
    "actual_dispatch_date" DATETIME,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "planning_status" TEXT NOT NULL DEFAULT 'Planning Pending',
    "delay_status" TEXT,
    "order_received_date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "target_delivery_date" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'Order Received',
    "remarks" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderMaster_design_no_sp_no_fkey" FOREIGN KEY ("design_no_sp_no") REFERENCES "DesignMaster" ("design_no_sp_no") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BeamRequirement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "order_id" INTEGER NOT NULL,
    "order_no" TEXT NOT NULL,
    "design_no" TEXT NOT NULL,
    "beam_no" INTEGER NOT NULL,
    "beam_type" TEXT,
    "beam_dia" INTEGER,
    "required_meter" REAL NOT NULL,
    "required_ends" INTEGER,
    "beam_width" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "beam_stock_id" INTEGER,
    "remarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BeamRequirement_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "OrderMaster" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BeamStock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "beamNo" TEXT NOT NULL,
    "vendorBeamNo" TEXT,
    "warpingDcNo" TEXT,
    "warpingVendor" TEXT,
    "warpingBatchNo" TEXT,
    "setNo" TEXT,
    "beamSerialNo" TEXT,
    "beamType" TEXT,
    "beamDiameter" REAL,
    "beamWidth" REAL,
    "beamLength" REAL,
    "beamWeight" REAL,
    "beamStatus" TEXT NOT NULL DEFAULT 'NOT_PLANNED',
    "beamLocation" TEXT,
    "unit" TEXT,
    "remarks" TEXT,
    "designNo" TEXT,
    "orderNumber" TEXT,
    "ibpoNumber" TEXT,
    "customer" TEXT,
    "orderQuantity" REAL,
    "warpQuantity" REAL,
    "requiredBeamQuantity" INTEGER,
    "totalEnds" INTEGER,
    "warpMeter" REAL,
    "currentBalanceMeter" REAL,
    "beamCapacity" REAL,
    "reservedMeter" REAL,
    "runningMeter" REAL,
    "balanceMeter" REAL,
    "warpingStatus" TEXT NOT NULL DEFAULT 'NOT_PLANNED',
    "sizingStatus" TEXT NOT NULL DEFAULT 'NOT_PLANNED',
    "loomStatus" TEXT NOT NULL DEFAULT 'NOT_ALLOCATED',
    "beamPlannedDate" DATETIME,
    "warpingStartDate" DATETIME,
    "warpingCompletionDate" DATETIME,
    "sizingStartDate" DATETIME,
    "sizingCompletionDate" DATETIME,
    "beamReadyDate" DATETIME,
    "loomAllocationDate" DATETIME,
    "productionStartDate" DATETIME,
    "productionCompletionDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BeamStock_designNo_fkey" FOREIGN KEY ("designNo") REFERENCES "DesignMaster" ("design_no_sp_no") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BeamHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "beamStockId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT,
    "remarks" TEXT,
    CONSTRAINT "BeamHistory_beamStockId_fkey" FOREIGN KEY ("beamStockId") REFERENCES "BeamStock" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LoomRunEntry_loom_no_key" ON "LoomRunEntry"("loom_no");

-- CreateIndex
CREATE UNIQUE INDEX "RoleMaster_name_key" ON "RoleMaster"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_department_idx" ON "User"("department");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "OrderMaster_order_no_key" ON "OrderMaster"("order_no");

-- CreateIndex
CREATE UNIQUE INDEX "BeamStock_beamNo_key" ON "BeamStock"("beamNo");

-- CreateIndex
CREATE UNIQUE INDEX "BeamStock_vendorBeamNo_key" ON "BeamStock"("vendorBeamNo");
