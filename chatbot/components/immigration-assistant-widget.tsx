"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  ExternalLink,
  Loader2,
  MessageSquareText,
  Send,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { ChatbotError } from "@/lib/errors";
import { cn, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import { Textarea } from "./ui/textarea";

type WidgetCitation = {
  title: string;
  authority?: string | null;
  sectionRef?: string | null;
  url?: string | null;
  quoteText?: string | null;
};

type WidgetMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: WidgetCitation[];
  followUpQuestions?: string[];
  missingFacts?: string[];
  escalate?: boolean;
  nextAction?: string;
  confidence?: string | null;
};

const quickQuestions = [
  "My student visa was refused. What should I do next?",
  "What documents should I prepare for a student visa refusal consultation?",
  "How should I prepare for my first consultation with an immigration lawyer?",
  "What details do I need to gather after receiving a visa refusal?",
];

export function ImmigrationAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [chatId] = useState(() => generateUUID());
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [status, setStatus] = useState<"ready" | "submitted">("ready");
  const [error, setError] = useState<string | null>(null);
  const [showQuickQuestions, setShowQuickQuestions] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    const container = listRef.current;
    if (!container) return;

    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  };

  useEffect(() => {
    if (!open) return;
    scrollToBottom();
  }, [messages, open, status]);

  useEffect(() => {
    if (!open) return;

    const handleViewportChange = () => {
      scrollToBottom();
    };

    window.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("resize", handleViewportChange);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
    };
  }, [open]);

  const submitMessage = async (messageText: string) => {
    const trimmed = messageText.trim();

    if (!trimmed || status !== "ready") {
      return;
    }

    const nextUserMessage: WidgetMessage = {
      id: generateUUID(),
      role: "user",
      text: trimmed,
    };

    const nextMessages = [...messages, nextUserMessage];
    setMessages(nextMessages);
    setInput("");
    setStatus("submitted");
    setError(null);

    if (nextMessages.length > 0) {
      setShowQuickQuestions(false);
    }

    try {
      const response = await fetchWithErrorHandlers("/api/widget-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: chatId,
          selectedChatModel: DEFAULT_CHAT_MODEL,
          messages: nextMessages.map((message) => ({
            id: message.id,
            role: message.role,
            parts: [{ type: "text", text: message.text }],
          })),
        }),
      });

      const data = (await response.json()) as {
        text?: string;
        citations?: WidgetCitation[];
        followUpQuestions?: string[];
        missingFacts?: string[];
        escalate?: boolean;
        nextAction?: string;
        confidence?: string | null;
      };

      const assistantText = data.text?.trim();

      setMessages((current) => [
        ...current,
        {
          id: generateUUID(),
          role: "assistant",
          text:
            assistantText && assistantText.length > 0
              ? assistantText
              : "Sorry, I could not generate a response right now.",
          citations: data.citations ?? [],
          followUpQuestions: data.followUpQuestions ?? [],
          missingFacts: data.missingFacts ?? [],
          escalate: Boolean(data.escalate),
          nextAction: data.nextAction ?? "ask_followup",
          confidence: data.confidence ?? null,
        },
      ]);
    } catch (requestError) {
      const message =
        requestError instanceof ChatbotError
          ? requestError.message
          : requestError instanceof Error
            ? requestError.message
            : "Unable to reach the assistant right now.";

      setError(message);
      toast.error(message);
    } finally {
      setStatus("ready");
    }
  };

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button
          className="fixed right-5 bottom-5 z-50 h-auto rounded-full border border-white/15 bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-[0_20px_60px_-20px_rgba(15,23,42,0.9)] transition hover:bg-slate-800"
          size="lg"
        >
          <MessageSquareText className="mr-2 size-4" />
          Ask our AI assistant
        </Button>
      </SheetTrigger>

      <SheetContent className="[&>button]:hidden flex h-[100dvh] w-[min(100vw,28rem)] max-w-none flex-col gap-0 border-l border-slate-200 bg-white p-0 sm:w-[min(92vw,28rem)]">
        <div className="shrink-0 border-b border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 px-4 py-3 text-white">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <div className="rounded-full bg-white/10 p-2">
                  <Bot className="size-4" />
                </div>
                <Badge
                  className="border-white/15 bg-white/10 text-white hover:bg-white/10"
                  variant="outline"
                >
                  Online now
                </Badge>
              </div>
              <SheetTitle className="text-white">
                Immigration AI Assistant
              </SheetTitle>
              <SheetDescription className="mt-1 line-clamp-2 text-sm text-slate-300">
                General migration guidance and consultation preparation.
              </SheetDescription>
            </div>

            <button
              aria-label="Close assistant"
              className="rounded-full border border-white/10 bg-white/5 p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Quick questions
            </p>
            <button
              className="text-xs font-medium text-slate-600 hover:text-slate-900"
              onClick={() => setShowQuickQuestions((value) => !value)}
              type="button"
            >
              {showQuickQuestions ? "Hide" : "Show"}
            </button>
          </div>

          {showQuickQuestions && (
            <div className="max-h-20 overflow-y-auto pr-1">
              <div className="flex flex-wrap gap-2">
                {quickQuestions.map((question) => (
                  <button
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left text-[11px] leading-5 text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                    key={question}
                    onClick={() => {
                      void submitMessage(question);
                    }}
                    type="button"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
          <div className="min-h-[340px] flex-1 px-4 py-3 sm:min-h-[420px]">
            <div
              className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain pr-1"
              ref={listRef}
            >
              {messages.length === 0 ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-4 text-base leading-7 text-slate-700 shadow-sm">
                  <p className="font-medium text-slate-900">
                    Welcome to the consultation desk.
                  </p>
                  <p className="mt-2">
                    Ask about visa options, document preparation, refusals, or
                    how to get ready for a lawyer consultation.
                  </p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((message) => {
                    const isUser = message.role === "user";

                    return (
                      <motion.div
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "max-w-[92%] whitespace-pre-wrap break-words rounded-3xl px-4 py-3 text-[15px] leading-7 shadow-sm sm:text-base",
                          isUser
                            ? "ml-auto bg-slate-900 text-white"
                            : "border border-slate-200 bg-white text-slate-800"
                        )}
                        initial={{ opacity: 0, y: 10 }}
                        key={message.id}
                        transition={{ duration: 0.2 }}
                      >
                        <div>{message.text}</div>

                        {!isUser && message.confidence && (
                          <div className="mt-3">
                            <Badge
                              className="border-slate-200 bg-slate-50 text-slate-700"
                              variant="outline"
                            >
                              Confidence: {message.confidence}
                            </Badge>
                          </div>
                        )}

                        {!isUser && message.followUpQuestions?.length ? (
                          <div className="mt-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Follow-up questions
                            </p>
                            <div className="flex flex-col gap-2">
                              {message.followUpQuestions.slice(0, 3).map((q) => (
                                <button
                                  className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm leading-6 text-slate-700 transition hover:bg-slate-100"
                                  key={q}
                                  onClick={() => {
                                    void submitMessage(q);
                                  }}
                                  type="button"
                                >
                                  {q}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {!isUser && message.missingFacts?.length ? (
                          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900">
                            <p className="mb-1 font-medium">Important details still needed</p>
                            <ul className="list-disc space-y-1 pl-5">
                              {message.missingFacts.slice(0, 4).map((fact) => (
                                <li key={fact}>{fact}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {!isUser && message.citations?.length ? (
                          <div className="mt-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Sources considered
                            </p>
                            <div className="space-y-2">
                              {message.citations.slice(0, 3).map((citation, index) => (
                                <div
                                  className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                                  key={`${citation.title}-${index}`}
                                >
                                  <div className="font-medium text-slate-900">
                                    {citation.title}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {[citation.authority, citation.sectionRef]
                                      .filter(Boolean)
                                      .join(" — ")}
                                  </div>
                                  {citation.url ? (
                                    <a
                                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900"
                                      href={citation.url}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      Open source
                                      <ExternalLink className="size-3" />
                                    </a>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {!isUser && message.escalate ? (
                          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-sm leading-6 text-red-800">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                              <div>
                                <p className="font-medium">A consultation with a lawyer is recommended.</p>
                                <p className="mt-1 text-red-700">
                                  This issue may depend on facts, dates, or documents that need review.
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}

              {status === "submitted" && (
                <div className="inline-flex max-w-[92%] items-center gap-2 rounded-3xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-600 shadow-sm sm:text-base">
                  <Loader2 className="size-4 animate-spin" />
                  Drafting your answer...
                </div>
              )}

              {error && (
                <div className="max-w-[92%] rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-[15px] leading-7 text-red-700 shadow-sm sm:text-base">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white p-3">
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submitMessage(input);
            }}
          >
            <div className="rounded-3xl border border-slate-200 bg-white px-3 py-2 shadow-sm focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-200">
              <Textarea
                className="min-h-[60px] resize-none border-0 bg-transparent px-0 py-1 text-sm shadow-none focus-visible:ring-0"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitMessage(input);
                  }
                }}
                placeholder="Describe your situation..."
                rows={2}
                value={input}
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button
                className="rounded-full bg-slate-900 px-4 text-white hover:bg-slate-800"
                disabled={status !== "ready" || input.trim().length === 0}
                type="submit"
              >
                {status === "submitted" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    Send
                    <Send className="ml-2 size-4" />
                  </>
                )}
              </Button>
            </div>
          </form>

          <button
            className="mt-3 flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-100"
            type="button"
          >
            <div>
              <p className="font-medium text-slate-900">Book a consultation</p>
              <p className="text-xs text-slate-500">
                Continue with a human lawyer.
              </p>
            </div>
            <ChevronRight className="size-4" />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}