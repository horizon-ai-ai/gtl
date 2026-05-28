export const EM_DASH = "—";

export function dash(value: unknown): string {
  if (value === null || value === undefined) return EM_DASH;
  if (typeof value === "string" && value === "") return EM_DASH;
  return String(value);
}

export interface PIMetadata {
  date: string;
  expiration_date: string;
  invoice_no: string;
  customer_id: string;
}

export interface PISellerParty {
  company_name: string;
  street_address: string;
  city_state_zip: string;
  phone: string;
  fax: string;
  website: string;
}

export interface PICustomerParty {
  name: string;
  company_name: string;
  street_address: string;
  city_state_zip: string;
  phone: string;
}

export interface PIShipping {
  freight_type: string;
  est_ship_date: string;
  est_gross_weight: string;
  est_cubic_weight: string;
  total_packages: string;
}

export interface PILineItem {
  part_number: string;
  unit_of_measure: string;
  description: string;
  qty: string;
  unit_price: string;
  tax: string;
  total_amount: string;
}

export interface PITotals {
  subtotal: string;
  taxable: string;
  tax_rate: string;
  tax: string;
  freight: string;
  insurance: string;
  legal_consular: string;
  other1: string;
  other2: string;
  total: string;
  currency: string;
}

export interface PITermsOfSale {
  delivery_terms: string;
  payment_terms: string;
  comments: string;
}

export interface PIAdditional {
  country_of_origin: string;
  port_of_embarkation: string;
  port_of_discharge: string;
  reason_for_export: string;
}

export interface PISignature {
  typed_name: string;
  company_name: string;
  date: string;
}

export interface PIData {
  metadata: PIMetadata;
  seller: PISellerParty;
  customer: PICustomerParty;
  shipping: PIShipping;
  line_items: PILineItem[];
  totals: PITotals;
  terms_of_sale: PITermsOfSale;
  additional: PIAdditional;
  signature: PISignature;
}
