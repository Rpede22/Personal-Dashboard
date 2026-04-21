import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const RACE_DATE_KEY = "race_date";

// Simple key-value store via the filesystem for race date config
// (avoids adding another DB table for a single value)
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), ".race-config.json");

function loadConfig(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export async function GET() {
  const config = loadConfig();
  const raceDate = config[RACE_DATE_KEY] ?? null;

  const now = new Date();

  // Today's UTC midnight (runs stored as UTC midnight)
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // Last 3 runs — exclude today so it shows actual past activity
  const recentRuns = await prisma.runLog.findMany({
    where: { date: { lt: todayUTC } },
    orderBy: { date: "desc" },
    take: 3,
  });

  // Weekly mileage (Mon–Sun, local time)
  const day = now.getDay(); // 0=Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const weekRuns = await prisma.runLog.findMany({
    where: { date: { gte: monday } },
  });
  const weeklyKm = weekRuns.reduce((sum, r) => sum + r.distance, 0);

  // Last 30 days km
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  const monthRuns = await prisma.runLog.findMany({
    where: { date: { gte: thirtyDaysAgo } },
  });
  const monthlyKm = monthRuns.reduce((sum, r) => sum + r.distance, 0);

  // This calendar month (e.g. April 1 → now)
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const thisMonthRuns = await prisma.runLog.findMany({ where: { date: { gte: monthStart } } });
  const thisMonthKm = thisMonthRuns.reduce((sum, r) => sum + r.distance, 0);

  // This year (Jan 1 → now)
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const thisYearRuns = await prisma.runLog.findMany({ where: { date: { gte: yearStart } } });
  const thisYearKm = thisYearRuns.reduce((sum, r) => sum + r.distance, 0);

  // All-time total
  const allRuns = await prisma.runLog.findMany();
  const totalKm = allRuns.reduce((sum, r) => sum + r.distance, 0);
  const totalRuns = allRuns.length;

  // Upcoming plans — next 7 days (including today)
  const in7DaysUTC = new Date(todayUTC);
  in7DaysUTC.setUTCDate(todayUTC.getUTCDate() + 7);

  const upcomingPlans = await prisma.runPlan.findMany({
    where: { date: { gte: todayUTC, lte: in7DaysUTC } },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({
    recentRuns: recentRuns.map((r) => ({ date: r.date, distance: r.distance, duration: r.duration })),
    weeklyKm,
    monthlyKm,
    thisMonthKm,
    thisYearKm,
    totalKm,
    totalRuns,
    raceDate,
    upcomingPlans: upcomingPlans.map((p) => ({ date: p.date, type: p.type, distance: p.distance })),
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (body.raceDate !== undefined) {
    const config = loadConfig();
    if (body.raceDate) {
      config[RACE_DATE_KEY] = body.raceDate;
    } else {
      delete config[RACE_DATE_KEY];
    }
    writeFileSync(CONFIG_PATH, JSON.stringify(config));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "raceDate required" }, { status: 400 });
}
