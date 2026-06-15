from __future__ import annotations

import pytest
import pytest_asyncio


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"
