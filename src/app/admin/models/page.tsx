import { revalidatePath } from "next/cache";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import {
  clearDefaultAiModelSettings,
  createAiModelSetting,
  type AiModelPurpose,
  listAllAiModelSettings,
  normalizeModelBaseUrl,
  updateAiModelSetting,
} from "@/lib/ai-model-settings";

const MODEL_PURPOSES: Array<{ value: AiModelPurpose; label: string; help: string }> = [
  { value: "conversation", label: "一般聊天", help: "前台對話模型選單" },
  { value: "marketing_router", label: "Mark 判斷", help: "判斷是否需要搜尋" },
  { value: "marketing_search", label: "Mark 搜尋", help: "一般搜尋與參考資料" },
  { value: "marketing_deep", label: "Mark 深度搜尋", help: "深度調研模型" },
];

function parsePurpose(value: FormDataEntryValue | null): AiModelPurpose {
  const text = String(value ?? "conversation");
  return MODEL_PURPOSES.some((item) => item.value === text) ? (text as AiModelPurpose) : "conversation";
}

function purposeLabel(value: string) {
  return MODEL_PURPOSES.find((item) => item.value === value)?.label ?? value;
}

async function createModelSetting(formData: FormData) {
  "use server";
  await requireAdmin();

  const label = String(formData.get("label") ?? "").trim();
  const modelId = String(formData.get("model_id") ?? "").trim();
  const purpose = parsePurpose(formData.get("purpose"));
  const baseUrl = normalizeModelBaseUrl(String(formData.get("base_url") ?? ""));
  const apiKey = String(formData.get("api_key") ?? "").trim();
  const provider = String(formData.get("provider") ?? "openai-compatible").trim() || "openai-compatible";
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  const creditMultiplier = Number(formData.get("credit_multiplier") ?? 5);
  const isDefault = formData.get("is_default") === "on";
  const notes = String(formData.get("notes") ?? "").trim();

  if (!label || !modelId || !baseUrl || !apiKey) return;

  if (isDefault) {
    await clearDefaultAiModelSettings(purpose);
  }
  await createAiModelSetting({
    label,
    modelId,
    purpose,
    provider,
    baseUrl,
    apiKey,
    creditMultiplier: Number.isFinite(creditMultiplier) && creditMultiplier > 0 ? creditMultiplier : 5,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    isDefault,
    notes: notes || null,
  });

  revalidatePath("/admin/models");
}

async function updateModelSetting(formData: FormData) {
  "use server";
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const modelId = String(formData.get("model_id") ?? "").trim();
  const purpose = parsePurpose(formData.get("purpose"));
  const baseUrl = normalizeModelBaseUrl(String(formData.get("base_url") ?? ""));
  const apiKey = String(formData.get("api_key") ?? "").trim();
  const provider = String(formData.get("provider") ?? "openai-compatible").trim() || "openai-compatible";
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  const creditMultiplier = Number(formData.get("credit_multiplier") ?? 5);
  const active = formData.get("active") === "on";
  const isDefault = formData.get("is_default") === "on";
  const notes = String(formData.get("notes") ?? "").trim();

  if (!id || !label || !modelId || !baseUrl) return;

  if (isDefault) {
    await clearDefaultAiModelSettings(purpose, id);
  }
  await updateAiModelSetting({
    id,
    label,
    modelId,
    purpose,
    provider,
    baseUrl,
    apiKey: apiKey || undefined,
    creditMultiplier: Number.isFinite(creditMultiplier) && creditMultiplier > 0 ? creditMultiplier : 5,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    active,
    isDefault,
    notes: notes || null,
  });

  revalidatePath("/admin/models");
}

