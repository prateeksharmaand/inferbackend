"""Quick test — send Day 4 WhatsApp to a specific number."""
from dotenv import load_dotenv
load_dotenv()

from modules.whatsapp import send_whatsapp

lead = {
    "name":      "Prateek Sharma",
    "clinic":    "Infer Clinic",
    "specialty": "Dentist",
    "phone":     "9650269758",
    "notes":     "",
}

print("Sending Day 4 WhatsApp to 9650269758...")
result = send_whatsapp(lead, step=4)
print("Result:", "✓ Sent" if result else "✗ Failed")
