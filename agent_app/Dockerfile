FROM node:24-slim AS frontend-build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /build/frontend
RUN corepack enable

COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend ./
RUN pnpm build

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
COPY --from=frontend-build /build/frontend/dist ./frontend/dist

RUN python -m pip install --no-cache-dir ".[agents,cloud]"

RUN mkdir /data && chown app:app /data
USER app
EXPOSE 8080
CMD ["python", "-m", "agent_app.api.main"]
