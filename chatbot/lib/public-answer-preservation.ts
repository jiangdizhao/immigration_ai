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
  return { text: answer, preservedBackendAnswer: true };
}
