"""
Google Sheets CRM module.
Reads leads and updates sequence state.

Sheet columns (row 1 = headers):
A: name
B: email
C: specialty
D: clinic
E: city
F: phone              (Phone number with country code, e.g. +919876543210)
G: status             (new | active | replied | booked | unsubscribed | failed)
H: step               (0 = not started, 1/4/8/14 = last step sent)
I: next_send_date     (YYYY-MM-DD)
J: last_sent_date     (YYYY-MM-DD)
K: notes              (Additional details/notes, separate from phone)
L: whatsapp_log       (e.g. "Day 4: sent 2024-06-08 | Day 14: sent 2024-06-22")
"""

import os
import gspread
from google.oauth2.service_account import Credentials
from datetime import date

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

SHEET_ID   = os.environ["GOOGLE_SHEET_ID"]
CREDS_FILE = os.environ.get("GOOGLE_CREDS_FILE", "google_creds.json")

_client = None
_sheet  = None

HEADERS = ["name", "email", "specialty", "clinic", "city", "phone",
           "status", "step", "next_send_date", "last_sent_date", "notes", "whatsapp_log", "email_opened", "whatsapp_message"]


def _get_sheet():
    global _client, _sheet
    if _sheet is None:
        creds = Credentials.from_service_account_file(CREDS_FILE, scopes=SCOPES)
        _client = gspread.authorize(creds)
        _sheet  = _client.open_by_key(SHEET_ID).sheet1
    return _sheet


def ensure_headers():
    sheet = _get_sheet()
    first_row = sheet.row_values(1)
    if not first_row:
        sheet.append_row(HEADERS)
    else:
        # Ensure all columns exist
        if len(first_row) < 6:
            sheet.update_cell(1, 6, "phone")
        if len(first_row) < 12:
            sheet.update_cell(1, 12, "whatsapp_log")
        if len(first_row) < 13:
            sheet.update_cell(1, 13, "email_opened")
        if len(first_row) < 14:
            sheet.update_cell(1, 14, "whatsapp_message")


def get_existing_emails() -> set:
    sheet = _get_sheet()
    records = sheet.get_all_records()
    return {str(r.get("email", "")).strip().lower() for r in records if r.get("email")}


def import_leads(leads: list[dict]) -> int:
    sheet = _get_sheet()
    ensure_headers()
    existing = get_existing_emails()

    from modules.mailer import is_blocked
    rows = []
    for lead in leads:
        email = str(lead.get("email", "")).strip().lower()
        if not email or email in existing:
            continue
        if is_blocked(email):
            print(f"  ⛔ Skipping blocked email: {email}")
            continue
        rows.append([
            lead.get("name", ""),
            email,
            lead.get("specialty", ""),
            lead.get("clinic", ""),
            lead.get("city", ""),
            lead.get("phone", ""),  # phone column (now separate from notes)
            lead.get("status", "new"),
            lead.get("step", 0),
            lead.get("next_send_date", ""),
            lead.get("last_sent_date", ""),
            lead.get("notes", ""),  # notes column (separate from phone)
            "",  # whatsapp_log — empty initially
        ])
        existing.add(email)

    if rows:
        try:
            sheet.append_rows(rows, value_input_option="RAW")
            print(f"  ✓ Saved {len(rows)} leads to Google Sheet")
        except Exception as e:
            print(f"  ✗ Failed to save to Google Sheet: {e}")
            return 0

    return len(rows)


def get_leads_due_today() -> list[dict]:
    sheet = _get_sheet()
    rows  = sheet.get_all_records()
    today = date.today().isoformat()

    due = []
    for i, row in enumerate(rows, start=2):
        status     = str(row.get("status", "new")).strip().lower()
        next_send  = str(row.get("next_send_date", "")).strip()

        if status in ("unsubscribed", "replied", "booked", "completed", "failed"):
            continue
        if not next_send or next_send <= today:
            due.append({**row, "_row": i})

    return due


def update_lead(row_index: int, step: int, next_send_date: str, status: str = "active"):
    sheet = _get_sheet()
    today = date.today().isoformat()
    sheet.update_cell(row_index, 7, status)      # Column G (status)
    sheet.update_cell(row_index, 8, step)        # Column H (step)
    sheet.update_cell(row_index, 9, next_send_date)  # Column I (next_send_date)
    sheet.update_cell(row_index, 10, today)      # Column J (last_sent_date)


def log_whatsapp(row_index: int, step: int, message: str = ""):
    """Appends a WhatsApp sent log entry to column L and writes message body to column N."""
    sheet   = _get_sheet()
    today   = date.today().isoformat()
    current = sheet.cell(row_index, 12).value or ""  # Column L (whatsapp_log)
    entry   = f"Day {step}: sent {today}"
    updated = f"{current} | {entry}" if current else entry
    sheet.update_cell(row_index, 12, updated)
    if message:
        existing_msg = sheet.cell(row_index, 14).value or ""  # Column N (whatsapp_message)
        new_entry    = f"[Day {step} | {today}] {message}"
        combined     = f"{existing_msg}\n{new_entry}" if existing_msg else new_entry
        sheet.update_cell(row_index, 14, combined)


def has_opened_email(lead: dict) -> bool:
    """Returns True if the lead has opened any email."""
    return str(lead.get("email_opened", "")).strip().lower() in ("true", "yes", "1")


def mark_email_opened(row_index: int):
    """Marks email as opened in column M."""
    _get_sheet().update_cell(row_index, 13, "true")


def mark_unsubscribed(row_index: int):
    _get_sheet().update_cell(row_index, 7, "unsubscribed")  # Column G (status)


def mark_failed(row_index: int):
    _get_sheet().update_cell(row_index, 7, "failed")  # Column G (status)


def mark_replied(row_index: int, note: str = ""):
    sheet = _get_sheet()
    sheet.update_cell(row_index, 7, "replied")  # Column G (status)
    if note:
        sheet.update_cell(row_index, 11, note)  # Column K (notes)


def get_all_leads_with_phones() -> list[dict]:
    """Returns all leads that have a phone number in their phone field."""
    import re
    sheet = _get_sheet()
    records = sheet.get_all_records()
    leads = []
    for i, row in enumerate(records, start=2):
        phone = str(row.get("phone", "")).strip()
        if not phone:
            continue
        # Normalize phone number
        raw = re.sub(r"[\s\-\(\)]", "", phone)
        if raw.startswith("+"):
            raw = raw[1:]
        if raw.startswith("0"):
            raw = "91" + raw[1:]
        if len(raw) == 10:
            raw = "91" + raw
        leads.append({**row, "_row": i, "_phone_e164": raw})
    return leads


def mark_replied_by_phone(from_number: str, note: str = "") -> bool:
    """
    Finds a lead whose normalised phone matches from_number and marks it replied.
    Returns True if a match was found and updated.
    """
    leads = get_all_leads_with_phones()
    # Strip non-digits from incoming number for comparison
    import re
    clean = re.sub(r"\D", "", from_number)
    for lead in leads:
        if lead["_phone_e164"] == clean:
            status = str(lead.get("status", "")).strip().lower()
            if status in ("replied", "booked"):
                return True  # already marked
            mark_replied(lead["_row"], note or f"WhatsApp reply received: {from_number}")
            return True
    return False
