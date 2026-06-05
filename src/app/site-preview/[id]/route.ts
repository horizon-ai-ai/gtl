import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { SiteSchema } from "@/lib/site-builder";
import { renderWebsiteHtml } from "@/lib/website-builder/orchestrator";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
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

  const html = renderWebsiteHtml(site.versions[0].schema as SiteSchema);
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
