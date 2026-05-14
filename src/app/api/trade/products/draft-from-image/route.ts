import { auth } from "@/lib/auth";
import { fail, handleError, ok, ApiError } from "@/lib/api";
import { assertTradeModuleAccess } from "@/lib/trade";
import { prisma } from "@/lib/db";
import { saveTradeFiles } from "@/lib/trade-assets";
import { createTradeProductDraftFromImages } from "@/lib/trade-vision";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertTradeModuleAccess(session.user.id);

    const tradeProfile = await prisma.tradeProfile.findUnique({
      where: { user_id: session.user.id },
    });
    if (!tradeProfile || (tradeProfile.role !== "seller" && tradeProfile.role !== "both")) {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "Seller profile required");
    }

    const formData = await req.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);
    if (files.length === 0) {
      throw new ApiError("VALIDATION_ERROR", "No files uploaded");
    }

    const keptFiles = files
      .filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name))
      .slice(0, 3);

    if (keptFiles.length === 0) {
      throw new ApiError("VALIDATION_ERROR", "Only image files are supported");
    }

    const imageUrls = await saveTradeFiles(keptFiles, session.user.id, "drafts");
    const draft = await createTradeProductDraftFromImages(keptFiles);

    return ok({
      ...draft,
      image_urls: imageUrls,
    });
  } catch (err) {
    return handleError(err);
  }
}
