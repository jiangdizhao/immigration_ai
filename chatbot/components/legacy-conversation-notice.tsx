import { Archive, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

/**
 * Phase 12 Stage 1 R3: the read-only surface for an archived (legacy) chat.
 *
 * It replaces the composer on purpose: an archived conversation has no
 * immigration conversation record, so the answer route would reject any new
 * turn. This component never renders an input, a textarea or an upload control,
 * and its only action creates a new conversation.
 */
export function LegacyConversationNotice({
  copy,
  disabled = false,
  onStartNewConversation,
}: {
  copy: WorkspaceCopy;
  disabled?: boolean;
  onStartNewConversation: () => void;
}) {
  const labels = copy.legacy;
  return (
    <section
      aria-label={labels.title}
      className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
      data-testid="legacy-conversation-notice"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <Archive className="size-4" />
        </span>
        <div className="min-w-0">
          <p
            className="text-sm font-semibold"
            data-testid="legacy-conversation-title"
          >
            {labels.title}
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            {labels.description}
          </p>
          <p className="mt-2 text-xs leading-5 text-amber-800">
            {labels.readOnlySubmitBlocked}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              className="rounded-xl bg-[#001736] px-4 text-white hover:bg-[#002b5b]"
              data-testid="legacy-start-new-conversation"
              disabled={disabled}
              onClick={onStartNewConversation}
              type="button"
            >
              <Plus className="mr-2 size-4" />
              {labels.startNewConversation}
            </Button>
            <span className="text-xs leading-5 text-amber-800">
              {labels.startNewConversationHint}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Small inline badge used in the conversation list for archived chats. */
export function LegacyConversationBadge({ copy }: { copy: WorkspaceCopy }) {
  return (
    <span
      className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900"
      data-testid="legacy-conversation-badge"
    >
      <Archive className="size-3" />
      {copy.legacy.badge}
    </span>
  );
}
