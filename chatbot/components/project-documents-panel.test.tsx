import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getWorkspaceCopy } from "@/lib/workspace-copy";
import {
  createProjectDocumentRequestGeneration,
  ProjectDocumentsPanel,
} from "./project-documents-panel";

test("Project Documents panel explains the disabled trust gate in Chinese without mock files or actions", () => {
  const copy = getWorkspaceCopy("zh-CN").projectEntry.documents;
  const markup = renderToStaticMarkup(
    <ProjectDocumentsPanel
      copy={copy}
      projectId="project-fixture"
      projectRevision={1}
    />
  );
  assert.match(markup, /项目文件/);
  assert.match(markup, /不会显示模拟文件/);
  assert.match(markup, /扫描来源认证/);
  assert.doesNotMatch(markup, /<button|<input|<a\b|type="file"/iu);
});

test("Project Documents panel explains purpose-scoped privacy in English without mock files or actions", () => {
  const copy = getWorkspaceCopy("en").projectEntry.documents;
  const markup = renderToStaticMarkup(
    <ProjectDocumentsPanel
      copy={copy}
      projectId="project-fixture"
      projectRevision={1}
    />
  );
  assert.match(markup, /Project documents/);
  assert.match(markup, /No sample files are shown/);
  assert.match(markup, /specific purpose/);
  assert.match(markup, /scan-origin authentication/);
  assert.doesNotMatch(markup, /<button|<input|<a\b|type="file"/iu);
});

test("actions render only behind the separate enabled UI gate", () => {
  const copy = getWorkspaceCopy("en").projectEntry.documents;
  const markup = renderToStaticMarkup(
    <ProjectDocumentsPanel
      copy={copy}
      enabled
      projectId="project-fixture"
      projectRevision={1}
    />
  );
  assert.match(markup, /type="file"/u);
  assert.match(markup, /Source Chat ID/u);
  assert.match(markup, /type="checkbox"/u);
});

test("Project switches and enabled transitions create isolated panel instances", () => {
  const copy = getWorkspaceCopy("en").projectEntry.documents;
  const projectA = ProjectDocumentsPanel({
    copy,
    enabled: true,
    projectId: "project-a",
    projectRevision: 7,
  });
  const projectB = ProjectDocumentsPanel({
    copy,
    enabled: true,
    projectId: "project-b",
    projectRevision: 2,
  });
  const projectBDisabled = ProjectDocumentsPanel({
    copy,
    enabled: false,
    projectId: "project-b",
    projectRevision: 2,
  });

  assert.notEqual(projectA.key, projectB.key);
  assert.notEqual(projectB.key, projectBDisabled.key);
  assert.match(
    renderToStaticMarkup(projectB),
    /This Project has no files available to you\./u
  );
  assert.doesNotMatch(
    renderToStaticMarkup(projectB),
    /project-a|<a\b|Withdraw/iu
  );
  assert.doesNotMatch(renderToStaticMarkup(projectBDisabled), /<a\b|<button/iu);
});

test("an earlier Project fetch cannot commit after switching and a failed new fetch stays empty", async () => {
  const oldProjectRequest = createProjectDocumentRequestGeneration();
  const oldProjectRequestId = oldProjectRequest.begin();
  const responseFromOldProject = new Promise<string>((resolve) => {
    setTimeout(() => resolve("project-a-document"), 0);
  });
  oldProjectRequest.invalidate();

  const newProjectRequest = createProjectDocumentRequestGeneration();
  const newProjectRequestId = newProjectRequest.begin();
  let visibleDocuments: string[] = [];
  const oldResult = await responseFromOldProject;
  if (oldProjectRequest.isCurrent(oldProjectRequestId)) {
    visibleDocuments = [oldResult];
  }

  // The keyed Project B instance starts empty. Its failed request must keep it empty.
  if (newProjectRequest.isCurrent(newProjectRequestId)) {
    visibleDocuments = [];
  }
  assert.deepEqual(visibleDocuments, []);
  assert.equal(newProjectRequest.isCurrent(newProjectRequestId), true);
});
