import { notFound } from "next/navigation";
import PresenterMode from "@/components/presenter-mode";
import { roomExists } from "@/lib/rooms";

export default async function PresenterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!(await roomExists(slug))) {
    notFound();
  }

  return <PresenterMode roomSlug={slug} />;
}
