# Sales Agent — Troubleshooting Guide

## Today's Issue: Header Duplication

**Error:** `gspread.exceptions.GSpreadException: the header row in the worksheet contains duplicates: ['whatsapp_message']`

**What happened:**
1. ✅ Agent successfully scraped **4,728 leads** from Google Maps
2. ❌ Agent crashed when importing to Google Sheet due to duplicate `whatsapp_message` column

---

## How to Fix

### Option 1: Automatic Fix (Recommended)
```bash
cd d:/Infer/sales-agent
python diagnose.py
```
This will:
- Show current headers vs expected headers
- Automatically remove duplicate columns
- Verify the sheet is ready

### Option 2: Manual Fix
1. Open your Google Sheet (from `GOOGLE_SHEET_ID` in `.env`)
2. Go to row 1 (headers)
3. Find the duplicate `whatsapp_message` column
4. **Delete the extra copy** (keep only one)
5. Verify columns are:
   ```
   A: name
   B: email
   C: specialty
   D: clinic
   E: city
   F: phone
   G: status
   H: step
   I: next_send_date
   J: last_sent_date
   K: notes
   L: whatsapp_log
   M: email_opened
   N: whatsapp_message
   ```

---

## After Fixing

Run the agent again to retry the import:
```bash
python agent.py
```

This will import all 4,728 leads into your sheet.

---

## Understanding Lead Status

Once imported, each lead will have:

| Column | Initial Value | Progress |
|--------|--------------|----------|
| status | `new` | new → active → replied/booked → completed |
| step | `0` | 0 → 1 → 4 → 8 → 14 (then done) |
| next_send_date | blank | Auto-set to Day 1, 4, 8, 14 |
| email_opened | blank | Set to `true` when email is opened |
| whatsapp_log | blank | Updated on Day 4 & 14 if email opened |

---

## Monitoring Conversions

After emails start sending (next daily run at 9 AM):

**Metrics to track:**
- **Email Send Rate:** How many emails go out each day (Max: 300/day)
- **Email Open Rate:** email_opened = true / sent
- **Reply Rate:** status = "replied" / total
- **Booking Rate:** status = "booked" / total
- **WhatsApp Engagement:** WhatsApp opens only on Day 4 if email was opened (higher intent)

---

## Sequence Timeline

| Step | Day | Email Goal | WhatsApp? |
|------|-----|-----------|-----------|
| 1 | Day 1 | Intro + YouTube demo | ❌ |
| 4 | Day 4 | Feature highlight | ✅ If opened |
| 8 | Day 8 | Social proof + demo invite | ❌ |
| 14 | Day 14 | Final follow-up | ✅ Always |

---

## Daily Run Schedule

The agent is configured to run at **9:00 AM daily** via Windows Task Scheduler.

Check it by:
1. Open Task Scheduler → Find "Infer Sales Agent"
2. Review last run time
3. Check `agent.log` for output

---

## Need More Help?

Check these files:
- `agent.py` — Main logic
- `modules/sheets.py` — Google Sheet operations
- `modules/personalizer.py` — AI email customization (Groq)
- `modules/mailer.py` — SMTP sending
- `modules/whatsapp.py` — WhatsApp integration
