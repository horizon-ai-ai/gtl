"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type PlannedTool = {
  name: string;
  reason: string;
  status?: "pending" | "running" | "completed" | "error";
  duration_ms?: number;
};

type ToolCard = {
  tool: string;
  title: string;
  summary: string;
  items: Array<Record<string, unknown>>;
};

function isLinkableItem(item: Record<string, unknown>): item is Record<string, unknown> & { href: string; href_label?: string } {
  return typeof item.href === "string" && item.href.length > 0;
}

const QUICK_PROMPTS = [
  "請給我今日營運摘要",
  "最近客服工單有哪些風險？",
  "目前 trade 詢價和商品狀況如何？",
  "有哪些升級候選用戶？",
  "幫我整理訂單與 GMV 的重點",
];

export default function AdminCopilotPage() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [cards, setCards] = useState<ToolCard[]>([]);
  const [plan, setPlan] = useState<PlannedTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [runMeta, setRunMeta] = useState<{ plannerModel?: string; answerModel?: string } | null>(null);
  const didAutoRunRef = useRef(false);

  useEffect(() => {
    const q = searchParams.get("q");
    const autorun = searchParams.get("autorun");
    if (q && query !== q) {
      setQuery(q);
    }
    if (q && autorun === "1" && !didAutoRunRef.current) {
      didAutoRunRef.current = true;
      void ask(q);
    }
  }, [searchParams, query]);

  async function ask(prompt?: string) {
    const text = (prompt ?? query).trim();
    if (!text || loading) return;

    setLoading(true);
    setError("");
    setAnswer("");
    setCards([]);
    setPlan([]);
    setRunMeta(null);

    const res = await fetch("/api/admin/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: text }),
    });

    if (!res.ok || !res.body) {
      const json = await res.json().catch(() => null);
      setError(json?.error?.message ?? "Copilot 查詢失敗");
      setLoading(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let nextAnswer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const evt of events) {
        const lines = evt.split("\n");
        const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
        const dataLine = lines.find((line) => line.startsWith("data: "))?.slice(6);
        if (!event || !dataLine) continue;

        try {
          const data = JSON.parse(dataLine);
          if (event === "planned_tools") {
            setPlan(
              (data.items ?? []).map((item: PlannedTool) => ({
                ...item,
                status: "pending" as const,
              })),
            );
            setRunMeta((prev) => ({ ...prev, plannerModel: data.planner_model ?? undefined }));
          } else if (event === "tool_call") {
            setPlan((current) =>
              current.map((item) =>
                item.name === data.tool_name ? { ...item, status: "running" } : item,
              ),
            );
          } else if (event === "tool_result") {
            setCards((current) => [...current, data.card]);
            setPlan((current) =>
              current.map((item) =>
                item.name === data.tool_name
                  ? { ...item, status: "completed", duration_ms: data.duration_ms }
                  : item,
              ),
            );
          } else if (event === "token") {
            nextAnswer += data.delta ?? "";
            setAnswer(nextAnswer);
          } else if (event === "done") {
            setRunMeta((prev) => ({ ...prev, answerModel: data.model ?? undefined }));
          } else if (event === "error") {
            setError(data.message ?? "Copilot 查詢失敗");
            setPlan((current) =>
              current.map((item) =>
                item.status === "running" ? { ...item, status: "error" } : item,
              ),
            );
          }
        } catch {
          // ignore malformed SSE chunks
        }
      }
    }

    setLoading(false);
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin Copilot</h1>
        <p className="mt-1 text-sm text-neutral-500">
          像 Notion AI 一樣，對整個 admin portal 的 users / orders / support / trade 資料做分析、整合與建議。
        </p>
        <div className="mt-3">
          <Link href="/admin/copilot/history" className="text-sm underline text-neutral-600 hover:text-neutral-900">
            查看 Copilot History
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <Card className="p-4 space-y-4">
          <div className="text-sm font-medium">Ask Copilot</div>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-40 w-full rounded border px-3 py-2 text-sm"
            placeholder="例如：整理最近 7 天客服、訂單與 trade 的風險與優先處理事項"
          />
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  setQuery(prompt);
                  void ask(prompt);
                }}
                className="rounded-full border bg-neutral-50 px-3 py-1 text-xs hover:bg-neutral-100"
              >
                {prompt}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" onClick={() => void ask()} disabled={loading}>
              {loading ? "分析中..." : "開始分析"}
            </Button>
            {error ? <span className="text-sm text-red-600">{error}</span> : null}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-4 space-y-3">
            <div className="text-sm font-medium">執行計畫</div>
            {runMeta ? (
              <div className="text-xs text-neutral-500">
                planner: {runMeta.plannerModel ?? "fallback"} {runMeta.answerModel ? `· answer: ${runMeta.answerModel}` : ""}
              </div>
            ) : null}
            {plan.length === 0 ? (
              <div className="text-sm text-neutral-500">尚未執行。</div>
            ) : (
              plan.map((item) => (
                <div key={item.name} className="rounded border bg-neutral-50 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-neutral-500">
                      {item.status === "pending" ? "等待中" : null}
                      {item.status === "running" ? "執行中" : null}
                      {item.status === "completed" ? `完成${item.duration_ms ? ` · ${item.duration_ms}ms` : ""}` : null}
                      {item.status === "error" ? "失敗" : null}
                    </div>
                  </div>
                  <div className="mt-1 text-neutral-600">{item.reason}</div>
                </div>
              ))
            )}
          </Card>

          <Card className="p-4 space-y-3">
            <div className="text-sm font-medium">AI Insight</div>
            <div className="min-h-48 whitespace-pre-wrap rounded border bg-neutral-50 p-4 text-sm leading-6">
              {answer || (loading ? "分析生成中..." : "尚未產生分析內容。")}
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-4 space-y-4">
        <div className="text-sm font-medium">Data Cards</div>
        {cards.length === 0 ? (
          <div className="text-sm text-neutral-500">尚未載入資料卡片。</div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {cards.map((card) => (
              <div key={card.tool} className="rounded border p-4">
                <div className="font-medium">{card.title}</div>
                <div className="mt-1 text-sm text-neutral-600">{card.summary}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {card.items
                    .filter((item) => isLinkableItem(item))
                    .slice(0, 6)
                    .map((item, index) => (
                      <Link
                        key={`${card.tool}-href-${index}`}
                        href={item.href}
                        className="rounded-full border px-3 py-1 text-xs hover:bg-neutral-50"
                      >
                        {item.href_label ?? "查看來源"}
                      </Link>
                    ))}
                </div>
                <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-3 text-xs text-neutral-700">
                  {JSON.stringify(card.items, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
