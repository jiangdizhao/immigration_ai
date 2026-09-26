"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSiteLocale } from "@/components/site-locale-provider";
import { getConsultationStaffCopy } from "@/lib/consultations/staff-copy";
import {
  adminAssignmentControlsVisible,
  adminConsultationActions,
  isConsultationSchemaUnavailable,
  lawyerConsultationActions,
  proposalDraftMetadata,
  runConsultationStaffMutation,
  staffLocalDateTimeToIso,
} from "@/lib/consultations/staff-ui";
import type {
  ScheduledMethod,
  StaffConsultationDTO,
} from "@/lib/consultations/types";

type StaffRole = "admin" | "lawyer";
type StaffUser = {
  id: string;
  email: string;
  role: string;
  emailVerifiedAt: string | null;
};

function formatDateTime(
  value: string | null | undefined,
  timezone: string,
  locale: string
) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "—";
  }
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-AU" : "zh-CN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(date);
  } catch {
    return "—";
  }
}

function statusLabel(
  status: string,
  copy: ReturnType<typeof getConsultationStaffCopy>
) {
  switch (status) {
    case "requested":
      return copy.requested;
    case "proposed":
      return copy.proposed;
    case "confirmed":
      return copy.confirmed;
    case "completed":
      return copy.completed;
    case "cancelled":
      return copy.cancelled;
    default:
      return copy.status;
  }
}

function methodLabel(
  method: string | null,
  copy: ReturnType<typeof getConsultationStaffCopy>
) {
  switch (method) {
    case "video":
      return copy.video;
    case "phone":
      return copy.phone;
    case "in_person":
      return copy.inPerson;
    case "no_preference":
      return copy.noPreference;
    case "other":
      return copy.other;
    default:
      return "—";
  }
}

