# Infer Sales Agent — Setup Guide

## 1. Install dependencies

```bash
cd d:/Infer/sales-agent
pip install -r requirements.txt
```

## 2. Fill in your .env

Edit `.env` and add:
- `ANTHROPIC_API_KEY` — get from https://console.anthropic.com
- `GOOGLE_SHEET_ID` — the ID from your Google Sheet URL
- `GOOGLE_CREDS_FILE` — path to your service account JSON (see step 4)

SMTP is already configured for support@inferapp.online.

## 3. Set up your Google Sheet

Create a sheet with these exact headers in row 1:

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| name | email | specialty | clinic | city | status | step | next_send_date | last_sent_date | notes |

- `status`: set to `new` for all new leads
- `step`: set to `0` for all new leads
- `next_send_date`: leave blank for new leads (agent will send immediately)

## 4. Set up Google Service Account

1. Go to https://console.cloud.google.com
2. Create a new project → Enable **Google Sheets API** and **Google Drive API**
3. Create a **Service Account** → Download JSON key → save as `google_creds.json` in this folder
4. Open your Google Sheet → Share it with the service account email (give Editor access)

## 5. Add leads to the sheet

Paste clinic leads from Apollo.io export (CSV) into the sheet.
Required columns: name, email, specialty, clinic, city.
Set status=`new`, step=`0` for each.

## 6. Run the agent

```bash
python agent.py
```

## 7. Schedule daily runs (Windows Task Scheduler)

- Program: `python`
- Arguments: `d:\Infer\sales-agent\agent.py`
- Start in: `d:\Infer\sales-agent`
- Trigger: Daily at 9:00 AM

Or on Linux/Mac cron:
```
0 9 * * * cd /path/to/sales-agent && python agent.py >> logs/agent.log 2>&1
```

## Sequence

| Step | Day | Email Goal |
|------|-----|------------|
| 1 | Day 1 | Intro + YouTube demo link |
| 4 | Day 4 | Specialty-specific feature highlight |
| 8 | Day 8 | Social proof + Calendly demo invite |
| 14 | Day 14 | Final follow-up, leave door open |

After step 14, the lead is marked `completed` and no more emails are sent.
If a lead replies, manually mark their status as `replied` in the sheet.
If a lead books a demo, mark as `booked`.
