"""
JustDial clinic scraper using Playwright (headless browser).
Bypasses 403 blocks that affect plain requests.

Install: pip install playwright && playwright install chromium
"""

import re
import time
import random
from playwright.sync_api import sync_playwright

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
    "Mumbai":     "Mumbai",
    "Delhi":      "Delhi",
    "Bangalore":  "Bangalore",
    "Hyderabad":  "Hyderabad",
    "Pune":       "Pune",
    "Chennai":    "Chennai",
    "Ahmedabad":  "Ahmedabad",
    "Jaipur":     "Jaipur",
    "Surat":      "Surat",
    "Lucknow":    "Lucknow",
    "Kolkata":    "Kolkata",
    "Chandigarh": "Chandigarh",
    "Nagpur":     "Nagpur",
    "Indore":     "Indore",
    "Kochi":      "Kochi",
}


def _extract_email_from_text(text: str) -> str:
    emails = re.findall(
        r"\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b", text
    )
    emails = [e for e in emails if not re.search(r"\.(png|jpg|gif|svg|css|js)$", e)]
    return emails[0].lower() if emails else ""


def _guess_email(website: str) -> str:
    if not website:
        return ""
    try:
        from urllib.parse import urlparse
        domain = urlparse(website).netloc.replace("www.", "")
        return f"info@{domain}" if domain else ""
    except Exception:
        return ""


def _parse_page(page) -> list[dict]:
    """Extract listings from current Playwright page."""
    results = []

    # Wait for listings to load
    try:
        page.wait_for_selector("li.cntanr, div.resultbox, div.jdResultBox", timeout=8000)
    except Exception:
        pass

    html = page.content()
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")

    listings = (
        soup.find_all("li", class_=re.compile(r"cntanr")) or
        soup.find_all("div", class_=re.compile(r"resultbox|jdResultBox|store-details"))
    )

    for item in listings:
        try:
            name_tag = (
                item.find("span", class_=re.compile(r"lng_cont_name|store-name")) or
                item.find("h2") or
                item.find("a", class_=re.compile(r"store-name|title"))
            )
            clinic_name = name_tag.get_text(strip=True) if name_tag else ""
            if not clinic_name:
                continue

            phone_tag = item.find(attrs={"data-phone": True})
            phone = phone_tag.get("data-phone", "") if phone_tag else ""

            addr_tag = item.find(class_=re.compile(r"address|addr|locname"))
            address = addr_tag.get_text(strip=True) if addr_tag else ""

            web_tag = item.find("a", href=re.compile(r"^https?://(?!www\.justdial)"))
            website = web_tag["href"] if web_tag else ""

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


def scrape_justdial(
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
            args=["--no-sandbox", "--disable-setuid-sandbox"]
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
            locale="en-IN",
        )
        page = context.new_page()

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
                        page.goto(url, wait_until="domcontentloaded", timeout=20000)
                        time.sleep(random.uniform(2.0, 3.5))
                    except Exception as e:
                        print(f"    ⚠ Page load failed: {e}")
                        break

                    listings = _parse_page(page)
                    if not listings:
                        print(f"    No listings on page {pg}")
                        break

                    for item in listings:
                        if count >= max_per_combo:
                            break

                        key = f"{item['clinic']}_{city}".lower()
                        if key in seen:
                            continue
                        seen.add(key)

                        # Try to get email from website
                        email = ""
                        if item["website"]:
                            email = _guess_email(item["website"])

                        if not email:
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
