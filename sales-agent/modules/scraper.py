"""
Google Maps Places scraper.
Finds clinics by specialty + city and returns structured lead data.
Free tier: 10,000 requests/month (no billing needed under that limit).

Get your API key: https://console.cloud.google.com
Enable: Places API
"""

import os
import time
import requests

MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")

PLACES_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_DETAIL_URL = "https://maps.googleapis.com/maps/api/place/details/json"

# Specialties to search — maps to search query + InferPad specialty tag
SPECIALTIES = [
    ("General Physician", "general physician clinic"),
    ("Pediatrician",      "pediatrician child specialist clinic"),
    ("Ophthalmologist",   "eye specialist ophthalmologist clinic"),
    ("Dentist",           "dental clinic dentist"),
    ("Gynecologist",      "gynecologist obstetrician clinic"),
    ("Dermatologist",     "dermatologist skin clinic"),
    ("Orthopedic",        "orthopedic surgeon clinic"),
    ("Cardiologist",      "cardiologist heart clinic"),
    ("ENT",               "ENT ear nose throat specialist"),
    ("Diabetologist",     "diabetologist diabetes clinic"),
]

# Target cities — add/remove as needed
CITIES = [
    "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Pune",
    "Chennai", "Ahmedabad", "Jaipur", "Surat", "Lucknow"
]


def search_places(query: str, city: str) -> list[dict]:
    """
    Calls Google Places Text Search for a specialty + city combo.
    Returns list of raw place results.
    """
    results = []
    params = {
        "query": f"{query} in {city} India",
        "key": MAPS_API_KEY,
        "type": "doctor",
        "region": "in",
    }

    while True:
        resp = requests.get(PLACES_SEARCH_URL, params=params, timeout=10)
        data = resp.json()

        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            print(f"  ⚠ Maps API error: {data.get('status')} — {data.get('error_message', '')}")
            break

        results.extend(data.get("results", []))

        next_token = data.get("next_page_token")
        if not next_token:
            break

        # Google requires a short delay before using next_page_token
        time.sleep(2)
        params = {"pagetoken": next_token, "key": MAPS_API_KEY}

    return results


def get_place_details(place_id: str) -> dict:
    """
    Fetches phone number and website for a place_id.
    """
    params = {
        "place_id": place_id,
        "fields": "name,formatted_phone_number,website,formatted_address",
        "key": MAPS_API_KEY,
    }
    resp = requests.get(PLACES_DETAIL_URL, params=params, timeout=10)
    data = resp.json()
    return data.get("result", {})


def extract_email_from_website(website: str) -> str:
    """
    Tries to find a contact email from the clinic website.
    Looks for mailto: links on the homepage.
    """
    if not website:
        return ""
    try:
        resp = requests.get(website, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        text = resp.text
        # Find mailto: links
        import re
        emails = re.findall(r"mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})", text)
        if emails:
            return emails[0].lower()
    except Exception:
        pass
    return ""


def guess_email(place_name: str, website: str) -> str:
    """
    If no email found, guess common patterns from website domain.
    e.g. website=cityeyeclinic.com → info@cityeyeclinic.com
    """
    if not website:
        return ""
    try:
        from urllib.parse import urlparse
        domain = urlparse(website).netloc.replace("www.", "")
        if domain:
            return f"info@{domain}"
    except Exception:
        pass
    return ""


def scrape_leads(cities: list[str] = None, specialties: list[tuple] = None,
                 max_per_combo: int = 20) -> list[dict]:
    """
    Main scraper. Returns list of lead dicts ready for Google Sheets.

    lead = {
        "name": "Dr. Sharma",
        "email": "info@sharmaeye.com",
        "specialty": "Ophthalmologist",
        "clinic": "Sharma Eye Clinic",
        "city": "Pune"
    }
    """
    if cities is None:
        cities = CITIES
    if specialties is None:
        specialties = SPECIALTIES

    all_leads = []
    seen_place_ids = set()

    for city in cities:
        for specialty_label, query in specialties:
            print(f"  Searching: {specialty_label} in {city}...")
            places = search_places(query, city)

            count = 0
            for place in places:
                if count >= max_per_combo:
                    break

                place_id = place.get("place_id", "")
                if place_id in seen_place_ids:
                    continue
                seen_place_ids.add(place_id)

                clinic_name = place.get("name", "")
                address = place.get("formatted_address", "")

                # Get phone + website from details API
                details = get_place_details(place_id)
                phone = details.get("formatted_phone_number", "")
                website = details.get("website", "")

                # Try to find email
                email = extract_email_from_website(website)
                if not email:
                    email = guess_email(clinic_name, website)

                # Skip if no email at all — can't email them
                if not email:
                    continue

                lead = {
                    "name": "",           # Will be filled as clinic contact (unknown from Maps)
                    "email": email,
                    "specialty": specialty_label,
                    "clinic": clinic_name,
                    "city": city,
                    "status": "new",
                    "step": 0,
                    "next_send_date": "",
                    "last_sent_date": "",
                    "notes": f"Phone: {phone} | {address}"
                }

                all_leads.append(lead)
                count += 1
                print(f"    ✓ {clinic_name} — {email}")

                # Be polite to the API
                time.sleep(0.5)

    print(f"\n  Total leads found: {len(all_leads)}")
    return all_leads
