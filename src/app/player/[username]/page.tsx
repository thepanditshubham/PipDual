import type { Metadata } from 'next';
import { ProfileClient } from '@/components/profile/profile-client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username} — Trader Profile`,
    description: `Pip Duel trader profile for @${username}. Battle record, achievements, skills and portfolio.`,
  };
}

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <ProfileClient username={username} />;
}
