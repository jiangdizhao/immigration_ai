"use client";

import Form from "next/form";
import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type ResendVerificationActionState,
  resendVerification,
} from "../actions";

export default function ResendVerificationPage() {
  const [email, setEmail] = useState("");
  const [state, formAction] = useActionState<
    ResendVerificationActionState,
    FormData
  >(resendVerification, { status: "idle" });

  return (
    <div className="flex min-h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-8 overflow-hidden rounded-2xl">
        <div className="flex flex-col gap-2 px-4 text-center sm:px-16">
          <h1 className="font-semibold text-xl dark:text-zinc-50">
            Resend verification email
          </h1>
          <p className="text-gray-500 text-sm dark:text-zinc-400">
            Enter the email used for your account.
          </p>
        </div>
        <Form action={formAction} className="flex flex-col gap-4 px-4 sm:px-16">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              autoComplete="email"
              autoFocus
              defaultValue={email}
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
            />
          </div>
          <SubmitButton isSuccessful={state.status === "success"}>
            Send verification email
          </SubmitButton>
          {state.status === "success" && (
            <p className="text-center text-gray-600 text-sm dark:text-zinc-400">
              If an unverified account exists for that email, a fresh link has
              been sent. Check your inbox or try again later.
            </p>
          )}
          {state.status === "invalid_data" && (
            <p className="text-center text-red-600 text-sm">
              Enter a valid email address.
            </p>
          )}
          <p className="text-center text-gray-600 text-sm dark:text-zinc-400">
            <Link className="font-semibold hover:underline" href="/login">
              Back to sign in
            </Link>
          </p>
        </Form>
      </div>
    </div>
  );
}
