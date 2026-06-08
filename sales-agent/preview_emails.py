"""
Run this to generate preview HTML files for all 4 email templates.
Usage: python preview_emails.py
Then open preview_step1.html ... preview_step4.html in your browser.
"""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from modules.email_template import render

SAMPLE_LEAD = {
    "doctor_name": "Dr. Priya Sharma",
    "clinic_name": "Sharma Eye Clinic",
    "specialty": "Ophthalmologist",
}

SAMPLE_BODIES = {
    1: """As a fellow professional, I know how much time goes into managing prescriptions, queues, and patient records every single day.

Infer EMR is an AI-native clinic management platform built specifically for Indian doctors — it handles your entire OPD workflow so you can focus on what matters most: your patients.

Take 2 minutes to see it in action.""",

    4: """Following up on my earlier note about Infer EMR.

Since you specialize in Ophthalmology, I wanted to highlight our complete 12-section eye examination module — visual acuity, refraction, IOP, biometry, pachymetry, and more — all in one screen, no paper charts needed.

Would love to hear if this solves a real problem for your practice.""",

    8: """I've reached out a couple of times — I'll keep this short.

Clinics using Infer EMR are saving 2+ hours daily and completing prescriptions in under 3 minutes. It takes just 15 minutes to see if it fits your workflow.

No commitment — just a quick look.""",

    14: """This is my last note — I know you are busy and your time is precious.

If you ever want to explore what Infer EMR can do for Sharma Eye Clinic, I'm just a message or call away. The door is always open.

Wishing you and your patients all the best.""",
}

STEPS = {1: "Day 1 — Introduction", 4: "Day 4 — Specialty Feature", 8: "Day 8 — Social Proof", 14: "Day 14 — Final"}

for step, label in STEPS.items():
    html, _ = render(
        subject=f"[Preview] {label}",
        body_text=SAMPLE_BODIES[step],
        clinic_name=SAMPLE_LEAD["clinic_name"],
        doctor_name=SAMPLE_LEAD["doctor_name"],
        specialty=SAMPLE_LEAD["specialty"],
        step=step,
    )
    filename = f"preview_step{step}.html"
    with open(filename, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✓ {filename} — {label}")

print("\nOpen these files in your browser to preview all 4 templates.")
