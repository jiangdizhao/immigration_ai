export type TrustedStaffProvenance = {
  actingStaffRole: "lawyer" | "admin";
  reviewerId: string;
};

export function trustedStaffProvenance(
  actingStaffRole: string | null | undefined,
  reviewerId: string | null | undefined
): TrustedStaffProvenance | null {
  if (
    (actingStaffRole !== "lawyer" && actingStaffRole !== "admin") ||
    !reviewerId?.trim()
  ) {
    return null;
  }

  return {
    actingStaffRole,
    reviewerId: reviewerId.trim(),
  };
}

export async function runLearningBridgeFailNeutral<T>(
  attempt: () => Promise<T>,
  onFailure: () => void
): Promise<T | null> {
  try {
    return await attempt();
  } catch {
    onFailure();
    return null;
  }
}
