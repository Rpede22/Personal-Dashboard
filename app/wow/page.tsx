import GameHub from "@/components/games/GameHub";

// /wow stays as an alias that lands on the WoW tab of the unified GameHub
export default function WoWPage() {
  return <GameHub defaultGame="wow" />;
}
