import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PIData } from "./pi-data";

const FONT_FAMILY = "Noto Sans CJK";
const HEADER_BG = "#1F3864";
const HEADER_TEXT = "#FFFFFF";
const TITLE_COLOR = "#2E5496";
const FRAME = "#1F3864";
const LINE = "#BFBFBF";
const MUTED = "#555555";
const MIN_ITEM_ROWS = 6;

const styles = StyleSheet.create({
  page: {
    fontFamily: FONT_FAMILY,
    fontSize: 8,
    padding: 22,
    color: "#111",
  },

  upper: { flexDirection: "row", marginBottom: 8 },
  upperLeft: { width: "52%", paddingRight: 8 },
  upperRight: { width: "48%" },

  sellerBox: {
    borderWidth: 1,
    borderColor: FRAME,
    padding: 6,
    marginBottom: 6,
  },
  companyName: { fontSize: 11, fontWeight: 700, marginBottom: 3 },
  partyLine: { marginBottom: 1.5 },
  labelInline: { color: MUTED },

  headerBar: {
    backgroundColor: HEADER_BG,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  headerBarText: { color: HEADER_TEXT, fontWeight: 700, fontSize: 8 },

  boxBody: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: FRAME,
    padding: 6,
  },

  title: {
    fontSize: 20,
    fontWeight: 700,
    color: TITLE_COLOR,
    textAlign: "right",
    marginBottom: 8,
  },

  metaGrid: { marginBottom: 8 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 2,
  },
  metaLabel: {
    color: MUTED,
    fontWeight: 700,
    textAlign: "right",
    paddingRight: 6,
  },
  metaValueBox: {
    borderWidth: 1,
    borderColor: LINE,
    paddingVertical: 1,
    paddingHorizontal: 4,
    width: 90,
    textAlign: "right",
  },

  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 1.5,
  },
  kvLabel: { color: MUTED },
  kvValue: { textAlign: "right" },

  table: { borderWidth: 1, borderColor: FRAME, marginBottom: 8 },
  tHeadRow: { flexDirection: "row", backgroundColor: HEADER_BG },
  tHeadCell: { color: HEADER_TEXT, fontWeight: 700, padding: 3 },
  tRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: LINE,
    minHeight: 14,
  },
  tCell: { padding: 3 },
  cPart: { width: "12%" },
  cUom: { width: "12%" },
  cDesc: { width: "34%" },
  cQty: { width: "9%", textAlign: "right" },
  cPrice: { width: "12%", textAlign: "right" },
  cTax: { width: "7%", textAlign: "center" },
  cAmount: { width: "14%", textAlign: "right" },

  lower: { flexDirection: "row", marginBottom: 8 },
  lowerLeft: { width: "55%", paddingRight: 8 },
  lowerRight: { width: "45%" },

  termsBody: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: FRAME,
    padding: 6,
    minHeight: 120,
  },
  termsLine: { marginBottom: 3 },

  totalsBox: { borderWidth: 1, borderColor: FRAME },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  totalsRowGrand: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#D9E1F2",
    paddingVertical: 3,
    paddingHorizontal: 5,
    fontWeight: 700,
  },
  totalsLabel: { color: MUTED },
  totalsValue: { textAlign: "right" },

  addlBody: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: FRAME,
    padding: 6,
  },
  certLine: { marginTop: 8, marginBottom: 8 },
  sigRow: { flexDirection: "row", marginTop: 18, gap: 16 },
  sigCell: { flex: 1 },
  sigRule: { borderTopWidth: 1, borderTopColor: "#333", paddingTop: 2 },
  sigMeta: { marginTop: 4, color: MUTED },
});

function PartyLine({ label, value }: { label?: string; value: string }) {
  return (
    <Text style={styles.partyLine}>
      {label ? <Text style={styles.labelInline}>{label} </Text> : null}
      {value}
    </Text>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValueBox}>{value}</Text>
    </View>
  );
}

function KVRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

function TotalsRow({
  label,
  value,
  grand,
}: {
  label: string;
  value: string;
  grand?: boolean;
}) {
  return (
    <View style={grand ? styles.totalsRowGrand : styles.totalsRow}>
      <Text style={styles.totalsLabel}>{label}</Text>
      <Text style={styles.totalsValue}>{value}</Text>
    </View>
  );
}

export function ProFormaInvoice({ data }: { data: PIData }) {
  const fillerCount = Math.max(0, MIN_ITEM_ROWS - data.line_items.length);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Upper region: seller + customer (left), title + meta + shipping (right) */}
        <View style={styles.upper}>
          <View style={styles.upperLeft}>
            <View style={styles.sellerBox}>
              <Text style={styles.companyName}>{data.seller.company_name}</Text>
              <PartyLine value={data.seller.street_address} />
              <PartyLine value={data.seller.city_state_zip} />
              <PartyLine label="Phone:" value={data.seller.phone} />
              <PartyLine label="Fax:" value={data.seller.fax} />
              <PartyLine label="Website:" value={data.seller.website} />
            </View>

            <View style={styles.headerBar}>
              <Text style={styles.headerBarText}>CUSTOMER</Text>
            </View>
            <View style={styles.boxBody}>
              <PartyLine value={data.customer.name} />
              <PartyLine value={data.customer.company_name} />
              <PartyLine value={data.customer.street_address} />
              <PartyLine value={data.customer.city_state_zip} />
              <PartyLine label="Phone:" value={data.customer.phone} />
            </View>
          </View>

          <View style={styles.upperRight}>
            <Text style={styles.title}>PRO FORMA INVOICE</Text>
            <View style={styles.metaGrid}>
              <MetaRow label="Date" value={data.metadata.date} />
              <MetaRow label="Expiration Date" value={data.metadata.expiration_date} />
              <MetaRow label="Invoice #" value={data.metadata.invoice_no} />
              <MetaRow label="Customer ID" value={data.metadata.customer_id} />
            </View>

            <View style={styles.headerBar}>
              <Text style={styles.headerBarText}>SHIPPING DETAILS</Text>
            </View>
            <View style={styles.boxBody}>
              <KVRow label="Freight Type" value={data.shipping.freight_type} />
              <KVRow label="Est Ship Date" value={data.shipping.est_ship_date} />
              <KVRow label="Est Gross Weight" value={data.shipping.est_gross_weight} />
              <KVRow label="Est Cubic Weight" value={data.shipping.est_cubic_weight} />
              <KVRow label="Total Packages" value={data.shipping.total_packages} />
            </View>
          </View>
        </View>

        {/* Line items table */}
        <View style={styles.table}>
          <View style={styles.tHeadRow}>
            <Text style={[styles.tHeadCell, styles.cPart]}>PART NUMBER</Text>
            <Text style={[styles.tHeadCell, styles.cUom]}>UNIT OF MEASURE</Text>
            <Text style={[styles.tHeadCell, styles.cDesc]}>DESCRIPTION</Text>
            <Text style={[styles.tHeadCell, styles.cQty]}>QTY</Text>
            <Text style={[styles.tHeadCell, styles.cPrice]}>UNIT PRICE</Text>
            <Text style={[styles.tHeadCell, styles.cTax]}>TAX</Text>
            <Text style={[styles.tHeadCell, styles.cAmount]}>TOTAL AMOUNT</Text>
          </View>
          {data.line_items.map((item, idx) => (
            <View key={idx} style={styles.tRow}>
              <Text style={[styles.tCell, styles.cPart]}>{item.part_number}</Text>
              <Text style={[styles.tCell, styles.cUom]}>{item.unit_of_measure}</Text>
              <Text style={[styles.tCell, styles.cDesc]}>{item.description}</Text>
              <Text style={[styles.tCell, styles.cQty]}>{item.qty}</Text>
              <Text style={[styles.tCell, styles.cPrice]}>{item.unit_price}</Text>
              <Text style={[styles.tCell, styles.cTax]}>{item.tax}</Text>
              <Text style={[styles.tCell, styles.cAmount]}>{item.total_amount}</Text>
            </View>
          ))}
          {Array.from({ length: fillerCount }).map((_, idx) => (
            <View key={`f${idx}`} style={styles.tRow}>
              <Text style={[styles.tCell, styles.cPart]}> </Text>
              <Text style={[styles.tCell, styles.cUom]}> </Text>
              <Text style={[styles.tCell, styles.cDesc]}> </Text>
              <Text style={[styles.tCell, styles.cQty]}> </Text>
              <Text style={[styles.tCell, styles.cPrice]}> </Text>
              <Text style={[styles.tCell, styles.cTax]}> </Text>
              <Text style={[styles.tCell, styles.cAmount]}> </Text>
            </View>
          ))}
        </View>

        {/* Lower region: terms of sale (left), totals (right) */}
        <View style={styles.lower}>
          <View style={styles.lowerLeft}>
            <View style={styles.headerBar}>
              <Text style={styles.headerBarText}>
                TERMS OF SALE AND OTHER COMMENTS
              </Text>
            </View>
            <View style={styles.termsBody}>
              <Text style={styles.termsLine}>
                <Text style={styles.labelInline}>Delivery Terms: </Text>
                {data.terms_of_sale.delivery_terms}
              </Text>
              <Text style={styles.termsLine}>
                <Text style={styles.labelInline}>Payment Terms: </Text>
                {data.terms_of_sale.payment_terms}
              </Text>
              <Text style={styles.termsLine}>{data.terms_of_sale.comments}</Text>
            </View>
          </View>

          <View style={styles.lowerRight}>
            <View style={styles.totalsBox}>
              <TotalsRow label="Subtotal" value={data.totals.subtotal} />
              <TotalsRow label="Taxable" value={data.totals.taxable} />
              <TotalsRow label="Tax rate" value={data.totals.tax_rate} />
              <TotalsRow label="Tax" value={data.totals.tax} />
              <TotalsRow label="Freight" value={data.totals.freight} />
              <TotalsRow label="Insurance" value={data.totals.insurance} />
              <TotalsRow
                label="Legal/Consular Inspection/Cert."
                value={data.totals.legal_consular}
              />
              <TotalsRow label="Other (specify)" value={data.totals.other1} />
              <TotalsRow label="Other (specify)" value={data.totals.other2} />
              <TotalsRow label="TOTAL" value={data.totals.total} grand />
              <TotalsRow label="Currency" value={data.totals.currency} />
            </View>
          </View>
        </View>

        {/* Additional details + certification + signature */}
        <View style={styles.headerBar}>
          <Text style={styles.headerBarText}>ADDITIONAL DETAILS</Text>
        </View>
        <View style={styles.addlBody}>
          <KVRow label="Country of Origin" value={data.additional.country_of_origin} />
          <KVRow
            label="Port of Embarkation"
            value={data.additional.port_of_embarkation}
          />
          <KVRow label="Port of Discharge" value={data.additional.port_of_discharge} />
          <KVRow label="Reason for Export" value={data.additional.reason_for_export} />

          <Text style={styles.certLine}>
            I certify the above to be true and correct to the best of my knowledge.
          </Text>

          <View style={styles.sigRow}>
            <View style={styles.sigCell}>
              <View style={styles.sigRule}>
                <Text>x</Text>
              </View>
              <Text style={styles.sigMeta}>{data.signature.typed_name}</Text>
              <Text style={styles.sigMeta}>{data.signature.company_name}</Text>
            </View>
            <View style={styles.sigCell}>
              <View style={styles.sigRule}>
                <Text>Date: {data.signature.date}</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
