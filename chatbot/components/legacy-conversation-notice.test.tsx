import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getWorkspaceCopy } from "@/lib/workspace-copy";
import {
  LegacyConversationBadge,
  LegacyConversationNotice,
} from "./legacy-conversation-notice";

const zh = getWorkspaceCopy("zh-CN");
const en = getWorkspaceCopy("en");

test("archived conversation notice is explicit in Chinese", () => {
  const markup = renderToStaticMarkup(
    <LegacyConversationNotice
      copy={zh}
      onStartNewConversation={() => undefined}
    />
  );

  assert.match(markup, /data-testid="legacy-conversation-notice"/);
  assert.match(markup, /历史对话（只读）/);
  assert.match(markup, /只读/);
  assert.match(markup, /新建对话/);
});

test("archived conversation notice is explicit in English", () => {
  const markup = renderToStaticMarkup(
    <LegacyConversationNotice
      copy={en}
      onStartNewConversation={() => undefined}
    />
  );

  assert.match(markup, /data-testid="legacy-conversation-notice"/);
  assert.match(markup, /Archived conversation \(read-only\)/);
  assert.match(markup, /read-only/);
  assert.match(markup, /Start a new conversation/);
});

test("a read-only Project Chat is identified separately from legacy history", () => {
  const markup = renderToStaticMarkup(
    <LegacyConversationNotice
      copy={en}
      onStartNewConversation={() => undefined}
      projectChat
    />
  );

  assert.match(markup, /data-testid="project-chat-read-only-notice"/);
  assert.match(markup, /Project chat \(read-only\)/);
  assert.match(markup, /Project Chat is available for reading/);
  assert.doesNotMatch(markup, /legacy-conversation-notice/);
  assert.match(markup, /project-chat-start-new-conversation/);
});

test("the archived screen renders no message composer or upload control", () => {
  for (const copy of [zh, en]) {
    const markup = renderToStaticMarkup(
      <LegacyConversationNotice
        copy={copy}
        onStartNewConversation={() => undefined}
      />
    );

    // This is the mutation boundary: there is nothing to type into, no upload
    // input and no send button on the read-only surface.
    assert.doesNotMatch(markup, /<textarea/i);
    assert.doesNotMatch(markup, /<input/i);
    assert.doesNotMatch(markup, /workspace-input/);
    assert.doesNotMatch(markup, /workspace-send/);
    assert.doesNotMatch(markup, /type="file"/);
  }
});

test("the new-conversation action is the only enabled control", () => {
  const buttonTag = (markup: string) =>
    markup.match(
      /<button[^>]*data-testid="legacy-start-new-conversation"[^>]*>/
    )?.[0] ?? "";
  const enabled = buttonTag(
    renderToStaticMarkup(
      <LegacyConversationNotice
        copy={en}
        onStartNewConversation={() => undefined}
      />
    )
  );
  const disabled = buttonTag(
    renderToStaticMarkup(
      <LegacyConversationNotice
        copy={en}
        disabled
        onStartNewConversation={() => undefined}
      />
    )
  );

  assert.match(enabled, /data-testid="legacy-start-new-conversation"/);
  // `disabled` as a real attribute, not the Tailwind `disabled:` variant class.
  assert.doesNotMatch(enabled, /disabled=""/);
  assert.match(disabled, /data-testid="legacy-start-new-conversation"/);
  assert.match(disabled, /disabled=""/);
});

test("the conversation list badge marks archived history in both locales", () => {
  const zhBadge = renderToStaticMarkup(<LegacyConversationBadge copy={zh} />);
  const enBadge = renderToStaticMarkup(<LegacyConversationBadge copy={en} />);

  assert.match(zhBadge, /data-testid="legacy-conversation-badge"/);
  assert.match(zhBadge, /历史归档/);
  assert.match(enBadge, /data-testid="legacy-conversation-badge"/);
  assert.match(enBadge, /Archived/);
});
