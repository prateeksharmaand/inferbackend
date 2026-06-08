"""
Google Sheets CRM module.
Reads leads and updates sequence state.

Sheet columns (row 1 = headers):
A: name
B: email
C: specialty
D: clinic
E: city
F: status             (new | active | replied | booked | unsubscribed | failed)
G: step               (0 = not started, 1/4/8/14 = last step sent)
H: next_send_date     (YYYY-MM-DD)
I: last_sent_date     (YYYY-MM-DD)
J: notes
K: whatsapp_log       (e.g. "Day 4: sent 2024-06-08 | Day 14: sent 2024-06-22")
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

HEADERS = ["name", "email", "specialty", "clinic", "city",
           "status", "step", "next_send_date", "last_sent_date", "notes", "whatsapp_log"]


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
    elif len(first_row) < 11:
        # Add whatsapp_log column if missing
        sheet.update_cell(1, 11, "whatsapp_log")


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
            lead.get("status", "new"),
            lead.get("step", 0),
            lead.get("next_send_date", ""),
            lead.get("last_sent_date", ""),
            lead.get("notes", ""),
            "",  # whatsapp_log — empty initially
        ])
        existing.add(email)

    if rows:
        sheet.append_rows(rows, value_input_option="RAW")

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
    sheet.update_cell(row_index, 6, status)
    sheet.update_cell(row_index, 7, step)
    sheet.update_cell(row_index, 8, next_send_date)
    sheet.update_cell(row_index, 9, today)


def log_whatsapp(row_index: int, step: int):
    """Appends a WhatsApp sent log entry to column K."""
    sheet   = _get_sheet()
    today   = date.today().isoformat()
    current = sheet.cell(row_index, 11).value or ""
    entry   = f"Day {step}: sent {today}"
    updated = f"{current} | {entry}" if current else entry
    sheet.update_cell(row_index, 11, updated)


def mark_unsubscribed(row_index: int):
    _get_sheet().update_cell(row_index, 6, "unsubscribed")


def mark_failed(row_index: int):
    _get_sheet().update_cell(row_index, 6, "failed")


def mark_replied(row_index: int, note: str = ""):
    sheet = _get_sheet()
    sheet.update_cell(row_index, 6, "replied")
    if note:
        sheet.update_cell(row_index, 10, note)
