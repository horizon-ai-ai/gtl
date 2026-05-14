import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteRenderer } from "@/components/site-renderer";
import type { SiteSchema } from "@/lib/site-builder";

export default async function HostedSitePage({ params }: { params: { host: string } }) {
  const site = await prisma.site.findFirst({
    where: {
      custom_domain: params.host,
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
