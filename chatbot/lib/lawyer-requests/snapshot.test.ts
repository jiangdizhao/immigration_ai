import assert from "node:assert/strict";
import test from "node:test";
import type { DBMessage } from "@/lib/db/schema";
import { buildLawyerRequestSnapshot } from "./snapshot";

function message(
  id: string,
  role: string,
  parts: unknown[],
  offset: number
): DBMessage {
  return {
    id,
    chatId: "00000000-0000-0000-0000-000000000001",
    role,
    parts,
    attachments: [],
    createdAt: new Date(`2026-08-29T00:00:0${offset}.000Z`),
  };
}

test("snapshot keeps visible context and an allowlisted evidence packet only", () => {
  const result = buildLawyerRequestSnapshot({
    assistantMessageId: "assistant-2",
    messages: [
      message("user-1", "user", [{ type: "text", text: "Can I apply?" }], 1),
      message(
        "assistant-2",
        "assistant",
        [
          { type: "text", text: "It depends on the facts." },
          {
            type: "metadata",
            assistantMode: "premium",
            compactSources: ["Migration Regulations"],
            citations: [
              {
                source_id: "source-1",
                title: "Official source",
                quote: "A short quote",
                used_for: "eligibility",
                url: "https://example.test/source",
                source_type: "legislation",
                authority: "primary",
                retrievalDebug: { secret: "must not persist" },
              },
            ],
            retrievalDebug: { raw: "must not persist" },
          },
        ],
        2
      ),
    ],
  });

  assert.equal("error" in result, false);
  if ("error" in result) {
    return;
  }
  assert.equal(result.questionSnapshot, "Can I apply?");
  assert.equal(result.answerSnapshot, "It depends on the facts.");
  assert.equal(result.assistantMode, "premium");
  assert.deepEqual(
    result.contextSnapshot.map((item) => item.role),
    ["user", "assistant"]
  );
  assert.equal(result.evidenceSnapshot.length, 2);
  assert.equal("retrievalDebug" in result.evidenceSnapshot[1], false);
});

test("snapshot rejects a non-assistant target and excludes hidden-only messages", () => {
  const result = buildLawyerRequestSnapshot({
    assistantMessageId: "user-1",
    messages: [
      message("system-1", "system", [{ type: "text", text: "hidden" }], 1),
      message("user-1", "user", [{ type: "text", text: "Question" }], 2),
    ],
  });
  assert.deepEqual(result, {
    error: "The selected message is not an assistant answer.",
  });
});
