import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), ".strava-config.json");

export interface StravaConfig {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  athlete_id?: number;
}

export function loadStravaConfig(): StravaConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export function saveStravaConfig(config: StravaConfig) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function refreshToken(config: StravaConfig): Promise<StravaConfig | null> {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret || !config.refresh_token) return null;

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: config.refresh_token,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const updated: StravaConfig = {
    ...config,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  };
  saveStravaConfig(updated);
  return updated;
}

export async function getValidToken(): Promise<string | null> {
  let config = loadStravaConfig();
  if (!config.access_token) return null;

  // Refresh if expired (with 60s buffer)
  if (config.expires_at && config.expires_at < Date.now() / 1000 + 60) {
    const refreshed = await refreshToken(config);
    if (!refreshed) return null;
    config = refreshed;
  }

  return config.access_token ?? null;
}

// GET /api/strava — check connection status
export async function GET() {
  const config = loadStravaConfig();
  const connected = !!config.access_token && !!config.refresh_token;

  return NextResponse.json({
    connected,
    athleteId: config.athlete_id ?? null,
    hasCredentials: !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET),
  });
}

// DELETE /api/strava — disconnect
export async function DELETE() {
  saveStravaConfig({});
  return NextResponse.json({ ok: true });
}
