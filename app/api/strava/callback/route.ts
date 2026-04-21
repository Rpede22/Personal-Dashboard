import { NextResponse } from "next/server";
import { saveStravaConfig } from "../route";

// GET /api/strava/callback — handle OAuth callback from Strava
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/running?strava=error`
    );
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/running?strava=error`
    );
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/running?strava=error`
    );
  }

  const data = await tokenRes.json();

  saveStravaConfig({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete_id: data.athlete?.id,
  });

  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/running?strava=connected`
  );
}
