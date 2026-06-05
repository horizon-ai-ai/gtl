export type CustomerInputRecord = {
  text: string;
  createdAt?: string;
};

export function valueToRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isDeliveryStatusSummary(value: unknown) {
  const text = textValue(value);
  if (!text) return false;

  const isBananaDone =
    text.includes("已用") &&
    text.includes("Banana") &&
    text.includes("產生第") &&
    text.includes("版圖像");
  const isImageDeliveryHint =
    text.includes("你可以直接看圖") &&
    text.includes("調整字體") &&
    text.includes("品牌感");
  const isGenerationQueued =
    text.includes("已建立生成任務") &&
    text.includes("準備使用 Banana");

  return isBananaDone || isImageDeliveryHint || isGenerationQueued;
}

export function cleanTaskSummary(value: unknown) {
  const text = textValue(value);
  if (!text || isDeliveryStatusSummary(text)) return "";
  return text;
}

export function collectCustomerInputs(value: unknown): CustomerInputRecord[] {
  const record = valueToRecord(value);
  const inputs = record.customerInputs;
  if (!Array.isArray(inputs)) return [];

  return inputs
    .map((item) => {
      if (typeof item === "string") return { text: item };
      const itemRecord = valueToRecord(item);
      const text = textValue(itemRecord.text);
      if (!text) return null;
      return {
        text,
        createdAt: textValue(itemRecord.createdAt) || undefined,
      };
    })
    .filter((item): item is CustomerInputRecord => Boolean(item));
}

export function appendCustomerInput(value: unknown, text: string, createdAt = new Date().toISOString()) {
  const trimmed = text.trim();
  const base = valueToRecord(value);
  if (!trimmed) return base;

  const inputs = collectCustomerInputs(base);
  const last = inputs[inputs.length - 1];
  const nextInputs = last?.text === trimmed
    ? inputs
    : [...inputs, { text: trimmed, createdAt }].slice(-12);

  return {
    ...base,
    latestCustomerInput: trimmed,
    customerInputs: nextInputs,
  };
}

export function customerInputsText(value: unknown, limit = 6) {
  const inputs = collectCustomerInputs(value).slice(-limit);
  return inputs.map((item, index) => `${index + 1}. ${item.text}`).join("\n");
}
