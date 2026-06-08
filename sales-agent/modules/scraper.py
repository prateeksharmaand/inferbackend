"""
Google Maps Places API (New) scraper.
Uses the new Places API v1 endpoints.

Enable in Google Cloud Console: "Places API (New)"
Get API key: https://console.cloud.google.com
"""

import os
import time
import requests
from modules.quota import consume, status as quota_status

MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")

PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
PLACES_DETAIL_URL = "https://places.googleapis.com/v1/places/{place_id}"

SPECIALTIES = [
    ("General Physician",  "general physician clinic"),
    ("Pediatrician",       "pediatrician child specialist clinic"),
    ("Ophthalmologist",    "eye specialist ophthalmologist clinic"),
    ("Dentist",            "dental clinic dentist"),
    ("Gynecologist",       "gynecologist obstetrician clinic"),
    ("Dermatologist",      "dermatologist skin clinic"),
    ("Orthopedic",         "orthopedic surgeon clinic"),
    ("Cardiologist",       "cardiologist heart clinic"),
    ("ENT",                "ENT ear nose throat specialist"),
    ("Diabetologist",      "diabetologist diabetes clinic"),
]

CITIES = [
    "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Pune",
    "Chennai", "Ahmedabad", "Jaipur", "Surat", "Lucknow"
]

# Test mode — override via env vars
TEST_MODE = os.environ.get("TEST_MODE", "false").lower() == "true"
if TEST_MODE:
    SPECIALTIES = [("General Physician", "general physician clinic")]
    CITIES = ["Mumbai"]


def search_places(query: str, city: str) -> list[dict]:
    """Text search using Places API (New)."""
    if not consume(1):
        return []

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": MAPS_API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri",
    }
    body = {
        "textQuery": f"{query} in {city} India",
        "regionCode": "IN",
        "maxResultCount": 20,
    }

    results = []
    try:
        resp = requests.post(PLACES_SEARCH_URL, json=body, headers=headers, timeout=10)
        data = resp.json()
        if "places" in data:
            results = data["places"]
        elif "error" in data:
            print(f"  ⚠ Maps API error: {data['error'].get('message', data['error'])}")
    except Exception as e:
        print(f"  ⚠ Request error: {e}")

    return results


def extract_email_from_website(website: str) -> str:
    if not website:
        return ""
    import re
    try:
        resp = requests.get(website, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        emails = re.findall(r"mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})", resp.text)
        if emails:
            return emails[0].lower()
        emails = re.findall(r"\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b", resp.text)
        emails = [e for e in emails if not any(x in e for x in ["example", "noreply", "sentry", ".png", ".jpg"])]
        if emails:
            return emails[0].lower()
    except Exception:
        pass
    return ""


def guess_email(website: str) -> str:
    if not website:
        return ""
    try:
        from urllib.parse import urlparse
        domain = urlparse(website).netloc.replace("www.", "")
        return f"info@{domain}" if domain else ""
    except Exception:
        return ""


def scrape_leads(cities: list[str] = None, specialties: list[tuple] = None,
                 max_per_combo: int = 20) -> list[dict]:
    if cities is None:
        cities = CITIES
    if specialties is None:
        specialties = SPECIALTIES

    # Load already-known emails from CRM to avoid re-scraping
    try:
        from modules.sheets import get_existing_emails
        seen = get_existing_emails()
        print(f"  Skipping {len(seen)} already-known emails from CRM.")
    except Exception:
        seen = set()

    all_leads = []

    for city in cities:
        for specialty_label, query in specialties:
            print(f"  Searching: {specialty_label} in {city}...")
            places = search_places(query, city)

            count = 0
            for place in places:
                if count >= max_per_combo:
                    break

                clinic_name = place.get("displayName", {}).get("text", "")
                address     = place.get("formattedAddress", "")
                phone       = place.get("nationalPhoneNumber", "")
                website     = place.get("websiteUri", "")

                email = extract_email_from_website(website)
                if not email:
                    email = guess_email(website)

                if not email:
                    continue

                # Skip if already in CRM
                if email.lower() in seen:
                    print(f"    ↷ Skipping duplicate: {clinic_name} ({email})")
                    continue
                seen.add(email.lower())

                all_leads.append({
                    "name": "",
                    "email": email,
                    "specialty": specialty_label,
                    "clinic": clinic_name,
                    "city": city,
                    "status": "new",
                    "step": 0,
                    "next_send_date": "",
                    "last_sent_date": "",
                    "notes": f"Phone: {phone} | {address}",
                })
                count += 1
                print(f"    ✓ {clinic_name} — {email}")

                time.sleep(0.3)

    print(f"\n  Total leads found: {len(all_leads)}")
    return all_leads
