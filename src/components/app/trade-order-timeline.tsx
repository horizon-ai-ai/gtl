"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, FileDown, HelpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TradeStage } from "@/lib/trade-order-stages";

/**
 * Trade order timeline header card — matches the business-owner mock
 * (Image 1 of the 2026/06/07 attachment).
 *
 * Renders the case-level summary (case no, supplier, ETA), the action
 * row (PI / PL / CI / 詢問客服), and the 9-step horizontal stepper.
 * If `canAdvance` is true and there's an active advanceable stage, a
 * confirm button shows under the active node and POSTs to the
 * /api/orders/:id/lifecycle endpoint.
 */

type Props = {
  orderId: string;
  caseNo: string;
  supplier: string;
  etaDisplay: string;
  stages: TradeStage[];
  /** True for admin or order owner; controls whether the advance button shows. */
  canAdvance: boolean;
  inquiryId?: string | null;
  onAdvanced?: () => void;
};

export function TradeOrderTimeline({
  orderId,
  caseNo,
  supplier,
  etaDisplay,
  stages,
  canAdvance,
  inquiryId,
  onAdvanced,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const activeIdx = stages.findIndex((s) => s.state === "active");
  const activeStage = activeIdx >= 0 ? stages[activeIdx] : null;
  const canAdvanceNow = canAdvance && activeStage?.advanceable;

  const piUrl = inquiryId ? `/api/trade/inquiries/${inquiryId}/quotation.pdf` : null;

  async function advance() {
    if (!activeStage) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_key: activeStage.key }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error?.message ?? "推進失敗");
      onAdvanced?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "推進失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      {/* Case header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4">
        <div className="text-sm text-stone-700">
          貿易案件：<span className="font-mono font-medium">{caseNo}</span>
          <span className="mx-2 text-stone-300">/</span>
          出貨廠商 <span className="font-medium">{supplier}</span>
          <span className="mx-2 text-stone-300">/</span>
          預計 <span className="font-medium">{etaDisplay}</span> 到貨
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {piUrl ? (
            <a href={piUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline">
                <FileDown className="h-3.5 w-3.5" /> PI 單
              </Button>
            </a>
          ) : (
            <Button size="sm" variant="outline" disabled title="尚未產出">
              <FileDown className="h-3.5 w-3.5" /> PI 單
            </Button>
          )}
          <Button size="sm" variant="outline" disabled title="尚未上傳">
            <FileDown className="h-3.5 w-3.5" /> PL 包裝清單
          </Button>
          <Button size="sm" variant="outline" disabled title="尚未上傳">
            <FileDown className="h-3.5 w-3.5" /> CI 單
          </Button>
          <Link href={`/orders/${orderId}#chat`}>
            <Button size="sm" variant="outline">
              <HelpCircle className="h-3.5 w-3.5" /> 詢問客服
            </Button>
          </Link>
        </div>
      </div>

      {/* Stepper */}
      <div className="mt-6 overflow-x-auto">
        <div className="relative flex min-w-[760px] items-start justify-between gap-2 px-2 pb-2">
          {/* Connector line behind nodes */}
          <div className="pointer-events-none absolute left-2 right-2 top-3 -z-0 h-px bg-stone-200" />
          <div
            className="pointer-events-none absolute left-2 top-3 -z-0 h-px bg-stone-700 transition-all"
            style={{
              width: `calc(${(Math.max(0, activeIdx) / Math.max(1, stages.length - 1)) * 100}% )`,
            }}
          />

          {stages.map((stage, idx) => {
            const node =
              stage.state === "done" ? (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-white">
                  <Check className="h-3 w-3" />
                </div>
              ) : stage.state === "active" ? (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white border-2 border-stone-900">
                  <span className="block h-2 w-2 rounded-full bg-stone-900" />
                </div>
              ) : (
                <div className="h-6 w-6 rounded-full border-2 border-stone-300 bg-white" />
              );
            return (
              <div
                key={stage.key}
                className="relative z-10 flex flex-1 flex-col items-center text-center"
              >
                {node}
                <div
                  className={`mt-2 text-[11px] leading-tight ${
                    stage.state === "pending" ? "text-stone-400" : "text-stone-800"
                  } ${stage.state === "active" ? "font-medium" : ""}`}
                >
                  {stage.label}
                </div>
                {idx === 2 && stage.state === "done" ? (
                  <div className="mt-1 text-[10px] leading-tight text-stone-500">
                    成立者 SHINKA
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Advance CTA — sits under the active node */}
      {canAdvanceNow ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          <Button
            size="sm"
            onClick={advance}
            disabled={busy}
            className="bg-g3-brand text-white border-0 hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            確認推進到「{activeStage.label}」完成
          </Button>
          {err ? <div className="text-xs text-err-500">{err}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
