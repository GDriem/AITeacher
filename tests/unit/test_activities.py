import json

import pytest

from agent_app.models.activities import (
    PracticeDifficulty,
    ProjectEvaluationMode,
)
from agent_app.providers.base import ModelRequest
from agent_app.providers.mock import MockModelProvider
from agent_app.services.activities import PROJECTS, evaluate_project


class StructuredProjectProvider:
    name = "structured-project-test"

    def __init__(self, response: dict) -> None:
        self.response = response
        self.requests: list[ModelRequest] = []

    async def generate(self, request: ModelRequest) -> str:
        self.requests.append(request)
        return json.dumps(self.response, ensure_ascii=False)


def test_three_integrative_projects_have_distinct_rubrics() -> None:
    assert len(PROJECTS) == 3
    assert all(len(project.topics) >= 2 for project in PROJECTS.values())
    assert all(len(project.rubric) == 4 for project in PROJECTS.values())
    rubric_sets = {
        tuple(criterion.id for criterion in project.rubric)
        for project in PROJECTS.values()
    }
    assert len(rubric_sets) == 3


@pytest.mark.asyncio
async def test_project_uses_its_validated_specific_rubric() -> None:
    project = PROJECTS["asistente-rag-confiable"]
    provider = StructuredProjectProvider(
        {
            "criteria": [
                {
                    "criterion_id": criterion.id,
                    "score": 4,
                    "explanation": "La decisión está justificada.",
                }
                for criterion in project.rubric
            ],
            "feedback": "Propuesta completa y verificable.",
        }
    )

    result = await evaluate_project(
        provider,
        project,
        "Primero recupera evidencia, después genera y cita fuentes; si no hay contexto, se abstiene.",
    )

    assert result.score == 100
    assert result.evaluation_mode == ProjectEvaluationMode.MODEL
    assert [item.criterion_id for item in result.rubric] == [
        criterion.id for criterion in project.rubric
    ]
    assert provider.requests[0].response_json_schema


@pytest.mark.asyncio
async def test_project_falls_back_and_keyword_list_cannot_score_high() -> None:
    result = await evaluate_project(
        MockModelProvider(),
        PROJECTS["agente-mcp-observable"],
        "agente MCP herramienta trazas latencia costo",
    )

    assert result.score <= 49
    assert result.evaluation_mode == ProjectEvaluationMode.DETERMINISTIC_FALLBACK


def test_practice_difficulty_enum_contract_is_stable() -> None:
    assert [item.value for item in PracticeDifficulty] == [
        "foundation",
        "application",
        "challenge",
    ]
