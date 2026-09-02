"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { VerifyEmailForm } from "@/components/verify-email-form";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <VerifyEmailPageContent />
    </Suspense>
  );
}

function VerifyEmailPageContent() {
  const token = useSearchParams().get("token");

  return (
    <div className="flex min-h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-8 overflow-hidden rounded-2xl px-4 text-center sm:px-16">
        <div className="flex flex-col gap-2">
          <h1 className="font-semibold text-xl dark:text-zinc-50">
            Verify your email
          </h1>
          <p className="text-gray-500 text-sm dark:text-zinc-400">
            Confirm ownership of your email address to activate sign in.
          </p>
        </div>
        {token ? (
          <VerifyEmailForm token={token} />
        ) : (
          <p className="text-gray-600 text-sm dark:text-zinc-400">
            This verification link is missing or invalid. Request a new one
            below.
          </p>
        )}
        <div className="flex justify-center gap-4 text-sm">
          <Link
            className="font-semibold hover:underline"
            href="/resend-verification"
          >
            Resend verification
          </Link>
          <Link className="font-semibold hover:underline" href="/login">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
