-- TradeProfile: 賣家身份檔案的公司申請資料（JSON）
ALTER TABLE "TradeProfile" ADD COLUMN IF NOT EXISTS "company_info" JSONB;

-- CompanyProfile: 公司註冊新增欄位
ALTER TABLE "CompanyProfile" ADD COLUMN IF NOT EXISTS "name_en" TEXT;
ALTER TABLE "CompanyProfile" ADD COLUMN IF NOT EXISTS "contact_email" TEXT;
ALTER TABLE "CompanyProfile" ADD COLUMN IF NOT EXISTS "referral_sources" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CompanyProfile" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "CompanyProfile" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
