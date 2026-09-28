require('dotenv').config();

const express = require('express');
const cors = require('cors');
const prisma = require('./prismaClient');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();

// ----------------------------------------------------
// MIDDLEWARE
// ----------------------------------------------------

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'x-role',
    'x-user-role',
    'x-user'
  ]
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.text({ limit: '50mb' }));

// ----------------------------------------------------
// ENVIRONMENT
// ----------------------------------------------------

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'spu_loom_erp_super_secret_key_2026';

const DEFAULT_ADMIN_USERNAME =
  process.env.DEFAULT_ADMIN_USERNAME ||
  'ADMIN';

const DEFAULT_ADMIN_PASSWORD =
  process.env.DEFAULT_ADMIN_PASSWORD ||
  'spupl!@#$%';

// ----------------------------------------------------
// PASSWORD HELPER
// ----------------------------------------------------

async function safeComparePassword(inputPassword, storedHash) {
  if (!inputPassword || !storedHash) {
    return false;
  }

  if (inputPassword === storedHash) {
    return true;
  }

  try {
    return await bcrypt.compare(
      inputPassword,
      storedHash
    );
  } catch (err) {
    return false;
  }
}

// ----------------------------------------------------
// HEALTH CHECK
// ----------------------------------------------------

app.get('/api', (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0'
  });
});

app.get('/api/system-health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'Healthy',
      dbConnected: true
    });
  } catch (error) {
    res.status(500).json({
      status: 'Critical',
      error: error.message
    });
  }
});

// ----------------------------------------------------
// AUTHENTICATION
// ----------------------------------------------------

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const cleanUsername = username
      ? username.trim()
      : '';

    if (!cleanUsername || !password) {
      return res.status(401).json({
        error: 'Invalid Username or Password'
      });
    }

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: cleanUsername },
          {
            username:
              cleanUsername.toUpperCase()
          },
          {
            username:
              cleanUsername.toLowerCase()
          }
        ]
      }
    });

    const isAdminAttempt =
      cleanUsername.toUpperCase() ===
      DEFAULT_ADMIN_USERNAME.toUpperCase();

    const hash = await bcrypt.hash(
      DEFAULT_ADMIN_PASSWORD,
      10
    );

    if (!user && isAdminAttempt) {
      user = await prisma.user.create({
        data: {
          employeeId: 'ADMIN001',
          employeeName: 'System Administrator',
          username: DEFAULT_ADMIN_USERNAME,
          password_hash: hash,
          role: 'ADMINISTRATOR',
          status: 'ACTIVE'
        }
      });
    }

    if (!user) {
      return res.status(401).json({
        error: 'Invalid Username or Password'
      });
    }

    let isValid =
      await safeComparePassword(
        password,
        user.password_hash
      );

    if (
      !isValid &&
      isAdminAttempt &&
      password === DEFAULT_ADMIN_PASSWORD
    ) {
      isValid = true;

      await prisma.user.update({
        where: {
          id: user.id
        },
        data: {
          password_hash: hash
        }
      }).catch(() => {});
    }

    if (!isValid) {
      return res.status(401).json({
        error: 'Invalid Username or Password'
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        username: user.username
      },
      JWT_SECRET,
      {
        expiresIn: '8h'
      }
    );

    const {
      password_hash,
      ...safeUser
    } = user;

    return res.json({
      token,
      user: safeUser
    });
  } catch (error) {
    return res.status(500).json({
      error:
        error.message ||
        'Internal Server Error'
    });
  }
});

// ----------------------------------------------------
// LOOMS MASTER API
// ----------------------------------------------------

