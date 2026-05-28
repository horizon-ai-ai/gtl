import type { CompanyProfile, Inquiry, Product, User } from "@prisma/client";
import { dash, type PIData, type PIDataLineItem, type PIDataParty } from "./pi-data";

type UserWithCompany = User & { company: CompanyProfile | null };

export type InquiryWithRelations = Inquiry & {
  product: Product | null;
  buyer: UserWithCompany;
  seller: UserWithCompany;
};

function partyFrom(user: UserWithCompany | null | undefined): PIDataParty {
  const company = user?.company ?? null;
  return {
    name: dash(company?.name ?? user?.display_name ?? user?.email),
    address: dash(company?.address),
    contact_name: dash(company?.contact_name ?? user?.display_name),
    contact_phone: dash(company?.contact_phone),
  };
}

function lineItemFrom(inquiry: InquiryWithRelations): PIDataLineItem {
  const product = inquiry.product ?? null;
  const quantity = inquiry.quoted_quantity ?? inquiry.quantity;
  const unitPrice = inquiry.quoted_price;
  const amount =
    unitPrice != null && inquiry.quoted_quantity != null
      ? unitPrice * inquiry.quoted_quantity
      : null;
  return {
    description: dash(product?.name),
    quantity: dash(quantity),
    unit: dash(product?.unit),
    unit_price: dash(unitPrice),
    amount: dash(amount),
  };
}

export function inquiryToPIData(inquiry: InquiryWithRelations): PIData {
  const product = inquiry.product ?? null;
  const lineItem = lineItemFrom(inquiry);
  const additional = inquiry.quotation_notes ?? inquiry.notes ?? null;

  return {
    metadata: {
      invoice_no: dash(null),
      invoice_date: dash(null),
      expiration_date: dash(null),
      customer_id: dash(null),
    },
    seller: partyFrom(inquiry.seller),
    customer: partyFrom(inquiry.buyer),
    shipping: {
      freight_type: dash(null),
      est_ship_date: dash(null),
      est_gross_weight: dash(null),
      est_net_weight: dash(null),
      package_count: dash(null),
      country_of_origin: dash(product?.origin_country),
      port_of_embarkation: dash(null),
      port_of_destination: dash(inquiry.port_of_destination),
      delivery_terms: dash(inquiry.delivery_terms),
      payment_terms: dash(inquiry.payment_terms),
    },
    line_items: [lineItem],
    totals: {
      subtotal: lineItem.amount,
      tax_rate: dash(null),
      tax: dash(null),
      total: lineItem.amount,
      currency: dash(product?.currency),
    },
    additional_details: dash(additional),
    signature: {
      typed_name: dash(null),
      date: dash(null),
    },
  };
}
