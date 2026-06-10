"""
4 professional HTML email templates for Infer EMR outreach.
One per sequence step — each with a different focus and design.
Theme: #7B6EF6 purple, Poppins font, matching inferapp.online
"""

YOUTUBE_LINK   = "https://www.youtube.com/watch?v=dukqzJ1rh1Y&t=234s"
CALENDLY_LINK  = "https://calendly.com/prateeksharmaand/30min"
WEBSITE_LINK   = "https://inferapp.online"
SUPPORT_EMAIL  = "support@inferapp.online"
PHONE          = "+91 96502 69758"
WHATSAPP       = "https://wa.me/919650269758"
TRACKING_BASE  = "https://api.inferapp.online/api/track/open"

# ── Shared components ─────────────────────────────────────────────────────────

def _header(title: str, subtitle: str = "") -> str:
    return f"""
    <tr>
      <td style="background:linear-gradient(135deg,#3A2ED4 0%,#7B6EF6 100%);border-radius:16px 16px 0 0;padding:36px 40px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
              <p style="margin:0 0 20px 0;font-size:13px;font-weight:600;color:rgba(255,255,255,0.7);letter-spacing:2px;text-transform:uppercase;">Infer EMR</p>
              <h1 style="margin:0 0 8px 0;font-size:28px;font-weight:700;color:#ffffff;line-height:1.3;">{title}</h1>
              {f'<p style="margin:0;font-size:15px;color:rgba(255,255,255,0.8);line-height:1.6;">{subtitle}</p>' if subtitle else ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>"""


def _footer() -> str:
    return f"""
    <tr>
      <td style="background:#F8F7FF;border-radius:0 0 16px 16px;padding:24px 40px;border-top:1px solid #E7E0EC;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
              <p style="margin:0 0 6px 0;font-size:13px;font-weight:700;color:#1C1B1F;">Prateek Sharma</p>
              <p style="margin:0 0 4px 0;font-size:12px;color:#938F99;">Co-Founder, Infer EMR</p>
              <p style="margin:0 0 4px 0;font-size:12px;color:#938F99;">
                <a href="{WEBSITE_LINK}" style="color:#7B6EF6;text-decoration:none;">{WEBSITE_LINK}</a>
                &nbsp;&middot;&nbsp;
                <a href="mailto:{SUPPORT_EMAIL}" style="color:#7B6EF6;text-decoration:none;">{SUPPORT_EMAIL}</a>
              </p>
              <p style="margin:0;font-size:12px;color:#938F99;">
                <a href="tel:{PHONE.replace(' ','')}" style="color:#7B6EF6;text-decoration:none;">&#128222; {PHONE}</a>
                &nbsp;&middot;&nbsp;
                <a href="{WHATSAPP}" style="color:#25D366;text-decoration:none;">&#128172; WhatsApp</a>
              </p>
            </td>
            <td align="right" valign="top">
              <p style="margin:0;font-size:11px;color:#CAC4D0;line-height:1.6;">
                You received this email because<br/>we think Infer EMR can help<br/>your practice grow.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>"""


