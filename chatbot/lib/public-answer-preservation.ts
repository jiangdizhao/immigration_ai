const FORBIDDEN_PUBLIC_ANSWER_PATTERNS = [
  /retrieval_debug/i,
  /proposal_first_verification_depth/i,
  /CustomerAnswerPlan JSON/i,
  /Original rich proposal JSON/i,
  /Verification JSON:/i,
  /raw_model_output/i,
  /internal JSON/i,
  /```json/i,
];

const OPENAI_CITATION_BLOCK =
  /\uE200cite\uE202(?:turn\d+search\d+)(?:\uE202turn\d+search\d+)*\uE201/gu;
const OPENAI_SEARCH_REFERENCE = /\bturn\d+search\d+\b/giu;
const OPENAI_CITATION_CONTROL = /[\uE200-\uE20F]/gu;

/** Remove provider control syntax without mapping it to any source. */
export function removeProviderCitationArtifacts(text: string): string {
  return text
    .replace(OPENAI_CITATION_BLOCK, "")
    .replace(OPENAI_SEARCH_REFERENCE, "")
    .replace(OPENAI_CITATION_CONTROL, "")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/[ \t]+([,.;:!?，。；：！？])/gu, "$1");
}

export function preservePublicAnswer(input: {
  backendAnswer: string | null | undefined;
  emptyFallback: string;
  forbiddenFallback: string;
}): { text: string; preservedBackendAnswer: boolean } {
  const answer = input.backendAnswer?.trim();
  if (!answer) {
    return { text: input.emptyFallback, preservedBackendAnswer: false };
  }
  if (
    FORBIDDEN_PUBLIC_ANSWER_PATTERNS.some((pattern) => pattern.test(answer))
  ) {
    return { text: input.forbiddenFallback, preservedBackendAnswer: false };
  }
  const safeAnswer = removeProviderCitationArtifacts(answer).trim();
  if (!safeAnswer) {
    return { text: input.emptyFallback, preservedBackendAnswer: false };
  }
  return { text: safeAnswer, preservedBackendAnswer: true };
}
