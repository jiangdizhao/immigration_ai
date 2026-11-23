import assert from "node:assert/strict";
import test from "node:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MatterDocumentsPanel } from "@/components/matter-documents-panel";
import {
  boundedComposerHeight,
  shouldSubmitComposerOnEnter,
  WorkspaceChatComposer,
} from "@/components/workspace-chat-composer";
import { getWorkspaceCopy } from "@/lib/workspace-copy";

function renderComposer({
  locale = "en",
  value = "",
  disabled = false,
  status = "ready",
  attachmentControl,
}: {
  locale?: "en" | "zh-CN";
  value?: string;
  disabled?: boolean;
  status?: "ready" | "submitted" | "typing";
  attachmentControl?: React.ReactNode;
} = {}) {
  const copy = getWorkspaceCopy(locale);
  return renderToStaticMarkup(
    <WorkspaceChatComposer
      attachmentControl={attachmentControl}
      disabled={disabled}
      inputLabel={copy.consultation.inputLabel}
      onSubmit={() => undefined}
      onValueChange={() => undefined}
      placeholder={copy.consultation.placeholder}
      sendLabel={copy.consultation.send}
      status={status}
      submittedLabel={copy.status.submitted}
      typingLabel={copy.status.typing}
      value={value}
    />
  );
}

test("the composer exposes a short placeholder and independent localized label", () => {
  const en = renderComposer();
  const zh = renderComposer({ locale: "zh-CN" });

  assert.match(en, /aria-label="Message input"/u);
  assert.match(en, /placeholder="Message…"/u);
  assert.match(zh, /aria-label="输入消息"/u);
  assert.match(zh, /placeholder="输入消息…"/u);
  assert.doesNotMatch(en, /Press Enter|composerHelp|General information only/u);
  assert.doesNotMatch(zh, /按 Enter|composerHelp|不构成法律意见/u);
  assert.match(en, /min-h-\[72px\]/u);
  assert.match(en, /max-h-\[min\(196px,30dvh\)\]/u);
  assert.match(en, /overflow-y-auto/u);
  assert.match(en, /workspace-input/u);
});

test("the input remains controlled, the send action is available, and status is transient", () => {
  const ready = renderComposer({ value: "A long restored question" });
  assert.match(ready, />A long restored question<\/textarea>/u);
  assert.match(ready, /aria-label="Send"/u);
  assert.doesNotMatch(ready, /workspace-composer-status/u);

  const submitted = renderComposer({ status: "submitted" });
  assert.match(submitted, /<output[^>]*aria-live="polite"/u);
  assert.match(submitted, /workspace-composer-status/u);

  const typing = renderComposer({ status: "typing" });
  assert.match(typing, /<output[^>]*aria-live="polite"/u);
});

test("empty and disabled sends remain disabled", () => {
  const emptyButton = renderComposer().match(
    /<button[^>]*data-testid="workspace-send"[^>]*>/u
  )?.[0];
  const disabledButton = renderComposer({
    value: "question",
    disabled: true,
  }).match(/<button[^>]*data-testid="workspace-send"[^>]*>/u)?.[0];

  assert.match(emptyButton ?? "", /disabled=""/u);
  assert.match(disabledButton ?? "", /disabled=""/u);
});

test("Enter sends but Shift+Enter and Chinese IME composition do not", () => {
  assert.equal(
    shouldSubmitComposerOnEnter({
      key: "Enter",
      shiftKey: false,
      isComposing: false,
    }),
    true
  );
  assert.equal(
    shouldSubmitComposerOnEnter({
      key: "Enter",
      shiftKey: true,
      isComposing: false,
    }),
    false
  );
  assert.equal(
    shouldSubmitComposerOnEnter({
      key: "Enter",
      shiftKey: false,
      isComposing: true,
    }),
    false
  );
  assert.equal(
    shouldSubmitComposerOnEnter({
      key: "Enter",
      shiftKey: false,
      isComposing: false,
      keyCode: 229,
    }),
    false
  );
});

test("textarea growth is bounded and scrolls after the cap", () => {
  assert.equal(boundedComposerHeight(64, 72, 196), 72);
  assert.equal(boundedComposerHeight(118, 72, 196), 118);
  assert.equal(boundedComposerHeight(520, 72, 196), 196);
  assert.equal(boundedComposerHeight(100, 72, 55), 72);
  assert.match(renderComposer(), /overflow-y-auto/u);
  assert.match(renderComposer(), /min-w-0 flex-1/u);
});

test("compact Project document unavailability stays out of the Composer", () => {
  const copy = getWorkspaceCopy("en");
  const markup = renderComposer({
    attachmentControl: (
      <MatterDocumentsPanel
        chatId="project-chat"
        compact
        conversationDocumentsAvailable={false}
        copy={copy}
      />
    ),
  });

  assert.doesNotMatch(markup, /project-documents-unavailable/u);
  assert.doesNotMatch(
    markup,
    /Project conversation documents are not available/u
  );
  assert.doesNotMatch(markup, /type="file"/u);
  assert.doesNotMatch(markup, /composer-upload/u);
});

test("available attachments keep an accessible upload control", () => {
  const copy = getWorkspaceCopy("en");
  const markup = renderComposer({
    attachmentControl: (
      <MatterDocumentsPanel
        accountAccess
        chatId="standalone-chat"
        compact
        conversationDocumentsAvailable
        copy={copy}
      />
    ),
  });

  assert.match(markup, /data-testid="composer-upload"/u);
  assert.match(markup, /aria-label="Upload file"/u);
  assert.match(markup, /type="file"/u);
});
