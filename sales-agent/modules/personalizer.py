"""
Static email body personalizer — no AI API needed.
Uses pre-written bodies per sequence step, personalized with
clinic name, doctor name, and specialty via simple string substitution.
"""

STEP_BODIES = {
    1: """I hope this message finds you well.

I'm Prateek from Infer EMR — an AI-native clinic management platform built specifically for Indian doctors and clinics like {clinic}.

Managing a busy practice means dealing with long queues, time-consuming prescriptions, and endless paperwork. Infer EMR eliminates all of that — smart queue management, AI voice scribe, ICD-10 coded prescriptions, ABHA integration, and billing — all in one place.

I'd love for you to take 2 minutes to watch our demo and see how it works.""",

    4: """I wanted to follow up on my earlier message about Infer EMR.

Since you specialize in {specialty}, I thought you'd appreciate knowing that Infer has a dedicated module built specifically for your practice — not a generic solution retrofitted for specialists.

Everything from specialty-specific vitals to documentation, ICD-10 coding, and lab integrations is designed around how you actually work.

Does this sound like something worth exploring for {clinic}?""",

    8: """I'll keep this brief — I know your time is valuable.

Clinics using Infer EMR are saving 2+ hours every day on documentation, completing prescriptions in under 3 minutes, and running their entire OPD without paper.

A 15-minute demo is all it takes to see if Infer is the right fit for {clinic}. No commitment, no pressure — just a quick look at what's possible.""",

    14: """This is my last message — I promise to respect your inbox after this.

I know running {clinic} keeps you incredibly busy, and I completely understand if the timing hasn't been right.

Whenever you're ready to explore how Infer EMR can save your team hours every day, I'm just a message or call away. The door is always open.

Wishing you and your patients all the very best.""",
}

STEP_SUBJECTS = {
    1: "A smarter way to run {clinic}",
    4: "Built for {specialty}s — Infer EMR",
    8: "15 minutes to transform {clinic}",
    14: "Leaving the door open — Infer EMR",
}


def personalize_email(lead: dict, step: int) -> dict:
    """
    Returns personalized subject + body for the given step.
    No API call — pure string substitution.
    """
    clinic    = lead.get("clinic") or "your clinic"
    name      = lead.get("name") or "Doctor"
    specialty = lead.get("specialty") or "General Physician"

    body = STEP_BODIES.get(step, STEP_BODIES[1])
    subject = STEP_SUBJECTS.get(step, STEP_SUBJECTS[1])

    replacements = {
        "{clinic}":    clinic,
        "{name}":      name,
        "{specialty}": specialty,
    }

    for placeholder, value in replacements.items():
        body    = body.replace(placeholder, value)
        subject = subject.replace(placeholder, value)

    return {"subject": subject, "body": body}
