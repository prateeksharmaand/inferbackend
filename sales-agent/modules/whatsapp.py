"""
WhatsApp Business API sender.
Sends pre-approved template messages on Day 4 and Day 14.
"""

import os
import re
import requests

WA_API_VERSION  = os.environ.get("WA_API_VERSION", "v23.0")
WA_API_URL      = f"https://graph.facebook.com/{WA_API_VERSION}/{{phone_number_id}}/messages"
PHONE_NUMBER_ID = os.environ.get("WA_PHONE_NUMBER_ID", "")
ACCESS_TOKEN    = os.environ.get("WA_ACCESS_TOKEN", "")

# Meta-approved template names
TEMPLATES = {
    4:  "infer_followup_specialty",
    14: "infer_final_followup",
}


def _send(to_phone: str, template_name: str, components: list) -> bool:
    """
    Sends a WhatsApp template message.
    to_phone must be in international format without +: e.g. 919876543210
    """
    url = WA_API_URL.format(phone_number_id=PHONE_NUMBER_ID)
    headers = {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": "en"},
            "components": components,
        },
    }
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        data = resp.json()
        if "messages" in data:
            print(f"  ✓ WhatsApp sent to {to_phone}")
            return True
        else:
            error = data.get("error", {}).get("message", str(data))
            print(f"  ⚠ WhatsApp failed: {error}")
            return False
    except Exception as e:
        print(f"  ⚠ WhatsApp error: {e}")
        return False


# Human-readable renderings of Meta-approved templates (mirrors what the recipient sees)
TEMPLATE_BODIES = {
    4: (
        "Hi {doctor_name}, hope your {specialty} practice at {clinic_name} is going well! "
        "We wanted to follow up on our earlier email about Infer EMR — a simple, AI-powered "
        "system built for clinics like yours. Would love to show you a quick 10-min demo. "
        "Just reply YES and we'll set it up at your convenience. 🙏"
    ),
    14: (
        "Hi {doctor_name}, this is our final follow-up from Infer EMR. "
        "If you ever want to explore how {clinic_name} can go paperless and save hours every week, "
        "we're just a message away. Wishing you and your patients the very best! 🌟"
    ),
}


def send_whatsapp(lead: dict, step: int) -> tuple[bool, str]:
    """
    Sends WhatsApp message for Day 4 or Day 14.
    Returns (success: bool, rendered_message: str).
    """
    template_name = TEMPLATES.get(step)
    if not template_name:
        return False, ""

    # Extract phone from lead
    phone = str(lead.get("phone", "")).strip()
    if not phone:
        notes = lead.get("notes", "")
        match = re.search(r"Phone:\s*([\d\s\-\+]+)", notes)
        if match:
            phone = match.group(1).strip()

    if not phone:
        print(f"  ⚠ WhatsApp skipped — no phone for {lead.get('clinic', '')}")
        return False, ""

    # Normalize phone — remove spaces, dashes, +
    phone = re.sub(r"[\s\-\(\)]", "", phone)
    if phone.startswith("+"):
        phone = phone[1:]
    if phone.startswith("0"):
        phone = "91" + phone[1:]
    if len(phone) == 10:
        phone = "91" + phone

    raw_name    = (lead.get("name") or "Doctor").strip()
    doctor_name = raw_name if raw_name.lower().startswith("dr") else f"Dr. {raw_name}"
    clinic_name = lead.get("clinic") or "your clinic"
    specialty   = lead.get("specialty") or "General Physician"

    # Build template components (parameters match {{1}}, {{2}}, {{3}})
    if step == 4:
        components = [{
            "type": "body",
            "parameters": [
                {"type": "text", "text": doctor_name},
                {"type": "text", "text": clinic_name},
                {"type": "text", "text": specialty},
            ]
        }]
    elif step == 14:
        components = [{
            "type": "body",
            "parameters": [
                {"type": "text", "text": doctor_name},
                {"type": "text", "text": clinic_name},
            ]
        }]
    else:
        return False, ""

    # Render the human-readable version of the message for CRM logging
    rendered = TEMPLATE_BODIES.get(step, "").format(
        doctor_name=doctor_name,
        clinic_name=clinic_name,
        specialty=specialty,
    )

    success = _send(phone, template_name, components)
    return success, rendered if success else ""
