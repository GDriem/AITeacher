import httpx
import pytest

from agent_app.api.main import create_app
from agent_app.config import ModelProviderName, Settings
from agent_app.providers.mock import MockModelProvider
from agent_app.services.learning_tools import LocalLearningTools


@pytest.mark.integration
@pytest.mark.asyncio
async def test_complete_text_flow_without_cloud_credentials(learning_service) -> None:
    settings = Settings(
        model_provider=ModelProviderName.MOCK,
        mcp_use_local_adapter=True,
    )
    app = create_app(
        settings,
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://agent.local"
    ) as client:
        health = await client.get("/healthz")
        capabilities = await client.get("/api/capabilities")
        topics = await client.get(
            "/api/topics", params={"student_id": "student-1"}
        )
        page = await client.get("/")
        styles = await client.get("/static/styles.css")
        script = await client.get("/static/app.js")
        assert health.status_code == 200
        assert capabilities.json() == {
            "text": True,
            "voice": False,
            "voice_model": None,
        }
        assert topics.status_code == 200
        catalog = topics.json()
        assert catalog["total_topics"] == 23
        assert catalog["completed_topics"] == 0
        assert catalog["in_progress_topics"] == 0
        assert catalog["available_topics"] == 1
        assert catalog["blocked_topics"] == 22
        assert catalog["completion_percentage"] == 0
        assert catalog["recommendation"]["topic"] == "artificial-intelligence"
        assert catalog["recommendation"]["reason"]
        assert len(catalog["topics"]) == catalog["total_topics"]
        assert {
            topic["category"] for topic in catalog["topics"]
        } == {
            "fundamentos",
            "modelos-y-datos",
            "agentes-y-herramientas",
            "calidad-y-seguridad",
            "produccion",
        }
        embedding = next(
            topic for topic in catalog["topics"] if topic["topic"] == "embeddings"
        )
        assert embedding["status"] == "blocked"
        assert embedding["prerequisites"] == ["tokens"]
        assert embedding["unmet_prerequisites"] == ["tokens"]
        assert embedding["available_levels"] == ["beginner", "intermediate"]
        assert page.status_code == 200
        assert "AITeacher" in page.text
        assert 'id="category-filter"' in page.text
        assert 'id="level-filter"' in page.text
        assert 'id="learning-path-card"' in page.text
        assert styles.status_code == 200
        assert script.status_code == 200
        assert "data-start-topic" in script.text
        assert "const totalTopics = 23" not in script.text
        chat = await client.post(
            "/api/chat",
            headers={"x-correlation-id": "demo-123"},
            json={
                "student_id": "student-1",
                "message": f"Quiero aprender sobre {embedding['title']}",
            },
        )
        assert chat.status_code == 200, chat.text
        payload = chat.json()
        assert payload["correlation_id"] == "demo-123"
        assert payload["topic"] == "embeddings"
        assert payload["quiz"]["question"]
        assert "expected_keywords" not in payload["quiz"]
        assert chat.headers["x-correlation-id"] == "demo-123"

        evaluated = await client.post(
            "/api/evaluate",
            json={
                "student_id": "student-1",
                "session_id": payload["session_id"],
                "answer": "Un embedding es un vector de significado y se compara por similitud.",
            },
        )
        assert evaluated.status_code == 200, evaluated.text
        assert evaluated.json()["score"] == 100
        assert evaluated.json()["status"] == "mastered"
        assert evaluated.json()["strengths"]
        assert evaluated.json()["learning_context"]
        assert "expected_keywords" not in evaluated.json()["next_quiz"]
        assert evaluated.json()["progress"]["studied_topics"] == ["embeddings"]
        mastery = evaluated.json()["progress"]["topic_progress"][0]
        assert mastery["topic"] == "embeddings"
        assert mastery["attempts"] == 1
        assert mastery["best_score"] == 100
        assert mastery["level"] == "advanced"
        assert mastery["mastery_status"] == "mastered"
        assert mastery["mastered_concepts"] == [
            "vector",
            "similitud",
            "significado",
        ]
        assert mastery["pending_concepts"] == []

        updated_topics = await client.get(
            "/api/topics", params={"student_id": "student-1"}
        )
        updated_catalog = updated_topics.json()
        completed_embedding = next(
            topic
            for topic in updated_catalog["topics"]
            if topic["topic"] == "embeddings"
        )
        assert updated_catalog["completed_topics"] == 1
        assert updated_catalog["completion_percentage"] == pytest.approx(4.35)
        assert completed_embedding["status"] == "completed"
        assert completed_embedding["progress"]["level"] == "advanced"
        assert completed_embedding["progress"]["mastery_status"] == "mastered"
        assert updated_catalog["recommendation"]["topic"] == "artificial-intelligence"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_recommendation_changes_after_mastering_prerequisite(
    learning_service,
) -> None:
    app = create_app(
        Settings(),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://agent.local"
    ) as client:
        initial = await client.get(
            "/api/topics", params={"student_id": "adaptive-student"}
        )
        chat = await client.post(
            "/api/chat",
            json={
                "student_id": "adaptive-student",
                "message": "Quiero aprender artificial intelligence",
            },
        )
        evaluated = await client.post(
            "/api/evaluate",
            json={
                "student_id": "adaptive-student",
                "session_id": chat.json()["session_id"],
                "answer": "Artificial intelligence",
            },
        )
        updated = await client.get(
            "/api/topics", params={"student_id": "adaptive-student"}
        )

    assert initial.json()["recommendation"]["topic"] == "artificial-intelligence"
    assert evaluated.json()["score"] == 100
    assert updated.json()["recommendation"]["topic"] == "machine-learning"
    assert updated.json()["completed_topics"] == 1
    assert {
        topic["topic"]
        for topic in updated.json()["topics"]
        if topic["status"] == "available"
    } == {"machine-learning", "nlp", "responsible-ai"}


@pytest.mark.integration
@pytest.mark.asyncio
async def test_invalid_message_is_handled(learning_service) -> None:
    app = create_app(
        Settings(),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://agent.local"
    ) as client:
        response = await client.post(
            "/api/chat",
            json={"student_id": "student-1", "message": "Hola, sorpréndeme"},
        )
    assert response.status_code == 422
    assert "tema" in response.json()["detail"]
