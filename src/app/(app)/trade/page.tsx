"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Boxes,
  ClipboardList,
  Globe2,
  Package2,
  ScrollText,
  Search,
  ShieldCheck,
  Store,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { REFERRAL_OPTIONS } from "@/lib/company-options";

type TradeRole = "seller";

type TradeProfile = {
  role: TradeRole;
  description: string | null;
  product_categories: string[];
  target_markets: string[];
  budget_range: string | null;
  capacity: string | null;
  company_info?: Record<string, unknown> | null;
  verified?: boolean;
} | null;

type RegisteredCompany = {
  name: string;
  name_en: string | null;
  tax_id: string;
  address: string;
  industry: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website: string | null;
} | null;

type TradeAccess = {
  allowed: boolean;
  site_builder_allowed: boolean;
  seller_allowed: boolean;
  profile_exists: boolean;
  profile_verified: boolean;
  reason: "buyer_ready" | "seller_plan_locked" | "profile_missing" | "profile_pending_review" | "ready";
};

type TradeFilters = {
  q: string;
  category: string;
  hs_code: string;
};

type TradeCatalog = {
  categories: string[];
  hs_codes: string[];
};

type SellerSite = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  hs_code: string | null;
  category: string | null;
  images: string[];
  specs?: Record<string, unknown> | null;
  certifications?: string[];
  moq: number;
  unit: string;
  price_min: number | null;
  price_max: number | null;
  currency: string;
  origin_country: string | null;
  status: string;
  seller: {
    id: string;
    display_name: string | null;
    company: { name: string } | null;
  };
};

type ProductDraft = {
  suggested_name: string;
  suggested_category: string;
  suggested_description: string;
  suggested_hs_code: string | null;
  suggested_origin_country: string | null;
  suggested_unit: string;
  suggested_moq: number;
  suggested_certifications: string[];
  detected_attributes: Record<string, string>;
  confidence: number;
  image_urls: string[];
};

type Inquiry = {
  id: string;
  quantity: number;
  target_price: number | null;
  status: string;
  quoted_price: number | null;
  quoted_quantity: number | null;
  quotation_notes: string | null;
  quotation_version: number;
  quotation_history?: Array<{
    version: number;
    quoted_price: number | null;
    quoted_quantity: number | null;
    quotation_notes: string | null;
    status: string;
    updated_at: string;
  }> | null;
  quotation_pdf_url?: string | null;
  payment_terms: string | null;
  port_of_destination: string | null;
  expires_at: string;
  notes: string | null;
  created_at: string;
  product: { name: string };
  buyer: { id: string; email: string; display_name: string | null; company: { name: string } | null };
  seller: { email: string; display_name: string | null; company: { name: string } | null };
};

const EMPTY_PROFILE = {
  role: "seller" as TradeRole,
  description: "",
  product_categories: "",
  target_markets: "",
  budget_range: "",
  capacity: "",
  company_name: "",
  company_name_en: "",
  tax_id: "",
  company_address: "",
  industry: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  referral_sources: [] as string[],
  website: "",
  remarks: "",
  bank_account_name: "",
  bank_account_number: "",
  bank_swift_code: "",
  bank_passbook_image: "",
  contract_agreed: false,
};

const SPEC_MATRIX_COLUMNS = [
  { title: "規格一", hint: "EX：最小規格 25入/盒" },
  { title: "規格二", hint: "EX：成箱規格 48入/箱" },
  { title: "規格三", hint: "EX：成板規格 36箱/板" },
];

const SPEC_MATRIX_ROWS = [
  { key: "price_usd", label: "單價：USD" },
  { key: "dimensions_cm", label: "長、寬、高（CM）" },
  { key: "net_weight_kg", label: "淨重（KG）" },
  { key: "gross_weight_kg", label: "毛重（KG）" },
] as const;

const EMPTY_SPEC_MATRIX = SPEC_MATRIX_COLUMNS.map(() => ({
  price_usd: "",
  dimensions_cm: "",
  net_weight_kg: "",
  gross_weight_kg: "",
}));

const EMPTY_PRODUCT = {
  name: "",
  description: "",
  category: "",
  hs_code: "",
  origin_country: "",
  brand: "",
  english_name: "",
  barcode: "",
  product_spec_text: "",
  quantity_range: "",
  total_price: "",
  remarks: "",
  seller_info: "",
  shelf_life: "",
  allergens: "",
  nutrition_label: "",
  permit_no: "",
  return_policy: "",
  warranty_policy: "",
  special_spec_enabled: false,
  spec_matrix: EMPTY_SPEC_MATRIX,
  unit_length_cm: "",
  unit_width_cm: "",
  unit_height_cm: "",
  unit_weight_kg: "",
  carton_quantity: "",
  storage_days: "",
  storage_method: "",
  temp_control: "no",
  feature_description: "",
  full_description: "",
  domestic_vendor_name: "",
  domestic_vendor_phone: "",
  domestic_vendor_address: "",
  vegetarian_type: "",
  ingredients: "",
  marketing_claim: "",
  liability_insurance: "",
  food_registration_no: "",
  certifications: "",
  linked_site_id: "",
  linked_site_url: "",
  status: "published",
};

const EMPTY_SPECIAL_VARIANT = {
  name: "",
  english_name: "",
  spec: "",
  price_fob_usd: "",
};

const EMPTY_INQUIRY = {
  product_id: "",
  quantity: "100",
  target_price: "",
  delivery_terms: "FOB Taiwan",
  port_of_destination: "",
  payment_terms: "T/T 30% deposit",
  notes: "",
};

const FALLBACK_TRADE_CATALOG: TradeCatalog = {
  categories: ["食品", "美妝", "雜貨", "電器", "其他"],
  hs_codes: [],
};

