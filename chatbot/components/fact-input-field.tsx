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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { InteractionFactRequest } from "./guided-intake-types";

type Props = {
  fact: InteractionFactRequest;
  value: string | number | boolean | null | undefined;
  onChange: (key: string, value: string | number | boolean | null) => void;
};

export function FactInputField({ fact, value, onChange }: Props) {
  const inputType = fact.input_type ?? "short_text";

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
        <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2">
          <span className="text-sm">{String(value ?? false) === "true" ? "Yes" : "No"}</span>
          <Switch
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(fact.key, checked)}
          />
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
                {option}
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
          placeholder={inputType === "document" ? "Describe or paste document details" : "Enter a short answer"}
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