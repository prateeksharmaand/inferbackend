from celery import Celery

from app.core.config import settings

celery = Celery("careerpilot", broker=settings.REDIS_URL, backend=settings.REDIS_URL,
                include=["app.automation.tasks"])
celery.conf.update(
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_soft_time_limit=1500,
    task_time_limit=1800,
    broker_connection_retry_on_startup=True,
    # The beat only ticks; which pipeline steps are due is decided from agent_settings.schedule in the DB,
    # so schedule changes in the UI apply without restarting beat.
    beat_schedule={"automation-tick": {"task": "app.automation.tasks.tick", "schedule": 60.0}},
)
