"use server";

import { headers } from "next/headers";
import { z } from "zod";
import {
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/auth/email";
import { isPlausibleOpaqueToken } from "@/lib/auth/tokens";
import { guestRegex } from "@/lib/constants";
import {
  createEmailVerificationTokenForUser,
  createPasswordResetTokenForUser,
  createUser,
  getUser,
  resetPasswordWithToken,
  verifyEmailWithToken,
} from "@/lib/db/queries";
import { checkIpRateLimit } from "@/lib/ratelimit";

import { signIn } from "./auth";

const emailSchema = z.string().trim().email().max(64);
const passwordSchema = z.string().min(6).max(128);

const authFormSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

async function applyPublicAuthRateLimit() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const ip =
    forwardedFor?.split(",", 1)[0]?.trim() ||
    requestHeaders.get("x-real-ip") ||
    undefined;

  await checkIpRateLimit(ip, {
    keyPrefix: "auth-rate-limit",
    maxRequests: 10,
    ttlSeconds: 60 * 60,
  });
}

export type LoginActionState = {
  status: "idle" | "in_progress" | "success" | "failed" | "invalid_data";
  redirectTo?: "/ai-workspace" | "/admin-portal";
};

export const login = async (
  _: LoginActionState,
  formData: FormData
): Promise<LoginActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const users = await getUser(validatedData.email);
    if (users.length !== 1) {
      return { status: "failed" };
    }

    const result = await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    if (result?.error) {
      return { status: "failed" };
    }

    return {
      status: "success",
      redirectTo: users[0].role === "admin" ? "/admin-portal" : "/ai-workspace",
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "failed" };
  }
};

export type RegisterActionState = {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "email_delivery_failed"
    | "failed"
    | "user_exists"
    | "invalid_data";
};

export const register = async (
  _: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const [existingUser] = await getUser(validatedData.email);
    if (existingUser) {
      return { status: "user_exists" };
    }

    const createdUser = await createUser(
      validatedData.email,
      validatedData.password
    );
    const verification = await createEmailVerificationTokenForUser({
      userId: createdUser.id,
      enforceCooldown: false,
    });

    if (!verification) {
      return { status: "email_delivery_failed" };
    }

    try {
      await sendVerificationEmail(verification);
    } catch (_error) {
      return { status: "email_delivery_failed" };
    }

    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "failed" };
  }
};

export type VerifyEmailActionState = {
  status: "idle" | "success" | "already_verified" | "expired_or_invalid";
};

export const verifyEmail = async (
  _: VerifyEmailActionState,
  formData: FormData
): Promise<VerifyEmailActionState> => {
  try {
    await applyPublicAuthRateLimit();
    const rawToken = formData.get("token");
    if (!isPlausibleOpaqueToken(rawToken)) {
      return { status: "expired_or_invalid" };
    }

    const result = await verifyEmailWithToken(rawToken);
    if (result === "verified") {
      return { status: "success" };
    }
    if (result === "already_verified") {
      return { status: "already_verified" };
    }

    return { status: "expired_or_invalid" };
  } catch (_error) {
    return { status: "expired_or_invalid" };
  }
};

export type ResendVerificationActionState = {
  status: "idle" | "success" | "invalid_data";
};

export const resendVerification = async (
  _: ResendVerificationActionState,
  formData: FormData
): Promise<ResendVerificationActionState> => {
  try {
    await applyPublicAuthRateLimit();
    const email = emailSchema.parse(formData.get("email"));
    const users = await getUser(email);

    if (
      users.length === 1 &&
      !users[0].emailVerifiedAt &&
      !guestRegex.test(users[0].email)
    ) {
      const verification = await createEmailVerificationTokenForUser({
        userId: users[0].id,
      });

      if (verification) {
        try {
          await sendVerificationEmail(verification);
        } catch (_error) {
          // Keep the response generic. The account remains pending and can be retried.
        }
      }
    }

    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "success" };
  }
};

export type ForgotPasswordActionState = {
  status: "idle" | "success" | "invalid_data";
};

export const forgotPassword = async (
  _: ForgotPasswordActionState,
  formData: FormData
): Promise<ForgotPasswordActionState> => {
  try {
    await applyPublicAuthRateLimit();
    const email = emailSchema.parse(formData.get("email"));
    const users = await getUser(email);

    if (
      users.length === 1 &&
      users[0].password &&
      users[0].emailVerifiedAt &&
      !guestRegex.test(users[0].email)
    ) {
      const reset = await createPasswordResetTokenForUser({
        userId: users[0].id,
      });

      if (reset) {
        try {
          await sendPasswordResetEmail(reset);
        } catch (_error) {
          // Keep the response generic. The reset token remains short-lived.
        }
      }
    }

    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "success" };
  }
};

export type ResetPasswordActionState = {
  status: "idle" | "success" | "expired_or_invalid" | "invalid_data";
};

export const resetPassword = async (
  _: ResetPasswordActionState,
  formData: FormData
): Promise<ResetPasswordActionState> => {
  const rawToken = formData.get("token");
  const password = formData.get("password");
  const confirmation = formData.get("passwordConfirmation");

  if (
    !isPlausibleOpaqueToken(rawToken) ||
    typeof password !== "string" ||
    typeof confirmation !== "string"
  ) {
    return { status: "invalid_data" };
  }

  const parsedPassword = passwordSchema.safeParse(password);
  if (!parsedPassword.success || password !== confirmation) {
    return { status: "invalid_data" };
  }

  let updatedUser: Awaited<ReturnType<typeof resetPasswordWithToken>>;
  try {
    await applyPublicAuthRateLimit();
    updatedUser = await resetPasswordWithToken({
      rawToken,
      password: parsedPassword.data,
    });
  } catch (_error) {
    return { status: "expired_or_invalid" };
  }

  if (!updatedUser) {
    return { status: "expired_or_invalid" };
  }

  try {
    await sendPasswordChangedEmail({ email: updatedUser.email });
  } catch (_error) {
    // Password reset remains successful if the optional notification fails.
  }

  return { status: "success" };
};
