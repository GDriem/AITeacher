import json
from pathlib import Path

import pytest

from agent_app.agents.evaluator import EvaluatorAgent
from agent_app.models.chat import EvaluationStatus
from agent_app.providers.base import ModelRequest
from agent_app.providers.mock import MockModelProvider
from agent_app.services.learning_tools import LocalLearningTools
from mcp_learning_server.models import RubricEvaluationMode, Topic


DATASET = json.loads(
    (Path(__file__).parents[1] / "fixtures" / "evaluation_responses.json").read_text(
        encoding="utf-8"
    )
)


class StructuredProvider:
    name = "structured-test"

    def __init__(self, response: dict) -> None:
        self.response = response
        self.requests: list[ModelRequest] = []

    async def generate(self, request: ModelRequest) -> str:
        self.requests.append(request)
        return json.dumps(self.response, ensure_ascii=False)


def _criterion(score: int, explanation: str = "Criterio evaluado.") -> dict:
    return {"score": score, "explanation": explanation}


@pytest.mark.parametrize("case", DATASET, ids=lambda case: case["id"])
@pytest.mark.asyncio
async def test_regression_dataset_has_safe_deterministic_fallback(
    learning_service, case
) -> None:
    evaluator = EvaluatorAgent(
        LocalLearningTools(learning_service),
        MockModelProvider(),
    )

    result = await evaluator.evaluate(
        f"student-{case['id']}",
        Topic.EMBEDDINGS,
        evaluator.create_quiz(Topic.EMBEDDINGS),
        case["answer"],
    )

    assert case["min_score"] <= result.score <= case["max_score"]
    assert (
        result.rubric.evaluation_mode
        == RubricEvaluationMode.DETERMINISTIC_FALLBACK
    )
    assert result.result_explanation
    assessment = result.saved.progress.assessments[-1]
    assert assessment.rubric == result.rubric
    assert assessment.result_explanation == result.result_explanation


@pytest.mark.asyncio
async def test_semantic_paraphrase_can_master_with_validated_model_rubric(
    learning_service,
) -> None:
    provider = StructuredProvider(
        {
            "precision": _criterion(4),
            "comprehension": _criterion(4),
            "application": _criterion(4),
            "clarity": _criterion(4),
        }
    )
    evaluator = EvaluatorAgent(LocalLearningTools(learning_service), provider)

    result = await evaluator.evaluate(
        "semantic-student",
        Topic.EMBEDDINGS,
        evaluator.create_quiz(Topic.EMBEDDINGS),
        (
            "Ubica cada texto como un punto; los que expresan ideas parecidas "
            "quedan cerca."
        ),
    )

    assert result.score == 80
    assert result.status == EvaluationStatus.MASTERED
    assert result.rubric.evaluation_mode == RubricEvaluationMode.HYBRID_MODEL
    assert provider.requests[0].temperature == 0
    assert provider.requests[0].response_json_schema
    prompt = json.loads(provider.requests[0].prompt)
    assert prompt["student_answer"].startswith("Ubica cada texto")


@pytest.mark.asyncio
async def test_invalid_model_contract_uses_fallback(learning_service) -> None:
    provider = StructuredProvider(
        {
            "precision": _criterion(5),
            "comprehension": _criterion(4),
            "application": _criterion(4),
            "clarity": _criterion(4),
            "unexpected": True,
        }
    )
    evaluator = EvaluatorAgent(LocalLearningTools(learning_service), provider)

    result = await evaluator.evaluate(
        "fallback-student",
        Topic.EMBEDDINGS,
        evaluator.create_quiz(Topic.EMBEDDINGS),
        "vector, similitud, significado",
    )

    assert result.score <= 49
    assert (
        result.rubric.evaluation_mode
        == RubricEvaluationMode.DETERMINISTIC_FALLBACK
    )
