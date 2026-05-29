import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PIData } from "./pi-data";

const FONT_FAMILY = "Noto Sans CJK";
const BAR = "#44546A";
const BAR_TEXT = "#FFFFFF";
const GREY_BAR = "#808080";
const TITLE_COLOR = "#8497B0";
const RED = "#C00000";
const AMOUNT_SHADE = "#E6E6E6";
const META_SHADE = "#D9E1F2";
const INPUT_BORDER = "#9DABC4";
const LINE = "#BFBFBF";
const MUTED = "#1F3864";
const MIN_ITEM_ROWS = 8;

const styles = StyleSheet.create({
  page: { fontFamily: FONT_FAMILY, fontSize: 8, padding: 22, color: "#111" },

  // top region
  topRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  topLeft: { width: "55%", paddingRight: 10 },
  topRight: { width: "36%" },

  companyName: { fontSize: 13, fontWeight: 700, color: MUTED, marginBottom: 3 },
  sellerLine: { marginBottom: 1.5 },
  inlineLabel: { fontWeight: 700 },

  title: {
    fontSize: 17,
    fontWeight: 700,
    color: TITLE_COLOR,
    textAlign: "right",
    marginBottom: 6,
  },
  metaRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  metaLabel: { width: "45%", fontWeight: 700, color: MUTED },
  metaValShaded: {
    width: "55%",
    backgroundColor: META_SHADE,
    paddingVertical: 1.5,
    paddingHorizontal: 4,
    textAlign: "right",
  },
  metaValBoxed: {
    width: "55%",
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    paddingVertical: 1.5,
    paddingHorizontal: 4,
    textAlign: "right",
  },

  // mid region (customer | shipping)
  midRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  midLeft: { width: "30%" },
  midRight: { width: "36%" },

  bar: { backgroundColor: BAR, paddingVertical: 2.5, paddingHorizontal: 4 },
  barGrey: { backgroundColor: GREY_BAR, paddingVertical: 2.5, paddingHorizontal: 4 },
  barText: { color: BAR_TEXT, fontWeight: 700 },
  body: { paddingTop: 3, paddingHorizontal: 1 },
  bodyLine: { marginBottom: 1.5 },

  shipRow: { flexDirection: "row", marginBottom: 1.5 },
  shipLabel: { width: "48%", fontWeight: 700, color: MUTED },
  shipValue: { width: "52%" },

  // line items table
  table: { borderWidth: 1, borderColor: LINE, marginBottom: 6 },
  headRow: { flexDirection: "row", backgroundColor: BAR },
  headCell: {
    color: BAR_TEXT,
    fontWeight: 700,
    padding: 3,
    borderRightWidth: 1,
    borderRightColor: BAR,
  },
  redLine: { height: 1.5, backgroundColor: RED },
  row: { flexDirection: "row", minHeight: 13 },
  cell: { padding: 3, borderRightWidth: 1, borderRightColor: LINE },
  cellLast: { padding: 3 },
  cPart: { width: "11%" },
  cUom: { width: "11%" },
  cDesc: { width: "40%" },
  cQty: { width: "7%", textAlign: "right" },
  cPrice: { width: "11%", textAlign: "right" },
  cTax: { width: "6%", textAlign: "center" },
  cAmount: { width: "14%", textAlign: "right", backgroundColor: AMOUNT_SHADE },

  // lower region (terms | totals)
  lowerRow: { flexDirection: "row", marginBottom: 8 },
  lowerLeft: { width: "55%", paddingRight: 10 },
  lowerRight: { width: "45%" },
  termsBody: { paddingTop: 3, minHeight: 70 },
  termsLine: { marginBottom: 3 },

  totRow: { flexDirection: "row", alignItems: "center", marginBottom: 1.5 },
  totLabel: { width: "55%", color: MUTED },
  totValPlain: { width: "45%", textAlign: "right", paddingHorizontal: 4 },
  totValBoxed: {
    width: "45%",
    textAlign: "right",
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    paddingVertical: 1,
    paddingHorizontal: 4,
  },
  totGrand: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BAR,
    marginTop: 1,
  },
  totGrandLabel: {
    width: "55%",
    color: BAR_TEXT,
    fontWeight: 700,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  totGrandVal: {
    width: "45%",
    color: BAR_TEXT,
    fontWeight: 700,
    textAlign: "right",
    paddingVertical: 2,
    paddingHorizontal: 4,
  },

  // additional details
  addlBody: { paddingTop: 4 },
  addlRow: { flexDirection: "row", marginBottom: 1.5 },
  addlLabel: { width: "28%", color: MUTED },
  addlValue: { width: "72%" },
  reasonRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  reasonLabel: { width: "28%", color: MUTED },
  reasonBox: {
    width: "55%",
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    paddingVertical: 2,
    paddingHorizontal: 4,
    minHeight: 14,
  },
  cert: { marginTop: 10, marginBottom: 4 },
  sigRow: { flexDirection: "row", marginTop: 16, gap: 24 },
  sigCell: { flex: 1 },
  sigRule: { borderTopWidth: 1, borderTopColor: "#333" },
  sigX: { position: "absolute", top: -10, left: 0 },
  sigMeta: { marginTop: 3, color: MUTED },
});

