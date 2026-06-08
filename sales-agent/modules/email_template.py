"""
HTML email template matching Infer website theme.
Primary: #7B6EF6, Dark: #3A2ED4, BG: #F5F4FF
Font: Poppins (fallback: Arial)
"""

YOUTUBE_LINK   = "https://www.youtube.com/watch?v=dukqzJ1rh1Y&t=234s"
CALENDLY_LINK  = "https://calendly.com/prateeksharmaand/30min"
WEBSITE_LINK   = "https://inferapp.online"
LOGO_TEXT      = "Infer"
SUPPORT_EMAIL  = "support@inferapp.online"


def render(subject: str, body_text: str, clinic_name: str = "") -> tuple[str, str]:
    """
    Wraps plain body_text in branded HTML template.
    Returns (html, plain_text) tuple.
    """

    # Convert plain body into HTML paragraphs
    paragraphs = ""
    for line in body_text.strip().splitlines():
        line = line.strip()
        if line:
            paragraphs += f"<p style='margin:0 0 16px 0;color:#49454F;font-size:15px;line-height:1.7;'>{line}</p>\n"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>{subject}</title>
</head>
<body style="margin:0;padding:0;background:#F5F4FF;font-family:'Poppins',Arial,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F4FF;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#3A2ED4,#7B6EF6);border-radius:16px 16px 0 0;padding:28px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">
                      &#9829;&nbsp;{LOGO_TEXT}
                    </span>
                    <span style="font-size:11px;color:rgba(255,255,255,0.7);margin-left:8px;font-weight:500;letter-spacing:1px;text-transform:uppercase;">EMR</span>
                  </td>
                  <td align="right">
                    <span style="background:rgba(255,255,255,0.15);color:#fff;font-size:11px;font-weight:600;padding:5px 12px;border-radius:20px;border:1px solid rgba(255,255,255,0.22);">
                      AI-Native EMR
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:40px 40px 32px 40px;">

              <!-- Greeting -->
              <p style="margin:0 0 24px 0;font-size:22px;font-weight:700;color:#1C1B1F;line-height:1.3;">
                Built for clinics like<br/>
                <span style="background:linear-gradient(135deg,#3A2ED4,#7B6EF6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">
                  {clinic_name if clinic_name else 'yours'} ✨
                </span>
              </p>

              <!-- Email body paragraphs -->
              {paragraphs}

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #E7E0EC;margin:24px 0;"/>

              <!-- CTA Buttons -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:12px;">

                    <!-- Watch Demo Button -->
                    <a href="{YOUTUBE_LINK}" target="_blank"
                       style="display:inline-block;background:linear-gradient(135deg,#7B6EF6,#3A2ED4);color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:12px;text-decoration:none;margin:0 8px 12px 8px;">
                      ▶&nbsp;&nbsp;Watch Demo (2 min)
                    </a>

                    <!-- Book Demo Button -->
                    <a href="{CALENDLY_LINK}" target="_blank"
                       style="display:inline-block;background:#ffffff;color:#7B6EF6;font-size:15px;font-weight:600;padding:13px 32px;border-radius:12px;text-decoration:none;border:2px solid #7B6EF6;margin:0 8px 12px 8px;">
                      📅&nbsp;&nbsp;Book a Free Demo
                    </a>

                  </td>
                </tr>
              </table>

              <!-- Feature Pills -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
                <tr>
                  <td align="center">
                    <span style="display:inline-block;background:#EEEAFF;color:#7B6EF6;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;margin:3px;">AI Voice Scribe</span>
                    <span style="display:inline-block;background:#EEEAFF;color:#7B6EF6;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;margin:3px;">Smart Queue</span>
                    <span style="display:inline-block;background:#EEEAFF;color:#7B6EF6;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;margin:3px;">ABHA Integration</span>
                    <span style="display:inline-block;background:#EEEAFF;color:#7B6EF6;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;margin:3px;">Billing</span>
                    <span style="display:inline-block;background:#EEEAFF;color:#7B6EF6;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;margin:3px;">Analytics</span>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F8F7FF;border-radius:0 0 16px 16px;padding:24px 40px;border-top:1px solid #E7E0EC;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#1C1B1F;">Infer EMR</p>
                    <p style="margin:0;font-size:12px;color:#938F99;">
                      <a href="{WEBSITE_LINK}" style="color:#7B6EF6;text-decoration:none;">{WEBSITE_LINK}</a>
                      &nbsp;·&nbsp;
                      <a href="mailto:{SUPPORT_EMAIL}" style="color:#7B6EF6;text-decoration:none;">{SUPPORT_EMAIL}</a>
                    </p>
                  </td>
                  <td align="right">
                    <p style="margin:0;font-size:11px;color:#938F99;">
                      You received this because we think<br/>Infer could help your practice.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>"""

    return html, body_text
