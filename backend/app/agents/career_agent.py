"""Career Agent: a Messages-API tool-use loop hosted in this backend.

The transcript (raw content blocks incl. thinking blocks) is stored per conversation and replayed
append-only each turn, so preserved thinking stays valid. Tool results are real DB records."""
import json
import re

from sqlalchemy.orm import Session

from app.agents.tools import TOOLS, run_tool
from app.core.config import settings
from app.core.time import now_local
from app.models import AgentConversation, AgentMessage, User
from app.services import ai

MAX_STEPS = 10

SYSTEM = """You are CareerPilot, a personal career agent helping a senior mobile engineer in India land a
Flutter Technical Lead / Mobile Technical Lead / Mobile Architect role (target ₹25–35 LPA).

How you work:
- Always use tools to look up jobs, applications, contacts and stats. Never invent jobs, companies, salaries,
  recruiters, contact details or application states. If the database has nothing relevant, say so and suggest
  running a job search or importing a posting URL.
- Ground every claim about the candidate in get_profile. Never suggest claiming experience they don't have.
- You can prepare drafts (tailored resumes, cover letters, outreach messages). You cannot send messages or
  submit applications; tell the user where to review and approve them (Applications / Outreach pages).
- Salaries are INR LPA. Times are Asia/Kolkata.
- Be concise and practical. Use short lists. Include job ids like (#123) so the user can open them."""


def _dump(block) -> dict:
    return block.model_dump(mode="json", exclude_none=True)


def chat(db: Session, user: User, conv: AgentConversation, text: str) -> AgentMessage:
    db.add(AgentMessage(conversation_id=conv.id, role="user", content=text))
    transcript = list(conv.transcript or [])
    transcript.append({"role": "user", "content": [{"type": "text", "text": f"[{now_local():%a %d %b %Y %H:%M IST}] {text}"}]})
    if not settings.ai_configured:
        reply, calls = _fallback(db, user, text)
        transcript.append({"role": "assistant", "content": [{"type": "text", "text": reply}]})
        return _save(db, conv, transcript, reply, calls)
    calls: list[dict] = []
    reply = ""
    try:
        for _ in range(MAX_STEPS):
            resp = ai.chat_turn(SYSTEM, transcript, TOOLS)
            transcript.append({"role": "assistant", "content": [_dump(b) for b in resp.content]})
            if resp.stop_reason == "pause_turn":
                continue
            uses = [b for b in resp.content if b.type == "tool_use"]
            if resp.stop_reason != "tool_use" or not uses:
                reply = "".join(b.text for b in resp.content if b.type == "text").strip()
                break
            results = []
            for u in uses:
                try:
                    out, summary = run_tool(db, user, u.name, dict(u.input or {}))
                    results.append({"type": "tool_result", "tool_use_id": u.id, "content": out[:60000]})
                except Exception as e:  # noqa: BLE001
                    db.rollback()
                    summary = f"Error: {e}"
                    results.append({"type": "tool_result", "tool_use_id": u.id, "content": f"Error: {e}",
                                    "is_error": True})
                calls.append({"name": u.name, "input": u.input, "summary": summary})
            transcript.append({"role": "user", "content": results})
        else:
            reply = reply or "I ran out of steps for this request. Try narrowing it down."
    except ai.AIUnavailable as e:
        reply, more = _fallback(db, user, text)
        reply = f"(AI unavailable: {e})\n\n{reply}"
        calls += more
        # keep the transcript well-formed: drop the dangling turn
        while transcript and transcript[-1]["role"] != "user":
            transcript.pop()
        transcript.append({"role": "assistant", "content": [{"type": "text", "text": reply}]})
    return _save(db, conv, transcript, reply or "Done.", calls)


def _save(db, conv, transcript, reply, calls) -> AgentMessage:
    conv.transcript = transcript  # append-only history (preserved thinking requires unedited replay)
    if conv.title == "New conversation":
        first = next((m for m in transcript if m["role"] == "user"), None)
        if first:
            conv.title = re.sub(r"^\[[^\]]+\]\s*", "", first["content"][0].get("text", ""))[:80] or conv.title
    msg = AgentMessage(conversation_id=conv.id, role="assistant", content=reply, tool_calls=calls)
    db.add(msg)
    db.commit()
    return msg


def _fallback(db: Session, user: User, text: str) -> tuple[str, list[dict]]:
    """Keyword routing so the chat still answers basic queries without Claude."""
    t = text.lower()
    if "follow" in t:
        out, s = run_tool(db, user, "list_applications", {"follow_up_due": True})
        rows = json.loads(out)
        body = "\n".join(f"- {r['title']} at {r['company']} ({r['status']}, follow up {r['follow_up_date']})"
                         for r in rows) or "No follow-ups are due."
        return f"Applications awaiting follow-up:\n{body}", [{"name": "list_applications", "summary": s}]
    if any(w in t for w in ("job", "role", "opening", "position")):
        args: dict = {"limit": 10}
        if "today" in t:
            args["posted_within_hours"] = 24
        if "remote" in t:
            args["work_modes"] = ["remote"]
        m = re.search(r"(\d{2})\s*(lpa|l\b|lakh)", t)
        if m:
            args["min_ctc_lpa"] = float(m.group(1))
        for kw in ("flutter", "architect", "lead", "manager", "android", "ios"):
            if kw in t:
                args["text"] = kw
                break
        for city in ("jaipur", "bengaluru", "bangalore", "hyderabad", "pune", "gurugram", "gurgaon", "noida", "delhi",
                     "mumbai", "chennai"):
            if city in t:
                args["locations"] = [city]
        out, s = run_tool(db, user, "search_jobs", args)
        rows = json.loads(out)["jobs"]
        body = "\n".join(f"- (#{r['id']}) {r['title']} — {r['company']}, {r['location'] or r['work_mode']}, {r['ctc']}"
                         f"{', score ' + str(r['score']) if r['score'] is not None else ''}" for r in rows)
        return (body and f"Matching jobs from your database:\n{body}") or \
            "No matching jobs in your database yet. Run a job search from Agent Automation or import a posting URL.", \
            [{"name": "search_jobs", "input": args, "summary": s}]
    return ("The Career Agent needs an AI provider for open-ended requests (ANTHROPIC_API_KEY or GEMINI_API_KEY). Without it I can "
            "still list jobs (e.g. 'remote Flutter jobs above 25 LPA') and applications awaiting follow-up."), []
