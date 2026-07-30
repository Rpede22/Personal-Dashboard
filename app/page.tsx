import DashboardGrid from "@/components/dashboard/DashboardGrid";
import TodayBriefing from "@/components/dashboard/TodayBriefing";
import WeekAheadHeatmap from "@/components/dashboard/WeekAheadHeatmap";
import RaceCountdown from "@/components/dashboard/RaceCountdown";
import ReviewLink from "@/components/dashboard/ReviewLink";

export default function DashboardPage() {
  return (
    <main className="min-h-screen p-6">
      <header
        className="sticky top-[28px] z-10 -mx-6 px-6 pt-5 pb-4 mb-6 page-bg"
      >
        <h1 className="text-3xl font-bold" style={{ color: "var(--text)" }}>
          Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </header>

      <ReviewLink />
      <TodayBriefing />
      <RaceCountdown />
      <WeekAheadHeatmap />
      <DashboardGrid />
    </main>
  );
}
