import { notFound } from "next/navigation";
import SportsTeamHub from "@/components/sports/SportsTeamHub";
import { getFollowedTeam } from "@/lib/followed-teams";

/**
 * Dynamic per-team hub. Replaces the old literal `/sports/barcelona` etc.
 * pages — the slug is validated against the followed-teams list so a stale
 * bookmark for an unfollowed team 404s cleanly instead of loading an empty hub.
 */
export default async function SportsTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getFollowedTeam(slug)) notFound();
  return <SportsTeamHub teamSlug={slug} />;
}
