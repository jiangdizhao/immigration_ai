// biome-ignore-all lint/performance/noNamespaceImport: Node 24 test hooks are absent from the installed Node type declarations.
// biome-ignore-all lint/suspicious/useAwait: Async route fakes return immediate responses.
// biome-ignore-all lint/suspicious/noExplicitAny: isolated route mocks use a shared test fixture.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const f = globalThis as any;
f.__m2Route = {
  payloads: [],
  refreshes: 0,
  userId: "owner",
  projectId: "project-a",
};
const modules: Record<string, string> = {
  "@vercel/functions": "export const ipAddress = () => undefined;",
  "@/app/(auth)/auth": `export const auth = async () => ({ user: { id: 'owner', type: 'regular' } });`,
  "@/lib/ai/models": `export const allowedModelIds = new Set(['synthetic']);`,
  "@/lib/assistant-mode-access":
    "export const isGuestAssistantUser = () => false; export const assistantModeAccessPolicy = () => ({ slowAllowed: true });",
  "@/lib/conversations/widget-conversation-bookkeeping":
    "export const updateWidgetConversationBookkeeping = async () => {};",
  "@/lib/conversations/widget-turn": `
    export const resolveClientTurnId = () => 'test-turn';
    export const beginWidgetTurn = async () => ({status:'proceed',turnId:'turn',executionOwnerId:'owner',executionAttempt:1,persistence:{userTurnPersisted:true,attempts:1}});
    export const startWidgetTurnHeartbeat = () => ({stop(){}});
    export const completeWidgetTurn = async () => ({assistantMessageId:null});
    export const completeWidgetTurnFromParts = async () => ({});
    export const failWidgetTurn = async () => {};
    export const widgetFieldsFromAssistantParts = () => ({});
  `,
  "@/lib/db/queries":
    "export const getImmigrationConversationByChatId = async ({chatId}) => ({chatId, legalMatterId:null}); export const getUserEntitlementById = async () => ({});",
  "@/lib/default-agent-runtime-debug":
    "export const defaultAgentRuntimeDebug = () => null;",
  "@/lib/errors": `export class ChatbotError extends Error { toResponse(){ return Response.json({error:'failed'},{status:400}); } }`,
  "@/lib/lawyer-requests/service":
    "export const createImmigrationAnswerTraceLink = async () => {};",
  "@/lib/lawyer-requests/trace-link":
    "export const buildImmigrationAnswerTraceLinkValues = () => null;",
  "@/lib/legal-service-transport": `export const requestLegalService = async ({payload}) => { globalThis.__m2Route.payloads.push(payload); return {ok:true,data:{answer:'Synthetic answer',citations:[],compact_sources:[]}}; };`,
  "@/lib/matter-documents/ai-evidence":
    "export const customerDocumentSources = () => [];",
  "@/lib/matter-documents/customer-document-provenance": `export const acknowledgedCustomerDocumentProvenance = () => ({used:false,manifest:[]}); export const customerDocumentUsageState = () => 'not_used'; export const persistedCustomerDocumentUsedIds = () => [];`,
  "@/lib/policy-intelligence-server":
    "export const resolveConversationPolicyTopicContextEntry = async () => null;",
  "@/lib/political-gate": `export const evaluateWidgetSubmission = () => ({decision:'allow',policyVersion:'synthetic',decisionId:'synthetic'}); export const sanitizePoliticalHistory = (x) => x; export const blockedResponseForLocale = () => ({text:'blocked',responseLanguage:'en'});`,
  "@/lib/projects/chat-ingress":
    "export const guardProjectChatIngress = async () => null;",
  "@/lib/public-answer-preservation":
    "export const preservePublicAnswer = ({backendAnswer,emptyFallback}) => backendAnswer || emptyFallback;",
  "@/lib/ratelimit": "export const checkIpRateLimit = async () => {};",
  "@/lib/vip/entitlement": `export const isPremiumAllowed = () => true; export const premiumDeniedResponse = () => Response.json({error:'denied'}, {status:403});`,
  "@/lib/workspace/context-resolver": `export const resolveWorkspaceContext = async ({userId,actorType,question,chatId}) => { if(userId !== 'owner' || actorType !== 'regular' || !chatId || !question) throw Error('wrong actor'); return {documents:{evidence:{documents:[]},manifest:[],status:{}},policyBinding:null,refreshProjectContextBeforeProvider:async()=>{globalThis.__m2Route.refreshes++; if(globalThis.__m2Route.revoked) throw Error('revoked'); return globalThis.__m2Route.standalone ? null : globalThis.__m2Route.packet;}}; };`,
};
const fixtureDir = mkdtempSync(join(tmpdir(), "phase15-widget-mocks-"));
const mockUrls = Object.fromEntries(
  Object.entries(modules).map(([name, source], index) => {
    const filename = join(fixtureDir, `mock-${index}.mjs`);
    writeFileSync(filename, source);
    return [name, pathToFileURL(filename).href];
  })
);
type ResolutionContext = Record<string, unknown>;
type Resolution = { url: string; shortCircuit?: boolean };
type NextResolve = (
  specifier: string,
  context: ResolutionContext
) => Resolution;
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (
      specifier: string,
      context: ResolutionContext,
      nextResolve: NextResolve
    ) => Resolution;
  }) => unknown;
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = mockUrls[specifier];
    if (url) {
      return { url, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

test("all three real widget POST handlers send server-refreshed Project context, not browser fields", async () => {
  f.__m2Route.packet = {
    schemaVersion: "phase13.project-context.v1",
    contextOrigin: "project_chat",
    projectId: "project-a",
    confirmedProjectFacts: [],
    documentEvidence: [],
    assistantContext: {
      schemaVersion: "phase15.project-assistant-context.v1",
      contextOrigin: "project_chat",
      availability: "available",
      project: { id: "project-a" },
      matters: {
        schoolApplications: [
          { applicationId: "school-a" },
          { applicationId: "school-b" },
        ],
      },
    },
  };
  f.fetch = async (_url: unknown, init: { body: string }) => {
    f.__m2Route.payloads.push(JSON.parse(init.body));
    return Response.json({
      answer: "Synthetic answer",
      citations: [],
      compact_sources: [],
    });
  };
  const routes = [
    (await import("@/app/api/widget-chat-fast/route")).POST,
    (await import("@/app/api/widget-chat/route")).POST,
    (await import("@/app/api/widget-chat-direct/route")).POST,
  ];
  for (const [index, route] of routes.entries()) {
    const body = {
      id: "11111111-1111-4111-8111-111111111111",
      frontendChatId: "22222222-2222-4222-8222-222222222222",
      selectedChatModel: "synthetic",
      assistantMode: ["fast", "default", "premium"][index],
      messages: [
        {
          id: "synthetic-message",
          role: "user",
          parts: [{ type: "text", text: "What remains?" }],
        },
      ],
      project_assistant_context: { project: { id: "forged" } },
    };
    const response = await route(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    assert.equal(response.status, 200);
    assert.equal(
      f.__m2Route.payloads[index].project_assistant_context.project.id,
      "project-a"
    );
    assert.equal(
      f.__m2Route.payloads[index].project_assistant_context.matters
        .schoolApplications.length,
      2
    );
  }
  assert.equal(f.__m2Route.refreshes, 3);
  f.__m2Route.standalone = true;
  const standaloneBody = {
    id: "11111111-1111-4111-8111-111111111111",
    frontendChatId: "22222222-2222-4222-8222-222222222222",
    selectedChatModel: "synthetic",
    assistantMode: "fast",
    messages: [
      {
        id: "synthetic-message",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
      },
    ],
  };
  await routes[0](
    new Request("http://localhost/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(standaloneBody),
    })
  );
  assert.equal(
    "project_assistant_context" in f.__m2Route.payloads.at(-1),
    false
  );
  f.__m2Route.standalone = false;
  f.__m2Route.revoked = true;
  const priorCalls = f.__m2Route.payloads.length;
  await routes[0](
    new Request("http://localhost/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(standaloneBody),
    })
  );
  assert.equal(f.__m2Route.payloads.length, priorCalls);
});
