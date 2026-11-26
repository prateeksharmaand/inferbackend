FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:0.8.15 /uv /usr/local/bin/uv
COPY apps/ai/pyproject.toml apps/ai/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY apps/ai/app ./app
RUN useradd -r -u 10001 app && chown -R app /app
USER app
EXPOSE 8100
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8100/health',timeout=4).status==200 else 1)"
CMD ["/app/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "1", "--proxy-headers"]
