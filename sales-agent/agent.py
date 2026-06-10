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
from dotenv import load_dotenv

load_dotenv()

from modules.scraper import scrape_leads, SPECIALTIES
from modules.sheets import import_leads, get_leads_due_today, update_lead, mark_failed, log_whatsapp
from modules.personalizer import personalize_email
from modules.mailer import send_email
from modules.scheduler import get_next_step, get_next_send_date, is_sequence_complete
from modules.quota import status as quota_status
from modules.whatsapp import send_whatsapp

MAX_EMAILS_PER_RUN   = int(os.environ.get("MAX_DAILY_EMAILS", 300))
DELAY_BETWEEN_EMAILS = int(os.environ.get("DELAY_BETWEEN_EMAILS", 30))
SCRAPE_CITIES        = os.environ.get("SCRAPE_CITIES", "Mumbai,Pune,Delhi,Bangalore").split(",")
MAX_PER_COMBO        = int(os.environ.get("MAX_PER_COMBO", 10))


def phase_scrape():
    print("\n── Phase 1: Scraping new leads (Google Maps) ────────")
    print(f"  Quota: {quota_status()}")

    if not os.environ.get("GOOGLE_MAPS_API_KEY"):
        print("  ⚠ GOOGLE_MAPS_API_KEY not set in .env — skipping scrape.")
        print("  Add it to .env to enable automatic lead discovery.")
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
        return 0

    added = import_leads(leads)
    print(f"  Added {added} new leads to CRM (duplicates skipped).")
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


def phase_outreach():
    print("\n── Phase 2: Email outreach ──────────────────────────")
    leads = get_leads_due_today()
    print(f"  {len(leads)} leads due today.\n")

    if not leads:
        print("  Nothing to send.")
        return

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

            # Also send WhatsApp on Day 4 and Day 14
            if next_step in (4, 14):
                wa_sent = send_whatsapp(lead, next_step)
                if wa_sent:
                    log_whatsapp(row, next_step)
        else:
            mark_failed(row)
            failed += 1

        if sent < len(leads):
            time.sleep(DELAY_BETWEEN_EMAILS)

    print(f"\n  Sent: {sent} | Skipped: {skipped} | Failed: {failed}")


def run():
    print("\n╔══════════════════════════════════════╗")
    print("║     Infer Sales Agent — Running      ║")
    print("╚══════════════════════════════════════╝")

    phase_scrape()
    phase_outreach()

    print("\n╔══════════════════════════════════════╗")
    print("║          Agent complete ✓             ║")
    print("╚══════════════════════════════════════╝\n")


if __name__ == "__main__":
    run()