def _wrap(content_rows: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#F5F4FF;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F4FF;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          {content_rows}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


# ── Template 1 — Day 1: Introduction + Demo ───────────────────────────────────

def template_1(doctor_name: str, clinic_name: str, specialty: str, body_text: str) -> str:
    paragraphs = "\n".join(
        f'<p style="margin:0 0 14px 0;font-size:15px;color:#49454F;line-height:1.75;">{l.strip()}</p>'
        for l in body_text.strip().splitlines() if l.strip()
    )

    features = [
        ("&#128172;", "AI Voice Scribe", "Dictate prescriptions, no typing"),
        ("&#128203;", "Smart Queue", "Real-time OPD management"),
        ("&#129657;", "InferPad", "40+ vitals, ICD-10, LOINC"),
        ("&#128200;", "Analytics", "Prescription & revenue insights"),
    ]
    feature_cells = ""
    for icon, title, desc in features:
        feature_cells += f"""
        <td width="25%" style="padding:0 6px;" valign="top">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:#F8F7FF;border-radius:12px;padding:16px;border:1px solid #E7E0EC;">
            <tr><td align="center" style="font-size:24px;padding-bottom:8px;">{icon}</td></tr>
            <tr><td align="center" style="font-size:12px;font-weight:700;color:#1C1B1F;padding-bottom:4px;">{title}</td></tr>
            <tr><td align="center" style="font-size:11px;color:#938F99;line-height:1.5;">{desc}</td></tr>
          </table>
        </td>"""

    return _wrap(f"""
    {_header(f"Hello, {doctor_name} 👋", f"Here's how Infer EMR can transform {clinic_name}")}
    <tr>
      <td style="background:#ffffff;padding:36px 40px 32px;">
        {paragraphs}
        <hr style="border:none;border-top:1px solid #E7E0EC;margin:24px 0;"/>
        <p style="margin:0 0 16px 0;font-size:13px;font-weight:700;color:#938F99;letter-spacing:1.5px;text-transform:uppercase;">What you get with Infer</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>{feature_cells}</tr>
        </table>
        <hr style="border:none;border-top:1px solid #E7E0EC;margin:24px 0;"/>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center">
              <a href="{YOUTUBE_LINK}" target="_blank"
                 style="display:inline-block;background:linear-gradient(135deg,#3A2ED4,#7B6EF6);color:#fff;font-size:15px;font-weight:700;padding:15px 36px;border-radius:12px;text-decoration:none;margin:0 6px 10px;">
                &#9654;&nbsp; Watch 2-min Demo
              </a>
              <a href="{CALENDLY_LINK}" target="_blank"
                 style="display:inline-block;background:#fff;color:#7B6EF6;font-size:15px;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;border:2px solid #7B6EF6;margin:0 6px 10px;">
                &#128197;&nbsp; Book Free Demo
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    {_footer()}""")


# ── Template 2 — Day 4: Specialty Feature Highlight ──────────────────────────

SPECIALTY_HIGHLIGHTS = {
    "Ophthalmologist":    ("&#128065;", "Complete Eye Examination Module", "Visual acuity, refraction, IOP, biometry, pachymetry — all 12 sections in one screen. No more paper charts."),
    "Dentist":            ("&#129463;", "Interactive Dental Chart", "Click any tooth, add findings, track procedures — built right into the prescription."),
    "Pediatrician":       ("&#128118;", "WHO/IAP Growth Charts", "Auto-plotted for patients under 15. Vaccination tracker per IAP schedule. Built in."),
    "Gynecologist":       ("&#129297;", "Complete OB-GYN Documentation", "LMP tracking, antenatal records, and complete women's health vitals in one InferPad."),
    "Dermatologist":      ("&#127774;", "Skin Condition Tracker", "Document findings with drawings, track treatment response, and auto-generate referral letters."),
    "Cardiologist":       ("&#10084;", "Cardiac Vitals & Analytics", "BP trends, ECG notes, medication tracking and prescription analytics — all automated."),
    "Diabetologist":      ("&#129528;", "Diabetes Management Suite", "HbA1c, FBS, PPBS, insulin tracking, diet chart, and patient compliance analytics."),
    "Orthopedic":         ("&#129461;", "Procedure & Injection Tracker", "Document procedures, injections with route & dose, and generate referral letters in one click."),
    "ENT":                ("&#128066;", "ENT Examination Module", "Dedicated ear, nose, throat findings with structured documentation and ICD-10 coding."),
    "General Physician":  ("&#127973;", "Complete OPD Workflow", "From check-in to prescription to billing — your entire OPD in one screen, zero paper."),
}

def template_2(doctor_name: str, clinic_name: str, specialty: str, body_text: str) -> str:
    icon, feature_title, feature_desc = SPECIALTY_HIGHLIGHTS.get(
        specialty, ("&#9889;", "AI-Powered Clinical Tools", "Built for your specialty from day one.")
    )
    paragraphs = "\n".join(
        f'<p style="margin:0 0 14px 0;font-size:15px;color:#49454F;line-height:1.75;">{l.strip()}</p>'
        for l in body_text.strip().splitlines() if l.strip()
    )

    return _wrap(f"""
    {_header(f"A feature built just for {specialty}s", clinic_name)}
    <tr>
      <td style="background:#ffffff;padding:36px 40px 32px;">
        {paragraphs}
        <!-- Specialty highlight card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
          <tr>
            <td style="background:linear-gradient(135deg,#EEEAFF,#F8F7FF);border-radius:16px;padding:28px 32px;border-left:4px solid #7B6EF6;">
              <p style="margin:0 0 8px 0;font-size:32px;">{icon}</p>
              <p style="margin:0 0 8px 0;font-size:17px;font-weight:700;color:#1C1B1F;">{feature_title}</p>
              <p style="margin:0;font-size:14px;color:#49454F;line-height:1.7;">{feature_desc}</p>
            </td>
          </tr>
        </table>
        <!-- Also includes -->
        <p style="margin:0 0 12px 0;font-size:13px;font-weight:700;color:#938F99;letter-spacing:1.5px;text-transform:uppercase;">Also included</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="50%" style="padding:0 8px 0 0;font-size:13px;color:#49454F;line-height:2;">&#10003;&nbsp; AI Voice Scribe</td>
            <td width="50%" style="font-size:13px;color:#49454F;line-height:2;">&#10003;&nbsp; ABHA Integration</td>
          </tr>
          <tr>
            <td style="padding:0 8px 0 0;font-size:13px;color:#49454F;line-height:2;">&#10003;&nbsp; Smart Queue Board</td>
            <td style="font-size:13px;color:#49454F;line-height:2;">&#10003;&nbsp; Billing & Receipts</td>
          </tr>
          <tr>
            <td style="padding:0 8px 0 0;font-size:13px;color:#49454F;line-height:2;">&#10003;&nbsp; ICD-10 & LOINC Codes</td>
            <td style="font-size:13px;color:#49454F;line-height:2;">&#10003;&nbsp; Prescription Analytics</td>
          </tr>
        </table>
        <hr style="border:none;border-top:1px solid #E7E0EC;margin:24px 0;"/>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center">
              <a href="{YOUTUBE_LINK}" target="_blank"
                 style="display:inline-block;background:linear-gradient(135deg,#3A2ED4,#7B6EF6);color:#fff;font-size:15px;font-weight:700;padding:15px 36px;border-radius:12px;text-decoration:none;margin:0 6px 10px;">
                &#9654;&nbsp; Watch Demo
              </a>
              <a href="{CALENDLY_LINK}" target="_blank"
                 style="display:inline-block;background:#fff;color:#7B6EF6;font-size:15px;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;border:2px solid #7B6EF6;margin:0 6px 10px;">
                &#128197;&nbsp; Book Free Demo
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    {_footer()}""")


# ── Template 3 — Day 8: Social Proof + Calendly Push ─────────────────────────

def template_3(doctor_name: str, clinic_name: str, specialty: str, body_text: str) -> str:
    paragraphs = "\n".join(
        f'<p style="margin:0 0 14px 0;font-size:15px;color:#49454F;line-height:1.75;">{l.strip()}</p>'
        for l in body_text.strip().splitlines() if l.strip()
    )

    stats = [
        ("2+ hrs", "saved daily on documentation"),
        ("40+", "vital parameters supported"),
        ("3 min", "average prescription time"),
        ("&#8377;0", "setup cost, no hardware needed"),
    ]
    stat_cells = ""
    for val, label in stats:
        stat_cells += f"""
        <td width="25%" style="padding:0 6px;" align="center">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:#F8F7FF;border-radius:12px;padding:20px 12px;border:1px solid #E7E0EC;">
            <tr><td align="center" style="font-size:22px;font-weight:700;color:#7B6EF6;padding-bottom:6px;">{val}</td></tr>
            <tr><td align="center" style="font-size:11px;color:#938F99;line-height:1.5;">{label}</td></tr>
          </table>
        </td>"""

    return _wrap(f"""
    {_header("See what Infer EMR delivers", f"15 minutes is all it takes, {doctor_name}")}
    <tr>
      <td style="background:#ffffff;padding:36px 40px 32px;">
        {paragraphs}
        <!-- Stats -->
        <p style="margin:0 0 16px 0;font-size:13px;font-weight:700;color:#938F99;letter-spacing:1.5px;text-transform:uppercase;">By the numbers</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
          <tr>{stat_cells}</tr>
        </table>
        <!-- Testimonial -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
          <tr>
            <td style="background:#EEEAFF;border-radius:12px;padding:24px 28px;border-left:4px solid #7B6EF6;">
              <p style="margin:0 0 12px 0;font-size:15px;color:#1C1B1F;line-height:1.7;font-style:italic;">
                "Infer EMR cut my prescription time from 8 minutes to under 3. The voice scribe alone is worth it."
              </p>
              <p style="margin:0;font-size:13px;font-weight:600;color:#7B6EF6;">— Dr. R. Mehta, General Physician, Pune</p>
            </td>
          </tr>
        </table>
        <hr style="border:none;border-top:1px solid #E7E0EC;margin:24px 0;"/>
        <!-- Primary CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center">
              <a href="{CALENDLY_LINK}" target="_blank"
                 style="display:inline-block;background:linear-gradient(135deg,#3A2ED4,#7B6EF6);color:#fff;font-size:16px;font-weight:700;padding:17px 48px;border-radius:12px;text-decoration:none;margin-bottom:12px;">
                &#128197;&nbsp; Book Your Free 15-min Demo
              </a>
              <br/>
              <a href="{YOUTUBE_LINK}" target="_blank"
                 style="font-size:13px;color:#7B6EF6;text-decoration:none;">
                Or watch the 2-min video first &#8594;
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    {_footer()}""")


# ── Template 4 — Day 14: Final Follow-up ─────────────────────────────────────

def template_4(doctor_name: str, clinic_name: str, specialty: str, body_text: str) -> str:
    paragraphs = "\n".join(
        f'<p style="margin:0 0 14px 0;font-size:15px;color:#49454F;line-height:1.75;">{l.strip()}</p>'
        for l in body_text.strip().splitlines() if l.strip()
    )

    return _wrap(f"""
    {_header(f"Last note, {doctor_name}", f"Leaving the door open for {clinic_name}")}
    <tr>
      <td style="background:#ffffff;padding:36px 40px 32px;">
        {paragraphs}
        <!-- What they're missing -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
          <tr>
            <td style="background:#F8F7FF;border-radius:16px;padding:28px 32px;border:1px solid #E7E0EC;">
              <p style="margin:0 0 16px 0;font-size:14px;font-weight:700;color:#1C1B1F;">What Infer EMR does for your practice:</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:13px;color:#49454F;padding:5px 0;">&#128172;&nbsp; <strong>Voice Scribe</strong> — prescriptions written while you speak</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#49454F;padding:5px 0;">&#128203;&nbsp; <strong>Smart Queue</strong> — real-time OPD board, zero chaos</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#49454F;padding:5px 0;">&#129657;&nbsp; <strong>InferPad</strong> — ICD-10, LOINC, 40+ vitals, specialty modules</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#49454F;padding:5px 0;">&#127973;&nbsp; <strong>ABHA Integration</strong> — compliant with India's health stack</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#49454F;padding:5px 0;">&#128200;&nbsp; <strong>Analytics</strong> — understand your practice at a glance</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#49454F;padding:5px 0;">&#128179;&nbsp; <strong>Billing</strong> — receipts, payment links, all integrated</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <hr style="border:none;border-top:1px solid #E7E0EC;margin:24px 0;"/>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center">
              <a href="{CALENDLY_LINK}" target="_blank"
                 style="display:inline-block;background:linear-gradient(135deg,#3A2ED4,#7B6EF6);color:#fff;font-size:15px;font-weight:700;padding:15px 40px;border-radius:12px;text-decoration:none;margin:0 6px 10px;">
                &#128197;&nbsp; Book a Demo Anytime
              </a>
              <a href="{YOUTUBE_LINK}" target="_blank"
                 style="display:inline-block;background:#fff;color:#7B6EF6;font-size:15px;font-weight:700;padding:14px 40px;border-radius:12px;text-decoration:none;border:2px solid #7B6EF6;margin:0 6px 10px;">
                &#9654;&nbsp; Watch Demo
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    {_footer()}""")


# ── Dispatcher ────────────────────────────────────────────────────────────────

TEMPLATES = {1: template_1, 4: template_2, 8: template_3, 14: template_4}


def render(subject: str, body_text: str, clinic_name: str = "",
           doctor_name: str = "", specialty: str = "General Physician",
           step: int = 1, lead_hash: str = "") -> tuple[str, str]:
    fn = TEMPLATES.get(step, template_1)
    html = fn(
        doctor_name=doctor_name or "Doctor",
        clinic_name=clinic_name or "your clinic",
        specialty=specialty,
        body_text=body_text,
    )

    # Embed tracking pixel before </body>
    if lead_hash:
        pixel = f'<img src="{TRACKING_BASE}?lid={lead_hash}" width="1" height="1" style="display:none;" alt=""/>'
        html = html.replace("</body>", f"{pixel}\n</body>")

    return html, body_text
