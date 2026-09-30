import { NextResponse } from "next/server";
import { NEWS_SOURCES, readNewsSource, writeNewsSource } from "@/lib/news-config";

/**
 * News source selection.
 *   GET  → { source, sources: [{ id, label }] }
 *   POST → { source } sets it (must be a known source id)
 */
export async function GET() {
  return NextResponse.json({
    source: readNewsSource(),
    sources: NEWS_SOURCES.map((s) => ({ id: s.id, label: s.label })),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const source = String(body.source ?? "");
  if (!NEWS_SOURCES.some((s) => s.id === source)) {
    return NextResponse.json({ error: "unknown source" }, { status: 400 });
  }
  writeNewsSource(source);
  return NextResponse.json({ source });
}
