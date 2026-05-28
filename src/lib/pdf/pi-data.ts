export const EM_DASH = "—";

export function dash(value: unknown): string {
  if (value === null || value === undefined) return EM_DASH;
  if (typeof value === "string" && value === "") return EM_DASH;
  return String(value);
}

export interface PIDataParty {
  name: string;
  address: string;
  contact_name: string;
  contact_phone: string;
}

export interface PIDataMetadata {
  invoice_no: string;
  invoice_date: string;
  expiration_date: string;
  customer_id: string;
}

export interface PIDataShipping {
  freight_type: string;
  est_ship_date: string;
  est_gross_weight: string;
  est_net_weight: string;
  package_count: string;
  country_of_origin: string;
  port_of_embarkation: string;
  port_of_destination: string;
  delivery_terms: string;
  payment_terms: string;
}

export interface PIDataLineItem {
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
  amount: string;
}

export interface PIDataTotals {
  subtotal: string;
  tax_rate: string;
  tax: string;
  total: string;
  currency: string;
}

export interface PIDataSignature {
  typed_name: string;
  date: string;
}

export interface PIData {
  metadata: PIDataMetadata;
  seller: PIDataParty;
  customer: PIDataParty;
  shipping: PIDataShipping;
  line_items: PIDataLineItem[];
  totals: PIDataTotals;
  additional_details: string;
  signature: PIDataSignature;
}
