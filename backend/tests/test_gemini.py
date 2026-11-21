"""Gemini provider adapter tests (no network: the genai client is faked)."""
import base64
from types import SimpleNamespace

from pydantic import BaseModel

from app.services import ai, ai_gemini


class Out(BaseModel):
    answer: str
    score: int


def part(**kw):
    base = dict(text=None, function_call=None, thought=False, thought_signature=None)
    base.update(kw)
    return SimpleNamespace(**base)


def response(parts, finish="STOP", parsed=None, text=None):
    cand = SimpleNamespace(content=SimpleNamespace(parts=parts), finish_reason=finish, grounding_metadata=None)
    return SimpleNamespace(candidates=[cand], parsed=parsed, text=text, prompt_feedback=None)


class FakeModels:
    def __init__(self, responses):
        self.responses, self.calls = list(responses), []

    def generate_content(self, model, contents, config):
        self.calls.append((model, contents, config))
        return self.responses.pop(0)


def install(monkeypatch, responses):
    from app.core.config import settings
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "g-test")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    fake = FakeModels(responses)
    monkeypatch.setattr(ai_gemini, "client", lambda: SimpleNamespace(models=fake))
    return fake


def test_provider_selection(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "AI_PROVIDER", "auto")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "g")
    assert settings.ai_provider == "gemini" and ai.model_name() == settings.GEMINI_MODEL
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "a")
    assert settings.ai_provider == "anthropic"
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    assert settings.ai_provider == "gemini"


def test_structured_parses_and_validates(monkeypatch):
    fake = install(monkeypatch, [response([], parsed=None, text='{"answer": "ok", "score": 7}')])
    out = ai.structured("sys", "question", Out)
    assert out == Out(answer="ok", score=7)
    cfg = fake.calls[0][2]
    assert cfg.response_mime_type == "application/json" and cfg.system_instruction == "sys"


def test_blocked_response_raises(monkeypatch):
    install(monkeypatch, [response([], finish="SAFETY")])
    try:
        ai.structured("s", "q", Out)
        raise AssertionError("expected AIUnavailable")
    except ai.AIUnavailable as e:
        assert "declined" in str(e)


def test_chat_turn_round_trip_preserves_signatures(monkeypatch):
    sig = b"\x01\x02sig"
    fc = SimpleNamespace(id="call1", name="search_jobs", args={"text": "Flutter"})
    fake = install(monkeypatch, [
        response([part(thought=True, text="thinking"), part(function_call=fc, thought_signature=sig)]),
        response([part(text="Found (#3).")]),
    ])
    tools = [{"name": "search_jobs", "description": "d", "input_schema": {"type": "object", "properties": {}}}]
    msgs = [{"role": "user", "content": [{"type": "text", "text": "find jobs"}]}]
    r1 = ai.chat_turn("sys", msgs, tools)
    assert r1.stop_reason == "tool_use"
    tu = r1.content[0]
    assert tu.type == "tool_use" and tu.name == "search_jobs" and tu.input == {"text": "Flutter"}
    dumped = tu.model_dump()
    assert base64.b64decode(dumped["gemini_signature"]) == sig
    msgs += [{"role": "assistant", "content": [dumped]},
             {"role": "user", "content": [{"type": "tool_result", "tool_use_id": tu.id, "content": '{"jobs": []}'}]}]
    r2 = ai.chat_turn("sys", msgs, tools)
    assert r2.stop_reason == "end_turn" and r2.content[0].text == "Found (#3)."
    contents = fake.calls[1][1]
    assert [c.role for c in contents] == ["user", "model", "user"]
    assert contents[1].parts[0].thought_signature == sig            # signature replayed unchanged
    fr = contents[2].parts[0].function_response
    assert fr.name == "search_jobs" and fr.id == "call1" and fr.response == {"jobs": []}


def test_agent_end_to_end_with_gemini(auth_client, monkeypatch):
    from tests.helpers import add_job, setup_candidate
    setup_candidate(auth_client)
    jid = add_job(auth_client)
    fc = SimpleNamespace(id="c1", name="search_jobs", args={"text": "Flutter"})
    install(monkeypatch, [response([part(function_call=fc)]), response([part(text=f"Top pick (#{jid}).")])])
    r = auth_client.post("/api/agent/chat", json={"message": "Find Flutter lead jobs"}).json()
    assert f"#{jid}" in r["message"]["content"] and r["message"]["tool_calls"][0]["name"] == "search_jobs"
