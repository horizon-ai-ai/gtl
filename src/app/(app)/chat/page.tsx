"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LifeBuoy, PackagePlus, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  detectRecommendedActions,
  extractSuggestedItems,
  type RecommendedAction,
  type SuggestedOrderItem,
} from "@/lib/chat-handoff";

type Conversation = { id: string; title: string; last_message_at: string | null };
type Message = { id?: string; role: "user" | "assistant"; content: string; pending?: boolean };
type Me = {
  id: string;
  email: string;
  display_name?: string | null;
  company?: { name?: string | null; tax_id?: string | null } | null;
};

type DraftOrderItem = {
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  hint?: string;
};

const SUPPORT_BODY_HINT = "請描述客戶需求、預算、時程，或為何需要人工介入。";

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showOrderDraft, setShowOrderDraft] = useState(false);
  const [showSupportTicket, setShowSupportTicket] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [recommendedActions, setRecommendedActions] = useState<RecommendedAction[]>([]);
  const [suggestedItems, setSuggestedItems] = useState<SuggestedOrderItem[]>([]);
  const [usage, setUsage] = useState<{ used_credits: number; plan_credits: number; topup_credits: number } | null>(null);
  const [orderDraft, setOrderDraft] = useState({
    customerName: "",
    notes: "",
    shipping: 0,
    tax: 0,
    items: [] as DraftOrderItem[],
  });
  const [supportTicket, setSupportTicket] = useState({
    category: "sales_handoff",
    priority: "normal",
    subject: "",
    body: "",
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadConversations();
    void loadUsage();
    void loadMe();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant" && !message.pending);
    if (!latestAssistant?.content) {
      setRecommendedActions([]);
      setSuggestedItems([]);
      return;
    }
    setRecommendedActions(detectRecommendedActions(latestAssistant.content));
    setSuggestedItems(extractSuggestedItems(latestAssistant.content));
  }, [messages]);

  async function loadConversations() {
    const res = await fetch("/api/conversations");
    const json = await res.json();
    setConversations(json.data ?? []);
  }

  async function loadUsage() {
    const res = await fetch("/api/usage/current");
    const json = await res.json();
    if (json.data) setUsage(json.data);
  }

  async function loadMe() {
    const res = await fetch("/api/auth/me");
    const json = await res.json();
    if (json.data) {
      setMe(json.data);
      setOrderDraft((prev) => ({
        ...prev,
        customerName: json.data.company?.name || json.data.display_name || json.data.email,
      }));
    }
  }

  async function selectConversation(id: string) {
    setActiveId(id);
    setError("");
    setNotice("");
    setShowOrderDraft(false);
    setShowSupportTicket(false);
    setRecommendedActions([]);
    setSuggestedItems([]);
    const res = await fetch(`/api/conversations/${id}`);
    const json = await res.json();
    if (json.data) {
      setMessages(
        (json.data.messages ?? []).map((message: { role: string; content: { text?: string } }) => ({
          role: message.role as "user" | "assistant",
          content: message.content?.text ?? "",
        })),
      );
    }
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setError("");
    setNotice("");
    setShowOrderDraft(false);
    setShowSupportTicket(false);
    setRecommendedActions([]);
    setSuggestedItems([]);
    setOrderDraft((prev) => ({ ...prev, notes: "" }));
    setSupportTicket({
      category: "sales_handoff",
      priority: "normal",
      subject: "",
      body: "",
    });
  }

  async function send() {
    const content = input.trim();
    if (!content || sending) return;

    setError("");
    setNotice("");
    setInput("");
    setSending(true);

    const userMsg: Message = { role: "user", content };
    const aiMsg: Message = { role: "assistant", content: "", pending: true };
    setMessages((current) => [...current, userMsg, aiMsg]);

    const res = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: activeId, content }),
    });

    if (!res.ok || !res.body) {
      setMessages((current) => {
        const copy = [...current];
        copy[copy.length - 1] = { role: "assistant", content: "（發送失敗，請稍後再試）" };
        return copy;
      });
      setError("AI 對話送出失敗，請稍後再試。");
      setSending(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

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
          if (event === "conversation") {
            setActiveId(data.id);
          } else if (event === "token") {
            setMessages((current) => {
              const copy = [...current];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, content: last.content + data.delta, pending: true };
              return copy;
            });
          } else if (event === "error") {
            setMessages((current) => {
              const copy = [...current];
              copy[copy.length - 1] = {
                role: "assistant",
                content: `（${data.message ?? "AI 回覆失敗"}）`,
                pending: false,
              };
              return copy;
            });
            setError(data.message ?? "AI 回覆失敗");
          } else if (event === "recommendation") {
            setRecommendedActions(data.actions ?? []);
            setSuggestedItems(data.suggested_items ?? []);
          } else if (event === "done") {
            setMessages((current) => {
              const copy = [...current];
              copy[copy.length - 1] = { ...copy[copy.length - 1], pending: false };
              return copy;
            });
          }
        } catch {
          // ignore malformed SSE payload
        }
      }
    }

    setSending(false);
    void loadConversations();
    void loadUsage();
  }

  function buildConversationDigest() {
    return messages
      .slice(-6)
      .map((message) => `${message.role === "user" ? "客戶" : "AI"}：${message.content}`)
      .join("\n");
  }

  function openOrderDraft() {
    setShowSupportTicket(false);
    setShowOrderDraft(true);
    setError("");
    setNotice("");
    setOrderDraft((prev) => ({
      customerName: prev.customerName || me?.company?.name || me?.display_name || me?.email || "",
      notes: prev.notes || buildConversationDigest(),
      shipping: prev.shipping || 0,
      tax: prev.tax || 0,
      items:
        prev.items.length > 0
          ? prev.items
          : suggestedItems.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              unit_price: 0,
              hint: item.hint,
            })),
    }));
  }

  function openSupportTicket() {
    setShowOrderDraft(false);
    setShowSupportTicket(true);
    setError("");
    setNotice("");
    setSupportTicket((prev) => ({
      ...prev,
      subject: prev.subject || "AI 對話需人工接手",
      body: prev.body || `${SUPPORT_BODY_HINT}\n\n對話摘要：\n${buildConversationDigest()}`,
    }));
  }

  async function createOrderDraft() {
    if (!orderDraft.customerName.trim()) {
      setError("請先填寫客戶名稱。");
      return;
    }

    setSubmittingOrder(true);
    setError("");
    setNotice("");

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: activeId,
        status: "draft",
        customer: {
          name: orderDraft.customerName.trim(),
          email: me?.email,
          tax_id: me?.company?.tax_id ?? undefined,
        },
        items: [],
        notes: orderDraft.notes.trim() || undefined,
        metadata: {
          source: "chat_handoff",
          intent: "order_draft",
          suggested_items: suggestedItems,
        },
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error?.message ?? "建立訂單草稿失敗");
      setSubmittingOrder(false);
      return;
    }

    setNotice(`已建立訂單草稿 ${json.data.order_no}，你可以到訂單管理補完整細節。`);
    setShowOrderDraft(false);
    setSubmittingOrder(false);
  }

  async function createPendingOrder() {
    if (!orderDraft.customerName.trim()) {
      setError("請先填寫客戶名稱。");
      return;
    }
    if (orderDraft.items.length === 0) {
      setError("請至少保留一個品項。");
      return;
    }
    if (orderDraft.items.some((item) => !item.name.trim() || item.quantity <= 0 || item.unit_price < 0)) {
      setError("請完整填寫品項名稱、數量與單價。");
      return;
    }

    setSubmittingOrder(true);
    setError("");
    setNotice("");

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: activeId,
        status: "pending",
        customer: {
          name: orderDraft.customerName.trim(),
          email: me?.email,
          tax_id: me?.company?.tax_id ?? undefined,
        },
        items: orderDraft.items.map((item) => ({
          name: item.name.trim(),
          description: item.unit ? `單位：${item.unit}` : undefined,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
        shipping: orderDraft.shipping,
        tax: orderDraft.tax,
        notes: orderDraft.notes.trim() || undefined,
        metadata: {
          source: "chat_handoff",
          intent: "order_pending",
          suggested_items: suggestedItems,
        },
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error?.message ?? "建立訂單失敗");
      setSubmittingOrder(false);
      return;
    }

    setNotice(`已建立訂單 ${json.data.order_no}，目前狀態為 pending。`);
    setMessages((current) => [
      ...current,
      { role: "assistant", content: `訂單已建立：${json.data.order_no}，你可以到 /orders 繼續管理。` },
    ]);
    setShowOrderDraft(false);
    setSubmittingOrder(false);
  }

  function updateDraftItem(index: number, patch: Partial<DraftOrderItem>) {
    setOrderDraft((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  }

  function removeDraftItem(index: number) {
    setOrderDraft((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function addDraftItem() {
    setOrderDraft((prev) => ({
      ...prev,
      items: [...prev.items, { name: "", quantity: 1, unit: "件", unit_price: 0 }],
    }));
  }

  async function createSupportTicket() {
    if (!supportTicket.subject.trim() || !supportTicket.body.trim()) {
      setError("請先填寫工單主旨與內容。");
      return;
    }

    setSubmittingTicket(true);
    setError("");
    setNotice("");

    const res = await fetch("/api/support/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: activeId ?? undefined,
        category: supportTicket.category,
        priority: supportTicket.priority,
        subject: supportTicket.subject.trim(),
        body: supportTicket.body.trim(),
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error?.message ?? "建立人工支援工單失敗");
      setSubmittingTicket(false);
      return;
    }

    setNotice("已建立人工支援工單，admin portal 現在可以接手處理。");
    setShowSupportTicket(false);
    setSubmittingTicket(false);
  }

  const usagePct = usage
    ? Math.min(
        100,
        Math.round((usage.used_credits / Math.max(1, usage.plan_credits + usage.topup_credits)) * 100),
      )
    : 0;
  const orderSubtotal = orderDraft.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const orderTotal = orderSubtotal + orderDraft.shipping + orderDraft.tax;

  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r bg-neutral-50 flex flex-col">
        <div className="p-3 border-b">
          <Button onClick={newChat} className="w-full" size="sm">
            <Plus className="w-4 h-4" /> 新對話
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => selectConversation(conversation.id)}
              className={`w-full text-left text-sm px-3 py-2 rounded-md hover:bg-neutral-100 truncate ${
                conversation.id === activeId ? "bg-neutral-200" : ""
              }`}
            >
              {conversation.title}
            </button>
          ))}
          {conversations.length === 0 && <p className="text-xs text-neutral-400 px-3 py-2">尚無對話</p>}
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-auto p-6 space-y-4">
          {(error || notice) && (
            <div
              className={`mx-auto max-w-3xl rounded-md border px-4 py-3 text-sm ${
                error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"
              }`}
            >
              {error || notice}
            </div>
          )}

          {messages.length === 0 && (
            <div className="text-center text-neutral-400 mt-32">
              <p className="text-lg">Hello，今天想來點什麼？</p>
              <p className="text-sm mt-2">告訴我你想做的行銷工作 — 寫文案、建網站、列訂單、找供應商...</p>
            </div>
          )}

          {messages.map((message, index) => (
            <div key={index} className={message.role === "user" ? "flex justify-end" : "flex"}>
              <div
                className={`max-w-2xl rounded-lg px-4 py-3 text-sm whitespace-pre-wrap ${
                  message.role === "user" ? "bg-neutral-900 text-white" : "bg-neutral-100"
                }`}
              >
                {message.content || (message.pending ? "..." : "")}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t p-4">
          <div className="max-w-3xl mx-auto space-y-2">
            {messages.length > 0 && !sending && recommendedActions.length > 0 && (
              <div className="rounded-lg border bg-white p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">對話下一步</div>
                    <div className="text-xs text-neutral-500">
                      偵測到目前對話已接近成交或需要人工跟進，建議直接往下一步處理。
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recommendedActions.includes("create_order_draft") && (
                      <Button type="button" variant="outline" size="sm" onClick={openOrderDraft}>
                        <PackagePlus className="w-4 h-4" /> 建立訂單草稿
                      </Button>
                    )}
                    {recommendedActions.includes("handoff_to_human") && (
                      <Button type="button" variant="outline" size="sm" onClick={openSupportTicket}>
                        <LifeBuoy className="w-4 h-4" /> 轉人工
                      </Button>
                    )}
                  </div>
                </div>

                {showOrderDraft && (
                  <div className="grid gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">客戶名稱</label>
                      <input
                        value={orderDraft.customerName}
                        onChange={(e) =>
                          setOrderDraft((prev) => ({ ...prev, customerName: e.target.value }))
                        }
                        className="rounded-md border bg-white px-3 py-2 text-sm"
                        placeholder="例如：王小明 / ABC Co."
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">訂單備註</label>
                      <textarea
                        value={orderDraft.notes}
                        onChange={(e) => setOrderDraft((prev) => ({ ...prev, notes: e.target.value }))}
                        className="min-h-28 rounded-md border bg-white px-3 py-2 text-sm"
                        placeholder="帶入對話摘要、需求、報價重點"
                      />
                    </div>
                    {orderDraft.items.length > 0 && (
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">OrderForm 品項</label>
                        <div className="rounded-md border bg-white p-3 text-sm space-y-3">
                          {orderDraft.items.map((item, index) => (
                            <div key={`${index}-${item.name}`} className="grid md:grid-cols-12 gap-2 items-start">
                              <input
                                value={item.name}
                                onChange={(e) => updateDraftItem(index, { name: e.target.value })}
                                className="md:col-span-5 rounded border px-3 py-2 text-sm"
                                placeholder="品項名稱"
                              />
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateDraftItem(index, { quantity: Number(e.target.value) || 1 })}
                                className="md:col-span-2 rounded border px-3 py-2 text-sm"
                                placeholder="數量"
                              />
                              <input
                                value={item.unit}
                                onChange={(e) => updateDraftItem(index, { unit: e.target.value })}
                                className="md:col-span-2 rounded border px-3 py-2 text-sm"
                                placeholder="單位"
                              />
                              <input
                                type="number"
                                min="0"
                                value={item.unit_price}
                                onChange={(e) => updateDraftItem(index, { unit_price: Number(e.target.value) || 0 })}
                                className="md:col-span-2 rounded border px-3 py-2 text-sm"
                                placeholder="單價"
                              />
                              <button
                                type="button"
                                onClick={() => removeDraftItem(index)}
                                className="md:col-span-1 rounded border px-2 py-2 text-xs hover:bg-neutral-50"
                              >
                                刪除
                              </button>
                              {item.hint ? (
                                <div className="md:col-span-12 text-xs text-neutral-500">{item.hint}</div>
                              ) : null}
                            </div>
                          ))}
                          <button type="button" onClick={addDraftItem} className="rounded border px-3 py-2 text-xs hover:bg-neutral-50">
                            新增品項
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="grid md:grid-cols-3 gap-3">
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">運費</label>
                        <input
                          type="number"
                          min="0"
                          value={orderDraft.shipping}
                          onChange={(e) => setOrderDraft((prev) => ({ ...prev, shipping: Number(e.target.value) || 0 }))}
                          className="rounded-md border bg-white px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">稅額</label>
                        <input
                          type="number"
                          min="0"
                          value={orderDraft.tax}
                          onChange={(e) => setOrderDraft((prev) => ({ ...prev, tax: Number(e.target.value) || 0 }))}
                          className="rounded-md border bg-white px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">總計</label>
                        <div className="rounded-md border bg-white px-3 py-2 text-sm">{orderTotal.toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-neutral-500">
                        可先存成 `draft`，或直接確認建立 `pending` 訂單。
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowOrderDraft(false)}>
                          取消
                        </Button>
                        <Button type="button" size="sm" onClick={createOrderDraft} disabled={submittingOrder}>
                          建立草稿
                        </Button>
                        <Button type="button" size="sm" onClick={createPendingOrder} disabled={submittingOrder || orderTotal <= 0}>
                          確認建單
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {showSupportTicket && (
                  <div className="grid gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
                    <div className="grid md:grid-cols-3 gap-3">
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">分類</label>
                        <select
                          value={supportTicket.category}
                          onChange={(e) =>
                            setSupportTicket((prev) => ({ ...prev, category: e.target.value }))
                          }
                          className="rounded-md border bg-white px-3 py-2 text-sm"
                        >
                          <option value="sales_handoff">sales_handoff</option>
                          <option value="quotation">quotation</option>
                          <option value="payment">payment</option>
                          <option value="general">general</option>
                        </select>
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">優先度</label>
                        <select
                          value={supportTicket.priority}
                          onChange={(e) =>
                            setSupportTicket((prev) => ({ ...prev, priority: e.target.value }))
                          }
                          className="rounded-md border bg-white px-3 py-2 text-sm"
                        >
                          <option value="low">low</option>
                          <option value="normal">normal</option>
                          <option value="high">high</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <Link href="/admin/support" className="text-xs text-neutral-500 hover:underline">
                          Admin 於 /admin/support 接手
                        </Link>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">工單主旨</label>
                      <input
                        value={supportTicket.subject}
                        onChange={(e) =>
                          setSupportTicket((prev) => ({ ...prev, subject: e.target.value }))
                        }
                        className="rounded-md border bg-white px-3 py-2 text-sm"
                        placeholder="例如：客戶需要人工報價與交期確認"
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">工單內容</label>
                      <textarea
                        value={supportTicket.body}
                        onChange={(e) =>
                          setSupportTicket((prev) => ({ ...prev, body: e.target.value }))
                        }
                        className="min-h-32 rounded-md border bg-white px-3 py-2 text-sm"
                        placeholder={SUPPORT_BODY_HINT}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowSupportTicket(false)}>
                        取消
                      </Button>
                      <Button type="button" size="sm" onClick={createSupportTicket} disabled={submittingTicket}>
                        建立工單
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="輸入訊息..."
                disabled={sending}
                className="flex-1 px-4 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
              <Button onClick={send} disabled={sending || !input.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>

            {usage && (
              <div className="text-xs text-neutral-500 flex items-center gap-2">
                <span>
                  本月用量：{usage.used_credits.toLocaleString()} / {(usage.plan_credits + usage.topup_credits).toLocaleString()} credits
                </span>
                <div className="flex-1 h-1 bg-neutral-200 rounded">
                  <div
                    className={`h-full rounded ${
                      usagePct > 90 ? "bg-red-500" : usagePct > 70 ? "bg-yellow-500" : "bg-green-500"
                    }`}
                    style={{ width: `${usagePct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
