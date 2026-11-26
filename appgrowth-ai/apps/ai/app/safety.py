"""Deterministic checks on generated creative text. Flags are stored with the creative; flagged items need human review."""
import re

PLATFORM_RULES: list[tuple[str, str]] = [
    (r"\bguarantee(d|s)?\b", "Guarantee claims are not allowed"),
    (r"(#\s?1|number one|no\.\s?1)\b", "Ranking claims need proof"),
    (r"\b(best|top[- ]rated|award[- ]winning)\b", "Superlatives need substantiation"),
    (r"\b(cure[sd]?|heal[s]?|treat[s]? (?:your )?(?:disease|diabetes|cancer|depression))\b", "Medical outcome claims are not allowed"),
    (r"\b(100\s?%|risk[- ]free)\b", "Absolute claims are not allowed"),
    (r"\b(\d[\d,.]*\s?(k|m|million|lakh|crore)?\+?\s?(users|downloads|customers))\b", "User/download counts must be verified"),
    (r"[\"“][^\"”]{12,}[\"”]\s*[—-]\s*[A-Z][a-z]+", "Looks like a testimonial quote; fabricated testimonials are not allowed"),
    (r"\b(\d(\.\d)?\s?(stars?|★))\b", "Rating claims must match the store"),
    (r"\b(earn money|get rich|free money)\b", "Financial promises are not allowed"),
    (r"\b(click here|download now or)\b", "Coercive phrasing"),
]
CHAR_LIMITS = {("GOOGLE_ADS", "HEADLINE"): 30, ("GOOGLE_ADS", "DESCRIPTION"): 90, ("TIKTOK_ADS", "AD_COPY"): 100, ("META_ADS", "HEADLINE"): 40}


def check_text(text: str, banned: list[str], *, verified_facts: str = "") -> list[str]:
    """Returns human-readable policy flags. `verified_facts` (store listing text) whitelists claims it already contains."""
    flags = []
    low = text.lower()
    facts = verified_facts.lower()
    for phrase in banned:
        p = phrase.strip().lower()
        if p and p in low:
            flags.append(f"Uses a banned claim: “{phrase.strip()}”")
    for pattern, message in PLATFORM_RULES:
        m = re.search(pattern, text, flags=re.IGNORECASE)
        if m and m.group(0).lower() not in facts:
            flags.append(f"{message} (“{m.group(0)}”)")
    return sorted(set(flags))


def check_limits(provider: str, ctype: str, headline: str, body: str) -> list[str]:
    flags = []
    lim = CHAR_LIMITS.get((provider, ctype))
    if lim and ctype == "HEADLINE" and len(headline) > lim:
        flags.append(f"Headline is {len(headline)} characters; {provider} allows {lim}")
    if lim and ctype in ("DESCRIPTION", "AD_COPY") and len(body) > lim:
        flags.append(f"Text is {len(body)} characters; {provider} allows {lim}")
    return flags
