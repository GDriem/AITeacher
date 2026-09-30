import io
import json
import logging

from agent_app.services.logging import JsonFormatter


def _logger_with_json_output(output: io.StringIO) -> logging.Logger:
    logger = logging.getLogger("test_json_logging")
    logger.handlers.clear()
    logger.propagate = False
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler(output)
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    return logger


def test_json_formatter_includes_severity_exception_and_stack() -> None:
    output = io.StringIO()
    logger = _logger_with_json_output(output)

    try:
        raise RuntimeError("fallo simulado")
    except RuntimeError:
        logger.exception("petición falló", stack_info=True)

    payload = json.loads(output.getvalue())

    assert payload["severity"] == "ERROR"
    assert payload["exception_type"] == "RuntimeError"
    assert "RuntimeError: fallo simulado" in payload["exception"]
    assert "Stack (most recent call last)" in payload["stack"]


def test_json_formatter_emits_parseable_info_with_accents() -> None:
    output = io.StringIO()
    logger = _logger_with_json_output(output)

    logger.info("lección completada")

    payload = json.loads(output.getvalue())

    assert payload["severity"] == "INFO"
    assert payload["message"] == "lección completada"
