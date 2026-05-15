import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok, ApiError } from "@/lib/api";
import { saveTradeFiles } from "@/lib/trade-assets";
import { assertVerifiedTradeProfile } from "@/lib/trade";

export const runtime = "nodejs";

const schema = z.object({
  images: z
    .array(
      z.string().refine((value) => value.startsWith("/") || /^https?:\/\//.test(value), {
        message: "Image must be an absolute URL or local asset path",
      }),
    )
    .min(1)
    .max(10),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertVerifiedTradeProfile(session.user.id);

    const product = await prisma.product.findFirst({
      where: { id: params.id, seller_id: session.user.id, deleted_at: null },
    });
    if (!product) throw new ApiError("RESOURCE_NOT_FOUND", "Product not found");

    let incomingImages: string[] = [];
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const files = formData.getAll("files").filter((value): value is File => value instanceof File);
      if (files.length === 0) {
        throw new ApiError("VALIDATION_ERROR", "No files uploaded");
      }

      incomingImages = await saveTradeFiles(files, session.user.id, "products");
    } else {
      const body = schema.parse(await req.json());
      incomingImages = body.images;
    }

    const images = Array.from(new Set([...(product.images ?? []), ...incomingImages])).slice(0, 10);
    const updated = await prisma.product.update({
      where: { id: params.id },
      data: { images },
    });
    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}