export default function TradePage() {
  const [tab, setTab] = useState("market");
  const [productSubTab, setProductSubTab] = useState<"list" | "form">("list");
  const [inquirySubTab, setInquirySubTab] = useState<"sent" | "received">("sent");
  const [access, setAccess] = useState<TradeAccess | null>(null);
  const [profile, setProfile] = useState<TradeProfile>(null);
  const [catalog, setCatalog] = useState<TradeCatalog>(FALLBACK_TRADE_CATALOG);
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE);
  const [myProducts, setMyProducts] = useState<Product[]>([]);
  const [marketProducts, setMarketProducts] = useState<Product[]>([]);
  const [sellerSites, setSellerSites] = useState<SellerSite[]>([]);
  const [sentInquiries, setSentInquiries] = useState<Inquiry[]>([]);
  const [receivedInquiries, setReceivedInquiries] = useState<Inquiry[]>([]);
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT);
  const [inquiryForms, setInquiryForms] = useState<Record<string, typeof EMPTY_INQUIRY>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [submittingInquiryId, setSubmittingInquiryId] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [creatingOrderFromInquiryId, setCreatingOrderFromInquiryId] = useState<string | null>(null);
  const [creatingSupportFromInquiryId, setCreatingSupportFromInquiryId] = useState<string | null>(null);
  const [updatingInquiryStatusId, setUpdatingInquiryStatusId] = useState<string | null>(null);
  const [quotationDrafts, setQuotationDrafts] = useState<Record<string, { quoted_price: string; quoted_quantity: string; quotation_notes: string }>>({});
  const [productFiles, setProductFiles] = useState<File[]>([]);
  const [draftImages, setDraftImages] = useState<string[]>([]);
  const [draftAttributes, setDraftAttributes] = useState<Record<string, string>>({});
  const [draftConfidence, setDraftConfidence] = useState<number | null>(null);
  const [specialVariants, setSpecialVariants] = useState([EMPTY_SPECIAL_VARIANT]);
  const [openInquiryProductId, setOpenInquiryProductId] = useState<string | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [analyzingImages, setAnalyzingImages] = useState(false);
  const [filters, setFilters] = useState<TradeFilters>({ q: "", category: "", hs_code: "" });
  const [registeredCompany, setRegisteredCompany] = useState<RegisteredCompany>(null);
  const [uploadingPassbook, setUploadingPassbook] = useState(false);
  const [profileTaxLookup, setProfileTaxLookup] = useState<
    "idle" | "invalid" | "loading" | "success" | "not_found" | "error"
  >("idle");

  useEffect(() => {
    const taxId = profileForm.tax_id.trim();
    if (!taxId) {
      setProfileTaxLookup("idle");
      return;
    }
    if (!/^\d{8}$/.test(taxId)) {
      setProfileTaxLookup("invalid");
      return;
    }
    // 註冊資料已涵蓋同一統編時不需重查
    if (registeredCompany && registeredCompany.tax_id === taxId) {
      setProfileTaxLookup("idle");
      return;
    }
    const timer = setTimeout(async () => {
      setProfileTaxLookup("loading");
      try {
        const res = await fetch(`/api/auth/lookup-tax-id?id=${taxId}`);
        const json = await res.json();
        if (json.data?.source === "gcis") {
          setProfileForm((v) => ({
            ...v,
            company_name: json.data.name || v.company_name,
            company_address: json.data.address || v.company_address,
          }));
          setProfileTaxLookup("success");
        } else {
          setProfileTaxLookup(res.ok ? "not_found" : "error");
        }
      } catch {
        setProfileTaxLookup("error");
      }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileForm.tax_id, registeredCompany]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const nextAccess = await loadAccess();
      if (nextAccess.seller_allowed || nextAccess.profile_exists) {
        await loadProfile();
      }
      await Promise.all([
        loadCatalog(),
        loadProducts(nextAccess.seller_allowed),
        loadInquiries("sent"),
        loadInquiries("received"),
        loadRegisteredCompany(),
        ...(nextAccess.seller_allowed ? [loadSellerSites()] : []),
      ]);
      setLoading(false);
    })();
  }, []);

  async function loadRegisteredCompany() {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return;
    const json = await res.json();
    setRegisteredCompany((json.data?.company ?? null) as RegisteredCompany);
  }

  function applyRegisteredCompany() {
    if (!registeredCompany) return;
    setProfileForm((v) => ({
      ...v,
      company_name: registeredCompany.name || v.company_name,
      company_name_en: registeredCompany.name_en || v.company_name_en,
      tax_id: registeredCompany.tax_id || v.tax_id,
      company_address: registeredCompany.address || v.company_address,
      industry: registeredCompany.industry || v.industry,
      contact_name: registeredCompany.contact_name || v.contact_name,
      contact_phone: registeredCompany.contact_phone || v.contact_phone,
      contact_email: registeredCompany.contact_email || v.contact_email,
      website: registeredCompany.website || v.website,
    }));
  }

  async function loadAccess() {
    const res = await fetch("/api/trade/access");
    const json = await res.json();
    const nextAccess = (json.data ??
      { allowed: false, site_builder_allowed: false, seller_allowed: false, profile_exists: false, profile_verified: false, reason: "seller_plan_locked" }) as TradeAccess;
    setAccess(nextAccess);
    return nextAccess;
  }

  async function loadProfile() {
    const res = await fetch("/api/trade/profile");
    if (!res.ok) {
      setProfile(null);
      return;
    }
    const json = await res.json();
    const nextProfile = (json.data ?? null) as TradeProfile;
    setProfile(nextProfile);
    if (nextProfile) {
      const info = (nextProfile.company_info ?? {}) as Record<string, unknown>;
      const infoText = (key: string) => (typeof info[key] === "string" ? (info[key] as string) : "");
      setProfileForm({
        role: nextProfile.role,
        description: nextProfile.description ?? "",
        product_categories: nextProfile.product_categories.join(", "),
        target_markets: nextProfile.target_markets.join(", "),
        budget_range: nextProfile.budget_range ?? "",
        capacity: nextProfile.capacity ?? "",
        company_name: infoText("company_name"),
        company_name_en: infoText("company_name_en"),
        tax_id: infoText("tax_id"),
        company_address: infoText("company_address"),
        industry: infoText("industry"),
        contact_name: infoText("contact_name"),
        contact_phone: infoText("contact_phone"),
        contact_email: infoText("contact_email"),
        referral_sources: Array.isArray(info.referral_sources)
          ? (info.referral_sources as unknown[]).filter((item): item is string => typeof item === "string")
          : [],
        website: infoText("website"),
        remarks: infoText("remarks"),
        bank_account_name: infoText("bank_account_name"),
        bank_account_number: infoText("bank_account_number"),
        bank_swift_code: infoText("bank_swift_code"),
        bank_passbook_image: infoText("bank_passbook_image"),
        contract_agreed: info.contract_agreed === true,
      });
    }
  }

  async function loadSellerSites() {
    const res = await fetch("/api/sites");
    if (!res.ok) return;
    const json = await res.json();
    setSellerSites((json.data ?? []).map((site: SellerSite) => ({
      id: site.id,
      name: site.name,
      slug: site.slug,
      status: site.status,
    })));
  }

  async function loadCatalog() {
    const res = await fetch("/api/trade/categories", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      setCatalog(FALLBACK_TRADE_CATALOG);
      setStatus(json.error?.message ?? "商品分類載入失敗，暫時使用預設分類");
      return;
    }
    const nextCatalog = (json.data ?? FALLBACK_TRADE_CATALOG) as TradeCatalog;
    setCatalog({
      categories: nextCatalog.categories.length ? nextCatalog.categories : FALLBACK_TRADE_CATALOG.categories,
      hs_codes: nextCatalog.hs_codes ?? [],
    });
  }

  async function loadProducts(sellerAllowed = access?.seller_allowed ?? false) {
    const marketParams = new URLSearchParams({ scope: "market" });
    if (filters.q.trim()) marketParams.set("q", filters.q.trim());
    if (filters.category.trim()) marketParams.set("category", filters.category.trim());
    if (filters.hs_code.trim()) marketParams.set("hs_code", filters.hs_code.trim());

    const [mineRes, marketRes] = await Promise.all([
      sellerAllowed ? fetch("/api/trade/products?scope=mine") : Promise.resolve(null),
      fetch(`/api/trade/products?${marketParams.toString()}`),
    ]);
    const mineJson = mineRes ? await mineRes.json() : { data: [] };
    const marketJson = await marketRes.json();
    setMyProducts(mineJson.data ?? []);
    setMarketProducts(marketJson.data ?? []);
  }

  async function loadInquiries(mode: "sent" | "received") {
    const res = await fetch(`/api/trade/inquiries?mode=${mode}`);
    const json = await res.json();
    if (mode === "sent") setSentInquiries(json.data ?? []);
    else setReceivedInquiries(json.data ?? []);
  }

  async function uploadPassbook(file: File) {
    setUploadingPassbook(true);
    setStatus(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/trade/profile/passbook", { method: "POST", body: formData });
    const json = await res.json();
    setUploadingPassbook(false);
    if (!res.ok) {
      setStatus(json.error?.message ?? "存摺照片上傳失敗");
      return;
    }
    setProfileForm((v) => ({ ...v, bank_passbook_image: json.data?.url ?? "" }));
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (profileForm.referral_sources.length === 0) {
      setStatus("請至少勾選一項「如何知道此系統服務」");
      return;
    }
    setSavingProfile(true);
    setStatus(null);

    const res = await fetch("/api/trade/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "seller",
        description: profileForm.description || undefined,
        product_categories: splitCsv(profileForm.product_categories),
        target_markets: splitCsv(profileForm.target_markets),
        budget_range: profileForm.budget_range || undefined,
        capacity: profileForm.capacity || undefined,
        company_info: {
          company_name: profileForm.company_name,
          company_name_en: profileForm.company_name_en,
          tax_id: profileForm.tax_id,
          company_address: profileForm.company_address,
          industry: profileForm.industry,
          contact_name: profileForm.contact_name,
          contact_phone: profileForm.contact_phone,
          contact_email: profileForm.contact_email,
          referral_sources: profileForm.referral_sources,
          website: profileForm.website || undefined,
          remarks: profileForm.remarks || undefined,
          bank_account_name: profileForm.bank_account_name || undefined,
          bank_account_number: profileForm.bank_account_number || undefined,
          bank_swift_code: profileForm.bank_swift_code || undefined,
          bank_passbook_image: profileForm.bank_passbook_image || undefined,
          contract_agreed: profileForm.contract_agreed,
        },
      }),
    });

    const json = await res.json();
    setSavingProfile(false);
    if (!res.ok) {
      setStatus(json.error?.message ?? "儲存失敗");
      return;
    }

    setProfile(json.data);
    await loadAccess();
    setTab("profile");
    setStatus("賣家身份檔案已送出，待 admin 審核後才會開放商品上架與 seller 功能");
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    setSavingProduct(true);
    setStatus(null);

    const payload = {
      name: productForm.name,
      description: productForm.description || undefined,
      category: productForm.category,
      hs_code: productForm.hs_code || undefined,
      images: draftImages,
      specs: {
        brand: productForm.brand || undefined,
        english_name: productForm.english_name || undefined,
        barcode: productForm.barcode || undefined,
        product_spec_text: productForm.product_spec_text || undefined,
        quantity_range: productForm.quantity_range || undefined,
        total_price: productForm.total_price || undefined,
        remarks: productForm.remarks || undefined,
        seller_info: productForm.seller_info || undefined,
        shelf_life: productForm.shelf_life || undefined,
        allergens: productForm.allergens || undefined,
        nutrition_label: productForm.nutrition_label || undefined,
        permit_no: productForm.permit_no || undefined,
        return_policy: productForm.return_policy || undefined,
        warranty_policy: productForm.warranty_policy || undefined,
        spec_matrix: productForm.spec_matrix.some((column) => Object.values(column).some(Boolean))
          ? productForm.spec_matrix
          : undefined,
        special_spec_enabled: productForm.special_spec_enabled,
        special_variants: productForm.special_spec_enabled
          ? specialVariants
              .map((variant) => ({
                name: variant.name.trim(),
                english_name: variant.english_name.trim() || undefined,
                spec: variant.spec.trim() || undefined,
                price_fob_usd: variant.price_fob_usd.trim() || undefined,
              }))
              .filter((variant) => variant.name)
          : undefined,
        unit_length_cm: productForm.unit_length_cm || undefined,
        unit_width_cm: productForm.unit_width_cm || undefined,
        unit_height_cm: productForm.unit_height_cm || undefined,
        unit_weight_kg: productForm.unit_weight_kg || undefined,
        carton_quantity: productForm.carton_quantity || undefined,
        storage_days: productForm.storage_days || undefined,
        storage_method: productForm.storage_method || undefined,
        temp_control: productForm.temp_control || undefined,
        feature_description: productForm.feature_description || undefined,
        full_description: productForm.full_description || undefined,
        domestic_vendor_name: productForm.domestic_vendor_name || undefined,
        domestic_vendor_phone: productForm.domestic_vendor_phone || undefined,
        domestic_vendor_address: productForm.domestic_vendor_address || undefined,
        vegetarian_type: productForm.vegetarian_type || undefined,
        ingredients: productForm.ingredients || undefined,
        marketing_claim: productForm.marketing_claim || undefined,
        liability_insurance: productForm.liability_insurance || undefined,
        food_registration_no: productForm.food_registration_no || undefined,
        linked_site_id: productForm.linked_site_id || undefined,
        linked_site_url: productForm.linked_site_url || undefined,
        ...draftAttributes,
      },
      price_fob_usd: parseOptionalInt(productForm.spec_matrix[0]?.price_usd ?? ""),
      origin_country: productForm.origin_country || undefined,
      certifications: splitCsv(productForm.certifications),
      status: productForm.status,
    };
    const res = await fetch(editingProductId ? `/api/trade/products/${editingProductId}` : "/api/trade/products", {
      method: editingProductId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();

    setSavingProduct(false);
    if (!res.ok) {
      setStatus(json.error?.message ?? (editingProductId ? "商品更新失敗" : "商品建立失敗"));
      return;
    }

    const savedProduct = json.data as Product;
    if (productFiles.length > 0 && draftImages.length === 0) {
      const uploadOk = await uploadProductImages(savedProduct.id, productFiles);
      if (!uploadOk) {
        return;
      }
    }

    setProductForm(EMPTY_PRODUCT);
    setProductFiles([]);
    setDraftImages([]);
    setDraftAttributes({});
    setDraftConfidence(null);
    setSpecialVariants([EMPTY_SPECIAL_VARIANT]);
    setEditingProductId(null);
    setStatus(editingProductId ? "商品已更新" : "商品已建立");
    await loadProducts();
    setTab("products");
    setProductSubTab("list");
  }

  function startEditProduct(product: Product) {
    setProductSubTab("form");
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      description: product.description ?? "",
      category: product.category ?? "",
      hs_code: product.hs_code ?? readSpec(product.specs, "hs_code"),
      origin_country: product.origin_country ?? "",
      brand: readSpec(product.specs, "brand"),
      english_name: readSpec(product.specs, "english_name"),
      barcode: readSpec(product.specs, "barcode"),
      product_spec_text: readSpec(product.specs, "product_spec_text"),
      quantity_range: readSpec(product.specs, "quantity_range"),
      total_price: readSpec(product.specs, "total_price"),
      remarks: readSpec(product.specs, "remarks"),
      seller_info: readSpec(product.specs, "seller_info"),
      shelf_life: readSpec(product.specs, "shelf_life"),
      allergens: readSpec(product.specs, "allergens"),
      nutrition_label: readSpec(product.specs, "nutrition_label"),
      permit_no: readSpec(product.specs, "permit_no"),
      return_policy: readSpec(product.specs, "return_policy"),
      warranty_policy: readSpec(product.specs, "warranty_policy"),
      spec_matrix: readSpecMatrix(product.specs, product.price_min),
      special_spec_enabled: readSpecBool(product.specs, "special_spec_enabled"),
      unit_length_cm: readSpec(product.specs, "unit_length_cm"),
      unit_width_cm: readSpec(product.specs, "unit_width_cm"),
      unit_height_cm: readSpec(product.specs, "unit_height_cm"),
      unit_weight_kg: readSpec(product.specs, "unit_weight_kg"),
      carton_quantity: readSpec(product.specs, "carton_quantity"),
      storage_days: readSpec(product.specs, "storage_days"),
      storage_method: readSpec(product.specs, "storage_method"),
      temp_control: readSpec(product.specs, "temp_control") || "no",
      feature_description: readSpec(product.specs, "feature_description"),
      full_description: readSpec(product.specs, "full_description"),
      domestic_vendor_name: readSpec(product.specs, "domestic_vendor_name"),
      domestic_vendor_phone: readSpec(product.specs, "domestic_vendor_phone"),
      domestic_vendor_address: readSpec(product.specs, "domestic_vendor_address"),
      vegetarian_type: readSpec(product.specs, "vegetarian_type"),
      ingredients: readSpec(product.specs, "ingredients"),
      marketing_claim: readSpec(product.specs, "marketing_claim"),
      liability_insurance: readSpec(product.specs, "liability_insurance"),
      food_registration_no: readSpec(product.specs, "food_registration_no"),
      linked_site_id: readSpec(product.specs, "linked_site_id"),
      linked_site_url: readSpec(product.specs, "linked_site_url"),
      certifications: (product.certifications ?? []).join(", "),
      status: product.status,
    });
    setSpecialVariants(readSpecialVariants(product.specs));
    setProductFiles([]);
    setDraftImages(product.images ?? []);
    setDraftAttributes({});
    setDraftConfidence(null);
    setTab("products");
  }

  function cancelEditProduct() {
    setEditingProductId(null);
    setProductSubTab("list");
    setProductForm(EMPTY_PRODUCT);
    setProductFiles([]);
    setDraftImages([]);
    setDraftAttributes({});
    setDraftConfidence(null);
    setSpecialVariants([EMPTY_SPECIAL_VARIANT]);
  }

  async function analyzeProductImages() {
    if (productFiles.length === 0) {
      setStatus("請先選擇至少一張商品圖片");
      return;
    }

    setAnalyzingImages(true);
    setStatus(null);

    const formData = new FormData();
    productFiles.forEach((file) => formData.append("files", file));

    const res = await fetch("/api/trade/products/draft-from-image", {
      method: "POST",
      body: formData,
    });
    const json = await res.json();
    setAnalyzingImages(false);

    if (!res.ok) {
      setStatus(json.error?.message ?? "圖片辨識失敗");
      return;
    }

    const draft = json.data as ProductDraft;
    setProductForm((value) => ({
      ...value,
      name: draft.suggested_name || value.name,
      category: draft.suggested_category || value.category,
      origin_country: draft.suggested_origin_country ?? value.origin_country,
      certifications: draft.suggested_certifications.join(", "),
    }));
    setDraftImages(draft.image_urls ?? []);
    setDraftAttributes(draft.detected_attributes ?? {});
    setDraftConfidence(draft.confidence ?? null);
    setProductFiles([]);
    setStatus("圖片辨識完成，已自動帶入商品草稿");
  }

  async function uploadProductImages(productId: string, files: File[]) {
    setUploadingImages(true);
    setStatus(null);
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    const res = await fetch(`/api/trade/products/${productId}/images`, {
      method: "POST",
      body: formData,
    });
    const json = await res.json();
    setUploadingImages(false);

    if (!res.ok) {
      setStatus(json.error?.message ?? "商品圖片上傳失敗");
      return false;
    }

    return true;
  }

  async function deleteProduct(productId: string) {
    setDeletingProductId(productId);
    setStatus(null);
    const res = await fetch(`/api/trade/products/${productId}`, { method: "DELETE" });
    const json = await res.json();
    setDeletingProductId(null);

    if (!res.ok) {
      setStatus(json.error?.message ?? "商品下架失敗");
      return;
    }

    if (editingProductId === productId) {
      cancelEditProduct();
    }
    setStatus("商品已下架");
    await loadProducts();
  }

  async function createOrderFromInquiry(inquiryId: string) {
    setCreatingOrderFromInquiryId(inquiryId);
    setStatus(null);

    const res = await fetch(`/api/trade/inquiries/${inquiryId}/create-order`, {
      method: "POST",
    });
    const json = await res.json();
    setCreatingOrderFromInquiryId(null);

    if (!res.ok) {
      setStatus(json.error?.message ?? "建立訂單草稿失敗");
      return;
    }

    const order = json.data as { id: string; order_no: string };
    setStatus(`已建立訂單草稿 ${order.order_no}`);
    window.location.href = `/orders/${order.id}`;
  }

  async function createSupportFromInquiry(inquiryId: string) {
    setCreatingSupportFromInquiryId(inquiryId);
    setStatus(null);

    const res = await fetch(`/api/trade/inquiries/${inquiryId}/support-ticket`, {
      method: "POST",
    });
    const json = await res.json();
    setCreatingSupportFromInquiryId(null);

    if (!res.ok) {
      setStatus(json.error?.message ?? "建立人工單失敗");
      return;
    }

    setStatus("已建立人工支援工單");
    window.location.href = "/support";
  }

  async function updateInquiryStatus(inquiryId: string, nextStatus: "replied" | "negotiating" | "closed" | "expired") {
    setUpdatingInquiryStatusId(inquiryId);
    setStatus(null);

    const res = await fetch(`/api/trade/inquiries/${inquiryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const json = await res.json();
    setUpdatingInquiryStatusId(null);

    if (!res.ok) {
      setStatus(json.error?.message ?? "詢價狀態更新失敗");
      return;
    }

    setStatus("詢價狀態已更新");
    await Promise.all([loadInquiries("sent"), loadInquiries("received")]);
  }

  function getQuotationDraft(inquiry: Inquiry) {
    return quotationDrafts[inquiry.id] ?? {
      quoted_price: inquiry.quoted_price == null ? "" : String(inquiry.quoted_price),
      quoted_quantity: inquiry.quoted_quantity == null ? String(inquiry.quantity) : String(inquiry.quoted_quantity),
      quotation_notes: inquiry.quotation_notes ?? "",
    };
  }

  function updateQuotationDraft(inquiryId: string, patch: Partial<{ quoted_price: string; quoted_quantity: string; quotation_notes: string }>) {
    setQuotationDrafts((prev) => ({
      ...prev,
      [inquiryId]: {
        ...(prev[inquiryId] ?? { quoted_price: "", quoted_quantity: "", quotation_notes: "" }),
        ...patch,
      },
    }));
  }

  async function saveQuotation(inquiry: Inquiry) {
    const draft = getQuotationDraft(inquiry);
    setUpdatingInquiryStatusId(inquiry.id);
    setStatus(null);

    const res = await fetch(`/api/trade/inquiries/${inquiry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "replied",
        quoted_price: parseOptionalInt(draft.quoted_price),
        quoted_quantity: parseOptionalInt(draft.quoted_quantity),
        quotation_notes: draft.quotation_notes || undefined,
      }),
    });
    const json = await res.json();
    setUpdatingInquiryStatusId(null);

    if (!res.ok) {
      setStatus(json.error?.message ?? "報價更新失敗");
      return;
    }

    setStatus("報價已更新，詢價已標記為已回覆");
    await Promise.all([loadInquiries("sent"), loadInquiries("received")]);
  }

  function getInquiryForm(productId: string) {
    return inquiryForms[productId] ?? { ...EMPTY_INQUIRY, product_id: productId };
  }

  function updateInquiryForm(productId: string, patch: Partial<typeof EMPTY_INQUIRY>) {
    setInquiryForms((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] ?? { ...EMPTY_INQUIRY, product_id: productId }),
        ...patch,
      },
    }));
  }

  async function submitInquiry(productId: string) {
    const form = getInquiryForm(productId);
    setSubmittingInquiryId(productId);
    setStatus(null);

    const res = await fetch("/api/trade/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: productId,
        quantity: Number(form.quantity),
        target_price: parseOptionalInt(form.target_price),
        delivery_terms: form.delivery_terms || undefined,
        port_of_destination: form.port_of_destination || undefined,
        payment_terms: form.payment_terms || undefined,
        notes: form.notes || undefined,
      }),
    });
    const json = await res.json();

    setSubmittingInquiryId(null);
    if (!res.ok) {
      setStatus(json.error?.message ?? "詢價送出失敗");
      return;
    }

    setStatus("詢價已送出");
    setInquiryForms((prev) => ({ ...prev, [productId]: { ...EMPTY_INQUIRY, product_id: productId } }));
    setOpenInquiryProductId(null);
    await loadInquiries("sent");
    setTab("inquiries");
  }

  const canSell = access?.seller_allowed ?? false;
  const canBuildSites = access?.site_builder_allowed ?? false;
  const profileGateReason = access?.reason;

  useEffect(() => {
    if (!canSell && inquirySubTab === "received") {
      setInquirySubTab("sent");
    }
    if (!canSell && tab === "products") {
      setTab("market");
    }
  }, [canSell, inquirySubTab, tab]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8 lg:px-8">
      <section className="overflow-hidden rounded-[28px] border border-global-100 bg-[radial-gradient(circle_at_top_right,_rgba(190,155,240,0.18),_rgba(255,255,255,1)_55%),linear-gradient(135deg,_#fbf8ff,_#ffffff_60%)] shadow-[0_24px_80px_-48px_rgba(85,47,128,0.3)]">
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.5fr_1fr] lg:px-8 lg:py-7">
          <div className="space-y-5">
            <div
              className="inline-flex items-center gap-2 rounded-full border border-global-200 bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-global-600"
            >
              <Globe2 className="h-3.5 w-3.5" />
              Trade Workspace · Global
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {access?.allowed ? (
                <>
                  <Link href="/trade/orders" className="trade-quick-link">
                    <Package2 className="h-4 w-4" />
                    <span>貿易訂單</span>
                  </Link>
                  {canBuildSites ? (
                    <Link href="/trade/sites" className="trade-quick-link">
                      <Store className="h-4 w-4" />
                      <span>商品頁建置</span>
                    </Link>
                  ) : (
                    <a href="/billing" className="trade-quick-link">
                      <Store className="h-4 w-4" />
                      <span>賣家建站</span>
                    </a>
                  )}
                  {canSell ? (
                    <Link href="/trade/quotations" className="trade-quick-link">
                      <ScrollText className="h-4 w-4" />
                      <span>Seller Quotation</span>
                    </Link>
                  ) : (
                    <a href="/billing" className="trade-quick-link">
                      <ScrollText className="h-4 w-4" />
                      <span>升級成賣家</span>
                    </a>
                  )}
                  <Link href="/trade/quotations/inbox" className="trade-quick-link">
                    <ClipboardList className="h-4 w-4" />
                    <span>Buyer Quotation</span>
                  </Link>
                  <Link href="/trade/notifications" className="trade-quick-link">
                    <Bell className="h-4 w-4" />
                    <span>通知中心</span>
                  </Link>
                </>
              ) : (
                <>
                  <div className="trade-quick-link cursor-not-allowed opacity-55">
                    <Package2 className="h-4 w-4" />
                    <span>貿易訂單</span>
                  </div>
                  <div className="trade-quick-link cursor-not-allowed opacity-55">
                    <Store className="h-4 w-4" />
                    <span>賣家建站</span>
                  </div>
                  <div className="trade-quick-link cursor-not-allowed opacity-55">
                    <ScrollText className="h-4 w-4" />
                    <span>升級成賣家</span>
                  </div>
                  <div className="trade-quick-link cursor-not-allowed opacity-55">
                    <ClipboardList className="h-4 w-4" />
                    <span>Buyer Quotation</span>
                  </div>
                  <div className="trade-quick-link cursor-not-allowed opacity-55">
                    <Bell className="h-4 w-4" />
                    <span>通知中心</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-[22px] border border-global-100 bg-white/90 p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
                目前角色
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm"
                  style={{ backgroundImage: "var(--g3-gradient-brand)" }}
                >
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-semibold uppercase text-stone-900">
                    {canSell ? "seller" : "buyer"}
                  </div>
                  <div className="text-xs leading-snug text-stone-500">
                    Buyer 預設開放；Seller 需訂閱 + 審核
                  </div>
                </div>
              </div>
            </div>
            <div
              className="rounded-[22px] p-4 text-white shadow-sm"
              style={{ backgroundImage: "var(--g3-gradient-brand)" }}
            >
              <div className="grid grid-cols-3 gap-3">
                <TradeMiniStat label="市場商品" value={String(marketProducts.length)} />
                <TradeMiniStat label="我的商品" value={String(myProducts.length)} />
                <TradeMiniStat label="待處理詢價" value={String(receivedInquiries.length)} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {status && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
          {status}
        </div>
      )}

      {!loading && access && !canSell ? (
        <Card className="border-amber-200 bg-amber-50/70">
          <CardHeader>
            <CardTitle>
              {profileGateReason === "seller_plan_locked"
                ? "升級方案後可申請賣家身份"
                : profileGateReason === "profile_missing"
                  ? "請先建立賣家身份檔案"
                  : "賣家身份審核中"}
            </CardTitle>
            <CardDescription>
              {profileGateReason === "seller_plan_locked"
                ? "你目前已可瀏覽市場商品與發詢價。若要成為賣家上架商品，請先升級到含 trade seller 權限的方案。"
                : profileGateReason === "profile_missing"
                  ? "建立賣家身份檔案後，會送到 admin portal 進行審核。審核通過前，商品上架與 Seller quotation 功能不會開放。"
                  : "你的賣家身份檔案已送出，正等待 admin 審核。審核通過後才會開放商品上架與 Seller 功能。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {profileGateReason === "seller_plan_locked" ? (
              <a href="/billing">
                <Button>前往方案計費</Button>
              </a>
            ) : (
              <Button onClick={() => setTab("profile")}>前往賣家身份檔案</Button>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="grid h-auto w-full max-w-4xl grid-cols-2 gap-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm md:grid-cols-4">
          <TabsTrigger value="market" disabled={!access?.allowed}>市場</TabsTrigger>
          <TabsTrigger value="products" disabled={!canSell}>我的商品</TabsTrigger>
          <TabsTrigger value="inquiries" disabled={!access?.allowed}>詢價</TabsTrigger>
          <TabsTrigger value="profile">賣家身份</TabsTrigger>
        </TabsList>

        <TabsContent value="market">
          <div className="space-y-6">
            <Card className="overflow-visible rounded-[24px] border-neutral-200 shadow-sm">
              <CardHeader className="border-b border-neutral-100 bg-neutral-50/70">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-950 text-white">
                    <Search className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>搜尋市場商品</CardTitle>
                    <CardDescription>以關鍵字、類別與 HS code 篩選供應商商品，快速鎖定可詢價標的。</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 p-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="關鍵字">
                    <Input
                      value={filters.q}
                      onChange={(e) => setFilters((v) => ({ ...v, q: e.target.value }))}
                      placeholder="名稱、描述、HS code"
                    />
                  </Field>
                  <Field label="類別">
                    <SearchablePicker
                      value={filters.category}
                      onChange={(category) => setFilters((v) => ({ ...v, category }))}
                      options={catalog.categories}
                      placeholder="搜尋或輸入類別"
                      emptyLabel="全部類別"
                    />
                  </Field>
                  <Field label="HS code">
                    <Input
                      value={filters.hs_code}
                      onChange={(e) => setFilters((v) => ({ ...v, hs_code: e.target.value }))}
                      placeholder="例如 7318"
                      list="trade-hs-codes"
                    />
                  </Field>
                </div>
                <datalist id="trade-hs-codes">
                  {catalog.hs_codes.map((code) => (
                    <option key={code} value={code} />
                  ))}
                </datalist>
                <div className="flex items-center gap-3">
                  <Button type="button" className="min-w-28" onClick={() => void loadProducts()}>
                    套用篩選
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setFilters({ q: "", category: "", hs_code: "" });
                      setTimeout(() => void loadProducts(), 0);
                    }}
                  >
                    清除
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div>
              <h2 className="text-xl font-semibold tracking-tight text-neutral-950">市場商品</h2>
              <p className="mt-1 text-sm text-neutral-500">
                這裡只顯示市場商品，方便 buyer 直接發送詢價；自己的商品請到「我的商品」頁管理。
              </p>
            </div>

            <div className="space-y-4">
            {loading ? (
              <Card className="rounded-[24px]"><CardContent className="p-6 text-neutral-500">載入中...</CardContent></Card>
            ) : marketProducts.length === 0 ? (
              <Card className="rounded-[24px]">
                <CardContent className="p-12 text-center text-neutral-500">
                  尚無已上架商品。完成賣家身份審核後，就可以新增第一個商品。
                </CardContent>
              </Card>
            ) : (
              marketProducts.map((product) => {
                const inquiryForm = getInquiryForm(product.id);
                return (
                  <Card key={product.id} className="overflow-hidden rounded-[24px] border-neutral-200 shadow-sm">
                    <div className="grid gap-0 lg:grid-cols-[260px_minmax(0,1fr)]">
                      <div className="border-b border-neutral-200 bg-neutral-100/70 lg:border-b-0 lg:border-r">
                        <ProductImagePreview
                          images={product.images}
                          name={product.name}
                          className="h-full min-h-[220px] w-full rounded-none border-0"
                        />
                      </div>
                      <div className="space-y-4 p-5 lg:p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="flex flex-wrap gap-2">
                              {product.category ? (
                                <span className="rounded-full bg-neutral-950 px-3 py-1 text-xs font-medium text-white">
                                  {product.category}
                                </span>
                              ) : null}
                              {product.hs_code ? (
                                <span className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700">
                                  HS {product.hs_code}
                                </span>
                              ) : null}
                              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-500">
                                {product.status}
                              </span>
                            </div>
                            <div>
                              <h3 className="text-xl font-semibold tracking-tight text-neutral-950">{product.name}</h3>
                              <div className="mt-2 text-sm text-neutral-500">
                                <Link
                                  href={`/trade/sellers/${product.seller.id}`}
                                  className="font-medium text-neutral-700 underline-offset-4 hover:underline"
                                >
                                  {product.seller.company?.name ?? product.seller.display_name ?? "未命名賣家"}
                                </Link>
                              </div>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-right">
                            <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">價格</div>
                            <div className="mt-2 text-lg font-semibold text-neutral-950">
                              {formatPrice(product.price_min, product.price_max, product.currency)}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                          <Info label="MOQ">{product.moq} {product.unit}</Info>
                          <Info label="產地">{product.origin_country ?? "未填寫"}</Info>
                          <Info label="供應狀態">{product.status}</Info>
                          <Info label="Seller">{product.seller.company?.name ?? product.seller.display_name ?? "未命名"}</Info>
                        </div>
                        {product.description && (
                          <p className="line-clamp-3 rounded-2xl bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-700">{product.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3">
                          <Link href={`/trade/products/${product.id}`}>
                            <Button size="sm" variant="outline">商品詳情</Button>
                          </Link>
                          <Link href={`/trade/sellers/${product.seller.id}`}>
                            <Button size="sm" variant="ghost">Seller 詳情</Button>
                          </Link>
                          <Button
                            size="sm"
                            onClick={() =>
                              setOpenInquiryProductId((current) => (current === product.id ? null : product.id))
                            }
                          >
                            {openInquiryProductId === product.id ? "收起詢價" : "我要詢價"}
                          </Button>
                        </div>
                      </div>
                    </div>
                    {openInquiryProductId === product.id ? (
                    <CardContent className="border-t border-neutral-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-5 lg:p-6">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <div className="text-base font-semibold text-neutral-950">快速詢價</div>
                          <div className="text-sm text-neutral-500">直接填入需求與條件，送到 seller 的 quotation 工作台。</div>
                        </div>
                        <div className="hidden rounded-2xl bg-white px-3 py-2 text-xs text-neutral-500 shadow-sm md:block">
                          詢價後可由 seller 產出制式 quotation
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="需求數量">
                          <Input
                            value={inquiryForm.quantity}
                            onChange={(e) => updateInquiryForm(product.id, { quantity: e.target.value })}
                          />
                        </Field>
                        <Field label="目標單價">
                          <Input
                            value={inquiryForm.target_price}
                            onChange={(e) => updateInquiryForm(product.id, { target_price: e.target.value })}
                            placeholder={`例如 ${product.currency}`}
                          />
                        </Field>
                        <Field label="交貨條件">
                          <Input
                            value={inquiryForm.delivery_terms}
                            onChange={(e) => updateInquiryForm(product.id, { delivery_terms: e.target.value })}
                          />
                        </Field>
                        <Field label="目的港">
                          <Input
                            value={inquiryForm.port_of_destination}
                            onChange={(e) =>
                              updateInquiryForm(product.id, { port_of_destination: e.target.value })
                            }
                          />
                        </Field>
                      </div>
                      <div className="mt-3 grid gap-3">
                        <Field label="付款條件">
                          <Input
                            value={inquiryForm.payment_terms}
                            onChange={(e) => updateInquiryForm(product.id, { payment_terms: e.target.value })}
                          />
                        </Field>
                        <Field label="備註">
                          <textarea
                            value={inquiryForm.notes}
                            onChange={(e) => updateInquiryForm(product.id, { notes: e.target.value })}
                            className="min-h-24 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                            placeholder="例如：希望 30 天內交貨，需 CE 認證。"
                          />
                        </Field>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <Button
                          className="min-w-32"
                          onClick={() => void submitInquiry(product.id)}
                          disabled={submittingInquiryId === product.id}
                        >
                          {submittingInquiryId === product.id ? "送出中..." : "送出詢價"}
                        </Button>
                      </div>
                    </CardContent>
                    ) : null}
                  </Card>
                );
              })
            )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="products">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-neutral-200 bg-white p-4 shadow-sm">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-neutral-950">商品管理</h2>
                <p className="mt-1 text-sm text-neutral-500">把商品清單與商品建檔拆成子頁切換，操作會更清楚。</p>
              </div>
              <div className="inline-flex rounded-2xl border border-neutral-200 bg-neutral-50 p-1">
                <button
                  type="button"
                  onClick={() => setProductSubTab("list")}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    productSubTab === "list" ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"
                  }`}
                >
                  商品清單
                </button>
                <button
                  type="button"
                  onClick={() => setProductSubTab("form")}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    productSubTab === "form" ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"
                  }`}
                >
                  {editingProductId ? "編輯商品" : "新增商品"}
                </button>
              </div>
            </div>

            {productSubTab === "list" ? (
            <Card className="overflow-visible rounded-[24px] border-neutral-200 shadow-sm">
              <CardHeader className="border-b border-neutral-100 bg-neutral-50/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-950 text-white">
                      <Boxes className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle>我的商品庫</CardTitle>
                      <CardDescription>完成賣家身份審核後，可建立商品、維護圖像與規格，作為後續詢價與 quotation 的來源。</CardDescription>
                    </div>
                  </div>
                  <Button type="button" size="sm" onClick={() => setProductSubTab("form")}>
                    新增商品
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-5 lg:p-6">
                {myProducts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-neutral-500">
                    尚無商品
                  </div>
                ) : (
                  myProducts.map((product) => (
                    <div key={product.id} className="rounded-[22px] border border-neutral-200 bg-white p-4 shadow-[0_16px_42px_-36px_rgba(15,23,42,0.35)]">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <ProductImagePreview
                            images={product.images}
                            name={product.name}
                            className="mb-4 h-48 w-full max-w-xl"
                          />
                          <div className="flex flex-wrap gap-2">
                            {product.category ? (
                              <span className="rounded-full bg-neutral-950 px-3 py-1 text-xs font-medium text-white">{product.category}</span>
                            ) : null}
                            <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-500">
                              {product.status}
                            </span>
                          </div>
                          <div className="mt-3 text-xl font-semibold text-neutral-950">{product.name}</div>
                          <div className="mt-2 text-sm text-neutral-500">
                            {formatPrice(product.price_min, product.price_max, product.currency)}
                          </div>
                          {product.description && (
                            <p className="mt-3 rounded-2xl bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-700 whitespace-pre-wrap">
                              {product.description}
                            </p>
                          )}
                          {readSpec(product.specs, "linked_site_url") ? (
                            <div className="mt-3">
                              <Link
                                href={readSpec(product.specs, "linked_site_url")}
                                target="_blank"
                                className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                              >
                                查看商品頁
                              </Link>
                            </div>
                          ) : null}
                          {product.images?.length > 1 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {product.images.slice(1, 5).map((image, index) => (
                                <img
                                  key={`${product.id}-image-${index}`}
                                  src={image}
                                  alt={product.name}
                                  className="h-16 w-16 rounded-xl border border-neutral-200 object-cover"
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 xl:max-w-[220px] xl:justify-end">
                          <Button type="button" size="sm" variant="outline" onClick={() => startEditProduct(product)}>
                            編輯
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={deletingProductId === product.id}
                            onClick={() => void deleteProduct(product.id)}
                          >
                            {deletingProductId === product.id ? "下架中..." : "下架"}
                          </Button>
                          <Link href={`/trade/products/${product.id}`}>
                            <Button type="button" size="sm" variant="ghost">查看詳情</Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            ) : null}

            {productSubTab === "form" ? (
            <Card className="overflow-hidden rounded-[24px] border-neutral-200 shadow-sm">
              <CardHeader className="border-b border-neutral-100 bg-neutral-50/70">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-950 text-white">
                    <Store className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>{editingProductId ? "編輯商品" : "新增商品"}</CardTitle>
                    <CardDescription>
                  身份審核通過後，seller 建立商品會直接進市場；若有設定 `ASSET_BASE_URL`，會自動生成 CDN URL。
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 lg:p-6">
                {!canSell ? (
                  <div className="rounded-2xl border border-dashed p-8 text-sm text-neutral-500">
                    請先升級方案並完成賣家身份審核，才能新增商品。
                  </div>
                ) : (
                  <form onSubmit={createProduct} className="space-y-6">
                    <FormSection
                      eyebrow="01"
                      title="商品基本資料"
                      description="這些資料會同步供網站生成、報價單與商品列表使用。"
                    >
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="商品名稱（必填）">
                          <Input
                            value={productForm.name}
                            onChange={(e) => setProductForm((v) => ({ ...v, name: e.target.value }))}
                            required
                            placeholder="例如：MoreuAI 智能商品包"
                          />
                        </Field>
                        <Field label="分類（必填）">
                          <SearchablePicker
                            value={productForm.category}
                            onChange={(category) => setProductForm((v) => ({ ...v, category }))}
                            options={catalog.categories}
                            placeholder="搜尋或輸入商品分類"
                            emptyLabel="請選擇分類"
                            required
                          />
                        </Field>
                        <Field label="品牌">
                          <Input
                            value={productForm.brand}
                            onChange={(e) => setProductForm((v) => ({ ...v, brand: e.target.value }))}
                          />
                        </Field>
                        <Field label="英文品名">
                          <Input
                            value={productForm.english_name}
                            onChange={(e) => setProductForm((v) => ({ ...v, english_name: e.target.value }))}
                          />
                        </Field>
                        <Field label="國際條碼">
                          <Input
                            value={productForm.barcode}
                            onChange={(e) => setProductForm((v) => ({ ...v, barcode: e.target.value }))}
                            placeholder="EAN / UPC / GTIN"
                          />
                        </Field>
                        <Field label="HS code">
                          <Input
                            value={productForm.hs_code}
                            onChange={(e) => setProductForm((v) => ({ ...v, hs_code: e.target.value }))}
                            placeholder="例如 1905.90"
                          />
                        </Field>
                      </div>
                      <Field label="商品簡述介紹">
                        <TradeTextarea
                          value={productForm.description}
                          onChange={(value) => setProductForm((v) => ({ ...v, description: value }))}
                          placeholder="給 AI 與內部理解商品用，不一定顯示在報價單。"
                        />
                      </Field>
                    </FormSection>

                    <FormSection
                      eyebrow="02"
                      title="規格、數量與報價"
                      description="這一段會直接影響商品頁文案與貿易報價資料。"
                    >
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="商品規格（必填）">
                          <Input
                            value={productForm.product_spec_text}
                            onChange={(e) => setProductForm((v) => ({ ...v, product_spec_text: e.target.value }))}
                            placeholder="25包一盒，48盒一箱，36箱一板"
                            required
                          />
                        </Field>
                        <Field label="數量範圍（必填）">
                          <Input
                            value={productForm.quantity_range}
                            onChange={(e) => setProductForm((v) => ({ ...v, quantity_range: e.target.value }))}
                            placeholder="例如：100-500 箱 / 1,000 件以上"
                            required
                          />
                        </Field>
                        <Field label="總價（必填）">
                          <Input
                            value={productForm.total_price}
                            onChange={(e) => setProductForm((v) => ({ ...v, total_price: e.target.value }))}
                            placeholder="例如：依實際採購數量計算 / USD 1,200"
                            required
                          />
                        </Field>
                        <Field label="產地（必填）">
                          <Input
                            value={productForm.origin_country}
                            onChange={(e) => setProductForm((v) => ({ ...v, origin_country: e.target.value }))}
                            required
                          />
                        </Field>
                        <Field label="箱入數">
                          <Input
                            value={productForm.carton_quantity}
                            onChange={(e) => setProductForm((v) => ({ ...v, carton_quantity: e.target.value }))}
                            placeholder="例如：24 入 / 箱"
                          />
                        </Field>
                      </div>
                      <div className="grid gap-4 md:grid-cols-4">
                        <Field label="長（CM）">
                          <Input
                            value={productForm.unit_length_cm}
                            onChange={(e) => setProductForm((v) => ({ ...v, unit_length_cm: e.target.value }))}
                          />
                        </Field>
                        <Field label="寬（CM）">
                          <Input
                            value={productForm.unit_width_cm}
                            onChange={(e) => setProductForm((v) => ({ ...v, unit_width_cm: e.target.value }))}
                          />
                        </Field>
                        <Field label="高（CM）">
                          <Input
                            value={productForm.unit_height_cm}
                            onChange={(e) => setProductForm((v) => ({ ...v, unit_height_cm: e.target.value }))}
                          />
                        </Field>
                        <Field label="重量（KG）">
                          <Input
                            value={productForm.unit_weight_kg}
                            onChange={(e) => setProductForm((v) => ({ ...v, unit_weight_kg: e.target.value }))}
                          />
                        </Field>
                      </div>
                      <Field label="規格價格與包裝（規格一必填單價）">
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-sm">
                            <thead>
                              <tr>
                                <th className="w-36 border border-neutral-300 bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-700">
                                  商品
                                </th>
                                {SPEC_MATRIX_COLUMNS.map((column) => (
                                  <th
                                    key={column.title}
                                    className="border border-neutral-300 bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-700"
                                  >
                                    {column.title}
                                    <div className="text-xs font-normal text-neutral-500">{column.hint}</div>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {SPEC_MATRIX_ROWS.map((row) => (
                                <tr key={row.key}>
                                  <td className="border border-neutral-300 bg-neutral-50 px-3 py-2 text-neutral-700">
                                    {row.label}
                                  </td>
                                  {productForm.spec_matrix.map((column, index) => (
                                    <td key={`${row.key}-${index}`} className="border border-neutral-300 px-2 py-2">
                                      <Input
                                        value={column[row.key]}
                                        onChange={(e) =>
                                          setProductForm((v) => ({
                                            ...v,
                                            spec_matrix: v.spec_matrix.map((item, itemIndex) =>
                                              itemIndex === index ? { ...item, [row.key]: e.target.value } : item
                                            ),
                                          }))
                                        }
                                        required={row.key === "price_usd" && index === 0}
                                      />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Field>
                    </FormSection>

                    <FormSection
                      eyebrow="03"
                      title="價格延伸與商品頁連動"
                      description="可選擇既有商品頁，或只先建立商品資料給網站生成使用。"
                    >
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="關聯商品頁">
                          <select
                            value={productForm.linked_site_id}
                            onChange={(e) => {
                              const siteId = e.target.value;
                              const site = sellerSites.find((item) => item.id === siteId);
                              setProductForm((v) => ({
                                ...v,
                                linked_site_id: siteId,
                                linked_site_url: site ? `/s/${site.slug}` : "",
                              }));
                            }}
                            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                          >
                            <option value="">未關聯商品頁</option>
                            {sellerSites.map((site) => (
                              <option key={site.id} value={site.id}>
                                {site.name} · /s/{site.slug}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="商品頁網址">
                          <div className="space-y-2">
                            <Input
                              value={productForm.linked_site_url}
                              onChange={(e) => setProductForm((v) => ({ ...v, linked_site_url: e.target.value }))}
                              placeholder="/s/your-site-slug"
                            />
                            <div className="flex flex-wrap gap-2">
                              <Link href="/trade/sites" className="text-xs font-medium text-neutral-600 underline underline-offset-4">
                                前往商品頁建置
                              </Link>
                              {productForm.linked_site_url ? (
                                <Link
                                  href={productForm.linked_site_url}
                                  target="_blank"
                                  className="text-xs font-medium text-neutral-600 underline underline-offset-4"
                                >
                                  預覽已關聯頁面
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        </Field>
                      </div>
                    </FormSection>
                    <FormSection
                      eyebrow="04"
                      title="多品相與特規"
                      description="同一商品有不同口味、尺寸或價格時，可以用特規保留成多商品資料。"
                    >
                      <label className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                        <input
                          type="checkbox"
                          checked={productForm.special_spec_enabled}
                          onChange={(e) => setProductForm((v) => ({ ...v, special_spec_enabled: e.target.checked }))}
                        />
                        開啟特規
                      </label>
                      {productForm.special_spec_enabled ? (
                        <div className="space-y-3">
                          {specialVariants.map((variant, index) => (
                            <div key={`variant-${index}`} className="grid gap-3 rounded-md border bg-neutral-50 p-3 md:grid-cols-4">
                              <Input
                                value={variant.name}
                                onChange={(e) =>
                                  setSpecialVariants((prev) =>
                                    prev.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, name: e.target.value } : item,
                                    ),
                                  )
                                }
                                placeholder="品相名稱"
                              />
                              <Input
                                value={variant.english_name}
                                onChange={(e) =>
                                  setSpecialVariants((prev) =>
                                    prev.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, english_name: e.target.value } : item,
                                    ),
                                  )
                                }
                                placeholder="英文名"
                              />
                              <Input
                                value={variant.spec}
                                onChange={(e) =>
                                  setSpecialVariants((prev) =>
                                    prev.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, spec: e.target.value } : item,
                                    ),
                                  )
                                }
                                placeholder="各品相規格"
                              />
                              <div className="flex gap-2">
                                <Input
                                  value={variant.price_fob_usd}
                                  onChange={(e) =>
                                    setSpecialVariants((prev) =>
                                      prev.map((item, itemIndex) =>
                                        itemIndex === index ? { ...item, price_fob_usd: e.target.value } : item,
                                      ),
                                    )
                                  }
                                  placeholder="FOB USD"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    setSpecialVariants((prev) =>
                                      prev.length === 1
                                        ? prev
                                        : prev.filter((_, itemIndex) => itemIndex !== index),
                                    )
                                  }
                                >
                                  刪除
                                </Button>
                              </div>
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSpecialVariants((prev) => [...prev, { ...EMPTY_SPECIAL_VARIANT }])}
                          >
                            新增品相
                          </Button>
                        </div>
                      ) : null}
                    </FormSection>
                    <FormSection
                      eyebrow="05"
                      title="備註、保存與賣家資訊"
                      description="這一段會輔助報價單內容，也會讓 AI 生成一頁式文案時更準確。"
                    >
                      <Field label="備註欄（必填）">
                        <TradeTextarea
                          value={productForm.remarks}
                          onChange={(value) => setProductForm((v) => ({ ...v, remarks: value }))}
                          placeholder="例如：出貨限制、包裝注意事項、報價條件、可接受付款條件。"
                          required
                        />
                      </Field>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="保存效期">
                          <Input
                            value={productForm.storage_days}
                            onChange={(e) => setProductForm((v) => ({ ...v, storage_days: e.target.value }))}
                            placeholder="36個月"
                          />
                        </Field>
                        <Field label="保存方式">
                          <Input
                            value={productForm.storage_method}
                            onChange={(e) => setProductForm((v) => ({ ...v, storage_method: e.target.value }))}
                            placeholder="例如：常溫 / 冷凍 / 冷藏"
                            required
                          />
                        </Field>
                      </div>
                      <Field label="保存期限 / 保存條件">
                        <Input
                          value={productForm.shelf_life}
                          onChange={(e) => setProductForm((v) => ({ ...v, shelf_life: e.target.value }))}
                          placeholder="例如：未開封 12 個月，開封後冷藏 7 日內食用"
                        />
                      </Field>
                      <Field label="是否需控溫">
                        <div className="flex gap-4 text-sm">
                          {[
                            ["no", "否"],
                            ["yes", "是"],
                          ].map(([value, label]) => (
                            <label key={value} className="flex items-center gap-2">
                              <input
                                type="radio"
                                checked={productForm.temp_control === value}
                                onChange={() => setProductForm((v) => ({ ...v, temp_control: value }))}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </Field>
                      <Field label="賣家資訊（必填）">
                        <TradeTextarea
                          value={productForm.seller_info}
                          onChange={(value) => setProductForm((v) => ({ ...v, seller_info: value }))}
                          placeholder="公司名稱、聯絡窗口、出貨地、可服務市場等。"
                          required
                        />
                      </Field>
                      <Field label="商品特色說明">
                        <TradeTextarea
                          value={productForm.feature_description}
                          onChange={(value) => setProductForm((v) => ({ ...v, feature_description: value }))}
                        />
                      </Field>
                      <Field label="商品完整說明">
                        <TradeTextarea
                          value={productForm.full_description}
                          onChange={(value) => setProductForm((v) => ({ ...v, full_description: value }))}
                        />
                      </Field>
                      <div className="grid gap-4 md:grid-cols-3">
                        <Field label="國內負責廠商名稱">
                          <Input
                            value={productForm.domestic_vendor_name}
                            onChange={(e) => setProductForm((v) => ({ ...v, domestic_vendor_name: e.target.value }))}
                          />
                        </Field>
                        <Field label="國內負責廠商電話">
                          <Input
                            value={productForm.domestic_vendor_phone}
                            onChange={(e) => setProductForm((v) => ({ ...v, domestic_vendor_phone: e.target.value }))}
                          />
                        </Field>
                        <Field label="國內負責廠商地址">
                          <Input
                            value={productForm.domestic_vendor_address}
                            onChange={(e) => setProductForm((v) => ({ ...v, domestic_vendor_address: e.target.value }))}
                          />
                        </Field>
                      </div>
                      <Field label="素食種類">
                        <Input
                          value={productForm.vegetarian_type}
                          onChange={(e) => setProductForm((v) => ({ ...v, vegetarian_type: e.target.value }))}
                        />
                      </Field>
                      <Field label="產品成份及食品添加物">
                        <TradeTextarea
                          value={productForm.ingredients}
                          onChange={(value) => setProductForm((v) => ({ ...v, ingredients: value }))}
                        />
                      </Field>
                      <Field label="過敏原">
                        <TradeTextarea
                          value={productForm.allergens}
                          onChange={(value) => setProductForm((v) => ({ ...v, allergens: value }))}
                          placeholder="食品、蛋糕、生鮮可填寫；其他商品可留空。"
                        />
                      </Field>
                      <Field label="營養標示（文字）">
                        <TradeTextarea
                          value={productForm.nutrition_label}
                          onChange={(value) => setProductForm((v) => ({ ...v, nutrition_label: value }))}
                          placeholder="食品、蛋糕、生鮮適用。"
                        />
                      </Field>
                      <Field label="商品宣稱 / 行銷重點">
                        <TradeTextarea
                          value={productForm.marketing_claim}
                          onChange={(value) => setProductForm((v) => ({ ...v, marketing_claim: value }))}
                        />
                      </Field>
                      <Field label="產品責任險">
                        <TradeTextarea
                          value={productForm.liability_insurance}
                          onChange={(value) => setProductForm((v) => ({ ...v, liability_insurance: value }))}
                        />
                      </Field>
                      <Field label="食品業者登錄字號">
                        <TradeTextarea
                          value={productForm.food_registration_no}
                          onChange={(value) => setProductForm((v) => ({ ...v, food_registration_no: value }))}
                        />
                      </Field>
                      <Field label="檢驗許可證字號 / 成分許可">
                        <TradeTextarea
                          value={productForm.permit_no}
                          onChange={(value) => setProductForm((v) => ({ ...v, permit_no: value }))}
                          placeholder="美妝、保養品、藥品或法規管轄商品適用。"
                        />
                      </Field>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="退換貨條款（必填）">
                          <TradeTextarea
                            value={productForm.return_policy}
                            onChange={(value) => setProductForm((v) => ({ ...v, return_policy: value }))}
                            required
                          />
                        </Field>
                        <Field label="售後保固條款">
                          <TradeTextarea
                            value={productForm.warranty_policy}
                            onChange={(value) => setProductForm((v) => ({ ...v, warranty_policy: value }))}
                          />
                        </Field>
                      </div>
                      <Field label="檢測認證">
                        <Input
                          value={productForm.certifications}
                          onChange={(e) =>
                            setProductForm((v) => ({ ...v, certifications: e.target.value }))
                          }
                          placeholder="例如：SGS、CE"
                        />
                      </Field>
                    </FormSection>
                    <FormSection
                      eyebrow="06"
                      title="商品圖片"
                      description="上傳商品圖後可以先用 AI 辨識帶入草稿，再由你確認資料。"
                    >
                      <Field label="商品圖片">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => setProductFiles(Array.from(e.target.files ?? []))}
                          className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:text-white"
                        />
                        <p className="text-xs text-neutral-500">
                          {productFiles.length > 0
                            ? `已選擇 ${productFiles.length} 個檔案，送出商品後會一併上傳。`
                            : "支援多張圖片，上傳後會存入本地 public 資產路徑；部署時可用 ASSET_BASE_URL 接 CDN。"}
                        </p>
                      </Field>
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void analyzeProductImages()}
                          disabled={analyzingImages || productFiles.length === 0}
                        >
                          {analyzingImages ? "辨識中..." : "AI 辨識圖片並預填"}
                        </Button>
                        {draftConfidence != null ? (
                          <span className="text-sm text-neutral-500">
                            辨識信心 {Math.round(draftConfidence * 100)}%
                          </span>
                        ) : null}
                      </div>
                      {draftImages.length > 0 ? (
                        <div className="rounded-md border bg-neutral-50 p-3">
                          <div className="text-sm font-medium">已上傳草稿圖片</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {draftImages.map((image, index) => (
                              <img
                                key={`draft-image-${index}`}
                                src={image}
                                alt="draft"
                                className="h-20 w-20 rounded-md border object-cover"
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {Object.keys(draftAttributes).length > 0 ? (
                        <div className="rounded-md border bg-neutral-50 p-3">
                          <div className="text-sm font-medium">AI 辨識到的商品特徵</div>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {Object.entries(draftAttributes).map(([key, value]) => (
                              <div key={key} className="rounded border bg-white px-3 py-2 text-sm">
                                <div className="text-neutral-500">{key}</div>
                                <div className="font-medium">{value}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {editingProductId ? (
                        <div className="rounded-md border bg-neutral-50 p-3">
                          <div className="text-sm font-medium">目前圖片</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(myProducts.find((product) => product.id === editingProductId)?.images ?? []).length === 0 ? (
                              <div className="text-sm text-neutral-500">目前沒有圖片。</div>
                            ) : (
                              myProducts
                                .find((product) => product.id === editingProductId)
                                ?.images.map((image, index) => (
                                  <img
                                    key={`${editingProductId}-${index}`}
                                    src={image}
                                    alt="product"
                                    className="h-20 w-20 rounded-md border object-cover"
                                  />
                                ))
                            )}
                          </div>
                        </div>
                      ) : null}
                    </FormSection>
                    <div className="flex items-center gap-3">
                      <Button type="submit" disabled={savingProduct || uploadingImages}>
                        {savingProduct ? (editingProductId ? "更新中..." : "建立中...") : editingProductId ? "更新商品" : "建立商品"}
                      </Button>
                      {uploadingImages ? <span className="text-sm text-neutral-500">圖片上傳中...</span> : null}
                      {editingProductId && (
                        <Button type="button" variant="outline" onClick={cancelEditProduct}>
                          取消編輯
                        </Button>
                      )}
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="inquiries">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-neutral-200 bg-white p-4 shadow-sm">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-neutral-950">詢價工作台</h2>
                <p className="mt-1 text-sm text-neutral-500">把採購端與賣家端工作區拆成子頁切換，閱讀和操作都會更專注。</p>
              </div>
              <div className="inline-flex rounded-2xl border border-neutral-200 bg-neutral-50 p-1">
                <button
                  type="button"
                  onClick={() => setInquirySubTab("sent")}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    inquirySubTab === "sent" ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"
                  }`}
                >
                  我送出的詢價
                </button>
                <button
                  type="button"
                  onClick={() => setInquirySubTab("received")}
                  disabled={!canSell}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    inquirySubTab === "received" ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"
                  }`}
                >
                  我收到的詢價
                </button>
              </div>
            </div>

            {inquirySubTab === "sent" ? (
            <InquiryColumn
              title="我送出的詢價"
              items={sentInquiries}
              side="buyer"
              onCreateSupport={(id) => void createSupportFromInquiry(id)}
              creatingSupportId={creatingSupportFromInquiryId}
              onUpdateStatus={(id, nextStatus) => void updateInquiryStatus(id, nextStatus)}
              updatingStatusId={updatingInquiryStatusId}
              getQuotationDraft={getQuotationDraft}
              onUpdateQuotationDraft={updateQuotationDraft}
              onSaveQuotation={(inquiry) => void saveQuotation(inquiry)}
            />
            ) : null}

            {inquirySubTab === "received" ? (
            <InquiryColumn
              title="我收到的詢價"
              items={receivedInquiries}
              side="seller"
              onCreateOrder={(id) => void createOrderFromInquiry(id)}
              creatingOrderId={creatingOrderFromInquiryId}
              onCreateSupport={(id) => void createSupportFromInquiry(id)}
              creatingSupportId={creatingSupportFromInquiryId}
              onUpdateStatus={(id, nextStatus) => void updateInquiryStatus(id, nextStatus)}
              updatingStatusId={updatingInquiryStatusId}
              getQuotationDraft={getQuotationDraft}
              onUpdateQuotationDraft={updateQuotationDraft}
              onSaveQuotation={(inquiry) => void saveQuotation(inquiry)}
            />
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="profile">
          <Card className="max-w-4xl overflow-hidden rounded-[24px] border-neutral-200 shadow-sm">
            <CardHeader className="border-b border-neutral-100 bg-neutral-50/70">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-950 text-white">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>賣家身份檔案</CardTitle>
                  <CardDescription>
                升級方案後可建立賣家身份檔案，送到 admin portal 進行審核。審核通過後才會開放商品上架與 Seller 功能。
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 lg:p-6">
              {profileGateReason === "seller_plan_locked" ? (
                <div className="rounded-xl border border-dashed p-8 text-sm text-neutral-600">
                  你目前已可使用市場商品與詢價功能。若要申請賣家身份並上架商品，請先到方案頁升級。
                  <div className="mt-4">
                    <a href="/billing">
                      <Button>前往方案計費</Button>
                    </a>
                  </div>
                </div>
              ) : (
              <>
              {profile?.verified === false ? (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  目前狀態：待 admin 審核。若你更新檔案內容，系統也會重新送審。
                </div>
              ) : null}
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                  目前申請類型：<span className="font-medium uppercase">seller</span>
                </div>
                {registeredCompany ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
                    <span>
                      你註冊時選擇公司身份（{registeredCompany.name}），可直接帶入公司註冊資訊。
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={applyRegisteredCompany}>
                      帶入公司註冊資訊
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-600">
                    你註冊時選擇一般個人身份，請於下方欄位填寫公司資訊。
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="公司名稱（必填）">
                    <Input
                      value={profileForm.company_name}
                      onChange={(e) => setProfileForm((v) => ({ ...v, company_name: e.target.value }))}
                      placeholder="請填寫經濟部商工登記公司全名，例如：xxxx有限公司"
                      required
                    />
                  </Field>
                  <Field label="公司英文名稱（必填）">
                    <Input
                      value={profileForm.company_name_en}
                      onChange={(e) => setProfileForm((v) => ({ ...v, company_name_en: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field label="營利統編（必填）">
                    <div className="space-y-1">
                      <Input
                        value={profileForm.tax_id}
                        onChange={(e) => setProfileForm((v) => ({ ...v, tax_id: e.target.value }))}
                        placeholder="例如：12345678"
                        maxLength={8}
                        required
                      />
                      {profileTaxLookup === "loading" ? (
                        <p className="text-xs text-neutral-500">查詢商工登記資料中...</p>
                      ) : null}
                      {profileTaxLookup === "invalid" ? (
                        <p className="text-xs text-amber-600">統編需為 8 碼，輸入後會自動帶入公司資料。</p>
                      ) : null}
                      {profileTaxLookup === "success" ? (
                        <p className="text-xs text-emerald-600">已自動帶入商工登記的公司名稱與地址，可再調整。</p>
                      ) : null}
                      {profileTaxLookup === "not_found" ? (
                        <p className="text-xs text-amber-600">查無公司資料，請自行填寫公司名稱與地址。</p>
                      ) : null}
                      {profileTaxLookup === "error" ? (
                        <p className="text-xs text-red-600">統編查詢失敗，請自行填寫或稍後再試。</p>
                      ) : null}
                    </div>
                  </Field>
                  <Field label="公司產業（必填）">
                    <Input
                      value={profileForm.industry}
                      onChange={(e) => setProfileForm((v) => ({ ...v, industry: e.target.value }))}
                      required
                    />
                  </Field>
                </div>
                <Field label="公司地址（必填）">
                  <Input
                    value={profileForm.company_address}
                    onChange={(e) => setProfileForm((v) => ({ ...v, company_address: e.target.value }))}
                    placeholder="例如：xxx市xxxx區xxxxxxx路"
                    required
                  />
                </Field>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="公司聯絡人姓名（必填）">
                    <Input
                      value={profileForm.contact_name}
                      onChange={(e) => setProfileForm((v) => ({ ...v, contact_name: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field label="公司聯絡電話（必填）">
                    <Input
                      value={profileForm.contact_phone}
                      onChange={(e) => setProfileForm((v) => ({ ...v, contact_phone: e.target.value }))}
                      placeholder="請填寫區域代碼、勿使用符號"
                      required
                    />
                  </Field>
                  <Field label="公司聯絡人信箱（必填）">
                    <Input
                      type="email"
                      value={profileForm.contact_email}
                      onChange={(e) => setProfileForm((v) => ({ ...v, contact_email: e.target.value }))}
                      placeholder="相關服務資訊將寄送到此信箱"
                      required
                    />
                  </Field>
                </div>
                <Field label="如何知道此系統服務？（可多選，必填）">
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    {REFERRAL_OPTIONS.map((option) => (
                      <label key={option} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={profileForm.referral_sources.includes(option)}
                          onChange={(e) =>
                            setProfileForm((v) => ({
                              ...v,
                              referral_sources: e.target.checked
                                ? [...v.referral_sources, option]
                                : v.referral_sources.filter((item) => item !== option),
                            }))
                          }
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="公司官方網站">
                  <Input
                    value={profileForm.website}
                    onChange={(e) => setProfileForm((v) => ({ ...v, website: e.target.value }))}
                    placeholder="請輸入網址，若無請跳過"
                  />
                </Field>
                <Field label="備註">
                  <textarea
                    value={profileForm.remarks}
                    onChange={(e) => setProfileForm((v) => ({ ...v, remarks: e.target.value }))}
                    className="min-h-20 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                  />
                </Field>
                <Field label="公司 / 服務簡介（可選填）">
                  <textarea
                    value={profileForm.description}
                    onChange={(e) => setProfileForm((v) => ({ ...v, description: e.target.value }))}
                    className="min-h-28 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                  />
                </Field>
                <div className="space-y-4 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
                  <div className="text-sm font-medium text-neutral-800">收款帳戶</div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="帳戶名稱">
                      <Input
                        value={profileForm.bank_account_name}
                        onChange={(e) => setProfileForm((v) => ({ ...v, bank_account_name: e.target.value }))}
                      />
                    </Field>
                    <Field label="帳戶號碼">
                      <Input
                        value={profileForm.bank_account_number}
                        onChange={(e) => setProfileForm((v) => ({ ...v, bank_account_number: e.target.value }))}
                      />
                    </Field>
                    <Field label="SWIFT CODE">
                      <Input
                        value={profileForm.bank_swift_code}
                        onChange={(e) => setProfileForm((v) => ({ ...v, bank_swift_code: e.target.value }))}
                      />
                    </Field>
                  </div>
                  <Field label="存摺照片（需顯示帳戶完整資訊）">
                    <div className="space-y-2">
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadPassbook(file);
                        }}
                      />
                      {uploadingPassbook ? <div className="text-xs text-neutral-500">上傳中...</div> : null}
                      {profileForm.bank_passbook_image ? (
                        <a
                          href={profileForm.bank_passbook_image}
                          target="_blank"
                          className="text-xs font-medium text-neutral-600 underline underline-offset-4"
                        >
                          檢視已上傳的存摺照片
                        </a>
                      ) : null}
                    </div>
                  </Field>
                </div>
                <Field label="產品類別（可選填，逗號分隔）">
                  <Input
                    value={profileForm.product_categories}
                    onChange={(e) =>
                      setProfileForm((v) => ({ ...v, product_categories: e.target.value }))
                    }
                  />
                </Field>
                <label className="flex items-start gap-2 rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={profileForm.contract_agreed}
                    onChange={(e) => setProfileForm((v) => ({ ...v, contract_agreed: e.target.checked }))}
                    required
                  />
                  <span>
                    我已閱讀並同意平台合約條款，且了解禁止上架違禁品（例如：槍械、非法藥物等）。（必填）
                  </span>
                </label>
                <Button type="submit" className="min-w-32" disabled={savingProfile}>
                  {savingProfile ? "儲存中..." : "儲存檔案"}
                </Button>
              </form>
              </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{label}</Label>
      {children}
    </div>
  );
}

function FormSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-visible rounded-[22px] border border-neutral-200 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-5 flex flex-col gap-2 border-b border-neutral-100 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">{eyebrow}</div>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-neutral-950">{title}</h3>
        </div>
        <p className="max-w-xl text-sm leading-6 text-neutral-500">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function TradeTextarea({
  value,
  onChange,
  placeholder,
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      required={required}
      className="min-h-24 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm leading-6 text-neutral-900 outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-900"
    />
  );
}

function SearchablePicker({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  emptyLabel?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = normalizedQuery
    ? options.filter((option) => option.toLowerCase().includes(normalizedQuery))
    : options;

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input
          value={open ? query : value}
          onFocus={() => {
            setQuery(value);
            setOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
          onChange={(event) => {
            const nextValue = event.target.value;
            setQuery(nextValue);
            onChange(nextValue);
            setOpen(true);
          }}
          placeholder={placeholder}
          required={required}
          className="pl-9"
        />
      </div>
      {open ? (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
          <div className="max-h-64 overflow-y-auto py-1">
            {emptyLabel ? (
              <button
                type="button"
                className="flex w-full items-center px-3 py-2 text-left text-sm text-neutral-600 hover:bg-neutral-50"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setQuery("");
                  onChange("");
                  setOpen(false);
                }}
              >
                {emptyLabel}
              </button>
            ) : null}
            {visibleOptions.map((option) => (
              <button
                key={option}
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-50"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setQuery(option);
                  onChange(option);
                  setOpen(false);
                }}
              >
                <span className="truncate">{option}</span>
                {option === value ? <span className="h-1.5 w-1.5 rounded-full bg-neutral-900" /> : null}
              </button>
            ))}
            {visibleOptions.length === 0 ? (
              <div className="px-3 py-3 text-sm text-neutral-500">
                沒有相符分類，會保留你輸入的「{query.trim()}」。
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-neutral-900">{children}</div>
    </div>
  );
}

function TradeMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function InquiryColumn({
  title,
  items,
  side,
  onCreateOrder,
  creatingOrderId,
  onCreateSupport,
  creatingSupportId,
  onUpdateStatus,
  updatingStatusId,
  getQuotationDraft,
  onUpdateQuotationDraft,
  onSaveQuotation,
}: {
  title: string;
  items: Inquiry[];
  side: "buyer" | "seller";
  onCreateOrder?: (inquiryId: string) => void;
  creatingOrderId?: string | null;
  onCreateSupport?: (inquiryId: string) => void;
  creatingSupportId?: string | null;
  onUpdateStatus?: (inquiryId: string, status: "replied" | "negotiating" | "closed" | "expired") => void;
  updatingStatusId?: string | null;
  getQuotationDraft?: (inquiry: Inquiry) => { quoted_price: string; quoted_quantity: string; quotation_notes: string };
  onUpdateQuotationDraft?: (
    inquiryId: string,
    patch: Partial<{ quoted_price: string; quoted_quantity: string; quotation_notes: string }>,
  ) => void;
  onSaveQuotation?: (inquiry: Inquiry) => void;
}) {
  return (
    <Card className="overflow-hidden rounded-[24px] border-neutral-200 shadow-sm">
      <CardHeader className="border-b border-neutral-100 bg-neutral-50/70">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-950 text-white">
            {side === "buyer" ? <ClipboardList className="h-5 w-5" /> : <ScrollText className="h-5 w-5" />}
          </div>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{side === "buyer" ? "採購端視角" : "賣家視角"}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5 lg:p-6">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-neutral-500">
            尚無資料
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-[22px] border border-neutral-200 bg-white p-4 text-sm shadow-[0_14px_38px_-34px_rgba(15,23,42,0.35)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-neutral-950">{item.product.name}</div>
                  <div className="mt-1 text-neutral-500">
                    {side === "buyer"
                      ? `賣家：${item.seller.company?.name ?? item.seller.display_name ?? item.seller.email}`
                      : `買家：${item.buyer.company?.name ?? item.buyer.display_name ?? item.buyer.email}`}
                  </div>
                </div>
                <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-600">{item.status}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Info label="數量">{item.quantity}</Info>
                <Info label="目標價">{item.target_price ?? "未填寫"}</Info>
                <Info label="付款條件">{item.payment_terms ?? "未填寫"}</Info>
                <Info label="目的港">{item.port_of_destination ?? "未填寫"}</Info>
              </div>
              {(item.quoted_price != null || item.quoted_quantity != null || item.quotation_notes) ? (
                <div className="mt-4 rounded-2xl border border-neutral-200 bg-[linear-gradient(180deg,#fafafa,#ffffff)] p-4 text-sm">
                  <div className="font-medium text-neutral-950">目前報價</div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <Info label="報價數量">{item.quoted_quantity ?? item.quantity}</Info>
                    <Info label="報價單價">{item.quoted_price ?? "未填寫"}</Info>
                  </div>
                  {item.quotation_notes ? (
                    <div className="mt-3 rounded-xl bg-white px-3 py-3 whitespace-pre-wrap text-neutral-700">{item.quotation_notes}</div>
                  ) : null}
                  <div className="mt-2 text-xs text-neutral-500">quotation v{item.quotation_version}</div>
                </div>
              ) : null}
              {item.quotation_history && item.quotation_history.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-neutral-200 p-4 text-sm">
                  <div className="font-medium text-neutral-950">Quotation History</div>
                  <div className="mt-2 space-y-2">
                    {item.quotation_history
                      .slice()
                      .reverse()
                      .map((history) => (
                        <div key={`${item.id}-qv-${history.version}`} className="rounded-xl bg-neutral-50 p-3">
                          <div className="text-xs text-neutral-500">
                            v{history.version} · {new Date(history.updated_at).toLocaleString()}
                          </div>
                          <div className="mt-1">
                            qty {history.quoted_quantity ?? item.quantity} · price {history.quoted_price ?? "未填寫"} · {history.status}
                          </div>
                          {history.quotation_notes ? (
                            <div className="mt-1 whitespace-pre-wrap text-neutral-700">{history.quotation_notes}</div>
                          ) : null}
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Info label="建立時間">{new Date(item.created_at).toLocaleDateString()}</Info>
                <Info label="有效期限">{new Date(item.expires_at).toLocaleDateString()}</Info>
              </div>
              {item.notes ? (
                <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm whitespace-pre-wrap text-neutral-700">
                  {item.notes}
                </div>
              ) : null}
              {side === "seller" ? (
                <div className="mt-4 flex items-center gap-3">
                  <div className="w-full space-y-3 rounded-2xl border border-neutral-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-4">
                    <div className="font-medium text-neutral-950">建立 / 更新報價</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="mb-1 text-xs text-neutral-500">報價數量</div>
                        <Input
                          value={getQuotationDraft?.(item).quoted_quantity ?? ""}
                          onChange={(e) => onUpdateQuotationDraft?.(item.id, { quoted_quantity: e.target.value })}
                        />
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-neutral-500">報價單價</div>
                        <Input
                          value={getQuotationDraft?.(item).quoted_price ?? ""}
                          onChange={(e) => onUpdateQuotationDraft?.(item.id, { quoted_price: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-neutral-500">報價備註</div>
                      <textarea
                        value={getQuotationDraft?.(item).quotation_notes ?? ""}
                        onChange={(e) => onUpdateQuotationDraft?.(item.id, { quotation_notes: e.target.value })}
                        className="min-h-24 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-3 text-sm"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => onSaveQuotation?.(item)}
                      disabled={updatingStatusId === item.id}
                    >
                      {updatingStatusId === item.id ? "更新中..." : "送出報價並進入 replied"}
                    </Button>
                  </div>
                </div>
              ) : null}
              {side === "seller" ? (
                <div className="mt-4 flex items-center gap-3 flex-wrap">
                  <Link href={`/trade/buyers/${item.buyer.id}`}>
                    <Button size="sm" variant="outline">Buyer 詳情</Button>
                  </Link>
                  <a href={`/api/trade/inquiries/${item.id}/quotation.pdf`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="ghost">下載報價 PDF</Button>
                  </a>
                  {item.status !== "replied" && item.status !== "closed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateStatus?.(item.id, "replied")}
                      disabled={updatingStatusId === item.id}
                    >
                      {updatingStatusId === item.id ? "更新中..." : "標記已回覆報價"}
                    </Button>
                  ) : null}
                  {item.status !== "closed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateStatus?.(item.id, "closed")}
                      disabled={updatingStatusId === item.id}
                    >
                      {updatingStatusId === item.id ? "更新中..." : "關閉詢價"}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    onClick={() => onCreateOrder?.(item.id)}
                    disabled={creatingOrderId === item.id || item.status === "closed"}
                  >
                    {creatingOrderId === item.id ? "建立中..." : "轉成訂單草稿"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onCreateSupport?.(item.id)}
                    disabled={creatingSupportId === item.id}
                  >
                    {creatingSupportId === item.id ? "建立中..." : "轉人工單"}
                  </Button>
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-3">
                  {item.status === "replied" ? (
                    <a href={`/api/trade/inquiries/${item.id}/quotation.pdf`} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost">查看報價 PDF</Button>
                    </a>
                  ) : null}
                  {item.status === "replied" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateStatus?.(item.id, "negotiating")}
                      disabled={updatingStatusId === item.id}
                    >
                      {updatingStatusId === item.id ? "更新中..." : "進入議價"}
                    </Button>
                  ) : null}
                  {item.status !== "closed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateStatus?.(item.id, "closed")}
                      disabled={updatingStatusId === item.id}
                    >
                      {updatingStatusId === item.id ? "更新中..." : "完成並關閉"}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onCreateSupport?.(item.id)}
                    disabled={creatingSupportId === item.id}
                  >
                    {creatingSupportId === item.id ? "建立中..." : "這筆詢價需要人工協助"}
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptionalInt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  return Number.isFinite(num) ? Math.trunc(num) : undefined;
}

function readSpec(specs: Record<string, unknown> | null | undefined, key: string) {
  const value = specs?.[key];
  return typeof value === "string" ? value : "";
}

function readSpecBool(specs: Record<string, unknown> | null | undefined, key: string) {
  return specs?.[key] === true;
}

function readSpecMatrix(specs: Record<string, unknown> | null | undefined, priceMin: number | null) {
  const raw = specs?.spec_matrix;
  const matrix = SPEC_MATRIX_COLUMNS.map((_, index) => {
    const entry = Array.isArray(raw) ? (raw[index] as Record<string, unknown> | undefined) : undefined;
    return {
      price_usd: typeof entry?.price_usd === "string" ? entry.price_usd : "",
      dimensions_cm: typeof entry?.dimensions_cm === "string" ? entry.dimensions_cm : "",
      net_weight_kg: typeof entry?.net_weight_kg === "string" ? entry.net_weight_kg : "",
      gross_weight_kg: typeof entry?.gross_weight_kg === "string" ? entry.gross_weight_kg : "",
    };
  });
  if (!matrix[0].price_usd && priceMin != null) {
    matrix[0].price_usd = String(priceMin);
  }
  return matrix;
}

function readSpecialVariants(specs: Record<string, unknown> | null | undefined) {
  const raw = specs?.special_variants;
  if (!Array.isArray(raw) || raw.length === 0) return [{ ...EMPTY_SPECIAL_VARIANT }];
  return raw.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      name: typeof row.name === "string" ? row.name : "",
      english_name: typeof row.english_name === "string" ? row.english_name : "",
      spec: typeof row.spec === "string" ? row.spec : "",
      price_fob_usd: typeof row.price_fob_usd === "string" ? row.price_fob_usd : "",
    };
  });
}

function ProductImagePreview({
  images,
  name,
  className = "",
}: {
  images: string[] | undefined;
  name: string;
  className?: string;
}) {
  const image = images?.[0];

  if (!image) {
    return (
      <div
        className={`flex items-center justify-center rounded-[24px] border border-dashed border-neutral-300 bg-[linear-gradient(135deg,#fafafa,#f1f5f9)] text-sm text-neutral-400 ${className}`}
      >
        尚無商品圖
      </div>
    );
  }

  return (
    <img
      src={image}
      alt={name}
      className={`rounded-[24px] border border-neutral-200 object-cover ${className}`}
    />
  );
}

function formatPrice(min: number | null, max: number | null, currency: string) {
  if (min == null && max == null) return "待議";
  const value = min ?? max!;
  return `${currency} ${value.toLocaleString()} FOB`;
}
