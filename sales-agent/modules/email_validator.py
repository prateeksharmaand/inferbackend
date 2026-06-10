"""
Email validation before sending — prevents bounces by checking:
1. Basic format/syntax
2. Disposable email domains
3. DNS MX record lookup (domain has mail server)
4. SMTP RCPT-TO handshake (mailbox likely exists)
5. Known bad-pattern detection (no-reply, test@, etc.)

Result codes:
  "ok"           — safe to send
  "invalid"      — bad format or obvious junk
  "no_mx"        — domain has no mail servers (will definitely bounce)
  "disposable"   — throwaway email service
  "blocked"      — on sales blocklist
  "bad_pattern"  — no-reply, donotreply, test, etc.
  "smtp_reject"  — recipient rejected by their mail server (550/551/553)
  "smtp_unknown" — SMTP check inconclusive (many servers block RCPT probes)
"""

import re
import socket
import smtplib
import dns.resolver          # pip install dnspython
from functools import lru_cache
from typing import Tuple

# ── Format regex ─────────────────────────────────────────────────────────────
EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')

# ── Disposable / throwaway email domains ─────────────────────────────────────
DISPOSABLE_DOMAINS = {
    "mailinator.com","guerrillamail.com","10minutemail.com","tempmail.com",
    "throwam.com","yopmail.com","trashmail.com","fakeinbox.com","maildrop.cc",
    "dispostable.com","spamgourmet.com","sharklasers.com","guerrillamailblock.com",
    "grr.la","guerrillamail.info","guerrillamail.biz","guerrillamail.de",
    "spam4.me","tempinbox.com","tempr.email","discard.email","mailnull.com",
    "spamspot.com","spamfree24.org","mailexpire.com","anonaddy.com",
}

# ── Bad sender patterns (unlikely to be read) ────────────────────────────────
BAD_PATTERNS = re.compile(
    r'^(no.?reply|donotreply|noreply|do.not.reply|bounce|mailer.daemon|'
    r'postmaster|abuse|spam|test@|info123|admin123|example|'
    r'webmaster@example|user@example)',
    re.IGNORECASE
)

# ── Sales blocklist (competitor / enterprise / free mail domains) ─────────────
SALES_BLOCKLIST = {
    # Competitors
    "eka.care","practo.com","lybrate.com","justdial.com","1mg.com",
    "apollo247.com","medanta.org","fortishealthcare.com",
    "manipalhospitals.com","maxhealthcare.in","narayanahealth.org",
    # Free mail (not clinic-owned domains — won't convert)
    "gmail.com","yahoo.com","yahoo.co.in","yahoo.in",
    "hotmail.com","outlook.com","outlook.in",
    "rediffmail.com","rediff.com",
    "icloud.com","me.com","mac.com",
    "live.com","live.in","msn.com",
}


def _extract_domain(email: str) -> str:
    return email.strip().lower().split("@")[-1]


@lru_cache(maxsize=512)
def _get_mx(domain: str):
    """Returns sorted list of MX hostnames, or empty list if none."""
    try:
        records = dns.resolver.resolve(domain, "MX", lifetime=5)
        return sorted(records, key=lambda r: r.preference)
    except Exception:
        return []


def check_mx(domain: str) -> bool:
    """True if domain has at least one MX record."""
    return len(_get_mx(domain)) > 0


def smtp_check(email: str, domain: str, from_addr: str = "check@inferapp.online") -> str:
    """
    Attempt SMTP RCPT TO check against the recipient's mail server.
    Returns: "ok" | "rejected" | "unknown"
    Many servers block this probe — treat "unknown" as safe to send.
    """
    mx_records = _get_mx(domain)
    if not mx_records:
        return "no_mx"

    mx_host = str(mx_records[0].exchange).rstrip(".")

    try:
        with smtplib.SMTP(timeout=8) as s:
            s.connect(mx_host, 25)
            s.ehlo("inferapp.online")
            code, _ = s.mail(from_addr)
            if code not in (250, 251):
                return "unknown"
            code, msg = s.rcpt(email)
            s.quit()
            if code in (250, 251):
                return "ok"
            if code in (550, 551, 552, 553, 554):
                return "rejected"
            return "unknown"   # 4xx greylist or probe-blocking
    except (socket.timeout, socket.error, smtplib.SMTPException):
        return "unknown"   # server blocked probe — not a hard reject


# ── Master validate function ──────────────────────────────────────────────────

def validate_email(email: str, smtp_probe: bool = True) -> Tuple[bool, str]:
    """
    Returns (is_valid, reason_code).
    safe_to_send = is_valid is True.
    """
    email = email.strip().lower()

    # 1. Format
    if not EMAIL_RE.match(email):
        return False, "invalid"

    domain = _extract_domain(email)
    local  = email.split("@")[0]

    # 2. Disposable
    if domain in DISPOSABLE_DOMAINS:
        return False, "disposable"

    # 3. Sales blocklist
    if domain in SALES_BLOCKLIST:
        return False, "blocked"

    # 4. Bad patterns
    if BAD_PATTERNS.match(local):
        return False, "bad_pattern"

    # 5. MX check (required)
    if not check_mx(domain):
        return False, "no_mx"

    # 6. SMTP probe
    if smtp_probe:
        result = smtp_check(email, domain)
        if result == "no_mx":
            return False, "no_mx"
        if result == "rejected":
            return False, "smtp_reject"
        if result == "ok":
            return True, "ok"
        # result == "unknown" — server blocked the RCPT probe
        # Still safe: MX exists, format valid, not disposable
        # Many real mail servers (Google Workspace, Outlook) block probes
        return True, "ok"

    return True, "ok"


# ── Batch validator ───────────────────────────────────────────────────────────

def validate_batch(emails: list, smtp_probe: bool = True) -> dict:
    """
    Validate a list of emails.
    Returns { email: (is_valid, reason) }
    """
    results = {}
    for email in emails:
        valid, reason = validate_email(email, smtp_probe=smtp_probe)
        results[email] = (valid, reason)
        status = "✓" if valid else "✗"
        print(f"  {status} {email} — {reason}")
    return results


if __name__ == "__main__":
    # Quick test
    test_emails = [
        "info@dentalcarejaipur.com",
        "doctor@gmail.com",
        "test@mailinator.com",
        "noreply@somesite.com",
        "fakeemail@nonexistentdomain12345.com",
        "dr.sharma@apolloclinic.in",
    ]
    print("Email validation test:\n")
    validate_batch(test_emails, smtp_probe=True)
