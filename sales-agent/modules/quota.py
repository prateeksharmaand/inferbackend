"""
Monthly request quota tracker for Google Maps API.

Our Text Search asks for phone + website, which Google bills as "Text Search Enterprise":
1,000 free requests a month, then $35 per 1,000. To guarantee no Google bill, the cap is
FREE_TIER_SAFE (950) and MAPS_MONTHLY_CAP in .env can only LOWER it — raising it needs
MAPS_ALLOW_PAID=yes as an explicit opt-in to paid usage.
Resets automatically on the 1st of each month.
State stored in quota.json next to this file.
"""

import os
import json
from datetime import date

QUOTA_FILE = os.path.join(os.path.dirname(__file__), "..", "quota.json")
FREE_TIER_SAFE = 950   # 1,000 free Enterprise calls/month, minus a 50-call margin
_ALLOW_PAID = os.environ.get("MAPS_ALLOW_PAID", "").strip().lower() in ("1", "yes", "true")
_ENV_CAP = int(os.environ.get("MAPS_MONTHLY_CAP", FREE_TIER_SAFE) or FREE_TIER_SAFE)
MONTHLY_CAP = _ENV_CAP if _ALLOW_PAID else min(_ENV_CAP, FREE_TIER_SAFE)


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
