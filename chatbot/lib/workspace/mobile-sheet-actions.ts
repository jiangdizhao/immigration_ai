/**
 * Phase 14-A R1-02 — mobile Sheet action settlement.
 *
 * The shared mobile navigation Sheet must reveal the Workspace only when an action
 * it launched actually produced its outcome:
 *
 * - a refused, rejected or failed action never closes it, so a failure can never
 *   look like a successful navigation;
 * - one action closes it at most once, so a late or double-settled promise cannot
 *   close a Sheet the customer opened again.
 *
 * This is deliberately pure: the caller owns the state update, and the rule is
 * testable without a browser or a React tree.
 */
export type MobileSheetActionOutcome = "accepted" | "rejected";

export function createMobileSheetActionCloser(close: () => void): {
  /** Returns true only when this call is what actually closed the Sheet. */
  settle: (outcome: MobileSheetActionOutcome) => boolean;
} {
  let closed = false;
  return {
    settle(outcome) {
      if (outcome !== "accepted" || closed) {
        return false;
      }
      closed = true;
      close();
      return true;
    },
  };
}
