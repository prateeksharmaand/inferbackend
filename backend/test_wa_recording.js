/**
 * test_wa_recording.js
 *
 * Tests the full WhatsApp message recording pipeline:
 *   1. OUTBOUND  — sends a real WhatsApp text to 9650269758 via Meta Cloud API
 *   2. INBOUND   — simulates Meta webhook POST (inbound message from 9650269758)
 *   3. STATUS    — simulates Meta webhook POST (delivered + read status updates)
 *   4. DB CHECK  — queries whatsapp_messages table and prints all rows for the number
 *
 * Usage:
 *   node test_wa_recording.js
 *
 * Requires: backend .env loaded (WHATSAPP_ACCESS_TOKEN, WA_PHONE_NUMBER_ID or WHATSAPP_PHONE_NUMBER_ID)
 */

require('dotenv').config();
const axios  = require('axios');
const { pool } = require('./src/config/database');

const BACKEND_URL     = process.env.BACKEND_URL || 'https://api.inferapp.online';
const ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
const TEST_NUMBER     = '919650269758';   // your number in E.164 without +
const GRAPH_URL       = 'https://graph.facebook.com/v19.0';

function log(label, data) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${label}`);
  console.log('─'.repeat(50));
  if (data) console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

// ── 1. OUTBOUND: send a real message via Meta API ────────────────────────────
async function testOutbound() {
  log('STEP 1 — Sending outbound WhatsApp to +919650269758');

  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    console.log('  ⚠ WHATSAPP_ACCESS_TOKEN or WA_PHONE_NUMBER_ID not set — skipping real send.');
    console.log('  ℹ  Set these in backend/.env to test live sending.');
    return null;
  }

  const body = 'Hello! This is a test message from the Infer backend to verify WhatsApp message recording. Please ignore. 🙏';

  try {
    const { data } = await axios.post(
      `${GRAPH_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                TEST_NUMBER,
        type:              'text',
        text:              { body, preview_url: false },
      },
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    const wamid = data?.messages?.[0]?.id;
    console.log(`  ✓ Sent. WAMID: ${wamid}`);
    return wamid;
  } catch (err) {
    console.log('  ✗ Failed:', err.response?.data || err.message);
    return null;
  }
}

// ── 2. INBOUND: simulate Meta webhook for an inbound message ─────────────────
async function testInboundWebhook() {
  log('STEP 2 — Simulating inbound webhook (message FROM 9650269758)');

  const fakePayload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'TEST_WABA_ID',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '919XXXXXXXXX',
            phone_number_id:      PHONE_NUMBER_ID || 'TEST_PHONE_ID',
          },
          contacts: [{
            profile: { name: 'Prateek Sharma' },
            wa_id:   TEST_NUMBER,
          }],
          messages: [{
            id:        `wamid.TEST_INBOUND_${Date.now()}`,
            from:      TEST_NUMBER,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type:      'text',
            text:      { body: 'Hi, I want to book an appointment for tomorrow morning.' },
          }],
        },
        field: 'messages',
      }],
    }],
  };

  try {
    // Post directly to the webhook endpoint (signature check will be skipped if no APP_SECRET set)
    const resp = await axios.post(`${BACKEND_URL}/webhook/whatsapp`, fakePayload, {
      headers: { 'Content-Type': 'application/json' },
    });
    console.log(`  ✓ Webhook accepted (HTTP ${resp.status})`);
  } catch (err) {
    console.log('  ✗ Webhook call failed:', err.response?.status, err.message);
  }
}

// ── 3. STATUS: simulate delivered + read callbacks ───────────────────────────
async function testStatusWebhook(wamid) {
  const id = wamid || `wamid.TEST_OUT_${Date.now()}`;

  for (const status of ['delivered', 'read']) {
    log(`STEP 3 — Simulating status update: ${status} for ${id}`);

    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'TEST_WABA_ID',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '919XXXXXXXXX', phone_number_id: PHONE_NUMBER_ID || 'TEST_PHONE_ID' },
            statuses: [{
              id:           id,
              status:       status,
              timestamp:    String(Math.floor(Date.now() / 1000)),
              recipient_id: TEST_NUMBER,
            }],
          },
          field: 'messages',
        }],
      }],
    };

    try {
      const resp = await axios.post(`${BACKEND_URL}/webhook/whatsapp`, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      console.log(`  ✓ Status '${status}' accepted (HTTP ${resp.status})`);
    } catch (err) {
      console.log(`  ✗ Failed: ${err.response?.status} ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }
}

// ── 4. DB CHECK: query and print recorded rows ────────────────────────────────
async function checkDatabase() {
  log('STEP 4 — Querying whatsapp_messages table');

  try {
    const { rows } = await pool.query(`
      SELECT id, direction, wamid, from_number, to_number,
             message_type, body, sender_name, delivery_status,
             delivered_at, read_at, created_at
      FROM   whatsapp_messages
      WHERE  from_number LIKE '%9650269758%'
          OR to_number   LIKE '%9650269758%'
      ORDER  BY created_at DESC
      LIMIT  10
    `);

    if (!rows.length) {
      console.log('  ⚠ No rows found yet. Webhook may still be processing — wait 2s and re-run STEP 4.');
    } else {
      console.log(`  ✓ Found ${rows.length} row(s):\n`);
      rows.forEach((r, i) => {
        console.log(`  [${i + 1}] ${r.direction.toUpperCase()} | ${r.message_type} | status: ${r.delivery_status}`);
        console.log(`       from: ${r.from_number}  →  to: ${r.to_number}`);
        console.log(`       body: "${(r.body || '').slice(0, 80)}"`);
        console.log(`       wamid: ${r.wamid}`);
        console.log(`       created: ${r.created_at}`);
        console.log();
      });
    }
  } catch (err) {
    console.log('  ✗ DB query failed:', err.message);
    console.log('  ℹ  Make sure the DB is running and migration 035 has been applied (npm run migrate).');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   WhatsApp Message Recording — Test Suite        ║');
  console.log('╚══════════════════════════════════════════════════╝');

  const sentWamid = await testOutbound();
  await new Promise(r => setTimeout(r, 1000));

  await testInboundWebhook();
  await new Promise(r => setTimeout(r, 1000));

  await testStatusWebhook(sentWamid);
  await new Promise(r => setTimeout(r, 1500));

  await checkDatabase();

  await pool.end();
  console.log('\n✓ Test complete.\n');
})();
