import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { configPath } from "@/lib/config-dir";

/**
 * Feedback recipient config — file-based. Just the email address feedback is
 * addressed to (the app author's). Kept out of code so it isn't committed and
 * so a shared build can set its own. Empty = the compose form asks the user to
 * fill in a recipient.
 *   GET  /api/feedback/config → { email }
 *   POST /api/feedback/config → { email }
 */

const FILE = configPath("feedback.json");

// Default recipient so feedback works out of the box (the owner's own address —
// feedback-to-self). Still fully editable in Settings › Feedback; a saved empty
// string is respected (won't be re-defaulted).
const DEFAULT_EMAIL = "burkarl44@gmail.com";

function read(): { email: string } {
  try {
    const p = JSON.parse(readFileSync(FILE, "utf8"));
    // Only fall back to the default when the key was never set (undefined),
    // so an intentionally-cleared recipient stays cleared.
    return { email: typeof p.email === "string" ? p.email : DEFAULT_EMAIL };
  } catch {
    return { email: DEFAULT_EMAIL };
  }
}

export function GET() {
  return NextResponse.json(read());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "That doesn't look like a valid email." }, { status: 400 });
  }
  writeFileSync(FILE, JSON.stringify({ email }, null, 2));
  return NextResponse.json({ email });
}
