/**
 * Phase 12 Stage 2 final correction — loading-failure and existing-request UI,
 * in both locales.
 *
 * Statically rendered so the blocked-submission message, the retry control and
 * the persisted (or unknown) shared-document count are asserted without a
 * browser.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getWorkspaceCopy } from "@/lib/workspace-copy";
import {
  LawyerAttachmentExistingNotice,
  LawyerAttachmentLoadFailure,
} from "./lawyer-request-attachment-status";

const zh = getWorkspaceCopy("zh-CN").lawyerRequest;
const en = getWorkspaceCopy("en").lawyerRequest;

test("Chinese loading failure blocks submission and offers a labelled retry", () => {
  let retries = 0;
  const markup = renderToStaticMarkup(
    <LawyerAttachmentLoadFailure
      copy={zh}
      onRetry={() => {
        retries += 1;
      }}
    />
  );
  assert.match(markup, /data-testid="lawyer-attachment-load-failure"/u);
  assert.match(markup, /无法加载可共享文件/u);
  assert.match(markup, /在文件列表成功加载之前，无法提交审阅请求/u);
  assert.match(markup, /data-testid="lawyer-attachment-retry"/u);
  assert.match(markup, /重新加载附件/u);
  assert.match(markup, /role="alert"/u);
  assert.equal(retries, 0);
});

test("English loading failure blocks submission and offers a labelled retry", () => {
  const markup = renderToStaticMarkup(
    <LawyerAttachmentLoadFailure copy={en} onRetry={() => undefined} />
  );
  assert.match(markup, /Unable to load the documents you can share/u);
  assert.match(
    markup,
    /cannot submit the review request until the document list has loaded/u
  );
  assert.match(markup, /Retry loading attachments/u);
  assert.match(markup, /type="button"/u);
});

test("an existing request is shown with its persisted count and no new controls", () => {
  for (const [copy, expected] of [
    [zh, [/已提交过律师审阅请求/u, /已共享附件: 2/u, /查看已有律师请求/u]],
    [
      en,
      [
        /already has a lawyer review request/u,
        /Shared attachments: 2/u,
        /View the existing lawyer request/u,
      ],
    ],
  ] as const) {
    const markup = renderToStaticMarkup(
      <LawyerAttachmentExistingNotice
        copy={copy}
        requestId="request-9"
        sharedDocumentCount={2}
      />
    );
    assert.match(markup, /data-testid="lawyer-attachment-existing"/u);
    assert.match(markup, /data-testid="lawyer-attachment-existing-count"/u);
    assert.match(markup, /data-testid="lawyer-attachment-existing-link"/u);
    assert.match(markup, /href="\/lawyer-requests\/request-9"/u);
    for (const pattern of expected) {
      assert.match(markup, pattern);
    }
    // No new-request controls are offered.
    assert.doesNotMatch(markup, /type="checkbox"/u);
    assert.doesNotMatch(markup, /data-testid="lawyer-request-submit"/u);
  }
});

test("a request without a recorded count reports unknown, not zero", () => {
  const zhUnknown = renderToStaticMarkup(
    <LawyerAttachmentExistingNotice
      copy={zh}
      requestId={null}
      sharedDocumentCount={null}
    />
  );
  assert.match(zhUnknown, /已共享附件: 未记录/u);
  assert.doesNotMatch(zhUnknown, /已共享附件: 0/u);
  // Without an id the link falls back to the list page.
  assert.match(zhUnknown, /href="\/lawyer-requests"/u);

  const enUnknown = renderToStaticMarkup(
    <LawyerAttachmentExistingNotice
      copy={en}
      requestId={null}
      sharedDocumentCount={null}
    />
  );
  assert.match(enUnknown, /Shared attachments: not recorded/u);
  assert.doesNotMatch(enUnknown, /Shared attachments: 0/u);
});

test("an explicitly persisted zero count is shown as zero", () => {
  const markup = renderToStaticMarkup(
    <LawyerAttachmentExistingNotice
      copy={en}
      requestId="request-1"
      sharedDocumentCount={0}
    />
  );
  assert.match(markup, /Shared attachments: 0/u);
  assert.doesNotMatch(markup, /not recorded/u);
});
