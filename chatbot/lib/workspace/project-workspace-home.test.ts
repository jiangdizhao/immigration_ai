import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectWorkspaceHome } from "@/components/project-workspace-home";
import type { ProjectWorkspaceView } from "@/lib/workspace/project-workspace-view";
import { getWorkspaceCopy } from "@/lib/workspace-copy";

const projectId = "11111111-1111-4111-8111-111111111111";
const project = {
  id: projectId,
  createdAt: "2026-11-01T00:00:00.000Z",
  revision: 1,
  status: "active",
};

function render(
  input: {
    view?: ProjectWorkspaceView;
    locale?: "zh-CN" | "en";
    projectStatus?: string;
    navigationBusy?: boolean;
    temporaryGuestProject?: boolean;
    schoolPreparationRestricted?: boolean;
    schoolApplicationsEnabled?: boolean;
    schoolAdmissionsEnabled?: boolean;
    student500Enabled?: boolean;
    /** Phase 13 M9-C: the workspace summary read state that carries artifact references. */
    summaryState?: "idle" | "loading" | "ready" | "failed";
  } = {}
) {
  const copy = getWorkspaceCopy(input.locale ?? "en");
  return renderToStaticMarkup(
    React.createElement(ProjectWorkspaceHome, {
      copy: copy.projectEntry,
      locale: input.locale ?? "en",
      navigationBusy: input.navigationBusy ?? false,
      onSelectView: () => undefined,
      project: { ...project, status: input.projectStatus ?? project.status },
      projectDocumentsEnabled: false,
      projectReviewCopy: copy.projectReview,
      schoolAdmissionsCopy: copy.schoolAdmissions,
      schoolAdmissionsEnabled: input.schoolAdmissionsEnabled ?? true,
      schoolApplicationsCopy: copy.schoolApplications,
      schoolApplicationsEnabled: input.schoolApplicationsEnabled ?? true,
      student500Copy: copy.student500,
      student500Enabled: input.student500Enabled ?? true,
      schoolPreparationRestricted: input.schoolPreparationRestricted,
      summaryState: input.summaryState ?? "ready",
      temporaryGuestProject: input.temporaryGuestProject,
      view: input.view ?? "home",
    })
  );
}

