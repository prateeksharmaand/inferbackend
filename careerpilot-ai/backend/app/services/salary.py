"""Salary convention: every stored CTC value is INR *lakhs per annum* (LPA), Numeric(6,2).

  1 LPA = ₹1,00,000 per year.   ₹28,50,000/yr -> 28.50   ₹2.5 Cr/yr -> 250.00
Non-INR postings keep currency in jobs.currency and leave *_lpa NULL (no silent FX conversion).
"""
import re

LAKH = 100_000


def to_lpa(amount: float | None, period: str | None = "year", currency: str | None = "INR") -> float | None:
    if amount is None or amount <= 0:
        return None
    if currency and currency.upper() not in ("INR", "₹", "RS"):
        return None
    period = (period or "year").lower()
    yearly = amount * {"month": 12, "monthly": 12, "hour": 2080, "hourly": 2080, "week": 52, "day": 260}.get(period, 1)
    lpa = yearly / LAKH
    if lpa < 1 or lpa > 500:  # implausible -> probably wrong units
        return None
    return round(lpa, 2)


_NUM = r"(\d+(?:[.,]\d+)*)"


def parse_salary_text(text: str) -> tuple[float | None, float | None]:
    """Parse Indian salary phrases into (min_lpa, max_lpa). Returns (None, None) if not confident."""
    if not text:
        return None, None
    t = text.lower().replace("₹", " inr ").replace("rs.", " inr ").replace("–", "-").replace("—", "-")
    t = re.sub(r"\s+", " ", t)
    # "25-35 LPA", "25 to 35 lakhs", "25 - 35 L"
    m = re.search(rf"{_NUM}\s*(?:-|to)\s*{_NUM}\s*(?:lpa|lakhs?|lacs?|l\b|lakh per annum)", t)
    if m:
        return _f(m.group(1)), _f(m.group(2))
    m = re.search(rf"{_NUM}\s*(?:lpa|lakhs?|lacs?)\b", t)
    if m:
        v = _f(m.group(1))
        return v, v
    # "1 - 1.5 Cr"
    m = re.search(rf"{_NUM}\s*(?:-|to)\s*{_NUM}\s*(?:cr|crore)", t)
    if m:
        return _f(m.group(1)) * 100, _f(m.group(2)) * 100
    # "INR 25,00,000 - 35,00,000" per year
    m = re.search(rf"inr\s*{_NUM}\s*(?:-|to)\s*(?:inr\s*)?{_NUM}", t)
    if m:
        lo, hi = _f(m.group(1)), _f(m.group(2))
        monthly = "month" in t
        return to_lpa(lo, "month" if monthly else "year"), to_lpa(hi, "month" if monthly else "year")
    return None, None


def _f(s: str) -> float:
    return float(s.replace(",", ""))


def fmt_lpa(lo, hi) -> str:
    if lo is None and hi is None:
        return "Not disclosed"
    if lo and hi and float(lo) != float(hi):
        return f"₹{float(lo):g}–{float(hi):g} LPA"
    return f"₹{float(lo or hi):g} LPA"
