from app.services.language_service import LanguageService


def main() -> None:
    service = LanguageService()
    samples = [
        "你好",
        "我的学生签证被拒了，我下一步怎么办？",
        "我还能申请复审吗？",
        "什么是8501签证条件？",
        "Can I leave Australia and come back if I only hold a bridging visa?",
    ]
    for sample in samples:
        ctx = service.prepare_turn(question=sample)
        print("---")
        print("input:", sample)
        print("language:", ctx.response_language)
        print("internal_question_en:", ctx.internal_question_en)
        print("reason:", ctx.canonicalization_reason)


if __name__ == "__main__":
    main()
