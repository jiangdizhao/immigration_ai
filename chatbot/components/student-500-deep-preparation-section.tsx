"use client";

import {
  AlertTriangle,
  HelpCircle,
  Loader2,
  Send,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  type DeepPreparationLocale,
  type DeepPreparationView,
  deepPreparationPath,
  parseDeepPreparationView,
  resolveDeepPreparationLocale,
} from "@/lib/workspace/student-500-deep-preparation";
import {
  type Student500DeepCopy,
  student500DeepCopy,
} from "@/lib/workspace-copy";

/**
 * Phase 13 M7 deep preparation section.
 *
 * Shows what the server reports and nothing more: complex-case flags, bounded
 * tasks, focused follow-up questions, one GS revision proposal with explicit
 * accept/reject, and the consent-bound editorial review state. It never shows
 * progress percentages, approval, professional sign-off or submission readiness -
 * the server has no such values to send.
 */

type SectionCopy = Student500DeepCopy;

/**
 * The exact body the review button posts.
 *
 * Exported so a test can assert the real payload: the draft id and version come
 * from the server view, the disclosed facts are the draft's own protected
 * dependencies, and no request can be built without an explicit customer consent.
 */
export function buildEditorialReviewRequest(
  view: DeepPreparationView,
  consentGiven: boolean
): Record<string, unknown> | null {
  if (consentGiven !== true || view.currentDraft === null) {
    return null;
  }
  return {
    action: "request_editorial_review",
    consentCode: "student500_editorial_review.v1",
    consentGranted: true,
    disclosureScopes: ["gs_draft_sections", "selected_fact_summaries"],
    draftId: view.currentDraft.draftId,
    draftVersion: view.currentDraft.version,
    factReferenceIds: view.disclosureScope.factBearingDraftReferenceIds,
  };
}

/**
 * Locale for this section, taken from the document the server rendered.
 *
 * Exported so the wiring itself is testable: Chinese users must get the Chinese
 * consent surface, not an English fallback.
 */
export function sectionLocaleFor(
  documentLike: { readonly documentElement?: { readonly lang?: string } } | null
): DeepPreparationLocale {
  return resolveDeepPreparationLocale(documentLike?.documentElement?.lang);
}

function lookup(
  map: Record<string, string>,
  key: string,
  fallback: string
): string {
  return map[key] ?? fallback;
}

