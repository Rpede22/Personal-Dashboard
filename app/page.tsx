import Link from "next/link";
import NHLWidget from "@/components/dashboard/NHLWidget";
import SchoolWidget from "@/components/dashboard/SchoolWidget";
import WoWWidget from "@/components/dashboard/WoWWidget";
import RunningWidget from "@/components/dashboard/RunningWidget";

export default function DashboardPage() {
  return (
    <main className="min-h-screen p-6" style={{ background: "var(--background)" }}>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl">
        <Link href="/nhl" className="block group">
          <NHLWidget />
        </Link>

        <Link href="/school" className="block group">
          <SchoolWidget />
        </Link>

        <Link href="/wow" className="block group">
          <WoWWidget />
        </Link>

        <Link href="/running" className="block group">
          <RunningWidget />
        </Link>
      </div>
    </main>
  );
}
