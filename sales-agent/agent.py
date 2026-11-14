"""
Infer EMR — Agentic Sales Outreach Agent
-----------------------------------------
Runs daily. Each run:
  1. Scrapes clinic leads from Google Maps → imports to Google Sheets
  2. For each lead due today, determines sequence step
  3. Personalizes email via Groq (llama-3.3-70b)
  4. Sends via Hostinger SMTP
  5. Updates CRM in Google Sheets

Run:  ./venv/bin/python agent.py
Cron: 0 9 * * * cd /opt/infer/sales-agent && ./venv/bin/python agent.py >> agent.log 2>&1
"""

import os
import time
import random
from dotenv import load_dotenv

load_dotenv()

from modules.scraper import scrape_leads, SPECIALTIES
from modules.sheets import import_leads, get_leads_due_today, update_lead, mark_failed, log_whatsapp, has_opened_email, mark_email_opened, mark_replied_by_phone
from modules.personalizer import personalize_email
from modules.mailer import send_email
from modules.scheduler import get_next_step, get_next_send_date, is_sequence_complete
from modules.quota import status as quota_status
from modules.whatsapp import send_whatsapp

MAX_EMAILS_PER_RUN   = int(os.environ.get("MAX_DAILY_EMAILS", 300))
DELAY_MIN            = int(os.environ.get("DELAY_MIN", 45))    # min seconds between emails
DELAY_MAX            = int(os.environ.get("DELAY_MAX", 90))    # max seconds between emails
BURST_EVERY          = int(os.environ.get("BURST_EVERY", 10))  # longer pause every N emails
BURST_PAUSE          = int(os.environ.get("BURST_PAUSE", 180)) # seconds for burst pause (3 min)
SCRAPE_CITIES        = os.environ.get("SCRAPE_CITIES", "Mumbai,Pune,Delhi,Bangalore").split(",")
MAX_PER_COMBO        = int(os.environ.get("MAX_PER_COMBO", 10))
REPORT_EMAIL         = os.environ.get("REPORT_EMAIL", "support@inferapp.online")

# What this run did — emailed to REPORT_EMAIL at the end (see send_daily_report)
STATS = {
    "opens_synced": 0, "leads_added": 0, "scrape_note": "", "due": 0, "preflight_removed": 0,
    "sent": [], "skipped": 0, "failed": [], "whatsapp": [], "wa_replies": [], "warnings": [],
}


class _Tee:
    """Copies everything printed into a buffer so the full run log can be attached to the report."""
    def __init__(self, stream):
        import io
        self.stream, self.buf = stream, io.StringIO()
    def write(self, data):
        self.stream.write(data); self.buf.write(data)
    def flush(self):
        self.stream.flush()


def sync_email_opens():
    """
    Syncs email open status from backend DB to Google Sheet.
    Checks sales_leads table for any newly opened emails.
    """
    print("\n── Phase 0: Syncing email opens ─────────────────────")
    try:
        import requests
        resp = requests.get(
            "https://api.inferapp.online/api/track/opened-leads",
            timeout=10
        )
        if resp.status_code != 200:
            print(f"  ⚠ Sync skipped: {resp.status_code}")
            return

        opened = resp.json().get("opened", [])
        if not opened:
            print("  No new email opens.")
            return

        from modules.sheets import _get_sheet
        sheet = _get_sheet()
        records = sheet.get_all_records()

        count = 0
        for i, row in enumerate(records, start=2):
            email = str(row.get("email", "")).strip().lower()
            if email in opened and not has_opened_email(row):
                mark_email_opened(i)
                count += 1

        print(f"  ✓ Marked {count} leads as email opened")
        STATS["opens_synced"] = count
    except Exception as e:
        print(f"  ⚠ Open sync failed: {e}")
        STATS["warnings"].append(f"Email-open sync failed: {e}")


BACKEND_URL = os.environ.get("BACKEND_URL", "https://api.inferapp.online")

