import { NextResponse } from "next/server";
import { isOnboardingComplete, markOnboardingComplete } from "@/lib/onboarding";

/**
 * GET  /api/onboarding → { completed: boolean } — false only on a genuine
 *   first run (no config + no marker), which triggers the wizard.
 * POST /api/onboarding → writes the "completed" marker (called when the wizard
 *   is finished or skipped). Body is ignored; completion is one-way. The
 *   "Re-run setup" button in Settings opens the wizard client-side instead of
 *   clearing this marker.
 */

export async function GET() {
  return NextResponse.json({ completed: isOnboardingComplete() });
}

export async function POST() {
  markOnboardingComplete();
  return NextResponse.json({ completed: true });
}