function MetaRow({
  label,
  value,
  boxed,
}: {
  label: string;
  value: string;
  boxed?: boolean;
}) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={boxed ? styles.metaValBoxed : styles.metaValShaded}>{value}</Text>
    </View>
  );
}

function ShipRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.shipRow}>
      <Text style={styles.shipLabel}>{label}</Text>
      <Text style={styles.shipValue}>{value}</Text>
    </View>
  );
}

function AddlRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.addlRow}>
      <Text style={styles.addlLabel}>{label}</Text>
      <Text style={styles.addlValue}>{value}</Text>
    </View>
  );
}

function TotalRow({
  label,
  value,
  boxed,
}: {
  label: string;
  value: string;
  boxed?: boolean;
}) {
  return (
    <View style={styles.totRow}>
      <Text style={styles.totLabel}>{label}</Text>
      <Text style={boxed ? styles.totValBoxed : styles.totValPlain}>{value}</Text>
    </View>
  );
}

export function ProFormaInvoice({ data }: { data: PIData }) {
  const fillerCount = Math.max(0, MIN_ITEM_ROWS - data.line_items.length);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Top region: seller (left) + title/metadata (right) */}
        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            <Text style={styles.companyName}>{data.seller.company_name}</Text>
            <Text style={styles.sellerLine}>{data.seller.street_address}</Text>
            <Text style={styles.sellerLine}>{data.seller.city_state_zip}</Text>
            <Text style={styles.sellerLine}>
              <Text style={styles.inlineLabel}>Phone: </Text>
              {data.seller.phone}
            </Text>
            <Text style={styles.sellerLine}>
              <Text style={styles.inlineLabel}>Fax: </Text>
              {data.seller.fax}
            </Text>
            <Text style={styles.sellerLine}>
              <Text style={styles.inlineLabel}>Website: </Text>
              {data.seller.website}
            </Text>
          </View>
          <View style={styles.topRight}>
            <Text style={styles.title}>PRO FORMA INVOICE</Text>
            <MetaRow label="Date" value={data.metadata.date} />
            <MetaRow label="Expiration Date" value={data.metadata.expiration_date} />
            <MetaRow label="Invoice #" value={data.metadata.invoice_no} boxed />
            <MetaRow label="Customer ID" value={data.metadata.customer_id} boxed />
          </View>
        </View>

        {/* Mid region: customer (left) + shipping details (right) */}
        <View style={styles.midRow}>
          <View style={styles.midLeft}>
            <View style={styles.bar}>
              <Text style={styles.barText}>CUSTOMER</Text>
            </View>
            <View style={styles.body}>
              <Text style={styles.bodyLine}>{data.customer.name}</Text>
              <Text style={styles.bodyLine}>{data.customer.company_name}</Text>
              <Text style={styles.bodyLine}>{data.customer.street_address}</Text>
              <Text style={styles.bodyLine}>{data.customer.city_state_zip}</Text>
              <Text style={styles.bodyLine}>{data.customer.phone}</Text>
            </View>
          </View>
          <View style={styles.midRight}>
            <View style={styles.bar}>
              <Text style={styles.barText}>SHIPPING DETAILS</Text>
            </View>
            <View style={styles.body}>
              <ShipRow label="Freight Type" value={data.shipping.freight_type} />
              <ShipRow label="Est Ship Date" value={data.shipping.est_ship_date} />
              <ShipRow label="Est Gross Weight" value={data.shipping.est_gross_weight} />
              <ShipRow label="Est Cubic Weight" value={data.shipping.est_cubic_weight} />
              <ShipRow label="Total Packages" value={data.shipping.total_packages} />
            </View>
          </View>
        </View>

        {/* Line items table */}
        <View style={styles.table}>
          <View style={styles.headRow}>
            <Text style={[styles.headCell, styles.cPart]}>PART NUMBER</Text>
            <Text style={[styles.headCell, styles.cUom]}>UNIT OF MEASURE</Text>
            <Text style={[styles.headCell, styles.cDesc]}>DESCRIPTION</Text>
            <Text style={[styles.headCell, styles.cQty]}>QTY</Text>
            <Text style={[styles.headCell, styles.cPrice]}>UNIT PRICE</Text>
            <Text style={[styles.headCell, styles.cTax]}>TAX</Text>
            <Text style={[styles.headCell, styles.cAmount, { backgroundColor: BAR }]}>
              TOTAL AMOUNT
            </Text>
          </View>
          <View style={styles.redLine} />
          {data.line_items.map((item, idx) => (
            <View key={idx} style={styles.row}>
              <Text style={[styles.cell, styles.cPart]}>{item.part_number}</Text>
              <Text style={[styles.cell, styles.cUom]}>{item.unit_of_measure}</Text>
              <Text style={[styles.cell, styles.cDesc]}>{item.description}</Text>
              <Text style={[styles.cell, styles.cQty]}>{item.qty}</Text>
              <Text style={[styles.cell, styles.cPrice]}>{item.unit_price}</Text>
              <Text style={[styles.cell, styles.cTax]}>{item.tax}</Text>
              <Text style={[styles.cellLast, styles.cAmount]}>{item.total_amount}</Text>
            </View>
          ))}
          {Array.from({ length: fillerCount }).map((_, idx) => (
            <View key={`f${idx}`} style={styles.row}>
              <Text style={[styles.cell, styles.cPart]}> </Text>
              <Text style={[styles.cell, styles.cUom]}> </Text>
              <Text style={[styles.cell, styles.cDesc]}> </Text>
              <Text style={[styles.cell, styles.cQty]}> </Text>
              <Text style={[styles.cell, styles.cPrice]}> </Text>
              <Text style={[styles.cell, styles.cTax]}> </Text>
              <Text style={[styles.cellLast, styles.cAmount]}>-</Text>
            </View>
          ))}
        </View>

        {/* Lower region: terms of sale (left) + totals (right) */}
        <View style={styles.lowerRow}>
          <View style={styles.lowerLeft}>
            <View style={styles.bar}>
              <Text style={styles.barText}>TERMS OF SALE AND OTHER COMMENTS</Text>
            </View>
            <View style={styles.termsBody}>
              <Text style={styles.termsLine}>
                <Text style={styles.inlineLabel}>Delivery Terms: </Text>
                {data.terms_of_sale.delivery_terms}
              </Text>
              <Text style={styles.termsLine}>
                <Text style={styles.inlineLabel}>Payment Terms: </Text>
                {data.terms_of_sale.payment_terms}
              </Text>
              <Text style={styles.termsLine}>{data.terms_of_sale.comments}</Text>
            </View>
          </View>
          <View style={styles.lowerRight}>
            <TotalRow label="Subtotal" value={data.totals.subtotal} />
            <TotalRow label="Taxable" value={data.totals.taxable} />
            <TotalRow label="Tax rate" value={data.totals.tax_rate} boxed />
            <TotalRow label="Tax" value={data.totals.tax} />
            <TotalRow label="Freight" value={data.totals.freight} boxed />
            <TotalRow label="Insurance" value={data.totals.insurance} boxed />
            <TotalRow
              label="Legal/Consular Inspection/Cert."
              value={data.totals.legal_consular}
              boxed
            />
            <TotalRow label="Other (specify)" value={data.totals.other1} boxed />
            <TotalRow label="Other (specify)" value={data.totals.other2} boxed />
            <View style={styles.totGrand}>
              <Text style={styles.totGrandLabel}>TOTAL</Text>
              <Text style={styles.totGrandVal}>{data.totals.total}</Text>
            </View>
            <TotalRow label="Currency" value={data.totals.currency} />
          </View>
        </View>

        {/* Additional details */}
        <View style={styles.barGrey}>
          <Text style={styles.barText}>ADDITIONAL DETAILS</Text>
        </View>
        <View style={styles.addlBody}>
          <AddlRow label="Country of Origin" value={data.additional.country_of_origin} />
          <AddlRow
            label="Port of Embarkation"
            value={data.additional.port_of_embarkation}
          />
          <AddlRow label="Port of Discharge" value={data.additional.port_of_discharge} />

          <View style={styles.reasonRow}>
            <Text style={styles.reasonLabel}>Reason for Export:</Text>
            <Text style={styles.reasonBox}>{data.additional.reason_for_export}</Text>
          </View>

          <Text style={styles.cert}>
            I certify the above to be true and correct to the best of my knowledge.
          </Text>

          <View style={styles.sigRow}>
            <View style={styles.sigCell}>
              <View style={styles.sigRule} />
              <Text style={styles.sigX}>x</Text>
              <Text style={styles.sigMeta}>{data.signature.typed_name}</Text>
              <Text style={styles.sigMeta}>{data.signature.company_name}</Text>
            </View>
            <View style={styles.sigCell}>
              <View style={styles.sigRule} />
              <Text style={styles.sigMeta}>Date: {data.signature.date}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