SCRAPE_DONE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scrape_done.json")


def _scrape_done_today() -> bool:
    import json as _j
    from datetime import date as _d
    today = _d.today().isoformat()
    if os.path.exists(SCRAPE_DONE_FILE):
        data = _j.load(open(SCRAPE_DONE_FILE))
        return data.get("date") == today
    return False


def _mark_scrape_done():
    import json as _j
    from datetime import date as _d
    with open(SCRAPE_DONE_FILE, "w") as f:
        _j.dump({"date": _d.today().isoformat()}, f)


def phase_scrape():
    print("\n── Phase 1: Scraping new leads (Google Maps) ────────")

    if _scrape_done_today():
        print("  ✓ Scraping already completed today — skipping to outreach.")
        STATS["scrape_note"] = "already done earlier today"
        return 0

    print(f"  Quota: {quota_status()}")

    if not os.environ.get("GOOGLE_MAPS_API_KEY"):
        print("  ⚠ GOOGLE_MAPS_API_KEY not set in .env — skipping scrape.")
        STATS["scrape_note"] = "skipped — GOOGLE_MAPS_API_KEY not set"
        STATS["warnings"].append("No new leads: GOOGLE_MAPS_API_KEY is not set on the server.")
        _mark_scrape_done()
        return 0

    cities = [c.strip() for c in SCRAPE_CITIES if c.strip()]

    try:
        leads = scrape_leads(
            cities=cities,
            specialties=SPECIALTIES,
            max_per_combo=MAX_PER_COMBO,
        )
    except Exception as e:
        print(f"  ⚠ Scraper error: {e}")
        STATS["warnings"].append(f"Lead scraping failed: {e}")
        return 0

    if not leads:
        print("  No new leads found.")
        _mark_scrape_done()
        return 0

    added = import_leads(leads)
    print(f"  Added {added} new leads to CRM (duplicates skipped).")
    STATS["leads_added"] = added
    STATS["scrape_note"] = f"{len(leads)} found in {', '.join(cities)}"
    _mark_scrape_done()
    return added


def phase_preflight(leads: list) -> list:
    """
    Batch-validate all lead emails before outreach.
    Removes invalid/dead emails and logs them to bounce_log so they're never retried.
    Uses SMTP probe for maximum accuracy.
    """
    from modules.email_validator import validate_batch
    from modules.mailer import mark_bounced, is_bounced

    print("\n── Phase 1.5: Pre-flight email validation ───────────")
    emails = [
        str(lead.get("email", "")).strip()
        for lead in leads
        if lead.get("email") and not is_bounced(str(lead.get("email", "")).strip())
    ]

    if not emails:
        print("  All emails already in bounce log or missing — nothing to validate.")
        return leads

    print(f"  Validating {len(emails)} emails (smtp_probe=True)…")
    results = validate_batch(emails, smtp_probe=True, max_workers=8)

    rejected = 0
    for email, (valid, reason) in results.items():
        if not valid:
            mark_bounced(email, reason)
            rejected += 1

    print(f"  Pre-flight: {rejected} emails removed before sending.")
    STATS["preflight_removed"] = rejected

    # Filter leads to only those that passed
    valid_leads = [
        lead for lead in leads
        if not lead.get("email") or not is_bounced(str(lead.get("email", "")).strip())
    ]
    return valid_leads


