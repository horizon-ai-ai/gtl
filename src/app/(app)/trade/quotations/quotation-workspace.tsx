"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type InquiryRow = {
  id: string;
  product_name: string;
  buyer_name: string;
  quantity: number;
  quoted_quantity: number | null;
  target_price: number | null;
  quoted_price: number | null;
  status: string;
  quotation_notes: string;
  quotation_version: number;
};

export function QuotationWorkspace({ initialInquiries }: { initialInquiries: InquiryRow[] }) {
  const [inquiries, setInquiries] = useState(initialInquiries);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function generateDraft(id: string) {
    setWorkingId(id);
    setStatus(null);
    const res = await fetch(`/api/trade/inquiries/${id}/quotation-draft`, { method: "POST" });
    const json = await res.json();
    setWorkingId(null);
    if (!res.ok) {
      setStatus(json.error?.message ?? "產生 quotation 草稿失敗");
      return;
    }
    setInquiries((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quotation_notes: json.data.quotation_notes ?? "" } : item)),
    );
  }

  async function sendQuotation(item: InquiryRow) {
    setWorkingId(item.id);
    setStatus(null);
    const res = await fetch(`/api/trade/inquiries/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "replied",
        quoted_price: item.quoted_price ?? item.target_price ?? 0,
        quoted_quantity: item.quoted_quantity ?? item.quantity,
        quotation_notes: item.quotation_notes,
      }),
    });
    const json = await res.json();
    setWorkingId(null);
    if (!res.ok) {
      setStatus(json.error?.message ?? "發送 quotation 失敗");
      return;
    }
    setStatus("Quotation 已寄送給 buyer");
    setInquiries((prev) =>
      prev.map((row) =>
        row.id === item.id
          ? {
              ...row,
              status: json.data.status,
              quotation_version: json.data.quotation_version,
            }
          : row,
      ),
    );
  }

  return (
    <div className="space-y-4 p-6">
      {status ? <div className="rounded-md border bg-neutral-50 px-4 py-3 text-sm">{status}</div> : null}
      {inquiries.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-sm text-neutral-500">目前沒有待處理的詢價。</div>
      ) : (
        inquiries.map((item) => (
          <div key={item.id} className="space-y-4 rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{item.product_name}</div>
                <div className="mt-1 text-sm text-neutral-500">
                  Buyer：{item.buyer_name} · 需求數量 {item.quantity} · 目前狀態 {item.status}
                </div>
              </div>
              <div className="text-sm text-neutral-500">v{item.quotation_version}</div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium">報價數量</span>
                <input
                  value={item.quoted_quantity ?? item.quantity}
                  onChange={(e) =>
                    setInquiries((prev) =>
                      prev.map((row) =>
                        row.id === item.id ? { ...row, quoted_quantity: Number(e.target.value || "0") } : row,
                      ),
                    )
                  }
                  className="w-full rounded border px-3 py-2"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium">FOB USD 報價</span>
                <input
                  value={item.quoted_price ?? item.target_price ?? 0}
                  onChange={(e) =>
                    setInquiries((prev) =>
                      prev.map((row) =>
                        row.id === item.id ? { ...row, quoted_price: Number(e.target.value || "0") } : row,
                      ),
                    )
                  }
                  className="w-full rounded border px-3 py-2"
                />
              </label>
            </div>
            <label className="block space-y-2 text-sm">
              <span className="font-medium">Quotation 內容</span>
              <textarea
                value={item.quotation_notes}
                onChange={(e) =>
                  setInquiries((prev) =>
                    prev.map((row) => (row.id === item.id ? { ...row, quotation_notes: e.target.value } : row)),
                  )
                }
                className="min-h-40 w-full rounded border px-3 py-2"
              />
            </label>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => void generateDraft(item.id)} disabled={workingId === item.id}>
                {workingId === item.id ? "生成中..." : "AI 生成制式 Quotation"}
              </Button>
              <Button type="button" onClick={() => void sendQuotation(item)} disabled={workingId === item.id}>
                {workingId === item.id ? "送出中..." : "送出 Quotation"}
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
