import { openai } from "@ai-sdk/openai";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";

const THINKING_SUFFIX_REGEX = /-thinking$/;

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        artifactModel,
        chatModel,
        reasoningModel,
        titleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "chat-model-reasoning": reasoningModel,
          "title-model": titleModel,
          "artifact-model": artifactModel,
        },
      });
    })()
  : null;

function mapGatewayStyleIdToOpenAIModel(modelId: string): string {
  const id = modelId.replace(THINKING_SUFFIX_REGEX, "");

  switch (id) {
    case "openai/gpt-4.1-mini":
      return "gpt-4o-mini";
    case "openai/gpt-5-mini":
      return "gpt-4o";
    default:
      return "gpt-4o-mini";
  }
}

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  const isReasoningModel =
    modelId.endsWith("-thinking") ||
    (modelId.includes("reasoning") && !modelId.includes("non-reasoning"));

  const openaiModelName = mapGatewayStyleIdToOpenAIModel(modelId);

  if (isReasoningModel) {
    return wrapLanguageModel({
      model: openai(openaiModelName),
      middleware: extractReasoningMiddleware({ tagName: "thinking" }),
    });
  }

  return openai(openaiModelName);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return openai("gpt-4o-mini");
}

export function getArtifactModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("artifact-model");
  }
  return openai("gpt-4o-mini");
}
