import { NextResponse } from "next/server";

// GET /api/strava/auth — redirect to Strava OAuth
// Derive the callback URL from the browser's Host header. `request.url` can't
// be trusted in Next.js standalone mode — it uses the server's bound HOSTNAME
// (0.0.0.0 in the packaged Electron app), which Strava rejects because it
// doesn't match the "localhost" callback domain registered on the Strava app.
export async function GET(request: Request) {
  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "STRAVA_CLIENT_ID not set" }, { status: 500 });
  }

  const host  = request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const redirectUri = `${proto}://${host}/api/strava/callback`;
  // profile:read_all is needed for `/athlete/zones` so HR-zone buckets can
  // match the exact ranges the athlete has configured on strava.com.
  const scope = "read,activity:read_all,profile:read_all";

  // approval_prompt=force makes Strava always show the consent screen — required
  // when adding a new scope (activity:read_all) to a token that only has the old
  // scopes, and also useful for debugging redirect_uri issues.
  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&approval_prompt=force`;

  console.log("[strava/auth] redirect_uri =", redirectUri);
  console.log("[strava/auth] full URL =", url);

  return NextResponse.redirect(url);
}
