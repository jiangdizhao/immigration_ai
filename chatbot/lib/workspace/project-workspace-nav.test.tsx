import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectDocumentsCenter } from "@/components/project-documents-center";
import { ProjectOverviewPanel } from "@/components/project-overview-panel";
import { ProjectStepMaterialsPanel } from "@/components/project-step-materials-panel";
import { ProjectWorkspaceNav } from "@/components/project-workspace-nav";
import { EMPTY_PROJECT_ARTIFACTS } from "@/lib/workspace/project-artifacts";
import { deriveProjectOverview } from "@/lib/workspace/project-overview";
import {
  deriveProjectStages,
  stageSignalsFromSummary,
} from "@/lib/workspace/project-stages";
import type { ProjectWorkspaceSummary } from "@/lib/workspace/project-workspace-summary";
import { getWorkspaceCopy } from "@/lib/workspace-copy";

const projectId = "11111111-1111-4111-8111-111111111111";

const summary: ProjectWorkspaceSummary = {
  artifacts: EMPTY_PROJECT_ARTIFACTS,
  documents: { state: "disabled", summary: null },
  projectId,
  projectStatus: "active",
  revision: 2,
  schoolApplications: {
    state: "available",
    summary: {
      archived: 0,
      draft: 1,
      missingInformation: 1,
      packagePrepared: 0,
      preparing: 0,
      stale: 0,
      stalePackages: 0,
      total: 1,
    },
  },
  stageChats: {
    bindings: [
      {
        chatId: "22222222-2222-4222-8222-222222222222",
        stageKey: "student500",
      },
    ],
    state: "available",
  },
  student500: { state: "disabled", summary: null },
};

function stagesFor(input: ProjectWorkspaceSummary) {
  return deriveProjectStages({
    boundStageKeys: input.stageChats.bindings.map(
      (binding) => binding.stageKey
    ),
    signals: stageSignalsFromSummary({
      admissionsCapability: "available",
      summary: input,
    }),
    stageChatsAvailable: input.stageChats.state === "available",
  });
}

test("the step rail shows real statuses and step-conversation entry", () => {
  const copy = getWorkspaceCopy("en");
  const markup = renderToStaticMarkup(
    React.createElement(ProjectWorkspaceNav, {
      activeStageChatKey: null,
      copy: copy.projectEntry.projectWorkspace,
      navigationBusy: false,
      onOpenStageChat: () => undefined,
      onSelectView: () => undefined,
      pendingStageChatKey: null,
      stageChatError: null,
      stages: stagesFor(summary),
      view: "home",
    })
  );
  assert.match(markup, /data-testid="project-workspace-nav"/u);
  // Real status per stage, derived from the authorized projection.
  assert.match(markup, /data-testid="project-nav-stage-status-applications"/u);
  assert.match(markup, /Needs information/u);
  // A blocked capability says so rather than showing an invented zero.
  assert.match(markup, /data-testid="project-nav-stage-status-documents"/u);
  assert.match(markup, /Unavailable here/u);
  // Student 500 is bound, so the action offers to return to that conversation.
  assert.match(
    markup,
    /data-testid="project-nav-stage-chat-student500"[\s\S]*?Return to this step/u
  );
  // An unbound step offers to open its conversation instead.
  assert.match(
    markup,
    /data-testid="project-nav-stage-chat-applications"[\s\S]*?Open this step/u
  );
  // The document centre is not a workflow step, so it has no step conversation.
  assert.doesNotMatch(
    markup,
    /data-testid="project-nav-stage-chat-documents"/u
  );
  // No completion percentage or invented total is rendered.
  assert.doesNotMatch(markup, /\b\d+\s*\/\s*12\b/u);
});

test("an unapplied step-chat schema is reported, not hidden", () => {
  const copy = getWorkspaceCopy("en");
  const unbound = {
    ...summary,
    stageChats: { bindings: [], state: "unavailable" as const },
  };
  const markup = renderToStaticMarkup(
    React.createElement(ProjectWorkspaceNav, {
      activeStageChatKey: null,
      copy: copy.projectEntry.projectWorkspace,
      navigationBusy: false,
      onOpenStageChat: () => undefined,
      onSelectView: () => undefined,
      pendingStageChatKey: null,
      stageChatError: copy.projectEntry.projectWorkspace.stepChatUnavailable,
      stages: stagesFor(unbound),
      view: "applications",
    })
  );
  assert.match(markup, /data-testid="project-nav-stage-chat-error"/u);
  assert.match(
    markup,
    /data-testid="project-nav-stage-chat-applications"[^>]*disabled=""/u
  );
});

test("the overview separates preparation from readiness and lists real blockers", () => {
  const copy = getWorkspaceCopy("en");
  const stages = stagesFor(summary);
  const overview = deriveProjectOverview({
    stages,
    submissionCapabilityEnabled: false,
    summary,
  });
  const markup = renderToStaticMarkup(
    React.createElement(ProjectOverviewPanel, {
      copy: copy.projectEntry.projectWorkspace,
      navigationBusy: false,
      onRefresh: () => undefined,
      onSelectView: () => undefined,
      overview,
      stages,
      summaryState: "ready" as const,
    })
  );
  assert.match(markup, /data-testid="project-overview"/u);
  assert.match(markup, /data-testid="project-overview-preparation-state"/u);
  assert.match(markup, /Submission readiness/u);
  assert.match(markup, /data-testid="project-overview-readiness"/u);
  assert.match(markup, /Submission is not enabled in this build/u);
  assert.match(markup, /data-testid="project-overview-blockers"/u);
  assert.match(markup, /data-testid="project-overview-next-action"/u);
  // Never an invented completion ratio, admission or approval.
  assert.doesNotMatch(markup, /\b\d+\s*\/\s*\d+\s*(completed|complete)\b/iu);
  assert.doesNotMatch(markup, /lawyer approved|offer received|coe issued/iu);
});

