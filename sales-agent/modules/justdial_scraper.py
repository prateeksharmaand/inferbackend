"""
JustDial clinic scraper — India's largest local business directory.
Scrapes doctor/clinic listings by specialty + city.

No API key needed. Free. Works out of the box.
"""

import re
import time
import random
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

# Rotate user agents to avoid blocks
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
]

HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-IN,en-GB;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Referer": "https://www.justdial.com/",
}

# JustDial URL slugs per specialty
SPECIALTY_SLUGS = {
    "General Physician":  "Doctors-General-Physician",
    "Pediatrician":       "Doctors-Pediatricians",
    "Ophthalmologist":    "Doctors-Ophthalmologists-Eye-Specialist",
    "Dentist":            "Dentists",
    "Gynecologist":       "Doctors-Gynecologists-Obstetricians",
    "Dermatologist":      "Doctors-Dermatologists-Skin-Specialist",
    "Orthopedic":         "Doctors-Orthopedic-Surgeons",
    "Cardiologist":       "Doctors-Cardiologists",
    "ENT":                "Doctors-ENT-Ear-Nose-Throat-Specialists",
    "Diabetologist":      "Doctors-Diabetologists",
}

# City slugs as JustDial uses them in URLs
CITY_SLUGS = {
    "Mumbai":    "Mumbai",
    "Delhi":     "Delhi",
    "Bangalore": "Bangalore",
    "Hyderabad": "Hyderabad",
    "Pune":      "Pune",
    "Chennai":   "Chennai",
    "Ahmedabad": "Ahmedabad",
    "Jaipur":    "Jaipur",
    "Surat":     "Surat",
    "Lucknow":   "Lucknow",
    "Kolkata":   "Kolkata",
    "Chandigarh":"Chandigarh",
    "Nagpur":    "Nagpur",
    "Indore":    "Indore",
    "Kochi":     "Kochi",
}


def _random_delay():
    time.sleep(random.uniform(2.0, 4.5))


def _get(url: str) -> requests.Response | None:
    headers = {**HEADERS, "User-Agent": random.choice(USER_AGENTS)}
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        return resp
    except Exception as e:
        print(f"    ⚠ Request failed: {e}")
        return None


def _build_url(city_slug: str, specialty_slug: str, page: int = 1) -> str:
    base = f"https://www.justdial.com/{city_slug}/{specialty_slug}"
    if page > 1:
        return f"{base}/page-{page}"
    return base


def _parse_listings(html: str) -> list[dict]:
    """
    Parses JustDial search result page HTML.
    Returns list of raw clinic dicts.
    """
    soup = BeautifulSoup(html, "html.parser")
    results = []

    # JustDial listings are in <li> tags with class containing 'cntanr'
    listings = soup.find_all("li", class_=re.compile(r"cntanr|resultbox"))

    # Fallback: look for script tags with JSON data
    if not listings:
        listings = soup.find_all("div", class_=re.compile(r"resultbox|jdResultBox|store-details"))

    for item in listings:
        try:
            # Clinic / Doctor name
            name_tag = (
                item.find("span", class_=re.compile(r"lng_cont_name|store-name|resultbox_title")) or
                item.find("h2", class_=re.compile(r"store-name|title")) or
                item.find("a", class_=re.compile(r"store-name|title"))
            )
            clinic_name = name_tag.get_text(strip=True) if name_tag else ""

            if not clinic_name:
                continue

            # Phone number
            phone_tag = item.find(attrs={"data-phone": True}) or item.find(class_=re.compile(r"contact|phone|mobilesv"))
            phone = ""
            if phone_tag:
                phone = phone_tag.get("data-phone") or phone_tag.get_text(strip=True)

            # Address
            addr_tag = item.find(class_=re.compile(r"address|addr|locname"))
            address = addr_tag.get_text(strip=True) if addr_tag else ""

            # Website link (sometimes present)
            web_tag = item.find("a", href=re.compile(r"^https?://(?!www\.justdial)"))
            website = web_tag["href"] if web_tag else ""

            # Rating
            rating_tag = item.find(class_=re.compile(r"green-box|rating"))
            rating = rating_tag.get_text(strip=True) if rating_tag else ""

            results.append({
                "clinic": clinic_name,
                "phone": phone,
                "address": address,
                "website": website,
                "rating": rating,
            })

        except Exception:
            continue

    return results


