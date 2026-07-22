import Link from "next/link";
import SportsWidget from "@/components/dashboard/SportsWidget";
import SchoolWidget from "@/components/dashboard/SchoolWidget";
import GamesWidget from "@/components/dashboard/GamesWidget";
import RunningWidget from "@/components/dashboard/RunningWidget";
import WorkhubWidget from "@/components/dashboard/WorkhubWidget";
import CalendarWidget from "@/components/dashboard/CalendarWidget";

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

      {/* 2-column grid — each column is min 420px and grows to fill the window */}
      <div
        className="grid gap-6"
        style={{ gridTemplateColumns: "repeat(2, minmax(420px, 1fr))" }}
      >

        {/* Row 1: Sports | School */}
        <div className="h-full"><SportsWidget /></div>

        <Link href="/school" className="block group h-full">
          <SchoolWidget />
        </Link>

        {/* Row 2: Games (WoW/LoL tab-switcher) | Running */}
        <div className="h-full"><GamesWidget /></div>

        <Link href="/running" className="block group h-full">
          <RunningWidget />
        </Link>

        {/* Row 3: Calendar | Workhub */}
        <Link href="/calendar" className="block group h-full">
          <CalendarWidget />
        </Link>

        <div className="h-full"><WorkhubWidget /></div>

      </div>
    </main>
  );
}
