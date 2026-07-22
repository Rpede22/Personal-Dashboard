import GameHub from "@/components/games/GameHub";

// /lol stays as an alias that lands on the LoL tab of the unified GameHub
export default function LoLPage() {
  return <GameHub defaultGame="lol" />;
}
