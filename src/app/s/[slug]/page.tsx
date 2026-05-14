import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteRenderer } from "@/components/site-renderer";
import type { SiteSchema } from "@/lib/site-builder";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const site = await prisma.site.findFirst({
    where: {
      slug: params.slug,
      status: "published",
      deleted_at: null,
    },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  const version = site?.current_version_id
    ? await prisma.siteVersion.findUnique({ where: { id: site.current_version_id } })
    : site?.versions[0];
  const schema = (version?.schema ?? null) as SiteSchema | null;
  if (!site || !schema) return {};

  return {
    title: schema.seo?.title ?? schema.title ?? site.name,
    description: schema.seo?.description ?? schema.tagline ?? site.description ?? undefined,
    openGraph: {
      title: schema.seo?.title ?? schema.title ?? site.name,
      description: schema.seo?.description ?? schema.tagline ?? site.description ?? undefined,
      images: schema.seo?.og_image ? [schema.seo.og_image] : undefined,
    },
  };
}

export default async function PublicSitePage({ params }: { params: { slug: string } }) {
  const site = await prisma.site.findFirst({
    where: {
      slug: params.slug,
      status: "published",
      deleted_at: null,
    },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  if (!site) notFound();

  const version = site.current_version_id
    ? await prisma.siteVersion.findUnique({ where: { id: site.current_version_id } })
    : site.versions[0];

  if (!version) notFound();

  return <SiteRenderer schema={version.schema as SiteSchema} siteName={site.name} />;
}
