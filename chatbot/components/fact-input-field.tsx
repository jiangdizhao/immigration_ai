"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InteractionFactRequest } from "./guided-intake-types";

type Props = {
  fact: InteractionFactRequest;
  value: string | number | boolean | null | undefined;
  onChange: (key: string, value: string | number | boolean | null) => void;
  showMeta?: boolean;
};

function normalizeBooleanValue(
  value: string | number | boolean | null | undefined
): "yes" | "no" | "not_sure" | null {
  if (value === true) return "yes";
  if (value === false) return "no";
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["yes", "true", "available", "in_australia"].includes(lowered)) return "yes";
    if (["no", "false", "document_unavailable"].includes(lowered)) return "no";
    if (["not_sure", "unknown", "unsure", "don't know", "dont know"].includes(lowered)) return "not_sure";
  }
  return null;
}

function factKey(fact: InteractionFactRequest) {
  return fact.key ?? fact.fact_key ?? "";
}

function isNotSureValue(value: string | number | boolean | null | undefined) {
  return typeof value === "string" && ["not_sure", "unknown", "unsure"].includes(value.trim().toLowerCase());
}

export function FactInputField({ fact, value, onChange, showMeta = false }: Props) {
  const inputType = fact.input_type ?? "short_text";
  const booleanValue = normalizeBooleanValue(value);
  const key = factKey(fact);
  const isNotSure = isNotSureValue(value);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <Label className="text-sm font-semibold text-slate-900">{fact.label}</Label>
          {fact.prompt ? (
            <p className="mt-1 text-sm leading-6 text-slate-600">{fact.prompt}</p>
          ) : null}
        </div>
        {showMeta ? (
          <div className="flex shrink-0 gap-2">
            {fact.required ? <Badge variant="secondary">Required</Badge> : null}
            {fact.blocking ? <Badge variant="destructive">Blocking</Badge> : null}
          </div>
        ) : null}
      </div>

      {inputType === "boolean" ? (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Yes", raw: true, keyValue: "yes" },
            { label: "No", raw: false, keyValue: "no" },
            { label: "Not sure", raw: "not_sure", keyValue: "not_sure" },
          ].map((option) => {
            const selected = booleanValue === option.keyValue;
            return (
              <button
                key={option.keyValue}
                type="button"
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm transition-colors",
                  selected
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
                onClick={() => onChange(key, option.raw)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {inputType === "single_select" ? (
        <Select
          value={typeof value === "string" && !isNotSure ? value : ""}
          onValueChange={(next) => onChange(key, next)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {(fact.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option.replaceAll("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {inputType === "date" ? (
        <Input
          type="date"
          value={typeof value === "string" && !isNotSure ? value : ""}
          onChange={(e) => onChange(key, e.target.value || null)}
        />
      ) : null}

      {inputType === "short_text" || inputType === "document" ? (
        <Input
          type="text"
          placeholder={
            inputType === "document"
              ? "Describe or paste document details"
              : "Enter a short answer"
          }
          value={
            !isNotSure && (typeof value === "string" || typeof value === "number")
              ? String(value)
              : ""
          }
          onChange={(e) => onChange(key, e.target.value || null)}
        />
      ) : null}

      {inputType === "long_text" ? (
        <Textarea
          rows={4}
          placeholder="Enter details"
          value={!isNotSure && typeof value === "string" ? value : ""}
          onChange={(e) => onChange(key, e.target.value || null)}
        />
      ) : null}

      {inputType !== "boolean" ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              isNotSure
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            )}
            onClick={() => onChange(key, "not_sure")}
          >
            Not sure
          </button>
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
            onClick={() => onChange(key, "not_sure")}
          >
            Skip for now
          </button>
        </div>
      ) : null}

      {showMeta && fact.why_needed ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Why this matters: {fact.why_needed}
        </p>
      ) : null}
    </div>
  );
}
