export type DocumentVisionEnvironment = {
  MATTER_DOCUMENT_VISION_ENABLED?: string;
  MATTER_DOCUMENT_VISION_MODEL?: string;
  OPENAI_API_KEY?: string;
};

export function configuredDocumentVisionModel(
  environment: DocumentVisionEnvironment
): string | undefined {
  const model = environment.MATTER_DOCUMENT_VISION_MODEL?.trim();
  if (
    environment.MATTER_DOCUMENT_VISION_ENABLED !== "true" ||
    !model ||
    !environment.OPENAI_API_KEY?.trim()
  ) {
    return undefined;
  }
  return model;
}
