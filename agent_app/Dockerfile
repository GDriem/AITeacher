FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_HOST=0.0.0.0 \
    APP_PORT=8080

WORKDIR /app
RUN groupadd --system app && useradd --system --gid app app

COPY pyproject.toml README.md ./
COPY agent_app ./agent_app
COPY mcp_learning_server ./mcp_learning_server

RUN python -m pip install --no-cache-dir ".[agents,foundry]"

USER app
EXPOSE 8080
CMD ["python", "-m", "agent_app.api.main"]
