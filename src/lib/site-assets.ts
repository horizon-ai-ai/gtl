import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export async function saveSiteFiles(files: File[], userId: string, bucket = "hero") {
  const uploadDir = path.join(process.cwd(), "public", "uploads", "sites", userId, bucket);
  await mkdir(uploadDir, { recursive: true });

  return Promise.all(
    files.slice(0, 8).map(async (file) => {
      const ext = path.extname(file.name || "").slice(0, 10) || ".bin";
      const safeExt = /^[a-zA-Z0-9.]+$/.test(ext) ? ext : ".bin";
      const filename = `${Date.now()}-${randomUUID()}${safeExt}`;
      const fullPath = path.join(uploadDir, filename);
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(fullPath, buffer);
      return toSiteAssetUrl(`/uploads/sites/${userId}/${bucket}/${filename}`);
    }),
  );
}

export function toSiteAssetUrl(pathname: string) {
  const base = process.env.ASSET_BASE_URL?.replace(/\/$/, "");
  return base ? `${base}${pathname}` : pathname;
}
