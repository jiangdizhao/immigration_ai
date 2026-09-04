import "server-only";

import { trustedAssertionHeaders } from "@/app/api/lawyer-review/access";
import { trustedStaffProvenance } from "./learning-bridge-policy";
import {
  getImmigrationAnswerTraceLink,
  getLearningBridge,
  getStaffLawyerRequest,
  updateLearningBridge,
} from "./service";

const BRIDGE_TIMEOUT_MS = 8000;

export async function attemptLearningBridge(requestId: string) {
  const bridge = await getLearningBridge(requestId);
  if (!bridge) {
    return null;
  }
  if (bridge.status === "completed" || bridge.status === "failed_permanent") {
    return bridge;
  }
  if (!bridge.answerTraceId) {
    const request = await getStaffLawyerRequest(requestId);
    const link =
      request?.request.chatId && request.request.assistantMessageId
        ? await getImmigrationAnswerTraceLink({
            chatId: request.request.chatId,
            assistantMessageId: request.request.assistantMessageId,
          })
        : null;
    if (link) {
      await updateLearningBridge(bridge.id, {
        answerTraceId: link.answerTraceId,
        status: "pending",
        lastErrorCode: null,
      });
      bridge.answerTraceId = link.answerTraceId;
    }
  }
  if (!bridge.answerTraceId) {
    return updateLearningBridge(bridge.id, {
      status: "blocked_missing_trace_link",
      lastErrorCode: "missing_exact_answer_trace_link",
      lastAttemptAt: new Date(),
      attemptCount: bridge.attemptCount + 1,
    });
  }
  const request = await getStaffLawyerRequest(requestId);
  if (
    !request ||
    !["confirmed", "corrected"].includes(request.request.status)
  ) {
    return bridge;
  }
  const provenance = trustedStaffProvenance(
    bridge.actingStaffRole,
    request.request.reviewerUserId
  );
  if (!provenance) {
    return updateLearningBridge(bridge.id, {
      status: "failed_permanent",
      lastErrorCode: "missing_staff_provenance",
      lastAttemptAt: new Date(),
      attemptCount: bridge.attemptCount + 1,
    });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);
  const attempt = {
    lastAttemptAt: new Date(),
    attemptCount: bridge.attemptCount + 1,
    status: "pending" as const,
    lastErrorCode: null,
  };
  await updateLearningBridge(bridge.id, attempt);
  try {
    const response = await fetch(
      `${process.env.LEGAL_SERVICE_URL ?? "http://127.0.0.1:8000"}/api/v1/review/phase8/learning-bridge`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.LEGAL_SERVICE_API_KEY
            ? { "X-API-Key": process.env.LEGAL_SERVICE_API_KEY }
            : {}),
          ...trustedAssertionHeaders(),
        },
        body: JSON.stringify({
          phase8_request_id: requestId,
          answer_trace_id: bridge.answerTraceId,
          legal_matter_id: request.request.legalMatterId,
          chatbot_chat_id: request.request.chatId,
          chatbot_assistant_message_id: request.request.assistantMessageId,
          acting_staff_role: provenance.actingStaffRole,
          reviewer_id: provenance.reviewerId,
          outcome: request.request.status,
          lawyer_comment: request.request.lawyerResponse,
          corrected_answer: request.request.correctedAnswer,
          preferred_reasoning_or_research_approach:
            bridge.preferredReasoningOrResearchApproach,
          create_reasoning_lesson_candidate:
            bridge.createReasoningLessonCandidate,
        }),
        cache: "no-store",
        signal: controller.signal,
      }
    );
    const result = (await response.json().catch(() => null)) as {
      status?: string;
      experience_record_id?: string | null;
      answer_review_id?: string | null;
      evaluation_artifact_id?: string | null;
      lesson_artifact_id?: string | null;
      last_error_code?: string | null;
    } | null;
    if (!response.ok || !result?.status) {
      return updateLearningBridge(bridge.id, {
        status:
          response.status >= 400 && response.status < 500
            ? "failed_permanent"
            : "failed_retryable",
        lastErrorCode: `legal_service_http_${response.status}`,
      });
    }
    return updateLearningBridge(bridge.id, {
      status: result.status as typeof bridge.status,
      experienceRecordId: result.experience_record_id ?? null,
      phase7AnswerReviewId: result.answer_review_id ?? null,
      evaluationArtifactId: result.evaluation_artifact_id ?? null,
      reasoningLessonCandidateArtifactId: result.lesson_artifact_id ?? null,
      lastErrorCode: result.last_error_code ?? null,
      completedAt: result.status === "completed" ? new Date() : null,
    });
  } catch {
    return updateLearningBridge(bridge.id, {
      status: "failed_retryable",
      lastErrorCode: "legal_service_unavailable",
    });
  } finally {
    clearTimeout(timeout);
  }
}
