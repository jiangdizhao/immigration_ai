"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { InteractionFactRequest } from "./guided-intake-types";

type Props = {
  fact: InteractionFactRequest;
  value: string | number | boolean | null | undefined;
  onChange: (key: string, value: string | number | boolean | null) => void;
  showMeta?: boolean;
  responseLanguage?: string | null;
};

function isZhLanguage(responseLanguage?: string | null) {
  return (responseLanguage ?? "").toLowerCase().startsWith("zh");
}

function optionDisplayLabel(option: string, zh: boolean) {
  if (!zh) {
    return option.replaceAll("_", " ");
  }
  const map: Record<string, string> = {
    yes: "是",
    no: "否",
    not_sure: "不确定",
    in_australia: "在澳大利亚境内",
    outside_australia: "在澳大利亚境外",
    leave_and_return: "离开后再返回澳大利亚",
    general_question: "一般性询问",
  };
  return map[option] ?? option.replaceAll("_", " ");
}
function normalizeBooleanValue(
  value: string | number | boolean | null | undefined
): "yes" | "no" | "not_sure" | null {
  if (value === true) {
    return "yes";
  }
  if (value === false) {
    return "no";
  }
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["yes", "true", "available", "in_australia"].includes(lowered)) {
      return "yes";
    }
    if (["no", "false", "document_unavailable"].includes(lowered)) {
      return "no";
    }
    if (
      ["not_sure", "unknown", "unsure", "don't know", "dont know"].includes(
        lowered
      )
    ) {
      return "not_sure";
    }
  }
  return null;
}

function factKey(fact: InteractionFactRequest) {
  return fact.key ?? fact.fact_key ?? "";
}

function isNotSureValue(value: string | number | boolean | null | undefined) {
  return (
    typeof value === "string" &&
    ["not_sure", "unknown", "unsure"].includes(value.trim().toLowerCase())
  );
}

export function FactInputField({
  fact,
  value,
  onChange,
  showMeta = false,
  responseLanguage = null,
}: Props) {
  const zh = isZhLanguage(responseLanguage);
  const inputType = fact.input_type ?? "short_text";
  const booleanValue = normalizeBooleanValue(value);
  const key = factKey(fact);
  const isNotSure = isNotSureValue(value);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <Label className="text-sm font-semibold text-slate-900">
            {fact.label}
          </Label>
          {fact.prompt ? (
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {fact.prompt}
            </p>
          ) : null}
        </div>
        {showMeta ? (
          <div className="flex shrink-0 gap-2">
            {fact.required ? (
              <Badge variant="secondary">{zh ? "必填" : "Required"}</Badge>
            ) : null}
            {fact.blocking ? (
              <Badge variant="destructive">{zh ? "关键" : "Blocking"}</Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      {inputType === "boolean" ? (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: zh ? "是" : "Yes", raw: true, keyValue: "yes" },
            { label: zh ? "否" : "No", raw: false, keyValue: "no" },
            {
              label: zh ? "不确定" : "Not sure",
              raw: "not_sure",
              keyValue: "not_sure",
            },
          ].map((option) => {
            const selected = booleanValue === option.keyValue;
            return (
              <button
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm transition-colors",
                  selected
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
                key={option.keyValue}
                onClick={() => onChange(key, option.raw)}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {inputType === "single_select" ? (
        <Select
          onValueChange={(next) => onChange(key, next)}
          value={typeof value === "string" && !isNotSure ? value : ""}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={zh ? "请选择一个选项" : "Select an option"}
            />
          </SelectTrigger>
          <SelectContent>
            {(fact.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {optionDisplayLabel(option, zh)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {inputType === "date" ? (
        <div className="space-y-1">
          <Input
            onChange={(e) => onChange(key, e.target.value || null)}
            type="date"
            value={typeof value === "string" && !isNotSure ? value : ""}
          />
          <p className="text-xs text-slate-500">
            {zh
              ? "请使用 YYYY-MM-DD 格式；移民日期很重要。"
              : "Use YYYY-MM-DD format; immigration dates can be important."}
          </p>
        </div>
      ) : null}

      {inputType === "short_text" || inputType === "document" ? (
        <Input
          onChange={(e) => onChange(key, e.target.value || null)}
          placeholder={
            inputType === "document"
              ? zh
                ? "描述或粘贴文件内容"
                : "Describe or paste document details"
              : zh
                ? "请输入简短回答"
                : "Enter a short answer"
          }
          type="text"
          value={
            !isNotSure &&
            (typeof value === "string" || typeof value === "number")
              ? String(value)
              : ""
          }
        />
      ) : null}

      {inputType === "long_text" ? (
        <Textarea
          onChange={(e) => onChange(key, e.target.value || null)}
          placeholder={zh ? "请输入详细信息" : "Enter details"}
          rows={4}
          value={!isNotSure && typeof value === "string" ? value : ""}
        />
      ) : null}

      {inputType === "boolean" ? null : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              isNotSure
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            )}
            onClick={() => onChange(key, "not_sure")}
            type="button"
          >
            {zh ? "不确定" : "Not sure"}
          </button>
          <button
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
            onClick={() => onChange(key, "not_sure")}
            type="button"
          >
            {zh ? "暂时跳过" : "Skip for now"}
          </button>
        </div>
      )}

      {showMeta && fact.why_needed ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {zh ? "为什么需要这个信息：" : "Why this matters: "}
          {fact.why_needed}
        </p>
      ) : null}
    </div>
  );
}
