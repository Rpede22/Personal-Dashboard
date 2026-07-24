import { Suspense } from "react";
import GameHub from "@/components/games/GameHub";

export default function GamesPage() {
  return (
    <Suspense fallback={null}>
      <GameHub defaultGame="wow" />
    </Suspense>
  );
}
