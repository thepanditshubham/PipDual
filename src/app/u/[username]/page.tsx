import { redirect } from 'next/navigation';

/** Legacy public-profile links now resolve to the canonical /player route. */
export default async function LegacyProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  redirect(`/player/${encodeURIComponent(username)}`);
}
