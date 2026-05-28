import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PIData } from "./pi-data";

const FONT_FAMILY = "Noto Sans CJK";

const styles = StyleSheet.create({
  page: {
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    padding: 24,
    color: "#111",
  },
  title: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 8,
    fontWeight: 700,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    fontSize: 9,
  },
  metaCell: {
    flexBasis: "25%",
    paddingHorizontal: 2,
  },
  metaLabel: {
    color: "#555",
    marginBottom: 1,
  },
  twoCol: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  box: {
    borderWidth: 1,
    borderColor: "#222",
    padding: 6,
  },
  boxTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 4,
  },
  flex1: {
    flex: 1,
  },
  partyRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  partyLabel: {
    width: 60,
    color: "#555",
  },
  partyValue: {
    flex: 1,
  },
  shippingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  shippingCell: {
    width: "33.33%",
    padding: 3,
  },
  shippingLabel: {
    color: "#555",
    fontSize: 8,
    marginBottom: 1,
  },
  table: {
    borderWidth: 1,
    borderColor: "#222",
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  tableRowLast: {
    flexDirection: "row",
  },
  tableHeader: {
    backgroundColor: "#eee",
    fontWeight: 700,
  },
  colDescription: {
    flex: 3,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#222",
  },
  colQuantity: {
    flex: 1,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#222",
    textAlign: "right",
  },
  colUnit: {
    flex: 0.7,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#222",
    textAlign: "center",
  },
  colUnitPrice: {
    flex: 1,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#222",
    textAlign: "right",
  },
  colAmount: {
    flex: 1.2,
    padding: 4,
    textAlign: "right",
  },
  totalsBox: {
    alignSelf: "flex-end",
    width: "50%",
    borderWidth: 1,
    borderColor: "#222",
    marginBottom: 8,
  },
  totalsRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#222",
    padding: 4,
  },
  totalsRowLast: {
    flexDirection: "row",
    padding: 4,
    fontWeight: 700,
  },
  totalsLabel: {
    flex: 1,
    color: "#555",
  },
  totalsValue: {
    flex: 1,
    textAlign: "right",
  },
  signatureRow: {
    flexDirection: "row",
    gap: 8,
  },
  signatureCell: {
    flex: 1,
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: "#222",
    marginTop: 24,
    paddingTop: 2,
  },
});

function PartyBlock({
  title,
  party,
}: {
  title: string;
  party: PIData["seller"];
}) {
  return (
    <View style={[styles.box, styles.flex1]}>
      <Text style={styles.boxTitle}>{title}</Text>
      <View style={styles.partyRow}>
        <Text style={styles.partyLabel}>Name</Text>
        <Text style={styles.partyValue}>{party.name}</Text>
      </View>
      <View style={styles.partyRow}>
        <Text style={styles.partyLabel}>Address</Text>
        <Text style={styles.partyValue}>{party.address}</Text>
      </View>
      <View style={styles.partyRow}>
        <Text style={styles.partyLabel}>Contact</Text>
        <Text style={styles.partyValue}>{party.contact_name}</Text>
      </View>
      <View style={styles.partyRow}>
        <Text style={styles.partyLabel}>Phone</Text>
        <Text style={styles.partyValue}>{party.contact_phone}</Text>
      </View>
    </View>
  );
}

function ShippingCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.shippingCell}>
      <Text style={styles.shippingLabel}>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

export function ProFormaInvoice({ data }: { data: PIData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>PRO FORMA INVOICE</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Invoice #</Text>
            <Text>{data.metadata.invoice_no}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Invoice Date</Text>
            <Text>{data.metadata.invoice_date}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Expiration Date</Text>
            <Text>{data.metadata.expiration_date}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Customer ID</Text>
            <Text>{data.metadata.customer_id}</Text>
          </View>
        </View>

        <View style={styles.twoCol}>
          <PartyBlock title="Seller" party={data.seller} />
          <PartyBlock title="Customer" party={data.customer} />
        </View>

        <View style={[styles.box, { marginBottom: 8 }]}>
          <Text style={styles.boxTitle}>Shipping Details</Text>
          <View style={styles.shippingGrid}>
            <ShippingCell label="Freight Type" value={data.shipping.freight_type} />
            <ShippingCell label="Est. Ship Date" value={data.shipping.est_ship_date} />
            <ShippingCell label="Est. Gross Weight" value={data.shipping.est_gross_weight} />
            <ShippingCell label="Est. Net Weight" value={data.shipping.est_net_weight} />
            <ShippingCell label="Package Count" value={data.shipping.package_count} />
            <ShippingCell label="Country of Origin" value={data.shipping.country_of_origin} />
            <ShippingCell
              label="Port of Embarkation"
              value={data.shipping.port_of_embarkation}
            />
            <ShippingCell
              label="Port of Destination"
              value={data.shipping.port_of_destination}
            />
            <ShippingCell label="Delivery Terms" value={data.shipping.delivery_terms} />
            <ShippingCell label="Payment Terms" value={data.shipping.payment_terms} />
          </View>
        </View>

        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={styles.colDescription}>Description</Text>
            <Text style={styles.colQuantity}>Quantity</Text>
            <Text style={styles.colUnit}>Unit</Text>
            <Text style={styles.colUnitPrice}>Unit Price</Text>
            <Text style={styles.colAmount}>Amount</Text>
          </View>
          {data.line_items.map((item, idx) => {
            const isLast = idx === data.line_items.length - 1;
            const rowStyle = isLast ? styles.tableRowLast : styles.tableRow;
            return (
              <View key={idx} style={rowStyle}>
                <Text style={styles.colDescription}>{item.description}</Text>
                <Text style={styles.colQuantity}>{item.quantity}</Text>
                <Text style={styles.colUnit}>{item.unit}</Text>
                <Text style={styles.colUnitPrice}>{item.unit_price}</Text>
                <Text style={styles.colAmount}>{item.amount}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.totalsBox}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{data.totals.subtotal}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax Rate</Text>
            <Text style={styles.totalsValue}>{data.totals.tax_rate}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax</Text>
            <Text style={styles.totalsValue}>{data.totals.tax}</Text>
          </View>
          <View style={styles.totalsRowLast}>
            <Text style={styles.totalsLabel}>
              Total ({data.totals.currency})
            </Text>
            <Text style={styles.totalsValue}>{data.totals.total}</Text>
          </View>
        </View>

        <View style={[styles.box, { marginBottom: 8 }]}>
          <Text style={styles.boxTitle}>Additional Details</Text>
          <Text>{data.additional_details}</Text>
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Signature</Text>
          <View style={styles.signatureRow}>
            <View style={styles.signatureCell}>
              <View style={styles.signatureLine}>
                <Text>Name: {data.signature.typed_name}</Text>
              </View>
            </View>
            <View style={styles.signatureCell}>
              <View style={styles.signatureLine}>
                <Text>Date: {data.signature.date}</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
