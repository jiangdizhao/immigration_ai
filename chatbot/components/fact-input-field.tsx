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

export function FactInputField({ fact, value, onChange }: Props) {
  const inputType = fact.input_type ?? "short_text";
  const booleanValue = normalizeBooleanValue(value);

  return (
    <div className="rounded-xl border border-border/60 bg-background/80 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <Label className="text-sm font-medium">{fact.label}</Label>
          {fact.prompt ? (
            <p className="mt-1 text-sm text-muted-foreground">{fact.prompt}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          {fact.required ? <Badge variant="secondary">Required</Badge> : null}
          {fact.blocking ? <Badge variant="destructive">Blocking</Badge> : null}
        </div>
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
                  "rounded-lg border px-3 py-2 text-sm transition-colors",
                  selected
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-border bg-background hover:bg-muted"
                )}
                onClick={() => onChange(fact.key, option.raw)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {inputType === "single_select" ? (
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(next) => onChange(fact.key, next)}
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
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(fact.key, e.target.value || null)}
        />
      ) : null}

      {(inputType === "short_text" || inputType === "document") ? (
        <Input
          type="text"
          placeholder={
            inputType === "document"
              ? "Describe or paste document details"
              : "Enter a short answer"
          }
          value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
          onChange={(e) => onChange(fact.key, e.target.value || null)}
        />
      ) : null}

      {inputType === "long_text" ? (
        <Textarea
          rows={4}
          placeholder="Enter details"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(fact.key, e.target.value || null)}
        />
      ) : null}

      {fact.why_needed ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Why this matters: {fact.why_needed}
        </p>
      ) : null}
    </div>
  );
}