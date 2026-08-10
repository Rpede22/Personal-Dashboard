import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { configPath } from "@/lib/config-dir";

const SETTINGS_PATH = configPath(".school-settings.json");

export interface SchoolSettings {
  workDays: number[]; // JS day numbers: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  hoursPerDay: number; // soft cap — preferred study hours per day (default 3)
}

const DEFAULT_SETTINGS: SchoolSettings = {
  workDays: [1, 2, 3, 4, 5], // Mon–Fri
  hoursPerDay: 3,
};

export function readSettings(): SchoolSettings {
  try {
    const saved = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
    // Merge with defaults so older files without hoursPerDay still work
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function GET() {
  return NextResponse.json(readSettings());
}

export async function POST(request: Request) {
  const body = await request.json();
  const settings = readSettings();
  if (Array.isArray(body.workDays)) {
    settings.workDays = body.workDays;
  }
  if (typeof body.hoursPerDay === "number" && body.hoursPerDay > 0) {
    settings.hoursPerDay = body.hoursPerDay;
  }
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  return NextResponse.json(settings);
}
