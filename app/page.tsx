import DashboardGrid from "@/components/dashboard/DashboardGrid";
import RaceCountdown from "@/components/dashboard/RaceCountdown";
import ReviewLink from "@/components/dashboard/ReviewLink";
import DashboardHeader from "@/components/dashboard/DashboardHeader";

export default function DashboardPage() {
  return (
    <main className="min-h-screen p-6">
      <DashboardHeader />
      <ReviewLink />
      <RaceCountdown />
      <DashboardGrid />
    </main>
  );
}