app.get('/api/looms', async (req, res) => {
  try {
    const looms =
      await prisma.loomMaster.findMany({
        orderBy: {
          loom_no: 'asc'
        }
      });

    res.json(looms || []);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.post('/api/looms', async (req, res) => {
  try {
    const data = req.body;

    const loomNo = Number(
      data.loom_no ||
      data.loomNo
    );

    if (!loomNo) {
      return res.status(400).json({
        error: 'Loom Number is required'
      });
    }

    const upserted =
      await prisma.loomMaster.upsert({
        where: {
          loom_no: loomNo
        },

        update: {
          loom_type:
            data.loom_type ||
            data.loomType ||
            null,

          shed:
            data.shed !== undefined
              ? Number(data.shed)
              : null,

          shed_name:
            data.shed_name ||
            data.shedName ||
            null,

          rpm:
            data.rpm !== undefined
              ? Number(data.rpm)
              : null,

          make:
            data.make || null,

          model:
            data.model || null,

          width:
            data.width || null,

          unit:
            data.unit || 'UNIT 1',

          weave:
            data.weave || null,

          status:
            data.status || 'Available',

          remarks:
            data.remarks || null
        },

        create: {
          loom_no: loomNo,

          loom_type:
            data.loom_type ||
            data.loomType ||
            'AIRJET',

          shed:
            data.shed !== undefined
              ? Number(data.shed)
              : 1,

          shed_name:
            data.shed_name ||
            data.shedName ||
            'SHED 1',

          rpm:
            data.rpm !== undefined
              ? Number(data.rpm)
              : 650,

          make:
            data.make || null,

          model:
            data.model || null,

          width:
            data.width || null,

          unit:
            data.unit || 'UNIT 1',

          weave:
            data.weave || null,

          status:
            data.status || 'Available',

          remarks:
            data.remarks || null
        }
      });

    res.json({
      success: true,
      loom: upserted
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.put('/api/looms/:id', async (req, res) => {
  try {
    const id =
      Number(req.params.id);

    const data = req.body;

    const updated =
      await prisma.loomMaster.update({
        where: {
          loom_no: id
        },

        data: {
          loom_type:
            data.loom_type ||
            data.loomType,

          shed:
            data.shed !== undefined
              ? Number(data.shed)
              : undefined,

          shed_name:
            data.shed_name ||
            data.shedName,

          rpm:
            data.rpm !== undefined
              ? Number(data.rpm)
              : undefined,

          make:
            data.make,

          model:
            data.model,

          width:
            data.width,

          status:
            data.status,

          remarks:
            data.remarks
        }
      });

    res.json({
      success: true,
      loom: updated
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.delete('/api/looms/:id', async (req, res) => {
  try {
    const id =
      Number(req.params.id);

    await prisma.loomRunEntry
      .deleteMany({
        where: {
          loom_no: id
        }
      })
      .catch(() => {});

    await prisma.plannedAssignment
      .deleteMany({
        where: {
          loom_no: id
        }
      })
      .catch(() => {});

    await prisma.loomMaster.delete({
      where: {
        loom_no: id
      }
    });

    res.json({
      success: true,
      message:
        `Loom ${id} deleted successfully`
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// ----------------------------------------------------
// BEAM STOCK API
// ----------------------------------------------------

app.get('/api/beam-stock', async (req, res) => {
  try {
    const beams =
      await prisma.beamStockMaster.findMany({
        orderBy: {
          id: 'desc'
        }
      });

    res.json(beams || []);
  } catch (error) {
    res.json([]);
  }
});

app.post('/api/beam-stock', async (req, res) => {
  try {
    const item = req.body;

    const beamNo =
      item.beam_no ||
      item.beamNo ||
      `BM-${Date.now()}`;

    const designNo =
      item.design_no ||
      item.designNo ||
      'UNKNOWN';

    const availableMeter =
      Number(
        item.available_meter ||
        item.availableMeter ||
        item.beam_length ||
        1000
      );

    const created =
      await prisma.beamStockMaster.create({
        data: {
          beam_no: String(beamNo),
          design_no: String(designNo),
          available_meter: availableMeter,
          current_balance_meter:
            availableMeter,

          beam_type:
            item.beam_type ||
            item.beamType ||
            'STANDARD',

          vendor_name:
            item.vendor_name ||
            item.vendorName ||
            'Premier',

          status:
            item.status ||
            'Available',

          unit:
            item.unit ||
            'UNIT 1',

          remarks:
            item.remarks ||
            'Beam Stock Entry'
        }
      });

    res.json({
      success: true,
      beam: created
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.put('/api/beam-stock/:id', async (req, res) => {
  try {
    const id =
      Number(req.params.id);

    const item = req.body;

    const updated =
      await prisma.beamStockMaster.update({
        where: {
          id
        },

        data: {
          beam_no:
            item.beam_no ||
            item.beamNo,

          design_no:
            item.design_no ||
            item.designNo,

          available_meter:
            item.available_meter !== undefined
              ? Number(item.available_meter)
              : undefined,

          vendor_name:
            item.vendor_name ||
            item.vendorName,

          status:
            item.status,

          remarks:
            item.remarks
        }
      });

    res.json({
      success: true,
      beam: updated
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.delete('/api/beam-stock/:id', async (req, res) => {
  try {
    const id =
      Number(req.params.id);

    await prisma.beamStockMaster.delete({
      where: {
        id
      }
    });

    res.json({
      success: true,
      message:
        `Beam stock ${id} deleted successfully`
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// ----------------------------------------------------
// REED STOCK API
// ----------------------------------------------------

app.get('/api/reed-stock', async (req, res) => {
  try {
    const reeds =
      await prisma.reedStockMaster.findMany({
        orderBy: {
          id: 'desc'
        }
      });

    res.json(reeds || []);
  } catch (error) {
    res.json([]);
  }
});

app.post('/api/reed-stock', async (req, res) => {
  try {
    const item = req.body;

    const reedCount =
      item.reed_count ||
      item.reedCount ||
      '52.2';

    const qty =
      Number(
        item.available_qty ||
        item.qty ||
        1
      );

    const created =
      await prisma.reedStockMaster.create({
        data: {
          reed_no:
            item.reed_no ||
            item.reedNo ||
            `REED-${Date.now()}`,

          reed_count:
            String(reedCount),

          reed_type:
            item.reed_type ||
            item.reedType ||
            'STANDARD',

          available_qty:
            qty,

          total_qty:
            qty,

          vendor:
            item.vendor ||
            'Premier',

          location:
            item.location ||
            'Rack A-01',

          status:
            item.status ||
            'Available',

          remarks:
            item.remarks ||
            'Reed Stock Entry'
        }
      });

    res.json({
      success: true,
      reed: created
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.put('/api/reed-stock/:id', async (req, res) => {
  try {
    const id =
      Number(req.params.id);

    const item = req.body;

    const updated =
      await prisma.reedStockMaster.update({
        where: {
          id
        },

        data: {
          reed_no:
            item.reed_no ||
            item.reedNo,

          reed_count:
            item.reed_count ||
            item.reedCount,

          available_qty:
            item.available_qty !== undefined
              ? Number(item.available_qty)
              : undefined,

          location:
            item.location,

          status:
            item.status,

          remarks:
            item.remarks
        }
      });

    res.json({
      success: true,
      reed: updated
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.delete('/api/reed-stock/:id', async (req, res) => {
  try {
    const id =
      Number(req.params.id);

    await prisma.reedStockMaster.delete({
      where: {
        id
      }
    });

    res.json({
      success: true,
      message:
        `Reed stock ${id} deleted successfully`
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// ----------------------------------------------------
// DAILY REPORT - GET
// ----------------------------------------------------

app.get('/api/daily-report', async (req, res) => {
  try {
    const {
      date,
      department,
      startDate,
      endDate
    } = req.query;

    let where = {};

    if (startDate && endDate) {
      where.report_date =
        startDate === endDate
          ? String(startDate)
          : {
              gte: String(startDate),
              lte: String(endDate)
            };
    } else if (date) {
      where.report_date =
        String(date);
    }

    if (department) {
      where.department_code =
        String(department)
          .toUpperCase();
    }

    const entries =
      await prisma.dailyReportEntry.findMany({
        where,

        orderBy: [
          {
            department_code: 'asc'
          },
          {
            id: 'asc'
          }
        ]
      }).catch(() => []);

    const masters =
      await prisma.departmentMasterInfo
        .findMany()
        .catch(() => []);

    res.json({
      entries: entries || [],
      count:
        (entries || []).length,
      departmentMasters:
        masters || []
    });
  } catch (error) {
    res.json({
      entries: [],
      count: 0,
      departmentMasters: []
    });
  }
});

// ----------------------------------------------------
// DAILY REPORT - HISTORY DATES
// ----------------------------------------------------

app.get(
  '/api/daily-report/history-dates',
  async (req, res) => {
    try {
      const rawDates =
        await prisma.dailyReportEntry.groupBy({
          by: [
            'report_date',
            'department_code'
          ],

          _count: {
            id: true
          }
        }).catch(() => []);

      const dateMap =
        new Map();

      (rawDates || []).forEach(
        row => {
          if (
            !dateMap.has(
              row.report_date
            )
          ) {
            dateMap.set(
              row.report_date,
              new Set()
            );
          }

          dateMap
            .get(row.report_date)
            .add(
              row.department_code
            );
        }
      );

      const dates =
        Array.from(
          dateMap.entries()
        )
          .map(
            ([date, departments]) => ({
              date,

              enteredDepartmentsCount:
                departments.size,

              departments:
                Array.from(
                  departments
                )
            })
          )
          .sort(
            (a, b) =>
              b.date.localeCompare(
                a.date
              )
          );

      res.json({
        dates: dates || [],
        count:
          (dates || []).length
      });
    } catch (error) {
      res.json({
        dates: [],
        count: 0
      });
    }
  }
);

// ----------------------------------------------------
// DAILY REPORT - MONTHLY SUMMARY
// ----------------------------------------------------

app.get(
  '/api/daily-report/monthly',
  async (req, res) => {
    try {
      const month =
        String(
          req.query.month || ''
        ).trim();

      const endDateParam =
        String(
          req.query.endDate || ''
        ).trim();

      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid month. Expected YYYY-MM.'
        });
      }

      const [
        year,
        monthNumber
      ] =
        month
          .split('-')
          .map(Number);

      if (
        monthNumber < 1 ||
        monthNumber > 12
      ) {
        return res.status(400).json({
          success: false,
          error: 'Invalid month.'
        });
      }

      const monthStart =
        `${month}-01`;

      const lastDay =
        new Date(
          Date.UTC(
            year,
            monthNumber,
            0
          )
        ).getUTCDate();

      const defaultMonthEnd =
        `${month}-${String(
          lastDay
        ).padStart(2, '0')}`;

      const monthEnd =
        /^\d{4}-\d{2}-\d{2}$/.test(
          endDateParam
        ) &&
        endDateParam >= monthStart &&
        endDateParam <= defaultMonthEnd
          ? endDateParam
          : defaultMonthEnd;

      const entries =
        await prisma.dailyReportEntry.findMany({
          where: {
            report_date: {
              gte: monthStart,
              lte: monthEnd
            }
          },

          orderBy: [
            {
              metric_code: 'asc'
            },
            {
              report_date: 'asc'
            },
            {
              department_code: 'asc'
            },
            {
              id: 'asc'
            }
          ]
        });

      const grouped =
        new Map();

      for (
        const entry of entries
      ) {
        const metricCode =
          String(
            entry.metric_code ||
              ''
          ).trim();

        if (!metricCode) {
          continue;
        }

        if (
          !grouped.has(
            metricCode
          )
        ) {
          grouped.set(
            metricCode,
            {
              metric_code:
                metricCode,

              metric_name:
                entry.metric_name ||
                metricCode,

              actualTotal: 0,

              targetTotal: 0,

              actualDates:
                new Set()
            }
          );
        }

        const item =
          grouped.get(
            metricCode
          );

        const actualValue =
          entry.actual_value !== null &&
          entry.actual_value !== undefined &&
          Number.isFinite(
            Number(
              entry.actual_value
            )
          )
            ? Number(
                entry.actual_value
              )
            : null;

        const targetValue =
          entry.target_value !== null &&
          entry.target_value !== undefined &&
          Number.isFinite(
            Number(
              entry.target_value
            )
          )
            ? Number(
                entry.target_value
              )
            : null;

        if (
          actualValue !== null
        ) {
          item.actualTotal +=
            actualValue;

          item.actualDates.add(
            String(
              entry.report_date
            )
          );
        }

        if (
          targetValue !== null &&
          targetValue > 0
        ) {
          item.targetTotal +=
            targetValue;
        }
      }

      const summary =
        Array.from(
          grouped.values()
        )
          .map(item => {
            const daysEntered =
              item.actualDates.size;

            const monthlyAverage =
              daysEntered > 0
                ? item.actualTotal /
                  daysEntered
                : 0;

            const achievementPct =
              item.targetTotal > 0
                ? (
                    item.actualTotal /
                    item.targetTotal
                  ) * 100
                : null;

            return {
              metric_code:
                item.metric_code,

              metric_name:
                item.metric_name,

              monthlyTotal:
                Number(
                  item.actualTotal.toFixed(
                    2
                  )
                ),

              monthlyAverage:
                Number(
                  monthlyAverage.toFixed(
                    2
                  )
                ),

              achievementPct:
                achievementPct === null
                  ? null
                  : Number(
                      achievementPct.toFixed(
                        2
                      )
                    ),

              targetTotal:
                Number(
                  item.targetTotal.toFixed(
                    2
                  )
                ),

              daysEntered
            };
          })
          .sort(
            (a, b) =>
              String(
                a.metric_code
              ).localeCompare(
                String(
                  b.metric_code
                )
              )
          );

      return res.json({
        success: true,

        month,

        startDate:
          monthStart,

        endDate:
          monthEnd,

        summary,

        count:
          summary.length
      });
    } catch (error) {
      console.error(
        'Monthly Daily Report Error:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          'Failed to load monthly daily report'
      });
    }
  }
);

// ----------------------------------------------------
// DAILY REPORT - WEEKLY MATRIX
// ----------------------------------------------------

app.get(
  '/api/daily-report/weekly',
  async (req, res) => {
    try {
      const startDate =
        String(
          req.query.startDate || ''
        ).trim();

      const endDate =
        String(
          req.query.endDate || ''
        ).trim();

      const departmentParam =
        String(
          req.query.department || ''
        ).trim();

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          startDate
        ) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(
          endDate
        )
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid dates. Expected YYYY-MM-DD.'
        });
      }

      if (
        startDate > endDate
      ) {
        return res.status(400).json({
          success: false,
          error:
            'startDate cannot be greater than endDate.'
        });
      }

      const start =
        new Date(
          `${startDate}T00:00:00Z`
        );

      const end =
        new Date(
          `${endDate}T00:00:00Z`
        );

      if (
        Number.isNaN(
          start.getTime()
        ) ||
        Number.isNaN(
          end.getTime()
        )
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid date range.'
        });
      }

      const dates = [];

      for (
        let current =
          new Date(start);

        current <= end;

        current.setUTCDate(
          current.getUTCDate() + 1
        )
      ) {
        dates.push(
          current
            .toISOString()
            .slice(0, 10)
        );
      }

      const where = {
        report_date: {
          gte: startDate,
          lte: endDate
        }
      };

      if (
        departmentParam &&
        departmentParam
          .toUpperCase() !== 'ALL'
      ) {
        where.department_code =
          departmentParam.toUpperCase();
      }

      const entries =
        await prisma.dailyReportEntry.findMany({
          where,

          orderBy: [
            {
              department_code: 'asc'
            },
            {
              metric_code: 'asc'
            },
            {
              report_date: 'asc'
            },
            {
              id: 'asc'
            }
          ]
        });

      const matrixMap =
        new Map();

      for (
        const entry of entries
      ) {
        const departmentCode =
          String(
            entry.department_code ||
              ''
          ).trim();

        const metricCode =
          String(
            entry.metric_code ||
              ''
          ).trim();

        if (!metricCode) {
          continue;
        }

        const rowKey =
          `${departmentCode}__${metricCode}`;

        if (
          !matrixMap.has(
            rowKey
          )
        ) {
          matrixMap.set(
            rowKey,
            {
              department_code:
                departmentCode,

              metric_code:
                metricCode,

              metric_name:
                entry.metric_name ||
                metricCode,

              values: {}
            }
          );
        }

        const row =
          matrixMap.get(
            rowKey
          );

        const actualValue =
          entry.actual_value !== null &&
          entry.actual_value !== undefined &&
          Number.isFinite(
            Number(
              entry.actual_value
            )
          )
            ? Number(
                entry.actual_value
              )
            : null;

        row.values[
          String(
            entry.report_date
          )
        ] = actualValue;
      }

      const matrix =
        Array.from(
          matrixMap.values()
        )
          .map(row => {
            const result = {
              department_code:
                row.department_code,

              metric_code:
                row.metric_code,

              metric_name:
                row.metric_name,

              values: {}
            };

            for (
              const date of dates
            ) {
              const value =
                Object.prototype.hasOwnProperty.call(
                  row.values,
                  date
                )
                  ? row.values[
                      date
                    ]
                  : null;

              result.values[
                date
              ] = value;

              result[
                date
              ] = value;
            }

            return result;
          })
          .sort(
            (a, b) => {
              const departmentCompare =
                String(
                  a.department_code
                ).localeCompare(
                  String(
                    b.department_code
                  )
                );

              if (
                departmentCompare !== 0
              ) {
                return departmentCompare;
              }

              return String(
                a.metric_code
              ).localeCompare(
                String(
                  b.metric_code
                )
              );
            }
          );

      return res.json({
        success: true,

        startDate,

        endDate,

        dates,

        matrix,

        count:
          matrix.length
      });
    } catch (error) {
      console.error(
        'Weekly Daily Report Error:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          'Failed to load weekly daily report'
      });
    }
  }
);

// ----------------------------------------------------
// DAILY REPORT - POST / SAVE
// ----------------------------------------------------

app.post('/api/daily-report', async (req, res) => {
  try {
    const {
      report_date,
      department_code,
      department_head,
      mentor,
      entries,
      metrics,
      remarks,
      entered_by
    } = req.body;

    const items =
      Array.isArray(entries)
        ? entries
        : (
            Array.isArray(metrics)
              ? metrics
              : []
          );

    const dateStr =
      String(
        report_date ||
        new Date()
          .toISOString()
          .split('T')[0]
      ).trim();

    const deptCode =
      String(
        department_code ||
        'GENERAL'
      )
        .trim()
        .toUpperCase();

    const results = [];

    for (
      const item of items
    ) {
      const metricCode =
        String(
          item.metric_code ||
          item.code ||
          ''
        ).trim();

      if (!metricCode) {
        continue;
      }

      const numVal =
        item.actual_value !== undefined &&
        item.actual_value !== null
          ? Number(
              item.actual_value
            )
          : null;

      const targetVal =
        item.target_value !== undefined &&
        item.target_value !== null
          ? Number(
              item.target_value
            )
          : null;

      const diffVal =
        targetVal !== null &&
        numVal !== null
          ? Number(
              (
                numVal -
                targetVal
              ).toFixed(2)
            )
          : null;

      const pctVal =
        targetVal !== null &&
        targetVal > 0 &&
        numVal !== null
          ? Number(
              (
                (
                  numVal /
                  targetVal
                ) * 100
              ).toFixed(2)
            )
          : null;

      const performanceMark =
        targetVal === null ||
        targetVal === undefined ||
        targetVal <= 0
          ? 'N/A'
          : numVal === null
            ? 'NOT ENTERED'
            : pctVal >= 100
              ? 'EXCELLENT'
              : pctVal >= 90
                ? 'GOOD'
                : pctVal >= 80
                  ? 'ON PLAN'
                  : 'BELOW TARGET';

      const upserted =
        await prisma.dailyReportEntry.upsert({
          where: {
            report_date_department_code_metric_code: {
              report_date: dateStr,

              department_code:
                deptCode,

              metric_code:
                metricCode
            }
          },

          update: {
            metric_name:
              item.metric_name ||
              item.name ||
              metricCode,

            raw_value:
              item.raw_value
                ? String(
                    item.raw_value
                  )
                : null,

            actual_value:
              numVal,

            target_value:
              targetVal,

            diff_value:
              diffVal,

            pct_value:
              pctVal,

            department_head:
              department_head ||
              null,

            mentor:
              mentor ||
              null,

            remarks:
              item.remarks ||
              remarks ||
              '',

            entered_by:
              entered_by ||
              'ADMIN',

            performance_mark:
              performanceMark
          },

          create: {
            report_date:
              dateStr,

            department_code:
              deptCode,

            metric_code:
              metricCode,

            metric_name:
              item.metric_name ||
              item.name ||
              metricCode,

            raw_value:
              item.raw_value
                ? String(
                    item.raw_value
                  )
                : null,

            actual_value:
              numVal,

            target_value:
              targetVal,

            diff_value:
              diffVal,

            pct_value:
              pctVal,

            department_head:
              department_head ||
              null,

            mentor:
              mentor ||
              null,

            remarks:
              item.remarks ||
              remarks ||
              '',

            entered_by:
              entered_by ||
              'ADMIN',

            performance_mark:
              performanceMark
          }
        });

      results.push(
        upserted
      );
    }

    res.json({
      success: true,
      count:
        results.length,
      entries:
        results
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// ----------------------------------------------------
// DESIGNS
// ----------------------------------------------------

app.get('/api/designs', async (req, res) => {
  try {
    const designs =
      await prisma.designMaster.findMany();

    res.json(
      designs || []
    );
  } catch (error) {
    res.json([]);
  }
});

// ----------------------------------------------------
// ORDERS
// ----------------------------------------------------

app.get('/api/orders', async (req, res) => {
  try {
    const orders =
      await prisma.orderMaster.findMany({
        include: {
          designMaster: true
        },

        orderBy: {
          id: 'desc'
        }
      });

    res.json(
      orders || []
    );
  } catch (error) {
    res.json([]);
  }
});

// ----------------------------------------------------
// ACTIVE RUNS
// ----------------------------------------------------

app.get('/api/active-runs', async (req, res) => {
  try {
    const runs =
      await prisma.loomRunEntry.findMany({
        orderBy: {
          loom_no: 'asc'
        }
      });

    res.json(
      runs || []
    );
  } catch (error) {
    res.json([]);
  }
});

// ----------------------------------------------------
// COMPLETED RUNS
// ----------------------------------------------------

app.get('/api/completed-runs', async (req, res) => {
  try {
    const history =
      await prisma.completedWarpHistory.findMany({
        orderBy: {
          end_date: 'desc'
        }
      });

    res.json(
      history || []
    );
  } catch (error) {
    res.json([]);
  }
});

// ----------------------------------------------------
// DESIGN RUNNING REPORT
// ----------------------------------------------------

app.get(
  '/api/reports/design-running',
  async (req, res) => {
    try {
      const [
        activeRuns,
        loomMasters,
        orderMasters
      ] =
        await Promise.all([
          prisma.loomRunEntry
            .findMany()
            .catch(() => []),

          prisma.loomMaster
            .findMany()
            .catch(() => []),

          prisma.orderMaster
            .findMany()
            .catch(() => [])
        ]);

      const loomMap =
        new Map(
          (loomMasters || [])
            .map(
              loom => [
                loom.loom_no,
                loom
              ]
            )
        );

      const runningLoomsList =
        (activeRuns || [])
          .map(run => {
            const loomInfo =
              loomMap.get(
                run.loom_no
              );

            return {
              loomNo:
                run.loom_no,

              designNo:
                run.design_no_sp_no,

              loomStartDate:
                run.loom_start_date,

              warpedMeter:
                run.warped_meter ||
                0,

              dailyProduction:
                run.daily_production ||
                0,

              rpm:
                run.rpm ||
                loomInfo?.rpm ||
                650,

              efficiency:
                run.efficiency ||
                90,

              currentReedNo:
                run.current_reed_no ||
                '',

              currentBeamNo:
                run.current_beam_no ||
                '',

              setNo:
                run.set_no ||
                '',

              orderNo:
                run.order_no ||
                '',

              unit:
                loomInfo?.unit ||
                'UNIT 1',

              loomType:
                loomInfo?.loom_type ||
                'AIRJET',

              status:
                loomInfo?.status ||
                'Running'
            };
          });

      res.json({
        success: true,
        data:
          runningLoomsList,

        orders:
          orderMasters
      });
    } catch (error) {
      res.json({
        success: true,
        data: [],
        orders: []
      });
    }
  }
);

// ----------------------------------------------------
// REED REQUIREMENTS
// ----------------------------------------------------

app.get(
  '/api/reed-requirements',
  async (req, res) => {
    try {
      const reqs =
        await prisma.reedRequirement.findMany({
          orderBy: {
            createdAt: 'desc'
          }
        });

      res.json(
        reqs || []
      );
    } catch (error) {
      res.json([]);
    }
  }
);

// ----------------------------------------------------
// NEXT PLANS
// ----------------------------------------------------

app.get(
  '/api/next-plans',
  async (req, res) => {
    try {
      const plans =
        await prisma.plannedAssignment.findMany({
          orderBy: {
            id: 'asc'
          }
        });

      res.json(
        plans || []
      );
    } catch (error) {
      res.json([]);
    }
  }
);

app.get(
  '/api/planning/next-plans',
  async (req, res) => {
    try {
      const plans =
        await prisma.plannedAssignment.findMany({
          orderBy: {
            id: 'asc'
          }
        });

      res.json(
        plans || []
      );
    } catch (error) {
      res.json([]);
    }
  }
);

// ----------------------------------------------------
// PRODUCTION LOGS
// ----------------------------------------------------

app.get(
  '/api/production-logs',
  async (req, res) => {
    try {
      const logs =
        await prisma.dailyProductionLog.findMany({
          orderBy: {
            date: 'desc'
          },

          take: 2000
        });

      res.json(
        logs || []
      );
    } catch (error) {
      res.json([]);
    }
  }
);

// ----------------------------------------------------
// ERP ALERTS
// ----------------------------------------------------

app.get('/api/erp-alerts', async (req, res) => {
  try {
    res.json([]);
  } catch (error) {
    res.json([]);
  }
});

// ----------------------------------------------------
// USERS
// ----------------------------------------------------

// GET USERS
app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        employeeId: true,
        employeeName: true,
        username: true,
        role: true,
        department: true,
        status: true,
        email: true,
        mobile: true,
        designation: true,
        permissions: true,
        remarks: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        lastLogin: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      users: users || [],
      total: (users || []).length
    });
  } catch (error) {
    console.error('GET USERS ERROR:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load users'
    });
  }
});

// CREATE USER
app.post('/api/users', async (req, res) => {
  try {
    const body = req.body || {};

    const employeeId = String(
      body.employeeId ?? body.employee_id ?? ''
    ).trim();

    const employeeName = String(
      body.employeeName ?? body.employee_name ?? ''
    ).trim();

    const username = String(
      body.username ?? ''
    ).trim();

    const password = String(
      body.password ?? ''
    ).trim();

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        error: 'Employee ID is required'
      });
    }

    if (!employeeName) {
      return res.status(400).json({
        success: false,
        error: 'Employee Name is required'
      });
    }

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password is required'
      });
    }

    const existingEmployee = await prisma.user.findUnique({
      where: {
        employeeId
      }
    });

    if (existingEmployee) {
      return res.status(409).json({
        success: false,
        error: 'Employee ID already exists'
      });
    }

    const existingUsername = await prisma.user.findUnique({
      where: {
        username
      }
    });

    if (existingUsername) {
      return res.status(409).json({
        success: false,
        error: 'Username already exists'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const permissions =
      body.permissions === undefined ||
      body.permissions === null ||
      body.permissions === ''
        ? null
        : typeof body.permissions === 'string'
          ? body.permissions
          : JSON.stringify(body.permissions);

    const user = await prisma.user.create({
      data: {
        employeeId,
        employeeName,
        username,
        email: body.email
          ? String(body.email).trim()
          : null,
        mobile: body.mobile
          ? String(body.mobile).trim()
          : null,
        department: body.department
          ? String(body.department).trim()
          : null,
        designation: body.designation
          ? String(body.designation).trim()
          : null,
        password_hash: passwordHash,
        role: String(
          body.role || 'VIEWER'
        ).trim().toUpperCase(),
        status: String(
          body.status || 'ACTIVE'
        ).trim().toUpperCase(),
        permissions,
        remarks: body.remarks
          ? String(body.remarks).trim()
          : null,
        createdBy: String(
          body.adminUser ||
          body.createdBy ||
          req.headers['x-user'] ||
          'ADMIN'
        ).trim()
      }
    });

    const {
      password_hash,
      ...safeUser
    } = user;

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: safeUser
    });

  } catch (error) {
    console.error('CREATE USER ERROR:', error);

    if (error?.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: 'Employee ID or Username already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create user'
    });
  }
});

// UPDATE USER
app.put('/api/users/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    const existing = await prisma.user.findUnique({
      where: {
        id
      }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const body = req.body || {};
    const data = {};

    if (
      body.employeeId !== undefined ||
      body.employee_id !== undefined
    ) {
      data.employeeId = String(
        body.employeeId ??
        body.employee_id ??
        ''
      ).trim();
    }

    if (
      body.employeeName !== undefined ||
      body.employee_name !== undefined
    ) {
      data.employeeName = String(
        body.employeeName ??
        body.employee_name ??
        ''
      ).trim();
    }

    if (body.username !== undefined) {
      data.username = String(
        body.username
      ).trim();
    }

    if (body.email !== undefined) {
      data.email = body.email
        ? String(body.email).trim()
        : null;
    }

    if (body.mobile !== undefined) {
      data.mobile = body.mobile
        ? String(body.mobile).trim()
        : null;
    }

    if (body.department !== undefined) {
      data.department = body.department
        ? String(body.department).trim()
        : null;
    }

    if (body.designation !== undefined) {
      data.designation = body.designation
        ? String(body.designation).trim()
        : null;
    }

    if (body.role !== undefined) {
      data.role = String(
        body.role || 'VIEWER'
      ).trim().toUpperCase();
    }

    if (body.status !== undefined) {
      data.status = String(
        body.status || 'ACTIVE'
      ).trim().toUpperCase();
    }

    if (body.permissions !== undefined) {
      data.permissions =
        body.permissions === null ||
        body.permissions === ''
          ? null
          : typeof body.permissions === 'string'
            ? body.permissions
            : JSON.stringify(body.permissions);
    }

    if (body.remarks !== undefined) {
      data.remarks = body.remarks
        ? String(body.remarks).trim()
        : null;
    }

    if (
      body.password !== undefined &&
      String(body.password).trim()
    ) {
      data.password_hash =
        await bcrypt.hash(
          String(body.password).trim(),
          10
        );
    }

    const updated = await prisma.user.update({
      where: {
        id
      },
      data
    });

    const {
      password_hash,
      ...safeUser
    } = updated;

    res.json({
      success: true,
      message: 'User updated successfully',
      user: safeUser
    });

  } catch (error) {
    console.error('UPDATE USER ERROR:', error);

    if (error?.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: 'Employee ID or Username already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update user'
    });
  }
});

// PATCH USER
app.patch('/api/users/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    const existing = await prisma.user.findUnique({
      where: {
        id
      }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const body = req.body || {};
    const data = {};

    if (body.employeeId !== undefined) {
      data.employeeId =
        String(body.employeeId).trim();
    }

    if (body.employeeName !== undefined) {
      data.employeeName =
        String(body.employeeName).trim();
    }

    if (body.username !== undefined) {
      data.username =
        String(body.username).trim();
    }

    if (body.email !== undefined) {
      data.email = body.email
        ? String(body.email).trim()
        : null;
    }

    if (body.mobile !== undefined) {
      data.mobile = body.mobile
        ? String(body.mobile).trim()
        : null;
    }

    if (body.department !== undefined) {
      data.department = body.department
        ? String(body.department).trim()
        : null;
    }

    if (body.designation !== undefined) {
      data.designation = body.designation
        ? String(body.designation).trim()
        : null;
    }

    if (body.role !== undefined) {
      data.role =
        String(body.role).toUpperCase();
    }

    if (body.status !== undefined) {
      data.status =
        String(body.status).toUpperCase();
    }

    if (body.permissions !== undefined) {
      data.permissions =
        typeof body.permissions === 'string'
          ? body.permissions
          : JSON.stringify(body.permissions);
    }

    if (body.remarks !== undefined) {
      data.remarks = body.remarks
        ? String(body.remarks).trim()
        : null;
    }

    if (
      body.password !== undefined &&
      String(body.password).trim()
    ) {
      data.password_hash =
        await bcrypt.hash(
          String(body.password).trim(),
          10
        );
    }

    const updated = await prisma.user.update({
      where: {
        id
      },
      data
    });

    const {
      password_hash,
      ...safeUser
    } = updated;

    res.json({
      success: true,
      message: 'User updated successfully',
      user: safeUser
    });

  } catch (error) {
    console.error('PATCH USER ERROR:', error);

    if (error?.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: 'Employee ID or Username already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update user'
    });
  }
});

// DELETE USER
app.delete('/api/users/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    const existing = await prisma.user.findUnique({
      where: {
        id
      }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    await prisma.user.delete({
      where: {
        id
      }
    });

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('DELETE USER ERROR:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete user'
    });
  }
});

// RESET PASSWORD
app.put('/api/users/:id/password', async (req, res) => {
  try {
    const id = Number(req.params.id);

    const password = String(
      req.body?.password ??
      req.body?.newPassword ??
      ''
    ).trim();

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'New password is required'
      });
    }

    const existing = await prisma.user.findUnique({
      where: {
        id
      }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const passwordHash =
      await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: {
        id
      },
      data: {
        password_hash: passwordHash,
        failedAttempts: 0
      }
    });

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('RESET PASSWORD ERROR:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to reset password'
    });
  }
});

// ----------------------------------------------------
// GLOBAL ERROR HANDLER
// ----------------------------------------------------

app.use(
  (err, req, res, next) => {
    res.status(500).json({
      success: false,
      error:
        err.message ||
        'Internal Server Error'
    });
  }
);

// ----------------------------------------------------
// API 404 HANDLER
// ----------------------------------------------------

app.use(
  (req, res) => {
    res.status(404).json({
      success: false,

      error:
        `API endpoint ${req.method} ${req.url} not found`
    });
  }
);

// ----------------------------------------------------
// EXPORT EXPRESS APP
// ----------------------------------------------------

module.exports = app;

// ----------------------------------------------------
// LOCAL SERVER ONLY
// ----------------------------------------------------

if (!process.env.VERCEL) {
  const PORT =
    process.env.PORT || 3002;

  app.listen(
    PORT,
    () => {
      console.log(
        `Backend server running locally on port ${PORT}`
      );
    }
  );
}
