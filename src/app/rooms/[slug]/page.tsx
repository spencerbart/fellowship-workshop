import { notFound } from "next/navigation";
import LiveQaBoard from "@/components/live-qa-board";
import { roomExists } from "@/lib/rooms";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!(await roomExists(slug))) {
    notFound();
  }

  return <LiveQaBoard roomSlug={slug} />;
}
