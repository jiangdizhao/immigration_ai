"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FactInputField } from "./fact-input-field";
import { KnownFactsSummary } from "./known-facts-summary";
import { ConsultationEscalationCard } from "./consultation-escalation-card";
import type {
  InteractionPlan,
  FactSlotState,
  IntakeFacts,
} from "./guided-intake-types";

type Props = {
  interactionPlan?: InteractionPlan | null;
  factSlotStates?: FactSlotState[] | null;
  draftFacts: IntakeFacts;
  onDraftChange: (key: string, value: string | number | boolean | null) => void;
  onSubmitDraftFacts: () => void;
  onBookConsultation?: () => void;
  isSubmitting?: boolean;
};

export function GuidedIntakeCard({
  interactionPlan,
  factSlotStates,
  draftFacts,
  onDraftChange,
  onSubmitDraftFacts,
  onBookConsultation,
  isSubmitting,
}: Props) {
  if (!interactionPlan) return null;

  const mode = interactionPlan.mode ?? "guided_intake";
  const requestedFacts = interactionPlan.requested_facts ?? [];
  const ratio =
    interactionPlan.progress?.ratio ??
    (interactionPlan.progress?.total
      ? (interactionPlan.progress?.completed ?? 0) / interactionPlan.progress.total
      : 0);

  const slotMap = new Map(
    (factSlotStates ?? []).map((slot) => [slot.key ?? slot.fact_key, slot] as const)
  );

  const effectiveValue = (factKey: string) => {
    if (Object.prototype.hasOwnProperty.call(draftFacts, factKey)) {
      return draftFacts[factKey];
    }
    const slot = slotMap.get(factKey);
    if (!slot) return undefined;
    if (slot.value !== undefined) return slot.value;
    return undefined;
  };

  if (mode === "escalation") {
    return (
      <ConsultationEscalationCard
        warnings={interactionPlan.warnings}
        onBookConsultation={onBookConsultation}
      />
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card/80 p-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Guided intake</h3>
          {interactionPlan.progress?.total ? (
            <span className="text-xs text-muted-foreground">
              {interactionPlan.progress?.completed ?? 0}/{interactionPlan.progress.total}
            </span>
          ) : null}
        </div>
        <Progress value={Math.round(ratio * 100)} />
        {interactionPlan.primary_prompt ? (
          <p className="text-sm text-muted-foreground">
            {interactionPlan.primary_prompt}
          </p>
        ) : null}
      </div>

      <KnownFactsSummary facts={interactionPlan.known_facts_summary} />

      {interactionPlan.warnings?.length ? (
        <Alert>
          <AlertTitle>Important</AlertTitle>
          <AlertDescription className="mt-2">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {interactionPlan.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {requestedFacts.length ? (
        <div className="space-y-3">
          {requestedFacts.map((fact) => (
            <FactInputField
              key={fact.key ?? fact.fact_key}
              fact={fact}
              value={effectiveValue(fact.key ?? fact.fact_key)}
              onChange={onDraftChange}
            />
          ))}

          <div className="flex items-center justify-end gap-2">
            <Button onClick={onSubmitDraftFacts} disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit details"}
            </Button>
          </div>
        </div>
      ) : null}

      {!requestedFacts.length && mode === "analysis_ready" ? (
        <Alert>
          <AlertTitle>Ready for analysis</AlertTitle>
          <AlertDescription className="text-sm">
            The backend has enough information to continue the legal analysis.
          </AlertDescription>
        </Alert>
      ) : null}

      {factSlotStates?.length ? (
        <details className="rounded-xl border border-border/50 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Fact slot details
          </summary>
          <div className="mt-3 space-y-2 text-sm">
            {factSlotStates.map((slot) => (
              <div
                key={slot.key ?? slot.fact_key}
                className="rounded-lg border border-border/40 px-3 py-2"
              >
                <div className="font-medium">{slot.label ?? slot.key ?? slot.fact_key}</div>
                <div className="text-muted-foreground">
                  status: {slot.status ?? "unknown"}
                  {slot.value !== undefined && slot.value !== null
                    ? ` • value: ${String(slot.value_display ?? slot.value)}`
                    : ""}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}