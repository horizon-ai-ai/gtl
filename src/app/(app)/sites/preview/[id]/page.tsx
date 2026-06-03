import { redirect } from "next/navigation";

export default async function SitePreviewPage({ params }: { params: { id: string } }) {
  redirect(`/site-preview/${params.id}`);
}
