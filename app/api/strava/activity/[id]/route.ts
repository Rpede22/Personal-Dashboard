import { NextResponse } from "next/server";
import { getValidToken } from "../../route";

// GET /api/strava/activity/[id] — proxy a single Strava activity
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getValidToken();
  if (!token) {
    return NextResponse.json({ error: "Not connected to Strava" }, { status: 401 });
  }

  const res = await fetch(`https://www.strava.com/api/v3/activities/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Strava API ${res.status}` }, { status: res.status });
  }

  const activity = await res.json();
  return NextResponse.json(activity);
}
