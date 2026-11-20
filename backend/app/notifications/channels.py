import smtplib
import ssl
from email.message import EmailMessage

import httpx

from app.core.config import settings


class ChannelError(Exception):
    pass


def email_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USERNAME and settings.SMTP_PASSWORD)


def telegram_configured() -> bool:
    return bool(settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID)


def send_email(to: str, subject: str, text: str, html: str | None = None, *, reply_to: str | None = None) -> None:
    """SMTP with STARTTLS (587) or implicit TLS (465). Works with Gmail using an App Password."""
    if not email_configured():
        raise ChannelError("SMTP is not configured")
    if not to:
        raise ChannelError("No recipient address")
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USERNAME
    msg["To"] = to
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    ctx = ssl.create_default_context()
    try:
        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, context=ctx, timeout=30) as s:
                s.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                s.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as s:
                s.starttls(context=ctx)
                s.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                s.send_message(msg)
    except (smtplib.SMTPException, OSError) as e:
        raise ChannelError(f"SMTP error: {e}") from e


def send_telegram(text: str) -> None:
    if not telegram_configured():
        raise ChannelError("Telegram is not configured")
    # Telegram messages are limited to 4096 chars
    chunks = [text[i:i + 3900] for i in range(0, len(text), 3900)] or [""]
    try:
        with httpx.Client(timeout=20) as c:
            for ch in chunks:
                r = c.post(f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage",
                           json={"chat_id": settings.TELEGRAM_CHAT_ID, "text": ch, "disable_web_page_preview": True})
                if r.status_code != 200:
                    raise ChannelError(f"Telegram HTTP {r.status_code}: {r.text[:200]}")
    except httpx.HTTPError as e:
        raise ChannelError(f"Telegram error: {e}") from e
