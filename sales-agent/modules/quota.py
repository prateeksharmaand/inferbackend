"""
Monthly request quota tracker for Google Maps API.
Hard cap at 9,500 requests/month (500 buffer under free tier limit of 10,000).
Resets automatically on the 1st of each month.
State stored in quota.json next to this file.
"""

import os
import json
from datetime import date

QUOTA_FILE = os.path.join(os.path.dirname(__file__), "..", "quota.json")
MONTHLY_CAP = int(os.environ.get("MAPS_MONTHLY_CAP", 9500))


def _load() -> dict:
    if os.path.exists(QUOTA_FILE):
        with open(QUOTA_FILE) as f:
            return json.load(f)
    return {"month": "", "used": 0}


def _save(state: dict):
    with open(QUOTA_FILE, "w") as f:
        json.dump(state, f)


def get_remaining() -> int:
    state = _load()
    current_month = date.today().strftime("%Y-%m")
    if state["month"] != current_month:
        # New month — reset
        state = {"month": current_month, "used": 0}
        _save(state)
    return max(0, MONTHLY_CAP - state["used"])


def consume(n: int = 1) -> bool:
    """
    Consume n requests from the quota.
    Returns True if allowed, False if quota exceeded.
    """
    state = _load()
    current_month = date.today().strftime("%Y-%m")

    if state["month"] != current_month:
        state = {"month": current_month, "used": 0}

    if state["used"] + n > MONTHLY_CAP:
        print(f"  ⚠ Google Maps quota exhausted ({state['used']}/{MONTHLY_CAP} used this month). Resets on 1st.")
        return False

    state["used"] += n
    _save(state)
    return True


def status() -> str:
    state = _load()
    current_month = date.today().strftime("%Y-%m")
    if state["month"] != current_month:
        return f"0/{MONTHLY_CAP} used (new month)"
    return f"{state['used']}/{MONTHLY_CAP} used this month"
