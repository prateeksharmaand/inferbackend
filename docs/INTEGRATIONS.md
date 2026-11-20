# Integrations

Every integration is optional; the app shows its live state in **Settings → Integrations**.

| Integration | Env vars | Status in this build |
|---|---|---|
| Claude API | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-opus-5-5`), `AI_EFFORT` | Implemented; fallbacks tested; **live calls not yet verified (no key)** |
| JSearch (RapidAPI) | `SEARCH_PROVIDER_API_KEY` | Implemented + mocked tests; **awaiting key** |
| Adzuna India | `JOB_SEARCH_API_KEY=app_id:app_key` | Implemented; **awaiting key** |
| Greenhouse / Lever / Ashby boards | configured in Settings → Job sources | **Verified live** (Groww, InMobi, Druva, CRED, Paytm boards) |
| Manual URL import | — | **Verified live** (schema.org JobPosting + Greenhouse/Lever URL resolution) |
| SMTP (incl. Gmail App Password) | `SMTP_*`, `NOTIFY_EMAIL_TO` | Implemented; **awaiting credentials** |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Implemented; **awaiting credentials** |
| Gmail API (OAuth) | `GMAIL_CLIENT_ID/SECRET` | Not needed: SMTP with an App Password sends mail. Placeholder only. |
| LinkedIn, Naukri, Indeed, Foundit, Instahyre, Wellfound, Cutshort, Hirist | — | **No authorised search API**; covered via JSearch + URL import |

## Claude
Create a key at console.anthropic.com → set `ANTHROPIC_API_KEY`. Used for: resume structuring, job matching,
company research and recruiter discovery (with the server-side `web_search` tool), resume tailoring, cover
letters, outreach drafts, interview question generation/evaluation and the Career Agent. Server-side refusal
fallbacks are enabled (`fallbacks: "default"`); set `AI_FALLBACKS=false` to disable.
Cost control: Agent Automation → "AI matches per run" and "Companies researched per run".

## Why not LinkedIn/Naukri directly?
These sites don't offer job-search APIs to individuals, and automated access requires logging in or scraping
pages their terms forbid. CareerPilot doesn't do that. JSearch is a licensed API over Google for Jobs, which
indexes those boards' public postings (each result records its publisher, e.g. "LinkedIn"). For anything else,
paste the posting URL; if the page needs sign-in, paste the description.

## Email (Gmail)
Google Account → Security → 2-Step Verification → App passwords → create one. Then
`SMTP_HOST=smtp.gmail.com SMTP_PORT=587 SMTP_USERNAME=you@gmail.com SMTP_PASSWORD=<app password> SMTP_FROM=you@gmail.com`.

## Telegram
Message @BotFather → `/newbot` → copy the token. Send your bot any message, open
`https://api.telegram.org/bot<TOKEN>/getUpdates`, copy `message.chat.id` → `TELEGRAM_CHAT_ID`.
Use Settings → Notifications → "Send test notification".
