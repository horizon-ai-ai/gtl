import type { CompanyProfile, Inquiry, Product, User } from "@prisma/client";
import {
  dash,
  type PICustomerParty,
  type PIData,
  type PILineItem,
  type PISellerParty,
} from "./pi-data";

type UserWithCompany = User & { company: CompanyProfile | null };

export type InquiryWithRelations = Inquiry & {
  product: Product | null;
  buyer: UserWithCompany;
  seller: UserWithCompany;
};

function sellerFrom(user: UserWithCompany | null | undefined): PISellerParty {
  const company = user?.company ?? null;
  return {
    company_name: dash(company?.name ?? user?.display_name ?? user?.email),
    street_address: dash(company?.address),
    city_state_zip: dash(null),
    phone: dash(company?.contact_phone),
    fax: dash(null),
    website: dash(null),
  };
}

function customerFrom(user: UserWithCompany | null | undefined): PICustomerParty {
  const company = user?.company ?? null;
  return {
    name: dash(company?.contact_name ?? user?.display_name),
    company_name: dash(company?.name ?? user?.display_name ?? user?.email),
    street_address: dash(company?.address),
    city_state_zip: dash(null),
    phone: dash(company?.contact_phone),
  };
}

function lineItemFrom(inquiry: InquiryWithRelations): PILineItem {
  const product = inquiry.product ?? null;
  const qty = inquiry.quoted_quantity ?? inquiry.quantity;
  const unitPrice = inquiry.quoted_price;
  const amount =
    unitPrice != null && inquiry.quoted_quantity != null
      ? unitPrice * inquiry.quoted_quantity
      : null;
  return {
    part_number: dash(null),
    unit_of_measure: dash(product?.unit),
    description: dash(product?.name),
    qty: dash(qty),
    unit_price: dash(unitPrice),
    tax: dash(null),
    total_amount: dash(amount),
  };
}

export function inquiryToPIData(inquiry: InquiryWithRelations): PIData {
  const product = inquiry.product ?? null;
  const lineItem = lineItemFrom(inquiry);
  const seller = sellerFrom(inquiry.seller);

  return {
    metadata: {
      date: dash(null),
      expiration_date: dash(null),
      invoice_no: dash(null),
      customer_id: dash(null),
    },
    seller,
    customer: customerFrom(inquiry.buyer),
    shipping: {
      freight_type: dash(null),
      est_ship_date: dash(null),
      est_gross_weight: dash(null),
      est_cubic_weight: dash(null),
      total_packages: dash(null),
    },
    line_items: [lineItem],
    totals: {
      subtotal: lineItem.total_amount,
      taxable: lineItem.total_amount,
      tax_rate: dash(null),
      tax: dash(null),
      freight: dash(null),
      insurance: dash(null),
      legal_consular: dash(null),
      other1: dash(null),
      other2: dash(null),
      total: lineItem.total_amount,
      currency: dash(product?.currency),
    },
    terms_of_sale: {
      delivery_terms: dash(inquiry.delivery_terms),
      payment_terms: dash(inquiry.payment_terms),
      comments: dash(inquiry.quotation_notes ?? inquiry.notes),
    },
    additional: {
      country_of_origin: dash(product?.origin_country),
      port_of_embarkation: dash(null),
      port_of_discharge: dash(inquiry.port_of_destination),
      reason_for_export: dash(null),
    },
    signature: {
      typed_name: dash(null),
      company_name: seller.company_name,
      date: dash(null),
    },
  };
}
