"""Structured outputs for every LLM-backed agent. The API validates these again before persisting anything."""
from typing import Literal

from pydantic import BaseModel, Field

Level = Literal["high", "medium", "low"]


class Evidence(BaseModel):
    claim: str
    source_url: str = Field("", description="URL from the provided sources; empty if none")


# ── Market research ──
class MarketItem(BaseModel):
    country: str = Field(description="ISO 3166-1 alpha-2")
    opportunity: Level
    reasoning: str
    confidence: float = Field(ge=0, le=1)


class CompetitorItem(BaseModel):
    name: str
    website: str = ""
    android_package: str = ""
    ios_app_id: str = ""
    notes: str
    evidence_url: str = ""


class AudienceItem(BaseModel):
    name: str
    description: str
    countries: list[str] = []
    age_range: str = ""
    interests: list[str] = []


class KeywordItem(BaseModel):
    keyword: str
    relevance: float = Field(ge=0, le=1)
    popularity: Literal["high", "medium", "low", "unknown"] = "unknown"
    competition: Literal["high", "medium", "low", "unknown"] = "unknown"


class Opportunity(BaseModel):
    title: str
    detail: str
    confidence: float = Field(ge=0, le=1)


class MarketResearchOut(BaseModel):
    summary: str
    markets: list[MarketItem]
    competitors: list[CompetitorItem]
    audiences: list[AudienceItem]
    keywords: list[KeywordItem]
    opportunities: list[Opportunity]
    strategies: list[str]
    evidence: list[Evidence]
    confidence: float = Field(ge=0, le=1)
    limitations: list[str] = []


# ── ASO ──
class AsoFinding(BaseModel):
    area: Literal["title", "subtitle", "short_description", "description", "keywords", "screenshots", "icon", "ratings", "localization", "other"]
    issue: str
    recommendation: str
    impact: Level


class Localization(BaseModel):
    language: str
    recommendation: str


class AsoOut(BaseModel):
    score: int = Field(ge=0, le=100, description="Listing quality score from the evidence available")
    findings: list[AsoFinding]
    suggested_title: str = Field(description="Respect store limits: App Store 30 chars, Google Play 30 chars")
    suggested_subtitle: str = Field(description="App Store subtitle (30) or Play short description (80)")
    suggested_keywords: list[str]
    localization: list[Localization]
    screenshot_feedback: str
    limitations: list[str] = []


# ── Creative ──
class CreativeVariant(BaseModel):
    type: Literal["AD_COPY", "HEADLINE", "DESCRIPTION", "VIDEO_SCRIPT", "SOCIAL_POST", "BANNER", "SCREENSHOT_CONCEPT", "IMAGE"]
    title: str = Field(description="Short internal name for the variant")
    headline: str = ""
    body: str = ""
    call_to_action: str = ""
    image_prompt: str = Field("", description="Prompt for an image generator; describe only real app features")
    video_script: str = ""
    rationale: str = ""


class CreativeOut(BaseModel):
    variants: list[CreativeVariant]
    notes: str = ""


# ── Campaign strategy ──
class ChannelPlan(BaseModel):
    provider: Literal["GOOGLE_ADS", "APPLE_ADS", "META_ADS", "TIKTOK_ADS"]
    share_pct: float = Field(ge=0, le=100)
    platforms: list[Literal["ANDROID", "IOS"]]
    rationale: str


class CountryAllocation(BaseModel):
    country: str
    share_pct: float = Field(ge=0, le=100)
    rationale: str


class CampaignPlanItem(BaseModel):
    name: str
    provider: Literal["GOOGLE_ADS", "APPLE_ADS", "META_ADS", "TIKTOK_ADS"]
    platform: Literal["ANDROID", "IOS"]
    objective: Literal["installs", "in_app_actions", "value"]
    countries: list[str]
    daily_budget: float = Field(ge=0, description="Major units of the organization currency")
    duration_days: int = Field(ge=1, le=365)
    creative_themes: list[str]


class Range(BaseModel):
    low: float
    expected: float
    high: float


class StrategyOut(BaseModel):
    title: str
    summary: str
    channels: list[ChannelPlan]
    country_allocations: list[CountryAllocation]
    estimated_cpi: Range = Field(description="Cost per install estimate, major units")
    estimated_monthly_budget: float = Field(ge=0)
    forecast_installs: Range
    campaign_plan: list[CampaignPlanItem]
    assumptions: list[str]
    risks: list[str]


# ── Budget optimisation ──
class BudgetDecision(BaseModel):
    campaign_id: str
    kind: Literal["increase", "decrease", "pause", "resume", "hold"]
    new_daily_budget: float | None = Field(None, description="Major units; required for increase/decrease")
    rationale: str
    confidence: float = Field(ge=0, le=1)


class BudgetOut(BaseModel):
    summary: str
    decisions: list[BudgetDecision]


# ── Analytics / growth / retention / reporting ──
class Anomaly(BaseModel):
    metric: str
    date: str = ""
    description: str
    severity: Literal["info", "warning", "critical"]


class AnalyticsOut(BaseModel):
    summary: str
    anomalies: list[Anomaly]
    insights: list[str]
    forecast_comment: str


class Experiment(BaseModel):
    hypothesis: str
    channel: str
    metric: str
    design: str
    expected_impact: Level


class GrowthOut(BaseModel):
    assessment: str
    experiments: list[Experiment]
    new_audiences: list[str]
    countries: list[str]
    priorities: list[str]


class RetentionFinding(BaseModel):
    source: str
    issue: str
    recommendation: str


class SourceQuality(BaseModel):
    source: str
    score: int = Field(ge=0, le=100)
    rationale: str


class RetentionOut(BaseModel):
    summary: str
    findings: list[RetentionFinding]
    quality_ranking: list[SourceQuality]


class ReportOut(BaseModel):
    headline: str
    summary: str
    highlights: list[str]
    concerns: list[str]
    next_steps: list[str]


AGENT_SCHEMAS: dict[str, type[BaseModel]] = {
    "market_research": MarketResearchOut, "aso": AsoOut, "creative": CreativeOut, "campaign_strategy": StrategyOut,
    "budget_optimization": BudgetOut, "analytics": AnalyticsOut, "growth": GrowthOut, "retention": RetentionOut, "reporting": ReportOut,
}
GROUNDED = {"market_research", "aso"}
