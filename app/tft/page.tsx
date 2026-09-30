import { Suspense } from "react";
import GameHub from "@/components/games/GameHub";

// /tft lands on the Teamfight Tactics tab of the unified GameHub
export default function TFTPage() {
  return (
    <Suspense fallback={null}>
      <GameHub defaultGame="tft" />
    </Suspense>
  );
}
