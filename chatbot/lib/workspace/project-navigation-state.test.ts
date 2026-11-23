import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isProjectMatterExpanded,
  toggleProjectMatterExpansion,
} from "./project-navigation-state";

test("only the active matter expands by default, with explicit choices preserved", () => {
  let overrides: Record<string, boolean> = {};
  assert.equal(
    isProjectMatterExpanded("school:a", "school:a", overrides),
    true
  );
  assert.equal(
    isProjectMatterExpanded("school:b", "school:a", overrides),
    false
  );

  overrides = toggleProjectMatterExpansion("school:a", "school:a", overrides);
  assert.equal(
    isProjectMatterExpanded("school:a", "school:a", overrides),
    false
  );

  // Selecting another matter expands it by default without undoing a deliberate
  // collapse or an explicitly expanded sibling.
  overrides = toggleProjectMatterExpansion(
    "student:500",
    "school:a",
    overrides
  );
  assert.equal(
    isProjectMatterExpanded("student:500", "school:a", overrides),
    true
  );
  assert.equal(
    isProjectMatterExpanded("school:a", "student:500", overrides),
    false
  );

  overrides = toggleProjectMatterExpansion(
    "school:a",
    "student:500",
    overrides
  );
  assert.equal(
    isProjectMatterExpanded("school:a", "student:500", overrides),
    true
  );
});
