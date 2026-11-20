from sqlalchemy import select
from sqlalchemy.orm import Session

from app.connectors.aggregators import AdzunaConnector, JSearchConnector
from app.connectors.ats import AshbyConnector, GreenhouseConnector, LeverConnector
from app.connectors.base import BaseConnector
from app.connectors.manual import ManualConnector
from app.connectors.restricted import RESTRICTED, RestrictedConnector
from app.models import JobSource

CLASSES = {c.key: c for c in (JSearchConnector, AdzunaConnector, GreenhouseConnector, LeverConnector,
                              AshbyConnector, ManualConnector)}

# Verified live on 2026-11-20. Edit in Settings → Job sources.
DEFAULT_CONFIG = {
    "greenhouse": {"boards": [{"token": "groww", "company": "Groww"}, {"token": "inmobi", "company": "InMobi"},
                              {"token": "druva", "company": "Druva"}]},
    "lever": {"boards": [{"token": "cred", "company": "CRED"}, {"token": "paytm", "company": "Paytm"}]},
    "ashby": {"boards": []},
    "jsearch": {"max_keywords": 5, "max_locations": 4, "max_requests": 12},
    "adzuna": {},
    "manual": {},
}


def connector_for(source: JobSource) -> BaseConnector:
    if source.key in RESTRICTED:
        return RestrictedConnector(source.key, source.config)
    return CLASSES[source.key](source.config)


def ensure_sources(db: Session) -> list[JobSource]:
    existing = {s.key: s for s in db.scalars(select(JobSource))}
    for key, cls in CLASSES.items():
        if key not in existing:
            db.add(JobSource(key=key, name=cls.name, kind=cls.kind, config=DEFAULT_CONFIG.get(key, {}),
                             enabled=True))
    for key, (name, _, _) in RESTRICTED.items():
        if key not in existing:
            db.add(JobSource(key=key, name=name, kind="restricted", enabled=False, config={}))
    db.flush()
    return list(db.scalars(select(JobSource).order_by(JobSource.id)))
