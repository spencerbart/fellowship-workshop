import PresenterMode from "@/components/presenter-mode";

export default async function PresenterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <PresenterMode roomSlug={slug} />;
}
