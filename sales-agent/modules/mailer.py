"""
Hostinger SMTP sender module.
"""

import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.hostinger.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 465))
SMTP_USER = os.environ["SMTP_USER"]
SMTP_PASS = os.environ["SMTP_PASS"]
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER)
FROM_NAME = os.environ.get("FROM_NAME", "Infer EMR")


def send_email(to_email: str, subject: str, body: str) -> bool:
    """
    Sends a plain-text email via Hostinger SMTP (SSL port 465).
    Returns True on success, False on failure.
    """
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{FROM_NAME} <{SMTP_FROM}>"
        msg["To"] = to_email

        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM, to_email, msg.as_string())

        print(f"  ✓ Sent to {to_email}")
        return True

    except Exception as e:
        print(f"  ✗ Failed to send to {to_email}: {e}")
        return False
