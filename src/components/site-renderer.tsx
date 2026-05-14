import type { CSSProperties } from "react";
import type { SiteSchema } from "@/lib/site-builder";

function renderSectionItem(item: string | { title?: string; body?: string }, index: number) {
  if (typeof item === "string") {
    return (
      <div key={`${item}-${index}`} className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm leading-6">
        {item}
      </div>
    );
  }

  const title = typeof item.title === "string" ? item.title : `項目 ${index + 1}`;
  const body = typeof item.body === "string" ? item.body : "";

  return (
    <div key={`${title}-${index}`} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="text-sm font-medium">{title}</div>
      {body ? <div className="mt-2 text-sm leading-6 text-stone-600">{body}</div> : null}
    </div>
  );
}

export function SiteRenderer({
  schema,
  siteName,
}: {
  schema: SiteSchema;
  siteName: string;
}) {
  const accent = schema.primary_color || "#171717";
  const accentStyle = { "--site-accent": accent } as CSSProperties;

  return (
    <div style={accentStyle} className="min-h-screen bg-stone-50 text-stone-900">
      {schema.integrations?.ga_measurement_id ? (
        <script
          async
          src={`https://www.googletagmanager.com/gtag/js?id=${schema.integrations.ga_measurement_id}`}
        />
      ) : null}
      {schema.integrations?.ga_measurement_id ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${schema.integrations.ga_measurement_id}');`,
          }}
        />
      ) : null}
      {schema.integrations?.meta_pixel_id ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
            n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');fbq('init', '${schema.integrations.meta_pixel_id}');fbq('track', 'PageView');`,
          }}
        />
      ) : null}
      <div className="mx-auto max-w-5xl px-6 py-10 md:px-10">
        <div className="mb-10 text-sm font-medium tracking-[0.2em] text-stone-500 uppercase">{siteName}</div>
        <div className="space-y-8">
          {schema.sections.map((section, index) => (
            <section
              key={`${section.type}-${index}`}
              className={`rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm ${
                section.type === "hero" ? "overflow-hidden" : ""
              }`}
            >
              {section.type === "hero" ? (
                <div className="grid gap-8 md:grid-cols-[1.1fr,0.9fr] md:items-end">
                  <div>
                    <div className="inline-flex rounded-full bg-stone-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-stone-500">
                      {schema.title}
                    </div>
                    <h1 className="mt-5 text-4xl font-semibold leading-tight md:text-6xl">
                      {section.title || schema.title}
                    </h1>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600 md:text-lg">
                      {section.body || schema.tagline}
                    </p>
                    {section.button_label ? (
                      <button
                        type="button"
                        className="mt-6 rounded-full px-5 py-3 text-sm font-medium text-white"
                        style={{ backgroundColor: accent }}
                      >
                        {section.button_label}
                      </button>
                    ) : null}
                  </div>
                  <div className="rounded-[24px] bg-stone-100 p-6">
                    <div className="text-sm text-stone-500">品牌摘要</div>
                    <div className="mt-3 text-2xl font-semibold">{schema.title}</div>
                    <div className="mt-3 text-sm leading-6 text-stone-600">{schema.tagline}</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-xs font-medium uppercase tracking-[0.2em] text-stone-500">{section.type}</div>
                  {section.title ? <h2 className="text-2xl font-semibold md:text-3xl">{section.title}</h2> : null}
                  {section.body ? <p className="max-w-3xl text-base leading-7 text-stone-600">{section.body}</p> : null}
                  {section.items?.length ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {section.items.map((item, index) => renderSectionItem(item, index))}
                    </div>
                  ) : null}
                  {section.button_label ? (
                    <button
                      type="button"
                      className="rounded-full px-5 py-3 text-sm font-medium text-white"
                      style={{ backgroundColor: accent }}
                    >
                      {section.button_label}
                    </button>
                  ) : null}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
