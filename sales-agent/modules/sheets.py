"""
Google Sheets CRM module.
Reads leads and updates sequence state.

Sheet columns (row 1 = headers):
A: name
B: email
C: specialty
D: clinic
E: city
F: status          (new | active | replied | booked | unsubscribed)
G: step            (0 = not started, 1/4/8/14 = last step sent)
H: next_send_date  (YYYY-MM-DD)
I: last_sent_date  (YYYY-MM-DD)
J: notes
"""

import os
import gspread
from google.oauth2.service_account import Credentials
from datetime import date

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

SHEET_ID = os.environ["GOOGLE_SHEET_ID"]
CREDS_FILE = os.environ.get("GOOGLE_CREDS_FILE", "google_creds.json")

_client = None
_sheet = None


def _get_sheet():
    global _client, _sheet
    if _sheet is None:
        creds = Credentials.from_service_account_file(CREDS_FILE, scopes=SCOPES)
        _client = gspread.authorize(creds)
        _sheet = _client.open_by_key(SHEET_ID).sheet1
    return _sheet


def get_leads_due_today() -> list[dict]:
    """
    Returns all leads where next_send_date <= today and status is new or active.
    """
    sheet = _get_sheet()
    rows = sheet.get_all_records()
    today = date.today().isoformat()

    due = []
    for i, row in enumerate(rows, start=2):  # row index for update (1-based + header)
        status = str(row.get("status", "new")).strip().lower()
        next_send = str(row.get("next_send_date", "")).strip()

        if status in ("unsubscribed", "replied", "booked"):
            continue
        if not next_send or next_send <= today:
            due.append({**row, "_row": i})

    return due


def update_lead(row_index: int, step: int, next_send_date: str, status: str = "active"):
    """
    Updates the CRM row after an email is sent.
    """
    sheet = _get_sheet()
    today = date.today().isoformat()

    sheet.update_cell(row_index, 6, status)           # F: status
    sheet.update_cell(row_index, 7, step)             # G: step
    sheet.update_cell(row_index, 8, next_send_date)   # H: next_send_date
    sheet.update_cell(row_index, 9, today)            # I: last_sent_date


def mark_unsubscribed(row_index: int):
    sheet = _get_sheet()
    sheet.update_cell(row_index, 6, "unsubscribed")


def mark_replied(row_index: int, note: str = ""):
    sheet = _get_sheet()
    sheet.update_cell(row_index, 6, "replied")
    if note:
        sheet.update_cell(row_index, 10, note)