test("the materials rail is step-scoped and blocks a closed document capability", () => {
  const copy = getWorkspaceCopy("en");
  const stages = stagesFor(summary);
  const markup = renderToStaticMarkup(
    React.createElement(ProjectStepMaterialsPanel, {
      activeStageChatKey: null,
      copy: copy.projectEntry.projectWorkspace,
      navigationBusy: false,
      onOpenStageChat: () => undefined,
      onSelectView: () => undefined,
      overview: deriveProjectOverview({
        stages,
        submissionCapabilityEnabled: false,
        summary,
      }),
      pendingStageChatKey: null,
      stageChatError: null,
      stages,
      view: "student500",
    })
  );
  assert.match(markup, /data-testid="project-step-materials"/u);
  assert.match(markup, /Student 500 preparation/u);
  assert.match(markup, /data-testid="project-step-materials-chat"/u);
  // Project documents are blocked in this environment; the rail says so.
  assert.match(
    markup,
    /data-testid="project-step-materials-documents-blocked"/u
  );
});

test("the document centre shows an accurate unavailable state when gated off", () => {
  const copy = getWorkspaceCopy("en");
  const markup = renderToStaticMarkup(
    React.createElement(ProjectDocumentsCenter, {
      centreCopy: copy.projectEntry.projectWorkspace,
      copy: copy.projectEntry.documents,
      enabled: false,
      projectId,
    })
  );
  assert.match(markup, /data-testid="project-documents-centre"/u);
  assert.match(markup, /data-testid="project-documents-centre-unavailable"/u);
  // No fabricated file rows, filters or download links while the gate is closed.
  assert.doesNotMatch(markup, /data-testid="project-documents-list"/u);
  assert.doesNotMatch(markup, /data-testid="project-documents-download"/u);
  // The centre is localized.
  const zh = renderToStaticMarkup(
    React.createElement(ProjectDocumentsCenter, {
      centreCopy: getWorkspaceCopy("zh-CN").projectEntry.projectWorkspace,
      copy: getWorkspaceCopy("zh-CN").projectEntry.documents,
      enabled: false,
      projectId,
    })
  );
  assert.match(zh, /项目文件/u);
  assert.doesNotMatch(zh, /Project document centre/u);
});

test("the document centre's return action is a previous-view action, not a claimed step", () => {
  const copy = getWorkspaceCopy("en");
  const markup = renderToStaticMarkup(
    React.createElement(ProjectDocumentsCenter, {
      centreCopy: copy.projectEntry.projectWorkspace,
      copy: copy.projectEntry.documents,
      enabled: false,
      onReturnToPrevious: () => undefined,
      projectId,
      returnLabel: "\u2190 School applications",
    })
  );
  // The old "return to the related step" claim is gone.
  assert.doesNotMatch(markup, /project-documents-return-to-step/u);
  assert.match(markup, /data-testid="project-documents-return-to-previous"/u);
  // The label is the section the customer actually came from.
  assert.match(markup, /School applications/u);
  // With no label supplied it still never claims an originating step.
  const generic = renderToStaticMarkup(
    React.createElement(ProjectDocumentsCenter, {
      centreCopy: copy.projectEntry.projectWorkspace,
      copy: copy.projectEntry.documents,
      enabled: false,
      onReturnToPrevious: () => undefined,
      projectId,
    })
  );
  assert.match(generic, /Return to the previous view/u);
  assert.doesNotMatch(generic, /related step/iu);
});

test("generated artifacts render as references with an owning-view link", () => {
  const copy = getWorkspaceCopy("en");
  const artifacts = {
    kinds: {
      school_application_package: "available" as const,
      student500_gs_draft: "available" as const,
      student500_snapshot: "available" as const,
      submission_package: "disabled" as const,
    },
    references: [
      {
        createdAt: "2026-11-01T00:00:00.000Z",
        digest: "a".repeat(64),
        kind: "school_application_package" as const,
        ownerView: "applications" as const,
        referenceId: "package-1",
        stale: false,
        status: "current",
        targetId: "44444444-4444-4444-8444-444444444444",
        version: 1,
      },
    ],
    truncated: false,
  };
  const markup = renderToStaticMarkup(
    React.createElement(ProjectDocumentsCenter, {
      artifacts,
      centreCopy: copy.projectEntry.projectWorkspace,
      copy: copy.projectEntry.documents,
      enabled: false,
      onOpenArtifactOwner: () => undefined,
      projectId,
    })
  );
  assert.match(markup, /data-testid="project-artifacts"/u);
  assert.match(markup, /data-testid="project-artifacts-list"/u);
  assert.match(markup, /School application package/u);
  // The owning workflow is offered as navigation only.
  assert.match(
    markup,
    /data-testid="project-artifact-open-school_application_package-package-1"/u
  );
  // The unsupported kind is reported, and no artifact download/preview exists.
  assert.match(
    markup,
    /data-testid="project-artifacts-kind-submission_package"/u
  );
  assert.doesNotMatch(markup, /data-testid="project-documents-download"/u);
  // An artifact is never presented as an M2 upload row.
  assert.doesNotMatch(markup, /data-testid="project-documents-list"/u);
});
