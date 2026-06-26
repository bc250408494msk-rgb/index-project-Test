"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    if (!token) {
      setStatus("error");
      setErrorMsg("No verification token found in this link.");
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => setStatus("success"))
      .catch((err: any) => {
        setStatus("error");
        setErrorMsg(err?.response?.data?.error ?? "This link is invalid or has expired.");
      });
  }, [token]);

  if (status === "loading") {
    return (
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border p-8 text-center">
          <div className="text-4xl mb-4 animate-pulse">📧</div>
          <h1 className="text-xl font-semibold text-gray-700">Verifying your email…</h1>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border p-8 text-center">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Email Verified!</h1>
          <p className="text-gray-600 text-sm">Your email address has been confirmed. You can now sign in.</p>
          <Link
            href="/login"
            className="mt-6 inline-block bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl shadow-sm border p-8 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Verification Failed</h1>
        <p className="text-gray-600 text-sm">{errorMsg}</p>
        <Link href="/login" className="mt-6 inline-block text-blue-600 hover:underline text-sm">
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-sm border p-8 text-center text-gray-400">Loading…</div>
        </div>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
