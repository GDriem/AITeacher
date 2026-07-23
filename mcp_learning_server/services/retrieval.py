"""Recuperación léxica TF-IDF pequeña, determinista y explicable."""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter

from mcp_learning_server.models import LearningLevel, SearchResult, Topic
from mcp_learning_server.services.content_store import ContentStore

_TOKEN = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    normalized = unicodedata.normalize("NFKD", text.lower())
    ascii_text = "".join(char for char in normalized if not unicodedata.combining(char))
    return _TOKEN.findall(ascii_text)


class LexicalRetriever:
    def __init__(self, store: ContentStore) -> None:
        self.store = store

    def search(
        self,
        query: str,
        *,
        topic: Topic | None = None,
        level: LearningLevel | None = None,
        limit: int = 3,
    ) -> list[SearchResult]:
        if limit < 1 or limit > 10:
            raise ValueError("limit debe estar entre 1 y 10")
        query_tokens = tokenize(query)
        if not query_tokens:
            return []

        corpus = list(self.store.all())
        topic_matches = [chunk for chunk in corpus if topic is None or chunk.topic == topic]
        if level is not None:
            exact_level = [chunk for chunk in topic_matches if chunk.level == level]
            candidates = exact_level or topic_matches
        else:
            candidates = topic_matches
        if not candidates:
            return []

        documents = [
            tokenize(
                " ".join(
                    [chunk.title, chunk.text, chunk.topic.value, *chunk.keywords]
                )
            )
            for chunk in candidates
        ]
        document_frequency = Counter(
            token for document in documents for token in set(document)
        )
        query_counts = Counter(query_tokens)
        scored: list[tuple[float, int]] = []
        for index, document in enumerate(documents):
            counts = Counter(document)
            score = 0.0
            for token, query_weight in query_counts.items():
                if counts[token] == 0:
                    continue
                inverse_frequency = math.log(
                    (len(documents) + 1) / (document_frequency[token] + 1)
                ) + 1
                score += (counts[token] / len(document)) * inverse_frequency * query_weight
            if topic is not None and candidates[index].topic == topic:
                score += 1.0
            if level is not None and candidates[index].level == level:
                score += 0.25
            if score > 0:
                scored.append((score, index))

        scored.sort(key=lambda pair: (-pair[0], candidates[pair[1]].id))
        return [
            SearchResult(
                content_id=candidates[index].id,
                topic=candidates[index].topic,
                title=candidates[index].title,
                level=candidates[index].level,
                fragment=candidates[index].text,
                source=candidates[index].source,
                score=round(score, 6),
            )
            for score, index in scored[:limit]
        ]

