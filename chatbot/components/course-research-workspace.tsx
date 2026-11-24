"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { courseResearchWorkspaceContextKey } from "@/lib/workspace/action-proposal-context-key";
import {
  type BoundCourseResearchResultV1,
  type CourseResearchCandidateV1,
  type CourseResearchDiagnosticsV1,
  type CourseResearchFieldV1,
  courseResearchEmptyState,
  courseResearchFieldV1Schema,
  courseResearchResultIsCurrent,
  courseResearchSelection,
  courseResearchSourceV1Schema,
} from "@/lib/workspace/course-research";
import type { WorkflowTaskProjectionV1 } from "@/lib/workspace/project-workflows";

type ProposalDisplay = {
  targetLabel: string;
  changes: Array<{
    field: string;
    oldValue: string | null;
    proposedValue: string | null;
  }>;
  evidenceLabel: string;
  limitations: string[];
  packageNote: string;
};

type ProposalResponse = {
  operation?: string;
  candidateId?: string;
  display?: ProposalDisplay;
  error?: string;
  confirmationToken?: string;
};

const FIELD_LABELS: Record<string, { en: string; zh: string }> = {
  qualification: { en: "Qualification", zh: "学历层级" },
  campus_location: { en: "Campus / location", zh: "校区 / 地点" },
  course_code: { en: "Course code", zh: "课程代码" },
  cricos_code: { en: "CRICOS code", zh: "CRICOS 代码" },
  duration: { en: "Duration", zh: "课程时长" },
  tuition_amount: { en: "Tuition amount", zh: "学费金额" },
  tuition_currency: { en: "Currency", zh: "币种" },
  tuition_fee_basis: { en: "Fee basis", zh: "费用周期" },
  intake: { en: "Intake", zh: "入学批次" },
  entry_requirements_summary: {
    en: "Course entry requirements",
    zh: "课程入学要求",
  },
};

function field(candidate: CourseResearchCandidateV1, key: string) {
  return candidate.fields.find((entry) => entry.key === key);
}

function fieldVerificationSource(
  candidate: CourseResearchCandidateV1,
  item: CourseResearchFieldV1
) {
  if (
    !(["qualification", "campus_location", "course_code"] as string[]).includes(
      item.key
    )
  ) {
    return null;
  }
  return (
    candidate.sources.find(
      (source) =>
        item.sourceIds.includes(source.sourceId) &&
        source.authority === "approved_institution_source" &&
        Boolean(source.manifestId)
    ) ?? null
  );
}

function fieldValue(
  candidate: CourseResearchCandidateV1,
  key: string
): string | null {
  const value = field(candidate, key)?.value;
  return typeof value === "string" && value.trim() ? value : null;
}

function valueWithEvidence(
  fieldValue: CourseResearchFieldV1 | undefined,
  isChinese: boolean
) {
  if (!fieldValue?.value) {
    return isChinese ? "未知" : "Unknown";
  }
  const label =
    fieldValue.evidenceLevel === "independently_verified_field"
      ? isChinese
        ? "独立核验"
        : "Independently verified"
      : fieldValue.evidenceLevel === "official_source_referenced"
        ? isChinese
          ? "引用官方来源，字段未经独立核验"
          : "Official source cited; field not independently verified"
        : isChinese
          ? "AI 研究线索，未经核验"
          : "AI research lead; unverified";
  return `${fieldValue.value} · ${label}`;
}

function comparisonFee(candidate: CourseResearchCandidateV1) {
  const amount = fieldValue(candidate, "tuition_amount");
  if (!amount) {
    return null;
  }
  const currency = fieldValue(candidate, "tuition_currency");
  const basis = fieldValue(candidate, "tuition_fee_basis");
  const evidence =
    field(candidate, "tuition_amount")?.evidenceLevel ?? "model_research_lead";
  return {
    display: [amount, currency, basis].filter(Boolean).join(" · "),
    evidence,
  };
}

async function readJson(response: Response): Promise<ProposalResponse> {
  return (await response.json().catch(() => ({}))) as ProposalResponse;
}

