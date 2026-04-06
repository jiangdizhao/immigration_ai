from app.core.config import get_settings
from app.services.embedding_service import EmbeddingService


if __name__ == "__main__":
    settings = get_settings()
    service = EmbeddingService()
    vector = service.embed_text("Student visa refusal and review rights")

    print(f"model={settings.embedding_model}")
    print(f"dimension={len(vector)}")
    print(f"preview={vector[:5]}")