import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { listTradeLifecycleRules, updateTradeLifecycleRule } from "@/lib/trade-lifecycle";
import { Card } from "@/components/ui/card";

async function saveRule(formData: FormData) {
  "use server";
  await requireAdmin();
  const stageKey = String(formData.get("stage_key") ?? "");
  const dayOffset = Number(formData.get("day_offset") ?? "0");
  const active = formData.get("active") === "on";
  if (!stageKey || !Number.isFinite(dayOffset)) return;
  await updateTradeLifecycleRule(stageKey, dayOffset, active);
  revalidatePath("/admin/trade/lifecycle");
  revalidatePath("/trade/orders");
}

export default async function AdminTradeLifecyclePage() {
  await requireAdmin();
  const rules = await listTradeLifecycleRules();

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">訂單生命週期規則</h1>
        <p className="mt-1 text-sm text-neutral-500">
          以規則式設定 trade 訂單各節點的預估天數間隔，user portal 會依這裡顯示生命週期。
        </p>
      </div>

      <Card>
        <div className="divide-y">
          {rules.map((rule) => (
            <form key={rule.stage_key} action={saveRule} className="grid gap-3 p-4 md:grid-cols-[1.2fr,180px,120px,120px] md:items-center">
              <input type="hidden" name="stage_key" value={rule.stage_key} />
              <div>
                <div className="font-medium">{rule.label}</div>
                <div className="text-xs text-neutral-500">{rule.stage_key}</div>
              </div>
              <input
                name="day_offset"
                type="number"
                defaultValue={rule.day_offset}
                className="rounded border px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={rule.active} />
                啟用
              </label>
              <button type="submit" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
                儲存
              </button>
            </form>
          ))}
        </div>
      </Card>
    </div>
  );
}
