"""
Google Maps Places API (New) lead search.

Each run works through (specialty × location) searches it has not done recently — priority cities first,
then their localities, then more and more cities across India — until it has found TARGET_NEW_LEADS new
leads or used the day's Maps budget. Progress is kept in scrape_progress.json, so every day searches new
places instead of repeating yesterday's queries (which only return duplicates).

Enable in Google Cloud Console: "Places API (New)".
"""

import os
import re
import json
import time
import calendar
from datetime import date, timedelta
from concurrent.futures import ThreadPoolExecutor

import requests
from modules.quota import consume, get_remaining

MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")
PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

_BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PROGRESS_FILE = os.path.join(_BASE, "scrape_progress.json")

TARGET_NEW_LEADS = int(os.environ.get("TARGET_NEW_LEADS", 900))
RESEARCH_AFTER_DAYS = int(os.environ.get("RESEARCH_AFTER_DAYS", 45))   # repeat a search only after this long
MAPS_DAILY_CAP = int(os.environ.get("MAPS_DAILY_CAP", 0))              # 0 = spread the monthly cap over the days left

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
    ("Physiotherapist",    "physiotherapy clinic"),
    ("Psychiatrist",       "psychiatrist mental health clinic"),
    ("Neurologist",        "neurologist clinic"),
    ("Urologist",          "urologist clinic"),
    ("Gastroenterologist", "gastroenterologist clinic"),
    ("Pulmonologist",      "chest physician pulmonologist clinic"),
    ("Homeopath",          "homeopathy clinic"),
    ("Ayurveda",           "ayurvedic clinic doctor"),
    ("Multispeciality",    "multispeciality clinic"),
    ("Diagnostic Lab",     "pathology lab diagnostic centre"),
]

# Big cities are also searched locality by locality: Maps returns at most 60 places per search.
METRO_AREAS = {
    "Mumbai":    ["Andheri", "Borivali", "Thane", "Navi Mumbai", "Bandra", "Dadar", "Ghatkopar", "Malad", "Kandivali", "Chembur", "Powai", "Goregaon", "Mulund", "Vashi", "Kalyan", "Mira Road"],
    "Delhi":     ["Rohini", "Dwarka", "Lajpat Nagar", "Saket", "Janakpuri", "Pitampura", "Karol Bagh", "Laxmi Nagar", "Preet Vihar", "Vasant Kunj", "Mayur Vihar", "Rajouri Garden"],
    "Bangalore": ["Whitefield", "Koramangala", "Indiranagar", "Jayanagar", "HSR Layout", "Electronic City", "Marathahalli", "Malleshwaram", "Yelahanka", "BTM Layout", "Rajajinagar", "JP Nagar"],
    "Hyderabad": ["Kukatpally", "Gachibowli", "Banjara Hills", "Secunderabad", "Ameerpet", "Dilsukhnagar", "Madhapur", "LB Nagar", "Miyapur", "Begumpet"],
    "Chennai":   ["Anna Nagar", "T Nagar", "Velachery", "Adyar", "Tambaram", "Porur", "Mylapore", "Chromepet", "OMR"],
    "Pune":      ["Kothrud", "Hinjewadi", "Wakad", "Baner", "Hadapsar", "Viman Nagar", "Pimpri", "Chinchwad", "Kharadi", "Aundh"],
    "Kolkata":   ["Salt Lake", "Howrah", "New Town", "Behala", "Dum Dum", "Ballygunge", "Garia"],
    "Ahmedabad": ["Satellite", "Maninagar", "Bopal", "Navrangpura", "Vastrapur", "Chandkheda"],
    "Gurgaon":   ["DLF Phase", "Sohna Road", "Golf Course Road", "Sector 56"],
    "Noida":     ["Sector 18", "Sector 62", "Greater Noida"],
}

