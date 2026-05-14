import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function formatDateTimeInput(value: Date | null | undefined) {
  if (!value) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function createAnnouncement(formData: FormData) {
  "use server";

  const admin = await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const audience = String(formData.get("audience") ?? "all").trim() || "all";
  const startsAtRaw = String(formData.get("starts_at") ?? "").trim();
  const endsAtRaw = String(formData.get("ends_at") ?? "").trim();
  const active = formData.get("active") === "on";

  if (!title || !body || !startsAtRaw) {
    throw new Error("MISSING_FIELDS");
  }

  await prisma.announcement.create({
    data: {
      title,
      body,
      audience,
      starts_at: new Date(startsAtRaw),
      ends_at: endsAtRaw ? new Date(endsAtRaw) : null,
      active,
    },
  });

  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: "announcement_created",
      target_type: "announcement",
      target_id: title,
      payload: { audience, active },
    },
  });

  revalidatePath("/admin/announcements");
  revalidatePath("/chat");
  revalidatePath("/orders");
  revalidatePath("/support");
  revalidatePath("/trade");
  revalidatePath("/sites");
}

async function updateAnnouncementState(formData: FormData) {
  "use server";

  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const mode = String(formData.get("mode") ?? "");
  if (!id || !mode) throw new Error("INVALID_REQUEST");

  if (mode === "delete") {
    await prisma.announcement.delete({ where: { id } });
  } else if (mode === "toggle") {
    const current = await prisma.announcement.findUnique({ where: { id } });
    if (!current) throw new Error("NOT_FOUND");
    await prisma.announcement.update({
      where: { id },
      data: { active: !current.active },
    });
  }

  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: `announcement_${mode}`,
      target_type: "announcement",
      target_id: id,
    },
  });

  revalidatePath("/admin/announcements");
  revalidatePath("/chat");
  revalidatePath("/orders");
  revalidatePath("/support");
  revalidatePath("/trade");
  revalidatePath("/sites");
}

export default async function AnnouncementsPage() {
  await requireAdmin();
  const announcements = await prisma.announcement.findMany({
    orderBy: [{ active: "desc" }, { starts_at: "desc" }, { created_at: "desc" }],
  });

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">公告管理</h1>
        <p className="mt-1 text-sm text-neutral-500">
          建立前台公告，控制是否啟用，以及顯示時間區間。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>新增公告</CardTitle>
          <CardDescription>已啟用且在時間區間內的公告，會顯示在 user portal 頂部。</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createAnnouncement} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="標題">
                <input name="title" className="w-full rounded border px-3 py-2 text-sm" required />
              </Field>
              <Field label="受眾">
                <select name="audience" className="w-full rounded border px-3 py-2 text-sm" defaultValue="all">
                  <option value="all">全部用戶</option>
                  <option value="personal">個人用戶</option>
                  <option value="company">公司用戶</option>
                </select>
              </Field>
            </div>
            <Field label="內容">
              <textarea name="body" className="min-h-28 w-full rounded border px-3 py-2 text-sm" required />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="開始時間">
                <input
                  type="datetime-local"
                  name="starts_at"
                  className="w-full rounded border px-3 py-2 text-sm"
                  defaultValue={formatDateTimeInput(new Date())}
                  required
                />
              </Field>
              <Field label="結束時間">
                <input type="datetime-local" name="ends_at" className="w-full rounded border px-3 py-2 text-sm" />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked />
              建立後立即啟用
            </label>
            <Button type="submit">建立公告</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>公告列表</CardTitle>
          <CardDescription>可直接上下架或刪除公告。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {announcements.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-neutral-500">尚無公告。</div>
          ) : (
            announcements.map((announcement) => (
              <div key={announcement.id} className="rounded-lg border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-medium">{announcement.title}</h2>
                      <span className={`rounded px-2 py-0.5 text-xs ${announcement.active ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-600"}`}>
                        {announcement.active ? "啟用中" : "已停用"}
                      </span>
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                        {announcement.audience}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-neutral-700">{announcement.body}</p>
                    <div className="text-xs text-neutral-500">
                      {announcement.starts_at.toLocaleString("zh-TW")}
                      {announcement.ends_at ? ` - ${announcement.ends_at.toLocaleString("zh-TW")}` : " - 無結束時間"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <form action={updateAnnouncementState}>
                      <input type="hidden" name="id" value={announcement.id} />
                      <input type="hidden" name="mode" value="toggle" />
                      <Button type="submit" variant="outline">
                        {announcement.active ? "停用" : "啟用"}
                      </Button>
                    </form>
                    <form action={updateAnnouncementState}>
                      <input type="hidden" name="id" value={announcement.id} />
                      <input type="hidden" name="mode" value="delete" />
                      <Button type="submit" variant="outline">刪除</Button>
                    </form>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