export function CourseResearchWorkspace({
  result,
  diagnostics,
  projectId,
  chatId,
  task,
  locale,
  onApplied,
}: {
  result: BoundCourseResearchResultV1 | null;
  diagnostics: CourseResearchDiagnosticsV1 | null;
  projectId: string;
  chatId: string | null;
  task: WorkflowTaskProjectionV1;
  locale: string;
  onApplied: () => void;
}) {
  const isChinese = locale.toLowerCase().startsWith("zh");
  const current = Boolean(
    result &&
      chatId &&
      result.projectId === projectId &&
      result.chatId === chatId &&
      result.taskId === task.taskId &&
      result.targetId === task.targetId &&
      courseResearchResultIsCurrent({ result, task })
  );
  const emptyState = courseResearchEmptyState({
    result,
    resultIsCurrent: current,
    diagnostics,
  });
  const [textFilter, setTextFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [qualificationFilter, setQualificationFilter] = useState("");
  const [includeUnknown, setIncludeUnknown] = useState(false);
  const [shortlist, setShortlist] = useState<Set<string>>(() => new Set());
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [busyCandidate, setBusyCandidate] = useState<string | null>(null);
  const [verificationOverrides, setVerificationOverrides] = useState<
    Record<string, CourseResearchFieldV1>
  >({});
  const [verificationSources, setVerificationSources] = useState<
    Record<string, CourseResearchCandidateV1["sources"]>
  >({});
  const [verificationAttestations, setVerificationAttestations] = useState<
    Record<string, string>
  >({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposalDisplay | null>(null);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(
    null
  );
  const [confirming, setConfirming] = useState(false);
  const scopeKey = courseResearchWorkspaceContextKey({
    chatId,
    projectId,
    task,
    researchAssistantMessageId: result?.assistantMessageId ?? null,
  });
  const scopeGeneration = useRef(0);
  const activeScopeKey = useRef(scopeKey);

  useLayoutEffect(() => {
    if (activeScopeKey.current !== scopeKey) {
      activeScopeKey.current = scopeKey;
      scopeGeneration.current += 1;
      setShortlist(new Set());
      setCompareIds([]);
      setVerificationOverrides({});
      setVerificationSources({});
      setVerificationAttestations({});
      setProposal(null);
      setConfirmationToken(null);
      setBusyCandidate(null);
      setConfirming(false);
      setStatusMessage(null);
    }
    return () => {
      scopeGeneration.current += 1;
    };
  }, [scopeKey]);

  const candidates = useMemo(() => {
    if (!result) {
      return [];
    }
    return result.candidates.map((candidate) => ({
      ...candidate,
      sources: [
        ...candidate.sources,
        ...(verificationSources[candidate.candidateId] ?? []),
      ].filter(
        (source, index, entries) =>
          entries.findIndex((item) => item.sourceId === source.sourceId) ===
          index
      ),
      fields: candidate.fields.map(
        (entry) =>
          verificationOverrides[`${candidate.candidateId}:${entry.key}`] ??
          entry
      ),
    }));
  }, [result, verificationOverrides, verificationSources]);
  const locations = [
    ...new Set(
      candidates
        .map((candidate) => fieldValue(candidate, "campus_location"))
        .filter((value): value is string => Boolean(value))
    ),
  ];
  const qualifications = [
    ...new Set(
      candidates
        .map((candidate) => fieldValue(candidate, "qualification"))
        .filter((value): value is string => Boolean(value))
    ),
  ];
  const visible = candidates.filter((candidate) => {
    const query = textFilter.trim().toLocaleLowerCase();
    const matchesText =
      !query ||
      `${candidate.institutionName} ${candidate.courseTitle} ${candidate.fields.map((item) => item.value ?? "").join(" ")}`
        .toLocaleLowerCase()
        .includes(query);
    const location = fieldValue(candidate, "campus_location");
    const qualification = fieldValue(candidate, "qualification");
    const matchesLocation =
      !locationFilter ||
      location === locationFilter ||
      (!location && includeUnknown);
    const matchesQualification =
      !qualificationFilter ||
      qualification === qualificationFilter ||
      (!qualification && includeUnknown);
    return matchesText && matchesLocation && matchesQualification;
  });

  function toggleShortlist(candidateId: string) {
    setShortlist((existing) => {
      const next = new Set(existing);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  }

  function toggleCompare(candidateId: string) {
    if (compareIds.includes(candidateId)) {
      setCompareIds((existing) =>
        existing.filter((value) => value !== candidateId)
      );
      return;
    }
    if (compareIds.length >= 4) {
      setStatusMessage(
        isChinese
          ? "最多比较四个候选课程。"
          : "Compare up to four candidates at a time."
      );
      return;
    }
    setCompareIds((existing) => {
      return [...existing, candidateId];
    });
  }

  async function verifyField(
    candidate: CourseResearchCandidateV1,
    item: CourseResearchFieldV1
  ) {
    if (!result || !chatId || !item.value || item.sourceIds.length === 0) {
      return;
    }
    const requestGeneration = scopeGeneration.current;
    setBusyCandidate(`${candidate.candidateId}:${item.key}`);
    setStatusMessage(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/course-research/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            selection: {
              schemaVersion: "phase15.active-step-selection.v1",
              projectId,
              taskId: task.taskId,
              workflowKind: task.workflowKind,
              definitionVersion: task.definitionVersion,
              stepKey: task.stepKey,
              targetKind: task.targetKind,
              targetId: task.targetId,
              sourceRevisions: task.sourceRevisions,
            },
            assistantMessageId: result.assistantMessageId,
            candidateId: candidate.candidateId,
            fieldKey: item.key,
          }),
        }
      );
      const body = (await response.json().catch(() => ({}))) as {
        field?: CourseResearchFieldV1;
        source?: CourseResearchCandidateV1["sources"][number];
        attestation?: string;
        error?: string;
        status?: string;
      };
      const verifiedField = courseResearchFieldV1Schema.safeParse(body.field);
      const verifiedSource = courseResearchSourceV1Schema.safeParse(
        body.source
      );
      if (scopeGeneration.current !== requestGeneration) {
        return;
      }
      if (
        !response.ok ||
        !verifiedField.success ||
        !verifiedSource.success ||
        !body.attestation
      ) {
        setStatusMessage(
          isChinese
            ? "当前来源没有通过已批准的独立核验流程。原研究结果仍保留。"
            : "No reviewed source manifest supports independent verification yet. The existing research result is retained."
        );
        return;
      }
      setVerificationOverrides((currentOverrides) => ({
        ...currentOverrides,
        [`${candidate.candidateId}:${item.key}`]: verifiedField.data,
      }));
      setVerificationSources((currentSources) => ({
        ...currentSources,
        [candidate.candidateId]: [
          ...(currentSources[candidate.candidateId] ?? []),
          verifiedSource.data,
        ].filter(
          (source, index, entries) =>
            entries.findIndex((entry) => entry.sourceId === source.sourceId) ===
            index
        ),
      }));
      setVerificationAttestations((current) => ({
        ...current,
        [`${candidate.candidateId}:${item.key}`]: body.attestation as string,
      }));
      setStatusMessage(
        isChinese
          ? "已更新该字段的核验状态。"
          : "Field verification state updated."
      );
    } catch {
      if (scopeGeneration.current === requestGeneration) {
        setStatusMessage(
          isChinese
            ? "核验暂不可用；原研究结果仍保留。"
            : "Verification is unavailable; the prior research result remains."
        );
      }
    } finally {
      if (scopeGeneration.current === requestGeneration) {
        setBusyCandidate(null);
      }
    }
  }

  async function createSelectionPreview(candidate: CourseResearchCandidateV1) {
    if (!result || !chatId || !current) {
      return;
    }
    const requestGeneration = scopeGeneration.current;
    setBusyCandidate(candidate.candidateId);
    setStatusMessage(null);
    setProposal(null);
    setConfirmationToken(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/action-proposals`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...courseResearchSelection({ result, task, candidate }),
            verificationAttestations: candidate.fields
              .flatMap((item) => {
                const attestation =
                  verificationAttestations[
                    `${candidate.candidateId}:${item.key}`
                  ];
                return attestation ? [attestation] : [];
              })
              .slice(0, 3),
          }),
        }
      );
      const body = await readJson(response);
      if (scopeGeneration.current !== requestGeneration) {
        return;
      }
      if (!response.ok || !body.display || !body.confirmationToken) {
        throw new Error(body.error ?? "proposal_unavailable");
      }
      setProposal(body.display);
      setConfirmationToken(body.confirmationToken);
    } catch (error) {
      if (scopeGeneration.current !== requestGeneration) {
        return;
      }
      const code =
        error instanceof Error ? error.message : "proposal_unavailable";
      setStatusMessage(
        code === "linked_matter_conflict"
          ? isChinese
            ? "该学校已关联录取或学生签证事项。当前服务不支持在更换课程时安全迁移这些记录。"
            : "This School Application is linked to Admissions or Student 500 records. The current services cannot safely migrate those records with a course replacement."
          : isChinese
            ? "无法创建课程修改预览。请刷新工作区后重试。"
            : "A course selection preview could not be created. Refresh the workspace and try again."
      );
    } finally {
      if (scopeGeneration.current === requestGeneration) {
        setBusyCandidate(null);
      }
    }
  }

  async function confirmSelection() {
    if (!confirmationToken) {
      return;
    }
    const requestGeneration = scopeGeneration.current;
    setConfirming(true);
    setStatusMessage(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/action-proposals/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmationToken }),
        }
      );
      const body = await response.json().catch(() => ({}));
      if (
        !response.ok ||
        body.status !== "applied" ||
        body.readback !== "verified"
      ) {
        throw new Error("confirmation_failed");
      }
      if (scopeGeneration.current !== requestGeneration) {
        return;
      }
      setProposal(null);
      setConfirmationToken(null);
      setStatusMessage(
        isChinese
          ? "已保存并从业务服务重新读取。工作流正在刷新。"
          : "Saved and read back from the business service. Workflow state is refreshing."
      );
      onApplied();
    } catch {
      if (scopeGeneration.current === requestGeneration) {
        setStatusMessage(
          isChinese
            ? "确认失败或记录已变化。请刷新并重新审核。"
            : "Confirmation failed or the record changed. Refresh and review again."
        );
      }
    } finally {
      if (scopeGeneration.current === requestGeneration) {
        setConfirming(false);
      }
    }
  }

  if (
    task.workflowKind !== "school_application" ||
    task.stepKey !== "school_discovery" ||
    task.targetKind !== "school_application"
  ) {
    return null;
  }

  const comparison = compareIds.flatMap((id) =>
    candidates.filter((candidate) => candidate.candidateId === id)
  );
  return (
    <section
      className="space-y-3 border-t border-slate-200 pt-3"
      data-testid="course-research-workspace"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">
            {isChinese ? "课程研究" : "Course research"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {isChinese
              ? "候选来自本次 AI 研究；引用来源不代表字段已独立核验。"
              : "Candidates come from this AI research turn. A source citation does not mean the field was independently verified."}
          </p>
        </div>
        {result ? (
          <time
            className="shrink-0 text-[10px] text-slate-500"
            dateTime={result.observedAt}
          >
            {new Date(result.observedAt).toLocaleString(locale)}
          </time>
        ) : null}
      </div>

      {result && result.candidates.length > 0 ? (
        <>
          {current ? null : (
            <output className="block rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-950">
              {isChinese
                ? "这些结果对应较早的目标版本。可查看和比较，但不能用于课程修改预览。"
                : "These results belong to an earlier target revision. You can inspect and compare them, but cannot use them to create a course change preview."}
            </output>
          )}
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">
              {isChinese ? "课程筛选" : "Course filters"}
            </legend>
            <label className="text-xs text-slate-700">
              {isChinese ? "关键词" : "Keywords"}
              <input
                className="mt-1 min-h-9 w-full rounded-md border border-slate-300 px-2"
                onChange={(event) => setTextFilter(event.target.value)}
                value={textFilter}
              />
            </label>
            <label className="text-xs text-slate-700">
              {isChinese ? "地点" : "Location"}
              <select
                className="mt-1 min-h-9 w-full rounded-md border border-slate-300 px-2"
                onChange={(event) => setLocationFilter(event.target.value)}
                value={locationFilter}
              >
                <option value="">
                  {isChinese ? "所有地点" : "All locations"}
                </option>
                {locations.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-700">
              {isChinese ? "学历" : "Qualification"}
              <select
                className="mt-1 min-h-9 w-full rounded-md border border-slate-300 px-2"
                onChange={(event) => setQualificationFilter(event.target.value)}
                value={qualificationFilter}
              >
                <option value="">
                  {isChinese ? "所有学历" : "All qualifications"}
                </option>
                {qualifications.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-2 pb-2 text-xs text-slate-700">
              <input
                checked={includeUnknown}
                onChange={(event) => setIncludeUnknown(event.target.checked)}
                type="checkbox"
              />
              {isChinese
                ? "筛选时包含未知值"
                : "Include unknown values in filters"}
            </label>
          </fieldset>

          {visible.length === 0 ? (
            <p className="text-xs text-slate-600">
              {isChinese
                ? "没有符合筛选条件的候选。"
                : "No candidates match these filters."}
            </p>
          ) : null}
          <div className="space-y-3">
            {visible.map((candidate) => {
              const isShortlisted = shortlist.has(candidate.candidateId);
              const isCompared = compareIds.includes(candidate.candidateId);
              return (
                <article
                  className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                  data-testid="course-candidate-card"
                  key={candidate.candidateId}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="break-words text-sm font-semibold text-slate-950">
                        {candidate.courseTitle}
                      </h4>
                      <p className="mt-0.5 break-words text-xs text-slate-700">
                        {candidate.institutionName}
                      </p>
                      <span
                        className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${candidate.identityEvidenceLevel === "official_source_referenced" ? "bg-blue-50 text-blue-900" : "bg-amber-50 text-amber-950"}`}
                      >
                        {candidate.identityEvidenceLevel ===
                        "official_source_referenced"
                          ? isChinese
                            ? "引用官方来源；课程身份未经独立核验"
                            : "Official source cited; course identity not independently verified"
                          : isChinese
                            ? "AI 研究线索；未经核验"
                            : "AI research lead; unverified"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        className="min-h-8 rounded-md border border-slate-300 px-2 text-xs font-medium"
                        onClick={() => toggleShortlist(candidate.candidateId)}
                        type="button"
                      >
                        {isShortlisted
                          ? isChinese
                            ? "已收藏"
                            : "Shortlisted"
                          : isChinese
                            ? "收藏"
                            : "Shortlist"}
                      </button>
                      <button
                        aria-pressed={isCompared}
                        className="min-h-8 rounded-md border border-slate-300 px-2 text-xs font-medium"
                        onClick={() => toggleCompare(candidate.candidateId)}
                        type="button"
                      >
                        {isCompared
                          ? isChinese
                            ? "已比较"
                            : "Comparing"
                          : isChinese
                            ? "比较"
                            : "Compare"}
                      </button>
                      <button
                        className="min-h-8 rounded-md border border-blue-700 px-2 text-xs font-semibold text-blue-900 disabled:opacity-50"
                        disabled={
                          !current ||
                          busyCandidate === candidate.candidateId ||
                          !chatId
                        }
                        onClick={async () => {
                          await createSelectionPreview(candidate);
                        }}
                        type="button"
                      >
                        {isChinese ? "选择并预览" : "Select and preview"}
                      </button>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-[minmax(7rem,0.8fr)_minmax(0,1.2fr)] gap-x-2 gap-y-1.5 text-xs">
                    {candidate.fields.map((item) => (
                      <div className="contents" key={item.key}>
                        <dt className="break-words text-slate-500">
                          {FIELD_LABELS[item.key]?.[isChinese ? "zh" : "en"] ??
                            item.key}
                        </dt>
                        <dd className="min-w-0 break-words text-slate-800">
                          {valueWithEvidence(item, isChinese)}
                          {item.applicabilityNote ? (
                            <span className="block text-[10px] text-slate-500">
                              {item.applicabilityNote}
                            </span>
                          ) : null}
                          {item.value &&
                          fieldVerificationSource(candidate, item) &&
                          item.evidenceLevel !==
                            "independently_verified_field" ? (
                            <button
                              className="mt-1 block text-[10px] font-semibold text-blue-800 underline disabled:opacity-50"
                              disabled={Boolean(busyCandidate)}
                              onClick={async () => {
                                await verifyField(candidate, item);
                              }}
                              type="button"
                            >
                              {isChinese
                                ? "尝试独立核验此字段"
                                : "Try independent field verification"}
                            </button>
                          ) : null}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <details className="mt-3 rounded-lg bg-slate-50 px-2.5 py-2">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                      {isChinese ? "来源与限制" : "Sources and limitations"}
                    </summary>
                    <ul className="mt-2 space-y-2 text-xs">
                      {candidate.sources.map((source) => (
                        <li className="break-all" key={source.sourceId}>
                          <a
                            className="font-medium text-blue-800 underline"
                            href={source.url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {source.title}
                          </a>
                          <span className="block text-[10px] text-slate-600">
                            {source.authority === "unverified_source"
                              ? isChinese
                                ? "来源身份未确认"
                                : "Source identity not established"
                              : source.association === "cited"
                                ? isChinese
                                  ? "本次回答中实际引用"
                                  : "Cited in this response"
                                : isChinese
                                  ? "本次响应观察到，未形成字段引用"
                                  : "Observed in this response; not tied to a field citation"}
                            {" · "}
                            {isChinese ? "当前性未知" : "Currentness unknown"}
                          </span>
                          {source.authority !== "approved_institution_source" ||
                          !source.manifestId ? (
                            <span className="block text-[10px] text-slate-500">
                              {isChinese
                                ? "该来源目前没有已审核的独立核验清单。"
                                : "No reviewed independent-verification manifest is available for this source."}
                            </span>
                          ) : null}
                        </li>
                      ))}
                      {candidate.sources.length === 0 ? (
                        <li className="text-slate-600">
                          {isChinese
                            ? "没有已绑定的来源链接。"
                            : "No source link was bound to this candidate."}
                        </li>
                      ) : null}
                      {candidate.limitations.map((limitation) => (
                        <li className="text-slate-600" key={limitation}>
                          {limitation}
                        </li>
                      ))}
                      {result.limitations.map((limitation) => (
                        <li className="text-slate-600" key={limitation}>
                          {limitation}
                        </li>
                      ))}
                    </ul>
                  </details>
                </article>
              );
            })}
          </div>

          {comparison.length >= 2 ? (
            <section
              className="min-w-0 overflow-x-auto rounded-lg border border-slate-200 p-2"
              data-testid="course-comparison"
            >
              <h4 className="mb-2 text-xs font-semibold text-slate-900">
                {isChinese ? "课程对比" : "Course comparison"}
              </h4>
              <table className="w-full min-w-[34rem] border-collapse text-left text-xs">
                <thead>
                  <tr>
                    <th className="p-2">{isChinese ? "字段" : "Field"}</th>
                    {comparison.map((candidate) => (
                      <th className="p-2 align-top" key={candidate.candidateId}>
                        {candidate.courseTitle}
                        <span className="block font-normal">
                          {candidate.institutionName}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      "qualification",
                      "campus_location",
                      "duration",
                      "intake",
                      "tuition_amount",
                      "entry_requirements_summary",
                    ] as const
                  ).map((key) => (
                    <tr className="border-t border-slate-200" key={key}>
                      <th className="p-2 font-medium">
                        {FIELD_LABELS[key]?.[isChinese ? "zh" : "en"]}
                      </th>
                      {comparison.map((candidate) => {
                        const item = field(candidate, key);
                        const fee =
                          key === "tuition_amount"
                            ? comparisonFee(candidate)
                            : null;
                        return (
                          <td
                            className="max-w-48 p-2 align-top break-words"
                            key={candidate.candidateId}
                          >
                            {fee
                              ? `${fee.display || "Unknown"} · ${fee.evidence === "independently_verified_field" ? (isChinese ? "独立核验" : "independently verified") : fee.evidence === "official_source_referenced" ? (isChinese ? "引用官方来源，未独立核验" : "official source cited; not independently verified") : (isChinese ? "AI 线索" : "AI lead")}`
                              : valueWithEvidence(item, isChinese)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] leading-4 text-slate-500">
                {isChinese
                  ? "不同币种、费用周期或课程期间的费用不可直接等同；此表不折算或排序。"
                  : "Fees with different currencies, fee bases or program periods are not equivalent. Values are not converted or ranked."}
              </p>
            </section>
          ) : null}
          {statusMessage ? (
            <output className="block rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-700">
              {statusMessage}
            </output>
          ) : null}
          {proposal && confirmationToken ? (
            <section
              className="space-y-2 rounded-xl border-2 border-blue-700 bg-blue-50 p-3"
              data-testid="course-selection-preview"
            >
              <h4 className="text-sm font-semibold text-slate-950">
                {isChinese ? "审核课程修改" : "Review course change"}
              </h4>
              <p className="text-xs font-semibold">{proposal.targetLabel}</p>
              <dl className="space-y-2 text-xs">
                {proposal.changes.map((change) => (
                  <div
                    className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2 border-t border-blue-100 pt-2"
                    key={change.field}
                  >
                    <dt className="font-medium text-slate-600">
                      {change.field}
                    </dt>
                    <dd className="break-words">
                      {change.oldValue ?? (isChinese ? "未知" : "Unknown")} →{" "}
                      {change.proposedValue ?? (isChinese ? "未知" : "Unknown")}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs leading-5 text-slate-700">
                {proposal.evidenceLabel}
              </p>
              {proposal.limitations.map((item) => (
                <p className="text-xs leading-5 text-amber-950" key={item}>
                  {item}
                </p>
              ))}
              <p className="text-xs leading-5 text-slate-700">
                {proposal.packageNote}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  className="min-h-10 rounded-lg border border-slate-400 bg-white px-3 text-xs font-semibold"
                  disabled={confirming}
                  onClick={() => {
                    setProposal(null);
                    setConfirmationToken(null);
                  }}
                  type="button"
                >
                  {isChinese ? "取消" : "Cancel"}
                </button>
                <button
                  className="min-h-10 rounded-lg bg-blue-800 px-3 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={confirming}
                  onClick={async () => {
                    await confirmSelection();
                  }}
                  type="button"
                >
                  {confirming
                    ? isChinese
                      ? "正在保存…"
                      : "Saving…"
                    : isChinese
                      ? "确认并保存"
                      : "Confirm and save"}
                </button>
              </div>
            </section>
          ) : null}
          {shortlist.size > 0 ? (
            <p
              className="text-[10px] text-slate-500"
              data-testid="course-shortlist-count"
            >
              {isChinese
                ? `本次工作区收藏：${shortlist.size} 项（仅保留在当前页面）`
                : `Shortlisted in this workspace: ${shortlist.size} (session only)`}
            </p>
          ) : null}
        </>
      ) : (
        <p
          className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs leading-5 text-slate-600"
          data-testid="course-research-empty"
        >
          {isChinese
            ? {
                not_started:
                  "尚无结构化课程候选。你可以在聊天中要求研究具体课程。",
                not_performed:
                  "本轮没有进行课程研究。你可以在聊天中要求研究具体课程。",
                completed_without_candidates:
                  "课程研究已完成，但没有找到适合的具体课程候选。需要时可调整条件后再次研究。",
                structured_result_unavailable:
                  "答复已保留，但本轮结构化课程结果不可用。请重试课程研究。",
                historical_results_stale:
                  "这些候选基于较早的任务版本。请重新研究后再使用。",
              }[emptyState]
            : {
                not_started:
                  "No structured course candidates yet. Ask in Chat to research concrete courses.",
                not_performed:
                  "Course research was not performed in this turn. Ask in Chat to research concrete courses.",
                completed_without_candidates:
                  "Research completed, but no suitable concrete course candidates were returned. Refine the criteria if needed.",
                structured_result_unavailable:
                  "The answer was preserved, but structured course results are unavailable for this turn. Retry the research request.",
                historical_results_stale:
                  "These candidates were generated against older task revisions. Rerun research before relying on them.",
              }[emptyState]}
        </p>
      )}
    </section>
  );
}