test("the Project home replaces the empty pane with real Project identity", () => {
  const markup = render();
  assert.match(markup, /data-testid="project-workspace-home"/u);
  assert.match(markup, /data-testid="project-home-title"/u);
  assert.match(markup, new RegExp(projectId, "u"));
  assert.match(markup, /#11111111/u);
  assert.match(markup, /data-testid="project-home-status"/u);
  assert.match(markup, />Active</u);
  // The former neutral placeholder is gone from this surface.
  assert.doesNotMatch(markup, /project-selection-empty-state/u);
});

test("the Project home exposes the M5 sections and the M9-A document centre as tabs", () => {
  const markup = render();
  assert.match(markup, /data-testid="project-home-tabs"/u);
  for (const tab of [
    "home",
    "applications",
    "admissions",
    "student500",
    "documents",
  ]) {
    assert.match(
      markup,
      new RegExp(`data-testid="project-view-tab-${tab}"`, "u")
    );
  }
  assert.match(markup, /data-testid="project-home-open-applications"/u);
  assert.match(markup, /data-testid="project-home-open-admissions"/u);
  // Phase 13 M6.1: Student 500 preparation is a first-class Project area.
  assert.match(markup, /data-testid="project-home-open-student500"/u);
  // The enabled home tab links into both M5 surfaces.
  assert.doesNotMatch(
    markup,
    /data-testid="project-home-open-applications"[^>]*disabled/u
  );
});

test("existing M5 panels render in the main content area, not in the rail", () => {
  const applications = render({ view: "applications" });
  assert.match(applications, /data-testid="project-home-applications"/u);
  assert.match(applications, /data-testid="school-applications-panel"/u);
  assert.doesNotMatch(applications, /data-testid="school-admissions-panel"/u);

  const admissions = render({ view: "admissions" });
  assert.match(admissions, /data-testid="project-home-admissions"/u);
  assert.match(admissions, /data-testid="school-admissions-panel"/u);
  assert.doesNotMatch(admissions, /data-testid="school-applications-panel"/u);
});

test("disabled or restricted M5 sections stay truthful instead of faking state", () => {
  const disabled = render({
    view: "applications",
    schoolApplicationsEnabled: false,
  });
  assert.doesNotMatch(disabled, /data-testid="school-applications-panel"/u);
  assert.match(disabled, /not enabled in this environment/u);

  const restricted = render({
    view: "admissions",
    schoolAdmissionsEnabled: false,
    schoolPreparationRestricted: true,
  });
  assert.doesNotMatch(restricted, /data-testid="school-admissions-panel"/u);
  assert.match(restricted, /registered personal accounts only/u);

  // The home tab disables the unavailable next step rather than hiding it.
  const disabledHome = render({ schoolAdmissionsEnabled: false });
  assert.match(
    disabledHome,
    /data-testid="project-home-open-admissions"[^>]*disabled=""/u
  );

  // A restricted identity is told it needs a registered account, not that the
  // feature is missing.
  const restrictedHome = render({
    schoolApplicationsEnabled: false,
    schoolAdmissionsEnabled: false,
    schoolPreparationRestricted: true,
  });
  assert.match(restrictedHome, /registered personal accounts only/u);
  assert.doesNotMatch(restrictedHome, /not enabled in this environment/u);

  // No invented progress, Offer/CoE or approval state is presented anywhere.
  for (const markup of [disabled, restricted, disabledHome]) {
    assert.doesNotMatch(markup, /\b\d+\s*\/\s*12\b/u);
    assert.doesNotMatch(markup, /lawyer approved/iu);
  }
  assert.match(disabledHome, /data-testid="project-home-limits"/u);
});

test("guest Projects keep their temporary-session disclosure on the home surface", () => {
  const guest = render({ temporaryGuestProject: true });
  assert.match(guest, /data-testid="project-home-guest-notice"/u);
  assert.match(guest, /temporary guest session only/u);
  assert.doesNotMatch(render(), /data-testid="project-home-guest-notice"/u);
});

test("the Project home is localized and keeps a closed Project honest", () => {
  const zh = render({ locale: "zh-CN" });
  assert.match(zh, /项目主页/u);
  assert.match(zh, /学校申请/u);
  assert.match(zh, /入学流程/u);
  assert.doesNotMatch(zh, /Project home/u);

  const en = render({ locale: "en" });
  assert.match(en, /Project home/u);
  assert.match(en, /School applications/u);
  assert.match(en, /Admissions workflow/u);

  const closed = render({ projectStatus: "closed" });
  assert.match(closed, />Closed</u);
});

test("the document centre never presents an unreadable artifact source as empty", () => {
  /*
    Phase 13 M9-C: the M2 document list already distinguished failure from emptiness, but
    the generated-artifact references below it did not. A failed summary read therefore
    claimed the Project had nothing to reference.
  */
  const ready = render({ view: "documents" });
  assert.match(ready, /data-testid="project-artifacts-empty"/u);
  assert.doesNotMatch(ready, /data-testid="project-artifacts-unavailable"/u);

  const failed = render({ view: "documents", summaryState: "failed" });
  assert.match(failed, /data-testid="project-artifacts-unavailable"/u);
  assert.doesNotMatch(failed, /data-testid="project-artifacts-empty"/u);
  assert.doesNotMatch(failed, /暂无可引用的生成成果/u);

  // While the summary is still loading, "no artifact" is not yet a fact either.
  const loading = render({ view: "documents", summaryState: "loading" });
  assert.match(loading, /data-testid="project-artifacts-loading"/u);
  assert.doesNotMatch(loading, /data-testid="project-artifacts-empty"/u);

  const zh = render({
    view: "documents",
    summaryState: "failed",
    locale: "zh-CN",
  });
  assert.match(zh, /成果来源当前无法读取/u);
  assert.doesNotMatch(zh, /暂无可引用的生成成果/u);
  assert.doesNotMatch(zh, /artifact source could not be read/u);
});

test("the Project home does not offer section changes while navigation is busy", () => {
  const busy = render({ navigationBusy: true });
  // Every tab is disabled, so a click cannot switch sections mid-request.
  const tabs = busy.match(
    /<button[^>]*data-testid="project-view-tab-[^"]+"[^>]*>/gu
  );
  // home, applications, admissions, student500, documents, review (M9-B).
  assert.ok(tabs && tabs.length === 6);
  for (const tab of tabs) {
    assert.match(tab, /disabled=""/u);
  }
  // Both next-step cards are disabled as well.
  assert.match(
    busy,
    /<button[^>]*data-testid="project-home-open-applications"[^>]*disabled=""/u
  );
  assert.match(
    busy,
    /<button[^>]*data-testid="project-home-open-admissions"[^>]*disabled=""/u
  );
  assert.match(
    busy,
    /<button[^>]*data-testid="project-home-open-student500"[^>]*disabled=""/u
  );

  // Idle navigation stays available.
  const idle = render({ navigationBusy: false });
  assert.match(
    idle,
    /<button[^>]*data-testid="project-home-open-applications"(?![^>]*disabled)[^>]*>/u
  );
});
