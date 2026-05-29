import path from "path";
import { Font, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { ProFormaInvoice } from "./pro-forma-invoice";
import type { PIData } from "./pi-data";

const FONT_PATH = path.join(
  process.cwd(),
  "src/lib/pdf/fonts/NotoSansCJK-Regular.ttf"
);

Font.register({
  family: "Noto Sans CJK",
  src: FONT_PATH,
});

export async function renderProFormaInvoice(data: PIData): Promise<Buffer> {
  // renderToBuffer is typed to accept a ReactElement<DocumentProps>; a custom
  // component element is typed by its own props, so cast to the parameter type.
  // ProFormaInvoice's root IS a <Document>, so the assertion holds.
  const element = React.createElement(ProFormaInvoice, { data }) as Parameters<
    typeof renderToBuffer
  >[0];
  return renderToBuffer(element);
}
