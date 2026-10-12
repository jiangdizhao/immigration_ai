/**
 * Phase 12 Stage 2 closure — the customer's explicit attachment choice, in both
 * locales.
 *
 * Rendered statically so the default state, the per-document labels, the
 * withholding notice and the over-limit error are all asserted without a
 * browser.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getWorkspaceCopy } from "@/lib/workspace-copy";
import { LawyerRequestAttachmentConsent } from "./lawyer-request-attachment-consent";

const zh = getWorkspaceCopy("zh-CN").lawyerRequest;
const en = getWorkspaceCopy("en").lawyerRequest;

const documents = [
  {
    documentId: "doc-1",
    filename: "visa-grant.pdf",
    runStatus: "complete",
    usedByAnswer: true,
  },
  {
    documentId: "doc-2",
    filename: "bank-statement.pdf",
    runStatus: "partial",
    usedByAnswer: false,
  },
];

test("Chinese consent panel lists every eligible document unchecked by default", () => {
  const markup = renderToStaticMarkup(
    <LawyerRequestAttachmentConsent
      copy={zh}
      documents={documents}
      maxSelectable={4}
      onToggle={() => undefined}
      selectedDocumentIds={[]}
    />
  );
  assert.match(markup, /data-testid="lawyer-attachment-consent"/u);
  assert.match(markup, /选择要共享给律师的文件/u);
  assert.match(markup, /默认不共享任何文件/u);
  assert.match(markup, /visa-grant\.pdf/u);
  assert.match(markup, /bank-statement\.pdf/u);
  assert.match(markup, /AI 答复声明使用过此文件/u);
  assert.match(markup, /AI 答复未声明使用此文件/u);
  assert.match(markup, /已选择: 0 \/ 4/u);
  assert.match(markup, /未选择任何文件，律师将不会收到文件摘录/u);
  // All checkboxes come unchecked.
  assert.doesNotMatch(markup, /checked=""/u);
  assert.doesNotMatch(markup, /checked="true"/u);
  assert.match(markup, /type="checkbox"/u);
  assert.match(markup, /<fieldset/u);
  assert.match(markup, /<legend/u);
});

test("English consent panel lists every eligible document unchecked by default", () => {
  const markup = renderToStaticMarkup(
    <LawyerRequestAttachmentConsent
      copy={en}
      documents={documents}
      maxSelectable={4}
      onToggle={() => undefined}
      selectedDocumentIds={[]}
    />
  );
  assert.match(markup, /Choose the documents to share with the lawyer/u);
  assert.match(markup, /Nothing is shared by default/u);
  assert.match(markup, /The AI answer said it used this document/u);
  assert.match(markup, /The AI answer did not claim to use this document/u);
  assert.match(markup, /Selected: 0 \/ 4/u);
  assert.match(markup, /No document selected/u);
  assert.doesNotMatch(markup, /checked=""/u);
});

test("Chinese consent panel states the count and names withheld acknowledged files", () => {
  const markup = renderToStaticMarkup(
    <LawyerRequestAttachmentConsent
      copy={zh}
      documents={documents}
      maxSelectable={4}
      onToggle={() => undefined}
      selectedDocumentIds={["doc-2"]}
    />
  );
  assert.match(markup, /已选择: 1 \/ 4/u);
  // The withheld AI-acknowledged document is named for the customer only.
  assert.match(markup, /你没有勾选/u);
  assert.match(markup, /visa-grant\.pdf/u);
  // The selected document is the only checked one.
  assert.equal((markup.match(/checked=""/gu) ?? []).length, 1);
});

test("English consent panel warns before submission and blocks over-limit", () => {
  const withheld = renderToStaticMarkup(
    <LawyerRequestAttachmentConsent
      copy={en}
      documents={documents}
      maxSelectable={4}
      onToggle={() => undefined}
      selectedDocumentIds={["doc-2"]}
    />
  );
  assert.match(withheld, /Selected: 1 \/ 4/u);
  assert.match(withheld, /You have not checked these documents/u);
  assert.match(withheld, /visa-grant\.pdf/u);

  const overLimit = renderToStaticMarkup(
    <LawyerRequestAttachmentConsent
      copy={en}
      documents={documents}
      error={en.attachmentsLimitError}
      maxSelectable={4}
      onToggle={() => undefined}
      selectedDocumentIds={["doc-1", "doc-2"]}
    />
  );
  assert.match(overLimit, /Selected: 2 \/ 4/u);
  assert.match(overLimit, /at most four documents/u);
  assert.match(overLimit, /role="alert"/u);
});

test("both locales explain that excerpts are bounded and consent is required", () => {
  for (const copy of [zh, en]) {
    const markup = renderToStaticMarkup(
      <LawyerRequestAttachmentConsent
        copy={copy}
        documents={[]}
        maxSelectable={4}
        onToggle={() => undefined}
        selectedDocumentIds={[]}
      />
    );
    assert.match(markup, new RegExp(copy.attachmentsIntro.slice(0, 12), "u"));
    assert.match(markup, new RegExp(copy.attachmentsNone.slice(0, 8), "u"));
  }
});
