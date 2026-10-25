import type { ConversationOrigin } from "@/lib/workspace/conversation-origin";

export function conversationDocumentsAvailableForOrigin(
  origin: ConversationOrigin
): boolean {
  return origin !== "project";
}

export function conversationDocumentListUrl(input: {
  chatId: string | null;
  accountAccess: boolean;
  conversationDocumentsAvailable: boolean;
}): string | null {
  if (
    !input.chatId ||
    !input.accountAccess ||
    !input.conversationDocumentsAvailable
  ) {
    return null;
  }
  return `/api/matter-documents?chatId=${encodeURIComponent(input.chatId)}`;
}

export async function fetchConversationDocumentList<T>(input: {
  requestUrl: string | null;
  isCurrentRequest: () => boolean;
  fetcher: (
    url: string,
    init: { cache: "no-store" }
  ) => Promise<{
    ok: boolean;
    json: () => Promise<{ documents?: T[]; error?: unknown }>;
  }>;
  errorFallback: string;
}): Promise<T[] | null> {
  if (!input.requestUrl) {
    return null;
  }
  try {
    const response = await input.fetcher(input.requestUrl, {
      cache: "no-store",
    });
    if (!input.isCurrentRequest()) {
      return null;
    }
    const body = await response.json();
    if (!input.isCurrentRequest()) {
      return null;
    }
    if (!response.ok) {
      throw new Error(
        typeof body.error === "string" ? body.error : input.errorFallback
      );
    }
    return body.documents ?? [];
  } catch (error) {
    if (input.isCurrentRequest()) {
      throw error;
    }
    return null;
  }
}

export function isCurrentConversationDocumentRequest(
  requestSequence: number,
  latestRequestSequence: number
): boolean {
  return requestSequence === latestRequestSequence;
}

export function visibleConversationDocuments<T>(
  documents: T[],
  conversationDocumentsAvailable: boolean
): T[] {
  return conversationDocumentsAvailable ? documents : [];
}
