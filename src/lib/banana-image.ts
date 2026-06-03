import { ApiError } from "@/lib/api";

export const BANANA_2_MODEL = "gemini-3.1-flash-image-preview";
export const BANANA_PRO_MODEL = "gemini-3-pro-image-preview";

type BananaImageParams = {
  prompt: string;
  aspectRatio?: string | null;
  referenceImages?: string[];
  count?: number;
  preferPro?: boolean;
};

export type BananaGeneratedImage = {
  url: string;
  model: string;
  mimeType: string;
};

const SUPPORTED_SIZES = new Set(["512", "1K", "2K", "4K"]);

function apiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

function endpoint() {
  const value = process.env.GEMINI_API_ENDPOINT || "https://generativelanguage.googleapis.com/v1beta";
  let result = value;
  while (result.endsWith("/")) result = result.slice(0, -1);
  return result;
}

function normalizeAspectRatio(value?: string | null) {
  const allowed = new Set(["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]);
  return value && allowed.has(value) ? value : "1:1";
}

function imageSize() {
  const size = process.env.BANANA_IMAGE_SIZE || "2K";
  return SUPPORTED_SIZES.has(size) ? size : "2K";
}

function outputFormat() {
  return process.env.BANANA_IMAGE_OUTPUT_FORMAT === "jpg" ? "jpg" : "png";
}

function modelFor(params: BananaImageParams) {
  if (params.preferPro || (params.referenceImages?.length ?? 0) > 0) return BANANA_PRO_MODEL;
  const configured = process.env.BANANA_IMAGE_MODEL || "nano-banana-2";
  return configured === "nano-banana-pro" || configured === BANANA_PRO_MODEL
    ? BANANA_PRO_MODEL
    : BANANA_2_MODEL;
}

async function imageToInlineData(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError("UPSTREAM_ERROR", `Reference image fetch failed: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "image/png";
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    mimeType: contentType,
    data: bytes.toString("base64"),
  };
}

function extractImages(data: unknown, model: string): BananaGeneratedImage[] {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  const result: BananaGeneratedImage[] = [];

  for (const candidate of candidates) {
    const candidateRecord = candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>) : {};
    const content = candidateRecord.content && typeof candidateRecord.content === "object"
      ? (candidateRecord.content as Record<string, unknown>)
      : {};
    const parts = Array.isArray(content.parts) ? content.parts : [];
    for (const part of parts) {
      const partRecord = part && typeof part === "object" ? (part as Record<string, unknown>) : {};
      const inlineData = (partRecord.inlineData || partRecord.inline_data) as Record<string, unknown> | undefined;
      const base64 = inlineData && typeof inlineData.data === "string" ? inlineData.data : "";
      if (!base64) continue;
      const mimeType =
        typeof inlineData?.mimeType === "string"
          ? inlineData.mimeType
          : typeof inlineData?.mime_type === "string"
            ? inlineData.mime_type
            : "image/png";
      result.push({
        url: `data:${mimeType};base64,${base64}`,
        model,
        mimeType,
      });
    }
  }

  return result;
}

export async function generateBananaImages(params: BananaImageParams): Promise<BananaGeneratedImage[]> {
  const key = apiKey();
  if (!key) {
    throw new ApiError(
      "UPSTREAM_ERROR",
      "Banana image provider is not configured. Set GEMINI_API_KEY / GOOGLE_GEMINI_API_KEY / GOOGLE_API_KEY.",
    );
  }

  const model = modelFor(params);
  const count = Math.min(Math.max(Number(params.count) || 1, 1), 4);
  const aspectRatio = normalizeAspectRatio(params.aspectRatio);
  const references = (params.referenceImages ?? []).filter(Boolean).slice(0, model === BANANA_PRO_MODEL ? 8 : 14);
  const generated: BananaGeneratedImage[] = [];

  for (let index = 0; index < count; index += 1) {
    const parts: Array<Record<string, unknown>> = [{ text: params.prompt }];
    for (const reference of references) {
      parts.push({ inlineData: await imageToInlineData(reference) });
    }

    const body = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio,
          imageSize: imageSize(),
        },
      },
    };

    const response = await fetch(`${endpoint()}/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError("UPSTREAM_ERROR", `Banana image generation failed: ${response.status}`, {
        provider: "google-native-image",
        model,
        response: data,
      });
    }

    generated.push(...extractImages(data, model));
  }

  if (generated.length === 0) {
    throw new ApiError("UPSTREAM_ERROR", "Banana image generation returned no image parts", {
      provider: "google-native-image",
      model,
    });
  }

  return generated.map((image) => ({
    ...image,
    mimeType: outputFormat() === "jpg" ? "image/jpeg" : image.mimeType,
  }));
}

