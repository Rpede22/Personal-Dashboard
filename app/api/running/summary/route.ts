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

  // Last run
  const lastRun = await prisma.runLog.findFirst({ orderBy: { date: "desc" } });

  // Weekly mileage (Mon–Sun)
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const weekRuns = await prisma.runLog.findMany({
    where: { date: { gte: monday } },
  });

  const weeklyKm = weekRuns.reduce((sum, r) => sum + r.distance, 0);

  return NextResponse.json({
    lastRun: lastRun
      ? { date: lastRun.date, distance: lastRun.distance }
      : null,
    weeklyKm,
    raceDate,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (body.raceDate !== undefined) {
    const config = loadConfig();
    config[RACE_DATE_KEY] = body.raceDate;
    writeFileSync(CONFIG_PATH, JSON.stringify(config));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "raceDate required" }, { status: 400 });
}
