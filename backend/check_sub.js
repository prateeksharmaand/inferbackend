const { pool } = require('./src/config/database');
pool.query(
  `SELECT c.id, c.name, c.email, sp.key as plan_key, cs.status, cs.billing_cycle, cs.expires_at
   FROM emr_clinics c
   LEFT JOIN clinic_subscriptions cs ON cs.clinic_id = c.id
   LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
   WHERE c.email ILIKE '%adinath%' OR c.name ILIKE '%lovelish%' OR c.name ILIKE '%adinath%'`
).then(r => {
  console.log(JSON.stringify(r.rows, null, 2));
  pool.end();
}).catch(e => {
  console.error(e.message);
  pool.end();
});