CITIES = [
    "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Pune", "Kolkata", "Ahmedabad", "Gurgaon", "Noida",
    "Jaipur", "Surat", "Lucknow", "Kanpur", "Nagpur", "Indore", "Bhopal", "Visakhapatnam", "Patna", "Vadodara",
    "Ghaziabad", "Ludhiana", "Agra", "Nashik", "Faridabad", "Meerut", "Rajkot", "Varanasi", "Srinagar", "Aurangabad",
    "Dhanbad", "Amritsar", "Allahabad", "Ranchi", "Coimbatore", "Jabalpur", "Gwalior", "Vijayawada", "Jodhpur", "Madurai",
    "Raipur", "Kota", "Chandigarh", "Guwahati", "Solapur", "Mysore", "Bareilly", "Aligarh", "Jalandhar", "Tiruchirappalli",
    "Bhubaneswar", "Salem", "Thiruvananthapuram", "Kochi", "Kozhikode", "Dehradun", "Mangalore", "Udaipur", "Jamshedpur", "Belgaum",
    "Hubli", "Kolhapur", "Ajmer", "Siliguri", "Jammu", "Bhavnagar", "Jamnagar", "Gorakhpur", "Cuttack", "Bikaner",
    "Warangal", "Guntur", "Nellore", "Thrissur", "Tirupati", "Navi Mumbai", "Thane", "Panipat", "Rohtak", "Haridwar",
]

TEST_MODE = os.environ.get("TEST_MODE", "false").lower() == "true"
if TEST_MODE:
    SPECIALTIES = SPECIALTIES[:1]
    CITIES = ["Mumbai"]
    METRO_AREAS = {}


# ── search plan ──────────────────────────────────────────────────────────────

def _locations(priority_cities):
    """Priority cities first, then their localities, then every other city and its localities."""
    order, seen = [], set()
    def add(loc, city):
        if loc not in seen:
            seen.add(loc); order.append((loc, city))
    cities = [c for c in priority_cities if c] + [c for c in CITIES if c not in priority_cities]
    for c in cities:
        add(c, c)
    for c in cities:
        for a in METRO_AREAS.get(c, []):
            add(f"{a}, {c}", c)
    return order


def _load_progress():
    try:
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


def _save_progress(p):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(p, f)


def daily_call_budget() -> int:
    """Maps calls allowed today: MAPS_DAILY_CAP, or the monthly cap left spread over the days left."""
    remaining = get_remaining()
    if MAPS_DAILY_CAP > 0:
        return min(MAPS_DAILY_CAP, remaining)
    today = date.today()
    days_left = calendar.monthrange(today.year, today.month)[1] - today.day + 1
    return remaining // max(days_left, 1)


# ── Maps + website helpers ───────────────────────────────────────────────────

def search_places(query: str, location: str, budget: dict, max_results: int = 60) -> list[dict]:
    """Text search with pagination (20 per page, max 3 pages). Every page costs one call from `budget`."""
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": MAPS_API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,"
                            "places.internationalPhoneNumber,places.websiteUri,nextPageToken",
    }
    results, page_token = [], None
    while len(results) < max_results:
        if budget["left"] <= 0 or not consume(1):
            budget["left"] = 0
            break
        budget["left"] -= 1
        budget["used"] += 1
        body = {"textQuery": f"{query} in {location}, India", "regionCode": "IN", "maxResultCount": 20}
        if page_token:
            body["pageToken"] = page_token
        try:
            data = requests.post(PLACES_SEARCH_URL, json=body, headers=headers, timeout=15).json()
        except Exception as e:
            print(f"  ⚠ Request error: {e}")
            break
        if "error" in data:
            print(f"  ⚠ Maps API error: {data['error'].get('message', data['error'])}")
            budget["error"] = data["error"].get("message", "Maps API error")
            break
        places = data.get("places", [])
        results.extend(places)
        page_token = data.get("nextPageToken")
        if not page_token:
            break
        time.sleep(2)   # required before using nextPageToken
    return results


