"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function RegisterPage() {
  const router = useRouter();
  const [type, setType] = useState<"personal" | "company">("personal");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [industry, setIndustry] = useState("");
  const [employeeSize, setEmployeeSize] = useState("");
  const [companyInfo, setCompanyInfo] = useState<{
    name?: string;
    address?: string;
    owner_name?: string;
    business_items?: string[];
    source?: string;
  } | null>(null);
  const [taxIdStatus, setTaxIdStatus] = useState<"idle" | "invalid" | "loading" | "success" | "not_found" | "error">(
    "idle",
  );
  const [taxIdLoading, setTaxIdLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (type !== "company") {
      setCompanyInfo(null);
      setTaxIdStatus("idle");
      return;
    }
    if (!taxId) {
      setCompanyInfo(null);
      setTaxIdStatus("idle");
      return;
    }
    if (!/^\d{8}$/.test(taxId)) {
      setCompanyInfo(null);
      setTaxIdStatus("invalid");
      return;
    }
    const t = setTimeout(async () => {
      setTaxIdLoading(true);
      setTaxIdStatus("loading");
      const res = await fetch(`/api/auth/lookup-tax-id?id=${taxId}`);
      const json = await res.json();
      setTaxIdLoading(false);
      if (json.data?.source === "gcis") {
        setCompanyInfo({
          name: json.data.name,
          address: json.data.address,
          owner_name: json.data.owner_name,
          business_items: json.data.business_items,
          source: json.data.source,
        });
        setTaxIdStatus("success");
      } else {
        setCompanyInfo(null);
        setTaxIdStatus(res.ok ? "not_found" : "error");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [taxId, type]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const body =
      type === "company"
        ? {
            type,
            email,
            password,
            display_name: displayName,
            tax_id: taxId,
            contact_name: contactName || undefined,
            contact_phone: contactPhone || undefined,
            industry: industry || undefined,
            employee_size: employeeSize || undefined,
          }
        : { type, email, password, display_name: displayName };
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error?.message ?? "註冊失敗");
      setLoading(false);
      return;
    }
    const login = await signIn("credentials", {
      email,
      password,
      callbackUrl: "/chat",
      redirect: false,
    });
    if (login?.error) {
      setError("註冊成功，但自動登入失敗，請手動登入");
      setLoading(false);
      return;
    }
    router.push(login?.url ?? "/chat");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>建立帳號</CardTitle>
        <CardDescription>選擇個人或公司註冊</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={type} onValueChange={(v) => setType(v as "personal" | "company")}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="personal">個人</TabsTrigger>
            <TabsTrigger value="company">公司</TabsTrigger>
          </TabsList>
          <TabsContent value={type}>
            <form onSubmit={onSubmit} className="space-y-4">
              {type === "company" && (
                <div className="space-y-2">
                  <Label htmlFor="taxId">統一編號</Label>
                  <Input
                    id="taxId"
                    placeholder="8 碼"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    maxLength={8}
                    required
                  />
                  {taxIdLoading && <p className="text-xs text-neutral-500">查詢中...</p>}
                  {taxIdStatus === "invalid" && (
                    <p className="text-xs text-amber-600">統編需為 8 碼，系統會自動查詢公司資料。</p>
                  )}
                  {taxIdStatus === "not_found" && (
                    <p className="text-xs text-amber-600">查無公司資料，仍可註冊，但公司資訊需人工補齊。</p>
                  )}
                  {taxIdStatus === "error" && (
                    <p className="text-xs text-red-600">統編查詢失敗，請稍後再試。</p>
                  )}
                  {companyInfo && (
                    <div className="text-xs bg-neutral-50 p-3 rounded-md border">
                      <div className="font-medium">{companyInfo.name}</div>
                      <div className="text-neutral-500">{companyInfo.address}</div>
                      {companyInfo.owner_name ? <div className="mt-1 text-neutral-500">負責人：{companyInfo.owner_name}</div> : null}
                      {companyInfo.business_items?.length ? (
                        <div className="mt-2 text-neutral-500">
                          營業項目：{companyInfo.business_items.slice(0, 4).join("、")}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="displayName">{type === "company" ? "聯絡人" : "暱稱"}</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>
              {type === "company" && (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="contactName">公司聯絡窗口</Label>
                      <Input
                        id="contactName"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="例如：王小姐"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contactPhone">聯絡電話</Label>
                      <Input
                        id="contactPhone"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        placeholder="例如：02-1234-5678"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="industry">產業</Label>
                      <Input
                        id="industry"
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        placeholder="例如：工業零件、食品加工"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="employeeSize">公司規模</Label>
                      <select
                        id="employeeSize"
                        value={employeeSize}
                        onChange={(e) => setEmployeeSize(e.target.value)}
                        className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                      >
                        <option value="">請選擇</option>
                        <option value="1-10">1-10 人</option>
                        <option value="11-50">11-50 人</option>
                        <option value="51-200">51-200 人</option>
                        <option value="201-500">201-500 人</option>
                        <option value="500+">500+ 人</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密碼</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <p className="text-xs text-neutral-500">至少 8 字</p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "註冊中..." : "註冊"}
              </Button>
              <p className="text-sm text-center text-neutral-600">
                已有帳號？{" "}
                <Link href="/login" className="text-neutral-900 font-medium hover:underline">
                  登入
                </Link>
              </p>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
