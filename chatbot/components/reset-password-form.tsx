"use client";

import Form from "next/form";
import Link from "next/link";
import { useActionState } from "react";

import {
  type ResetPasswordActionState,
  resetPassword,
} from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<
    ResetPasswordActionState,
    FormData
  >(resetPassword, { status: "idle" });

  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-4 text-center text-gray-600 text-sm dark:text-zinc-400">
        <p>Your password has been changed. You can now sign in.</p>
        <Link className="font-semibold hover:underline" href="/login">
          Continue to sign in
        </Link>
      </div>
    );
  }

  return (
    <Form action={formAction} className="flex flex-col gap-4">
      <input name="token" type="hidden" value={token} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <Input
          autoComplete="new-password"
          id="password"
          minLength={6}
          name="password"
          required
          type="password"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="passwordConfirmation">Confirm new password</Label>
        <Input
          autoComplete="new-password"
          id="passwordConfirmation"
          minLength={6}
          name="passwordConfirmation"
          required
          type="password"
        />
      </div>
      <SubmitButton isSuccessful={false}>Reset password</SubmitButton>
      {state.status === "invalid_data" && (
        <p className="text-center text-red-600 text-sm">
          Use a password of at least 6 characters and make both fields match.
        </p>
      )}
      {state.status === "expired_or_invalid" && (
        <p className="text-center text-gray-600 text-sm dark:text-zinc-400">
          This reset link is expired or invalid. Request a new one.
        </p>
      )}
    </Form>
  );
}
