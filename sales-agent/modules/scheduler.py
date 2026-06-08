"""
Sequence scheduler.
Determines which email step to send next and when.

Sequence: Day 1 → Day 4 → Day 8 → Day 14 → done
"""

from datetime import date, timedelta

SEQUENCE = [1, 4, 8, 14]  # days offset from first contact

# Gap in days between each step
STEP_GAPS = {
    0: 0,   # new lead → send step 1 immediately
    1: 3,   # after step 1 → wait 3 days → step 4
    4: 4,   # after step 4 → wait 4 days → step 8
    8: 6,   # after step 8 → wait 6 days → step 14
    14: None  # sequence complete
}


def get_next_step(current_step: int) -> int | None:
    """
    Returns the next sequence step number, or None if sequence is complete.
    """
    steps = SEQUENCE
    if current_step == 0:
        return 1
    try:
        idx = steps.index(current_step)
        return steps[idx + 1] if idx + 1 < len(steps) else None
    except ValueError:
        return None


def get_next_send_date(current_step: int) -> str | None:
    """
    Returns ISO date string for when to send the next email.
    Returns None if sequence is complete.
    """
    gap = STEP_GAPS.get(current_step)
    if gap is None:
        return None
    next_date = date.today() + timedelta(days=gap)
    return next_date.isoformat()


def is_sequence_complete(current_step: int) -> bool:
    return current_step == 14