def _extract_email_from_website(website: str) -> str:
    """Scrapes homepage for mailto: email links."""
    if not website:
        return ""
    try:
        resp = requests.get(
            website, timeout=8,
            headers={"User-Agent": random.choice(USER_AGENTS)}
        )
        emails = re.findall(
            r"mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})",
            resp.text
        )
        if emails:
            return emails[0].lower()

        # Also look for plain emails in page text
        emails = re.findall(
            r"\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b",
            resp.text
        )
        # Filter out image/asset emails, keep real ones
        emails = [e for e in emails if not re.search(r"\.(png|jpg|gif|svg|css|js)$", e)]
        if emails:
            return emails[0].lower()
    except Exception:
        pass
    return ""


def _guess_email(website: str) -> str:
    """Guesses info@ email from website domain."""
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


def scrape_justdial(
    cities: list[str],
    specialties: list[str] = None,
    max_pages: int = 3,
    max_per_combo: int = 20,
) -> list[dict]:
    """
    Main JustDial scraper.

    cities     — list of city names e.g. ["Mumbai", "Pune"]
    specialties — list of specialty labels e.g. ["Ophthalmologist", "Dentist"]
                  defaults to all SPECIALTY_SLUGS keys
    max_pages  — how many result pages to scrape per city+specialty combo
    max_per_combo — cap leads per city+specialty

    Returns list of lead dicts ready for Google Sheets import.
    """
    if specialties is None:
        specialties = list(SPECIALTY_SLUGS.keys())

    all_leads = []
    seen_clinics = set()

    for city in cities:
        city_slug = CITY_SLUGS.get(city, city)

        for specialty in specialties:
            specialty_slug = SPECIALTY_SLUGS.get(specialty)
            if not specialty_slug:
                print(f"  ⚠ No slug for specialty: {specialty}")
                continue

            print(f"  Scraping JustDial: {specialty} in {city}...")
            count = 0

            for page in range(1, max_pages + 1):
                if count >= max_per_combo:
                    break

                url = _build_url(city_slug, specialty_slug, page)
                resp = _get(url)
                if not resp:
                    break

                listings = _parse_listings(resp.text)

                if not listings:
                    print(f"    No listings found on page {page} (may be JS-rendered or blocked)")
                    break

                for item in listings:
                    if count >= max_per_combo:
                        break

                    clinic_name = item["clinic"]
                    key = f"{clinic_name}_{city}".lower()
                    if key in seen_clinics:
                        continue
                    seen_clinics.add(key)

                    # Try to get email from website
                    email = ""
                    if item["website"]:
                        email = _extract_email_from_website(item["website"])
                        if not email:
                            email = _guess_email(item["website"])

                    # Skip leads with no email
                    if not email:
                        continue

                    lead = {
                        "name": "",
                        "email": email,
                        "specialty": specialty,
                        "clinic": clinic_name,
                        "city": city,
                        "status": "new",
                        "step": 0,
                        "next_send_date": "",
                        "last_sent_date": "",
                        "notes": f"Phone: {item['phone']} | {item['address']} | Rating: {item['rating']} | JustDial",
                    }

                    all_leads.append(lead)
                    count += 1
                    print(f"    ✓ {clinic_name} — {email}")

                _random_delay()

            print(f"    → {count} leads from {city} / {specialty}")

    print(f"\n  JustDial total: {len(all_leads)} leads found")
    return all_leads
