"""Apply job-search preferences stated by the candidate (outside the resume) to an existing account.

Usage:  uv run python scripts/apply_preferences.py you@example.com [preferences.json]

Preferences are user-stated goals, not resume facts, so they are applied directly. Skills listed under
"claimed_skills" are added as UNCONFIRMED: they show up in the profile's "please confirm" list and are
excluded from matching and generated documents until the user confirms them.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.models import User
from app.services.discovery import settings_for
from app.services.profile_service import compute_confirmations, get_or_create_profile
from app.services.skills_catalog import SKILLS, canonical, norm

DEFAULT = {
    "location": "Jaipur",
    "target_ctc_min_lpa": 25, "target_ctc_max_lpa": 35,
    "preferred_work_modes": ["remote", "hybrid", "office"],
    "preferred_locations": ["Jaipur", "Bengaluru", "Hyderabad", "Pune", "Gurugram", "Noida", "Delhi", "Mumbai",
                            "Chennai", "Remote India"],
    "preferred_designations": ["Flutter Technical Lead", "Mobile Technical Lead", "Mobile Application Architect",
                               "Flutter Architect", "Mobile Engineering Lead", "Mobile Solutions Architect",
                               "Engineering Manager – Mobile", "Senior Mobile Engineering Lead"],
    # From the candidate's brief; added unconfirmed unless the resume already shows them.
    "claimed_skills": ["Flutter", "Android", "iOS", "Mobile Architecture", "Team Leadership", "CI/CD", "Codemagic",
                       "Git", "Firebase", "Xcode", "Android Studio", "App Security", "SSL Pinning", "REST APIs",
                       "Performance Optimization", "App Store Release", "Stakeholder Management",
                       "Technical Documentation"],
    "notes": [],
}


def main(email: str, path: str | None) -> None:
    prefs = {**DEFAULT, **(json.load(open(path)) if path else {})}
    db = SessionLocal()
    user = db.scalar(select(User).where(func.lower(User.email) == email.lower()))
    if not user:
        sys.exit(f"No account for {email}. Register in the app first.")
    p = get_or_create_profile(db, user)
    resume_location = p.location
    for k in ("target_ctc_min_lpa", "target_ctc_max_lpa", "preferred_work_modes", "preferred_locations",
              "preferred_designations"):
        setattr(p, k, prefs[k])
    notes = list(prefs["notes"])
    if prefs.get("location"):
        if resume_location and prefs["location"].lower() not in resume_location.lower():
            notes.append(f"Your resume says you're based in '{resume_location}', but you told CareerPilot "
                         f"'{prefs['location']}'. Using '{prefs['location']}'. Update your resume if you've moved.")
        p.location = prefs["location"]
    have = {norm(s.name): s for s in p.skills}
    from app.models import CandidateSkill
    added = []
    for name in prefs["claimed_skills"]:
        c = canonical(name)
        if norm(c) in have:
            continue
        cat = SKILLS.get(c, ("technical", []))[0]
        p.skills.append(CandidateSkill(name=c, category=cat, source="user", confirmed=False))
        have[norm(c)] = p.skills[-1]
        added.append(c)
    db.flush()
    p.needs_confirmation = compute_confirmations(p, None) + [{"field": "note", "message": n} for n in notes]
    st = settings_for(db, user.id)
    st.locations = prefs["preferred_locations"]
    st.min_ctc_lpa = prefs["target_ctc_min_lpa"]
    db.commit()
    print(f"Preferences applied. Unconfirmed skills added (confirm in Resume Studio → Profile): {', '.join(added) or 'none'}")
    for n in notes:
        print("Note:", n)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
