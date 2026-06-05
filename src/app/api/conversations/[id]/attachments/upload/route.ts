import { NextRequest } from "next/server";

import { handleError, ok, ApiError } from "@/lib/api";
import { getOwnedConversation, requireSessionUser } from "@/lib/conversation/api";
import { saveSiteFiles } from "@/lib/site-assets";

function attachmentType(file: File): "image" | "video" | "file" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

function isSupportedConversationFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  if (file.type === "application/pdf") return true;
  if (file.type === "application/postscript") return true;
  if (file.type === "application/illustrator") return true;
  if (file.type === "application/vnd.adobe.illustrator") return true;
  if (file.type === "image/vnd.adobe.photoshop") return true;
  const name = file.name.toLowerCase();
  return [".ai", ".eps", ".pdf", ".psd", ".svg"].some((extension) => name.endsWith(extension));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSessionUser();
    await getOwnedConversation(params.id, user.id);

    const formData = await req.formData();
    const files = [
      ...formData.getAll("file"),
      ...formData.getAll("files"),
    ].filter((value): value is File => value instanceof File && value.size > 0);
    if (files.length === 0) throw new ApiError("VALIDATION_ERROR", "No files uploaded");

    const keptFiles = files
      .filter(isSupportedConversationFile)
      .slice(0, 8);
    if (keptFiles.length === 0) {
      throw new ApiError("VALIDATION_ERROR", "支援圖片、PDF、AI/EPS、PSD、SVG 檔案");
    }

    const assetKind = typeof formData.get("assetKind") === "string" ? String(formData.get("assetKind")) : null;
    const field = typeof formData.get("field") === "string" ? String(formData.get("field")) : null;
    const urls = await saveSiteFiles(keptFiles, user.id, "conversation");
    const attachments = urls.map((url, index) => ({
      url,
      type: attachmentType(keptFiles[index]),
      originalName: keptFiles[index]?.name || null,
      mimeType: keptFiles[index]?.type || null,
      assetKind,
      field,
    }));

    return ok({ attachments });
  } catch (err) {
    return handleError(err);
  }
}
