import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const SETTINGS_PATH = join(process.cwd(), ".school-settings.json");

export interface SchoolSettings {
  workDays: number[]; // JS day numbers: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
}

const DEFAULT_SETTINGS: SchoolSettings = {
  workDays: [1, 2, 3, 4, 5], // Mon–Fri
};

export function readSettings(): SchoolSettings {
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
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
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  return NextResponse.json(settings);
}
