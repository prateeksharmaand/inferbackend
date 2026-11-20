"""ATS-friendly DOCX and PDF rendering for resumes and cover letters.
Single column, standard headings, no tables/images/text boxes so parsers read it cleanly."""
import html
import io

import pymupdf
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt

from app.services import storage


def _docx_resume(c: dict) -> bytes:
    d = Document()
    st = d.styles["Normal"]
    st.font.name = "Calibri"
    st.font.size = Pt(10.5)
    h = d.add_paragraph()
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = h.add_run(c.get("name", ""))
    r.bold = True
    r.font.size = Pt(18)
    if c.get("headline"):
        p = d.add_paragraph(c["headline"])
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    contact = " | ".join(v for v in (c.get("contact") or {}).values() if v)
    if contact:
        p = d.add_paragraph(contact)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    def section(title: str):
        p = d.add_paragraph()
        run = p.add_run(title.upper())
        run.bold = True
        run.font.size = Pt(12)

    if c.get("summary"):
        section("Professional Summary")
        d.add_paragraph(c["summary"])
    if c.get("skills"):
        section("Skills")
        d.add_paragraph(", ".join(c["skills"]))
    if c.get("experience"):
        section("Professional Experience")
        for e in c["experience"]:
            p = d.add_paragraph()
            p.add_run(f"{e['title']} — {e['company']}").bold = True
            p.add_run(f"    {e['dates']}{' | ' + e['location'] if e.get('location') else ''}")
            for b in e.get("bullets", []):
                d.add_paragraph(b, style="List Bullet")
    if c.get("projects"):
        section("Key Projects")
        for pr in c["projects"]:
            p = d.add_paragraph()
            p.add_run(pr["name"]).bold = True
            tail = " — ".join(x for x in [pr.get("description", ""), ", ".join(pr.get("tech") or []),
                                          pr.get("metrics", "")] if x)
            if tail:
                p.add_run(f": {tail}")
    for key, title in (("achievements", "Achievements"), ("certifications", "Certifications"),
                       ("education", "Education")):
        if c.get(key):
            section(title)
            for x in c[key]:
                d.add_paragraph(x, style="List Bullet")
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def _html_resume(c: dict) -> str:
    e = html.escape
    parts = [f"<h1>{e(c.get('name', ''))}</h1>"]
    if c.get("headline"):
        parts.append(f"<p class='c'><b>{e(c['headline'])}</b></p>")
    contact = " | ".join(v for v in (c.get("contact") or {}).values() if v)
    parts.append(f"<p class='c'>{e(contact)}</p>")
    if c.get("summary"):
        parts += ["<h2>PROFESSIONAL SUMMARY</h2>", f"<p>{e(c['summary'])}</p>"]
    if c.get("skills"):
        parts += ["<h2>SKILLS</h2>", f"<p>{e(', '.join(c['skills']))}</p>"]
    if c.get("experience"):
        parts.append("<h2>PROFESSIONAL EXPERIENCE</h2>")
        for x in c["experience"]:
            loc = f" | {e(x['location'])}" if x.get("location") else ""
            parts.append(f"<p><b>{e(x['title'])} — {e(x['company'])}</b><br/>{e(x['dates'])}{loc}</p>")
            if x.get("bullets"):
                parts.append("<ul>" + "".join(f"<li>{e(b)}</li>" for b in x["bullets"]) + "</ul>")
    if c.get("projects"):
        parts.append("<h2>KEY PROJECTS</h2>")
        for pr in c["projects"]:
            tail = " — ".join(x for x in [pr.get("description", ""), ", ".join(pr.get("tech") or []),
                                          pr.get("metrics", "")] if x)
            parts.append(f"<p><b>{e(pr['name'])}</b>{': ' + e(tail) if tail else ''}</p>")
    for key, title in (("achievements", "ACHIEVEMENTS"), ("certifications", "CERTIFICATIONS"),
                       ("education", "EDUCATION")):
        if c.get(key):
            parts += [f"<h2>{title}</h2>", "<ul>" + "".join(f"<li>{e(x)}</li>" for x in c[key]) + "</ul>"]
    return "".join(parts)


CSS = """
body { font-family: sans-serif; font-size: 10pt; line-height: 1.3; }
h1 { font-size: 18pt; text-align: center; margin: 0 0 2pt 0; }
h2 { font-size: 11pt; margin: 9pt 0 3pt 0; border-bottom: 1px solid #444; }
p { margin: 0 0 4pt 0; } .c { text-align: center; }
ul { margin: 0 0 4pt 0; } li { margin: 0 0 1pt 0; }
"""


def html_to_pdf(body_html: str) -> bytes:
    buf = io.BytesIO()
    writer = pymupdf.DocumentWriter(buf)
    story = pymupdf.Story(html=body_html, user_css=CSS)
    rect = pymupdf.paper_rect("a4")
    where = rect + (42, 42, -42, -42)
    more = True
    while more:
        dev = writer.begin_page(rect)
        more, _ = story.place(where)
        story.draw(dev)
        writer.end_page()
    writer.close()
    return buf.getvalue()


def render_resume(user_id: int, content: dict, basename: str) -> tuple[str, str]:
    docx_rel, _ = storage.save_bytes(user_id, "generated", f"{basename}.docx", _docx_resume(content))
    pdf_rel, _ = storage.save_bytes(user_id, "generated", f"{basename}.pdf", html_to_pdf(_html_resume(content)))
    return docx_rel, pdf_rel


def render_letter(user_id: int, title: str, body: str, sender: dict, basename: str) -> tuple[str, str]:
    d = Document()
    d.styles["Normal"].font.name = "Calibri"
    d.styles["Normal"].font.size = Pt(11)
    for line in [sender.get("name", ""), sender.get("email", ""), sender.get("phone", "")]:
        if line:
            d.add_paragraph(line)
    d.add_paragraph("")
    for para in body.split("\n\n"):
        d.add_paragraph(para.strip())
    buf = io.BytesIO()
    d.save(buf)
    docx_rel, _ = storage.save_bytes(user_id, "generated", f"{basename}.docx", buf.getvalue())
    e = html.escape
    head = "<br/>".join(e(x) for x in [sender.get("name", ""), sender.get("email", ""), sender.get("phone", "")] if x)
    paras = "".join(f"<p>{e(p.strip())}</p>" for p in body.split("\n\n") if p.strip())
    pdf_rel, _ = storage.save_bytes(user_id, "generated", f"{basename}.pdf",
                                    html_to_pdf(f"<p>{head}</p><br/>{paras}"))
    return docx_rel, pdf_rel