export function ConsultationStaffQueue({
  actorRole,
}: {
  actorRole: StaffRole;
}) {
  const { locale } = useSiteLocale();
  const copy = getConsultationStaffCopy(locale);
  const [records, setRecords] = useState<StaffConsultationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const endpoint =
      actorRole === "admin"
        ? "/api/admin/consultations"
        : "/api/lawyer-portal/consultations";
    fetch(endpoint, { cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!active) {
          return;
        }
        if (isConsultationSchemaUnavailable(response.status, body)) {
          setUnavailable(true);
          return;
        }
        if (!response.ok) {
          setError(true);
          return;
        }
        const consultations =
          body && typeof body === "object" && "consultations" in body
            ? body.consultations
            : null;
        setRecords(
          Array.isArray(consultations)
            ? (consultations as StaffConsultationDTO[])
            : []
        );
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [actorRole]);

  const title = actorRole === "admin" ? copy.adminTitle : copy.lawyerTitle;
  const subtitle =
    actorRole === "admin" ? copy.adminSubtitle : copy.lawyerSubtitle;
  const heading = (
    <header className="mb-6">
      <p className="text-sm font-semibold text-amber-800">
        {copy.schedulingLabel}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-slate-600">{subtitle}</p>
    </header>
  );

  if (loading) {
    return (
      <>
        {heading}
        <p aria-live="polite" className="rounded-2xl bg-white p-6">
          {copy.loading}
        </p>
      </>
    );
  }
  if (unavailable) {
    return (
      <>
        {heading}
        <output
          aria-live="polite"
          className="block rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"
        >
          {copy.unavailable}
        </output>
      </>
    );
  }
  if (error) {
    return (
      <>
        {heading}
        <p
          className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900"
          role="alert"
        >
          {copy.loadError}
        </p>
      </>
    );
  }
  if (!records.length) {
    return (
      <>
        {heading}
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
          {copy.emptyQueue}
        </p>
      </>
    );
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return (
    <div className="space-y-3">
      {heading}
      {records.map((record) => (
        <Link
          className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-amber-400"
          href={
            actorRole === "admin"
              ? `/admin-portal/consultations/${encodeURIComponent(record.id)}`
              : `/lawyer-portal/consultations/${encodeURIComponent(record.id)}`
          }
          key={record.id}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-950">
                {record.customer.email}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {copy.status}: {statusLabel(record.status, copy)}
              </p>
            </div>
            <p className="text-xs text-slate-500">
              {copy.updated}:{" "}
              {formatDateTime(record.updatedAt, timezone, locale)}
            </p>
          </div>
          {actorRole === "admin" ? (
            <p className="mt-3 break-all text-sm text-slate-600">
              {copy.assignedLawyer}:{" "}
              {record.assignedLawyer?.email ?? copy.unassigned}
            </p>
          ) : null}
          {record.scheduledStartAt && record.scheduledEndAt ? (
            <p className="mt-2 text-sm font-medium text-amber-900">
              {formatDateTime(
                record.scheduledStartAt,
                record.customerTimezone,
                locale
              )}
              {" – "}
              {formatDateTime(
                record.scheduledEndAt,
                record.customerTimezone,
                locale
              )}
              {" · "}
              {record.customerTimezone}
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              {copy.customerTimezone}: {record.customerTimezone}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}

export function ConsultationStaffDetail({
  actorRole,
  id,
}: {
  actorRole: StaffRole;
  id: string;
}) {
  const { locale } = useSiteLocale();
  const copy = getConsultationStaffCopy(locale);
  const [detail, setDetail] = useState<StaffConsultationDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [staffTimezone, setStaffTimezone] = useState("");
  const [lawyers, setLawyers] = useState<StaffUser[]>([]);
  const [lawyerListUnavailable, setLawyerListUnavailable] = useState(false);
  const [selectedLawyerId, setSelectedLawyerId] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [scheduledMethod, setScheduledMethod] =
    useState<ScheduledMethod>("video");
  const [meetingInstructions, setMeetingInstructions] = useState("");

  const endpoint =
    actorRole === "admin"
      ? `/api/admin/consultations/${encodeURIComponent(id)}`
      : `/api/lawyer-portal/consultations/${encodeURIComponent(id)}`;

  const load = useCallback(async () => {
    setLoadError(false);
    const response = await fetch(endpoint, { cache: "no-store" });
    const body: unknown = await response.json().catch(() => null);
    if (isConsultationSchemaUnavailable(response.status, body)) {
      setUnavailable(true);
      setDetail(null);
      setLoading(false);
      return;
    }
    setUnavailable(false);
    if (!response.ok || !body || typeof body !== "object" || !("id" in body)) {
      setLoadError(true);
      setDetail(null);
      setLoading(false);
      return;
    }
    const consultation = body as StaffConsultationDTO;
    setDetail(consultation);
    setSelectedLawyerId(consultation.assignedLawyer?.id ?? "");
    const draft = proposalDraftMetadata(consultation);
    setScheduledMethod(draft.scheduledMethod);
    setMeetingInstructions(draft.meetingInstructions);
    setLoading(false);
  }, [endpoint]);

  useEffect(() => {
    setStaffTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
    load().catch(() => {
      setLoadError(true);
      setLoading(false);
    });
  }, [load]);

  useEffect(() => {
    if (
      actorRole !== "admin" ||
      !detail ||
      !adminAssignmentControlsVisible(detail.status)
    ) {
      return;
    }
    let active = true;
    fetch("/api/admin/lawyers", { cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (
          !response.ok ||
          !body ||
          typeof body !== "object" ||
          !("users" in body)
        ) {
          throw new Error("lawyer list unavailable");
        }
        const users = Array.isArray(body.users) ? body.users : [];
        if (active) {
          setLawyers(
            (users as StaffUser[]).filter(
              (account) =>
                account.role === "lawyer" && Boolean(account.emailVerifiedAt)
            )
          );
        }
      })
      .catch(() => {
        if (active) {
          setLawyerListUnavailable(true);
        }
      });
    return () => {
      active = false;
    };
  }, [detail, actorRole]);

  async function mutate(payload: Record<string, unknown>) {
    if (!detail || busy) {
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const result = await runConsultationStaffMutation(
        () =>
          fetch(endpoint, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              expectedRevision: detail.revision,
            }),
          }),
        load
      );
      if (result.kind === "conflict") {
        setNotice(`${copy.conflict} ${copy.chooseAnotherSlot}`);
        return;
      }
      const response = result.response;
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (isConsultationSchemaUnavailable(response.status, body)) {
          setUnavailable(true);
          setDetail(null);
        }
        setNotice(copy.actionError);
        return;
      }
      if (body && typeof body === "object" && "id" in body) {
        const updated = body as StaffConsultationDTO;
        setDetail(updated);
        setSelectedLawyerId(updated.assignedLawyer?.id ?? "");
        const draft = proposalDraftMetadata(updated);
        setScheduledMethod(draft.scheduledMethod);
        setMeetingInstructions(draft.meetingInstructions);
      }
      setNotice(copy.saved);
    } catch {
      setNotice(copy.actionError);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <p aria-live="polite" className="mt-6 rounded-2xl bg-white p-6">
        {copy.loading}
      </p>
    );
  }
  if (unavailable) {
    return (
      <output
        aria-live="polite"
        className="mt-6 block rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"
      >
        {copy.unavailable}
      </output>
    );
  }
  if (loadError || !detail) {
    return (
      <p
        className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900"
        role="alert"
      >
        {copy.loadError}
      </p>
    );
  }

  const actions =
    actorRole === "admin"
      ? adminConsultationActions(detail.status, Boolean(detail.assignedLawyer))
      : lawyerConsultationActions(detail.status);
  const assignmentVisible =
    actorRole === "admin" && adminAssignmentControlsVisible(detail.status);
  const canPropose = actions.includes("propose");
  const staffLocalLabel = staffTimezone || "—";

  return (
    <div className="mt-6 space-y-5">
      <Link
        className="text-sm font-semibold text-amber-900 underline"
        href={
          actorRole === "admin"
            ? "/admin-portal/consultations"
            : "/lawyer-portal/consultations"
        }
      >
        {copy.backToQueue}
      </Link>
      <header>
        <p className="mt-4 text-sm font-semibold text-amber-800">
          {copy.schedulingLabel}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {actorRole === "admin" ? copy.adminTitle : copy.lawyerTitle}
        </h1>
      </header>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="break-all text-sm font-semibold text-slate-700">
              {copy.customer}: {detail.customer.email}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              {copy.status}: {statusLabel(detail.status, copy)}
            </h2>
          </div>
          <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {detail.customerTimezone}
          </p>
        </div>
        <div className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
          <p>
            {copy.created}:{" "}
            {formatDateTime(detail.createdAt, staffTimezone || "UTC", locale)}
          </p>
          <p>
            {copy.updated}:{" "}
            {formatDateTime(detail.updatedAt, staffTimezone || "UTC", locale)}
          </p>
          {detail.proposedAt ? (
            <p>
              {copy.proposedAt}:{" "}
              {formatDateTime(
                detail.proposedAt,
                staffTimezone || "UTC",
                locale
              )}
            </p>
          ) : null}
          {detail.confirmedAt ? (
            <p>
              {copy.confirmedAt}:{" "}
              {formatDateTime(
                detail.confirmedAt,
                staffTimezone || "UTC",
                locale
              )}
            </p>
          ) : null}
          {detail.completedAt ? (
            <p>
              {copy.completedAt}:{" "}
              {formatDateTime(
                detail.completedAt,
                staffTimezone || "UTC",
                locale
              )}
            </p>
          ) : null}
          {detail.cancelledAt ? (
            <p>
              {copy.cancelledAt}:{" "}
              {formatDateTime(
                detail.cancelledAt,
                staffTimezone || "UTC",
                locale
              )}
            </p>
          ) : null}
        </div>
        <p className="mt-5 text-sm font-semibold text-slate-900">
          {copy.preferences}
        </p>
        <div className="mt-2 space-y-2">
          {detail.preferredWindows.map((window) => (
            <p
              className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700"
              key={window.startAt}
            >
              {formatDateTime(window.startAt, detail.customerTimezone, locale)}
              {" – "}
              {formatDateTime(window.endAt, detail.customerTimezone, locale)}
              {" · "}
              {detail.customerTimezone}
            </p>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-700">
          {copy.methodPreference}: {methodLabel(detail.methodPreference, copy)}
        </p>
        {detail.customerNote ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {copy.customerNote}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">
              {detail.customerNote}
            </p>
          </div>
        ) : null}
        <p className="mt-4 break-all text-sm text-slate-700">
          {copy.assignedLawyer}:{" "}
          {detail.assignedLawyer?.email ?? copy.unassigned}
        </p>
        {detail.scheduledStartAt && detail.scheduledEndAt ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-semibold text-amber-950">
              {copy.currentProposal}
            </p>
            <p className="mt-2 text-sm text-amber-950">
              {formatDateTime(
                detail.scheduledStartAt,
                detail.customerTimezone,
                locale
              )}
              {" – "}
              {formatDateTime(
                detail.scheduledEndAt,
                detail.customerTimezone,
                locale
              )}
              {" · "}
              {detail.customerTimezone}
            </p>
            {staffTimezone ? (
              <p className="mt-1 text-xs text-amber-900">
                {formatDateTime(detail.scheduledStartAt, staffTimezone, locale)}
                {" – "}
                {formatDateTime(detail.scheduledEndAt, staffTimezone, locale)}
                {" · "}
                {copy.staffTimezone}: {staffLocalLabel}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-amber-900">
              {copy.scheduledMethod}:{" "}
              {methodLabel(detail.scheduledMethod, copy)}
            </p>
            {detail.meetingInstructions ? (
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-amber-950">
                {detail.meetingInstructions}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {assignmentVisible ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-semibold">{copy.assignment}</h2>
          {lawyerListUnavailable ? (
            <p className="mt-3 text-sm text-rose-800">{copy.loadError}</p>
          ) : lawyers.length ? (
            <label className="mt-4 block text-sm font-medium text-slate-700">
              {copy.selectLawyer}
              <select
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3"
                onChange={(event) => setSelectedLawyerId(event.target.value)}
                value={selectedLawyerId}
              >
                <option value="">{copy.unassigned}</option>
                {lawyers.map((lawyer) => (
                  <option key={lawyer.id} value={lawyer.id}>
                    {lawyer.email}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="mt-3 text-sm text-slate-600">{copy.noLawyers}</p>
          )}
          <button
            className="mt-4 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            disabled={
              busy ||
              lawyerListUnavailable ||
              selectedLawyerId === (detail.assignedLawyer?.id ?? "")
            }
            onClick={() =>
              mutate({
                action: "assign",
                assignedLawyerUserId: selectedLawyerId || null,
              })
            }
            type="button"
          >
            {copy.saveAssignment}
          </button>
        </section>
      ) : null}

      {canPropose ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-semibold">
            {detail.status === "requested" ? copy.propose : copy.rePropose}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {copy.staffTimezone}: {staffLocalLabel}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              {copy.start}
              <input
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3"
                onChange={(event) => setStartLocal(event.target.value)}
                type="datetime-local"
                value={startLocal}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              {copy.end}
              <input
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3"
                onChange={(event) => setEndLocal(event.target.value)}
                type="datetime-local"
                value={endLocal}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              {copy.scheduledMethod}
              <select
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3"
                onChange={(event) =>
                  setScheduledMethod(event.target.value as ScheduledMethod)
                }
                value={scheduledMethod}
              >
                <option value="video">{copy.video}</option>
                <option value="phone">{copy.phone}</option>
                <option value="in_person">{copy.inPerson}</option>
                <option value="other">{copy.other}</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              {copy.meetingInstructions}
              <textarea
                className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-3"
                maxLength={2000}
                onChange={(event) => setMeetingInstructions(event.target.value)}
                value={meetingInstructions}
              />
            </label>
          </div>
          <button
            className="mt-4 rounded-xl bg-amber-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              const startAt = staffLocalDateTimeToIso(
                startLocal,
                staffTimezone
              );
              const endAt = staffLocalDateTimeToIso(endLocal, staffTimezone);
              if (!startAt || !endAt || new Date(endAt) <= new Date(startAt)) {
                setNotice(copy.proposalValidation);
                return;
              }
              mutate({
                action: "propose",
                startAt,
                endAt,
                scheduledMethod,
                meetingInstructions,
              });
            }}
            type="button"
          >
            {detail.status === "requested" ? copy.propose : copy.rePropose}
          </button>
        </section>
      ) : null}

      {actions.includes("cancel") || actions.includes("complete") ? (
        <section className="flex flex-wrap gap-3">
          {actions.includes("cancel") ? (
            <button
              className="rounded-xl border border-rose-300 bg-white px-4 py-3 text-sm font-semibold text-rose-800 disabled:opacity-50"
              disabled={busy}
              onClick={() => mutate({ action: "cancel" })}
              type="button"
            >
              {copy.cancel}
            </button>
          ) : null}
          {actions.includes("complete") ? (
            <button
              className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => mutate({ action: "complete" })}
              type="button"
            >
              {copy.complete}
            </button>
          ) : null}
        </section>
      ) : null}
      {notice ? (
        <p
          aria-live="polite"
          className="rounded-xl bg-slate-100 p-4 text-sm text-slate-800"
        >
          {notice}
        </p>
      ) : null}
    </div>
  );
}
