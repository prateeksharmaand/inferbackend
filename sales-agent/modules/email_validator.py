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
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Tuple, List, Dict

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
    """Returns sorted list of MX records, or empty list. Cached per domain."""
    try:
        records = dns.resolver.resolve(domain, "MX", lifetime=4)
        return sorted(records, key=lambda r: r.preference)
    except Exception:
        return []


@lru_cache(maxsize=512)
def check_mx(domain: str) -> bool:
    """True if domain has at least one MX record. Cached — same domain checked once."""
    return len(_get_mx(domain)) > 0


@lru_cache(maxsize=256)
def smtp_check(email: str, domain: str, from_addr: str = "check@inferapp.online") -> str:
    """
    SMTP RCPT-TO probe. Cached per email — never probes same address twice.
    Timeout: 6s. Returns: "ok" | "rejected" | "unknown"
    Note: many real servers (Google Workspace, Outlook) return "unknown"
    because they block probes — this is NOT a rejection.
    """
    mx_records = _get_mx(domain)
    if not mx_records:
        return "no_mx"

    mx_host = str(mx_records[0].exchange).rstrip(".")
    try:
        with smtplib.SMTP(timeout=6) as s:
            s.connect(mx_host, 25)
            s.ehlo("inferapp.online")
            code, _ = s.mail(from_addr)
            if code not in (250, 251):
                return "unknown"
            code, _ = s.rcpt(email)
            s.quit()
            if code in (250, 251):   return "ok"
            if code in (550,551,552,553,554): return "rejected"
            return "unknown"
    except (socket.timeout, socket.error, smtplib.SMTPException):
        return "unknown"


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


# ── Batch validator (parallel) ────────────────────────────────────────────────

def validate_batch(emails: List[str], smtp_probe: bool = False,
                   max_workers: int = 10) -> Dict[str, Tuple[bool, str]]:
    """
    Validate a list of emails in parallel.
    smtp_probe=False (default) — only MX check, ~200ms per unique domain, very fast.
    smtp_probe=True  — adds SMTP handshake, ~5s per unique domain, more accurate.

    MX results are cached per domain so 100 emails at same domain = 1 DNS lookup.
    SMTP results cached per email — never probes same address twice.

    Returns { email: (is_valid, reason) }
    """
    import time
    t0 = time.time()
    results: Dict[str, Tuple[bool, str]] = {}

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(validate_email, e, smtp_probe): e for e in emails}
        for fut in as_completed(futures):
            email = futures[fut]
            try:
                valid, reason = fut.result()
            except Exception:
                valid, reason = True, "ok"   # never block on validator crash
            results[email] = (valid, reason)

    elapsed = time.time() - t0
    ok    = sum(1 for v, _ in results.values() if v)
    skip  = len(results) - ok
    print(f"\n  📊 Validated {len(results)} emails in {elapsed:.1f}s — "
          f"{ok} safe to send, {skip} skipped")
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
