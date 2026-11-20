from fastapi import APIRouter

from app.api import (agent, analytics, interview_coach, applications, auth, automation, companies, jobs, matches, notifications, outreach,
                     profile, recruiters, resumes, settings, sources)

router = APIRouter()
for m in (auth, profile, resumes, jobs, sources, companies, matches, recruiters, applications, outreach, automation,
          notifications, analytics, settings, interview_coach, agent):
    router.include_router(m.router)
