"""
Groq-powered email personalizer.
Uses llama-3.3-70b-versatile — fast and free tier available.
"""

import os
from groq import Groq

client = Groq(api_key=os.environ["GROQ_API_KEY"])

PRODUCT_CONTEXT = """
You are a sales representative for Infer EMR — an AI-native Electronic Medical Records platform built for Indian clinics and doctors.

Key facts about Infer:
- Smart queue & appointment management (drag-drop, calendar view, real-time)
- InferPad: clinical documentation with 40+ vitals, ICD-10, LOINC, RxTerms drug database
- AI Voice Scribe: real-time voice-to-text for prescriptions
- DocAssist AI: clinical copilot for drug interactions, SOAP notes, discharge summaries
- Specialty modules: Ophthalmology (12-section eye exam), Dentistry (dental chart), Pediatrics (WHO/IAP growth charts)
- ABHA integration, multi-language prescriptions, billing & receipts
- WhatsApp/SMS/IVR AI appointment booking
- Analytics: appointment trends, prescription patterns, real-time queue

Pricing: Starts at ₹3,000–5,000/month per clinic.
YouTube Demo: https://youtube.com/inferemr-demo  (replace with real link)
Book a Demo: https://calendly.com/inferemr  (replace with real link)
Landing Page: https://inferapp.online  (replace with real link)
"""

SEQUENCE_PROMPTS = {
    1: """
Write a cold outreach email (Day 1 of sequence).
Goal: spark curiosity, share the YouTube demo link.
Tone: warm, peer-to-peer, not salesy. Doctor to doctor feel.
Keep it under 120 words. No bullet points. Plain text only.
End with a soft CTA to watch the demo — NOT to book a call yet.
""",
    4: """
Write a follow-up email (Day 4 of sequence). They haven't replied yet.
Goal: highlight ONE specific feature that matters most for their specialty.
Tone: helpful, not pushy.
Keep it under 100 words. Plain text only.
Reference their specialty naturally.
End with a question to invite a reply.
""",
    8: """
Write a follow-up email (Day 8 of sequence). Still no reply.
Goal: build trust with a brief proof point, then invite a 15-min demo.
Tone: confident but respectful of their time.
Keep it under 100 words. Plain text only.
Include the Calendly booking link naturally in the text.
""",
    14: """
Write a final follow-up email (Day 14 — last in sequence).
Goal: close the loop gracefully. Leave the door open.
Tone: no pressure, genuine. Acknowledge they are busy.
Keep it under 80 words. Plain text only.
Include the Calendly link one last time.
"""
}


def personalize_email(lead: dict, step: int) -> dict:
    """
    lead = {
        "name": "Dr. Priya Sharma",
        "specialty": "Ophthalmologist",
        "clinic": "Sharma Eye Clinic",
        "city": "Pune"
    }
    step = 1 | 4 | 8 | 14
    Returns {"subject": "...", "body": "..."}
    """
    sequence_instruction = SEQUENCE_PROMPTS.get(step, SEQUENCE_PROMPTS[1])

    prompt = f"""
{PRODUCT_CONTEXT}

Lead details:
- Name: {lead.get('name', 'Doctor')}
- Specialty: {lead.get('specialty', 'General Physician')}
- Clinic: {lead.get('clinic', 'your clinic')}
- City: {lead.get('city', '')}

{sequence_instruction}

Respond in this exact format:
SUBJECT: <email subject line>
BODY:
<email body>
"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = response.choices[0].message.content.strip()

    # Parse subject and body
    subject = ""
    body = ""
    if "SUBJECT:" in raw and "BODY:" in raw:
        parts = raw.split("BODY:", 1)
        subject = parts[0].replace("SUBJECT:", "").strip()
        body = parts[1].strip()
    else:
        subject = f"A better EMR for your {lead.get('specialty', 'clinic')}"
        body = raw

    return {"subject": subject, "body": body}
