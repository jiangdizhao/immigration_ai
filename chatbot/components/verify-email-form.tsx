"use client";

import Form from "next/form";
import Link from "next/link";
import { useActionState } from "react";

import { type VerifyEmailActionState, verifyEmail } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/submit-button";

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<VerifyEmailActionState, FormData>(
    verifyEmail,
    { status: "idle" }
  );

  if (state.status === "success" || state.status === "already_verified") {
    return (
      <div className="flex flex-col gap-4 text-gray-600 text-sm dark:text-zinc-400">
        <p>
          {state.status === "success"
            ? "Your email is verified. You can now sign in."
            : "This account is already verified. You can sign in."}
        </p>
        <Link className="font-semibold hover:underline" href="/login">
          Continue to sign in
        </Link>
      </div>
    );
  }

  return (
    <Form action={formAction} className="flex flex-col gap-4">
      <input name="token" type="hidden" value={token} />
      <SubmitButton isSuccessful={false}>Verify email</SubmitButton>
      {state.status === "expired_or_invalid" && (
        <p className="text-gray-600 text-sm dark:text-zinc-400">
          This link is expired or invalid. Request a fresh verification email.
        </p>
      )}
    </Form>
  );
}
