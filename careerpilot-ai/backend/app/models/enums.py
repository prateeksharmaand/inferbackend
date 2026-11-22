"""String enums shared by models, schemas and the UI. Stored as VARCHAR with CHECK constraints."""
from enum import StrEnum


class ResumeCategory(StrEnum):
    master = "master"
    flutter_lead = "flutter_lead"
    mobile_architect = "mobile_architect"
    engineering_leadership = "engineering_leadership"
    tailored = "tailored"


class WorkMode(StrEnum):
    remote = "remote"
    hybrid = "hybrid"
    office = "office"
    unknown = "unknown"


class JobStatus(StrEnum):
    active = "active"
    expired = "expired"
    unverified = "unverified"
    archived = "archived"


class ApplicationStatus(StrEnum):
    discovered = "discovered"
    shortlisted = "shortlisted"
    resume_prepared = "resume_prepared"
    awaiting_approval = "awaiting_approval"
    applied = "applied"
    recruiter_contacted = "recruiter_contacted"
    screening = "screening"
    technical_interview = "technical_interview"
    management_interview = "management_interview"
    hr_discussion = "hr_discussion"
    offer_received = "offer_received"
    rejected = "rejected"
    on_hold = "on_hold"


APPLIED_OR_LATER = {
    ApplicationStatus.applied, ApplicationStatus.recruiter_contacted, ApplicationStatus.screening,
    ApplicationStatus.technical_interview, ApplicationStatus.management_interview,
    ApplicationStatus.hr_discussion, ApplicationStatus.offer_received,
}
INTERVIEW_STAGES = {
    ApplicationStatus.screening, ApplicationStatus.technical_interview,
    ApplicationStatus.management_interview, ApplicationStatus.hr_discussion,
}


class Classification(StrEnum):
    excellent = "Excellent Match"
    strong = "Strong Match"
    potential = "Potential Match"
    low = "Low Priority"


class OutreachChannel(StrEnum):
    linkedin_connect = "linkedin_connect"
    linkedin_dm = "linkedin_dm"
    application_email = "application_email"
    followup_email = "followup_email"
    intro = "intro"


class OutreachStatus(StrEnum):
    draft = "draft"
    approved = "approved"
    sent = "sent"
    failed = "failed"
    replied = "replied"
    archived = "archived"


class RecruiterRole(StrEnum):
    recruiter = "recruiter"
    talent_acquisition = "talent_acquisition"
    hr_manager = "hr_manager"
    hiring_manager = "hiring_manager"
    engineering_manager = "engineering_manager"
    engineering_director = "engineering_director"
    cto = "cto"
    founder = "founder"
    other = "other"


class VerificationStatus(StrEnum):
    unverified = "unverified"
    verified = "verified"
    invalid = "invalid"


def check_in(col: str, enum) -> str:
    return f"{col} IN ({', '.join(repr(e.value) for e in enum)})"
