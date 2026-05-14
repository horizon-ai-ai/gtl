import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok, ApiError } from "@/lib/api";
import { generateSiteSchema, slugifySiteName } from "@/lib/site-builder";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  industry: z.string().max(120).optional(),
  audience: z.string().max(200).optional(),
  goal: z.string().max(200).optional(),
  generate_with_ai: z.boolean().default(true),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const sites = await prisma.site.findMany({
      where: { user_id: session.user.id, deleted_at: null },
      orderBy: { created_at: "desc" },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      take: 50,
    });
    return ok(sites);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const body = createSchema.parse(await req.json());
    const baseSlug = slugifySiteName(body.name);

    let slug = baseSlug;
    let counter = 1;
    while (await prisma.site.findUnique({ where: { slug } })) {
      counter += 1;
      slug = `${baseSlug}-${counter}`;
    }

    const schema = body.generate_with_ai
      ? await generateSiteSchema({
          business_name: body.name,
          industry: body.industry,
          audience: body.audience,
          goal: body.goal,
        })
      : undefined;

    const site = await prisma.site.create({
      data: {
        user_id: session.user.id,
        slug,
        name: body.name,
        description: body.description,
        theme: schema
          ? {
              primary_color: schema.primary_color,
            }
          : undefined,
        versions: {
          create: {
            version: 1,
            schema: (schema ?? {
              title: body.name,
              tagline: body.description ?? "",
              sections: [],
            }) as object,
          },
        },
      },
      include: { versions: true },
    });

    const currentVersion = site.versions[0];
    if (!currentVersion) throw new ApiError("INTERNAL_ERROR", "Site version not created");

    const updated = await prisma.site.update({
      where: { id: site.id },
      data: { current_version_id: currentVersion.id },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });

    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}
