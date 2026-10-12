import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Phase 12 Stage 2 R1 — the document-usage state must reach the client honestly.
 *
 * Reviewer finding R1-1: the backend used to report `customer_document_evidence_used`
 * as true whenever a packet was present and an answer existed. The bot side must
 * (a) keep the strict verified-flag gate for every customer-visible claim and
 * (b) carry the tri-state through telemetry, persistence and reload so an
 * unconfirmed packet is never upgraded anywhere along the way.
 */

const ROUTES = [
  "app/api/widget-chat/route.ts",
  "app/api/widget-chat-fast/route.ts",
  "app/api/widget-chat-direct/route.ts",
];

function source(relativePath: string) {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

test("R1: every widget route carries the backend document-usage state", () => {
  for (const route of ROUTES) {
    const text = source(route);
    assert.match(
      text,
      /customer_document_usage\?: string;/u,
      `${route} must type the backend usage state`
    );
    assert.match(
      text,
      /customerDocumentUsageState\(\s*data\.customer_document_usage,\s*customerDocumentEvidenceUsed\s*\)/u,
      `${route} must derive the usage state from the backend value, never invent it`
    );
    // Metadata (persisted) and the response payload (served) both carry it.
    assert.equal(
      (text.match(/customerDocumentUsage,/gu) ?? []).length >= 2,
      true,
      `${route} must record the usage state in metadata and in the response`
    );
  }
});

test("R1/R2: the customer-visible used-claim still requires the verified boolean", () => {
  for (const route of ROUTES) {
    const text = source(route);
    assert.match(
      text,
      /acknowledgedCustomerDocumentProvenance\(/u,
      `${route} must keep the deterministic provenance gate`
    );
    // R2: the gate also consumes the bounded acknowledged ids, so one
    // acknowledged document cannot claim the whole packaged packet.
    assert.match(
      text,
      /acknowledgedCustomerDocumentProvenance\(\s*customerDocumentManifest,\s*data\.customer_document_evidence_used,\s*[A-Za-z.]+,\s*data\.customer_document_used_ids\s*\)/u,
      `${route} must subset the request manifest by the backend's acknowledged ids`
    );
    // Only the acknowledged subset is served to the customer as used provenance.
    assert.match(
      text,
      /customerDocumentSources\(\s*answeredCustomerDocumentManifest\s*\)/u,
      `${route} must serve only the acknowledged subset`
    );
    // R2: the packaged manifest and its acknowledged subset are persisted
    // separately, so lawyer review can tell attachments from acknowledged use.
    assert.match(
      text,
      /customerDocumentUsedIds: persistedCustomerDocumentUsedIds\(\s*answeredCustomerDocumentManifest,\s*customerDocumentEvidenceUsed\s*\)/u,
      `${route} must persist the acknowledged ids`
    );
  }
});

test("R1: resume and replay paths reload the honest usage state", () => {
  const defaultRoute = source("app/api/widget-chat/route.ts");
  assert.match(
    defaultRoute,
    /customerDocumentUsage: replayFields\.metadata\.customerDocumentUsage/u
  );
  assert.match(
    defaultRoute,
    /customerDocumentUsage: resumedFields\.metadata\.customerDocumentUsage/u
  );
  const directRoute = source("app/api/widget-chat-direct/route.ts");
  assert.match(
    directRoute,
    /customerDocumentUsage: storedFields\.metadata\.customerDocumentUsage/u
  );
  const fastRoute = source("app/api/widget-chat-fast/route.ts");
  assert.match(
    fastRoute,
    /customerDocumentUsage: storedFields\.metadata\.customerDocumentUsage/u
  );
});

test("R1: conversation reads and the workspace expose the usage state", () => {
  assert.match(
    source("lib/conversations/conversation-http.ts"),
    /customerDocumentUsage: metadata\.customerDocumentUsage/u
  );
  assert.match(
    source("lib/conversations/message-parts.ts"),
    /customerDocumentUsage: customerDocumentUsageState\(/u
  );
  assert.match(
    source("components/immigration-ai-workspace.tsx"),
    /customerDocumentUsage: data\.customerDocumentUsage \?\? "not_supplied"/u
  );
});

test("R1: the default serving path never derives use from availability", () => {
  const service = readFileSync(
    path.resolve(
      process.cwd(),
      "../legal-service/app/services/default_agent_serving_service.py"
    ),
    "utf8"
  );
  assert.match(service, /customer_document_usage_fields\(/u);
  assert.match(service, /matched_document_acknowledgements\(/u);
  assert.doesNotMatch(
    service,
    /document_evidence_used = bool\(\s*customer_document_evidence_present/u,
    "availability alone must never set the verified flag"
  );
});
