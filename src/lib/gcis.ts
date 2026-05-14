// 統編查詢 — 財政部營業登記資料公示系統
// See docs/01_spec_auth.md §3.2

export type CompanyLookup = {
  tax_id: string;
  name: string;
  address: string;
  owner_name?: string;
  business_items?: string[];
  source: "gcis" | "third_party" | "not_found";
};

const TAX_ID_REGEX = /^\d{8}$/;

export function validateTaxIdFormat(taxId: string): boolean {
  if (!TAX_ID_REGEX.test(taxId)) return false;
  // 統編校驗碼（簡化版 — 標準演算法）
  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  const digits = taxId.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const product = digits[i] * weights[i];
    sum += Math.floor(product / 10) + (product % 10);
  }
  if (sum % 10 === 0) return true;
  // 第 7 位為 7 時容許 +1
  if (digits[6] === 7 && (sum + 1) % 10 === 0) return true;
  return false;
}

export async function lookupTaxId(taxId: string): Promise<CompanyLookup | null> {
  if (!validateTaxIdFormat(taxId)) return null;

  const base = process.env.GCIS_API_BASE_URL ?? "https://data.gcis.nat.gov.tw/od/data/api";
  try {
    const url = `${base}/5F64D864-61CB-4D0D-8AD9-492047CC1EA6?$format=json&$filter=Business_Accounting_NO eq ${taxId}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`GCIS ${res.status}`);
    const rows = (await res.json()) as Array<Record<string, string>>;
    if (!rows?.length) return { tax_id: taxId, name: "", address: "", source: "not_found" };
    const row = rows[0];
    return {
      tax_id: taxId,
      name: row.Company_Name ?? row.Business_Name ?? "",
      address: row.Company_Location ?? row.Business_Address ?? "",
      owner_name: row.Responsible_Name,
      business_items: (row.Business_Item ?? "").split(/[、,;]/).filter(Boolean),
      source: "gcis",
    };
  } catch (err) {
    console.error("[GCIS] lookup failed", err);
    return null;
  }
}
