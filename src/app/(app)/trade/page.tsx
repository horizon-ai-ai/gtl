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

type TradeRole = "seller";

type TradeProfile = {
  role: TradeRole;
  description: string | null;
  product_categories: string[];
  target_markets: string[];
  budget_range: string | null;
  capacity: string | null;
  verified?: boolean;
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
};

const EMPTY_PRODUCT = {
  name: "",
  category: "",
  price_fob_usd: "",
  origin_country: "",
  brand: "",
  english_name: "",
  barcode: "",
  product_spec_text: "",
  tax_category: "",
  original_price: "",
  promo_price: "",
  special_spec_enabled: false,
  unit_length_cm: "",
  unit_width_cm: "",
  unit_height_cm: "",
  unit_weight_kg: "",
  carton_quantity: "",
  carton_net_weight_kg: "",
  carton_gross_weight_kg: "",
  storage_days: "",
  storage_unit: "",
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
  commission_rate: "",
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

export default function TradePage() {
  const [tab, setTab] = useState("market");
  const [productSubTab, setProductSubTab] = useState<"list" | "form">("list");
  const [inquirySubTab, setInquirySubTab] = useState<"sent" | "received">("sent");
  const [access, setAccess] = useState<TradeAccess | null>(null);
  const [profile, setProfile] = useState<TradeProfile>(null);
  const [catalog, setCatalog] = useState<TradeCatalog>({ categories: [], hs_codes: [] });
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
        ...(nextAccess.seller_allowed ? [loadSellerSites()] : []),
      ]);
      setLoading(false);
    })();
  }, []);

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
      setProfileForm({
        role: nextProfile.role,
        description: nextProfile.description ?? "",
        product_categories: nextProfile.product_categories.join(", "),
        target_markets: nextProfile.target_markets.join(", "),
        budget_range: nextProfile.budget_range ?? "",
        capacity: nextProfile.capacity ?? "",
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
    const res = await fetch("/api/trade/categories");
    const json = await res.json();
    setCatalog(json.data ?? { categories: [], hs_codes: [] });
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

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
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
      category: productForm.category,
      images: draftImages,
      specs: {
        brand: productForm.brand || undefined,
        english_name: productForm.english_name || undefined,
        barcode: productForm.barcode || undefined,
        product_spec_text: productForm.product_spec_text || undefined,
        tax_category: productForm.tax_category || undefined,
        original_price: productForm.original_price || undefined,
        promo_price: productForm.promo_price || undefined,
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
        carton_net_weight_kg: productForm.carton_net_weight_kg || undefined,
        carton_gross_weight_kg: productForm.carton_gross_weight_kg || undefined,
        storage_days: productForm.storage_days || undefined,
        storage_unit: productForm.storage_unit || undefined,
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
        commission_rate: productForm.commission_rate || undefined,
        linked_site_id: productForm.linked_site_id || undefined,
        linked_site_url: productForm.linked_site_url || undefined,
        ...draftAttributes,
      },
      price_fob_usd: parseOptionalInt(productForm.price_fob_usd),
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
      category: product.category ?? "",
      price_fob_usd: product.price_min == null ? "" : String(product.price_min),
      origin_country: product.origin_country ?? "",
      brand: readSpec(product.specs, "brand"),
      english_name: readSpec(product.specs, "english_name"),
      barcode: readSpec(product.specs, "barcode"),
      product_spec_text: readSpec(product.specs, "product_spec_text"),
      tax_category: readSpec(product.specs, "tax_category"),
      original_price: readSpec(product.specs, "original_price"),
      promo_price: readSpec(product.specs, "promo_price"),
      special_spec_enabled: readSpecBool(product.specs, "special_spec_enabled"),
      unit_length_cm: readSpec(product.specs, "unit_length_cm"),
      unit_width_cm: readSpec(product.specs, "unit_width_cm"),
      unit_height_cm: readSpec(product.specs, "unit_height_cm"),
      unit_weight_kg: readSpec(product.specs, "unit_weight_kg"),
      carton_quantity: readSpec(product.specs, "carton_quantity"),
      carton_net_weight_kg: readSpec(product.specs, "carton_net_weight_kg"),
      carton_gross_weight_kg: readSpec(product.specs, "carton_gross_weight_kg"),
      storage_days: readSpec(product.specs, "storage_days"),
      storage_unit: readSpec(product.specs, "storage_unit"),
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
      commission_rate: readSpec(product.specs, "commission_rate"),
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
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-8 lg:px-8">
      <section className="overflow-hidden rounded-[28px] border border-neutral-200 bg-[radial-gradient(circle_at_top_left,_rgba(241,244,255,0.95),_rgba(255,255,255,1)_42%),linear-gradient(135deg,_#ffffff,_#f6f8fb)] shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
        <div className="grid gap-8 px-6 py-7 lg:grid-cols-[1.4fr_0.9fr] lg:px-8 lg:py-8">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-neutral-600">
              <Globe2 className="h-3.5 w-3.5" />
              Trade Workspace
            </div>
            <div className="space-y-3">
              <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-neutral-950 lg:text-4xl">
                把商品、詢價、報價與貿易訂單整理成同一個工作台
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-neutral-600 lg:text-base">
                所有登入用戶都能在這裡瀏覽市場商品與送出詢價；升級方案並完成賣家身份審核後，才會開放商品上架、
                Seller quotation 與賣家通知功能。
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-[22px] border border-neutral-200 bg-white/90 p-5">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">目前角色</div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-950 text-white">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-2xl font-semibold uppercase text-neutral-950">{canSell ? "seller" : "buyer"}</div>
                  <div className="text-sm text-neutral-500">Buyer 能力預設開放；Seller 需訂閱並完成身份審核</div>
                </div>
              </div>
            </div>
            <div className="rounded-[22px] border border-neutral-200 bg-neutral-950 p-5 text-white">
              <div className="grid grid-cols-3 gap-4">
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
            <Card className="overflow-hidden rounded-[24px] border-neutral-200 shadow-sm">
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
                    <select
                      value={filters.category}
                      onChange={(e) => setFilters((v) => ({ ...v, category: e.target.value }))}
                      className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                    >
                      <option value="">全部類別</option>
                      {catalog.categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
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
            <Card className="overflow-hidden rounded-[24px] border-neutral-200 shadow-sm">
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
                  <form onSubmit={createProduct} className="space-y-4">
                    <Field label="類型">
                      <select
                        value={productForm.category}
                        onChange={(e) => setProductForm((v) => ({ ...v, category: e.target.value }))}
                        className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                        required
                      >
                        <option value="">請選擇類型</option>
                        {catalog.categories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="中文品名">
                        <Input
                          value={productForm.name}
                          onChange={(e) => setProductForm((v) => ({ ...v, name: e.target.value }))}
                          required
                        />
                      </Field>
                      <Field label="英文品名">
                        <Input
                          value={productForm.english_name}
                          onChange={(e) => setProductForm((v) => ({ ...v, english_name: e.target.value }))}
                        />
                      </Field>
                      <Field label="品牌">
                        <Input
                          value={productForm.brand}
                          onChange={(e) => setProductForm((v) => ({ ...v, brand: e.target.value }))}
                        />
                      </Field>
                      <Field label="條碼">
                        <Input
                          value={productForm.barcode}
                          onChange={(e) => setProductForm((v) => ({ ...v, barcode: e.target.value }))}
                        />
                      </Field>
                    </div>
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
                      <Field label="價格（USD）">
                        <Input
                          value={productForm.price_fob_usd}
                          onChange={(e) => setProductForm((v) => ({ ...v, price_fob_usd: e.target.value }))}
                        />
                      </Field>
                      <Field label="FOB">
                        <div className="flex h-10 items-center rounded-md border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-600">
                          FOB
                        </div>
                      </Field>
                      <Field label="產地">
                        <Input
                          value={productForm.origin_country}
                          onChange={(e) =>
                            setProductForm((v) => ({ ...v, origin_country: e.target.value }))
                          }
                        />
                      </Field>
                      <Field label="箱入數（一箱幾入）">
                        <Input
                          value={productForm.carton_quantity}
                          onChange={(e) => setProductForm((v) => ({ ...v, carton_quantity: e.target.value }))}
                        />
                      </Field>
                      <Field label="商品規格文字">
                        <Input
                          value={productForm.product_spec_text}
                          onChange={(e) => setProductForm((v) => ({ ...v, product_spec_text: e.target.value }))}
                          placeholder="例如：14片 x 3包 x 1件"
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
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="箱重（淨重 KG）">
                        <Input
                          value={productForm.carton_net_weight_kg}
                          onChange={(e) => setProductForm((v) => ({ ...v, carton_net_weight_kg: e.target.value }))}
                        />
                      </Field>
                      <Field label="箱重（毛重 KG）">
                        <Input
                          value={productForm.carton_gross_weight_kg}
                          onChange={(e) => setProductForm((v) => ({ ...v, carton_gross_weight_kg: e.target.value }))}
                        />
                      </Field>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="應免稅/稅別">
                        <Input
                          value={productForm.tax_category}
                          onChange={(e) => setProductForm((v) => ({ ...v, tax_category: e.target.value }))}
                        />
                      </Field>
                      <Field label="原價">
                        <Input
                          value={productForm.original_price}
                          onChange={(e) => setProductForm((v) => ({ ...v, original_price: e.target.value }))}
                        />
                      </Field>
                      <Field label="促銷價">
                        <Input
                          value={productForm.promo_price}
                          onChange={(e) => setProductForm((v) => ({ ...v, promo_price: e.target.value }))}
                        />
                      </Field>
                    </div>
                    <div className="rounded-md border p-4 space-y-4">
                      <label className="flex items-center gap-2 text-sm font-medium">
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
                    </div>
                    <div className="rounded-md border p-4 space-y-4">
                      <div className="text-sm font-medium">其他資訊</div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <Field label="保存日期">
                          <Input
                            value={productForm.storage_days}
                            onChange={(e) => setProductForm((v) => ({ ...v, storage_days: e.target.value }))}
                          />
                        </Field>
                        <Field label="保存日期單位">
                          <Input
                            value={productForm.storage_unit}
                            onChange={(e) => setProductForm((v) => ({ ...v, storage_unit: e.target.value }))}
                            placeholder="例如：日 / 月 / 年"
                          />
                        </Field>
                        <Field label="保存方式">
                          <Input
                            value={productForm.storage_method}
                            onChange={(e) => setProductForm((v) => ({ ...v, storage_method: e.target.value }))}
                            placeholder="例如：常溫 / 冷凍 / 冷藏"
                          />
                        </Field>
                      </div>
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
                      <Field label="商品特色說明">
                        <textarea
                          value={productForm.feature_description}
                          onChange={(e) => setProductForm((v) => ({ ...v, feature_description: e.target.value }))}
                          className="min-h-24 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                        />
                      </Field>
                      <Field label="商品完整說明">
                        <textarea
                          value={productForm.full_description}
                          onChange={(e) => setProductForm((v) => ({ ...v, full_description: e.target.value }))}
                          className="min-h-24 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
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
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="素食種類">
                          <Input
                            value={productForm.vegetarian_type}
                            onChange={(e) => setProductForm((v) => ({ ...v, vegetarian_type: e.target.value }))}
                          />
                        </Field>
                        <Field label="佣金比例（%）">
                          <Input
                            value={productForm.commission_rate}
                            onChange={(e) => setProductForm((v) => ({ ...v, commission_rate: e.target.value }))}
                          />
                        </Field>
                      </div>
                      <Field label="產品成份及食品添加物">
                        <textarea
                          value={productForm.ingredients}
                          onChange={(e) => setProductForm((v) => ({ ...v, ingredients: e.target.value }))}
                          className="min-h-24 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                        />
                      </Field>
                      <Field label="營養標示（文字）">
                        <textarea
                          value={productForm.marketing_claim}
                          onChange={(e) => setProductForm((v) => ({ ...v, marketing_claim: e.target.value }))}
                          className="min-h-24 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                        />
                      </Field>
                      <Field label="產品責任險">
                        <textarea
                          value={productForm.liability_insurance}
                          onChange={(e) => setProductForm((v) => ({ ...v, liability_insurance: e.target.value }))}
                          className="min-h-24 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                        />
                      </Field>
                      <Field label="食品業者登錄字號">
                        <textarea
                          value={productForm.food_registration_no}
                          onChange={(e) => setProductForm((v) => ({ ...v, food_registration_no: e.target.value }))}
                          className="min-h-24 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
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
                <Field label="公司 / 貿易簡介">
                  <textarea
                    value={profileForm.description}
                    onChange={(e) => setProfileForm((v) => ({ ...v, description: e.target.value }))}
                    className="min-h-28 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                  />
                </Field>
                <Field label="產品類別（逗號分隔）">
                  <Input
                    value={profileForm.product_categories}
                    onChange={(e) =>
                      setProfileForm((v) => ({ ...v, product_categories: e.target.value }))
                    }
                  />
                </Field>
                <Field label="目標市場（逗號分隔）">
                  <Input
                    value={profileForm.target_markets}
                    onChange={(e) =>
                      setProfileForm((v) => ({ ...v, target_markets: e.target.value }))
                    }
                  />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="預算區間">
                    <Input
                      value={profileForm.budget_range}
                      onChange={(e) =>
                        setProfileForm((v) => ({ ...v, budget_range: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="產能 / 交期能力">
                    <Input
                      value={profileForm.capacity}
                      onChange={(e) => setProfileForm((v) => ({ ...v, capacity: e.target.value }))}
                    />
                  </Field>
                </div>
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
