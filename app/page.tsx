import Link from "next/link";
import SportsWidget from "@/components/dashboard/SportsWidget";
import SchoolWidget from "@/components/dashboard/SchoolWidget";
import WoWWidget from "@/components/dashboard/WoWWidget";
import RunningWidget from "@/components/dashboard/RunningWidget";
import WorkhubWidget from "@/components/dashboard/WorkhubWidget";
import CalendarWidget from "@/components/dashboard/CalendarWidget";

export default function DashboardPage() {
  return (
    <main className="min-h-screen p-6">
      <header className="mb-8">
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

      {/* 2-column grid — each column is min 420px and grows to fill the window */}
      <div
        className="grid gap-6 items-start"
        style={{ gridTemplateColumns: "repeat(2, minmax(420px, 1fr))" }}
      >

        {/* Row 1: Sports | School */}
        <SportsWidget />

        <Link href="/school" className="block group">
          <SchoolWidget />
        </Link>

        {/* Row 2: WoW | Running */}
        <Link href="/wow" className="block group">
          <WoWWidget />
        </Link>

        <Link href="/running" className="block group">
          <RunningWidget />
        </Link>

        {/* Row 3: Calendar | Workhub */}
        <Link href="/calendar" className="block group">
          <CalendarWidget />
        </Link>

        <WorkhubWidget />

      </div>
    </main>
  );
}
