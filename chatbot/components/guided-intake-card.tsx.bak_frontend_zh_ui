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

const SHOW_WIDGET_DEBUG = process.env.NEXT_PUBLIC_WIDGET_DEBUG === "true";

type Props = {
  interactionPlan?: InteractionPlan | null;
  factSlotStates?: FactSlotState[] | null;
  draftFacts: IntakeFacts;
  onDraftChange: (key: string, value: string | number | boolean | null) => void;
  onSubmitDraftFacts: () => void;
  onBookConsultation?: () => void;
  isSubmitting?: boolean;
};

function slotKey(slot: FactSlotState) {
  return slot.key ?? slot.fact_key ?? "";
}

function requestKey(fact: NonNullable<InteractionPlan["requested_facts"]>[number]) {
  return fact.key ?? fact.fact_key ?? "";
}

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
  const allRequestedFacts = interactionPlan.requested_facts ?? [];
  const requestedFacts = SHOW_WIDGET_DEBUG ? allRequestedFacts : allRequestedFacts.slice(0, 1);
  const ratio =
    interactionPlan.progress?.ratio ??
    (interactionPlan.progress?.total
      ? (interactionPlan.progress?.completed ?? 0) / interactionPlan.progress.total
      : 0);

  const slotMap = new Map(
    (factSlotStates ?? []).map((slot) => [slotKey(slot), slot] as const)
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

  if (!requestedFacts.length && mode !== "analysis_ready") {
    return null;
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-900">
          {requestedFacts.length ? "One quick question" : "Ready for the next step"}
        </h3>
        <p className="text-sm leading-6 text-slate-600">
          {requestedFacts.length
            ? "This helps make the guidance more specific to your situation. You can also choose “Not sure” and continue."
            : "I have enough basic information to continue the general analysis."}
        </p>
      </div>

      {SHOW_WIDGET_DEBUG ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Debug intake progress
            </h4>
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
          <KnownFactsSummary facts={interactionPlan.known_facts_summary} />
        </div>
      ) : null}

      {SHOW_WIDGET_DEBUG && interactionPlan.warnings?.length ? (
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
          {requestedFacts.map((fact) => {
            const key = requestKey(fact);
            return (
              <FactInputField
                key={key}
                fact={{ ...fact, key }}
                value={effectiveValue(key)}
                onChange={onDraftChange}
                showMeta={SHOW_WIDGET_DEBUG}
              />
            );
          })}

          <div className="flex items-center justify-end gap-2">
            <Button onClick={onSubmitDraftFacts} disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Continue"}
            </Button>
          </div>
        </div>
      ) : null}

      {SHOW_WIDGET_DEBUG && !requestedFacts.length && mode === "analysis_ready" ? (
        <Alert>
          <AlertTitle>Ready for analysis</AlertTitle>
          <AlertDescription className="text-sm">
            The backend has enough information to continue the legal analysis.
          </AlertDescription>
        </Alert>
      ) : null}

      {SHOW_WIDGET_DEBUG && factSlotStates?.length ? (
        <details className="rounded-xl border border-border/50 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Fact slot details
          </summary>
          <div className="mt-3 space-y-2 text-sm">
            {factSlotStates.map((slot) => {
              const key = slotKey(slot);
              return (
                <div
                  key={key}
                  className="rounded-lg border border-border/40 px-3 py-2"
                >
                  <div className="font-medium">{slot.label ?? key}</div>
                  <div className="text-muted-foreground">
                    status: {slot.status ?? "unknown"}
                    {slot.value !== undefined && slot.value !== null
                      ? ` • value: ${String(slot.valueDisplay ?? slot.value_display ?? slot.value)}`
                      : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}
