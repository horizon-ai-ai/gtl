import type { SitePageSection, SiteSchema } from "./site-builder";

type PuckBlockType =
  | "HeroBlock"
  | "StoryBlock"
  | "FeatureListBlock"
  | "GalleryBlock"
  | "SpecsBlock"
  | "CtaBlock";

type PuckBlock = {
  type: PuckBlockType;
  props: {
    title?: string;
    body?: string;
    buttonLabel?: string;
    imageUrl?: string;
    itemsText?: string;
    layoutVariant?: string;
    variantFamily?: string;
  };
};

type PuckDataShape = {
  root: { props: Record<string, unknown> };
  content: PuckBlock[];
};

function sectionItemsToText(items: SitePageSection["items"]) {
  return (items ?? [])
    .map((item) => {
      if (typeof item === "string") return item;
      const title = item.title?.trim() ?? "";
      const body = item.body?.trim() ?? "";
      if (title && body) return `${title}: ${body}`;
      return title || body;
    })
    .filter(Boolean)
    .join("\n");
}

function itemsTextToItems(itemsText?: string) {
  return (itemsText ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapSectionTypeToBlockType(type: SitePageSection["type"]): PuckBlockType {
  switch (type) {
    case "hero":
      return "HeroBlock";
    case "story":
      return "StoryBlock";
    case "gallery":
      return "GalleryBlock";
    case "specs":
      return "SpecsBlock";
    case "cta":
    case "inquiry":
      return "CtaBlock";
    case "features":
    case "products":
    case "productDetails":
    case "socialProof":
    case "closingInfo":
    case "faq":
    case "testimonials":
    default:
      return "FeatureListBlock";
  }
}

function mapBlockTypeToSectionType(type: PuckBlockType): SitePageSection["type"] {
  switch (type) {
    case "HeroBlock":
      return "hero";
    case "StoryBlock":
      return "story";
    case "GalleryBlock":
      return "gallery";
    case "SpecsBlock":
      return "specs";
    case "CtaBlock":
      return "cta";
    case "FeatureListBlock":
    default:
      return "features";
  }
}

export function siteSchemaToPuckData(schema: SiteSchema): PuckDataShape {
  return {
    root: { props: {} },
    content: (schema.sections ?? []).map((section) => ({
      type: mapSectionTypeToBlockType(section.type),
      props: {
        title: section.title,
        body: section.body,
        buttonLabel: section.button_label,
        imageUrl: section.image_url,
        itemsText: sectionItemsToText(section.items),
        layoutVariant: section.layoutVariant,
        variantFamily: section.variantFamily,
      },
    })),
  };
}

export function puckDataToSiteSchema(schema: SiteSchema, data: PuckDataShape): SiteSchema {
  return {
    ...schema,
    sections: (data.content ?? []).map((block, index) => {
      const previous = schema.sections[index];
      const mappedType = mapBlockTypeToSectionType(block.type);
      return {
        type: block.type === "FeatureListBlock" && previous ? previous.type : mappedType,
        layoutVariant: block.props.layoutVariant?.trim() || previous?.layoutVariant,
        variantFamily:
          block.props.variantFamily === "product" || block.props.variantFamily === "brand"
            ? block.props.variantFamily
            : previous?.variantFamily,
        title: block.props.title?.trim() || undefined,
        body: block.props.body?.trim() || undefined,
        button_label: block.props.buttonLabel?.trim() || undefined,
        image_url: block.props.imageUrl?.trim() || undefined,
        items: itemsTextToItems(block.props.itemsText),
      };
    }),
  };
}

export const sitePuckConfig = {
  components: {
    HeroBlock: {
      fields: {
        title: { type: "text" },
        body: { type: "textarea" },
        buttonLabel: { type: "text" },
        imageUrl: { type: "text" },
      },
      render: ({ title, body, buttonLabel, imageUrl }: Record<string, string>) => (
        <section className="rounded-[28px] border border-neutral-200 bg-white p-8 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr] lg:items-center">
            <div className="space-y-4">
              <div className="text-sm font-semibold uppercase tracking-[0.24em] text-neutral-500">Hero</div>
              <h1 className="text-4xl font-semibold tracking-tight text-neutral-950">{title || "商品主標題"}</h1>
              <p className="text-base leading-7 text-neutral-600">{body || "補上你的商品主賣點與一句價值描述。"}</p>
              <button className="rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white">
                {buttonLabel || "立即詢價"}
              </button>
            </div>
            <div className="overflow-hidden rounded-[24px] border border-neutral-200 bg-neutral-50">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt={title || "Hero"} className="aspect-[4/3] h-full w-full object-cover" />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center text-sm text-neutral-400">Hero 商品圖</div>
              )}
            </div>
          </div>
        </section>
      ),
    },
    StoryBlock: {
      fields: {
        title: { type: "text" },
        body: { type: "textarea" },
      },
      render: ({ title, body }: Record<string, string>) => (
        <section className="rounded-[28px] border border-neutral-200 bg-white p-8 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-neutral-500">Story</div>
          <h2 className="mt-3 text-2xl font-semibold text-neutral-950">{title || "商品故事"}</h2>
          <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-neutral-600">{body || "描述商品來源、品牌理念或特色故事。"}</p>
        </section>
      ),
    },
    FeatureListBlock: {
      fields: {
        title: { type: "text" },
        body: { type: "textarea" },
        itemsText: { type: "textarea" },
      },
      render: ({ title, body, itemsText }: Record<string, string>) => (
        <section className="rounded-[28px] border border-neutral-200 bg-white p-8 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-neutral-500">Highlights</div>
          <h2 className="mt-3 text-2xl font-semibold text-neutral-950">{title || "商品亮點"}</h2>
          {body ? <p className="mt-3 text-base leading-7 text-neutral-600">{body}</p> : null}
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {(itemsText || "")
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean)
              .map((item, index) => (
                <div key={`${item}-${index}`} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                  {item}
                </div>
              ))}
          </div>
        </section>
      ),
    },
    GalleryBlock: {
      fields: {
        title: { type: "text" },
        body: { type: "textarea" },
        imageUrl: { type: "text" },
      },
      render: ({ title, body, imageUrl }: Record<string, string>) => (
        <section className="rounded-[28px] border border-neutral-200 bg-white p-8 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-neutral-500">Gallery</div>
          <div className="mt-4 grid gap-5 lg:grid-cols-[0.95fr,1.05fr] lg:items-center">
            <div className="overflow-hidden rounded-[24px] border border-neutral-200 bg-neutral-50">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt={title || "Gallery"} className="aspect-[4/3] h-full w-full object-cover" />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center text-sm text-neutral-400">展示圖片</div>
              )}
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-neutral-950">{title || "商品展示"}</h2>
              <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-neutral-600">{body || "補充這張圖想傳達的商品特性。"}</p>
            </div>
          </div>
        </section>
      ),
    },
    SpecsBlock: {
      fields: {
        title: { type: "text" },
        itemsText: { type: "textarea" },
      },
      render: ({ title, itemsText }: Record<string, string>) => (
        <section className="rounded-[28px] border border-neutral-200 bg-white p-8 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-neutral-500">Specs</div>
          <h2 className="mt-3 text-2xl font-semibold text-neutral-950">{title || "規格資訊"}</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {(itemsText || "")
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean)
              .map((item, index) => (
                <div key={`${item}-${index}`} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                  {item}
                </div>
              ))}
          </div>
        </section>
      ),
    },
    CtaBlock: {
      fields: {
        title: { type: "text" },
        body: { type: "textarea" },
        buttonLabel: { type: "text" },
      },
      render: ({ title, body, buttonLabel }: Record<string, string>) => (
        <section className="rounded-[28px] border border-neutral-900 bg-neutral-950 p-8 text-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
          <div className="mx-auto max-w-3xl text-center">
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-white/55">Inquiry CTA</div>
            <h2 className="mt-3 text-3xl font-semibold">{title || "立即詢價"}</h2>
            <p className="mt-4 text-base leading-7 text-white/70">{body || "若想了解報價、MOQ 或合作方式，歡迎立即詢價。"}</p>
            <button className="mt-6 rounded-full bg-white px-6 py-3 text-sm font-medium text-neutral-950">
              {buttonLabel || "立即詢價"}
            </button>
          </div>
        </section>
      ),
    },
  },
};
