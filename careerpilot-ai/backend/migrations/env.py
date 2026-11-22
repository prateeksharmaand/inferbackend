import os

from alembic import context
from sqlalchemy import create_engine

import app.models  # noqa: F401  (registers tables)
from app.core.config import settings
from app.core.db import Base

target_metadata = Base.metadata
url = os.environ.get("ALEMBIC_DATABASE_URL") or settings.DATABASE_URL


def run_offline():
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


def run_online():
    engine = create_engine(url)
    with engine.connect() as conn:
        context.configure(connection=conn, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


run_offline() if context.is_offline_mode() else run_online()
