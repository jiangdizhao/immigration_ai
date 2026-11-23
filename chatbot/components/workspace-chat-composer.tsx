"use client";

import { Loader2, Send } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { Button } from "@/components/ui/button";

export type ComposerStatus = "ready" | "submitted" | "typing";

export type ComposerKeyInput = {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  keyCode?: number;
};

export function shouldSubmitComposerOnEnter(event: ComposerKeyInput): boolean {
  return (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing &&
    event.keyCode !== 229
  );
}

export function boundedComposerHeight(
  scrollHeight: number,
  minHeight: number,
  maxHeight: number
): number {
  const effectiveMaxHeight = Math.max(minHeight, maxHeight);
  return Math.min(effectiveMaxHeight, Math.max(minHeight, scrollHeight));
}

export function WorkspaceChatComposer({
  value,
  onValueChange,
  onSubmit,
  onFocus,
  onBlur,
  inputLabel,
  placeholder,
  sendLabel,
  disabled,
  status,
  submittedLabel,
  typingLabel,
  attachmentControl,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (value: string) => void | Promise<void>;
  onFocus?: () => void;
  onBlur?: () => void;
  inputLabel: string;
  placeholder: string;
  sendLabel: string;
  disabled: boolean;
  status: ComposerStatus;
  submittedLabel: string;
  typingLabel: string;
  attachmentControl?: ReactNode;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback((currentValue: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    const computed = window.getComputedStyle(textarea);
    const parsedMinHeight = Number.parseFloat(computed.minHeight);
    const parsedMaxHeight = Number.parseFloat(computed.maxHeight);
    const minHeight = Number.isFinite(parsedMinHeight) ? parsedMinHeight : 72;
    const maxHeight = Math.max(
      minHeight,
      Number.isFinite(parsedMaxHeight) ? parsedMaxHeight : 196
    );
    textarea.style.height = `${boundedComposerHeight(
      textarea.scrollHeight,
      minHeight,
      maxHeight
    )}px`;
    if (!currentValue) {
      textarea.scrollTop = 0;
    }
  }, []);

  useLayoutEffect(() => {
    resize(value);
  }, [resize, value]);

  useEffect(() => {
    const handleViewportResize = () => resize(textareaRef.current?.value ?? "");
    window.addEventListener("resize", handleViewportResize);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", handleViewportResize);
    return () => {
      window.removeEventListener("resize", handleViewportResize);
      viewport?.removeEventListener("resize", handleViewportResize);
    };
  }, [resize]);

  const statusText =
    status === "submitted"
      ? submittedLabel
      : status === "typing"
        ? typingLabel
        : null;

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-slate-100/80 p-1.5"
      data-testid="workspace-composer"
    >
      <div className="flex min-w-0 items-end gap-1.5">
        {attachmentControl}
        <textarea
          aria-label={inputLabel}
          className="max-h-[min(196px,30dvh)] min-h-[72px] min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border-0 bg-transparent px-2 py-2 text-sm leading-5 text-slate-900 outline-none placeholder:text-slate-400 focus-visible:ring-0 sm:max-h-[196px]"
          data-testid="workspace-input"
          disabled={disabled}
          onBlur={onBlur}
          onChange={(event) => onValueChange(event.currentTarget.value)}
          onFocus={onFocus}
          onKeyDown={(event) => {
            if (
              !shouldSubmitComposerOnEnter({
                key: event.key,
                shiftKey: event.shiftKey,
                isComposing: event.nativeEvent.isComposing,
                keyCode: event.nativeEvent.keyCode,
              })
            ) {
              return;
            }
            event.preventDefault();
            onSubmit(value);
          }}
          placeholder={placeholder}
          ref={textareaRef}
          rows={2}
          value={value}
        />
        <Button
          aria-label={sendLabel}
          className="shrink-0 rounded-xl bg-[#001736] px-3 text-white hover:bg-[#002b5b] sm:px-4"
          data-testid="workspace-send"
          disabled={!value.trim() || disabled}
          onClick={() => onSubmit(value)}
          size="sm"
          type="button"
        >
          {status === "ready" ? (
            <Send className="size-4 sm:mr-2" />
          ) : (
            <Loader2 className="size-4 animate-spin sm:mr-2" />
          )}
          <span className="hidden sm:inline">{sendLabel}</span>
        </Button>
      </div>
      {statusText ? (
        <output
          aria-live="polite"
          className="px-2 pt-1 text-[11px] leading-4 text-slate-500"
          data-testid="workspace-composer-status"
        >
          {statusText}
        </output>
      ) : null}
    </div>
  );
}
