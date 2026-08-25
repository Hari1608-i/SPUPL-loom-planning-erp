const go = async () => {
  const base = 'http://localhost:3002';
  const checks = [
    ['Frontend', 'http://localhost:3000/'],
    ['GET /api/looms', `${base}/api/looms`],
    ['GET /api/designs', `${base}/api/designs`],
    ['GET /api/active-runs', `${base}/api/active-runs`],
    ['GET /api/next-plans', `${base}/api/next-plans`],
    ['GET /api/completed-runs', `${base}/api/completed-runs`],
    ['GET /api/beam-stock', `${base}/api/beam-stock`],
    ['GET /api/beams/available', `${base}/api/beams/available`],
    ['GET /api/sizing/requests', `${base}/api/sizing/requests`],
    ['GET /api/users', `${base}/api/users`],
    ['GET /api/system-health', `${base}/api/system-health`],
    ['GET /api/dashboard/planning-kpis', `${base}/api/dashboard/planning-kpis`],
    ['GET /api/orders', `${base}/api/orders`],
    ['GET /api/planning/next-plans', `${base}/api/planning/next-plans`],
    ['GET /api/reed-stock', `${base}/api/reed-stock`],
  ];

  console.log('\n=== SPU LOOM ERP - FULL SYSTEM VERIFICATION ===\n');
  let pass = 0, fail = 0;

  for (const [name, url] of checks) {
    try {
      const res = await fetch(url);
      const data = name === 'Frontend' ? await res.text() : await res.json();
      const count = name === 'Frontend' ? (data.includes('id="root"') ? '(valid html)' : '(invalid html)')
                   : Array.isArray(data) ? `(${data.length} records)` 
                   : data.kpis ? `(kpis: ${JSON.stringify(data.kpis)})` 
                   : data.success ? '(success)' 
                   : data.status ? `(status: ${data.status})`
                   : '';
      console.log(`  ✅ ${name.padEnd(40)} HTTP ${res.status} ${count}`);
      pass++;
    } catch (e) {
      console.log(`  ❌ ${name.padEnd(40)} ERROR: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n=== RESULT: ${pass} PASS, ${fail} FAIL ===\n`);
};
go();
