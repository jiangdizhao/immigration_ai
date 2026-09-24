import "server-only";

import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { DocumentVisionExtractor } from "./types";
import { createDocumentVisionExtractor } from "./vision-adapter-core";
import { configuredDocumentVisionModel } from "./vision-config";

export function createOpenAIDocumentVisionExtractor(input: {
  model: string;
}): DocumentVisionExtractor {
  return createDocumentVisionExtractor({
    model: input.model,
    async call(request) {
      const response = await generateText({
        model: openai(request.model),
        system: request.system,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: request.prompt },
              {
                type: "image",
                image: request.bytes,
                mediaType: request.mediaType,
              },
            ],
          },
        ],
        maxOutputTokens: request.maxOutputTokens,
        maxRetries: 0,
        abortSignal: request.signal,
      });
      return response.text;
    },
  });
}

export function getConfiguredDocumentVision():
  | DocumentVisionExtractor
  | undefined {
  const model = configuredDocumentVisionModel({
    MATTER_DOCUMENT_VISION_ENABLED: process.env.MATTER_DOCUMENT_VISION_ENABLED,
    MATTER_DOCUMENT_VISION_MODEL: process.env.MATTER_DOCUMENT_VISION_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  });
  return model ? createOpenAIDocumentVisionExtractor({ model }) : undefined;
}
