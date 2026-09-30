import json
import logging
from datetime import UTC, datetime


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        severity = {
            "WARN": "WARNING",
            "FATAL": "CRITICAL",
        }.get(record.levelname, record.levelname)
        payload = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "severity": severity,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            if record.exc_info[0] is not None:
                payload["exception_type"] = record.exc_info[0].__name__
            payload["exception"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack"] = self.formatStack(record.stack_info)
        correlation_id = getattr(record, "correlation_id", None)
        if correlation_id:
            payload["correlation_id"] = correlation_id
        for field in (
            "method",
            "route",
            "status_code",
            "duration_ms",
            "provider",
            "activity",
        ):
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)
