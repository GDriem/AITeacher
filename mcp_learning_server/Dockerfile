FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=8080 \
    MCP_PROGRESS_PATH=/data/student_progress.json

WORKDIR /app

RUN groupadd --system app && useradd --system --gid app app

COPY pyproject.toml README.md ./
COPY agent_app ./agent_app
COPY mcp_learning_server ./mcp_learning_server

RUN python -m pip install --no-cache-dir ".[cloud]"

RUN mkdir /data && chown app:app /data
USER app

EXPOSE 8080
CMD ["python", "-m", "mcp_learning_server.server"]
