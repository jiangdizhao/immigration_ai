import { guestRegex } from "@/lib/constants";

export type ConsultationUserIdentity = {
  id: string;
  email: string;
  role: string;
  emailVerifiedAt: Date | null;
};
export type ConsultationScope = {
  id: string;
  role: "customer" | "lawyer" | "admin";
};

export function customerAccessForIdentity(
  identity: ConsultationUserIdentity | null
) {
  if (!identity || guestRegex.test(identity.email)) {
    return {
      allowed: false as const,
      status: 401,
      error: "A registered account is required.",
    };
  }
  if (identity.role !== "user") {
    return {
      allowed: false as const,
      status: 403,
      error: "Customer access required.",
    };
  }
  if (!identity.emailVerifiedAt) {
    return {
      allowed: false as const,
      status: 403,
      error: "Verify your email before requesting a consultation.",
    };
  }
  return { allowed: true as const };
}

export function canAccessConsultation(
  actor: ConsultationScope,
  record: {
    userId: string;
    assignedLawyerUserId: string | null;
  }
) {
  if (actor.role === "admin") {
    return true;
  }
  if (actor.role === "customer") {
    return record.userId === actor.id;
  }
  return record.assignedLawyerUserId === actor.id;
}

export function canAssignConsultationLawyer(
  identity: ConsultationUserIdentity | null
) {
  return Boolean(
    identity &&
      identity.role === "lawyer" &&
      identity.emailVerifiedAt &&
      !guestRegex.test(identity.email)
  );
}

export function canManageConsultationAssignments(role: string) {
  return role === "admin";
}

export function consultationLinkOwnedBy(actorId: string, ownerId: string) {
  return actorId === ownerId;
}

export function consultationContinuityLinksMatch(
  suppliedChatId: string | undefined,
  lawyerRequestChatId: string | null
) {
  return (
    !suppliedChatId ||
    !lawyerRequestChatId ||
    suppliedChatId === lawyerRequestChatId
  );
}
