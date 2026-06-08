"""
Infer EMR — Agentic Sales Outreach Agent
-----------------------------------------
Runs daily. For each lead due today:
  1. Determines which sequence step to send
  2. Personalizes email via Claude
  3. Sends via Gmail
  4. Updates CRM (Google Sheets)

Run:  python agent.py
Cron: 0 9 * * * python /path/to/agent.py  (runs every day at 9am)
"""

import os
import sys
import time
from dotenv import load_dotenv

load_dotenv()

from modules.sheets import get_leads_due_today, update_lead
from modules.personalizer import personalize_email
from modules.mailer import send_email
from modules.scheduler import get_next_step, get_next_send_date, is_sequence_complete

# Safety cap — max emails per run to avoid Gmail limits
MAX_EMAILS_PER_RUN = int(os.environ.get("MAX_EMAILS_PER_RUN", 50))
DELAY_BETWEEN_EMAILS = int(os.environ.get("DELAY_BETWEEN_EMAILS", 30))  # seconds


def run():
    print("\n=== Infer Sales Agent — Starting ===\n")

    leads = get_leads_due_today()
    print(f"Found {len(leads)} leads due today.\n")

    if not leads:
        print("Nothing to do. Exiting.")
        return

    sent = 0
    skipped = 0
    failed = 0

    for lead in leads[:MAX_EMAILS_PER_RUN]:
        name = lead.get("name", "Doctor")
        email = lead.get("email", "").strip()
        current_step = int(lead.get("step", 0))
        row = lead["_row"]

        if not email:
            print(f"  ⚠ Skipping {name} — no email address.")
            skipped += 1
            continue

        if is_sequence_complete(current_step):
            print(f"  ⚠ Skipping {name} — sequence already complete.")
            skipped += 1
            continue

        next_step = get_next_step(current_step)
        if next_step is None:
            skipped += 1
            continue

        print(f"→ {name} ({lead.get('specialty', '?')}) | Step {next_step} | {email}")

        # Personalize via Claude
        try:
            email_content = personalize_email(lead, next_step)
        except Exception as e:
            print(f"  ✗ Personalization failed: {e}")
            failed += 1
            continue

        # Send email
        success = send_email(
            to_email=email,
            subject=email_content["subject"],
            body=email_content["body"]
        )

        if success:
            # Calculate next send date
            next_date = get_next_send_date(next_step)
            status = "active" if next_date else "completed"
            update_lead(
                row_index=row,
                step=next_step,
                next_send_date=next_date or "",
                status=status
            )
            sent += 1
        else:
            failed += 1

        # Delay to avoid rate limits
        if sent < len(leads):
            time.sleep(DELAY_BETWEEN_EMAILS)

    print(f"\n=== Done ===")
    print(f"  Sent:    {sent}")
    print(f"  Skipped: {skipped}")
    print(f"  Failed:  {failed}")
    print()


if __name__ == "__main__":
    run()