def phase_outreach():
    print("\n── Phase 2: Email outreach ──────────────────────────")
    leads = get_leads_due_today()
    print(f"  {len(leads)} leads due today.\n")
    STATS["due"] = len(leads)

    if not leads:
        print("  Nothing to send.")
        return

    leads = phase_preflight(leads)

    sent = skipped = failed = 0

    for lead in leads[:MAX_EMAILS_PER_RUN]:
        name  = lead.get("name") or lead.get("clinic") or "Doctor"
        email = str(lead.get("email", "")).strip()
        step  = int(lead.get("step", 0))
        row   = lead["_row"]

        if not email:
            print(f"  ⚠ Skipping {name} — no email.")
            skipped += 1
            continue

        if is_sequence_complete(step):
            skipped += 1
            continue

        next_step = get_next_step(step)
        if next_step is None:
            skipped += 1
            continue

        print(f"→ {name} ({lead.get('specialty', '?')}) | Step {next_step} | {email}")

        try:
            content = personalize_email(lead, next_step)
        except Exception as e:
            print(f"  ✗ Personalization error: {e}")
            failed += 1
            STATS["failed"].append({"name": name, "email": email, "step": next_step, "reason": f"personalisation: {e}"})
            continue

        success = send_email(
            to_email=email,
            subject=content["subject"],
            body=content["body"],
            clinic_name=lead.get("clinic", ""),
            doctor_name=lead.get("name", ""),
            specialty=lead.get("specialty", ""),
            step=next_step,
        )

        if success:
            next_date = get_next_send_date(next_step)
            status = "active" if next_date else "completed"
            update_lead(row_index=row, step=next_step, next_send_date=next_date or "", status=status)
            sent += 1
            STATS["sent"].append({"name": name, "clinic": lead.get("clinic", ""), "city": lead.get("city", ""),
                                  "specialty": lead.get("specialty", ""), "email": email, "step": next_step,
                                  "subject": content["subject"], "next": next_date or "sequence complete"})

            # WhatsApp on Day 14 — only if they opened the email
            if next_step == 14:
                if has_opened_email(lead):
                    wa_sent, wa_msg = send_whatsapp(lead, next_step)
                    if wa_sent:
                        log_whatsapp(row, next_step, wa_msg)
                        STATS["whatsapp"].append({"name": name, "phone": lead.get("phone", ""), "step": next_step})
                else:
                    print(f"  ↷ WhatsApp skipped — {name} hasn't opened email yet")
        else:
            mark_failed(row)
            failed += 1
            STATS["failed"].append({"name": name, "email": email, "step": next_step, "reason": "not sent (bounced, blocked, invalid or SMTP error — see log)"})

        if sent < len(leads):
            # Burst pause every BURST_EVERY emails — mimics human behaviour
            if sent % BURST_EVERY == 0 and sent > 0:
                print(f"  ⏸  Burst pause ({BURST_PAUSE}s) after {sent} emails…")
                time.sleep(BURST_PAUSE)
            else:
                # Randomised delay — avoids pattern detection by spam filters
                delay = random.randint(DELAY_MIN, DELAY_MAX)
                print(f"  ⏳ Next email in {delay}s…")
                time.sleep(delay)

    print(f"\n  Sent: {sent} | Skipped: {skipped} | Failed: {failed}")
    STATS["skipped"] = skipped


def sync_wa_replies():
    """
    Phase 3: Fetch inbound WhatsApp replies from backend DB, match to leads in
    Google Sheet by phone number, mark them as replied, then ack so they're not
    re-processed next run.
    """
    print("\n── Phase 3: Syncing WhatsApp replies ────────────────")
    try:
        import requests as _req
        resp = _req.get(f"{BACKEND_URL}/api/sales/wa/inbox", timeout=10)
        if resp.status_code != 200:
            print(f"  ⚠ WA inbox fetch failed: {resp.status_code}")
            return

        messages = resp.json().get("messages", [])
        if not messages:
            print("  No new WhatsApp replies.")
            return

        print(f"  {len(messages)} unsynced replies to process.")
        ack_ids = []

        for msg in messages:
            from_number = msg["from_number"]
            body        = msg.get("body", "")
            matched     = mark_replied_by_phone(
                from_number,
                note=f"WhatsApp reply: \"{body[:120]}\""
            )
            STATS["wa_replies"].append({"from": from_number, "text": body[:160], "matched": bool(matched)})
            if matched:
                print(f"  ✓ Marked replied: {from_number} — \"{body[:60]}\"")
            else:
                print(f"  ↷ No lead found for {from_number}")
            ack_ids.append(msg["id"])

        # Ack all processed messages regardless of match — prevents re-processing
        ack_resp = _req.post(
            f"{BACKEND_URL}/api/sales/wa/inbox/ack",
            json={"ids": ack_ids},
            timeout=10,
        )
        if ack_resp.status_code == 200:
            print(f"  ✓ Acked {len(ack_ids)} messages.")
        else:
            print(f"  ⚠ Ack failed: {ack_resp.status_code}")

    except Exception as e:
        print(f"  ⚠ WA reply sync error: {e}")
        STATS["warnings"].append(f"WhatsApp reply sync failed: {e}")


