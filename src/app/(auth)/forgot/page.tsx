"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Anti-enumeration: never reveal request outcome, including failures.
    }
    setLoading(false);
    setSubmitted(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>忘記密碼</CardTitle>
        <CardDescription>輸入帳號 Email，我們會寄出重設連結</CardDescription>
      </CardHeader>
      <CardContent>
        {submitted ? (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              若該 Email 有對應帳號，我們已寄出重設連結，請至信箱查看。
            </p>
            <p className="text-sm text-center text-neutral-600">
              <Link href="/login" className="text-neutral-900 font-medium hover:underline">
                返回登入
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "寄送中..." : "寄出重設連結"}
            </Button>
            <p className="text-sm text-center text-neutral-600">
              <Link href="/login" className="text-neutral-900 font-medium hover:underline">
                返回登入
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
