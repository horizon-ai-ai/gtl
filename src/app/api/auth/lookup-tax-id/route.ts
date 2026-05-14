import { NextRequest } from "next/server";
import { ok, fail, handleError } from "@/lib/api";
import { lookupTaxId, validateTaxIdFormat } from "@/lib/gcis";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return fail("VALIDATION_ERROR", "Missing id");
    if (!validateTaxIdFormat(id)) return fail("VALIDATION_ERROR", "Invalid format");
    const result = await lookupTaxId(id);
    return ok(result ?? { tax_id: id, source: "not_found" });
  } catch (err) {
    return handleError(err);
  }
}
