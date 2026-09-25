"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSiteLocale } from "@/components/site-locale-provider";
import { getConsultationCopy } from "@/lib/consultations/copy";
import {
  browserTimezone,
  type ConsultationAction,
  consultationDate,
  customerActionsForStatus,
  localDateTimeToIso,
  runCustomerAction,
  shouldShowConsultationCreateForm,
  shouldShowConsultationHistory,
} from "@/lib/consultations/customer-ui";
import type { CustomerConsultationDTO } from "@/lib/consultations/types";

type WindowInput = { id: string; start: string; end: string };
async function responseJson(
  response: Response
): Promise<Record<string, unknown> | null> {
  const value: unknown = await response.json().catch(() => null);
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function ConsultationClient({
  mode,
  id,
}: {
  mode: "history" | "new" | "detail";
  id?: string;
}) {
  const { locale } = useSiteLocale();
  const c = getConsultationCopy(locale);
  const router = useRouter();
  const search = useSearchParams();
  const [timezone, setTimezone] = useState<string | null>(null);
  const [items, setItems] = useState<CustomerConsultationDTO[]>([]);
  const [item, setItem] = useState<CustomerConsultationDTO | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [availabilityChecked, setAvailabilityChecked] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [windows, setWindows] = useState<WindowInput[]>([
    { id: "window-initial", start: "", end: "" },
  ]);
  const [method, setMethod] = useState("no_preference");
  const [note, setNote] = useState("");
  const chatId = search.get("chatId");
  const statusLabels = useMemo(
    () => ({
      requested: c.requested,
      proposed: c.proposed,
      confirmed: c.confirmed,
      completed: c.completed,
      cancelled: c.cancelled,
    }),
    [c]
  );

  const load = useCallback(async () => {
    if (!id && mode === "detail") {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        mode === "history" || mode === "new"
          ? "/api/consultations"
          : `/api/consultations/${encodeURIComponent(id ?? "")}`,
        { cache: "no-store" }
      );
      const body = await responseJson(response);
      if (
        response.status === 503 &&
        body?.code === "consultation_schema_unavailable"
      ) {
        setUnavailable(true);
        if (mode === "new") {
          setAvailabilityChecked(true);
        }
        return;
      }
      setUnavailable(false);
      if (!response.ok) {
        if (mode === "new") {
          setAvailabilityChecked(true);
        }
        setError(
          response.status === 401 || response.status === 403
            ? c.auth
            : response.status === 404
              ? c.loadError
              : c.loadError
        );
        return;
      }
      if (mode === "new") {
        setAvailabilityChecked(true);
        return;
      }
      if (mode === "history") {
        setItems(
          Array.isArray(body?.consultations)
            ? (body.consultations as CustomerConsultationDTO[])
            : []
        );
      } else if (body && typeof body.id === "string") {
        setItem(body as unknown as CustomerConsultationDTO);
      }
    } catch {
      setError(c.loadError);
    } finally {
      setLoading(false);
    }
  }, [c.auth, c.loadError, id, mode]);
  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);
  useEffect(() => {
    const raw = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(browserTimezone(raw));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!timezone || busy) {
      return;
    }
    const preferredWindows = windows.map((window) => ({
      startAt: localDateTimeToIso(window.start, timezone),
      endAt: localDateTimeToIso(window.end, timezone),
    }));
    if (
      !preferredWindows.length ||
      preferredWindows.some((window) => !window.startAt || !window.endAt)
    ) {
      setError(c.validation);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(chatId ? { chatId } : {}),
          customerTimezone: timezone,
          preferredWindows,
          methodPreference: method,
          ...(note.trim() ? { customerNote: note.trim() } : {}),
        }),
      });
      const body = await responseJson(response);
      if (
        response.status === 503 &&
        body?.code === "consultation_schema_unavailable"
      ) {
        setUnavailable(true);
        return;
      }
      if (response.status === 201 && typeof body?.id === "string") {
        router.push(`/consultations/${encodeURIComponent(body.id)}`);
        return;
      }
      setError(
        response.status === 401 || response.status === 403
          ? c.auth
          : response.status === 400
            ? c.validation
            : c.submitError
      );
    } catch {
      setError(c.submitError);
    } finally {
      setBusy(false);
    }
  }
  async function action(actionName: ConsultationAction) {
    if (!item || busy) {
      return;
    }
    if (actionName === "cancel" && !confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setConfirmCancel(false);
    setBusy(true);
    setError("");
    try {
      const result = await runCustomerAction({
        send: () =>
          fetch(`/api/consultations/${encodeURIComponent(item.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: actionName,
              expectedRevision: item.revision,
            }),
          }),
        reload: load,
        onStart: () => setStale(false),
      });
      if (result === "stale") {
        setStale(true);
        return;
      }
      if (result === "unavailable") {
        setUnavailable(true);
        return;
      }
      if (result === "unauthorized") {
        setError(c.auth);
        return;
      }
      if (result === "success") {
        await load();
      } else {
        setError(c.actionError);
      }
    } catch {
      setError(c.actionError);
    } finally {
      setBusy(false);
    }
  }
  const date = (value: string | null | undefined) =>
    consultationDate(
      value,
      item?.customerTimezone ?? timezone ?? "UTC",
      locale === "en" ? "en-AU" : "zh-CN"
    );
  const unavailablePanel = (
    <output
      aria-live="polite"
      className="block rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950"
    >
      {c.unavailable}
    </output>
  );
  const status = item ? statusLabels[item.status] : "";

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-6">
        <p className="text-sm font-semibold text-cyan-800">{c.history}</p>
        <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-[#001736]">
          {mode === "new"
            ? c.newTitle
            : mode === "detail"
              ? c.detail
              : c.history}
        </h1>
      </header>
      {unavailable ? (
        unavailablePanel
      ) : loading ? (
        <p aria-live="polite" className="rounded-2xl bg-white p-6">
          {c.loading}
        </p>
      ) : null}
      {error ? (
        <p
          className="my-4 rounded-2xl bg-rose-50 p-4 text-rose-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {stale ? (
        <output
          aria-live="polite"
          className="my-4 block rounded-2xl bg-amber-50 p-4 text-amber-950"
        >
          {c.stale}
        </output>
      ) : null}
      {mode === "history" &&
      shouldShowConsultationHistory({ loading, unavailable, error }) ? (
        <section className="space-y-3">
          {items.length ? (
            items.map((record) => (
              <Link
                className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-cyan-700"
                href={`/consultations/${encodeURIComponent(record.id)}`}
                key={record.id}
              >
                <span className="font-semibold">
                  {statusLabels[record.status]}
                </span>
                <span className="mt-2 block break-words text-sm text-slate-600">
                  {c.updated}:{" "}
                  {consultationDate(
                    record.updatedAt,
                    record.customerTimezone,
                    locale === "en" ? "en-AU" : "zh-CN"
                  )}
                </span>
                <span className="block break-words text-sm text-slate-600">
                  {record.assigned ? c.assignedYes : c.assignedNo} · {c.method}:{" "}
                  {c[record.methodPreference]}
                </span>
                {record.scheduledMethod ? (
                  <span className="block break-words text-sm text-cyan-900">
                    {c.scheduledMethod}: {c[record.scheduledMethod]}
                  </span>
                ) : null}
                <span className="block break-words text-sm text-slate-600">
                  {c.timezone}: {record.customerTimezone}
                </span>
                {record.preferredWindows.map((window) => (
                  <span
                    className="block break-words text-sm text-slate-600"
                    key={`${record.id}:${window.startAt}`}
                  >
                    {consultationDate(
                      window.startAt,
                      record.customerTimezone,
                      locale === "en" ? "en-AU" : "zh-CN"
                    )}{" "}
                    –{" "}
                    {consultationDate(
                      window.endAt,
                      record.customerTimezone,
                      locale === "en" ? "en-AU" : "zh-CN"
                    )}
                  </span>
                ))}
                {record.scheduledStartAt && record.scheduledEndAt ? (
                  <span className="block break-words text-sm text-cyan-900">
                    {c.scheduled}:{" "}
                    {consultationDate(
                      record.scheduledStartAt,
                      record.customerTimezone,
                      locale === "en" ? "en-AU" : "zh-CN"
                    )}{" "}
                    –{" "}
                    {consultationDate(
                      record.scheduledEndAt,
                      record.customerTimezone,
                      locale === "en" ? "en-AU" : "zh-CN"
                    )}
                  </span>
                ) : null}
              </Link>
            ))
          ) : (
            <p className="rounded-2xl border border-dashed bg-white p-6">
              {c.empty}
            </p>
          )}
          <Link
            className="inline-flex rounded-full bg-[#001736] px-5 py-3 text-white"
            href="/consultations/new"
          >
            {c.newLink}
          </Link>
        </section>
      ) : null}
      {mode === "new" &&
      shouldShowConsultationCreateForm({
        availabilityChecked,
        loading,
        unavailable,
        error,
      }) ? (
        <form
          className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
          onSubmit={submit}
        >
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{c.windows}</h2>
              <p className="break-all text-sm text-slate-600">
                {c.timezone}: {timezone ?? c.noTimezone}
              </p>
            </div>
            <p className="mt-2 text-sm text-slate-600">{c.preferenceNote}</p>
            {windows.map((window, index) => (
              <fieldset
                className="mt-4 grid min-w-0 gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2"
                key={window.id}
              >
                <legend className="px-1 text-sm font-medium">
                  {c.windows} {index + 1}
                </legend>
                <label className="min-w-0 text-sm">
                  {c.start}
                  <input
                    className="mt-1 block w-full min-w-0 rounded-xl border p-3"
                    onChange={(e) =>
                      setWindows((old) =>
                        old.map((w, i) =>
                          i === index ? { ...w, start: e.target.value } : w
                        )
                      )
                    }
                    required
                    type="datetime-local"
                    value={window.start}
                  />
                </label>
                <label className="min-w-0 text-sm">
                  {c.end}
                  <input
                    className="mt-1 block w-full min-w-0 rounded-xl border p-3"
                    onChange={(e) =>
                      setWindows((old) =>
                        old.map((w, i) =>
                          i === index ? { ...w, end: e.target.value } : w
                        )
                      )
                    }
                    required
                    type="datetime-local"
                    value={window.end}
                  />
                </label>
                {windows.length > 1 ? (
                  <button
                    className="text-left text-sm text-rose-800 underline sm:col-span-2"
                    onClick={() =>
                      setWindows((old) => old.filter((_, i) => i !== index))
                    }
                    type="button"
                  >
                    {c.removeWindow}
                  </button>
                ) : null}
              </fieldset>
            ))}
            {windows.length < 3 ? (
              <button
                className="mt-3 rounded-full border px-4 py-2 text-sm font-semibold"
                onClick={() =>
                  setWindows((old) => [
                    ...old,
                    { id: crypto.randomUUID(), start: "", end: "" },
                  ])
                }
                type="button"
              >
                {c.addWindow}
              </button>
            ) : null}
          </section>
          <label className="block text-sm font-medium">
            {c.method}
            <select
              className="mt-1 block w-full rounded-xl border bg-white p-3"
              onChange={(e) => setMethod(e.target.value)}
              value={method}
            >
              {(["video", "phone", "in_person", "no_preference"] as const).map(
                (value) => (
                  <option key={value} value={value}>
                    {c[value]}
                  </option>
                )
              )}
            </select>
          </label>
          <label className="block text-sm font-medium">
            {c.note}
            <textarea
              className="mt-1 block w-full rounded-xl border p-3"
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              value={note}
            />
          </label>
          <button
            className="rounded-full bg-[#001736] px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || !timezone}
            type="submit"
          >
            {busy ? "…" : c.create}
          </button>
        </form>
      ) : null}
      {mode === "detail" && item && !unavailable ? (
        <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{status}</h2>
            <span className="rounded-full border px-3 py-1 text-sm">
              {item.assigned ? c.assignedYes : c.assignedNo}
            </span>
          </div>
          <p className="break-all text-sm text-slate-600">
            {c.timezone}: {item.customerTimezone}
          </p>
          <p className="text-sm">
            <strong>{c.method}:</strong> {c[item.methodPreference]}
          </p>
          <div>
            <h3 className="font-semibold">{c.windows}</h3>
            <ul className="mt-2 space-y-2">
              {item.preferredWindows.map((w) => (
                <li
                  className="break-words rounded-xl bg-slate-50 p-3 text-sm"
                  key={`${w.startAt}:${w.endAt}`}
                >
                  {date(w.startAt)} – {date(w.endAt)}
                </li>
              ))}
            </ul>
          </div>
          {item.customerNote ? (
            <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm">
              <strong>{c.customerNote}:</strong> {item.customerNote}
            </p>
          ) : null}
          {item.scheduledStartAt && item.scheduledEndAt ? (
            <p className="break-words rounded-xl bg-cyan-50 p-4 text-sm">
              <strong>{c.scheduled}:</strong> {date(item.scheduledStartAt)} –{" "}
              {date(item.scheduledEndAt)}
              {item.scheduledMethod
                ? ` · ${c.scheduledMethod}: ${c[item.scheduledMethod as keyof typeof c] ?? item.scheduledMethod}`
                : ""}
            </p>
          ) : null}
          {item.meetingInstructions ? (
            <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm">
              <strong>{c.instructions}:</strong> {item.meetingInstructions}
            </p>
          ) : null}
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {(
              [
                [c.created, item.createdAt],
                [c.updated, item.updatedAt],
                [c.proposedAt, item.proposedAt],
                [c.confirmedAt, item.confirmedAt],
                [c.completedAt, item.completedAt],
                [c.cancelledAt, item.cancelledAt],
              ] as const
            )
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="font-medium">{label}</dt>
                  <dd className="text-slate-600">{date(value)}</dd>
                </div>
              ))}
          </dl>
          {confirmCancel ? (
            <div className="w-full rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
              <p>{c.cancelConfirm}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-rose-700 px-4 py-2 font-semibold"
                  disabled={busy}
                  onClick={() => action("cancel")}
                  type="button"
                >
                  {c.cancel}
                </button>
                <button
                  className="rounded-full border px-4 py-2"
                  onClick={() => setConfirmCancel(false)}
                  type="button"
                >
                  {locale === "en" ? "Keep request" : "保留请求"}
                </button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {customerActionsForStatus(item.status).map((actionName) => (
              <button
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                disabled={busy}
                key={actionName}
                onClick={() => action(actionName)}
                type="button"
              >
                {
                  c[
                    actionName === "request_reschedule"
                      ? "reschedule"
                      : actionName
                  ]
                }
              </button>
            ))}
          </div>
          <Link
            className="text-sm font-semibold underline"
            href="/consultations"
          >
            {c.back}
          </Link>
        </section>
      ) : null}
    </main>
  );
}
