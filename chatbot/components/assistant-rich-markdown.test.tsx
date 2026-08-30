import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantRichMarkdown } from "./assistant-rich-markdown";

const sourceUrl = "https://www.legislation.gov.au/C2026C00090/latest/text";

test("renders generated terminal sources as a collapsed disclosure", () => {
  const markup = renderToStaticMarkup(
    <AssistantRichMarkdown
      text={`Main answer remains visible.\n\n## Actual web-search sources\n- [Official legislation](${sourceUrl})`}
    />
  );

  assert.match(markup, /Main answer remains visible\./);
  assert.match(markup, /<details[^>]*data-testid="source-disclosure"/);
  assert.doesNotMatch(markup, /<details[^>]*open/);
  assert.match(markup, /References \/ sources \(1\)/);
  assert.match(markup, new RegExp(`href="${sourceUrl}"`));
});

test("does not collapse ordinary source headings or create an empty disclosure", () => {
  const ordinaryMarkup = renderToStaticMarkup(
    <AssistantRichMarkdown text="A source is discussed.\n\n## Source overview\n- An ordinary source" />
  );
  const emptyMarkup = renderToStaticMarkup(
    <AssistantRichMarkdown text="No sources." />
  );

  assert.doesNotMatch(ordinaryMarkup, /source-disclosure/);
  assert.match(ordinaryMarkup, /Source overview/);
  assert.doesNotMatch(emptyMarkup, /source-disclosure/);
});
