import html as h

from app.core.config import settings
from app.core.time import fmt_local
from app.services.salary import fmt_lpa


def job_lines(rows) -> tuple[str, str]:
    """rows: list of (Job, JobMatch). Returns (text, html)."""
    text, items = [], []
    for i, (j, m) in enumerate(rows, 1):
        reasons = "; ".join((m.reasons_to_apply or [])[:3]) if m else ""
        link = j.apply_url or j.url or f"{settings.APP_BASE_URL}/jobs/{j.id}"
        text.append(f"{i}. {j.title} — {j.company_name}\n   {j.location or 'Location n/a'} · {j.work_mode} · "
                    f"{fmt_lpa(j.ctc_min_lpa, j.ctc_max_lpa)} · posted {fmt_local(j.posted_at) if j.posted_at else 'n/a'}"
                    f"\n   AI score: {m.overall_score if m else '—'}/100 ({m.classification if m else 'unscored'})"
                    f"\n   Why: {reasons or '—'}\n   {link}")
        items.append(
            f"<tr><td style='padding:10px 0;border-bottom:1px solid #eee'><b>{h.escape(j.title)}</b> — "
            f"{h.escape(j.company_name)}<br><span style='color:#555'>{h.escape(j.location or 'Location n/a')} · "
            f"{j.work_mode} · {h.escape(fmt_lpa(j.ctc_min_lpa, j.ctc_max_lpa))} · posted "
            f"{h.escape(fmt_local(j.posted_at) if j.posted_at else 'n/a')}</span><br>"
            f"<b>{m.overall_score if m else '—'}/100</b> {h.escape(m.classification if m else '')}<br>"
            f"<span style='color:#333'>{h.escape(reasons)}</span><br>"
            f"<a href='{h.escape(link)}'>Open posting</a> · <a href='{settings.APP_BASE_URL}/jobs/{j.id}'>"
            f"Open in CareerPilot</a></td></tr>")
    html = ("<div style='font-family:system-ui,sans-serif;max-width:640px'><table width='100%'>"
            + "".join(items) + "</table></div>")
    return "\n\n".join(text), html
