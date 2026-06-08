"""
Practo clinic scraper.
Scrapes doctor listings from practo.com — India's largest doctor discovery platform.
Uses Playwright to render JS pages.
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

# Practo specialty slugs
SPECIALTY_SLUGS = {
    "General Physician":  "general-physician",
    "Pediatrician":       "pediatrician",
    "Ophthalmologist":    "ophthalmologist",
    "Dentist":            "dentist",
    "Gynecologist":       "gynecologist",
    "Dermatologist":      "dermatologist",
    "Orthopedic":         "orthopedic-surgeon",
    "Cardiologist":       "cardiologist",
    "ENT":                "ent-specialist",
    "Diabetologist":      "diabetologist",
}

CITY_SLUGS = {
    "Mumbai": "mumbai", "Delhi": "delhi", "Bangalore": "bangalore",
    "Hyderabad": "hyderabad", "Pune": "pune", "Chennai": "chennai",
    "Ahmedabad": "ahmedabad", "Jaipur": "jaipur", "Surat": "surat",
    "Lucknow": "lucknow", "Kolkata": "kolkata", "Chandigarh": "chandigarh",
    "Nagpur": "nagpur", "Indore": "indore", "Kochi": "kochi",
}


def _save_debug(html: str, name: str):
    if not DEBUG:
        return
    os.makedirs(DEBUG_DIR, exist_ok=True)
    path = os.path.join(DEBUG_DIR, f"practo_{name}.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"    [DEBUG] Saved → {path}")


def _find_email(text: str) -> str:
    skip = re.compile(r"\.(png|jpg|gif|svg|css|js|woff)|example\.com|sentry|noreply|@2x", re.I)
    emails = re.findall(r"\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b", text)
    emails = [e.lower() for e in emails if not skip.search(e)]
    return emails[0] if emails else ""


def _email_from_website(website: str) -> str:
    if not website:
        return ""
    try:
        resp = requests.get(website, timeout=8, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        })
        email = _find_email(resp.text)
        if email:
            return email
        domain = urlparse(website).netloc.replace("www.", "")
        return f"info@{domain}" if domain else ""
    except Exception:
        return ""


def _google_search_email(clinic: str, city: str) -> str:
    query = f'"{clinic}" "{city}" email OR contact'
    url = f"https://www.google.com/search?q={quote_plus(query)}&num=5"
    try:
        resp = requests.get(url, timeout=10, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept-Language": "en-IN,en;q=0.9",
        })
        return _find_email(resp.text)
    except Exception:
        return ""


def _parse_practo(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")

    # Practo doctor cards
    cards = (
        soup.find_all("div", class_=re.compile(r"doctor-card|info-section|u-border-general")) or
        soup.find_all("div", attrs={"data-qa-id": re.compile(r"doctor|listing")}) or
        soup.find_all("div", class_=re.compile(r"listing-header|doctor-name"))
    )

    print(f"    Found {len(cards)} raw cards")

    results = []
    seen_names = set()

    for card in cards:
        try:
            # Doctor / clinic name
            name_tag = (
                card.find("h2") or
                card.find(attrs={"data-qa-id": "doctor_name"}) or
                card.find(class_=re.compile(r"doctor-name|name|title"))
            )
            name = name_tag.get_text(strip=True) if name_tag else ""
            if not name or name.lower() in seen_names:
                continue
            seen_names.add(name.lower())

            # Clinic name
            clinic_tag = (
                card.find(attrs={"data-qa-id": "practice_name"}) or
                card.find(class_=re.compile(r"clinic-name|practice|hospital"))
            )
            clinic = clinic_tag.get_text(strip=True) if clinic_tag else name

            # Address
            addr_tag = (
                card.find(attrs={"data-qa-id": "practice_locality"}) or
                card.find(class_=re.compile(r"address|locality|location"))
            )
            address = addr_tag.get_text(strip=True) if addr_tag else ""

            # Practo profile link
            link_tag = card.find("a", href=re.compile(r"/doctor/"))
            profile_url = f"https://www.practo.com{link_tag['href']}" if link_tag else ""

            results.append({
                "doctor": name,
                "clinic": clinic,
                "address": address,
                "profile_url": profile_url,
            })
        except Exception:
            continue

    return results


def _get_email_from_practo_profile(page, profile_url: str) -> tuple[str, str]:
    """
    Visits the doctor's Practo profile to get clinic website.
    Returns (website, email).
    """
    if not profile_url:
        return "", ""
    try:
        page.goto(profile_url, wait_until="domcontentloaded", timeout=15000)
        time.sleep(1.5)
        html = page.content()

        soup = BeautifulSoup(html, "html.parser")

        # Look for website link on profile
        web_tag = soup.find("a", href=re.compile(r"^https?://(?!www\.practo)"))
        website = web_tag["href"] if web_tag else ""

        # Look for email directly on profile page
        email = _find_email(html)

        return website, email
    except Exception:
        return "", ""


def scrape_practo(
    cities: list[str],
    specialties: list[str] = None,
    max_pages: int = 3,
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
        page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}", lambda r: r.abort())

        for city in cities:
            city_slug = CITY_SLUGS.get(city, city.lower())

            for specialty in specialties:
                specialty_slug = SPECIALTY_SLUGS.get(specialty)
                if not specialty_slug:
                    continue

                print(f"  Scraping Practo: {specialty} in {city}...")
                count = 0

                for pg in range(1, max_pages + 1):
                    if count >= max_per_combo:
                        break

                    url = f"https://www.practo.com/{city_slug}/{specialty_slug}?page={pg}"

                    try:
                        page.goto(url, wait_until="networkidle", timeout=25000)
                        time.sleep(random.uniform(2.0, 3.5))
                    except Exception as e:
                        print(f"    ⚠ Page load failed: {e}")
                        break

                    html = page.content()
                    _save_debug(html, f"{city}_{specialty}_pg{pg}".replace(" ", "_"))

                    listings = _parse_practo(html)
                    if not listings:
                        print(f"    ⚠ No listings on page {pg}")
                        break

                    for item in listings:
                        if count >= max_per_combo:
                            break

                        key = f"{item['clinic']}_{city}".lower()
                        if key in seen:
                            continue
                        seen.add(key)

                        # Try to get email
                        email = ""

                        # 1. Check Practo profile for website/email
                        if item["profile_url"]:
                            website, email = _get_email_from_practo_profile(page, item["profile_url"])
                            if not email and website:
                                email = _email_from_website(website)
                            # go back to listing page
                            page.go_back()
                            time.sleep(1.0)

                        # 2. Google search fallback
                        if not email:
                            email = _google_search_email(item["clinic"], city)
                            time.sleep(random.uniform(1.5, 2.5))

                        if not email:
                            print(f"    ✗ No email: {item['clinic']}")
                            continue

                        all_leads.append({
                            "name": item["doctor"],
                            "email": email,
                            "specialty": specialty,
                            "clinic": item["clinic"],
                            "city": city,
                            "status": "new",
                            "step": 0,
                            "next_send_date": "",
                            "last_sent_date": "",
                            "notes": f"{item['address']} | Practo",
                        })
                        count += 1
                        print(f"    ✓ {item['clinic']} ({item['doctor']}) — {email}")

                print(f"    → {count} leads from {city} / {specialty}")

        browser.close()

    print(f"\n  Practo total: {len(all_leads)} leads")
    return all_leads