def pipeline_snapshot() -> dict:
    """Lead counts by status from the CRM sheet (for the report)."""
    try:
        from modules.sheets import _get_sheet
        from collections import Counter
        rows = _get_sheet().get_all_records()
        c = Counter(str(r.get("status") or "new").strip().lower() or "new" for r in rows)
        return {"total": len(rows), **dict(c)}
    except Exception as e:
        STATS["warnings"].append(f"Could not read the lead sheet for totals: {e}")
        return {}


def send_daily_report(started, finished, crashed=None, log_text=""):
    """Email today's complete work to REPORT_EMAIL."""
    from html import escape as esc
    from modules.mailer import send_plain
    S = STATS
    mins = int((finished - started).total_seconds() // 60)
    pipe = pipeline_snapshot()
    status_line = "Run FAILED" if crashed else "Run complete"
    card = lambda label, value: (f'<td style="padding:10px 14px;background:#f1f5f9;border-radius:8px;text-align:center">'
                                 f'<div style="font-size:22px;font-weight:700;color:#0f3d6e">{value}</div>'
                                 f'<div style="font-size:11px;color:#64748b">{label}</div></td>')
    rows = "".join(
        f"<tr><td>{esc(x['name'])}</td><td>{esc(x['clinic'])}</td><td>{esc(x['city'])}</td><td>{esc(x['specialty'])}</td>"
        f"<td>{esc(x['email'])}</td><td style='text-align:center'>{x['step']}</td><td>{esc(x['subject'])}</td><td>{esc(str(x['next']))}</td></tr>"
        for x in S["sent"]) or '<tr><td colspan="8" style="color:#64748b">No emails sent today.</td></tr>'
    failed = "".join(f"<li>{esc(x['name'])} &lt;{esc(x['email'])}&gt; — step {x['step']}: {esc(x['reason'])}</li>" for x in S["failed"])
    wa = "".join(f"<li>{esc(x['name'])} ({esc(str(x['phone']))}) — step {x['step']}</li>" for x in S["whatsapp"])
    replies = "".join(f"<li>{esc(x['from'])}{'' if x['matched'] else ' (no matching lead)'}: “{esc(x['text'])}”</li>" for x in S["wa_replies"])
    warns = "".join(f"<li>{esc(w)}</li>" for w in S["warnings"])
    pipe_txt = " · ".join(f"{k}: {v}" for k, v in pipe.items()) if pipe else "unavailable"
    th = 'style="text-align:left;background:#0f3d6e;color:#fff;padding:6px 8px;font-size:12px"'
    html = f"""<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:900px">
  <h2 style="margin:0 0 4px;color:#0f3d6e">Infer Sales Agent — {started:%d %b %Y}</h2>
  <p style="margin:0 0 14px;color:{'#b91c1c' if crashed else '#047857'};font-weight:700">{status_line}
     <span style="color:#64748b;font-weight:400">· {started:%I:%M %p} – {finished:%I:%M %p} ({mins} min)</span></p>
  {f'<p style="background:#fee2e2;padding:10px;border-radius:8px"><b>Error:</b> {esc(str(crashed))}</p>' if crashed else ''}
  <table cellspacing="8" style="margin:0 -8px 10px"><tr>
    {card("Emails sent", len(S["sent"]))}{card("Leads due", S["due"])}{card("Failed", len(S["failed"]))}
    {card("Skipped", S["skipped"])}{card("New leads", S["leads_added"])}{card("WhatsApp sent", len(S["whatsapp"]))}
    {card("WA replies", len(S["wa_replies"]))}{card("Opens synced", S["opens_synced"])}</tr></table>
  <p style="font-size:13px"><b>Lead search:</b> {esc(S["scrape_note"] or "—")} &nbsp;|&nbsp;
     <b>Removed by email check:</b> {S["preflight_removed"]} &nbsp;|&nbsp; <b>Lead list:</b> {esc(pipe_txt)}</p>
  <h3 style="margin:18px 0 6px">Emails sent ({len(S["sent"])})</h3>
  <table cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-size:12px;width:100%" border="1" bordercolor="#e5e7eb">
    <tr><th {th}>Doctor</th><th {th}>Clinic</th><th {th}>City</th><th {th}>Specialty</th><th {th}>Email</th><th {th}>Step</th><th {th}>Subject</th><th {th}>Next email</th></tr>
    {rows}</table>
  {f'<h3 style="margin:18px 0 6px;color:#b91c1c">Not sent ({len(S["failed"])})</h3><ul style="font-size:12px">{failed}</ul>' if failed else ''}
  {f'<h3 style="margin:18px 0 6px">WhatsApp sent</h3><ul style="font-size:12px">{wa}</ul>' if wa else ''}
  {f'<h3 style="margin:18px 0 6px">WhatsApp replies</h3><ul style="font-size:12px">{replies}</ul>' if replies else ''}
  {f'<h3 style="margin:18px 0 6px;color:#b45309">Warnings</h3><ul style="font-size:12px">{warns}</ul>' if warns else ''}
  <p style="font-size:11px;color:#94a3b8;margin-top:20px">Full run log attached. Replies to sales emails arrive in {esc(os.environ.get("SMTP_FROM", "support@inferapp.online"))}; mark them as replied/booked/unsubscribed in the lead sheet.</p>
</div>"""
    text = (f"{status_line} {started:%d %b %Y}: sent {len(S['sent'])}, failed {len(S['failed'])}, skipped {S['skipped']}, "
            f"new leads {S['leads_added']}, WhatsApp {len(S['whatsapp'])}, replies {len(S['wa_replies'])}.")
    subject = (f"Sales agent {started:%d %b}: {len(S['sent'])} emails sent, {S['leads_added']} new leads"
               + (" — FAILED" if crashed else ""))
    send_plain(REPORT_EMAIL, subject, html, text, attachments=[(f"sales-agent-{started:%Y-%m-%d}.log", log_text)])
    print(f"  ✓ Daily report emailed to {REPORT_EMAIL}")


def run():
    import sys
    import traceback
    from datetime import datetime
    tee = _Tee(sys.stdout)
    sys.stdout = tee
    started = datetime.now()
    crashed = None
    print("\n╔══════════════════════════════════════╗")
    print("║     Infer Sales Agent — Running      ║")
    print("╚══════════════════════════════════════╝")
    try:
        sync_email_opens()
        phase_scrape()
        phase_outreach()
        sync_wa_replies()
        print("\n╔══════════════════════════════════════╗")
        print("║          Agent complete ✓             ║")
        print("╚══════════════════════════════════════╝\n")
    except Exception as e:
        crashed = e
        traceback.print_exc(file=sys.stdout)   # into the attached log too
    finally:
        sys.stdout = tee.stream
        try:
            send_daily_report(started, datetime.now(), crashed, tee.buf.getvalue())
        except Exception as e:
            print(f"  ✗ Could not email the daily report: {e}")
    if crashed:
        raise SystemExit(1)


if __name__ == "__main__":
    run()
