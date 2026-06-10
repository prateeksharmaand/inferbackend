"""
Brevo SMTP sender with pre-send email validation.
Checks MX records + SMTP handshake before sending to prevent bounces.
Tracks bounced/invalid emails in bounce_log.json.
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

_BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DAILY_COUNT_FILE = os.path.join(_BASE, "daily_email_count.json")
BOUNCE_LOG_FILE  = os.path.join(_BASE, "bounce_log.json")

# SMTP_PROBE=false (default) — only MX check, fast (~200ms/domain, cached)
# SMTP_PROBE=true  — adds RCPT-TO handshake, slower (~5s/domain) but more accurate
# Set SMTP_PROBE=true in .env only if you want maximum accuracy and can afford the time
SMTP_PROBE = os.environ.get("SMTP_PROBE", "false").lower() == "true"


# ── Daily counter ─────────────────────────────────────────────────────────────

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


# ── Bounce log ────────────────────────────────────────────────────────────────

def _load_bounce_log() -> dict:
    if os.path.exists(BOUNCE_LOG_FILE):
        with open(BOUNCE_LOG_FILE) as f:
            return json.load(f)
    return {}


def _save_bounce_log(log: dict):
    with open(BOUNCE_LOG_FILE, "w") as f:
        json.dump(log, f, indent=2)


def mark_bounced(email: str, reason: str):
    """Record an email as bounced/invalid so we never retry it."""
    log = _load_bounce_log()
    log[email.lower().strip()] = {
        "reason": reason,
        "date": date.today().isoformat(),
    }
    _save_bounce_log(log)


def is_bounced(email: str) -> bool:
    """True if this email was previously bounced/rejected."""
    log = _load_bounce_log()
    return email.lower().strip() in log


def get_bounce_summary() -> dict:
    log = _load_bounce_log()
    from collections import Counter
    reasons = Counter(v["reason"] for v in log.values())
    return {"total": len(log), "by_reason": dict(reasons), "emails": log}


# ── Blocklist (competitor domains) ────────────────────────────────────────────

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


# ── Pre-send validation ───────────────────────────────────────────────────────

def _pre_validate(email: str) -> tuple[bool, str]:
    """
    Run format + MX + SMTP probe checks.
    Returns (ok, reason).
    Falls back gracefully if dnspython not installed.
    """
    try:
        from modules.email_validator import validate_email
        return validate_email(email, smtp_probe=SMTP_PROBE)
    except ImportError:
        # dnspython not installed — skip advanced checks
        import re
        if re.match(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$', email):
            return True, "ok"
        return False, "invalid"
    except Exception as e:
        # Never block sending due to validator errors
        print(f"  ⚠ Validator error for {email}: {e} — sending anyway")
        return True, "ok"


# ── Main send function ────────────────────────────────────────────────────────

def send_email(to_email: str, subject: str, body: str, clinic_name: str = "",
               doctor_name: str = "", specialty: str = "", step: int = 1) -> bool:
    """
    Validates email domain, then sends via Brevo SMTP.
    Logs bounces/invalids to bounce_log.json.
    Returns True on success, False on skip/failure.
    """
    to_email = to_email.strip()

    # 1. Blocklist check
    if is_blocked(to_email):
        print(f"  ⛔ Blocked: {to_email} — domain on blocklist")
        return False

    # 2. Previously bounced
    if is_bounced(to_email):
        log = _load_bounce_log()
        reason = log[to_email.lower()].get("reason", "bounced")
        print(f"  ⛔ Skipped: {to_email} — previously {reason}")
        return False

    # 3. Daily limit
    daily_count = _get_daily_count()
    if daily_count >= MAX_DAILY_EMAILS:
        print(f"  ⛔ Daily limit reached ({MAX_DAILY_EMAILS}/day). Stopping.")
        return False

    # 4. Pre-send validation (MX + SMTP probe)
    valid, reason = _pre_validate(to_email)
    if not valid:
        mark_bounced(to_email, reason)
        icon = {
            "no_mx":      "🔴",
            "invalid":    "🔴",
            "disposable": "🟡",
            "blocked":    "⛔",
            "bad_pattern":"🟡",
            "smtp_reject":"🔴",
        }.get(reason, "🟡")
        print(f"  {icon} Skipped: {to_email} — {reason} (logged to bounce_log)")
        return False

    # 5. Build and send
    lead_hash = generate_lead_hash(to_email)

    try:
        from modules.email_template import render
        html, plain = render(
            subject=subject, body_text=body, clinic_name=clinic_name,
            doctor_name=doctor_name, specialty=specialty, step=step,
            lead_hash=lead_hash,
        )
    except Exception as e:
        print(f"  ✗ Template error: {e}")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"{FROM_NAME} <{SMTP_FROM}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(html,  "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM, to_email, msg.as_bytes())

        count = _increment_daily_count()
        print(f"  ✓ Sent to {to_email} ({count}/{MAX_DAILY_EMAILS} today)")

        # Register for open tracking
        try:
            import requests as _req
            _req.post(
                "https://api.inferapp.online/api/track/register",
                json={"email": to_email, "clinic": clinic_name, "lead_hash": lead_hash},
                timeout=5,
            )
        except Exception:
            pass

        return True

    except smtplib.SMTPRecipientsRefused:
        mark_bounced(to_email, "smtp_reject")
        print(f"  🔴 Bounced: {to_email} — recipient refused (logged)")
        return False

    except smtplib.SMTPAuthenticationError as e:
        print(f"  ✗ SMTP auth failed — check SMTP_USER / SMTP_PASS in .env: {e}")
        return False

    except Exception as e:
        print(f"  ✗ Failed to send to {to_email}: {e}")
        return False
