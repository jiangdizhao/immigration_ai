import { geolocation, ipAddress } from "@vercel/functions";
import { convertToModelMessages, generateText } from "ai";
import { z } from "zod";
import { allowedModelIds } from "@/lib/ai/models";
import {
  getRequestPromptFromHints,
  regularPrompt,
  type RequestHints,
} from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimit } from "@/lib/ratelimit";
import type { ChatMessage } from "@/lib/types";

export const maxDuration = 60;

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(4000),
});

const filePartSchema = z.object({
  type: z.literal("file"),
  mediaType: z.enum(["image/jpeg", "image/png"]),
  name: z.string().min(1).max(100),
  url: z.string().url(),
});

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.union([textPartSchema, filePartSchema, z.any()])),
});

const widgetRequestBodySchema = z.object({
  id: z.string().uuid(),
  messages: z.array(messageSchema).min(1),
  selectedChatModel: z.string(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { messages, selectedChatModel } = widgetRequestBodySchema.parse(json);

    if (!allowedModelIds.has(selectedChatModel)) {
      return new ChatbotError("bad_request:api").toResponse();
    }

    await checkIpRateLimit(ipAddress(request));

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    const system = `${regularPrompt}

${getRequestPromptFromHints(requestHints)}

You are the AI assistant for an immigration consultation service center.
Give general information only, not case-specific legal advice.
Keep answers practical, clear, and suitable for first-contact website visitors.
When appropriate, suggest booking a consultation with a real immigration lawyer.`;

    const modelMessages = await convertToModelMessages(messages as ChatMessage[]);

    const result = await generateText({
      model: getLanguageModel(selectedChatModel),
      system,
      messages: modelMessages,
    });

    const text =
      typeof result.text === "string" && result.text.trim().length > 0
        ? result.text.trim()
        : "Sorry, I could not generate a response right now.";

    console.log("widget-chat response length:", text.length);

    return Response.json({ text });
  } catch (error) {
    console.error("widget-chat error:", error);

    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    return Response.json(
      {
        text: "Sorry, I could not generate a response right now.",
      },
      { status: 200 }
    );
  }
}