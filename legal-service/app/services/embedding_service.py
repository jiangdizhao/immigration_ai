from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from openai import OpenAI

from app.core.config import get_settings


settings = get_settings()


@dataclass(slots=True)
class EmbeddingBatchResult:
    requested: int
    embedded: int
    model: str
    dimension: int


class EmbeddingService:
    def __init__(self) -> None:
        api_key = getattr(settings, 'openai_api_key', None)
        if not api_key:
            raise ValueError('OPENAI_API_KEY is not configured.')
        self.client = OpenAI(api_key=api_key)
        self.model = getattr(settings, 'embedding_model', 'text-embedding-3-small')
        self.dimension = int(getattr(settings, 'embedding_dimension', 1536))

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        clean_texts = [text.strip() for text in texts if text and text.strip()]
        if not clean_texts:
            return []

        response = self.client.embeddings.create(
            model=self.model,
            input=clean_texts,
        )
        vectors = [item.embedding for item in response.data]
        self._validate_dimensions(vectors)
        return vectors

    def embed_text(self, text: str) -> list[float]:
        vectors = self.embed_texts([text])
        if not vectors:
            raise ValueError('Cannot embed empty text.')
        return vectors[0]

    def _validate_dimensions(self, vectors: Sequence[Sequence[float]]) -> None:
        for idx, vector in enumerate(vectors):
            if len(vector) != self.dimension:
                raise ValueError(
                    f'Embedding dimension mismatch at index {idx}: '
                    f'expected {self.dimension}, got {len(vector)}'
                )
