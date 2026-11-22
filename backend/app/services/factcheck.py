"""Guards that keep generated text grounded in the candidate's real profile."""
import re

from app.services.skills_catalog import find_skills, norm

NUM = re.compile(r"(?<![\w.])(\d+(?:[.,]\d+)*)\s*(%|\+|x|m\b|k\b|l\b|lakh|million|cr|crore|years?|yrs?)?", re.I)


def numbers_in(text: str) -> set[str]:
    out = set()
    for m in NUM.finditer(text or ""):
        n = m.group(1).replace(",", "")
        if len(n) == 4 and n.startswith(("19", "20")):
            continue  # years like 2024 are dates, checked elsewhere
        out.add(n.rstrip("0").rstrip(".") if "." in n else n)
    return out


def unsupported_numbers(generated: str, source: str) -> set[str]:
    return numbers_in(generated) - numbers_in(source)


def unsupported_skills(generated: str, confirmed: list[str], source: str = "") -> set[str]:
    """Technical skills mentioned in `generated` that are neither confirmed nor already in `source`."""
    mine = {norm(s) for s in confirmed} | {norm(s) for s in find_skills(source)}
    # Domain/leadership words are too generic to police; only technical/tool/platform skills
    from app.services.skills_catalog import SKILLS
    found = {s for s, cat in find_skills(generated).items() if cat in ("technical", "tool", "platform")}
    return {s for s in found if norm(s) not in mine}


def check_text(generated: str, source: str, confirmed: list[str]) -> list[str]:
    issues = []
    nums = unsupported_numbers(generated, source)
    if nums:
        issues.append(f"numbers not in your profile: {', '.join(sorted(nums))}")
    sk = unsupported_skills(generated, confirmed, source)
    if sk:
        issues.append(f"skills not confirmed in your profile: {', '.join(sorted(sk))}")
    return issues
