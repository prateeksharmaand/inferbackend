"""
Hostinger SMTP sender module.
Sends email via SMTP and saves a copy to Sent folder via IMAP.
"""

import smtplib
import imaplib
import os
import time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.hostinger.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 465))
SMTP_USER = os.environ["SMTP_USER"]
SMTP_PASS = os.environ["SMTP_PASS"]
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER)
FROM_NAME = os.environ.get("FROM_NAME", "Infer EMR")

IMAP_HOST = os.environ.get("IMAP_HOST", "imap.hostinger.com")
IMAP_PORT = int(os.environ.get("IMAP_PORT", 993))


def _save_to_sent(msg_bytes: bytes):
    """Saves sent email to IMAP Sent folder."""
    try:
        with imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT) as imap:
            imap.login(SMTP_USER, SMTP_PASS)

            # Hardcode INBOX.Sent — confirmed from folder listing
            sent_folder = "INBOX.Sent"

            print(f"  [IMAP] Saving to folder: {sent_folder}")
            result = imap.append(
                sent_folder, "\\Seen",
                imaplib.Time2Internaldate(time.time()),
                msg_bytes
            )
            print(f"  [IMAP] Save result: {result}")
            if result[0] == "OK":
                print(f"  ✓ Saved to {sent_folder}")
            else:
                print(f"  ⚠ Save failed: {result}")
    except Exception as e:
        print(f"  ⚠ IMAP error: {e}")


def send_email(to_email: str, subject: str, body: str) -> bool:
    """
    Sends plain-text email via Hostinger SMTP.
    Saves copy to Sent folder via IMAP.
    Returns True on success, False on failure.
    """
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{FROM_NAME} <{SMTP_FROM}>"
        msg["To"] = to_email
        msg.attach(MIMEText(body, "plain"))

        msg_bytes = msg.as_bytes()

        # Send
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM, to_email, msg_bytes)

        print(f"  ✓ Sent to {to_email}")

        # Save to Sent folder
        _save_to_sent(msg_bytes)

        return True

    except Exception as e:
        print(f"  ✗ Failed to send to {to_email}: {e}")
        return False
