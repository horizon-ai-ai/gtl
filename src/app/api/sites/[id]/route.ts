import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok } from "@/lib/api";

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  custom_domain: z.string().max(255).optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const body = updateSchema.parse(await req.json());

    const site = await prisma.site.findFirst({
      where: { id: params.id, user_id: session.user.id, deleted_at: null },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!site) return fail("RESOURCE_NOT_FOUND", "Site not found");

    let currentVersionId = site.current_version_id;
    if (body.schema) {
      const nextVersion = (site.versions[0]?.version ?? 0) + 1;
      const version = await prisma.siteVersion.create({
        data: {
          site_id: site.id,
          version: nextVersion,
          schema: body.schema as Prisma.InputJsonValue,
          published_at: body.status === "published" ? new Date() : undefined,
        },
      });
      currentVersionId = version.id;
    }

    const updated = await prisma.site.update({
      where: { id: site.id },
      data: {
        name: body.name,
        description: body.description === null ? null : body.description,
        custom_domain: body.custom_domain === null ? null : body.custom_domain,
        status: body.status,
        current_version_id: currentVersionId,
      },
      include: { versions: { orderBy: { version: "desc" }, take: 5 } },
    });

    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}
