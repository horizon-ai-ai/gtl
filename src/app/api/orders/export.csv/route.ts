import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail } from "@/lib/api";

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

  const orders = await prisma.order.findMany({
    where: { user_id: session.user.id, deleted_at: null },
    orderBy: { created_at: "desc" },
    include: { items: true },
    take: 1000,
  });

  const rows = [
    ["order_no", "status", "customer_name", "customer_email", "total", "currency", "created_at", "items"],
    ...orders.map((order) => {
      const customer = order.customer as { name?: string; email?: string };
      return [
        order.order_no,
        order.status,
        customer.name ?? "",
        customer.email ?? "",
        order.total,
        order.currency,
        order.created_at.toISOString(),
        order.items.map((item) => `${item.name} x${item.quantity}`).join(" | "),
      ];
    }),
  ];

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="orders.csv"',
    },
  });
}
