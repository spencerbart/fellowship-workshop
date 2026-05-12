import LiveQaBoard from "@/components/live-qa-board";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <LiveQaBoard roomSlug={slug} />;
}
