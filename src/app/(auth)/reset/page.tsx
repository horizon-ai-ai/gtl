"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const valid = password.length >= 8 && password === confirm;

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>連結無效</CardTitle>
          <CardDescription>此重設連結缺少必要參數</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-center text-neutral-600">
            <Link href="/forgot" className="text-neutral-900 font-medium hover:underline">
              重新申請重設連結
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!res.ok) {
        setError("連結已失效或過期");
        setLoading(false);
        return;
      }
      setSuccess(true);
      router.push("/login");
    } catch {
      setError("重設失敗，請稍後再試");
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>重設密碼</CardTitle>
        <CardDescription>請輸入新的密碼</CardDescription>
      </CardHeader>
      <CardContent>
        {success ? (
          <p className="text-sm text-neutral-600">密碼已更新，正在導向登入頁...</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">新密碼</Label>
              <Input
                id="password"
                type="password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-neutral-500">至少 8 字</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">確認新密碼</Label>
              <Input
                id="confirm"
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {confirm.length > 0 && password !== confirm && (
                <p className="text-xs text-amber-600">兩次輸入的密碼不一致</p>
              )}
            </div>
            {error && (
              <div className="space-y-1">
                <p className="text-sm text-red-600">{error}</p>
                <Link href="/forgot" className="text-sm text-neutral-900 font-medium hover:underline">
                  重新申請重設連結
                </Link>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading || !valid}>
              {loading ? "更新中..." : "更新密碼"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