_SKIP = ("example", "noreply", "no-reply", "sentry", "wixpress", "domain.com", "email.com", "yourname",
         ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")


def extract_email_from_website(website: str) -> str:
    if not website:
        return ""
    try:
        resp = requests.get(website, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        text = resp.text
        found = re.findall(r"mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})", text) \
            or re.findall(r"\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b", text)
        found = [e.lower() for e in found if not any(x in e.lower() for x in _SKIP)]
        return found[0] if found else ""
    except Exception:
        return ""


def guess_email(website: str) -> str:
    if not website:
        return ""
    try:
        from urllib.parse import urlparse
        domain = urlparse(website).netloc.lower().replace("www.", "")
        # Social pages / site builders are not the clinic's own domain
        if not domain or any(d in domain for d in ("facebook.", "instagram.", "google.", "practo.", "justdial.",
                                                   "linkedin.", "wa.me", "whatsapp.", "business.site", "linktr.ee")):
            return ""
        return f"info@{domain}"
    except Exception:
        return ""


def normalize_phone(place: dict) -> tuple[str, bool]:
    """Returns (+91XXXXXXXXXX, is_mobile). Indian mobiles are 10 digits starting 6-9."""
    raw = place.get("internationalPhoneNumber") or place.get("nationalPhoneNumber") or ""
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    digits = digits.lstrip("0")
    if len(digits) != 10:
        return (raw.strip(), False)
    return (f"+91{digits}", digits[0] in "6789")


def _lead_from_place(place, specialty_label, city, location):
    website = place.get("websiteUri", "")
    email = extract_email_from_website(website)
    guessed = False
    if not email:
        email, guessed = guess_email(website), True
    if not email:
        return None
    phone, mobile = normalize_phone(place)
    return {
        "name": "",
        "email": email.lower(),
        "specialty": specialty_label,
        "clinic": place.get("displayName", {}).get("text", ""),
        "city": city,
        "phone": phone,
        "status": "new",
        "step": 0,
        "next_send_date": "",
        "last_sent_date": "",
        "notes": " | ".join(x for x in [place.get("formattedAddress", ""),
                                        "" if mobile or not phone else "phone is a landline",
                                        "email:guessed" if guessed else ""] if x),
        "_location": location,
    }


# ── main entry ───────────────────────────────────────────────────────────────

def scrape_leads(priority_cities=None, target=TARGET_NEW_LEADS) -> tuple[list[dict], dict]:
    """
    Search until `target` new leads are found, the day's Maps budget is used, or every search has been
    done recently. Returns (leads, info) where info has calls used, searches run and cities covered.
    """
    try:
        from modules.sheets import get_existing_emails
        seen = get_existing_emails()
        print(f"  {len(seen)} emails already in the lead sheet will be skipped.")
    except Exception:
        seen = set()

    budget = {"left": daily_call_budget(), "used": 0, "error": ""}
    print(f"  Maps budget today: {budget['left']} calls · target: {target} new leads")
    progress = _load_progress()
    cutoff = (date.today() - timedelta(days=RESEARCH_AFTER_DAYS)).isoformat()

    plan = [(spec, q, loc, city)
            for loc, city in _locations(priority_cities or [])
            for spec, q in SPECIALTIES]
    # Never-searched first, then the oldest searches past the cutoff
    plan = [p for p in plan if progress.get(f"{p[0]}|{p[2]}", "") < cutoff]
    plan.sort(key=lambda p: progress.get(f"{p[0]}|{p[2]}", ""))

    leads, searches, cities = [], 0, []
    pool = ThreadPoolExecutor(max_workers=12)
    try:
        for spec, query, location, city in plan:
            if len(leads) >= target or budget["left"] <= 0:
                break
            places = search_places(query, location, budget)
            searches += 1
            progress[f"{spec}|{location}"] = date.today().isoformat()
            # Only places with a website can give us an email; fetch those sites in parallel
            futures = [pool.submit(_lead_from_place, p, spec, city, location) for p in places if p.get("websiteUri")]
            new_here = 0
            for fut in futures:
                lead = fut.result()
                if not lead or lead["email"] in seen:
                    continue
                seen.add(lead["email"])
                leads.append(lead)
                new_here += 1
                if len(leads) >= target:
                    break
            if city not in cities and new_here:
                cities.append(city)
            print(f"  {spec} in {location}: {len(places)} places → {new_here} new  (total {len(leads)}, calls left {budget['left']})")
            if budget["error"]:
                break
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
        _save_progress(progress)

    info = {"calls": budget["used"], "searches": searches, "cities": cities, "error": budget["error"],
            "exhausted": len(leads) < target and budget["left"] > 0 and not budget["error"]}
    print(f"\n  Total new leads found: {len(leads)} ({searches} searches, {budget['used']} Maps calls)")
    return leads, info
