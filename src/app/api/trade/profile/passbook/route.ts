import { auth } from "@/lib/auth";
import { fail, handleError, ok, ApiError } from "@/lib/api";
import { saveTradeFiles } from "@/lib/trade-assets";
import { assertSellerTradeAccess } from "@/lib/trade";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertSellerTradeAccess(session.user.id);

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new ApiError("VALIDATION_ERROR", "Expected multipart/form-data");
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new ApiError("VALIDATION_ERROR", "No file uploaded");
    }

    const [url] = await saveTradeFiles([file], session.user.id, "profile");
    return ok({ url });
  } catch (err) {
    return handleError(err);
  }
}
