import { ChatbotError } from "@/lib/errors";

type AuthenticatedSession = { user?: { id: string } | null } | null;

type VoteDependencies = {
  authenticate: () => Promise<AuthenticatedSession>;
  getChatById: (input: { id: string }) => Promise<{ userId: string } | null>;
  isProjectChat: (chatId: string) => Promise<boolean>;
  getVotesByChatId: (input: { id: string }) => Promise<unknown>;
  voteMessage: (input: {
    chatId: string;
    messageId: string;
    type: "up" | "down";
  }) => Promise<unknown>;
};

type AuthorizationResult = { response: Response } | { userId: string };

export function createVoteHandlers(deps: VoteDependencies) {
  async function rejectProjectChat(
    chatId: string,
    surface: "chat" | "vote"
  ): Promise<Response | null> {
    try {
      if (await deps.isProjectChat(chatId)) {
        return new ChatbotError(`not_found:${surface}`).toResponse();
      }
    } catch {
      return new ChatbotError(
        "offline:api",
        "Project origin could not be verified."
      ).toResponse();
    }
    return null;
  }

  async function authorize(
    chatId: string,
    surface: "chat" | "vote"
  ): Promise<AuthorizationResult> {
    const session = await deps.authenticate();
    if (!session?.user?.id) {
      return {
        response: new ChatbotError("unauthorized:vote").toResponse(),
      };
    }

    const projectResponse = await rejectProjectChat(chatId, surface);
    if (projectResponse) {
      return { response: projectResponse };
    }

    const chat = await deps.getChatById({ id: chatId });
    if (!chat) {
      return {
        response: new ChatbotError(`not_found:${surface}`).toResponse(),
      };
    }
    if (chat.userId !== session.user.id) {
      return {
        response: new ChatbotError("forbidden:vote").toResponse(),
      };
    }
    return { userId: session.user.id };
  }

  return {
    async GET(request: Request) {
      const { searchParams } = new URL(request.url);
      const chatId = searchParams.get("chatId");
      if (!chatId) {
        return new ChatbotError(
          "bad_request:api",
          "Parameter chatId is required."
        ).toResponse();
      }

      const authorized = await authorize(chatId, "chat");
      if ("response" in authorized) {
        return authorized.response;
      }

      const votes = await deps.getVotesByChatId({ id: chatId });
      return Response.json(votes, { status: 200 });
    },

    async PATCH(request: Request) {
      const {
        chatId,
        messageId,
        type,
      }: { chatId: string; messageId: string; type: "up" | "down" } =
        await request.json();

      if (!chatId || !messageId || !type) {
        return new ChatbotError(
          "bad_request:api",
          "Parameters chatId, messageId, and type are required."
        ).toResponse();
      }

      const authorized = await authorize(chatId, "vote");
      if ("response" in authorized) {
        return authorized.response;
      }

      await deps.voteMessage({ chatId, messageId, type });
      return new Response("Message voted", { status: 200 });
    },
  };
}
