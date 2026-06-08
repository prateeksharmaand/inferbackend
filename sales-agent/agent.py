"""
Infer EMR — Agentic Sales Outreach Agent
-----------------------------------------
Runs daily. Each run:
  1. Scrapes new clinic leads from Google Maps → imports to Google Sheets
  2. For each lead due today, determines sequence step
  3. Personalizes email via Groq (llama-3.3-70b)
  4. Sends via Hostinger SMTP
  5. Updates CRM in Google Sheets

Run:  python agent.py
Cron: 0 9 * * * cd /path/to/sales-agent && ./venv/bin/python agent.py >> agent.log 2>&1
"""

import os
import time
from dotenv import load_dotenv

load_dotenv()

from modules.scraper import scrape_leads, CITIES, SPECIALTIES
from modules.sheets import import_leads, get_leads_due_today, update_lead
from modules.personalizer import personalize_email
from modules.mailer import send_email
from modules.scheduler import get_next_step, get_next_send_date, is_sequence_complete

MAX_EMAILS_PER_RUN   = int(os.environ.get("MAX_EMAILS_PER_RUN", 50))
DELAY_BETWEEN_EMAILS = int(os.environ.get("DELAY_BETWEEN_EMAILS", 30))
SCRAPE_CITIES        = os.environ.get("SCRAPE_CITIES", "Mumbai,Pune,Delhi,Bangalore").split(",")
MAX_PER_COMBO        = int(os.environ.get("MAX_PER_COMBO", 10))


def phase_scrape():
    print("\n── Phase 1: Scraping new leads ──────────────────────")
    cities = [c.strip() for c in SCRAPE_CITIES if c.strip()]
    leads = scrape_leads(cities=cities, specialties=SPECIALTIES, max_per_combo=MAX_PER_COMBO)
    if not leads:
        print("  No new leads found from Maps.")
        return 0
    added = import_leads(leads)
    print(f"  Added {added} new leads to CRM (duplicates skipped).")
    return added


def phase_outreach():
    print("\n── Phase 2: Email outreach ──────────────────────────")
    leads = get_leads_due_today()
    print(f"  {len(leads)} leads due today.\n")

    if not leads:
        print("  Nothing to send. Done.")
        return

    sent = skipped = failed = 0

    for lead in leads[:MAX_EMAILS_PER_RUN]:
        name    = lead.get("name") or lead.get("clinic") or "Doctor"
        email   = str(lead.get("email", "")).strip()
        step    = int(lead.get("step", 0))
        row     = lead["_row"]

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

        success = send_email(to_email=email, subject=content["subject"], body=content["body"])

        if success:
            next_date = get_next_send_date(next_step)
            status = "active" if next_date else "completed"
            update_lead(row_index=row, step=next_step, next_send_date=next_date or "", status=status)
            sent += 1
        else:
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
    print("║            Agent complete ✓           ║")
    print("╚══════════════════════════════════════╝\n")


if __name__ == "__main__":
    run()
