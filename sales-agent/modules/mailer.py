"""
Hostinger SMTP sender module.
Sends email via SMTP and saves a copy to Sent folder via IMAP.
"""

import smtplib
import os
import json
import time
from datetime import date
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp-relay.brevo.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
SMTP_USER = os.environ.get("SMTP_USER", "ae2c1b001@smtp-brevo.com")
SMTP_PASS = os.environ.get("SMTP_PASS", "GPa1qL6UYHIWjF7d")
SMTP_FROM = os.environ.get("SMTP_FROM", "support@inferapp.online")
FROM_NAME = os.environ.get("FROM_NAME", "Infer EMR")


MAX_DAILY_EMAILS = int(os.environ.get("MAX_DAILY_EMAILS", 300))
DAILY_COUNT_FILE = os.path.join(os.path.dirname(__file__), "..", "daily_email_count.json")


def _get_daily_count() -> int:
    today = date.today().isoformat()
    if os.path.exists(DAILY_COUNT_FILE):
        with open(DAILY_COUNT_FILE) as f:
            data = json.load(f)
        if data.get("date") == today:
            return data.get("count", 0)
    return 0


def _increment_daily_count():
    today = date.today().isoformat()
    count = _get_daily_count() + 1
    with open(DAILY_COUNT_FILE, "w") as f:
        json.dump({"date": today, "count": count}, f)
    return count




# Domains and emails to never send to
BLOCKLIST = [
    "eka.care", "practo.com", "lybrate.com", "justdial.com",
    "1mg.com", "apollo247.com", "medanta.org", "fortishealthcare.com",
    "manipalhospitals.com", "maxhealthcare.in", "narayanahealth.org",
]


def is_blocked(email: str) -> bool:
    email = email.lower().strip()
    for domain in BLOCKLIST:
        if domain in email:
            return True
    return False


def generate_lead_hash(email: str) -> str:
    import hashlib
    return hashlib.sha256(email.lower().encode()).hexdigest()[:32]


def send_email(to_email: str, subject: str, body: str, clinic_name: str = "",
               doctor_name: str = "", specialty: str = "", step: int = 1) -> bool:
    """
    Sends branded HTML email via Hostinger SMTP.
    Saves copy to Sent folder via IMAP.
    Returns True on success, False on failure.
    """
    if is_blocked(to_email):
        print(f"  ⛔ Blocked: {to_email} — domain is on blocklist")
        return False

    # Check daily limit
    daily_count = _get_daily_count()
    if daily_count >= MAX_DAILY_EMAILS:
        print(f"  ⛔ Daily email limit reached ({MAX_DAILY_EMAILS}/day). Stopping.")
        return False

    lead_hash = generate_lead_hash(to_email)

    from modules.email_template import render
    html, plain = render(subject=subject, body_text=body, clinic_name=clinic_name,
                         doctor_name=doctor_name, specialty=specialty, step=step,
                         lead_hash=lead_hash)

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{FROM_NAME} <{SMTP_FROM}>"
        msg["To"] = to_email
        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(html, "html"))

        msg_bytes = msg.as_bytes()

        # Send via Brevo SMTP (port 587 STARTTLS)
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM, to_email, msg_bytes)

        count = _increment_daily_count()
        print(f"  ✓ Sent to {to_email} ({count}/{MAX_DAILY_EMAILS} today)")

        # Register lead for open tracking
        try:
            import requests as _req
            _req.post(
                "https://api.inferapp.online/api/track/register",
                json={"email": to_email, "clinic": clinic_name, "lead_hash": lead_hash},
                timeout=5
            )
        except Exception:
            pass


        return True

    except Exception as e:
        print(f"  ✗ Failed to send to {to_email}: {e}")
        return False
