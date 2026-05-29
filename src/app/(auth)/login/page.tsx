"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isAdminPortal = typeof window !== "undefined" && window.location.port === "3001";

  function getCallbackUrl() {
    if (typeof window === "undefined") return "/chat";
    return window.location.port === "3001" ? "/admin" : "/chat";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        callbackUrl: getCallbackUrl(),
        redirect: false,
      });
      setLoading(false);
      if (!res || res.error) {
        setError("Email 或密碼錯誤");
        return;
      }
      if (!res.ok) {
        setError("登入失敗，請稍後再試");
        return;
      }
      router.push(res.url ?? "/chat");
      router.refresh();
    } catch {
      setLoading(false);
      setError("登入失敗，請確認本地服務是否正常啟動");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isAdminPortal ? "Admin Login" : "登入"}</CardTitle>
        <CardDescription>
          {isAdminPortal ? "使用管理員帳號登入 Admin Portal" : "使用 Email 與密碼登入"}
        </CardDescription>
      </CardHeader>
      <CardContent>
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">密碼</Label>
              <Link href="/forgot" className="text-sm text-neutral-500 hover:underline">
                忘記密碼？
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "登入中..." : "登入"}
          </Button>
          <p className="text-sm text-center text-neutral-600">
            還沒有帳號？{" "}
            <Link href="/register" className="text-neutral-900 font-medium hover:underline">
              立即註冊
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
