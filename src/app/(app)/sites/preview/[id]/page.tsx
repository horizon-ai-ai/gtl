import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SiteRenderer } from "@/components/site-renderer";
import type { SiteSchema } from "@/lib/site-builder";

export default async function SitePreviewPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) notFound();

  const site = await prisma.site.findFirst({
    where: {
      id: params.id,
      user_id: session.user.id,
      deleted_at: null,
    },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  if (!site || site.versions.length === 0) notFound();

  return <SiteRenderer schema={site.versions[0].schema as SiteSchema} siteName={`${site.name}（預覽）`} />;
}