export function Student500DeepPreparationSection({
  applicationId,
  projectId,
}: {
  readonly applicationId: string;
  readonly projectId: string;
}) {
  const [view, setView] = useState<DeepPreparationView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Consent is explicit, per request, and unchecked by default.
  const [consentGiven, setConsentGiven] = useState(false);

  // The section follows the site locale the server rendered. Server rendering has no
  // document, so English is the honest fallback there and nothing else is assumed.
  const locale: DeepPreparationLocale =
    typeof document === "undefined" ? "en" : sectionLocaleFor(document);
  const copy: SectionCopy = student500DeepCopy[locale] ?? student500DeepCopy.en;

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        deepPreparationPath(projectId, applicationId)
      );
      if (response.status === 503 || response.status === 404) {
        setView(null);
        return;
      }
      if (!response.ok) {
        setError(copy.unavailable);
        return;
      }
      setView(parseDeepPreparationView(await response.json()));
      setError(null);
    } catch {
      setError(copy.unavailable);
    }
  }, [applicationId, copy.unavailable, projectId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function act(
    label: string,
    body: Record<string, unknown>
  ): Promise<void> {
    setBusy(label);
    setError(null);
    try {
      const response = await fetch(
        deepPreparationPath(projectId, applicationId),
        {
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
          method: "POST",
        }
      );
      if (!response.ok) {
        setError(
          response.status === 403
            ? copy.authorityUnavailable
            : copy.actionFailed
        );
      }
      await load();
    } catch {
      setError(copy.actionFailed);
    } finally {
      setBusy(null);
    }
  }

  if (!view) {
    return error ? (
      <p
        className="text-muted-foreground text-sm"
        data-testid="student500-deep-unavailable"
      >
        {error}
      </p>
    ) : null;
  }

  const proposal = view.proposal;
  const latestReview = view.editorialReviews.at(-1) ?? null;

  return (
    <section
      className="space-y-4 rounded-lg border p-4"
      data-testid="student500-deep-section"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-sm">
          <Sparkles className="size-4" />
          {copy.title}
        </h3>
        <span className="rounded bg-muted px-2 py-0.5 text-xs">
          {lookup(
            copy.complexity,
            view.scenario.complexity,
            view.scenario.complexity
          )}
        </span>
      </header>

      <p className="text-muted-foreground text-xs">{copy.disclaimer}</p>

      {view.scenario.scenarioKinds.length > 0 ? (
        <ul
          className="flex flex-wrap gap-1 text-xs"
          data-testid="student500-deep-flags"
        >
          {view.scenario.scenarioKinds.map((kind) => (
            <li className="rounded border px-2 py-0.5" key={kind}>
              {lookup(copy.scenario, kind, kind)}
            </li>
          ))}
        </ul>
      ) : null}

      <div data-testid="student500-deep-tasks">
        <h4 className="mb-1 font-medium text-xs uppercase">{copy.tasks}</h4>
        <ul className="space-y-1 text-sm">
          {view.tasks.slice(0, 6).map((task) => (
            <li className="flex items-start gap-2" key={task.taskId}>
              <AlertTriangle
                className={
                  task.severity === "blocking"
                    ? "mt-0.5 size-3 text-amber-600"
                    : "mt-0.5 size-3 text-muted-foreground"
                }
              />
              <span>
                {lookup(copy.taskReasons, task.reasonCode, task.reasonCode)}
                {task.missingFactKeys.length > 0 ? (
                  <em className="text-muted-foreground">
                    {" "}
                    ({task.missingFactKeys.join(", ")})
                  </em>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {view.followUpQuestions.length > 0 ? (
        <div data-testid="student500-deep-followups">
          <h4 className="mb-1 font-medium text-xs uppercase">
            {copy.followUps}
          </h4>
          <ul className="space-y-1 text-sm">
            {view.followUpQuestions.slice(0, 5).map((question) => (
              <li className="flex items-start gap-2" key={question.questionId}>
                <HelpCircle className="mt-0.5 size-3 text-muted-foreground" />
                <span>
                  {lookup(
                    copy.questions,
                    question.questionKey,
                    copy.questionFallback
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div data-testid="student500-deep-proposal">
        <h4 className="mb-1 font-medium text-xs uppercase">{copy.proposal}</h4>
        {proposal ? (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">
              {lookup(copy.proposalStatus, proposal.status, proposal.status)}
              {proposal.stale ? ` · ${copy.proposalStale}` : ""}
              {proposal.readable ? "" : ` · ${copy.proposalRedacted}`}
            </p>
            <ul className="space-y-1 text-sm">
              {proposal.sections.slice(0, 5).map((section) => (
                <li key={section.sectionKey}>
                  <strong className="text-xs">{section.heading}</strong>
                  <p className="whitespace-pre-wrap">{section.text}</p>
                  {section.unverifiedAssertionCount > 0 ? (
                    <em className="text-amber-700 text-xs">
                      {copy.needsConfirmation}:{" "}
                      {section.unverifiedAssertionCount}
                    </em>
                  ) : null}
                </li>
              ))}
            </ul>
            {proposal.status === "proposed" ? (
              <div className="flex gap-2">
                <button
                  className="rounded bg-primary px-3 py-1 text-primary-foreground text-xs"
                  data-testid="student500-deep-accept"
                  disabled={busy !== null || proposal.stale}
                  onClick={() =>
                    act("accept", {
                      action: "accept_gs_revision",
                      proposalId: proposal.proposalId,
                    }).catch(() => undefined)
                  }
                  type="button"
                >
                  {busy === "accept" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : null}
                  {copy.accept}
                </button>
                <button
                  className="rounded border px-3 py-1 text-xs"
                  data-testid="student500-deep-reject"
                  disabled={busy !== null}
                  onClick={() =>
                    act("reject", {
                      action: "reject_gs_revision",
                      proposalId: proposal.proposalId,
                    }).catch(() => undefined)
                  }
                  type="button"
                >
                  {copy.reject}
                </button>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                {proposal.acceptedDraftId
                  ? copy.savedNewVersion
                  : copy.noProposalAction}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">{copy.noProposal}</p>
            <button
              className="rounded border px-3 py-1 text-xs"
              data-testid="student500-deep-propose"
              disabled={busy !== null}
              onClick={() =>
                act("propose", { action: "propose_gs_revision" }).catch(
                  () => undefined
                )
              }
              type="button"
            >
              {copy.propose}
            </button>
          </div>
        )}
      </div>

      <div data-testid="student500-deep-editorial">
        <h4 className="mb-1 font-medium text-xs uppercase">{copy.editorial}</h4>
        <p className="text-muted-foreground text-xs">
          {view.editorialAuthority.available
            ? copy.editorialAvailable
            : copy.editorialUnavailable}
        </p>
        {latestReview ? (
          <div className="mt-2 space-y-1 text-sm">
            <p className="text-xs">
              {lookup(
                copy.reviewStatus,
                latestReview.status,
                latestReview.status
              )}
              {latestReview.stale ? ` · ${copy.reviewStale}` : ""}
            </p>
            <ul className="space-y-1">
              {latestReview.comments.map((comment, index) => (
                <li key={`${latestReview.reviewId}-c${index}`}>
                  {comment.body}
                </li>
              ))}
              {latestReview.proposedEdits.map((edit, index) => (
                <li key={`${latestReview.reviewId}-e${index}`}>
                  <strong className="text-xs">{edit.sectionKey}</strong>:{" "}
                  {edit.proposedText}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">{copy.notSignOff}</p>
          </div>
        ) : (
          <EditorialConsentPanel
            busy={busy}
            consentGiven={consentGiven}
            copy={copy}
            onConsentChange={setConsentGiven}
            onRequest={() => {
              const body = buildEditorialReviewRequest(view, consentGiven);
              if (body !== null) {
                act("review", body).catch(() => undefined);
              }
            }}
            view={view}
          />
        )}
      </div>

      <p
        className="text-muted-foreground text-xs"
        data-testid="student500-deep-submission"
      >
        {copy.notSubmissionReady}
      </p>
    </section>
  );
}

/**
 * The consent surface for a professional editorial review request.
 *
 * Exported so the real markup can be rendered in a test: the disclosure scope comes
 * from the server view, consent starts unchecked, and the request button stays
 * disabled until the customer acts.
 */
export function EditorialConsentPanel({
  busy,
  consentGiven,
  copy,
  onConsentChange,
  onRequest,
  view,
}: {
  readonly busy: string | null;
  readonly consentGiven: boolean;
  readonly copy: SectionCopy;
  readonly onConsentChange: (next: boolean) => void;
  readonly onRequest: () => void;
  readonly view: DeepPreparationView;
}) {
  if (view.currentDraft === null) {
    return (
      <p className="mt-2 text-muted-foreground text-xs">
        {copy.consentNeedsDraft}
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded border p-2 text-xs">
      <p className="font-medium">{copy.consentHeading}</p>
      <p className="text-muted-foreground">{copy.consentScopeIntro}</p>
      <ul className="space-y-0.5">
        <li data-testid="student500-deep-consent-draft">
          {copy.consentDraftLabel}: v{view.currentDraft.version} ·{" "}
          {view.currentDraft.contentSha256.slice(0, 12)}
        </li>
        <li data-testid="student500-deep-consent-facts">
          {copy.consentFactsLabel}:{" "}
          {view.disclosureScope.factBearingDraftReferenceIds.length}
        </li>
        <li>{copy.consentSharedWithReviewer}</li>
        <li>{copy.consentNotShared}</li>
      </ul>
      <label className="flex items-start gap-2">
        <input
          checked={consentGiven}
          data-testid="student500-deep-consent-checkbox"
          onChange={(event) => onConsentChange(event.target.checked)}
          type="checkbox"
        />
        <span>{copy.consentCheckbox}</span>
      </label>
      <button
        className="flex items-center gap-1 rounded border px-3 py-1 disabled:opacity-50"
        data-testid="student500-deep-request-review"
        disabled={busy !== null || consentGiven === false}
        onClick={onRequest}
        type="button"
      >
        <Send className="size-3" />
        {copy.requestReview}
      </button>
    </div>
  );
}
