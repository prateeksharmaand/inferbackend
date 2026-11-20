"""Canonical skill vocabulary used for keyword extraction from resumes and job descriptions.
Each canonical name maps to the regex aliases that count as a mention."""
import re

SKILLS: dict[str, tuple[str, list[str]]] = {
    # name: (category, aliases-as-regex)
    "Flutter": ("technical", [r"flutter"]),
    "Dart": ("technical", [r"\bdart\b"]),
    "Android": ("platform", [r"\bandroid\b"]),
    "iOS": ("platform", [r"\bios\b"]),
    "Kotlin": ("technical", [r"\bkotlin\b"]),
    "Java": ("technical", [r"\bjava\b(?!script)"]),
    "Swift": ("technical", [r"\bswift\b(?!ui)"]),
    "SwiftUI": ("technical", [r"\bswiftui\b"]),
    "Objective-C": ("technical", [r"objective[- ]?c\b"]),
    "React Native": ("technical", [r"react[- ]native"]),
    "Jetpack Compose": ("technical", [r"jetpack compose|\bcompose ui\b"]),
    "BLoC": ("technical", [r"\bbloc\b"]),
    "Provider": ("technical", [r"\bprovider\b(?= (state|pattern|package))|\bprovider\b,"]),
    "Riverpod": ("technical", [r"riverpod"]),
    "GetX": ("technical", [r"\bgetx\b"]),
    "Clean Architecture": ("technical", [r"clean architecture"]),
    "MVVM": ("technical", [r"\bmvvm\b"]),
    "MVP": ("technical", [r"\bmvp\b(?! ?\()"]),
    "Design Patterns": ("technical", [r"design patterns?"]),
    "Mobile Architecture": ("technical", [r"mobile (application |app )?architect", r"application (lifecycle )?architecture"]),
    "SDK Design": ("technical", [r"\bsdks?\b"]),
    "Offline-first / Local DB": ("technical", [r"offline", r"\bsqlite\b", r"\broom\b", r"\bhive\b", r"\bisar\b"]),
    "ORM": ("technical", [r"\borms?\b"]),
    "REST APIs": ("technical", [r"\brest(ful)?\b", r"api integration", r"\bhttp\b"]),
    "GraphQL": ("technical", [r"graphql"]),
    "WebSockets": ("technical", [r"web ?sockets?|\bsockets\b"]),
    "Firebase": ("tool", [r"firebase"]),
    "Google Maps": ("technical", [r"google maps"]),
    "Bluetooth LE": ("technical", [r"bluetooth low energy|\bble\b"]),
    "IoT": ("domain", [r"\biot\b"]),
    "Payments": ("domain", [r"\bpayments?\b", r"razorpay", r"\baeps\b", r"micro atm", r"\bupi\b"]),
    "Biometrics": ("technical", [r"biometric"]),
    "RxJava / RxBus": ("technical", [r"\brx ?(java|bus|dart)\b"]),
    "Material Design": ("technical", [r"material (design|libraries)"]),
    "Animations": ("technical", [r"animation"]),
    "Platform Channels": ("technical", [r"platform channels?|method channel"]),
    "Isolates": ("technical", [r"\bisolates?\b"]),
    "Performance Optimization": ("technical", [r"performance optimi[sz]", r"optimi[sz]ation"]),
    "App Security": ("technical", [r"(mobile|app(lication)?) security"]),
    "SSL Pinning": ("technical", [r"(ssl|certificate) pinning"]),
    "Encryption": ("technical", [r"encrypt"]),
    "Secure Storage": ("technical", [r"secure storage|keychain|keystore"]),
    "OAuth / Auth": ("technical", [r"\boauth\b|authentication"]),
    "CI/CD": ("tool", [r"\bci ?/ ?cd\b", r"continuous (integration|delivery|deployment)"]),
    "Codemagic": ("tool", [r"codemagic"]),
    "Fastlane": ("tool", [r"fastlane"]),
    "GitHub Actions": ("tool", [r"github actions"]),
    "Jenkins": ("tool", [r"jenkins"]),
    "Bitrise": ("tool", [r"bitrise"]),
    "Git": ("tool", [r"\bgit\b", r"bitbucket", r"github", r"gitlab"]),
    "Xcode": ("tool", [r"xcode"]),
    "Android Studio": ("tool", [r"android studio"]),
    "Gradle": ("tool", [r"gradle"]),
    "SonarQube": ("tool", [r"sonarqube|sonar\b"]),
    "Unit / Widget Testing": ("technical", [r"unit test|widget test|integration test|automated test"]),
    "App Store Release": ("technical", [r"app ?store|testflight|store submission|play store|google play|store releases?"]),
    "Docker": ("tool", [r"docker"]),
    "AWS": ("tool", [r"\baws\b"]),
    "Node.js": ("technical", [r"node\.?js"]),
    "Team Leadership": ("leadership", [r"team (lead|handling|management)", r"\bled engineering teams?\b", r"engineering team lead", r"technical lead"]),
    "Agile / Scrum": ("leadership", [r"agile|scrum"]),
    "Code Review": ("leadership", [r"code reviews?|reviewing .*pull requests"]),
    "Estimation & Planning": ("leadership", [r"estimation|planning"]),
    "Stakeholder Management": ("leadership", [r"stakeholder|client communication|cross-functional"]),
    "Technical Documentation": ("leadership", [r"documentation|playbook"]),
    "Mentoring": ("leadership", [r"mentor"]),
    "Hiring": ("leadership", [r"\bhiring\b|interview(ing)? candidates"]),
    "LiveOps": ("domain", [r"liveops"]),
    "E-commerce": ("domain", [r"e-?commerce"]),
    "Healthcare": ("domain", [r"health ?care|hospital|patient|clinical"]),
    "Fintech": ("domain", [r"fintech|banking|money transfer|\bdmt\b"]),
}

_COMPILED = {name: (cat, [re.compile(a, re.I) for a in aliases]) for name, (cat, aliases) in SKILLS.items()}


def find_skills(text: str) -> dict[str, str]:
    """Return {canonical_skill: category} for every skill literally mentioned in text."""
    found = {}
    for name, (cat, pats) in _COMPILED.items():
        if any(p.search(text) for p in pats):
            found[name] = cat
    return found


def canonical(name: str) -> str:
    n = name.strip()
    for canon, (_, pats) in _COMPILED.items():
        if canon.lower() == n.lower() or any(p.fullmatch(n) for p in pats):
            return canon
    found = find_skills(n)
    return next(iter(found)) if len(found) == 1 else n


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9+#]", "", canonical(name).lower())