export default async function AdminModelsPage() {
  await requireAdmin();
  const models = await listAllAiModelSettings();

  return (
    <div className="space-y-6 p-8">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">Model routing</div>
        <h1 className="mt-2 text-2xl font-semibold">AI 模型設定</h1>
        <p className="mt-1 text-sm text-ink-500">
          新增 OpenAI-compatible 端點，前台聊天與 Mark 調研模型都可在這裡設定；Mark 沒設定模型時會跳過搜尋。
        </p>
      </div>

      <Card className="border-line1 bg-surface p-5 shadow-sm">
        <div className="text-sm font-semibold text-ink-900">新增模型</div>
        <form action={createModelSetting} className="mt-4 grid gap-3 lg:grid-cols-6">
          <Field name="label" label="顯示名稱" placeholder="Claude Opus 4.7" />
          <Field name="model_id" label="Model" placeholder="claude-opus-4-7" />
          <PurposeSelect />
          <Field name="provider" label="Provider" placeholder="openai-compatible" defaultValue="openai-compatible" />
          <Field name="base_url" label="Base URL" placeholder="https://api.openai.com/v1" span="lg:col-span-2" />
          <Field name="api_key" label="API Key" placeholder="sk-..." type="password" />
          <Field name="credit_multiplier" label="點數倍率" type="number" defaultValue="5" />
          <Field name="sort_order" label="排序" type="number" defaultValue="0" />
          <label className="flex items-center gap-2 rounded-md border border-line1 bg-sunken px-3 py-2 text-sm text-ink-700">
            <input type="checkbox" name="is_default" />
            設為預設
          </label>
          <Field name="notes" label="備註" placeholder="用途、限制、供應商帳號" span="lg:col-span-3" />
          <button type="submit" className="rounded-md bg-ink-900 px-4 py-2 text-sm font-medium text-canvas lg:col-span-6">
            新增模型
          </button>
        </form>
      </Card>

      <div className="grid gap-4">
        {models.length === 0 ? (
          <Card className="border-dashed p-6 text-sm text-ink-500">
            尚未建立模型設定。前台不會使用 .env 預設模型，請先新增至少一個「一般聊天」模型。
          </Card>
        ) : (
          models.map((model) => (
            <Card key={model.id} className="border-line1 bg-surface p-5 shadow-sm">
              <form action={updateModelSetting} className="grid gap-3 lg:grid-cols-6">
                <input type="hidden" name="id" value={model.id} />
                <div className="lg:col-span-6 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-ink-900">{model.label}</div>
                    <div className="mt-1 text-xs text-ink-500">
                      {model.provider} · {model.model_id} · key {model.api_key_hint ?? "—"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-sunken px-2.5 py-1 text-ink-600">{purposeLabel(model.purpose)}</span>
                    <span className={`rounded-full px-2.5 py-1 ${model.active ? "bg-brand-50 text-brand-600" : "bg-sunken text-ink-400"}`}>
                      {model.active ? "啟用" : "停用"}
                    </span>
                    {model.is_default ? <span className="rounded-full bg-accent-50 px-2.5 py-1 text-accent-600">預設</span> : null}
                  </div>
                </div>
                <Field name="label" label="顯示名稱" defaultValue={model.label} />
                <Field name="model_id" label="Model" defaultValue={model.model_id} />
                <PurposeSelect defaultValue={model.purpose as AiModelPurpose} />
                <Field name="provider" label="Provider" defaultValue={model.provider} />
                <Field name="base_url" label="Base URL" defaultValue={model.base_url} span="lg:col-span-2" />
                <Field name="api_key" label="換 API Key" placeholder="留空代表不更換" type="password" />
                <Field name="credit_multiplier" label="點數倍率" type="number" defaultValue={String(model.credit_multiplier)} />
                <Field name="sort_order" label="排序" type="number" defaultValue={String(model.sort_order)} />
                <label className="flex items-center gap-2 rounded-md border border-line1 bg-sunken px-3 py-2 text-sm text-ink-700">
                  <input type="checkbox" name="active" defaultChecked={model.active} />
                  啟用
                </label>
                <label className="flex items-center gap-2 rounded-md border border-line1 bg-sunken px-3 py-2 text-sm text-ink-700">
                  <input type="checkbox" name="is_default" defaultChecked={model.is_default} />
                  預設
                </label>
                <Field name="notes" label="備註" defaultValue={model.notes ?? ""} span="lg:col-span-2" />
                <button type="submit" className="rounded-md border border-line1 bg-surface px-4 py-2 text-sm font-medium text-ink-700 hover:bg-hover lg:col-span-6">
                  儲存設定
                </button>
              </form>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function PurposeSelect({ defaultValue = "conversation" }: { defaultValue?: AiModelPurpose }) {
  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-ink-500">用途</span>
      <select
        name="purpose"
        defaultValue={defaultValue}
        className="h-10 w-full rounded-md border border-line1 bg-sunken px-3 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:shadow-[var(--shadow-focus)]"
      >
        {MODEL_PURPOSES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({
  name,
  label,
  placeholder,
  defaultValue,
  type = "text",
  span,
}: {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  type?: string;
  span?: string;
}) {
  return (
    <label className={span ?? ""}>
      <span className="mb-1 block text-xs font-medium text-ink-500">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="h-10 w-full rounded-md border border-line1 bg-sunken px-3 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:shadow-[var(--shadow-focus)]"
      />
    </label>
  );
}
