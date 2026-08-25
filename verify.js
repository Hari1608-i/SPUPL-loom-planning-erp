const go = async () => {
  const res = await fetch('http://localhost:3000/');
  const html = await res.text();
  console.log('Frontend HTTP Status:', res.status);
  console.log('Has root div:', html.includes('id="root"'));
  console.log('Has SPUPL ERP title:', html.includes('SPUPL ERP'));

  const backRes = await fetch('http://localhost:3002/api/looms');
  const looms = await backRes.json();
  console.log('Backend looms count:', looms.length);

  const runsRes = await fetch('http://localhost:3002/api/active-runs');
  const runs = await runsRes.json();
  console.log('Active runs count:', runs.length);

  const designRes = await fetch('http://localhost:3002/api/designs');
  const designs = await designRes.json();
  console.log('Designs:', designs.map(d => d.design_no_sp_no).join(', '));
};

go().catch(console.error);
