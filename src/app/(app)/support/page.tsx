"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Citation = {
  id: string;
  source: string;
  title: string;
  url?: string | null;
  snippet: string;
  score: number;
  chunk_id: string;
  chunk_index: number;
};

type SupportToolResult = {
  tool: string;
  title: string;
  summary: string;
  items: Array<Record<string, unknown>>;
};

type SupportAnswer = {
  question: string;
  answer: string;
  citations: Citation[];
};

type Ticket = {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  body: string;
  created_at: string;
};

type TimelineEntry = {
  id: string;
  kind: string;
  created_at: string;
  actor_label: string;
  body: string;
  visibility: "public" | "internal";
};

type TicketDetail = Ticket & {
  timeline: TimelineEntry[];
};

export default function SupportPage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [history, setHistory] = useState<SupportAnswer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toolResults, setToolResults] = useState<SupportToolResult[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [ticketReply, setTicketReply] = useState("");
  const [replying, setReplying] = useState(false);

  useEffect(() => {
    void loadTickets();
  }, []);

  async function loadTickets() {
    const res = await fetch("/api/support/tickets");
    const json = await res.json();
    if (res.ok) setTickets(json.data ?? []);
  }

  async function loadTicketDetail(ticketId: string) {
    const res = await fetch(`/api/support/tickets/${ticketId}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error?.message ?? "讀取工單失敗");
      return;
    }
    setSelectedTicket(json.data);
  }

  async function sendTicketReply() {
    if (!selectedTicket || !ticketReply.trim()) return;
    setReplying(true);
    const res = await fetch(`/api/support/tickets/${selectedTicket.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: ticketReply.trim() }),
    });
    const json = await res.json();
    setReplying(false);
    if (!res.ok) {
      setError(json.error?.message ?? "送出回覆失敗");
      return;
    }
    setTicketReply("");
    await loadTicketDetail(selectedTicket.id);
    await loadTickets();
  }

  async function askSupport() {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError("");
    setAnswer("");
    setCitations([]);
    setToolResults([]);

    const res = await fetch("/api/support/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: trimmed }),
    });

    if (!res.ok || !res.body) {
      const json = await res.json().catch(() => null);
      setError(json?.error?.message ?? "查詢客服知識失敗");
      setLoading(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let nextAnswer = "";
    let nextCitations: Citation[] = [];
    let nextToolResults: SupportToolResult[] = [];

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
          if (event === "tool_results") {
            nextToolResults = data.items ?? [];
            setToolResults(nextToolResults);
          } else if (event === "citations") {
            nextCitations = data.items ?? [];
            setCitations(nextCitations);
          } else if (event === "token") {
            nextAnswer += data.delta ?? "";
            setAnswer(nextAnswer);
          } else if (event === "error") {
            setError(data.message ?? "查詢客服知識失敗");
          } else if (event === "done") {
            setHistory((prev) => [{ question: trimmed, answer: nextAnswer, citations: nextCitations }, ...prev]);
          }
        } catch {
          // ignore malformed SSE payload
        }
      }
    }

    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">客服知識庫與工單</h1>
        <p className="mt-1 text-sm text-neutral-500">
          先用 RAG 查詢知識；需要人工時，可在下方追蹤工單與接收公開回覆。
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Support Ask</CardTitle>
              <CardDescription>RAG 檢索 + citations 回答。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="例如：公司註冊後怎麼建立第一筆訂單？"
                className="min-h-32 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
              />
              <div className="flex items-center gap-3">
                <Button type="button" onClick={() => void askSupport()} disabled={loading}>
                  {loading ? "查詢中..." : "開始查詢"}
                </Button>
                {error ? <span className="text-sm text-red-600">{error}</span> : null}
              </div>
            </CardContent>
          </Card>

          {(answer || citations.length > 0 || toolResults.length > 0) && (
            <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
              <Card>
                <CardHeader>
                  <CardTitle>回答</CardTitle>
                  <CardDescription>{loading ? "流式回覆中" : "最新查詢結果"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="whitespace-pre-wrap rounded-md border bg-neutral-50 p-4 text-sm leading-6">
                    {answer || "等待回覆..."}
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>平台資料</CardTitle>
                    <CardDescription>Support tools 擷取到的個人帳戶、訂單、方案與用量資訊。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {toolResults.length === 0 ? (
                      <div className="rounded-md border border-dashed p-6 text-sm text-neutral-500">目前沒有額外的平台資料。</div>
                    ) : (
                      toolResults.map((result) => (
                        <div key={result.tool} className="rounded-md border p-3 text-sm">
                          <div className="font-medium">{result.title}</div>
                          <div className="mt-1 text-xs text-neutral-500">{result.summary}</div>
                          <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-3 text-xs text-neutral-700">
                            {JSON.stringify(result.items, null, 2)}
                          </pre>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Citations</CardTitle>
                    <CardDescription>依檢索相關性列出知識來源。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {citations.length === 0 ? (
                      <div className="rounded-md border border-dashed p-6 text-sm text-neutral-500">目前沒有引用來源。</div>
                    ) : (
                      citations.map((citation, index) => (
                        <div key={citation.chunk_id} className="rounded-md border p-3 text-sm">
                          <div className="font-medium">
                            [{index + 1}] {citation.title}
                          </div>
                          <div className="mt-1 text-xs text-neutral-500">
                            {citation.source} · chunk #{citation.chunk_index + 1} · score {citation.score.toFixed(2)}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-neutral-700">{citation.snippet}</p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>最近查詢</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {history.map((item, index) => (
                  <div key={`${item.question}-${index}`} className="rounded-md border p-4">
                    <div className="text-sm font-medium">{item.question}</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{item.answer}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>我的工單</CardTitle>
              <CardDescription>查看人工客服進度與公開回覆。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {tickets.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-sm text-neutral-500">尚無工單</div>
              ) : (
                tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => void loadTicketDetail(ticket.id)}
                    className="block w-full rounded-md border p-4 text-left hover:bg-neutral-50"
                  >
                    <div className="font-medium">{ticket.subject}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {ticket.category} · {ticket.priority} · {ticket.status}
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {selectedTicket ? (
            <Card>
              <CardHeader>
                <CardTitle>{selectedTicket.subject}</CardTitle>
                <CardDescription>
                  {selectedTicket.category} · {selectedTicket.status}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border bg-neutral-50 p-3 text-sm whitespace-pre-wrap">
                  {selectedTicket.body}
                </div>
                <div className="space-y-3">
                  {selectedTicket.timeline.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-neutral-500">尚無公開回覆</div>
                  ) : (
                    selectedTicket.timeline.map((entry) => (
                      <div key={entry.id} className="rounded-md border p-3 text-sm">
                        <div className="font-medium">{entry.actor_label}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {entry.kind} · {new Date(entry.created_at).toLocaleString()}
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-neutral-700">{entry.body}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2">
                  <textarea
                    value={ticketReply}
                    onChange={(e) => setTicketReply(e.target.value)}
                    className="min-h-24 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="補充更多資訊給客服"
                  />
                  <Button type="button" onClick={() => void sendTicketReply()} disabled={replying}>
                    {replying ? "送出中..." : "回覆工單"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
