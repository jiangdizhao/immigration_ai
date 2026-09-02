"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ResetPasswordForm } from "@/components/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}

function ResetPasswordPageContent() {
  const token = useSearchParams().get("token");

  return (
    <div className="flex min-h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-8 overflow-hidden rounded-2xl px-4 sm:px-16">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="font-semibold text-xl dark:text-zinc-50">
            Reset your password
          </h1>
          <p className="text-gray-500 text-sm dark:text-zinc-400">
            Choose a new password for your account.
          </p>
        </div>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="text-center text-gray-600 text-sm dark:text-zinc-400">
            This reset link is missing or invalid. Request a new one from the
            forgot password page.
          </p>
        )}
        <p className="text-center text-gray-600 text-sm dark:text-zinc-400">
          <Link className="font-semibold hover:underline" href="/login">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
