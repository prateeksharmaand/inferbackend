"""
JustDial clinic scraper using Playwright (headless browser).
Falls back to Google search to find clinic emails when JustDial
doesn't list a website.
"""

import re
import os
import time
import random
import requests
from urllib.parse import urlparse, quote_plus
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup

DEBUG = os.environ.get("SCRAPER_DEBUG", "false").lower() == "true"
DEBUG_DIR = os.path.join(os.path.dirname(__file__), "..", "debug_html")

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

CITY_SLUGS = {
    "Mumbai": "Mumbai", "Delhi": "Delhi", "Bangalore": "Bangalore",
    "Hyderabad": "Hyderabad", "Pune": "Pune", "Chennai": "Chennai",
    "Ahmedabad": "Ahmedabad", "Jaipur": "Jaipur", "Surat": "Surat",
    "Lucknow": "Lucknow", "Kolkata": "Kolkata", "Chandigarh": "Chandigarh",
    "Nagpur": "Nagpur", "Indore": "Indore", "Kochi": "Kochi",
}


def _save_debug(html: str, name: str):
    if not DEBUG:
        return
    os.makedirs(DEBUG_DIR, exist_ok=True)
    path = os.path.join(DEBUG_DIR, f"{name}.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"    [DEBUG] Saved HTML → {path}")


def _find_email_in_text(text: str) -> str:
    emails = re.findall(
        r"\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b", text
    )
    # Filter junk
    skip = re.compile(r"\.(png|jpg|gif|svg|css|js|woff)|example\.com|sentry|noreply", re.I)
    emails = [e for e in emails if not skip.search(e)]
    return emails[0].lower() if emails else ""


def _email_from_website(website: str) -> str:
    """Fetch clinic website and look for email."""
    if not website:
        return ""
    try:
        resp = requests.get(
            website, timeout=8,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        email = _find_email_in_text(resp.text)
        if email:
            return email
        # Guess info@ from domain
        domain = urlparse(website).netloc.replace("www.", "")
        if domain:
            return f"info@{domain}"
    except Exception:
        pass
    return ""


def _google_search_email(clinic_name: str, city: str) -> str:
    """
    Uses Google search to find a clinic's email address.
    Searches: "clinic name city" email contact
    """
    query = f'"{clinic_name}" "{city}" email contact'
    url = f"https://www.google.com/search?q={quote_plus(query)}&num=5"
    try:
        resp = requests.get(
            url, timeout=10,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept-Language": "en-IN,en;q=0.9",
            }
        )
        email = _find_email_in_text(resp.text)
        if email:
            return email
    except Exception:
        pass
    return ""


def _parse_listings(html: str) -> list[dict]:
    """
    Flexible parser — tries multiple selector strategies.
    Prints what it finds so we can debug.
    """
    soup = BeautifulSoup(html, "html.parser")

    # Strategy 1: known JustDial list item classes
    listings = soup.find_all("li", class_=re.compile(r"cntanr|resultbox|store-list"))

    # Strategy 2: script/json data embedded in page
    if not listings:
        listings = soup.find_all("div", class_=re.compile(
            r"resultbox|jdResultBox|store-details|storename|_32KOX|_3OzSC"
        ))

    # Strategy 3: any list items with an h2 or h3 (clinic name)
    if not listings:
        listings = [li for li in soup.find_all("li") if li.find(["h2", "h3"])]

    print(f"    Found {len(listings)} raw listing elements")

    results = []
    for item in listings:
        try:
            # Name: try h2, h3, span with common classes, or first anchor
            name_tag = (
                item.find(["h2", "h3"]) or
                item.find("span", class_=re.compile(r"name|title|store|lng_cont")) or
                item.find("a", class_=re.compile(r"name|title|store"))
            )
            clinic_name = name_tag.get_text(strip=True) if name_tag else ""
            if not clinic_name or len(clinic_name) < 3:
                continue

            # Phone
            phone_tag = (
                item.find(attrs={"data-phone": True}) or
                item.find(class_=re.compile(r"contact|phone|mobile|call"))
            )
            phone = ""
            if phone_tag:
                phone = phone_tag.get("data-phone") or phone_tag.get_text(strip=True)

            # Address
            addr_tag = item.find(class_=re.compile(r"address|addr|loc|area"))
            address = addr_tag.get_text(strip=True) if addr_tag else ""

            # External website link
            web_tag = item.find("a", href=re.compile(r"^https?://(?!www\.justdial|javascript)"))
            website = ""
            if web_tag:
                href = web_tag.get("href", "")
                if "justdial" not in href:
                    website = href

            # Rating
            rating_tag = item.find(class_=re.compile(r"green-box|rating|star"))
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


def scrape_justdial(
    cities: list[str],
    specialties: list[str] = None,
    max_pages: int = 2,
    max_per_combo: int = 20,
) -> list[dict]:

    if specialties is None:
        specialties = list(SPECIALTY_SLUGS.keys())

    all_leads = []
    seen = set()

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1366, "height": 768},
            locale="en-IN",
        )
        page = context.new_page()

        # Block images/fonts to speed up
        page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}", lambda r: r.abort())

        for city in cities:
            city_slug = CITY_SLUGS.get(city, city)

            for specialty in specialties:
                specialty_slug = SPECIALTY_SLUGS.get(specialty)
                if not specialty_slug:
                    continue

                print(f"  Scraping JustDial: {specialty} in {city}...")
                count = 0

                for pg in range(1, max_pages + 1):
                    if count >= max_per_combo:
                        break

                    url = f"https://www.justdial.com/{city_slug}/{specialty_slug}"
                    if pg > 1:
                        url += f"/page-{pg}"

                    try:
                        page.goto(url, wait_until="networkidle", timeout=25000)
                        time.sleep(random.uniform(2.5, 4.0))
                    except Exception as e:
                        print(f"    ⚠ Page load failed: {e}")
                        break

                    html = page.content()
                    _save_debug(html, f"{city}_{specialty}_pg{pg}".replace(" ", "_"))

                    listings = _parse_listings(html)

                    if not listings:
                        print(f"    ⚠ No listings parsed — enable SCRAPER_DEBUG=true to inspect HTML")
                        break

                    for item in listings:
                        if count >= max_per_combo:
                            break

                        key = f"{item['clinic']}_{city}".lower()
                        if key in seen:
                            continue
                        seen.add(key)

                        # Try website first, then Google search
                        email = ""
                        if item["website"]:
                            email = _email_from_website(item["website"])

                        if not email:
                            print(f"    ↳ Searching Google for email: {item['clinic']}...")
                            email = _google_search_email(item["clinic"], city)
                            time.sleep(random.uniform(1.5, 3.0))  # be polite to Google

                        if not email:
                            print(f"    ✗ No email found: {item['clinic']}")
                            continue

                        all_leads.append({
                            "name": "",
                            "email": email,
                            "specialty": specialty,
                            "clinic": item["clinic"],
                            "city": city,
                            "status": "new",
                            "step": 0,
                            "next_send_date": "",
                            "last_sent_date": "",
                            "notes": f"Phone: {item['phone']} | {item['address']} | Rating: {item['rating']} | JustDial",
                        })
                        count += 1
                        print(f"    ✓ {item['clinic']} — {email}")

                print(f"    → {count} leads from {city} / {specialty}")

        browser.close()

    print(f"\n  JustDial total: {len(all_leads)} leads")
    return all_leads
