import { Suspense } from "react";
import GameHub from "@/components/games/GameHub";

// /cs2 lands on the Counter-Strike 2 tab of the unified GameHub
export default function CS2Page() {
  return (
    <Suspense fallback={null}>
      <GameHub defaultGame="cs2" />
    </Suspense>
  );
}
