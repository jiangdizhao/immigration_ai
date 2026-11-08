import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Student500DraftForm } from "@/components/student-500-panel";
import { getWorkspaceCopy } from "@/lib/workspace-copy";
import {
  buildStudent500CreateBody,
  buildStudent500UpdateBody,
  draftFromStudent500Context,
  EMPTY_STUDENT_500_DRAFT,
  type LinkableSchoolApplication,
  loadLinkableSchoolApplications,
  type Student500ContextView,
  type Student500Draft,
  schoolApplicationsPath,
} from "./student-500";

/**
 * Phase 13 M9-A final UX correction 2 (Issue #2).
 *
 * `SchoolApplicationLinkField` existed but was never mounted in the create/edit form, so a
 * customer choosing the "school application in progress" route could not select the
 * authorized M5.1 application. These are database-free render/contract tests.
 */

const projectId = "22222222-2222-4222-8222-222222222222";
const foreignProjectId = "33333333-3333-4333-8333-333333333333";
const applicationId = "44444444-4444-4444-8444-444444444444";

const copy = getWorkspaceCopy("en").student500;

const link: LinkableSchoolApplication = {
  courseTitle: "Master of Science",
  institutionName: "University of Wollongong",
  revision: 5,
  schoolApplicationId: applicationId,
  sourceStatus: "authoritative",
  status: "preparing",
};

function draft(overrides: Partial<Student500Draft> = {}): Student500Draft {
  return { ...EMPTY_STUDENT_500_DRAFT, ...overrides };
}

function render(input: {
  linkState: "idle" | "loading" | "loaded" | "error";
  links?: readonly LinkableSchoolApplication[];
  draft?: Student500Draft;
  idPrefix?: string;
}) {
  return renderToStaticMarkup(
    React.createElement(Student500DraftForm, {
      copy,
      draft: input.draft ?? draft(),
      idPrefix: input.idPrefix ?? "student500-create",
      linkState: input.linkState,
      links: input.links ?? [],
      onChange: () => undefined,
      onLoadLinks: () => undefined,
    })
  );
}

test("the selector is mounted for the in-progress route in create and edit forms", () => {
  for (const idPrefix of ["student500-create", "student500-edit"]) {
    // Before the correction no school-application field could appear at all.
    const markup = render({
      draft: draft({ entryRoute: "school_application_in_progress" }),
      idPrefix,
      linkState: "loaded",
      links: [link],
    });
    assert.match(
      markup,
      new RegExp(`data-testid="${idPrefix}-school-application-field"`, "u")
    );
    assert.match(
      markup,
      new RegExp(`data-testid="${idPrefix}-school-application"`, "u")
    );
    // The authorized application is offered with institution, course and real status.
    assert.match(markup, /University of Wollongong/u);
    assert.match(markup, /Master of Science/u);
    assert.match(markup, new RegExp(`value="${applicationId}"`, "u"));
  }
});

test("the selector is hidden when the route does not need it", () => {
  const markup = render({
    draft: draft({ entryRoute: "offer_only" }),
    linkState: "loaded",
    links: [link],
  });
  assert.doesNotMatch(markup, /school-application-field/u);
  // A saved link keeps the field visible even if the route changed later.
  const saved = render({
    draft: draft({
      entryRoute: "offer_only",
      schoolApplicationId: applicationId,
    }),
    linkState: "loaded",
    links: [link],
  });
  assert.match(saved, /school-application-field/u);
  assert.match(saved, new RegExp(`value="${applicationId}"`, "u"));
});

test("a restored link survives reload and unknown links stay visible", () => {
  // Reload: the stored M6 context carries the id, so the select shows it again.
  const context = {
    ...EMPTY_STUDENT_500_DRAFT,
    entryRoute: "school_application_in_progress",
    schoolApplicationId: applicationId,
  } as Student500ContextView;
  assert.equal(
    draftFromStudent500Context(context).schoolApplicationId,
    applicationId
  );
  const restored = render({
    draft: draftFromStudent500Context(context),
    linkState: "loaded",
    links: [link],
  });
  assert.match(restored, new RegExp(`value="${applicationId}"`, "u"));

  // A previously saved link that is no longer in the authorized list must stay visible
  // (and removable) instead of silently disappearing or being rewritten.
  const stale = render({
    draft: draft({
      entryRoute: "school_application_in_progress",
      schoolApplicationId: applicationId,
    }),
    linkState: "loaded",
    links: [],
  });
  assert.match(stale, new RegExp(`value="${applicationId}"`, "u"));
  assert.match(stale, /unavailable/u);
});

test("unavailable, empty, loading and failed states are reported truthfully", () => {
  const inProgress = draft({ entryRoute: "school_application_in_progress" });

  const loading = render({ draft: inProgress, linkState: "loading" });
  assert.match(loading, /disabled/u);

  const failed = render({ draft: inProgress, linkState: "error" });
  // A failed load never fabricates an option.
  assert.doesNotMatch(failed, /University of Wollongong/u);

  const empty = render({ draft: inProgress, linkState: "loaded", links: [] });
  // Both truthful states are reported: the list is empty, and the route still needs a
  // link. Neither claims a link exists nor asserts an Offer/CoE outcome.
  assert.match(empty, /no school applications yet/iu);
  assert.match(empty, /needs one linked school application/iu);
  // No application id is offered or preselected when the authorized list is empty.
  assert.doesNotMatch(empty, new RegExp(`value="${applicationId}"`, "u"));
});

test("the association is Project-scoped and travels in the existing M6 body", async () => {
  const requested: string[] = [];
  const loader = await loadLinkableSchoolApplications({
    fetchImpl: (url) => {
      requested.push(String(url));
      return Promise.resolve(
        new Response(JSON.stringify({ applications: [] }), { status: 200 })
      );
    },
    projectId,
  });
  assert.equal(loader.ok, true);
  assert.deepEqual(requested, [schoolApplicationsPath(projectId)]);
  assert.match(requested[0], new RegExp(projectId, "u"));
  // Project B can never be asked for here, so Project A's records cannot be offered.
  assert.doesNotMatch(requested[0], new RegExp(foreignProjectId, "u"));
  assert.notEqual(
    schoolApplicationsPath(projectId),
    schoolApplicationsPath(foreignProjectId)
  );

  // No second association store: the selected id is part of the existing M6 context body
  // for both create and update, which the server validates.
  const selected = draft({
    entryRoute: "school_application_in_progress",
    schoolApplicationId: applicationId,
  });
  const created = buildStudent500CreateBody({
    draft: selected,
    operationId: "op-1",
  });
  assert.deepEqual(created, { context: selected, operationId: "op-1" });
  const updated = buildStudent500UpdateBody({
    draft: selected,
    expectedRevision: 3,
    operationId: "op-2",
  });
  assert.equal(updated.expectedRevision, 3);
  assert.deepEqual(updated.context, selected);
});
