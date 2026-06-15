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
from modules.sheets import import_leads, get_leads_due_today, update_lead, mark_failed, log_whatsapp, has_opened_email, mark_email_opened
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
    except Exception as e:
        print(f"  ⚠ Open sync failed: {e}")


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
        return 0

    print(f"  Quota: {quota_status()}")

    if not os.environ.get("GOOGLE_MAPS_API_KEY"):
        print("  ⚠ GOOGLE_MAPS_API_KEY not set in .env — skipping scrape.")
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
        return 0

    if not leads:
        print("  No new leads found.")
        _mark_scrape_done()
        return 0

    added = import_leads(leads)
    print(f"  Added {added} new leads to CRM (duplicates skipped).")
    _mark_scrape_done()
    return added


def send_summary_notification(total_leads: int):
    """Sends a daily summary email to Prateek before outreach starts."""
    from modules.mailer import send_email as _send
    _send(
        to_email="prateeksharmaand@gmail.com",
        subject=f"Infer Sales Agent — Starting outreach to {total_leads} leads today",
        body=f"""Hi Prateek,

The Infer Sales Agent is starting today's outreach run.

Leads due today: {total_leads}
Daily email cap: 300

You will see emails going out from support@inferapp.online shortly.

Check your Google Sheet for live updates.

— Infer Sales Agent""",
        clinic_name="",
        doctor_name="Prateek",
        specialty="",
        step=1,
    )
    print("  ✓ Summary notification sent to prateeksharmaand@gmail.com")


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

    if not leads:
        print("  Nothing to send.")
        return

    leads = phase_preflight(leads)

    # Send summary notification first
    send_summary_notification(len(leads))

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

            # WhatsApp on Day 4 — only if they opened the email
            # WhatsApp on Day 14 — always (final follow-up)
            if next_step == 4:
                if has_opened_email(lead):
                    wa_sent, wa_msg = send_whatsapp(lead, next_step)
                    if wa_sent:
                        log_whatsapp(row, next_step, wa_msg)
                else:
                    print(f"  ↷ WhatsApp skipped — {name} hasn't opened email yet")
            elif next_step == 14:
                wa_sent, wa_msg = send_whatsapp(lead, next_step)
                if wa_sent:
                    log_whatsapp(row, next_step, wa_msg)
        else:
            mark_failed(row)
            failed += 1

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


def run():
    print("\n╔══════════════════════════════════════╗")
    print("║     Infer Sales Agent — Running      ║")
    print("╚══════════════════════════════════════╝")

    sync_email_opens()
    phase_scrape()
    phase_outreach()

    print("\n╔══════════════════════════════════════╗")
    print("║          Agent complete ✓             ║")
    print("╚══════════════════════════════════════╝\n")


if __name__ == "__main__":
    run()
