export type ProjectMatterExpansion = Readonly<Record<string, boolean>>;

/**
 * A matter follows the currently selected target by default. Once a user
 * explicitly expands or collapses that matter, their choice wins until the
 * Project navigation is remounted for another Project.
 */
export function isProjectMatterExpanded(
  matterId: string,
  defaultExpandedMatterId: string | null,
  overrides: ProjectMatterExpansion
): boolean {
  return overrides[matterId] ?? matterId === defaultExpandedMatterId;
}

export function toggleProjectMatterExpansion(
  matterId: string,
  defaultExpandedMatterId: string | null,
  overrides: ProjectMatterExpansion
): Record<string, boolean> {
  const current = isProjectMatterExpanded(
    matterId,
    defaultExpandedMatterId,
    overrides
  );
  return { ...overrides, [matterId]: !current };
}
