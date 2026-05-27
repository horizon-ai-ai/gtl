"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type VerifyState = "loading" | "verified" | "already_verified" | "dead";

function ResendControl() {
  const { data: session, status } = useSession();
  const sessionEmail = session?.user?.email ?? null;
  const signedIn = status === "authenticated" && !!sessionEmail;
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Signed-in callers resolve by session server-side; only logged-out
        // visitors need to supply an email.
        body: JSON.stringify(signedIn ? {} : { email }),
      });
    } catch {
      // Anti-enumeration: never reveal request outcome, including failures.
    }
    setLoading(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <p className="text-sm text-neutral-600">
        若該 Email 對應的帳號尚未驗證，我們已重新寄出驗證連結，請至信箱查看。
      </p>
    );
  }

  if (status === "loading") {
    return <p className="text-sm text-neutral-500">載入中...</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {!signedIn && (
        <div className="space-y-2">
          <Label htmlFor="resend-email">Email</Label>
          <Input
            id="resend-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "寄送中..." : "重新寄送驗證信"}
      </Button>
    </form>
  );
}

function VerifyResult() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<VerifyState>("loading");
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    if (!token) {
      setState("dead");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (!res.ok) {
          setState("dead");
          return;
        }
        setState(json.data?.already_verified ? "already_verified" : "verified");
      } catch {
        setState("dead");
      }
    })();
  }, [token]);

  if (state === "loading") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>驗證中</CardTitle>
          <CardDescription>正在確認您的驗證連結...</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-600">請稍候。</p>
        </CardContent>
      </Card>
    );
  }

  if (state === "verified" || state === "already_verified") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{state === "verified" ? "Email 已驗證" : "Email 已完成驗證"}</CardTitle>
          <CardDescription>
            {state === "verified" ? "您的 Email 驗證成功。" : "此 Email 先前已完成驗證。"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-center text-neutral-600">
            <Link href="/login" className="text-neutral-900 font-medium hover:underline">
              前往登入
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>連結已失效</CardTitle>
        <CardDescription>此驗證連結無效或已過期，可重新寄送驗證信。</CardDescription>
      </CardHeader>
      <CardContent>
        <ResendControl />
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyResult />
    </Suspense>
  );
}
